const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const P = require('pino');
const { Boom } = require('@hapi/boom');
const { PrismaClient } = require('@prisma/client');
const openAIService = require('./openai-service');
const mediaService = require('./media-service');

const prisma = new PrismaClient();

// Enhanced logger with multiple levels
const createLogger = (level = 'info') => {
  return P({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  });
};

// Connection state management
class ConnectionState {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.status = 'disconnected';
    this.qrCode = null;
    this.qrTimestamp = null;
    this.connectionAttempts = 0;
    this.lastError = null;
    this.websocketEvents = [];
    this.authState = null;
    this.socket = null;
    this.isConnecting = false;
    this.reconnectTimer = null;
    this.connectionDiagnostics = {
      baileysVersion: null,
      browserInfo: null,
      lastConnectTime: null,
      lastDisconnectTime: null,
      totalReconnects: 0,
      avgConnectionTime: null
    };
  }

  addWebSocketEvent(event, data) {
    const timestamp = new Date().toISOString();
    this.websocketEvents.push({
      timestamp,
      event,
      data: JSON.stringify(data),
      status: this.status
    });
    
    // Keep only last 100 events to prevent memory issues
    if (this.websocketEvents.length > 100) {
      this.websocketEvents = this.websocketEvents.slice(-100);
    }
  }

  updateStatus(newStatus, error = null) {
    const previousStatus = this.status;
    this.status = newStatus;
    this.lastError = error;
    
    if (newStatus === 'connecting') {
      this.isConnecting = true;
      this.connectionDiagnostics.lastConnectTime = new Date();
    } else if (newStatus === 'connected') {
      this.isConnecting = false;
      this.connectionAttempts = 0;
    } else if (newStatus === 'disconnected') {
      this.isConnecting = false;
      this.connectionDiagnostics.lastDisconnectTime = new Date();
      if (previousStatus === 'connected') {
        this.connectionDiagnostics.totalReconnects++;
      }
    }
  }

  getDiagnostics() {
    return {
      sessionId: this.sessionId,
      status: this.status,
      connectionAttempts: this.connectionAttempts,
      isConnecting: this.isConnecting,
      lastError: this.lastError,
      qrTimestamp: this.qrTimestamp,
      recentEvents: this.websocketEvents.slice(-10),
      diagnostics: this.connectionDiagnostics
    };
  }
}

class EnhancedWhatsAppService {
  constructor() {
    this.logger = createLogger('debug');
    this.connections = new Map();
    this.sessionsDir = path.join(__dirname, 'enhanced_sessions');
    this.retryDelays = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
    
    this.ensureDirectories();
    this.logger.info('Enhanced WhatsApp Service initialized');
  }

  ensureDirectories() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
      this.logger.info(`Created sessions directory: ${this.sessionsDir}`);
    }
  }

  getSessionPath(sessionId) {
    return path.join(this.sessionsDir, `session_${sessionId}`);
  }

  // Enhanced connection with comprehensive configuration
  async createConnection(sessionId, options = {}) {
    const connectionState = new ConnectionState(sessionId);
    this.connections.set(sessionId, connectionState);
    
    const sessionPath = this.getSessionPath(sessionId);
    
    try {
      this.logger.info(`Creating connection for session ${sessionId}`);
      connectionState.updateStatus('connecting');

      // Ensure session directory exists
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
        this.logger.info(`Created session directory: ${sessionPath}`);
      }

      // Get auth state
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      connectionState.authState = state;
      
      // Optimize auth state for stability
      if (state.creds) {
        state.creds.processHistoryMsg = false;
        state.creds.syncFullHistory = false;
      }

      // Get Baileys version
      let version;
      try {
        const versionInfo = await fetchLatestBaileysVersion();
        version = versionInfo.version;
        connectionState.connectionDiagnostics.baileysVersion = version;
        this.logger.info(`Using Baileys version: ${version} for session ${sessionId}`);
      } catch (error) {
        this.logger.warn(`Failed to fetch Baileys version: ${error.message}`);
        version = [2, 3000, 1014044700]; // Fallback stable version
      }

      // Enhanced browser configuration
      const browser = options.browser || Browsers.macOS('Safari');
      connectionState.connectionDiagnostics.browserInfo = browser;

      // Enhanced makeWASocket configuration
      const socketConfig = {
        version,
        auth: state,
        printQRInTerminal: false,
        logger: createLogger('error'), // Reduce noise but catch errors
        browser,
        
        // Connection stability settings
        connectTimeoutMs: options.connectTimeout || 90000, // 90 seconds
        defaultQueryTimeoutMs: options.queryTimeout || 60000,
        keepAliveIntervalMs: options.keepAlive || 30000,
        
        // Retry and recovery settings
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 3,
        
        // Performance optimizations
        syncFullHistory: false,
        markOnlineOnConnect: true,
        fireInitQueries: true,
        emitOwnEvents: true,
        generateHighQualityLinkPreview: false,
        
        // Message handling
        getMessage: async (key) => {
          // Return empty object for missing messages to avoid crashes
          return { conversation: '' };
        },

        // WebSocket configuration
        options: {
          agent: undefined
        },
        
        // Enhanced error handling
        shouldIgnoreJid: (jid) => false,
        
        // Message retry cache
        msgRetryCounterCache: new Map(),
        
        // Custom patch function
        patchMessageBeforeSending: (message, recipientJids) => {
          // Add any message preprocessing here
          return message;
        }
      };

      // Create socket with enhanced configuration
      const socket = makeWASocket(socketConfig);
      connectionState.socket = socket;

      // Enhanced event handling
      this.setupEventHandlers(socket, connectionState, saveCreds);

      return {
        socket,
        connectionState,
        sessionPath
      };

    } catch (error) {
      this.logger.error(`Failed to create connection for session ${sessionId}:`, error);
      connectionState.updateStatus('error', error.message);
      throw error;
    }
  }

  setupEventHandlers(socket, connectionState, saveCreds) {
    const { sessionId } = connectionState;
    
    // Connection state updates
    socket.ev.on('connection.update', async (update) => {
      connectionState.addWebSocketEvent('connection.update', update);
      await this.handleConnectionUpdate(connectionState, update);
    });

    // Credential updates
    socket.ev.on('creds.update', () => {
      connectionState.addWebSocketEvent('creds.update', {});
      saveCreds().catch(err => {
        this.logger.error(`Failed to save credentials for ${sessionId}:`, err);
      });
    });

    // Message events
    socket.ev.on('messages.upsert', (messageInfo) => {
      connectionState.addWebSocketEvent('messages.upsert', { 
        count: messageInfo.messages?.length || 0,
        type: messageInfo.type 
      });
      this.handleMessages(connectionState, messageInfo).catch(error => 
        this.logger.error(`Error in handleMessages for ${connectionState.sessionId}:`, error)
      );
    });

    // Presence updates
    socket.ev.on('presence.update', (presenceData) => {
      connectionState.addWebSocketEvent('presence.update', presenceData);
    });

    // Contact updates
    socket.ev.on('contacts.upsert', (contacts) => {
      connectionState.addWebSocketEvent('contacts.upsert', { 
        count: contacts?.length || 0 
      });
    });

    // Chat updates
    socket.ev.on('chats.upsert', (chats) => {
      connectionState.addWebSocketEvent('chats.upsert', { 
        count: chats?.length || 0 
      });
    });

    // WebSocket close events
    socket.ws?.on?.('close', (code, reason) => {
      connectionState.addWebSocketEvent('websocket.close', { code, reason: reason?.toString() });
      this.logger.warn(`WebSocket closed for ${sessionId} - Code: ${code}, Reason: ${reason}`);
    });

    // WebSocket error events
    socket.ws?.on?.('error', (error) => {
      connectionState.addWebSocketEvent('websocket.error', { error: error.message });
      this.logger.error(`WebSocket error for ${sessionId}:`, error);
    });
  }

  async handleConnectionUpdate(connectionState, update) {
    const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;
    const { sessionId } = connectionState;

    this.logger.info(`Connection update for ${sessionId}:`, {
      connection,
      hasQR: !!qr,
      hasDisconnect: !!lastDisconnect,
      receivedPendingNotifications
    });

    // Handle QR code
    if (qr) {
      await this.handleQRCode(connectionState, qr);
    }

    // Handle connection states
    switch (connection) {
      case 'connecting':
        connectionState.updateStatus('connecting');
        this.logger.info(`Session ${sessionId} is connecting...`);
        break;

      case 'open':
        connectionState.updateStatus('connected');
        this.logger.info(`Session ${sessionId} connected successfully!`);
        
        // Get phone number if available
        const phoneNumber = connectionState.socket?.user?.id?.split(':')[0];
        if (phoneNumber) {
          this.logger.info(`Phone number for ${sessionId}: ${phoneNumber}`);
        }
        break;

      case 'close':
        await this.handleConnectionClose(connectionState, lastDisconnect);
        break;
    }
  }

  async handleQRCode(connectionState, qr) {
    try {
      const qrDataUrl = await QRCode.toDataURL(qr, {
        width: 512,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
      
      connectionState.qrCode = qrDataUrl;
      connectionState.qrTimestamp = Date.now();
      connectionState.updateStatus('qr_ready');
      
      this.logger.info(`QR code generated for session ${connectionState.sessionId}`);
      
    } catch (error) {
      this.logger.error(`Failed to generate QR code for ${connectionState.sessionId}:`, error);
      connectionState.updateStatus('error', `QR generation failed: ${error.message}`);
    }
  }

  async handleConnectionClose(connectionState, lastDisconnect) {
    const { sessionId } = connectionState;
    connectionState.updateStatus('disconnected');

    // Analyze disconnect reason
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const errorMessage = lastDisconnect?.error?.message;
    
    this.logger.warn(`Connection closed for ${sessionId}`, {
      statusCode,
      errorMessage,
      shouldReconnect: statusCode !== DisconnectReason.loggedOut
    });

    // Determine if we should reconnect
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
    
    if (shouldReconnect && connectionState.connectionAttempts < 10) {
      await this.scheduleReconnect(connectionState);
    } else {
      if (statusCode === DisconnectReason.loggedOut) {
        this.logger.info(`Session ${sessionId} logged out, clearing auth state`);
        await this.clearAuthState(sessionId);
      } else {
        this.logger.error(`Max reconnection attempts reached for ${sessionId}`);
      }
    }
  }

  async scheduleReconnect(connectionState) {
    const { sessionId, connectionAttempts } = connectionState;
    
    // Clear any existing reconnection timer
    if (connectionState.reconnectTimer) {
      clearTimeout(connectionState.reconnectTimer);
    }

    // Calculate delay with exponential backoff
    const delayIndex = Math.min(connectionAttempts, this.retryDelays.length - 1);
    const delay = this.retryDelays[delayIndex];
    
    this.logger.info(`Scheduling reconnection for ${sessionId} in ${delay}ms (attempt ${connectionAttempts + 1})`);
    
    connectionState.reconnectTimer = setTimeout(async () => {
      try {
        connectionState.connectionAttempts++;
        await this.reconnectSession(sessionId);
      } catch (error) {
        this.logger.error(`Reconnection failed for ${sessionId}:`, error);
        connectionState.updateStatus('error', error.message);
      }
    }, delay);
  }

  async reconnectSession(sessionId) {
    const connectionState = this.connections.get(sessionId);
    if (!connectionState) {
      throw new Error(`No connection state found for session ${sessionId}`);
    }

    this.logger.info(`Reconnecting session ${sessionId}...`);
    
    // Close existing socket if it exists
    if (connectionState.socket) {
      try {
        connectionState.socket.end();
      } catch (error) {
        this.logger.warn(`Error closing existing socket for ${sessionId}:`, error);
      }
    }

    // Create new connection
    await this.createConnection(sessionId);
  }

  async clearAuthState(sessionId) {
    const sessionPath = this.getSessionPath(sessionId);
    
    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        this.logger.info(`Cleared auth state for session ${sessionId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to clear auth state for ${sessionId}:`, error);
    }
  }

  async handleMessages(connectionState, messageInfo) {
    const { sessionId } = connectionState;
    const messages = messageInfo.messages || [];
    
    for (const message of messages) {
      if (!message.key.fromMe && messageInfo.type === 'notify') {
        const phoneNumber = message.key.remoteJid.replace('@s.whatsapp.net', '');
        this.logger.info(`New message received in session ${sessionId} from ${phoneNumber}`);
        
        // Check if contact is excluded
        const isExcluded = await this.checkExcludedContact(phoneNumber);
        if (isExcluded) {
          this.logger.info(`Message from ${phoneNumber} ignored - contact is excluded`);
          continue;
        }
        
        let messageText = '';
        let mediaProcessingResult = null;
        
        // Check for media messages (audio or image)
        if (mediaService.hasMediaMessage(message.message)) {
          const mediaType = mediaService.getMediaType(message.message);
          this.logger.info(`Processing ${mediaType} message from ${phoneNumber}`);
          
          // Check if media processing is enabled for this user
          const userId = 'test-user-id'; // In production, map sessionId to userId
          const mediaEnabled = await this.checkMediaProcessingEnabled(userId, mediaType);
          
          if (!mediaEnabled) {
            this.logger.info(`${mediaType} processing disabled for user ${userId}`);
            messageText = mediaType === 'audio' 
              ? 'Recebi seu áudio! Por favor, envie sua mensagem como texto para que eu possa ajudá-lo melhor.'
              : 'Recebi sua imagem! Por favor, descreva o que você gostaria de saber para que eu possa ajudá-lo.';
          } else {
            try {
              // Process media (transcribe audio or analyze image)
              mediaProcessingResult = await mediaService.processMediaMessage(message.message);
              
              if (mediaProcessingResult.success) {
                messageText = mediaProcessingResult.processedText;
                this.logger.info(`${mediaType} processed successfully: "${messageText.substring(0, 100)}..."`);
                
                // Add context about the media type for AI
                if (mediaType === 'audio') {
                  messageText = `[Mensagem de áudio transcrita]: ${messageText}`;
                } else if (mediaType === 'image') {
                  messageText = `[Imagem analisada]: ${messageText}`;
                }
              } else {
                this.logger.error(`Failed to process ${mediaType} from ${phoneNumber}: ${mediaProcessingResult.error}`);
                messageText = mediaType === 'audio' 
                  ? 'Recebi seu áudio, mas não consegui transcrevê-lo. Poderia enviar como texto?'
                  : 'Recebi sua imagem, mas não consegui analisá-la. Poderia descrever o que você gostaria de saber?';
              }
            } catch (error) {
              this.logger.error(`Error processing ${mediaType} from ${phoneNumber}:`, error);
              messageText = 'Desculpe, tive um problema para processar sua mensagem. Poderia tentar novamente?';
            }
          }
        } else {
          // Extract regular text message
          messageText = this.extractMessageText(message);
        }
        
        // Skip if no content found
        if (!messageText) {
          this.logger.info(`No processable content found in message from ${phoneNumber}`);
          continue;
        }
        
        this.logger.info(`Processing message: "${messageText.substring(0, 150)}..." from ${phoneNumber}`);
        
        // Generate AI response
        try {
          const userId = 'test-user-id'; // In production, map sessionId to userId
          const aiResponse = await openAIService.generateResponse(messageText, null, 'gpt-4o-mini', userId);
          
          if (aiResponse.success && aiResponse.response) {
            // Send response back
            await this.sendMessage(connectionState, message.key.remoteJid, aiResponse.response);
            this.logger.info(`AI response sent to ${phoneNumber}: "${aiResponse.response}"`);
          } else {
            this.logger.error(`Failed to generate AI response for ${phoneNumber}: ${aiResponse.error}`);
            // Send fallback message for media processing failures
            if (mediaProcessingResult && !mediaProcessingResult.success) {
              await this.sendMessage(connectionState, message.key.remoteJid, messageText);
            }
          }
        } catch (error) {
          this.logger.error(`Error processing message from ${phoneNumber}:`, error);
          // Send fallback message if AI fails
          if (mediaProcessingResult && !mediaProcessingResult.success) {
            try {
              await this.sendMessage(connectionState, message.key.remoteJid, messageText);
            } catch (sendError) {
              this.logger.error(`Failed to send fallback message to ${phoneNumber}:`, sendError);
            }
          }
        }
      }
    }
  }

  async checkExcludedContact(phoneNumber, userId = 'test-user-id') {
    try {
      const excludedContact = await prisma.excludedContact.findFirst({
        where: {
          userId,
          phoneNumber,
          isActive: true
        }
      });
      
      return !!excludedContact;
    } catch (error) {
      this.logger.error('Error checking excluded contacts:', error);
      return false; // Don't exclude on error, better to respond than miss valid messages
    }
  }

  async checkMediaProcessingEnabled(userId, mediaType) {
    try {
      const botConfig = await prisma.botConfig.findUnique({
        where: { userId }
      });
      
      if (!botConfig) {
        return true; // Default to enabled if no config found
      }
      
      if (mediaType === 'audio') {
        return botConfig.audioProcessing !== false;
      } else if (mediaType === 'image') {
        return botConfig.imageProcessing !== false;
      }
      
      return true;
    } catch (error) {
      this.logger.error('Error checking media processing settings:', error);
      return true; // Default to enabled on error
    }
  }

  extractMessageText(message) {
    // Handle different message types
    if (message.message) {
      if (message.message.conversation) {
        return message.message.conversation;
      }
      
      if (message.message.extendedTextMessage && message.message.extendedTextMessage.text) {
        return message.message.extendedTextMessage.text;
      }
      
      if (message.message.imageMessage && message.message.imageMessage.caption) {
        return message.message.imageMessage.caption;
      }
      
      if (message.message.videoMessage && message.message.videoMessage.caption) {
        return message.message.videoMessage.caption;
      }
      
      if (message.message.documentMessage && message.message.documentMessage.caption) {
        return message.message.documentMessage.caption;
      }
    }
    
    return null;
  }

  async sendMessage(connectionState, jid, text) {
    try {
      if (connectionState.socket && connectionState.status === 'connected') {
        await connectionState.socket.sendMessage(jid, { text });
        return true;
      } else {
        this.logger.warn(`Cannot send message - socket not connected (status: ${connectionState.status})`);
        return false;
      }
    } catch (error) {
      this.logger.error('Error sending message:', error);
      return false;
    }
  }

  // Public API methods
  async getQRCode(sessionId, force = false) {
    try {
      let connectionState = this.connections.get(sessionId);
      
      if (!connectionState || force) {
        this.logger.info(`Creating new connection for QR code - session ${sessionId}`);
        await this.createConnection(sessionId);
        connectionState = this.connections.get(sessionId);
      }

      // Wait for QR code with timeout
      const maxWaitTime = 60000; // 60 seconds
      const checkInterval = 500; // 0.5 seconds
      let elapsed = 0;

      while (elapsed < maxWaitTime) {
        if (connectionState.qrCode && connectionState.status === 'qr_ready') {
          return {
            success: true,
            qr: connectionState.qrCode,
            message: 'QR code generated successfully',
            timestamp: connectionState.qrTimestamp
          };
        }

        if (connectionState.status === 'connected') {
          return {
            success: false,
            message: 'Already connected, QR code not needed'
          };
        }

        if (connectionState.status === 'error') {
          return {
            success: false,
            message: `Connection error: ${connectionState.lastError}`
          };
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
        elapsed += checkInterval;
      }

      return {
        success: false,
        message: 'QR code generation timeout'
      };

    } catch (error) {
      this.logger.error(`Error getting QR code for ${sessionId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async getConnectionStatus(sessionId) {
    const connectionState = this.connections.get(sessionId);
    
    if (!connectionState) {
      return {
        success: false,
        message: 'Session not found'
      };
    }

    const phoneNumber = connectionState.socket?.user?.id?.split(':')[0];
    
    return {
      success: true,
      status: connectionState.status,
      connected: connectionState.status === 'connected',
      phoneNumber,
      connectionAttempts: connectionState.connectionAttempts,
      lastError: connectionState.lastError,
      qrTimestamp: connectionState.qrTimestamp
    };
  }

  async getDiagnostics(sessionId) {
    const connectionState = this.connections.get(sessionId);
    
    if (!connectionState) {
      return {
        success: false,
        message: 'Session not found'
      };
    }

    return {
      success: true,
      diagnostics: connectionState.getDiagnostics()
    };
  }

  async generatePairingCode(phoneNumber) {
    try {
      // Create temporary session for pairing
      const tempSessionId = `pairing_${Date.now()}`;
      const sessionPath = this.getSessionPath(tempSessionId);
      
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      const { state } = await useMultiFileAuthState(sessionPath);
      const version = (await fetchLatestBaileysVersion()).version;

      return new Promise((resolve, reject) => {
        const socket = makeWASocket({
          version,
          auth: state,
          printQRInTerminal: false,
          logger: createLogger('error'),
          browser: Browsers.macOS('Safari'),
          generateHighQualityLinkPreview: false,
          connectTimeoutMs: 60000,
          defaultQueryTimeoutMs: 60000,
          keepAliveIntervalMs: 30000,
          retryRequestDelayMs: 1000,
          markOnlineOnConnect: false,
          syncFullHistory: false
        });

        // Handle connection events
        socket.ev.on('connection.update', (update) => {
          const { connection, lastDisconnect } = update;
          
          if (connection === 'open') {
            // Connection is open, now request pairing code
            socket.requestPairingCode(phoneNumber)
              .then(pairingCode => {
                // Clean up and resolve
                socket.end();
                setTimeout(() => {
                  try {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                  } catch (error) {
                    this.logger.warn(`Failed to clean up temporary session ${tempSessionId}`);
                  }
                }, 1000);

                resolve({
                  success: true,
                  pairingCode,
                  phoneNumber,
                  message: 'Pairing code generated successfully. Enter this code in WhatsApp Settings > Linked Devices > Link a Device > Link with phone number instead.'
                });
              })
              .catch(error => {
                socket.end();
                setTimeout(() => {
                  try {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                  } catch (error) {
                    this.logger.warn(`Failed to clean up temporary session ${tempSessionId}`);
                  }
                }, 1000);
                reject(error);
              });
          } else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (!shouldReconnect) {
              socket.end();
              setTimeout(() => {
                try {
                  fs.rmSync(sessionPath, { recursive: true, force: true });
                } catch (error) {
                  this.logger.warn(`Failed to clean up temporary session ${tempSessionId}`);
                }
              }, 1000);
              reject(new Error('Connection failed during pairing'));
            }
          }
        });

        // Set timeout for the whole operation
        setTimeout(() => {
          socket.end();
          setTimeout(() => {
            try {
              fs.rmSync(sessionPath, { recursive: true, force: true });
            } catch (error) {
              this.logger.warn(`Failed to clean up temporary session ${tempSessionId}`);
            }
          }, 1000);
          reject(new Error('Pairing code request timeout'));
        }, 30000);
      });

    } catch (error) {
      this.logger.error('Error generating pairing code:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async disconnectSession(sessionId) {
    const connectionState = this.connections.get(sessionId);
    
    if (!connectionState) {
      return {
        success: false,
        message: 'Session not found'
      };
    }

    try {
      if (connectionState.reconnectTimer) {
        clearTimeout(connectionState.reconnectTimer);
      }

      if (connectionState.socket) {
        connectionState.socket.end();
      }

      connectionState.updateStatus('disconnected');
      this.connections.delete(sessionId);

      return {
        success: true,
        message: 'Session disconnected successfully'
      };

    } catch (error) {
      this.logger.error(`Error disconnecting session ${sessionId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  getAllConnections() {
    const connections = [];
    
    for (const [sessionId, connectionState] of this.connections) {
      connections.push({
        sessionId,
        status: connectionState.status,
        connected: connectionState.status === 'connected',
        connectionAttempts: connectionState.connectionAttempts,
        lastError: connectionState.lastError,
        qrTimestamp: connectionState.qrTimestamp,
        phoneNumber: connectionState.socket?.user?.id?.split(':')[0]
      });
    }

    return {
      success: true,
      connections,
      totalConnections: connections.length,
      connectedSessions: connections.filter(c => c.connected).length
    };
  }
}

module.exports = new EnhancedWhatsAppService();