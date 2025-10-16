const express = require('express');
const router = express.Router();
const whatsAppManager = require('./whatsapp-webjs-service');

// Middleware for logging
router.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Create or connect WhatsApp session
router.post('/connect', async (req, res) => {
  try {
    const { userId, sessionId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const result = await whatsAppManager.createSession(userId, sessionId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error connecting WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get QR code general (for frontend compatibility)
router.get('/qr', async (req, res) => {
  try {
    // Default session ID for compatibility
    const sessionId = req.query.sessionId || 'session-default';
    
    // Create session if it doesn't exist
    try {
      await whatsAppManager.createSession('default-user', sessionId);
    } catch (sessionError) {
      // Session might already exist, continue
    }
    
    const result = await whatsAppManager.getQRCode(sessionId);
    
    if (!result.qrCode) {
      return res.json({
        success: false,
        hasQr: false,
        error: 'QR code not available',
        status: result.status
      });
    }

    res.json({
      success: true,
      hasQr: true,
      qrCode: result.qrCode,
      status: result.status,
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.json({
      success: false,
      hasQr: false,
      error: error.message
    });
  }
});

// Get QR code for session
router.get('/qr/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await whatsAppManager.getQRCode(sessionId);
    
    if (!result.qrCode) {
      return res.status(404).json({
        success: false,
        error: 'QR code not available',
        status: result.status
      });
    }

    res.json({
      success: true,
      qrCode: result.qrCode,
      status: result.status,
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get general WhatsApp status (for frontend compatibility)
router.get('/status', async (req, res) => {
  try {
    // Default session ID for compatibility
    const sessionId = req.query.sessionId || 'session-default';
    const status = await whatsAppManager.getSessionStatus(sessionId);
    
    res.json({
      success: true,
      sessionId,
      ...status
    });
  } catch (error) {
    console.error('Error getting general status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get session status
router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const status = await whatsAppManager.getSessionStatus(sessionId);
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send message
router.post('/send', async (req, res) => {
  try {
    const { sessionId, phoneNumber, message, mediaPath } = req.body;
    
    if (!sessionId || !phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, phoneNumber and message are required'
      });
    }

    const result = await whatsAppManager.sendMessage(
      sessionId,
      phoneNumber,
      message,
      mediaPath
    );
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Disconnect session (general endpoint for frontend compatibility)
router.post('/disconnect', async (req, res) => {
  try {
    // Use default session ID for compatibility
    const sessionId = 'session-default';
    
    const result = await whatsAppManager.disconnectSession(sessionId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error disconnecting session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Disconnect specific session
router.post('/disconnect/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await whatsAppManager.disconnectSession(sessionId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error disconnecting session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await whatsAppManager.getAllSessions();
    
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;