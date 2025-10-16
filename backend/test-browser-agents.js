const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const path = require('path');

console.log('🌐 [BROWSER TEST] WhatsApp Browser User Agent Test');
console.log('='.repeat(50));

class BrowserAgentTester {
  constructor() {
    this.userAgents = [
      // Current working browsers
      ['Chrome', 'Chrome', '10.0.0'],
      ['Edge', 'Chrome', '10.0.0'],
      ['Firefox', 'Firefox', '10.0.0'],
      ['Safari', 'Safari', '10.0.0'],
      
      // WhatsApp default
      ['WhatsApp', '', ''],
      
      // Mobile browsers
      ['Chrome Mobile', 'Chrome', '10.0.0'],
      ['Safari Mobile', 'Safari', '10.0.0'],
      
      // Desktop variations
      ['Ubuntu', 'Chrome', '20.0.04'],
      ['Windows', 'Chrome', '10.0.0'],
      ['macOS', 'Safari', '10.15.7'],
      
      // Legacy versions
      ['Chrome Legacy', 'Chrome', '9.0.0'],
      ['Firefox Legacy', 'Firefox', '9.0.0'],
      
      // Custom variations
      ['DiagnosticTest', 'Chrome', '1.0.0'],
      ['TestBot', 'Chrome', '1.0.0'],
      ['WhatsAppBot', 'Chrome', '1.0.0'],
      
      // Alternative formats
      ['Chrome (Linux)', 'Chrome', '10.0.0'],
      ['Chrome (Windows)', 'Chrome', '10.0.0'],
      ['Chrome (Mac)', 'Chrome', '10.0.0']
    ];
    this.results = [];
  }

  async runTest() {
    console.log(`🧪 [BROWSER TEST] Testing ${this.userAgents.length} browser user agents...`);
    console.log(`⚙️ [BROWSER TEST] Node.js version: ${process.version}`);
    console.log(`📦 [BROWSER TEST] Baileys version: ${require('@whiskeysockets/baileys/package.json').version}`);
    
    for (let i = 0; i < this.userAgents.length; i++) {
      const userAgent = this.userAgents[i];
      console.log(`\n🔄 [BROWSER TEST] Testing ${i + 1}/${this.userAgents.length}: [${userAgent.join(', ')}]`);
      
      const result = await this.testUserAgent(userAgent, i);
      this.results.push(result);
      
      // Brief pause between tests
      await this.sleep(1000);
    }
    
    this.printSummary();
  }

  async testUserAgent(userAgent, index) {
    const startTime = Date.now();
    const sessionPath = path.join(__dirname, `browser_test_auth_${index}`);
    
    const result = {
      userAgent: userAgent.slice(),
      success: false,
      socketCreated: false,
      eventsAttached: false,
      qrGenerated: false,
      error: null,
      duration: 0,
      sessionPath
    };

    try {
      // Load auth state
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      
      // Create socket with this user agent
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: userAgent
      });

      result.socketCreated = true;
      console.log(`✅ [BROWSER TEST] Socket created for [${userAgent.join(', ')}]`);

      // Set up basic event listeners to test functionality
      let qrReceived = false;
      let eventsWorking = false;

      sock.ev.on('connection.update', (update) => {
        eventsWorking = true;
        const { qr, connection } = update;
        
        if (qr) {
          qrReceived = true;
          console.log(`📱 [BROWSER TEST] QR received for [${userAgent.join(', ')}] - QR length: ${qr.length}`);
        }
        
        if (connection) {
          console.log(`🔗 [BROWSER TEST] Connection update for [${userAgent.join(', ')}]: ${connection}`);
        }
      });

      sock.ev.on('creds.update', () => {
        saveCreds();
      });

      result.eventsAttached = eventsWorking;

      // Wait a short time to see if QR is generated
      await this.sleep(3000);

      result.qrGenerated = qrReceived;
      result.success = result.socketCreated && eventsWorking;

      // Clean up
      if (sock.ws && sock.ws.readyState === 1) {
        sock.ws.close();
      }

    } catch (error) {
      console.log(`❌ [BROWSER TEST] Error with [${userAgent.join(', ')}]: ${error.message}`);
      result.error = error.message;
    }

    result.duration = Date.now() - startTime;
    console.log(`⏱️ [BROWSER TEST] [${userAgent.join(', ')}] completed in ${result.duration}ms`);
    
    return result;
  }

  printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 [BROWSER TEST] BROWSER USER AGENT COMPATIBILITY REPORT');
    console.log('='.repeat(70));

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const qrGenerated = this.results.filter(r => r.qrGenerated);

    console.log(`✅ Successful user agents: ${successful.length}/${this.results.length}`);
    console.log(`❌ Failed user agents: ${failed.length}/${this.results.length}`);
    console.log(`📱 QR codes generated: ${qrGenerated.length}/${this.results.length}`);
    
    console.log('\n📈 [BROWSER TEST] Detailed Results:');
    console.log('-'.repeat(70));
    
    this.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const qrStatus = result.qrGenerated ? '📱' : '⭕';
      const userAgentStr = `[${result.userAgent.join(', ')}]`;
      const details = result.success 
        ? `Socket: ${result.socketCreated ? '✅' : '❌'} | Events: ${result.eventsAttached ? '✅' : '❌'} | QR: ${result.qrGenerated ? '✅' : '❌'}`
        : `Error: ${result.error?.substring(0, 30)}...`;
      
      console.log(`${status}${qrStatus} ${userAgentStr.padEnd(30)} | ${result.duration}ms | ${details}`);
    });

    if (successful.length > 0) {
      console.log('\n🎯 [BROWSER TEST] Best performing user agents:');
      successful
        .sort((a, b) => a.duration - b.duration)
        .slice(0, 5)
        .forEach(result => {
          console.log(`   • [${result.userAgent.join(', ')}] (${result.duration}ms)${result.qrGenerated ? ' 📱' : ''}`);
        });
    }

    if (qrGenerated.length > 0) {
      console.log('\n📱 [BROWSER TEST] User agents that generated QR codes:');
      qrGenerated.forEach(result => {
        console.log(`   • [${result.userAgent.join(', ')}] (${result.duration}ms)`);
      });
    }

    if (failed.length > 0) {
      console.log('\n⚠️ [BROWSER TEST] Failed user agents:');
      failed.forEach(result => {
        console.log(`   • [${result.userAgent.join(', ')}]: ${result.error}`);
      });
    }

    console.log('\n🔧 [BROWSER TEST] Environment Info:');
    console.log(`   • Node.js: ${process.version}`);
    console.log(`   • Platform: ${process.platform}`);
    console.log(`   • Architecture: ${process.arch}`);
    console.log(`   • Baileys: ${require('@whiskeysockets/baileys/package.json').version}`);
    console.log('='.repeat(70));

    // Clean up test auth directories
    this.cleanupTestDirectories();
  }

  cleanupTestDirectories() {
    const fs = require('fs');
    
    this.results.forEach(result => {
      try {
        if (fs.existsSync(result.sessionPath)) {
          fs.rmSync(result.sessionPath, { recursive: true, force: true });
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    
    console.log('🧹 [BROWSER TEST] Cleaned up test directories');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 [BROWSER TEST] Interrupted by user');
  process.exit(0);
});

// Start test
const tester = new BrowserAgentTester();
tester.runTest().catch(error => {
  console.error('❌ [BROWSER TEST] Fatal error:', error);
  process.exit(1);
});