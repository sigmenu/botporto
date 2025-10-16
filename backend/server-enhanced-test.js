const express = require('express');
const cors = require('cors');
const enhancedWhatsAppRoutes = require('./whatsapp-enhanced-routes');

const app = express();
const PORT = process.env.PORT || 3444;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Main route
app.get('/', (req, res) => {
  res.json({
    message: 'Enhanced WhatsApp Service Test Server',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    features: [
      'Enhanced connection stability',
      'Comprehensive error handling',
      'Real-time diagnostics',
      'Phone number pairing fallback',
      'Exponential backoff retry logic',
      'WebSocket event logging'
    ],
    endpoints: {
      qr: 'GET /whatsapp/qr/:sessionId',
      status: 'GET /whatsapp/status/:sessionId',
      diagnostics: 'GET /whatsapp/diagnostics/:sessionId',
      pair: 'POST /whatsapp/pair',
      disconnect: 'POST /whatsapp/disconnect/:sessionId',
      connections: 'GET /whatsapp/connections',
      health: 'GET /whatsapp/health',
      test: 'GET /whatsapp/test/:sessionId'
    }
  });
});

// Enhanced WhatsApp routes
app.use('/whatsapp', enhancedWhatsAppRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ================================
  🚀 Enhanced WhatsApp Test Server
  ================================
  URL: http://localhost:${PORT}
  
  ✨ Features:
  📱 Stable QR connections
  🔄 Automatic retry logic
  📊 Real-time diagnostics
  📞 Phone number pairing
  🔍 WebSocket event logging
  
  ⚡ Test endpoints:
  • GET  /whatsapp/health
  • GET  /whatsapp/test/mysession
  • GET  /whatsapp/qr/mysession
  • POST /whatsapp/pair
  ================================
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