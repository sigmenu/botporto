const express = require('express');
const whatsAppService = require('./whatsapp-baileys');
const whatsAppMockService = require('./whatsapp-mock-service');
const router = express.Router();

// Track API call frequency
let qrCallCount = 0;
let statusCallCount = 0;
let lastQrCall = null;
let lastStatusCall = null;

// Generate QR endpoint
router.get('/qr', async (req, res) => {
  try {
    const now = Date.now();
    qrCallCount++;
    const timeSinceLastCall = lastQrCall ? now - lastQrCall : 0;
    lastQrCall = now;
    
    // Check for force parameter
    const force = req.query.force === 'true';
    
    console.log(`[QR API] 🔄 QR code requested (#${qrCallCount}, ${timeSinceLastCall}ms since last call, force: ${force})`);
    console.log(`[QR API] 📱 User-Agent: ${req.headers['user-agent'] || 'unknown'}`);
    console.log(`[QR API] 🌐 Origin: ${req.headers.origin || 'none'}`);
    console.log(`[QR API] ⏱️ Using 30-second timeout for QR generation`);
    
    // Check if mock mode is enabled
    if (whatsAppMockService.isMockMode()) {
      console.log('[QR API] 🧪 Mock mode enabled - using mock QR generation');
      const result = await whatsAppMockService.generateMockQR('default', force);
      
      if (result.success) {
        console.log('[QR API] ✅ Mock QR generated successfully');
        res.json({
          success: true,
          qr: result.qr,
          message: result.message,
          mockMode: true,
          timeout: 30000
        });
      } else {
        console.log('[QR API] ❌ Mock QR generation failed:', result.message);
        res.status(400).json({
          success: false,
          message: result.message,
          mockMode: true
        });
      }
      return;
    }
    
    // Log fresh QR generation attempt
    if (force) {
      console.log('[QR API] 🔄 Force flag detected - clearing existing session and generating fresh QR');
    } else {
      console.log('[QR API] 🔍 Checking for existing session before generating QR');
    }
    
    // Use real WhatsApp service with enhanced timeout logging
    const qrStartTime = Date.now();
    const result = await whatsAppService.getQRCode('default', force);
    const qrDuration = Date.now() - qrStartTime;
    
    if (result.success) {
      console.log(`[QR API] ✅ QR code generated successfully in ${qrDuration}ms`);
      console.log(`[QR API] 📊 QR data size: ${result.qr ? result.qr.length : 0} characters`);
      res.json({
        success: true,
        qr: result.qr,
        message: result.message,
        generationTime: qrDuration,
        timeout: 30000
      });
    } else {
      console.log(`[QR API] ❌ Failed to generate QR code after ${qrDuration}ms:`, result.message);
      
      // Check if it's a timeout error and provide helpful message
      let userMessage = result.message;
      if (result.message && result.message.includes('timeout')) {
        userMessage = `QR generation timeout after 30 seconds. This can happen due to network issues or high server load. Please try again.`;
        console.log(`[QR API] ⏱️ Timeout detected - providing user-friendly message`);
      }
      
      res.status(400).json({
        success: false,
        message: userMessage,
        isTimeout: result.message && result.message.includes('timeout'),
        timeout: 30000
      });
    }
  } catch (error) {
    console.error('[WhatsApp API] Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Status endpoint
router.get('/status', async (req, res) => {
  try {
    const now = Date.now();
    statusCallCount++;
    const timeSinceLastCall = lastStatusCall ? now - lastStatusCall : 0;
    lastStatusCall = now;
    
    console.log(`[WhatsApp API] Status check requested (#${statusCallCount}, ${timeSinceLastCall}ms since last call)`);
    
    // Check if mock mode is enabled
    if (whatsAppMockService.isMockMode()) {
      console.log('[WhatsApp API] Mock mode enabled - using mock status check');
      const result = whatsAppMockService.getMockConnectionStatus('default');
      
      res.json({
        success: result.success,
        connected: result.connected,
        status: result.status,
        message: result.message,
        phoneNumber: result.phoneNumber,
        lastConnected: result.lastConnected,
        mockMode: true
      });
      return;
    }
    
    // Use real WhatsApp service
    const result = await whatsAppService.getStatus();
    
    res.json({
      success: result.success,
      connected: result.connected,
      status: result.status,
      message: result.message,
      phoneNumber: result.phoneNumber,
      lastConnected: result.lastConnected
    });
  } catch (error) {
    console.error('[WhatsApp API] Error checking status:', error);
    res.status(500).json({
      success: false,
      connected: false,
      status: 'error',
      message: 'Internal server error',
      phoneNumber: null,
      lastConnected: null
    });
  }
});

// Send message endpoint
router.post('/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    console.log('[WhatsApp API] Send message request to:', to);
    
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, message'
      });
    }
    
    // Check if mock mode is enabled
    if (whatsAppMockService.isMockMode()) {
      console.log('[WhatsApp API] Mock mode enabled - using mock message sending');
      const result = await whatsAppMockService.sendMockMessage('default', to, message);
      
      if (result.success) {
        res.json({
          success: true,
          messageId: result.messageId,
          message: result.message,
          mockMode: true,
          details: result.details
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          mockMode: true
        });
      }
      return;
    }
    
    // Use real WhatsApp service
    const result = await whatsAppService.sendMessage('default', to, message);
    
    if (result.success) {
      res.json({
        success: true,
        messageId: result.messageId,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[WhatsApp API] Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Disconnect endpoint
router.post('/disconnect', async (req, res) => {
  try {
    console.log('[WhatsApp API] Disconnect request');
    
    const result = await whatsAppService.disconnectSession();
    
    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    console.error('[WhatsApp API] Error disconnecting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// QR refresh endpoint
router.post('/qr/refresh', async (req, res) => {
  try {
    console.log('[WhatsApp API] QR refresh request');
    
    const result = await whatsAppService.refreshQR();
    
    if (result.success) {
      res.json({
        success: true,
        qr: result.qr,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[WhatsApp API] Error refreshing QR:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Reset session endpoint - forces a complete reset
router.post('/reset', async (req, res) => {
  try {
    console.log('[WhatsApp API] Session reset request');
    
    // First disconnect
    await whatsAppService.disconnectSession();
    
    // Then get new QR with force
    const result = await whatsAppService.getQRCode('default', true);
    
    res.json({
      success: result.success,
      qr: result.qr,
      message: result.success ? 'Session reset successfully' : result.message
    });
  } catch (error) {
    console.error('[WhatsApp API] Error resetting session:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Test endpoint for debugging WhatsApp service
router.get('/test', async (req, res) => {
  try {
    console.log('[WhatsApp API] Test endpoint called');
    
    // Basic service info
    const serviceInfo = {
      serviceRunning: true,
      baileysSessions: require('fs').existsSync(require('path').join(__dirname, 'baileys_sessions')),
      timestamp: new Date().toISOString()
    };
    
    // Try to get service status
    try {
      const status = await whatsAppService.getStatus();
      serviceInfo.status = status;
    } catch (error) {
      serviceInfo.statusError = error.message;
    }
    
    res.json({
      success: true,
      data: serviceInfo,
      message: 'WhatsApp service test complete'
    });
  } catch (error) {
    console.error('[WhatsApp API] Test endpoint error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Sessions endpoints (for compatibility)
router.get('/default/qr', async (req, res) => {
  // Check for force parameter
  const force = req.query.force === 'true';
  // Redirect to main QR endpoint
  const result = await whatsAppService.getQRCode('default', force);
  
  if (result.success) {
    res.json({
      success: true,
      qr: result.qr,
      message: result.message
    });
  } else {
    res.status(400).json({
      success: false,
      message: result.message
    });
  }
});

router.get('/default/status', async (req, res) => {
  // Redirect to main status endpoint
  const result = await whatsAppService.getStatus();
  
  res.json({
    success: result.success,
    connected: result.connected,
    status: result.status,
    message: result.message
  });
});

router.post('/default/disconnect', async (req, res) => {
  // Redirect to main disconnect endpoint
  const result = await whatsAppService.disconnectSession();
  
  res.json({
    success: result.success,
    message: result.message
  });
});

// Phone pairing endpoints
router.post('/request-pairing-code', async (req, res) => {
  try {
    console.log('[WhatsApp API] Pairing code requested:', req.body);
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Check if mock mode is enabled
    if (whatsAppMockService.isMockMode()) {
      console.log('[WhatsApp API] Mock mode enabled - using mock pairing code generation');
      const result = whatsAppMockService.generateMockPairingCode(phoneNumber);
      
      if (result.success) {
        res.json({
          success: true,
          pairingCode: result.pairingCode,
          phoneNumber: result.phoneNumber,
          message: result.message,
          mockMode: true,
          instructions: result.instructions
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          mockMode: true
        });
      }
      return;
    }

    // For now, return a mock pairing code until Baileys phone pairing is implemented
    const pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    console.log('[WhatsApp API] Generated pairing code:', pairingCode);
    
    res.json({
      success: true,
      pairingCode,
      phoneNumber,
      message: 'Pairing code generated successfully. Enter this code in WhatsApp Settings > Linked Devices.'
    });
    
  } catch (error) {
    console.error('[WhatsApp API] Error generating pairing code:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating pairing code'
    });
  }
});

router.post('/verify-pairing-code', async (req, res) => {
  try {
    console.log('[WhatsApp API] Verification code submitted:', req.body);
    const { sessionId, code } = req.body;
    
    if (!sessionId || !code) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and verification code are required'
      });
    }

    // Check if mock mode is enabled
    if (whatsAppMockService.isMockMode()) {
      console.log('[WhatsApp API] Mock mode enabled - using mock pairing verification');
      const result = whatsAppMockService.verifyMockPairingCode(sessionId, code);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          sessionId: result.sessionId,
          mockMode: true,
          connected: result.connected,
          phoneNumber: result.phoneNumber
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          mockMode: true
        });
      }
      return;
    }

    // For now, simulate successful verification
    console.log('[WhatsApp API] Verification successful for session:', sessionId);
    
    res.json({
      success: true,
      message: 'Pairing code verified successfully',
      sessionId
    });
    
  } catch (error) {
    console.error('[WhatsApp API] Error verifying pairing code:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while verifying pairing code'
    });
  }
});

// Test connection endpoint
router.get('/test-connection', async (req, res) => {
  try {
    console.log('[WhatsApp API] Testing connection...');
    
    const testResults = {
      timestamp: new Date().toISOString(),
      tests: {},
      summary: { passed: 0, failed: 0, total: 0 }
    };

    // Test 1: Basic service availability
    try {
      testResults.tests.serviceAvailable = {
        status: 'passed',
        message: 'WhatsApp service is available'
      };
      testResults.summary.passed++;
    } catch (error) {
      testResults.tests.serviceAvailable = {
        status: 'failed',
        message: error.message
      };
      testResults.summary.failed++;
    }

    // Test 2: QR code generation
    try {
      const qrResult = await whatsAppService.getQRCode('test-connection', true);
      testResults.tests.qrGeneration = {
        status: qrResult.success ? 'passed' : 'failed',
        message: qrResult.message || 'QR code test completed'
      };
      if (qrResult.success) testResults.summary.passed++;
      else testResults.summary.failed++;
    } catch (error) {
      testResults.tests.qrGeneration = {
        status: 'failed',
        message: error.message
      };
      testResults.summary.failed++;
    }

    // Test 3: Status check
    try {
      const statusResult = await whatsAppService.getStatus('test-connection');
      testResults.tests.statusCheck = {
        status: statusResult.success ? 'passed' : 'failed',
        message: statusResult.message || 'Status check completed'
      };
      if (statusResult.success) testResults.summary.passed++;
      else testResults.summary.failed++;
    } catch (error) {
      testResults.tests.statusCheck = {
        status: 'failed',
        message: error.message
      };
      testResults.summary.failed++;
    }

    testResults.summary.total = testResults.summary.passed + testResults.summary.failed;
    
    console.log('[WhatsApp API] Connection test completed:', testResults.summary);
    
    res.json({
      success: true,
      results: testResults
    });
    
  } catch (error) {
    console.error('[WhatsApp API] Error during connection test:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during connection test',
      error: error.message
    });
  }
});

// Mock mode endpoint for development
router.post('/mock-connect', async (req, res) => {
  try {
    console.log('[WhatsApp API] Mock connection requested');
    
    // Simulate successful connection
    res.json({
      success: true,
      message: 'Mock WhatsApp connection established',
      connected: true,
      status: 'connected',
      mockMode: true
    });
    
  } catch (error) {
    console.error('[WhatsApp API] Error in mock connect:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error in mock connect'
    });
  }
});

// =============================================================================
// MOCK MODE MANAGEMENT ENDPOINTS
// =============================================================================

// Enable mock mode
router.post('/mock-mode/enable', async (req, res) => {
  try {
    console.log('[WhatsApp API] Enabling mock mode');
    const result = whatsAppMockService.enableMockMode();
    res.json(result);
  } catch (error) {
    console.error('[WhatsApp API] Error enabling mock mode:', error);
    res.status(500).json({
      success: false,
      message: 'Error enabling mock mode'
    });
  }
});

// Disable mock mode
router.post('/mock-mode/disable', async (req, res) => {
  try {
    console.log('[WhatsApp API] Disabling mock mode');
    const result = whatsAppMockService.disableMockMode();
    res.json(result);
  } catch (error) {
    console.error('[WhatsApp API] Error disabling mock mode:', error);
    res.status(500).json({
      success: false,
      message: 'Error disabling mock mode'
    });
  }
});

// Get mock mode status
router.get('/mock-mode/status', async (req, res) => {
  try {
    const result = whatsAppMockService.getMockStatus();
    res.json(result);
  } catch (error) {
    console.error('[WhatsApp API] Error getting mock status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting mock status'
    });
  }
});

// Clear all mock data
router.post('/mock-mode/clear', async (req, res) => {
  try {
    console.log('[WhatsApp API] Clearing mock data');
    const result = whatsAppMockService.clearMockData();
    res.json(result);
  } catch (error) {
    console.error('[WhatsApp API] Error clearing mock data:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing mock data'
    });
  }
});

// Get mock connections
router.get('/mock-mode/connections', async (req, res) => {
  try {
    const result = whatsAppMockService.getMockConnections();
    res.json(result);
  } catch (error) {
    console.error('[WhatsApp API] Error getting mock connections:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting mock connections'
    });
  }
});

// Get mock messages
router.get('/mock-mode/messages', async (req, res) => {
  try {
    const sessionId = req.query.sessionId || null;
    const result = whatsAppMockService.getMockMessages(sessionId);
    res.json(result);
  } catch (error) {
    console.error('[WhatsApp API] Error getting mock messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting mock messages'
    });
  }
});

// Simulate incoming message (for testing)
router.post('/mock-mode/simulate-incoming', async (req, res) => {
  try {
    const { fromNumber, message, sessionId = 'default' } = req.body;
    
    if (!fromNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'fromNumber and message are required'
      });
    }

    console.log('[WhatsApp API] Simulating incoming message');
    const result = whatsAppMockService.simulateIncomingMessage(fromNumber, message, sessionId);
    res.json(result);
  } catch (error) {
    console.error('[WhatsApp API] Error simulating incoming message:', error);
    res.status(500).json({
      success: false,
      message: 'Error simulating incoming message'
    });
  }
});

module.exports = router;