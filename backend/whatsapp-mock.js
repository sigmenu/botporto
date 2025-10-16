const express = require('express');
const router = express.Router();

// Mock QR code data URL (200x200 QR code placeholder)
const mockQrCode = 'data:image/png;base64,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';

// WhatsApp connection status
let isConnected = false;
let connectionTimeout = null;

// Generate QR endpoint
router.get('/qr', (req, res) => {
  console.log('[WhatsApp Mock] QR code requested');
  
  // Reset connection status
  isConnected = false;
  
  // Simulate connection after 10 seconds
  if (connectionTimeout) clearTimeout(connectionTimeout);
  connectionTimeout = setTimeout(() => {
    isConnected = true;
    console.log('[WhatsApp Mock] Simulated connection successful');
  }, 10000);
  
  res.json({
    success: true,
    qr: mockQrCode,
    message: 'QR code gerado com sucesso'
  });
});

// Status endpoint
router.get('/status', (req, res) => {
  console.log('[WhatsApp Mock] Status check:', isConnected ? 'connected' : 'disconnected');
  
  res.json({
    success: true,
    connected: isConnected,
    message: isConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'
  });
});

// Send message endpoint
router.post('/send', (req, res) => {
  const { to, message } = req.body;
  console.log('[WhatsApp Mock] Message send request:', { to, message: message?.substring(0, 50) });
  
  if (!isConnected) {
    return res.status(400).json({
      success: false,
      message: 'WhatsApp não está conectado'
    });
  }
  
  res.json({
    success: true,
    messageId: 'mock_' + Date.now(),
    message: 'Mensagem enviada com sucesso'
  });
});

// Disconnect endpoint
router.post('/disconnect', (req, res) => {
  console.log('[WhatsApp Mock] Disconnect request');
  
  isConnected = false;
  if (connectionTimeout) clearTimeout(connectionTimeout);
  
  res.json({
    success: true,
    message: 'WhatsApp desconectado com sucesso'
  });
});

// QR refresh endpoint
router.post('/qr/refresh', (req, res) => {
  console.log('[WhatsApp Mock] QR refresh requested');
  
  res.json({
    success: true,
    qr: mockQrCode,
    message: 'QR code atualizado com sucesso'
  });
});

// Sessions endpoints (for compatibility)
router.get('/default/qr', (req, res) => {
  console.log('[WhatsApp Mock] Session QR requested');
  res.json({
    success: true,
    qr: mockQrCode,
    message: 'QR code gerado com sucesso'
  });
});

router.get('/default/status', (req, res) => {
  console.log('[WhatsApp Mock] Session status check:', isConnected ? 'connected' : 'disconnected');
  res.json({
    success: true,
    connected: isConnected,
    message: isConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'
  });
});

router.post('/default/disconnect', (req, res) => {
  console.log('[WhatsApp Mock] Session disconnect request');
  isConnected = false;
  if (connectionTimeout) clearTimeout(connectionTimeout);
  
  res.json({
    success: true,
    message: 'WhatsApp desconectado com sucesso'
  });
});

module.exports = router;