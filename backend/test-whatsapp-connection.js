#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3444';
const TEST_SESSION = 'test_connection_' + Date.now();

class WhatsAppConnectionTester {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message };
    this.results.push(logEntry);
    
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      error: '\x1b[31m',   // Red
      warning: '\x1b[33m', // Yellow
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[type]}[${timestamp}] ${type.toUpperCase()}: ${message}${colors.reset}`);
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return { success: true, data: response.data, status: response.status };
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        status: error.response?.status,
        data: error.response?.data
      };
    }
  }

  async testHealthCheck() {
    this.log('Testing health check endpoint...');
    
    const result = await this.makeRequest('GET', '/whatsapp/health');
    
    if (result.success) {
      this.log('Health check passed ✓', 'success');
      this.log(`Service version: ${result.data.version}`, 'info');
      this.log(`System uptime: ${Math.floor(result.data.system.uptime)}s`, 'info');
      return true;
    } else {
      this.log(`Health check failed: ${result.error}`, 'error');
      return false;
    }
  }

  async testQRGeneration() {
    this.log(`Testing QR code generation for session: ${TEST_SESSION}...`);
    
    const result = await this.makeRequest('GET', `/whatsapp/qr/${TEST_SESSION}?force=true`);
    
    if (result.success && result.data.success) {
      this.log('QR code generated successfully ✓', 'success');
      this.log(`QR timestamp: ${result.data.timestamp}`, 'info');
      
      // Validate QR code format
      if (result.data.qr && result.data.qr.startsWith('data:image/png;base64,')) {
        this.log('QR code format is valid ✓', 'success');
        return { success: true, qr: result.data.qr };
      } else {
        this.log('QR code format is invalid', 'error');
        return { success: false };
      }
    } else {
      this.log(`QR generation failed: ${result.data?.message || result.error}`, 'error');
      return { success: false };
    }
  }

  async testConnectionStatus() {
    this.log(`Testing connection status for session: ${TEST_SESSION}...`);
    
    const result = await this.makeRequest('GET', `/whatsapp/status/${TEST_SESSION}`);
    
    if (result.success && result.data.success) {
      this.log('Status check passed ✓', 'success');
      this.log(`Connection status: ${result.data.status}`, 'info');
      this.log(`Connected: ${result.data.connected}`, 'info');
      this.log(`Connection attempts: ${result.data.connectionAttempts}`, 'info');
      
      if (result.data.lastError) {
        this.log(`Last error: ${result.data.lastError}`, 'warning');
      }
      
      return result.data;
    } else {
      this.log(`Status check failed: ${result.error}`, 'error');
      return null;
    }
  }

  async testDiagnostics() {
    this.log(`Testing diagnostics for session: ${TEST_SESSION}...`);
    
    const result = await this.makeRequest('GET', `/whatsapp/diagnostics/${TEST_SESSION}`);
    
    if (result.success && result.data.success) {
      this.log('Diagnostics retrieved successfully ✓', 'success');
      
      const diag = result.data.diagnostics;
      this.log(`Session ID: ${diag.sessionId}`, 'info');
      this.log(`Status: ${diag.status}`, 'info');
      this.log(`Connection attempts: ${diag.connectionAttempts}`, 'info');
      this.log(`Is connecting: ${diag.isConnecting}`, 'info');
      
      if (diag.diagnostics.baileysVersion) {
        this.log(`Baileys version: ${diag.diagnostics.baileysVersion}`, 'info');
      }
      
      if (diag.recentEvents && diag.recentEvents.length > 0) {
        this.log(`Recent events count: ${diag.recentEvents.length}`, 'info');
        this.log(`Latest event: ${diag.recentEvents[diag.recentEvents.length - 1].event}`, 'info');
      }
      
      return diag;
    } else {
      this.log(`Diagnostics failed: ${result.error}`, 'error');
      return null;
    }
  }

  async testPhonePairing() {
    this.log('Testing phone number pairing...');
    
    // Use a test phone number format
    const testPhoneNumber = '+1234567890';
    
    const result = await this.makeRequest('POST', '/whatsapp/pair', {
      phoneNumber: testPhoneNumber
    });
    
    if (result.success && result.data.success) {
      this.log('Phone pairing code generated successfully ✓', 'success');
      this.log(`Pairing code: ${result.data.pairingCode}`, 'info');
      this.log(`For phone: ${result.data.phoneNumber}`, 'info');
      
      return result.data;
    } else {
      this.log(`Phone pairing failed: ${result.data?.message || result.error}`, 'error');
      return null;
    }
  }

  async testInvalidPhonePairing() {
    this.log('Testing invalid phone number handling...');
    
    const result = await this.makeRequest('POST', '/whatsapp/pair', {
      phoneNumber: 'invalid-number'
    });
    
    if (!result.success || !result.data.success) {
      this.log('Invalid phone number correctly rejected ✓', 'success');
      return true;
    } else {
      this.log('Invalid phone number was incorrectly accepted', 'error');
      return false;
    }
  }

  async testConnectionsList() {
    this.log('Testing connections list...');
    
    const result = await this.makeRequest('GET', '/whatsapp/connections');
    
    if (result.success && result.data.success) {
      this.log('Connections list retrieved successfully ✓', 'success');
      this.log(`Total connections: ${result.data.totalConnections}`, 'info');
      this.log(`Connected sessions: ${result.data.connectedSessions}`, 'info');
      
      if (result.data.connections.length > 0) {
        const testConnection = result.data.connections.find(c => c.sessionId === TEST_SESSION);
        if (testConnection) {
          this.log(`Found test session in connections list ✓`, 'success');
        } else {
          this.log('Test session not found in connections list', 'warning');
        }
      }
      
      return result.data;
    } else {
      this.log(`Connections list failed: ${result.error}`, 'error');
      return null;
    }
  }

  async waitForConnection(maxWaitTime = 30000) {
    this.log(`Waiting for connection to establish (max ${maxWaitTime}ms)...`);
    
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.testConnectionStatus();
      
      if (status && status.connected) {
        this.log('Connection established successfully ✓', 'success');
        return true;
      }
      
      if (status && status.status === 'error') {
        this.log(`Connection failed with error: ${status.lastError}`, 'error');
        return false;
      }
      
      this.log(`Still waiting... Status: ${status?.status || 'unknown'}`, 'info');
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    this.log('Connection timeout reached', 'warning');
    return false;
  }

  async testDisconnection() {
    this.log(`Testing disconnection for session: ${TEST_SESSION}...`);
    
    const result = await this.makeRequest('POST', `/whatsapp/disconnect/${TEST_SESSION}`);
    
    if (result.success && result.data.success) {
      this.log('Session disconnected successfully ✓', 'success');
      return true;
    } else {
      this.log(`Disconnection failed: ${result.data?.message || result.error}`, 'error');
      return false;
    }
  }

  async runAllTests() {
    this.log('Starting comprehensive WhatsApp connection tests...', 'info');
    this.log(`Test session: ${TEST_SESSION}`, 'info');
    this.log(`Testing against: ${BASE_URL}`, 'info');
    
    const tests = [
      { name: 'Health Check', fn: () => this.testHealthCheck() },
      { name: 'QR Generation', fn: () => this.testQRGeneration() },
      { name: 'Connection Status', fn: () => this.testConnectionStatus() },
      { name: 'Diagnostics', fn: () => this.testDiagnostics() },
      { name: 'Phone Pairing', fn: () => this.testPhonePairing() },
      { name: 'Invalid Phone Handling', fn: () => this.testInvalidPhonePairing() },
      { name: 'Connections List', fn: () => this.testConnectionsList() },
      { name: 'Disconnection', fn: () => this.testDisconnection() }
    ];

    const results = {};
    let passedTests = 0;

    for (const test of tests) {
      this.log(`\\n--- Running: ${test.name} ---`, 'info');
      
      try {
        const result = await test.fn();
        results[test.name] = result;
        
        if (result) {
          passedTests++;
          this.log(`✓ ${test.name} PASSED`, 'success');
        } else {
          this.log(`✗ ${test.name} FAILED`, 'error');
        }
      } catch (error) {
        this.log(`✗ ${test.name} ERROR: ${error.message}`, 'error');
        results[test.name] = false;
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const totalTime = Date.now() - this.startTime;
    
    this.log('\\n=== TEST SUMMARY ===', 'info');
    this.log(`Total tests: ${tests.length}`, 'info');
    this.log(`Passed: ${passedTests}`, passedTests === tests.length ? 'success' : 'warning');
    this.log(`Failed: ${tests.length - passedTests}`, 'info');
    this.log(`Total time: ${totalTime}ms`, 'info');
    
    if (passedTests === tests.length) {
      this.log('\\n🎉 ALL TESTS PASSED!', 'success');
    } else {
      this.log('\\n⚠️  SOME TESTS FAILED', 'warning');
    }

    // Save detailed results
    const reportPath = `./test-results-${Date.now()}.json`;
    const report = {
      timestamp: new Date().toISOString(),
      testSession: TEST_SESSION,
      baseUrl: BASE_URL,
      summary: {
        total: tests.length,
        passed: passedTests,
        failed: tests.length - passedTests,
        duration: totalTime
      },
      results,
      logs: this.results
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`\\nDetailed report saved to: ${reportPath}`, 'info');

    return passedTests === tests.length;
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new WhatsAppConnectionTester();
  
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = WhatsAppConnectionTester;