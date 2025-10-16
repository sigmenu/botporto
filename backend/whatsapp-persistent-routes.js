const express = require('express');
const whatsAppPersistentService = require('./whatsapp-baileys-persistent');
const router = express.Router();

// Middleware to extract user ID from request (you might want to implement proper JWT auth)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getUserId = async (req) => {
  // For testing, get the first user from database
  try {
    const user = await prisma.user.findFirst();
    return user ? user.id : null;
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
};

// Create new WhatsApp session
router.post('/sessions', async (req, res) => {
  try {
    const { name = 'Default Session' } = req.body;
    const userId = await getUserId(req);
    
    console.log(`[WhatsApp API] Creating new session for user ${userId}`);
    
    const session = await whatsAppPersistentService.createSession(userId, name);
    
    res.json({
      success: true,
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        created: session.createdAt
      },
      message: 'Session created successfully'
    });
  } catch (error) {
    console.error('[WhatsApp API] Error creating session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session'
    });
  }
});

// Get all sessions for user
router.get('/sessions', async (req, res) => {
  try {
    const userId = await getUserId(req);
    console.log(`[WhatsApp API] Getting all sessions for user ${userId}`);
    
    const result = await whatsAppPersistentService.getAllSessions(userId);
    
    if (result.success) {
      res.json({
        success: true,
        sessions: result.sessions
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[WhatsApp API] Error getting sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sessions'
    });
  }
});

// Get QR code for session
router.get('/sessions/:sessionId/qr', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const force = req.query.force === 'true';
    
    console.log(`[WhatsApp API] QR code requested for session ${sessionId} (force: ${force})`);
    
    const result = await whatsAppPersistentService.getQRCode(sessionId, force);
    
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
    console.error('[WhatsApp API] Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get session status
router.get('/sessions/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`[WhatsApp API] Status check requested for session ${sessionId}`);
    
    const result = await whatsAppPersistentService.getSessionStatus(sessionId);
    
    if (result.success) {
      res.json({
        success: true,
        ...result
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[WhatsApp API] Error checking status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Send message
router.post('/sessions/:sessionId/send', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { to, message } = req.body;
    
    console.log(`[WhatsApp API] Send message request for session ${sessionId} to:`, to);
    
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, message'
      });
    }
    
    const result = await whatsAppPersistentService.sendMessage(sessionId, to, message);
    
    if (result.success) {
      res.json({
        success: true,
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

// Disconnect session
router.post('/sessions/:sessionId/disconnect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`[WhatsApp API] Disconnect request for session ${sessionId}`);
    
    const result = await whatsAppPersistentService.disconnectSession(sessionId);
    
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

// Reconnect session
router.post('/sessions/:sessionId/reconnect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`[WhatsApp API] Reconnect request for session ${sessionId}`);
    
    // First disconnect then reconnect
    await whatsAppPersistentService.disconnectSession(sessionId);
    
    // Wait a moment then reconnect
    setTimeout(async () => {
      try {
        await whatsAppPersistentService.initializeSession(sessionId);
      } catch (error) {
        console.error(`[WhatsApp API] Error during reconnection for ${sessionId}:`, error);
      }
    }, 1000);
    
    res.json({
      success: true,
      message: 'Reconnection initiated'
    });
  } catch (error) {
    console.error('[WhatsApp API] Error initiating reconnection:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Session health check
router.get('/sessions/:sessionId/health', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await whatsAppPersistentService.getSessionStatus(sessionId);
    
    res.json({
      success: result.success,
      health: {
        status: result.status,
        healthStatus: result.healthStatus,
        connected: result.connected,
        lastSeen: result.lastSeen,
        errorCount: result.errorCount,
        lastError: result.lastError
      }
    });
  } catch (error) {
    console.error('[WhatsApp API] Error checking health:', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed'
    });
  }
});

// Dashboard overview
router.get('/dashboard', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const result = await whatsAppPersistentService.getAllSessions(userId);
    
    if (result.success) {
      const stats = {
        totalSessions: result.sessions.length,
        connectedSessions: result.sessions.filter(s => s.status === 'CONNECTED').length,
        disconnectedSessions: result.sessions.filter(s => s.status === 'DISCONNECTED').length,
        errorSessions: result.sessions.filter(s => s.status === 'ERROR').length,
        qrPendingSessions: result.sessions.filter(s => s.status === 'QR_READY').length
      };
      
      res.json({
        success: true,
        stats,
        sessions: result.sessions
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[WhatsApp API] Error getting dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard'
    });
  }
});

// Legacy compatibility routes (redirect to session-based routes)
router.get('/qr', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const force = req.query.force === 'true';
    
    // Get or create default session
    let sessions = await whatsAppPersistentService.getAllSessions(userId);
    let defaultSession = sessions.sessions?.find(s => s.name === 'Default Session');
    
    if (!defaultSession) {
      defaultSession = await whatsAppPersistentService.createSession(userId, 'Default Session');
    }
    
    const result = await whatsAppPersistentService.getQRCode(defaultSession.id, force);
    
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
    console.error('[WhatsApp API] Error in legacy QR endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/status', async (req, res) => {
  try {
    const userId = await getUserId(req);
    
    // Get default session
    let sessions = await whatsAppPersistentService.getAllSessions(userId);
    let defaultSession = sessions.sessions?.find(s => s.name === 'Default Session');
    
    if (!defaultSession) {
      return res.json({
        success: false,
        connected: false,
        status: 'NO_SESSION',
        message: 'No default session found'
      });
    }
    
    const result = await whatsAppPersistentService.getSessionStatus(defaultSession.id);
    
    res.json({
      success: result.success,
      connected: result.connected,
      status: result.status,
      message: result.message || 'Status retrieved',
      phoneNumber: result.phoneNumber,
      lastConnected: result.lastConnected,
      lastSeen: result.lastSeen
    });
  } catch (error) {
    console.error('[WhatsApp API] Error in legacy status endpoint:', error);
    res.status(500).json({
      success: false,
      connected: false,
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;