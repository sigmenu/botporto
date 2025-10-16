const express = require('express');
const whatsAppService = require('./whatsapp-baileys');
const whatsAppMockService = require('./whatsapp-mock-service');
const router = express.Router();

// Track QR generation status per session
const qrStatus = new Map(); // sessionId -> { status, progress, startTime, qr }

// Fast QR endpoint that responds immediately
router.get('/qr/fast/:sessionId?', async (req, res) => {
  const sessionId = req.params.sessionId || 'default';
  const force = req.query.force === 'true';
  const startTime = Date.now();
  
  console.log(`[Fast QR] Immediate response for session: ${sessionId} (force: ${force})`);
  
  try {
    // Check if mock mode is enabled
    if (whatsAppMockService.isMockMode()) {
      console.log('[Fast QR] Mock mode enabled - using mock QR generation');
      const result = await whatsAppMockService.generateMockQR(sessionId, force);
      
      return res.json({
        success: true,
        status: 'completed',
        qr: result.qr,
        message: result.message,
        mockMode: true,
        responseTime: Date.now() - startTime
      });
    }
    
    // Check if QR is already available
    const existingStatus = qrStatus.get(sessionId);
    if (!force && existingStatus && existingStatus.qr && existingStatus.status === 'completed') {
      console.log(`[Fast QR] Returning cached QR for ${sessionId}`);
      return res.json({
        success: true,
        status: 'completed',
        qr: existingStatus.qr,
        message: 'QR code ready',
        cached: true,
        responseTime: Date.now() - startTime
      });
    }
    
    // Set initial status
    qrStatus.set(sessionId, {
      status: 'generating',
      progress: 0,
      startTime: Date.now(),
      qr: null
    });
    
    // Respond immediately with generating status
    res.json({
      success: true,
      status: 'generating',
      message: 'QR code generation started',
      sessionId: sessionId,
      responseTime: Date.now() - startTime,
      polling: {
        endpoint: `/api/whatsapp/qr/status/${sessionId}`,
        interval: 500 // Poll every 500ms
      }
    });
    
    // Generate QR in background
    generateQRInBackground(sessionId, force);
    
  } catch (error) {
    console.error(`[Fast QR] Error in fast QR endpoint:`, error);
    qrStatus.set(sessionId, {
      status: 'error',
      error: error.message,
      startTime: Date.now()
    });
    
    res.status(500).json({
      success: false,
      status: 'error',
      message: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

// QR status polling endpoint
router.get('/qr/status/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const status = qrStatus.get(sessionId);
  
  if (!status) {
    return res.json({
      success: false,
      status: 'not_found',
      message: 'QR generation not started for this session'
    });
  }
  
  const responseData = {
    success: status.status !== 'error',
    status: status.status,
    sessionId: sessionId,
    elapsed: Date.now() - status.startTime
  };
  
  if (status.qr) {
    responseData.qr = status.qr;
    responseData.message = 'QR code ready';
  } else if (status.error) {
    responseData.message = status.error;
  } else {
    responseData.message = 'Generating QR code...';
    responseData.progress = Math.min(95, Math.floor((Date.now() - status.startTime) / 100)); // Fake progress
  }
  
  res.json(responseData);
});

// Background QR generation function
async function generateQRInBackground(sessionId, force) {
  console.log(`[Fast QR] Starting background QR generation for ${sessionId}`);
  const startTime = Date.now();
  
  try {
    // Update progress
    qrStatus.set(sessionId, {
      ...qrStatus.get(sessionId),
      status: 'generating',
      progress: 10
    });
    
    const result = await whatsAppService.getQRCode(sessionId, force);
    
    if (result.success) {
      qrStatus.set(sessionId, {
        status: 'completed',
        qr: result.qr,
        startTime: startTime,
        generatedAt: Date.now(),
        totalTime: Date.now() - startTime
      });
      
      console.log(`[Fast QR] Background QR generated successfully for ${sessionId} in ${Date.now() - startTime}ms`);
    } else {
      qrStatus.set(sessionId, {
        status: 'error',
        error: result.message,
        startTime: startTime,
        totalTime: Date.now() - startTime
      });
      
      console.error(`[Fast QR] Background QR generation failed for ${sessionId}:`, result.message);
    }
    
  } catch (error) {
    qrStatus.set(sessionId, {
      status: 'error',
      error: error.message,
      startTime: startTime,
      totalTime: Date.now() - startTime
    });
    
    console.error(`[Fast QR] Background QR generation error for ${sessionId}:`, error);
  }
}

// QR progress endpoint with Server-Sent Events (optional)
router.get('/qr/stream/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Send initial status
  const initialStatus = qrStatus.get(sessionId) || { status: 'not_found' };
  res.write(`data: ${JSON.stringify(initialStatus)}\n\n`);
  
  // Set up polling interval
  const interval = setInterval(() => {
    const status = qrStatus.get(sessionId);
    if (!status) {
      res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
      return;
    }
    
    res.write(`data: ${JSON.stringify(status)}\n\n`);
    
    // Close connection when done
    if (status.status === 'completed' || status.status === 'error') {
      clearInterval(interval);
      res.end();
    }
  }, 500);
  
  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Clear QR status (for cleanup)
router.delete('/qr/status/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  qrStatus.delete(sessionId);
  
  res.json({
    success: true,
    message: `QR status cleared for session ${sessionId}`
  });
});

module.exports = router;