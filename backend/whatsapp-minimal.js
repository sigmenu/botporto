const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Create sessions directory
const sessionsDir = path.join(__dirname, 'minimal_sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// Store active connections
const connections = new Map();
const qrCodes = new Map();

class MinimalWhatsAppService {
  constructor() {
    console.log('[Minimal WhatsApp] Service initialized');
  }

  getSessionPath(sessionId) {
    return path.join(sessionsDir, `session_${sessionId}`);
  }

  async createConnection(sessionId) {
    try {
      console.log(`[Minimal WhatsApp] Creating connection for session: ${sessionId}`);
      
      // Create session directory
      const sessionPath = this.getSessionPath(sessionId);
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      // Get auth state
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      
      // Get latest version
      const { version } = await fetchLatestBaileysVersion();
      console.log(`[Minimal WhatsApp] Using Baileys version: ${version.join(',')}`);

      // Create socket with MINIMAL configuration
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Chrome', 'Chrome', '10.0.0']
      });

      // Store connection
      connections.set(sessionId, {
        sock,
        connected: false,
        qr: null,
        status: 'connecting'
      });

      // Handle auth state updates
      sock.ev.on('creds.update', saveCreds);

      // Handle connection updates
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const conn = connections.get(sessionId);
        
        console.log(`[Minimal WhatsApp] Connection update for ${sessionId}:`, {
          connection,
          hasQR: !!qr,
          lastDisconnect: lastDisconnect?.error?.output?.statusCode
        });

        if (qr) {
          console.log(`[Minimal WhatsApp] QR code received for session: ${sessionId}`);
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 256 });
            if (conn) {
              conn.qr = qrDataUrl;
              conn.status = 'qr_ready';
            }
            qrCodes.set(sessionId, qrDataUrl);
            console.log(`[Minimal WhatsApp] QR code generated successfully for ${sessionId}`);
          } catch (error) {
            console.error(`[Minimal WhatsApp] QR generation error:`, error);
          }
        }

        if (connection === 'close') {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log(`[Minimal WhatsApp] Connection closed for ${sessionId}. Should reconnect: ${shouldReconnect}`);
          
          if (conn) {
            conn.connected = false;
            conn.status = 'disconnected';
          }
          
          if (shouldReconnect) {
            console.log(`[Minimal WhatsApp] Reconnecting ${sessionId}...`);
            setTimeout(() => this.createConnection(sessionId), 3000);
          } else {
            connections.delete(sessionId);
            qrCodes.delete(sessionId);
          }
        } else if (connection === 'open') {
          console.log(`[Minimal WhatsApp] Connection opened for ${sessionId}`);
          if (conn) {
            conn.connected = true;
            conn.status = 'connected';
          }
        }
      });

      // Handle messages
      sock.ev.on('messages.upsert', (m) => {
        console.log(`[Minimal WhatsApp] Messages received for ${sessionId}:`, m.messages.length);
      });

      return sock;

    } catch (error) {
      console.error(`[Minimal WhatsApp] Error creating connection for ${sessionId}:`, error);
      throw error;
    }
  }

  async generateQR(sessionId, force = false) {
    try {
      let connection = connections.get(sessionId);
      
      if (!connection || force) {
        await this.createConnection(sessionId);
        connection = connections.get(sessionId);
      }

      // Wait for QR code with timeout
      const timeout = 30000; // 30 seconds
      const start = Date.now();
      
      while (Date.now() - start < timeout) {
        if (connection.qr) {
          return {
            success: true,
            qr: connection.qr,
            timestamp: Date.now()
          };
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return {
        success: false,
        message: 'QR code generation timeout'
      };

    } catch (error) {
      console.error('[Minimal WhatsApp] QR generation error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async requestPairingCode(phoneNumber) {
    try {
      console.log(`[Minimal WhatsApp] Requesting pairing code for: ${phoneNumber}`);
      
      // Create temporary session for pairing
      const tempSessionId = `pairing_${Date.now()}`;
      const sessionPath = this.getSessionPath(tempSessionId);
      
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      const { state } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Chrome', 'Chrome', '10.0.0']
      });

      const pairingCode = await sock.requestPairingCode(phoneNumber);
      
      // Clean up
      sock.end();
      setTimeout(() => {
        try {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        } catch (err) {
          console.error('Cleanup error:', err);
        }
      }, 1000);

      return {
        success: true,
        pairingCode,
        phoneNumber
      };

    } catch (error) {
      console.error('[Minimal WhatsApp] Pairing code error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  getConnectionStatus(sessionId) {
    const connection = connections.get(sessionId);
    
    if (!connection) {
      return {
        success: false,
        message: 'Session not found'
      };
    }

    return {
      success: true,
      connected: connection.connected,
      status: connection.status,
      hasQR: !!connection.qr
    };
  }

  getAllConnections() {
    const result = [];
    
    for (const [sessionId, connection] of connections) {
      result.push({
        sessionId,
        connected: connection.connected,
        status: connection.status,
        hasQR: !!connection.qr
      });
    }

    return {
      success: true,
      connections: result,
      total: result.length
    };
  }

  async disconnectSession(sessionId) {
    const connection = connections.get(sessionId);
    
    if (!connection) {
      return {
        success: false,
        message: 'Session not found'
      };
    }

    try {
      connection.sock.end();
      connections.delete(sessionId);
      qrCodes.delete(sessionId);
      
      return {
        success: true,
        message: 'Session disconnected'
      };
    } catch (error) {
      console.error(`[Minimal WhatsApp] Disconnect error:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

// Create and export singleton instance
const minimalWhatsAppService = new MinimalWhatsAppService();
module.exports = minimalWhatsAppService;