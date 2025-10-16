const express = require('express');
const cors = require('cors');
const minimalWhatsAppService = require('./whatsapp-minimal');

const app = express();
const PORT = process.env.PORT || 3500;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Minimal WhatsApp Service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// QR code endpoint
app.get('/whatsapp/qr/:sessionId?', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'default';
    const force = req.query.force === 'true';
    
    console.log(`[API] QR code requested for session ${sessionId} (force: ${force})`);
    
    const result = await minimalWhatsAppService.generateQR(sessionId, force);
    
    if (result.success) {
      res.json({
        success: true,
        qr: result.qr,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[API] QR endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Connection status endpoint
app.get('/whatsapp/status/:sessionId?', (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'default';
    const result = minimalWhatsAppService.getConnectionStatus(sessionId);
    res.json(result);
  } catch (error) {
    console.error('[API] Status endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Request pairing code endpoint
app.post('/api/whatsapp/request-pairing-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    console.log(`[API] Pairing code requested for: ${phoneNumber}`);
    
    const result = await minimalWhatsAppService.requestPairingCode(phoneNumber);
    
    if (result.success) {
      res.json({
        success: true,
        pairingCode: result.pairingCode,
        phoneNumber: result.phoneNumber,
        message: 'Pairing code generated. Enter this code in WhatsApp Settings > Linked Devices.'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[API] Pairing endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Verify pairing code endpoint (placeholder)
app.post('/api/whatsapp/verify-pairing-code', async (req, res) => {
  try {
    const { sessionId, code } = req.body;
    
    if (!sessionId || !code) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and code are required'
      });
    }
    
    // For now, just return success
    // In real implementation, this would verify the code with WhatsApp
    res.json({
      success: true,
      message: 'Pairing code verified successfully',
      sessionId
    });
  } catch (error) {
    console.error('[API] Verify endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// List connections endpoint
app.get('/whatsapp/connections', (req, res) => {
  try {
    const result = minimalWhatsAppService.getAllConnections();
    res.json(result);
  } catch (error) {
    console.error('[API] Connections endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Disconnect session endpoint
app.post('/whatsapp/disconnect/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const result = await minimalWhatsAppService.disconnectSession(sessionId);
    res.json(result);
  } catch (error) {
    console.error('[API] Disconnect endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/whatsapp/health', (req, res) => {
  const connections = minimalWhatsAppService.getAllConnections();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Minimal WhatsApp Service',
    version: '1.0.0',
    connections: connections.total
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ====================================
  🚀 Minimal WhatsApp Service
  ====================================
  URL: http://localhost:${PORT}
  
  ✨ Minimal Configuration:
  📱 Essential Baileys setup only
  🔄 Basic QR code generation
  📞 Phone pairing support
  🧪 Testing endpoints
  
  ⚡ Test endpoints:
  • GET  /whatsapp/health
  • GET  /whatsapp/qr/test
  • POST /api/whatsapp/request-pairing-code
  ====================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\\n🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\\n🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

module.exports = app;