const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Mock mode state file
const mockStateFile = path.join(__dirname, 'data', 'mock-mode-state.json');

class WhatsAppMockService {
  constructor() {
    this.mockMode = false;
    this.mockConnections = new Map();
    this.mockMessages = [];
    this.mockPhoneNumber = '+5511999887766';
    this.loadMockState();
    
    console.log('[WhatsApp Mock Service] Initialized');
  }

  // Mock mode state management
  enableMockMode() {
    this.mockMode = true;
    this.saveMockState();
    console.log('🧪 [MOCK MODE] WhatsApp Mock Mode ENABLED - All operations will be simulated');
    return {
      success: true,
      message: 'Mock mode enabled successfully',
      mockMode: true
    };
  }

  disableMockMode() {
    this.mockMode = false;
    this.mockConnections.clear();
    this.mockMessages = [];
    this.saveMockState();
    console.log('🔌 [MOCK MODE] WhatsApp Mock Mode DISABLED - Real operations will be used');
    return {
      success: true,
      message: 'Mock mode disabled successfully',
      mockMode: false
    };
  }

  isMockMode() {
    return this.mockMode;
  }

  getMockStatus() {
    return {
      success: true,
      mockMode: this.mockMode,
      activeConnections: this.mockConnections.size,
      messagesSent: this.mockMessages.length,
      mockPhoneNumber: this.mockPhoneNumber
    };
  }

  // Mock QR Code generation
  async generateMockQR(sessionId = 'default', force = false) {
    if (!this.mockMode) {
      return { success: false, message: 'Mock mode not enabled' };
    }

    console.log(`📱 [MOCK MODE] Generating mock QR code for session: ${sessionId} (force: ${force})`);

    try {
      // Generate a fake QR code with mock data
      const mockQRData = `mock-whatsapp-session:${sessionId}:${Date.now()}:development-mode`;
      
      const qrDataUrl = await QRCode.toDataURL(mockQRData, {
        width: 256,
        margin: 2,
        color: {
          dark: '#25D366',  // WhatsApp green
          light: '#FFFFFF'
        }
      });

      // Store mock connection
      this.mockConnections.set(sessionId, {
        sessionId,
        status: 'qr_ready',
        qr: qrDataUrl,
        timestamp: Date.now(),
        phoneNumber: null,
        connected: false
      });

      console.log(`✅ [MOCK MODE] Mock QR code generated successfully for session: ${sessionId}`);
      
      return {
        success: true,
        qr: qrDataUrl,
        message: 'Mock QR code generated successfully',
        mockMode: true,
        sessionId
      };
    } catch (error) {
      console.error('❌ [MOCK MODE] Error generating mock QR:', error);
      return {
        success: false,
        message: 'Failed to generate mock QR code'
      };
    }
  }

  // Mock connection simulation
  async simulateConnection(sessionId = 'default') {
    if (!this.mockMode) {
      return { success: false, message: 'Mock mode not enabled' };
    }

    console.log(`🔗 [MOCK MODE] Simulating WhatsApp connection for session: ${sessionId}`);

    const connection = this.mockConnections.get(sessionId);
    if (!connection) {
      return {
        success: false,
        message: 'No mock session found. Generate QR first.'
      };
    }

    // Simulate connection process
    connection.status = 'connecting';
    console.log(`⏳ [MOCK MODE] Connecting session: ${sessionId}...`);

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mark as connected
    connection.status = 'connected';
    connection.connected = true;
    connection.phoneNumber = this.mockPhoneNumber;
    connection.lastConnected = Date.now();
    connection.qr = null; // Clear QR on successful connection

    console.log(`✅ [MOCK MODE] Session ${sessionId} connected successfully with phone: ${this.mockPhoneNumber}`);

    return {
      success: true,
      connected: true,
      status: 'connected',
      phoneNumber: this.mockPhoneNumber,
      message: 'Mock WhatsApp connection established',
      mockMode: true,
      sessionId
    };
  }

  // Mock status check
  getMockConnectionStatus(sessionId = 'default') {
    if (!this.mockMode) {
      return {
        success: false,
        message: 'Mock mode not enabled',
        mockMode: false
      };
    }

    const connection = this.mockConnections.get(sessionId);
    
    console.log(`📊 [MOCK MODE] Checking status for session: ${sessionId}`);

    if (!connection) {
      return {
        success: true,
        connected: false,
        status: 'disconnected',
        message: 'No mock session found',
        phoneNumber: null,
        lastConnected: null,
        mockMode: true
      };
    }

    console.log(`📊 [MOCK MODE] Session ${sessionId} status: ${connection.status}, connected: ${connection.connected}`);

    return {
      success: true,
      connected: connection.connected,
      status: connection.status,
      message: connection.connected ? 'Mock WhatsApp connected' : 'Mock WhatsApp disconnected',
      phoneNumber: connection.phoneNumber,
      lastConnected: connection.lastConnected,
      mockMode: true,
      sessionId
    };
  }

  // Mock message sending
  async sendMockMessage(sessionId = 'default', to, message) {
    if (!this.mockMode) {
      return {
        success: false,
        message: 'Mock mode not enabled'
      };
    }

    const connection = this.mockConnections.get(sessionId);
    if (!connection || !connection.connected) {
      console.log(`❌ [MOCK MODE] Cannot send message: Session ${sessionId} not connected`);
      return {
        success: false,
        message: 'Mock WhatsApp not connected'
      };
    }

    const mockMessageId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const mockMessage = {
      id: mockMessageId,
      from: this.mockPhoneNumber,
      to: to,
      message: message,
      timestamp: Date.now(),
      sessionId: sessionId,
      status: 'sent'
    };

    this.mockMessages.push(mockMessage);

    console.log(`📤 [MOCK MODE] Message sent from ${this.mockPhoneNumber} to ${to}:`);
    console.log(`📤 [MOCK MODE] Message: "${message}"`);
    console.log(`📤 [MOCK MODE] Message ID: ${mockMessageId}`);

    return {
      success: true,
      messageId: mockMessageId,
      message: 'Mock message sent successfully',
      mockMode: true,
      details: {
        from: this.mockPhoneNumber,
        to: to,
        content: message,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Mock pairing code generation
  generateMockPairingCode(phoneNumber) {
    if (!this.mockMode) {
      return {
        success: false,
        message: 'Mock mode not enabled'
      };
    }

    const mockPairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    console.log(`📱 [MOCK MODE] Mock pairing code generated for ${phoneNumber}: ${mockPairingCode}`);
    console.log(`📱 [MOCK MODE] In real WhatsApp: Go to Settings > Linked Devices > Link Device and enter code`);

    return {
      success: true,
      pairingCode: mockPairingCode,
      phoneNumber: phoneNumber,
      message: 'Mock pairing code generated. This is a simulation for development.',
      mockMode: true,
      instructions: 'In real WhatsApp: Settings > Linked Devices > Link Device'
    };
  }

  // Mock pairing verification
  verifyMockPairingCode(sessionId, code) {
    if (!this.mockMode) {
      return {
        success: false,
        message: 'Mock mode not enabled'
      };
    }

    console.log(`✅ [MOCK MODE] Mock pairing code verified for session: ${sessionId}, code: ${code}`);
    console.log(`✅ [MOCK MODE] Simulating successful device pairing...`);

    // Auto-connect the session after verification
    this.mockConnections.set(sessionId, {
      sessionId,
      status: 'connected',
      connected: true,
      phoneNumber: this.mockPhoneNumber,
      timestamp: Date.now(),
      lastConnected: Date.now(),
      pairingMethod: 'code',
      qr: null
    });

    return {
      success: true,
      message: 'Mock pairing code verified successfully',
      sessionId: sessionId,
      mockMode: true,
      connected: true,
      phoneNumber: this.mockPhoneNumber
    };
  }

  // Mock disconnect
  disconnectMockSession(sessionId = 'default') {
    if (!this.mockMode) {
      return {
        success: false,
        message: 'Mock mode not enabled'
      };
    }

    console.log(`🔌 [MOCK MODE] Disconnecting mock session: ${sessionId}`);

    const connection = this.mockConnections.get(sessionId);
    if (connection) {
      connection.status = 'disconnected';
      connection.connected = false;
      connection.qr = null;
      console.log(`✅ [MOCK MODE] Session ${sessionId} disconnected successfully`);
    }

    return {
      success: true,
      message: 'Mock session disconnected successfully',
      mockMode: true,
      sessionId
    };
  }

  // Mock incoming message simulation
  simulateIncomingMessage(fromNumber, message, sessionId = 'default') {
    if (!this.mockMode) {
      return { success: false, message: 'Mock mode not enabled' };
    }

    const connection = this.mockConnections.get(sessionId);
    if (!connection || !connection.connected) {
      return { success: false, message: 'Mock session not connected' };
    }

    console.log(`📥 [MOCK MODE] Simulating incoming message from ${fromNumber}:`);
    console.log(`📥 [MOCK MODE] Message: "${message}"`);
    console.log(`📥 [MOCK MODE] Session: ${sessionId}`);

    const mockIncomingMessage = {
      id: `mock_incoming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from: fromNumber,
      to: this.mockPhoneNumber,
      message: message,
      timestamp: Date.now(),
      sessionId: sessionId,
      direction: 'incoming'
    };

    this.mockMessages.push(mockIncomingMessage);

    return {
      success: true,
      message: 'Mock incoming message simulated',
      mockMessage: mockIncomingMessage
    };
  }

  // Get all mock messages
  getMockMessages(sessionId = null) {
    if (!this.mockMode) {
      return { success: false, message: 'Mock mode not enabled' };
    }

    let messages = this.mockMessages;
    if (sessionId) {
      messages = messages.filter(msg => msg.sessionId === sessionId);
    }

    console.log(`📋 [MOCK MODE] Retrieved ${messages.length} mock messages`);

    return {
      success: true,
      messages: messages,
      total: messages.length,
      mockMode: true
    };
  }

  // Get all mock connections
  getMockConnections() {
    if (!this.mockMode) {
      return { success: false, message: 'Mock mode not enabled' };
    }

    const connections = Array.from(this.mockConnections.values());
    
    console.log(`🔗 [MOCK MODE] Retrieved ${connections.length} mock connections`);

    return {
      success: true,
      connections: connections,
      total: connections.length,
      mockMode: true
    };
  }

  // Persistence methods
  saveMockState() {
    try {
      const state = {
        mockMode: this.mockMode,
        connections: Array.from(this.mockConnections.entries()),
        messages: this.mockMessages,
        mockPhoneNumber: this.mockPhoneNumber,
        timestamp: Date.now()
      };

      // Ensure data directory exists
      const dataDir = path.dirname(mockStateFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      fs.writeFileSync(mockStateFile, JSON.stringify(state, null, 2));
      console.log(`💾 [MOCK MODE] State saved successfully`);
    } catch (error) {
      console.error('❌ [MOCK MODE] Error saving state:', error);
    }
  }

  loadMockState() {
    try {
      if (fs.existsSync(mockStateFile)) {
        const data = fs.readFileSync(mockStateFile, 'utf8');
        const state = JSON.parse(data);

        this.mockMode = state.mockMode || false;
        this.mockMessages = state.messages || [];
        this.mockPhoneNumber = state.mockPhoneNumber || '+5511999887766';

        // Restore connections
        if (state.connections) {
          this.mockConnections = new Map(state.connections);
        }

        console.log(`📁 [MOCK MODE] State loaded - Mock mode: ${this.mockMode}, Connections: ${this.mockConnections.size}, Messages: ${this.mockMessages.length}`);
      } else {
        console.log('📁 [MOCK MODE] No existing state file found, starting fresh');
      }
    } catch (error) {
      console.error('❌ [MOCK MODE] Error loading state:', error);
    }
  }

  // Clear all mock data
  clearMockData() {
    if (!this.mockMode) {
      return { success: false, message: 'Mock mode not enabled' };
    }

    this.mockConnections.clear();
    this.mockMessages = [];
    this.saveMockState();

    console.log('🧹 [MOCK MODE] All mock data cleared');

    return {
      success: true,
      message: 'All mock data cleared successfully',
      mockMode: true
    };
  }
}

// Create singleton instance
const whatsAppMockService = new WhatsAppMockService();

module.exports = whatsAppMockService;