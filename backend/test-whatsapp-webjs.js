const express = require('express');
const cors = require('cors');
const whatsappRoutes = require('./whatsapp-webjs-routes');

const app = express();
const PORT = 3333;

// Middleware
app.use(express.json());
app.use(cors());

// Mount WhatsApp routes
app.use('/api/whatsapp', whatsappRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'whatsapp-web.js',
    timestamp: new Date().toISOString() 
  });
});

// Test endpoints
app.get('/', (req, res) => {
  res.json({ 
    message: 'WhatsApp Web.js Test Server',
    endpoints: {
      health: 'GET /health',
      connect: 'POST /api/whatsapp/connect',
      qr: 'GET /api/whatsapp/qr/:sessionId',
      status: 'GET /api/whatsapp/status/:sessionId',
      send: 'POST /api/whatsapp/send',
      disconnect: 'POST /api/whatsapp/disconnect/:sessionId',
      sessions: 'GET /api/whatsapp/sessions'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀 WhatsApp Web.js Test Server                     ║
║   📍 Running on: http://localhost:${PORT}            ║
║   📱 Service: whatsapp-web.js v1.34.1                ║
║                                                       ║
║   Test connection:                                    ║
║   curl -X POST http://localhost:${PORT}/api/whatsapp/connect \\
║        -H "Content-Type: application/json" \\        
║        -d '{"userId":"test-user"}'                   ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});