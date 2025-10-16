const axios = require('axios');

const BASE_URL = 'http://localhost:3333/api';

class WhatsAppPersistentTester {
  constructor() {
    this.authToken = null;
  }

  async login() {
    try {
      const response = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'admin@teste.com',
        password: 'admin123'
      });

      if (response.data.success) {
        this.authToken = response.data.data.tokens.accessToken;
        console.log('✅ Login successful');
        return true;
      }
    } catch (error) {
      console.error('❌ Login failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testCreateSession(name) {
    try {
      console.log(`\n🔄 Creating session: ${name}`);
      
      const response = await axios.post(`${BASE_URL}/whatsapp/sessions`, {
        name: name
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        console.log(`✅ Session created: ${response.data.session.id}`);
        return response.data.session.id;
      }
    } catch (error) {
      console.error('❌ Session creation failed:', error.response?.data || error.message);
      return null;
    }
  }

  async testGetQR(sessionId) {
    try {
      console.log(`\n🔄 Getting QR code for session: ${sessionId}`);
      
      const response = await axios.get(`${BASE_URL}/whatsapp/sessions/${sessionId}/qr?force=true`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        console.log(`✅ QR code generated (${response.data.qr.length} chars)`);
        return true;
      }
    } catch (error) {
      console.error('❌ QR generation failed:', error.response?.data || error.message);
      return false;
    }
  }

  async testSessionStatus(sessionId) {
    try {
      console.log(`\n🔄 Checking status for session: ${sessionId}`);
      
      const response = await axios.get(`${BASE_URL}/whatsapp/sessions/${sessionId}/status`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        console.log(`✅ Session status: ${response.data.status} (Health: ${response.data.healthStatus})`);
        return response.data;
      }
    } catch (error) {
      console.error('❌ Status check failed:', error.response?.data || error.message);
      return null;
    }
  }

  async testGetAllSessions() {
    try {
      console.log(`\n🔄 Getting all sessions...`);
      
      const response = await axios.get(`${BASE_URL}/whatsapp/sessions`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        console.log(`✅ Found ${response.data.sessions.length} sessions`);
        response.data.sessions.forEach(session => {
          console.log(`   📱 ${session.name} (${session.id}) - Status: ${session.status}`);
        });
        return response.data.sessions;
      }
    } catch (error) {
      console.error('❌ Get sessions failed:', error.response?.data || error.message);
      return [];
    }
  }

  async testDashboard() {
    try {
      console.log(`\n🔄 Getting dashboard data...`);
      
      const response = await axios.get(`${BASE_URL}/whatsapp/dashboard`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        console.log(`✅ Dashboard stats:`, response.data.stats);
        return response.data;
      }
    } catch (error) {
      console.error('❌ Dashboard failed:', error.response?.data || error.message);
      return null;
    }
  }

  async testAdminStats() {
    try {
      console.log(`\n🔄 Getting admin stats...`);
      
      const response = await axios.get(`${BASE_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        console.log(`✅ System stats:`, {
          users: response.data.stats.totalUsers,
          sessions: response.data.stats.totalSessions,
          active: response.data.stats.activeSessions,
          uptime: Math.floor(response.data.stats.systemUptime / 60) + ' minutes'
        });
        return response.data;
      }
    } catch (error) {
      console.error('❌ Admin stats failed:', error.response?.data || error.message);
      return null;
    }
  }

  async testReconnect(sessionId) {
    try {
      console.log(`\n🔄 Testing reconnect for session: ${sessionId}`);
      
      const response = await axios.post(`${BASE_URL}/whatsapp/sessions/${sessionId}/reconnect`, {}, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        console.log(`✅ Reconnection initiated`);
        return true;
      }
    } catch (error) {
      console.error('❌ Reconnect failed:', error.response?.data || error.message);
      return false;
    }
  }

  async runFullTest() {
    console.log('🚀 Starting WhatsApp Persistent Sessions Test');
    console.log('='.repeat(50));

    // Step 1: Login
    const loginSuccess = await this.login();
    if (!loginSuccess) {
      console.log('❌ Test failed at login step');
      return;
    }

    // Step 2: Create multiple sessions
    const session1Id = await this.testCreateSession('Restaurant A');
    const session2Id = await this.testCreateSession('Restaurant B');
    
    if (!session1Id || !session2Id) {
      console.log('❌ Test failed at session creation step');
      return;
    }

    // Step 3: Get all sessions
    await this.testGetAllSessions();

    // Step 4: Test QR generation for each session
    await this.testGetQR(session1Id);
    await this.testGetQR(session2Id);

    // Step 5: Check session statuses
    await this.testSessionStatus(session1Id);
    await this.testSessionStatus(session2Id);

    // Step 6: Test dashboard
    await this.testDashboard();

    // Step 7: Test admin stats
    await this.testAdminStats();

    // Step 8: Test reconnection
    await this.testReconnect(session1Id);

    // Wait a moment for reconnection
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 9: Check status after reconnection
    await this.testSessionStatus(session1Id);

    console.log('\n' + '='.repeat(50));
    console.log('✅ Multi-tenant persistent sessions test completed!');
    console.log('🔄 Try restarting the server to test persistence');
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    if (response.data.status === 'ok') {
      console.log('✅ Server is running');
      return true;
    }
  } catch (error) {
    console.log('❌ Server is not running. Please start with: node server-persistent.js');
    return false;
  }
}

// Run the test
async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    return;
  }

  const tester = new WhatsAppPersistentTester();
  await tester.runFullTest();
}

main().catch(console.error);