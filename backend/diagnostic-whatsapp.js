const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const path = require('path');

console.log('🔍 [DIAGNOSTIC] Starting WhatsApp Baileys Diagnostic Test');
console.log('📦 [DIAGNOSTIC] Baileys version:', require('@whiskeysockets/baileys/package.json').version);
console.log('⚙️ [DIAGNOSTIC] Node.js version:', process.version);

class WhatsAppDiagnostic {
  constructor() {
    this.sessionPath = path.join(__dirname, 'diagnostic_auth');
    this.connectionAttempts = 0;
    this.maxAttempts = 3;
    this.sock = null;
    this.startTime = null;
  }

  async start() {
    console.log('\n🚀 [DIAGNOSTIC] Starting diagnostic test...');
    this.startTime = Date.now();
    
    try {
      await this.connectWithMinimalConfig();
    } catch (error) {
      console.error('❌ [DIAGNOSTIC] Fatal error:', error);
      process.exit(1);
    }
  }

  async connectWithMinimalConfig() {
    this.connectionAttempts++;
    console.log(`\n🔄 [DIAGNOSTIC] Connection attempt ${this.connectionAttempts}/${this.maxAttempts}`);
    
    try {
      // Load auth state
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
      console.log('✅ [DIAGNOSTIC] Auth state loaded successfully');

      // Create socket with absolute minimal configuration
      console.log('📱 [DIAGNOSTIC] Creating WASocket with minimal config...');
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['DiagnosticTest', 'Chrome', '1.0.0']
      });

      console.log('✅ [DIAGNOSTIC] WASocket created successfully');

      // Set up event handlers
      this.setupEventHandlers(saveCreds);

    } catch (error) {
      console.error('❌ [DIAGNOSTIC] Error in connectWithMinimalConfig:', error);
      
      if (this.connectionAttempts < this.maxAttempts) {
        console.log(`🔄 [DIAGNOSTIC] Retrying in 5 seconds... (${this.connectionAttempts}/${this.maxAttempts})`);
        setTimeout(() => this.connectWithMinimalConfig(), 5000);
      } else {
        console.error('🛑 [DIAGNOSTIC] Max connection attempts reached. Diagnostic failed.');
        process.exit(1);
      }
    }
  }

  setupEventHandlers(saveCreds) {
    console.log('🎯 [DIAGNOSTIC] Setting up event handlers...');

    // Connection updates
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const elapsed = Date.now() - this.startTime;
      
      console.log(`\n📊 [DIAGNOSTIC] Connection update (${elapsed}ms elapsed):`, {
        connection,
        hasQR: !!qr,
        lastDisconnect: lastDisconnect?.error?.output?.statusCode
      });

      if (qr) {
        console.log('📱 [DIAGNOSTIC] QR Code received! Generating...');
        await this.handleQRCode(qr);
      }

      if (connection === 'close') {
        console.log('🔌 [DIAGNOSTIC] Connection closed');
        
        if (lastDisconnect?.error) {
          const shouldReconnect = this.handleDisconnect(lastDisconnect.error);
          
          if (shouldReconnect && this.connectionAttempts < this.maxAttempts) {
            console.log('🔄 [DIAGNOSTIC] Attempting reconnection...');
            setTimeout(() => this.connectWithMinimalConfig(), 3000);
          } else {
            console.log('🛑 [DIAGNOSTIC] Not reconnecting. Diagnostic complete.');
            this.printDiagnosticSummary();
            process.exit(0);
          }
        }
      } else if (connection === 'open') {
        console.log('🎉 [DIAGNOSTIC] Connection opened successfully!');
        console.log('📞 [DIAGNOSTIC] Connected phone number:', this.sock.user?.id);
        
        // Test basic functionality
        await this.testBasicFunctionality();
        
        console.log('✅ [DIAGNOSTIC] Basic functionality test completed');
        console.log('🛑 [DIAGNOSTIC] Diagnostic completed successfully');
        this.printDiagnosticSummary();
        process.exit(0);
      }
    });

    // Credentials update
    this.sock.ev.on('creds.update', () => {
      console.log('🔐 [DIAGNOSTIC] Credentials updated');
      saveCreds();
    });

    // Messages (for testing)
    this.sock.ev.on('messages.upsert', (m) => {
      console.log('📨 [DIAGNOSTIC] Message received (test successful)');
    });
  }

  async handleQRCode(qr) {
    try {
      const qrDataUrl = await QRCode.toDataURL(qr, {
        width: 300,
        margin: 2
      });
      
      console.log('✅ [DIAGNOSTIC] QR Code generated successfully');
      console.log('📋 [DIAGNOSTIC] QR Data URL length:', qrDataUrl.length);
      console.log('🔗 [DIAGNOSTIC] Raw QR data length:', qr.length);
      
      // Save QR to file for inspection
      const fs = require('fs');
      const qrImageBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      fs.writeFileSync(path.join(__dirname, 'diagnostic-qr.png'), qrImageBuffer);
      
      console.log('💾 [DIAGNOSTIC] QR code saved to diagnostic-qr.png');
      console.log('📱 [DIAGNOSTIC] Please scan this QR code with your phone');
      console.log('⏱️ [DIAGNOSTIC] Waiting for scan...');
      
    } catch (error) {
      console.error('❌ [DIAGNOSTIC] QR Code generation error:', error);
    }
  }

  handleDisconnect(error) {
    const statusCode = error?.output?.statusCode;
    console.log(`🔌 [DIAGNOSTIC] Disconnect reason: ${error?.message} (Status: ${statusCode})`);
    
    if (error instanceof Boom) {
      const reason = error.output?.payload?.error;
      console.log('💥 [DIAGNOSTIC] Boom error reason:', reason);
      
      switch (statusCode) {
        case DisconnectReason.badSession:
          console.log('🗂️ [DIAGNOSTIC] Bad session - clearing auth and retrying');
          this.clearAuthState();
          return true;
          
        case DisconnectReason.connectionClosed:
          console.log('⚠️ [DIAGNOSTIC] Connection closed - this is the main issue we are diagnosing');
          return false;
          
        case DisconnectReason.connectionLost:
          console.log('📡 [DIAGNOSTIC] Connection lost - network issue');
          return true;
          
        case DisconnectReason.connectionReplaced:
          console.log('🔄 [DIAGNOSTIC] Connection replaced - another instance connected');
          return false;
          
        case DisconnectReason.loggedOut:
          console.log('👋 [DIAGNOSTIC] Logged out');
          this.clearAuthState();
          return true;
          
        case DisconnectReason.restartRequired:
          console.log('🔄 [DIAGNOSTIC] Restart required');
          return true;
          
        case DisconnectReason.timedOut:
          console.log('⏰ [DIAGNOSTIC] Timed out');
          return true;
          
        default:
          console.log('❓ [DIAGNOSTIC] Unknown disconnect reason');
          return false;
      }
    }
    
    return false;
  }

  clearAuthState() {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.sessionPath)) {
        fs.rmSync(this.sessionPath, { recursive: true, force: true });
        console.log('🗑️ [DIAGNOSTIC] Auth state cleared');
      }
    } catch (error) {
      console.error('❌ [DIAGNOSTIC] Error clearing auth state:', error);
    }
  }

  async testBasicFunctionality() {
    try {
      console.log('🧪 [DIAGNOSTIC] Testing basic functionality...');
      
      // Test getting chat list
      const chats = await this.sock.getBusinessProfile(this.sock.user.id);
      console.log('✅ [DIAGNOSTIC] Business profile test successful');
      
    } catch (error) {
      console.log('⚠️ [DIAGNOSTIC] Basic functionality test warning:', error.message);
    }
  }

  printDiagnosticSummary() {
    const totalTime = Date.now() - this.startTime;
    console.log('\n' + '='.repeat(50));
    console.log('📊 [DIAGNOSTIC] SUMMARY REPORT');
    console.log('='.repeat(50));
    console.log(`⏱️ Total diagnostic time: ${totalTime}ms`);
    console.log(`🔄 Connection attempts: ${this.connectionAttempts}`);
    console.log(`📦 Baileys version: ${require('@whiskeysockets/baileys/package.json').version}`);
    console.log(`⚙️ Node.js version: ${process.version}`);
    console.log(`🖥️ Platform: ${process.platform}`);
    console.log(`🏗️ Architecture: ${process.arch}`);
    console.log('='.repeat(50));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 [DIAGNOSTIC] Interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 [DIAGNOSTIC] Terminated');
  process.exit(0);
});

// Start diagnostic
const diagnostic = new WhatsAppDiagnostic();
diagnostic.start();