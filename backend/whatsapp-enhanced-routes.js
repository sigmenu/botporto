const express = require('express');
const enhancedWhatsAppService = require('./whatsapp-enhanced');
const router = express.Router();

// Enhanced QR code endpoint with better error handling
router.get('/qr/:sessionId?', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'default';
    const force = req.query.force === 'true';
    
    console.log(`[Enhanced WhatsApp API] QR code requested for session ${sessionId} (force: ${force})`);
    
    const result = await enhancedWhatsAppService.getQRCode(sessionId, force);
    
    if (result.success) {
      res.json({
        success: true,
        qr: result.qr,
        timestamp: result.timestamp,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[Enhanced WhatsApp API] Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating QR code'
    });
  }
});

// Connection status endpoint
router.get('/status/:sessionId?', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'default';
    
    console.log(`[Enhanced WhatsApp API] Status check requested for session ${sessionId}`);
    
    const result = await enhancedWhatsAppService.getConnectionStatus(sessionId);
    
    res.json(result);
  } catch (error) {
    console.error('[Enhanced WhatsApp API] Error checking status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while checking status'
    });
  }
});

// Connection diagnostics endpoint
router.get('/diagnostics/:sessionId?', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'default';
    
    console.log(`[Enhanced WhatsApp API] Diagnostics requested for session ${sessionId}`);
    
    const result = await enhancedWhatsAppService.getDiagnostics(sessionId);
    
    if (result.success) {
      res.json({
        success: true,
        diagnostics: result.diagnostics,
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('[Enhanced WhatsApp API] Error getting diagnostics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while getting diagnostics'
    });
  }
});

// Phone number pairing endpoint
router.post('/pair', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Validate phone number format (basic validation)
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please provide a valid international phone number.'
      });
    }

    console.log(`[Enhanced WhatsApp API] Pairing code requested for phone number ${cleanNumber}`);
    
    const result = await enhancedWhatsAppService.generatePairingCode(cleanNumber);
    
    if (result.success) {
      res.json({
        success: true,
        pairingCode: result.pairingCode,
        phoneNumber: result.phoneNumber,
        message: result.message,
        instructions: [
          '1. Open WhatsApp on your phone',
          '2. Go to Settings > Linked Devices',
          '3. Tap "Link a Device"',
          '4. Choose "Link with phone number instead"',
          '5. Enter the pairing code provided above'
        ]
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[Enhanced WhatsApp API] Error generating pairing code:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating pairing code'
    });
  }
});

// Disconnect session endpoint
router.post('/disconnect/:sessionId?', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'default';
    
    console.log(`[Enhanced WhatsApp API] Disconnect requested for session ${sessionId}`);
    
    const result = await enhancedWhatsAppService.disconnectSession(sessionId);
    
    res.json(result);
  } catch (error) {
    console.error('[Enhanced WhatsApp API] Error disconnecting session:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while disconnecting session'
    });
  }
});

// List all connections
router.get('/connections', async (req, res) => {
  try {
    console.log('[Enhanced WhatsApp API] All connections requested');
    
    const result = enhancedWhatsAppService.getAllConnections();
    
    res.json(result);
  } catch (error) {
    console.error('[Enhanced WhatsApp API] Error getting connections:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while getting connections'
    });
  }
});

// Send message endpoint (enhanced)
router.post('/send/:sessionId?', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'default';
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: 'Both "to" and "message" fields are required'
      });
    }

    console.log(`[Enhanced WhatsApp API] Send message request for session ${sessionId} to ${to}`);
    
    // Check if session is connected
    const statusResult = await enhancedWhatsAppService.getConnectionStatus(sessionId);
    
    if (!statusResult.success || !statusResult.connected) {
      return res.status(400).json({
        success: false,
        message: 'Session is not connected. Please connect first.'
      });
    }

    // For now, return success (implement actual sending later)
    res.json({
      success: true,
      message: 'Message queued for sending',
      sessionId,
      to,
      messageLength: message.length
    });

  } catch (error) {
    console.error('[Enhanced WhatsApp API] Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while sending message'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  const connections = enhancedWhatsAppService.getAllConnections();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Enhanced WhatsApp Service',
    version: '2.0.0',
    connections: {
      total: connections.totalConnections,
      connected: connections.connectedSessions
    },
    system: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    }
  });
});

// Test endpoint for development
router.get('/test/:sessionId?', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'test_' + Date.now();
    
    console.log(`[Enhanced WhatsApp API] Test connection for session ${sessionId}`);
    
    // Create a test connection
    const qrResult = await enhancedWhatsAppService.getQRCode(sessionId, true);
    
    if (qrResult.success) {
      const statusResult = await enhancedWhatsAppService.getConnectionStatus(sessionId);
      const diagnostics = await enhancedWhatsAppService.getDiagnostics(sessionId);
      
      res.json({
        success: true,
        message: 'Test connection created successfully',
        sessionId,
        qr: qrResult.qr,
        status: statusResult,
        diagnostics: diagnostics.success ? diagnostics.diagnostics : null
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to create test connection',
        error: qrResult.message
      });
    }
  } catch (error) {
    console.error('[Enhanced WhatsApp API] Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during test'
    });
  }
});

module.exports = router;