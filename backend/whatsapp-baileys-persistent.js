const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { PrismaClient } = require('@prisma/client');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const openAIService = require('./openai-service');
const botConfigService = require('./bot-config-service');

// Initialize Prisma client
const prisma = new PrismaClient();

// Create sessions directory if it doesn't exist
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// Store active connections by session ID
const activeConnections = new Map();

class WhatsAppPersistentService {
  constructor() {
    this.greetingCooldowns = new Map();
    this.queueDelay = 8000; // 8 seconds delay
    this.messageQueues = new Map(); // Store queues per session
    this.reconnectTimers = new Map(); // Store reconnection timers
    this.shutdownGracefully = false;
    
    // Set up graceful shutdown handlers
    this.setupGracefulShutdown();
    
    console.log('[WhatsApp Persistent Service] Initialized with multi-tenant architecture');
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`[WhatsApp Persistent Service] Received ${signal}, performing graceful shutdown...`);
      this.shutdownGracefully = true;
      
      // Mark all active sessions as gracefully disconnected
      for (const [sessionId, connection] of activeConnections) {
        try {
          await this.updateSessionStatus(sessionId, 'DISCONNECTED', {});
          
          if (connection.sock) {
            connection.sock.end();
          }
        } catch (error) {
          console.error(`[WhatsApp Persistent Service] Error during graceful shutdown for session ${sessionId}:`, error);
        }
      }
      
      // Clear reconnection timers
      for (const timer of this.reconnectTimers.values()) {
        clearTimeout(timer);
      }
      
      console.log('[WhatsApp Persistent Service] Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }

  async initializeAllSessions() {
    try {
      console.log('[WhatsApp Persistent Service] Loading all sessions from database...');
      
      // Get all sessions that should auto-reconnect (using existing schema fields)
      const sessions = await prisma.whatsAppSession.findMany({
        where: {
          OR: [
            { status: 'CONNECTED' },
            { status: 'DISCONNECTED' }
          ]
        },
        include: {
          user: true
        }
      });

      console.log(`[WhatsApp Persistent Service] Found ${sessions.length} sessions to reconnect`);

      // Initialize each session with a delay to avoid overwhelming
      for (const [index, session] of sessions.entries()) {
        setTimeout(async () => {
          try {
            console.log(`[WhatsApp Persistent Service] Initializing session ${session.id} (${session.name})`);
            await this.initializeSession(session.id, session.userId);
          } catch (error) {
            console.error(`[WhatsApp Persistent Service] Failed to initialize session ${session.id}:`, error);
            await this.updateSessionStatus(session.id, 'ERROR', { lastError: error.message });
          }
        }, index * 2000); // 2 second delay between each session
      }

    } catch (error) {
      console.error('[WhatsApp Persistent Service] Error loading sessions from database:', error);
    }
  }

  getSessionPath(sessionId) {
    return path.join(sessionsDir, `session_${sessionId}`);
  }

  async createSession(userId, name = 'Default Session') {
    try {
      const session = await prisma.whatsAppSession.create({
        data: {
          userId,
          name,
          status: 'DISCONNECTED'
        }
      });

      // Create session directory
      const sessionPath = this.getSessionPath(session.id);
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      console.log(`[WhatsApp Persistent Service] Created new session ${session.id} for user ${userId}`);
      return session;
    } catch (error) {
      console.error('[WhatsApp Persistent Service] Error creating session:', error);
      throw error;
    }
  }

  async initializeSession(sessionId, userId = null) {
    try {
      console.log(`[WhatsApp Persistent Service] Initializing session: ${sessionId}`);
      
      // Get session from database
      let session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        include: { user: true }
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found in database`);
      }

      const sessionPath = this.getSessionPath(sessionId);
      
      // Ensure session directory exists
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      // Update session status to connecting
      await this.updateSessionStatus(sessionId, 'CONNECTING', {
        healthStatus: 'CONNECTING',
        lastError: null
      });

      // Load session data
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      
      // Disable history message processing for connection stability
      if (state.creds) {
        state.creds.processHistoryMsg = false;
      }
      
      // Get latest version
      const { version } = await fetchLatestBaileysVersion();
      console.log(`[WhatsApp Persistent Service] Using Baileys version: ${version} for session ${sessionId}`);
      
      // Create socket
      // Create silent logger
      const silentLogger = {
        level: 'silent',
        child: () => silentLogger,
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {}
      };
      
      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: silentLogger,
        browser: ["Baileys", "Chrome", "10.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async (key) => {
          return undefined;
        },
        patchMessageBeforeSending: (message) => {
          return message;
        },
        msgRetryCounterCache: {},
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        fireInitQueries: false,
        agent: undefined,
        fetchAgent: undefined,
        options: {
          agent: undefined
        }
      });

      // Store connection
      const connection = {
        sock,
        sessionId,
        userId: session.userId,
        qr: null,
        isConnected: false,
        connectionStatus: 'initializing',
        qrTimestamp: null,
        lastHeartbeat: Date.now(),
        messageQueue: [],
        processing: false
      };

      activeConnections.set(sessionId, connection);

      // Set up message queue for this session
      this.setupMessageQueue(sessionId);

      // Handle connection updates
      sock.ev.on('connection.update', async (update) => {
        try {
          await this.handleConnectionUpdate(sessionId, update);
        } catch (error) {
          console.error(`[WhatsApp Persistent Service] Error handling connection update for ${sessionId}:`, error);
        }
      });

      // Handle credentials update
      sock.ev.on('creds.update', saveCreds);

      // Handle messages
      sock.ev.on('messages.upsert', async (m) => {
        try {
          const message = m.messages[0];
          if (!message.key.fromMe && m.type === 'notify') {
            console.log(`[WhatsApp Persistent Service] New message received in session ${sessionId}`);
            await this.handleIncomingMessage(sessionId, message);
          }
        } catch (error) {
          console.error(`[WhatsApp Persistent Service] Error handling message in session ${sessionId}:`, error);
        }
      });

      // Set up heartbeat
      this.setupHeartbeat(sessionId);

      console.log(`[WhatsApp Persistent Service] Session ${sessionId} initialized successfully`);
      return connection;

    } catch (error) {
      console.error(`[WhatsApp Persistent Service] Error initializing session ${sessionId}:`, error);
      await this.updateSessionStatus(sessionId, 'ERROR', { 
        lastError: error.message,
        healthStatus: 'ERROR'
      });
      throw error;
    }
  }

  async handleConnectionUpdate(sessionId, update) {
    const { connection, lastDisconnect, qr } = update;
    const conn = activeConnections.get(sessionId);
    
    console.log(`[WhatsApp Persistent Service] Connection update for session ${sessionId}:`, {
      connection,
      hasQR: !!qr,
      hasDisconnect: !!lastDisconnect
    });

    if (qr) {
      console.log(`[WhatsApp Persistent Service] QR code received for session: ${sessionId}`);
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        
        if (conn) {
          conn.qr = qrDataUrl;
          conn.qrTimestamp = Date.now();
          conn.connectionStatus = 'qr_ready';
        }

        // Update database with QR code
        await this.updateSessionStatus(sessionId, 'QR_READY', {
          qrCode: qrDataUrl,
          healthStatus: 'QR_READY'
        });

      } catch (err) {
        console.error(`[WhatsApp Persistent Service] Error generating QR code for ${sessionId}:`, err);
      }
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`[WhatsApp Persistent Service] Connection closed for ${sessionId}. Should reconnect: ${shouldReconnect}`);
      
      if (conn) {
        conn.isConnected = false;
        conn.connectionStatus = 'disconnected';
        conn.qr = null;
        conn.qrTimestamp = null;
      }

      // Update database
      await this.updateSessionStatus(sessionId, 'DISCONNECTED', {});
      
      if (shouldReconnect && !this.shutdownGracefully) {
        // Auto-reconnect after 5 seconds
        console.log(`[WhatsApp Persistent Service] Scheduling reconnection for session ${sessionId}`);
        const timer = setTimeout(async () => {
          try {
            console.log(`[WhatsApp Persistent Service] Auto-reconnecting session ${sessionId}`);
            activeConnections.delete(sessionId);
            await this.initializeSession(sessionId);
          } catch (error) {
            console.error(`[WhatsApp Persistent Service] Auto-reconnection failed for ${sessionId}:`, error);
            await this.updateSessionStatus(sessionId, 'ERROR', { lastError: error.message });
          }
        }, 5000);
        
        this.reconnectTimers.set(sessionId, timer);
      } else if (!shouldReconnect) {
        console.log(`[WhatsApp Persistent Service] Permanently logged out for ${sessionId}, clearing session`);
        // Clear auth state for permanent logout
        const sessionPath = this.getSessionPath(sessionId);
        try {
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
        } catch (error) {
          console.error(`[WhatsApp Persistent Service] Error clearing auth state for ${sessionId}:`, error);
        }
        
        activeConnections.delete(sessionId);
      }
      
    } else if (connection === 'open') {
      console.log(`[WhatsApp Persistent Service] Connected successfully for session: ${sessionId}`);
      
      if (conn) {
        conn.isConnected = true;
        conn.connectionStatus = 'connected';
        conn.qr = null;
        conn.qrTimestamp = null;
        conn.lastHeartbeat = Date.now();
        
        // Get phone number info
        try {
          const userInfo = conn.sock.user;
          if (userInfo && userInfo.id) {
            const phoneNumber = userInfo.id.split(':')[0];
            console.log(`[WhatsApp Persistent Service] Phone number detected for ${sessionId}: ${phoneNumber}`);
            
            await this.updateSessionStatus(sessionId, 'CONNECTED', {
              phoneNumber,
              lastConnected: new Date()
            });
          }
        } catch (err) {
          console.log(`[WhatsApp Persistent Service] Could not detect phone number for ${sessionId}:`, err.message);
        }
      }
    } else if (connection === 'connecting') {
      console.log(`[WhatsApp Persistent Service] Connecting for session: ${sessionId}`);
      if (conn) {
        conn.connectionStatus = 'connecting';
      }
      
      await this.updateSessionStatus(sessionId, 'CONNECTING', {
        healthStatus: 'CONNECTING'
      });
    }
  }

  setupHeartbeat(sessionId) {
    const heartbeatInterval = setInterval(async () => {
      const conn = activeConnections.get(sessionId);
      if (!conn) {
        clearInterval(heartbeatInterval);
        return;
      }

      conn.lastHeartbeat = Date.now();
      
      if (conn.isConnected) {
        await this.updateSessionStatus(sessionId, 'CONNECTED', {
          lastConnected: new Date()
        });
      }
    }, 30000); // Update every 30 seconds
  }

  setupMessageQueue(sessionId) {
    if (this.messageQueues.has(sessionId)) {
      return; // Queue already exists
    }

    const processQueue = async () => {
      const conn = activeConnections.get(sessionId);
      if (!conn || !conn.isConnected || conn.processing) {
        return;
      }

      if (conn.messageQueue.length > 0) {
        conn.processing = true;
        const message = conn.messageQueue.shift();
        
        try {
          console.log(`[WhatsApp Persistent Service] Processing queued message for session ${sessionId}`);
          await conn.sock.sendMessage(message.to, message.content);
          console.log(`[WhatsApp Persistent Service] Message sent successfully for session ${sessionId}`);
        } catch (error) {
          console.error(`[WhatsApp Persistent Service] Error sending queued message for session ${sessionId}:`, error);
        } finally {
          conn.processing = false;
        }
      }
    };

    const queueInterval = setInterval(processQueue, this.queueDelay);
    this.messageQueues.set(sessionId, queueInterval);
  }

  async updateSessionStatus(sessionId, status, additionalData = {}) {
    try {
      // Only update fields that exist in the current schema
      const updateData = {
        status,
        updatedAt: new Date()
      };
      
      // Add existing fields only
      if (additionalData.phoneNumber) updateData.phoneNumber = additionalData.phoneNumber;
      if (additionalData.qrCode) updateData.qrCode = additionalData.qrCode;
      if (additionalData.lastConnected) updateData.lastConnected = additionalData.lastConnected;
      
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: updateData
      });
    } catch (error) {
      console.error(`[WhatsApp Persistent Service] Error updating session status for ${sessionId}:`, error);
    }
  }

  async getQRCode(sessionId, force = false) {
    try {
      console.log(`[WhatsApp Persistent Service] Getting QR code for session: ${sessionId} (force: ${force})`);
      
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // If force or disconnected, clear auth state and reconnect
      if (force || session.status === 'DISCONNECTED' || session.status === 'ERROR') {
        const sessionPath = this.getSessionPath(sessionId);
        try {
          if (fs.existsSync(sessionPath)) {
            console.log(`[WhatsApp Persistent Service] Clearing auth state for fresh start: ${sessionPath}`);
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
        } catch (error) {
          console.error(`[WhatsApp Persistent Service] Error clearing auth state:`, error);
        }
        
        // Remove existing connection
        activeConnections.delete(sessionId);
        
        // Clear any existing reconnection timer
        if (this.reconnectTimers.has(sessionId)) {
          clearTimeout(this.reconnectTimers.get(sessionId));
          this.reconnectTimers.delete(sessionId);
        }
      }

      // Check if QR is available and fresh
      const conn = activeConnections.get(sessionId);
      if (!force && conn && conn.qr && conn.qrTimestamp && (Date.now() - conn.qrTimestamp < 60000)) {
        console.log(`[WhatsApp Persistent Service] Returning cached QR for session: ${sessionId}`);
        return {
          success: true,
          qr: conn.qr,
          message: 'QR code retrieved from cache'
        };
      }

      // Initialize session if not exists or force refresh
      if (!conn || force) {
        await this.initializeSession(sessionId);
      }

      // Wait for QR code generation
      let attempts = 0;
      while (attempts < 30) {
        const connection = activeConnections.get(sessionId);
        if (connection && connection.qr) {
          console.log(`[WhatsApp Persistent Service] QR code ready for session: ${sessionId}`);
          return {
            success: true,
            qr: connection.qr,
            message: 'QR code generated successfully'
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      console.log(`[WhatsApp Persistent Service] QR generation timeout for session: ${sessionId}`);
      return {
        success: false,
        message: 'QR code generation timeout. Please try again.'
      };

    } catch (error) {
      console.error(`[WhatsApp Persistent Service] Error getting QR code for session ${sessionId}:`, error);
      await this.updateSessionStatus(sessionId, 'ERROR', { lastError: error.message });
      return {
        success: false,
        message: error.message
      };
    }
  }

  async getSessionStatus(sessionId) {
    try {
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        return {
          success: false,
          message: 'Session not found'
        };
      }

      const conn = activeConnections.get(sessionId);
      
      return {
        success: true,
        connected: conn ? conn.isConnected : false,
        status: session.status,
        phoneNumber: session.phoneNumber,
        lastConnected: session.lastConnected,
        message: 'Session status retrieved'
      };
    } catch (error) {
      console.error(`[WhatsApp Persistent Service] Error getting session status for ${sessionId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async sendMessage(sessionId, to, message) {
    try {
      const conn = activeConnections.get(sessionId);
      if (!conn) {
        return {
          success: false,
          message: 'Session not found or not initialized'
        };
      }

      if (!conn.isConnected) {
        return {
          success: false,
          message: 'WhatsApp not connected'
        };
      }

      // Add to queue for processing
      conn.messageQueue.push({
        to,
        content: { text: message }
      });

      console.log(`[WhatsApp Persistent Service] Message queued for session ${sessionId}`);
      return {
        success: true,
        message: 'Message queued for sending'
      };

    } catch (error) {
      console.error(`[WhatsApp Persistent Service] Error sending message for session ${sessionId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async disconnectSession(sessionId) {
    try {
      const conn = activeConnections.get(sessionId);
      if (conn && conn.sock) {
        conn.sock.end();
      }

      activeConnections.delete(sessionId);
      
      // Clear message queue
      if (this.messageQueues.has(sessionId)) {
        clearInterval(this.messageQueues.get(sessionId));
        this.messageQueues.delete(sessionId);
      }

      // Clear reconnection timer
      if (this.reconnectTimers.has(sessionId)) {
        clearTimeout(this.reconnectTimers.get(sessionId));
        this.reconnectTimers.delete(sessionId);
      }

      await this.updateSessionStatus(sessionId, 'DISCONNECTED', {
        disconnectedAt: new Date(),
        healthStatus: 'DISCONNECTED'
      });

      return {
        success: true,
        message: 'Session disconnected successfully'
      };
    } catch (error) {
      console.error(`[WhatsApp Persistent Service] Error disconnecting session ${sessionId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async getAllSessions(userId = null) {
    try {
      const where = userId ? { userId } : {};
      const sessions = await prisma.whatsAppSession.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          phoneNumber: true,
          lastConnected: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      // Add live connection status
      const sessionsWithLiveStatus = sessions.map(session => {
        const conn = activeConnections.get(session.id);
        return {
          ...session,
          isConnectedLive: conn ? conn.isConnected : false,
          connectionStatusLive: conn ? conn.connectionStatus : 'not_initialized'
        };
      });

      return {
        success: true,
        sessions: sessionsWithLiveStatus
      };
    } catch (error) {
      console.error('[WhatsApp Persistent Service] Error getting all sessions:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async handleIncomingMessage(sessionId, message) {
    // Implement message handling logic here
    // This is where you'd integrate with your bot logic
    console.log(`[WhatsApp Persistent Service] Handling incoming message for session ${sessionId}`);
  }
}

module.exports = new WhatsAppPersistentService();