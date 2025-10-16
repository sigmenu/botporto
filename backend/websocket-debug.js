const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const path = require('path');

console.log('🔍 [WS DEBUG] WhatsApp WebSocket Connection Debugger');
console.log('='.repeat(60));

class WebSocketDebugger {
  constructor() {
    this.sessionPath = path.join(__dirname, 'ws_debug_auth');
    this.sock = null;
    this.connectionLog = [];
    this.wsEvents = [];
    this.startTime = Date.now();
  }

  async start() {
    console.log('🚀 [WS DEBUG] Starting WebSocket debugging session...');
    console.log(`⏰ [WS DEBUG] Start time: ${new Date().toISOString()}`);
    console.log(`📦 [WS DEBUG] Baileys version: ${require('@whiskeysockets/baileys/package.json').version}`);
    console.log(`⚙️ [WS DEBUG] Node.js version: ${process.version}`);
    
    try {
      await this.initializeConnection();
    } catch (error) {
      console.error('❌ [WS DEBUG] Fatal error:', error);
      this.printDebugSummary();
      process.exit(1);
    }
  }

  async initializeConnection() {
    console.log('\n📡 [WS DEBUG] Initializing WhatsApp connection...');
    
    // Load auth state
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
    console.log('✅ [WS DEBUG] Auth state loaded');

    // Create socket
    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['WSDebugger', 'Chrome', '1.0.0']
    });

    console.log('✅ [WS DEBUG] WASocket created');

    // Set up comprehensive WebSocket debugging
    this.setupWebSocketDebugging();
    
    // Set up event handlers
    this.setupEventHandlers(saveCreds);

    console.log('🎯 [WS DEBUG] All handlers set up, monitoring WebSocket...');
    
    // Monitor for 30 seconds then provide report
    setTimeout(() => {
      this.printDebugSummary();
      process.exit(0);
    }, 30000);
  }

  setupWebSocketDebugging() {
    console.log('🔧 [WS DEBUG] Setting up WebSocket debugging...');
    
    // Hook into the WebSocket directly
    const originalSocket = this.sock.ws;
    
    if (originalSocket) {
      console.log('🌐 [WS DEBUG] WebSocket found, attaching debug handlers');
      
      // Track WebSocket state changes
      this.logWsEvent('WebSocket Created', {
        readyState: originalSocket.readyState,
        url: originalSocket.url || 'N/A',
        protocol: originalSocket.protocol || 'N/A'
      });

      // Override WebSocket events
      const originalOnOpen = originalSocket.onopen;
      originalSocket.onopen = (event) => {
        this.logWsEvent('WebSocket Open', {
          readyState: originalSocket.readyState,
          timestamp: Date.now()
        });
        if (originalOnOpen) originalOnOpen.call(originalSocket, event);
      };

      const originalOnClose = originalSocket.onclose;
      originalSocket.onclose = (event) => {
        this.logWsEvent('WebSocket Close', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          readyState: originalSocket.readyState,
          timestamp: Date.now()
        });
        if (originalOnClose) originalOnClose.call(originalSocket, event);
      };

      const originalOnError = originalSocket.onerror;
      originalSocket.onerror = (event) => {
        this.logWsEvent('WebSocket Error', {
          error: event.error || 'Unknown error',
          message: event.message || 'No message',
          timestamp: Date.now()
        });
        if (originalOnError) originalOnError.call(originalSocket, event);
      };

      const originalOnMessage = originalSocket.onmessage;
      originalSocket.onmessage = (event) => {
        this.logWsEvent('WebSocket Message', {
          dataType: typeof event.data,
          dataLength: event.data?.length || 0,
          timestamp: Date.now()
        });
        if (originalOnMessage) originalOnMessage.call(originalSocket, event);
      };

      // Monitor WebSocket state periodically
      const stateMonitor = setInterval(() => {
        if (originalSocket) {
          this.logWsEvent('WebSocket State Check', {
            readyState: originalSocket.readyState,
            readyStateText: this.getReadyStateText(originalSocket.readyState),
            bufferedAmount: originalSocket.bufferedAmount || 0,
            timestamp: Date.now()
          });
        } else {
          clearInterval(stateMonitor);
        }
      }, 5000);

    } else {
      console.log('⚠️ [WS DEBUG] No WebSocket found immediately');
      
      // Monitor for WebSocket creation
      const checkForWs = setInterval(() => {
        if (this.sock.ws) {
          console.log('🌐 [WS DEBUG] WebSocket detected after creation');
          this.setupWebSocketDebugging();
          clearInterval(checkForWs);
        }
      }, 100);
      
      setTimeout(() => clearInterval(checkForWs), 5000);
    }
  }

  setupEventHandlers(saveCreds) {
    console.log('🎯 [WS DEBUG] Setting up Baileys event handlers...');

    // Connection updates
    this.sock.ev.on('connection.update', (update) => {
      const elapsed = Date.now() - this.startTime;
      this.logConnectionEvent('Connection Update', {
        ...update,
        elapsed: `${elapsed}ms`,
        timestamp: new Date().toISOString()
      });
    });

    // Credentials update
    this.sock.ev.on('creds.update', () => {
      this.logConnectionEvent('Credentials Update', {
        timestamp: new Date().toISOString()
      });
      saveCreds();
    });

    // Messages
    this.sock.ev.on('messages.upsert', (m) => {
      this.logConnectionEvent('Messages Upsert', {
        messageCount: m.messages?.length || 0,
        timestamp: new Date().toISOString()
      });
    });

    // Presence updates
    this.sock.ev.on('presence.update', (presence) => {
      this.logConnectionEvent('Presence Update', {
        id: presence.id,
        presences: Object.keys(presence.presences || {}),
        timestamp: new Date().toISOString()
      });
    });

    // Contacts update
    this.sock.ev.on('contacts.update', (contacts) => {
      this.logConnectionEvent('Contacts Update', {
        contactCount: contacts?.length || 0,
        timestamp: new Date().toISOString()
      });
    });
  }

  logWsEvent(event, data) {
    const logEntry = {
      event,
      data,
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime
    };
    
    this.wsEvents.push(logEntry);
    console.log(`🌐 [WS DEBUG] ${event}:`, JSON.stringify(data, null, 2));
  }

  logConnectionEvent(event, data) {
    const logEntry = {
      event,
      data,
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime
    };
    
    this.connectionLog.push(logEntry);
    console.log(`📡 [WS DEBUG] ${event}:`, JSON.stringify(data, null, 2));
  }

  getReadyStateText(readyState) {
    switch (readyState) {
      case 0: return 'CONNECTING';
      case 1: return 'OPEN';
      case 2: return 'CLOSING';
      case 3: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  printDebugSummary() {
    const totalTime = Date.now() - this.startTime;
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 [WS DEBUG] WEBSOCKET DEBUG SUMMARY REPORT');
    console.log('='.repeat(80));
    
    console.log(`⏱️ Total session time: ${totalTime}ms`);
    console.log(`🌐 WebSocket events captured: ${this.wsEvents.length}`);
    console.log(`📡 Connection events captured: ${this.connectionLog.length}`);
    
    // WebSocket events summary
    if (this.wsEvents.length > 0) {
      console.log('\n🌐 [WS DEBUG] WebSocket Events Timeline:');
      console.log('-'.repeat(80));
      this.wsEvents.forEach(event => {
        console.log(`  ${event.elapsed}ms | ${event.event} | ${JSON.stringify(event.data)}`);
      });
      
      // Analyze WebSocket patterns
      const openEvents = this.wsEvents.filter(e => e.event === 'WebSocket Open');
      const closeEvents = this.wsEvents.filter(e => e.event === 'WebSocket Close');
      const errorEvents = this.wsEvents.filter(e => e.event === 'WebSocket Error');
      const messageEvents = this.wsEvents.filter(e => e.event === 'WebSocket Message');
      
      console.log('\n📈 [WS DEBUG] WebSocket Statistics:');
      console.log(`  🟢 Open events: ${openEvents.length}`);
      console.log(`  🔴 Close events: ${closeEvents.length}`);
      console.log(`  ⚠️ Error events: ${errorEvents.length}`);
      console.log(`  📨 Message events: ${messageEvents.length}`);
      
      if (closeEvents.length > 0) {
        console.log('\n🔴 [WS DEBUG] Close Event Details:');
        closeEvents.forEach(event => {
          console.log(`  Code: ${event.data.code} | Reason: "${event.data.reason}" | Clean: ${event.data.wasClean}`);
        });
      }
      
      if (errorEvents.length > 0) {
        console.log('\n⚠️ [WS DEBUG] Error Event Details:');
        errorEvents.forEach(event => {
          console.log(`  Error: ${event.data.error} | Message: ${event.data.message}`);
        });
      }
    }
    
    // Connection events summary
    if (this.connectionLog.length > 0) {
      console.log('\n📡 [WS DEBUG] Connection Events Timeline:');
      console.log('-'.repeat(80));
      this.connectionLog.forEach(event => {
        console.log(`  ${event.elapsed}ms | ${event.event} | ${JSON.stringify(event.data)}`);
      });
    }
    
    console.log('\n🔧 [WS DEBUG] Environment Info:');
    console.log(`  • Node.js: ${process.version}`);
    console.log(`  • Platform: ${process.platform}`);
    console.log(`  • Baileys: ${require('@whiskeysockets/baileys/package.json').version}`);
    console.log('='.repeat(80));
    
    // Cleanup
    this.cleanup();
  }

  cleanup() {
    try {
      if (this.sock?.ws && this.sock.ws.readyState === 1) {
        this.sock.ws.close();
      }
      
      const fs = require('fs');
      if (fs.existsSync(this.sessionPath)) {
        fs.rmSync(this.sessionPath, { recursive: true, force: true });
        console.log('🧹 [WS DEBUG] Cleaned up session directory');
      }
    } catch (error) {
      console.log('⚠️ [WS DEBUG] Cleanup error:', error.message);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 [WS DEBUG] Interrupted by user');
  process.exit(0);
});

// Start debugging
const debugger = new WebSocketDebugger();
debugger.start();