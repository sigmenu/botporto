const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const P = require('pino');
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
    this.client = null;
    this.isConnecting = false;
    this.reconnectTimer = null;
    this.connectionDiagnostics = {
      lastConnectTime: null,
      lastDisconnectTime: null,
      totalReconnects: 0,
      avgConnectionTime: null
    };
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
      qrCode: this.qrCode,
      qrTimestamp: this.qrTimestamp,
      diagnostics: this.connectionDiagnostics
    };
  }

  cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}

class WhatsAppManager {
  constructor() {
    this.sessions = new Map();
    this.logger = createLogger('info');
    this.excludedContacts = new Map();
    this.initializationQueue = new Map();
    this.messageQueues = new Map(); // 8-second message queue system
    this.greetingCooldowns = new Map();
    this.storedQRCodes = new Map(); // Store QR codes for each session
  }

  async createSession(userId, sessionId = null) {
    try {
      const effectiveSessionId = sessionId || `session-${userId}`;
      
      // Check if already initializing
      if (this.initializationQueue.has(effectiveSessionId)) {
        this.logger.info(`Session ${effectiveSessionId} is already being initialized`);
        return await this.initializationQueue.get(effectiveSessionId);
      }

      // Check if already exists
      if (this.sessions.has(effectiveSessionId)) {
        const existingState = this.sessions.get(effectiveSessionId);
        if (existingState.status === 'connected' || existingState.status === 'connecting') {
          this.logger.info(`Session ${effectiveSessionId} already exists with status: ${existingState.status}`);
          return {
            success: true,
            sessionId: effectiveSessionId,
            status: existingState.status,
            qrCode: existingState.qrCode
          };
        }
      }

      // Create initialization promise
      const initPromise = this._initializeSession(userId, effectiveSessionId);
      this.initializationQueue.set(effectiveSessionId, initPromise);

      try {
        const result = await initPromise;
        return result;
      } finally {
        this.initializationQueue.delete(effectiveSessionId);
      }
    } catch (error) {
      this.logger.error(`Error creating session for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  async _initializeSession(userId, sessionId) {
    try {
      this.logger.info(`🚀 Initializing WhatsApp session: ${sessionId}`);
      
      // Clean up existing session if any
      if (this.sessions.has(sessionId)) {
        const existingState = this.sessions.get(sessionId);
        existingState.cleanup();
        this.sessions.delete(sessionId);
      }

      const connectionState = new ConnectionState(sessionId);
      this.sessions.set(sessionId, connectionState);

      // Create sessions directory if it doesn't exist
      const sessionsPath = path.join(__dirname, 'sessions');
      if (!fs.existsSync(sessionsPath)) {
        fs.mkdirSync(sessionsPath, { recursive: true });
      }

      // Initialize WhatsApp Web client with minimal stable configuration
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: sessionsPath
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
          ]
        },
        qrMaxRetries: 5,
        restartOnAuthFail: true,
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        }
      });

      connectionState.client = client;
      connectionState.updateStatus('connecting');

      // QR Code event with improved storage
      client.on('qr', async (qr) => {
        try {
          console.log('QR STRING:', qr);
          this.logger.info('📱 QR Code received');
          
          // Generate QR code as data URL
          const qrDataUrl = await QRCode.toDataURL(qr);
          connectionState.qrCode = qrDataUrl;
          connectionState.qrTimestamp = new Date();
          
          // Store QR for endpoint access
          this.storedQRCodes.set(sessionId, qrDataUrl);
          console.log('QR stored, length:', qrDataUrl?.length);
          
          // Also display in terminal for debugging
          qrcodeTerminal.generate(qr, { small: true });
          
          this.logger.info('✅ QR Code generated successfully');
        } catch (error) {
          this.logger.error(`❌ Error generating QR code: ${error.message}`);
        }
      });

      // Ready event - fully authenticated
      client.on('ready', async () => {
        try {
          console.log('CLIENT READY');
          this.logger.info('✅ WhatsApp client is ready!');
          connectionState.updateStatus('connected');
          connectionState.qrCode = null; // Clear QR code once connected
          this.storedQRCodes.delete(sessionId); // Clear stored QR
          
          // Get WhatsApp info
          const info = client.info;
          if (info) {
            this.logger.info(`📱 Connected as: ${info.pushname} (${info.wid.user})`);
          }

          // Load excluded contacts for this user
          await this.loadExcludedContacts(userId);
        } catch (error) {
          this.logger.error(`Error in ready event: ${error.message}`);
        }
      });

      // Authentication events
      client.on('authenticated', () => {
        console.log('AUTHENTICATED');
        this.logger.info('🔐 Client authenticated successfully');
        connectionState.qrCode = null;
        this.storedQRCodes.delete(sessionId); // Clear QR after auth
      });

      client.on('auth_failure', (message) => {
        console.error('AUTH FAILED:', message);
        this.logger.error(`❌ Authentication failure: ${message}`);
        connectionState.updateStatus('auth_failed', message);
      });

      // Disconnection event
      client.on('disconnected', (reason) => {
        this.logger.warn(`⚠️ Client disconnected: ${reason}`);
        connectionState.updateStatus('disconnected', reason);
        
        // Cleanup QR code and reset state
        connectionState.qrCode = null;
        
        // Auto-reconnect logic only for certain disconnect reasons
        const shouldReconnect = ['NAVIGATION', 'LOGOUT'];
        if (shouldReconnect.includes(reason) && connectionState.connectionAttempts < 5) {
          connectionState.connectionAttempts++;
          this.logger.info(`🔄 Attempting reconnection ${connectionState.connectionAttempts}/5...`);
          
          connectionState.reconnectTimer = setTimeout(() => {
            this.reconnectSession(sessionId);
          }, 5000 * connectionState.connectionAttempts);
        } else {
          this.logger.info(`⏹️ Not attempting reconnection for reason: ${reason}`);
        }
      });

      // Message handling with 8-second queue system
      client.on('message', async (message) => {
        try {
          const sender = message.from;
          
          console.log('=== NEW MESSAGE ===');
          console.log('From:', sender);
          console.log('Body:', message.body);
          console.log('Type:', message.type);
          console.log('HasMedia:', message.hasMedia);
          
          this.logger.info(`📨 Message received: ${message.body?.substring(0, 50)}... from: ${sender}`);
          
          // Add test command - immediate response
          if (message.body === '!test') {
            await message.reply('✅ Bot is working!');
            this.logger.info(`✅ Test response sent to ${sender}`);
            return;
          }
          
          // Add reaction to show message was received
          try {
            await message.react('⏳');
            console.log(`⏳ Reaction added to message from ${sender}`);
          } catch (reactError) {
            console.log(`Could not add reaction: ${reactError.message}`);
          }
          
          // Check if this is the first message from this sender
          if (!this.messageQueues.has(sender)) {
            this.messageQueues.set(sender, []);
            
            console.log(`🕐 Starting 8-second timer for ${sender}`);
            
            // Start 8-second timer to process all messages from this sender
            setTimeout(async () => {
              const queuedMessages = this.messageQueues.get(sender);
              this.messageQueues.delete(sender);
              
              if (queuedMessages && queuedMessages.length > 0) {
                console.log(`⏰ Processing ${queuedMessages.length} queued messages from ${sender}`);
                await this.processQueuedMessages(userId, sessionId, queuedMessages, sender);
              }
            }, 8000); // 8 seconds
          }
          
          // Add message to queue
          this.messageQueues.get(sender).push({
            message,
            timestamp: Date.now(),
            body: message.body,
            hasMedia: message.hasMedia
          });
          
          console.log(`📝 Message queued for ${sender}. Queue size: ${this.messageQueues.get(sender).length}`);
          
        } catch (error) {
          this.logger.error(`Error handling message: ${error.message}`);
        }
      });

      // Loading screen event with debugging
      client.on('loading_screen', (percent, message) => {
        console.log('LOADING:', percent, message);
        this.logger.info(`Loading: ${percent}% - ${message}`);
      });

      // Connection state change events
      client.on('change_state', (state) => {
        this.logger.info(`Connection state changed: ${state}`);
      });

      // Handle connection errors
      client.on('error', (error) => {
        this.logger.error(`Client error: ${error.message}`);
        connectionState.updateStatus('error', error.message);
      });

      // Initialize the client after all event handlers are set
      this.logger.info(`Initializing WhatsApp client for session: ${sessionId}`);
      try {
        console.log('Initializing WhatsApp client...');
        await client.initialize();
        console.log('Client initialized');
      } catch (error) {
        console.error('Init error:', error);
        throw error;
      }

      return {
        success: true,
        sessionId,
        status: connectionState.status,
        qrCode: connectionState.qrCode
      };

    } catch (error) {
      this.logger.error(`❌ Session initialization failed: ${error.message}`);
      
      if (this.sessions.has(sessionId)) {
        const state = this.sessions.get(sessionId);
        state.updateStatus('error', error.message);
      }
      
      throw error;
    }
  }

  async reconnectSession(sessionId) {
    try {
      const state = this.sessions.get(sessionId);
      if (!state || state.isConnecting) {
        return;
      }

      this.logger.info(`🔄 Reconnecting session ${sessionId}...`);
      
      // Clean up old client
      if (state.client) {
        await state.client.destroy();
      }

      // Get user ID from session
      const userId = sessionId.replace('session-', '');
      
      // Reinitialize
      await this._initializeSession(userId, sessionId);
    } catch (error) {
      this.logger.error(`Reconnection failed for ${sessionId}: ${error.message}`);
    }
  }

  async handleIncomingMessage(userId, sessionId, message) {
    try {
      const { from, body, hasMedia, type } = message;
      
      // Check if contact is excluded
      if (this.isContactExcluded(userId, from)) {
        this.logger.info(`📵 Message from excluded contact ${from}, not responding`);
        return;
      }

      this.logger.info(`📩 New message from ${from}: ${body?.substring(0, 50)}...`);
      
      let processedContent = body;
      let mediaInfo = null;

      // Handle media messages
      if (hasMedia) {
        try {
          const media = await message.downloadMedia();
          
          if (media) {
            // Save media temporarily
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }

            const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const filepath = path.join(tempDir, filename);
            
            // Convert base64 to buffer and save
            const buffer = Buffer.from(media.data, 'base64');
            fs.writeFileSync(filepath, buffer);

            // Process based on media type
            if (type === 'ptt' || media.mimetype?.startsWith('audio/')) {
              // Process audio message
              const botConfig = await this.getBotConfig(userId);
              if (botConfig?.audioProcessing) {
                this.logger.info('🎵 Processing audio message...');
                const transcription = await mediaService.processAudio(filepath);
                processedContent = transcription || 'Não consegui transcrever o áudio';
                mediaInfo = { type: 'audio', transcription };
              }
            } else if (media.mimetype?.startsWith('image/')) {
              // Process image message
              const botConfig = await this.getBotConfig(userId);
              if (botConfig?.imageProcessing) {
                this.logger.info('🖼️ Processing image message...');
                const imageAnalysis = await mediaService.processImage(filepath);
                processedContent = body || 'Imagem recebida';
                mediaInfo = { type: 'image', analysis: imageAnalysis };
              }
            }

            // Clean up temp file
            setTimeout(() => {
              try {
                fs.unlinkSync(filepath);
              } catch (error) {
                this.logger.error(`Error deleting temp file: ${error.message}`);
              }
            }, 60000); // Delete after 1 minute
          }
        } catch (error) {
          this.logger.error(`Error processing media: ${error.message}`);
        }
      }

      // Generate AI response
      const response = await this.generateAIResponse(
        userId,
        processedContent,
        from,
        mediaInfo
      );

      // Send response
      if (response && typeof response === 'string' && response.trim().length > 0) {
        const state = this.sessions.get(sessionId);
        if (state && state.client && state.status === 'connected') {
          try {
            console.log('=== SENDING RESPONSE ===');
            console.log('Response to send:', response);
            console.log('Response length:', response.length);
            
            await message.reply(response);
            this.logger.info(`✅ Response sent to ${from}: ${response.substring(0, 50)}...`);
          } catch (replyError) {
            this.logger.error(`❌ Error sending reply: ${replyError.message}`);
            
            // Fallback: try sending as new message
            try {
              await state.client.sendMessage(from, response);
              this.logger.info(`✅ Fallback message sent to ${from}`);
            } catch (fallbackError) {
              this.logger.error(`❌ Fallback message failed: ${fallbackError.message}`);
            }
          }
        }
      } else {
        this.logger.warn(`❌ No valid response generated for message from ${from}`);
        console.log('Invalid response:', response);
      }

    } catch (error) {
      this.logger.error(`❌ Error handling message: ${error.message}`);
    }
  }

  async processQueuedMessages(userId, sessionId, queuedMessages, sender) {
    try {
      const state = this.sessions.get(sessionId);
      if (!state || !state.client || state.status !== 'connected') {
        this.logger.warn(`Session ${sessionId} not available for processing queued messages`);
        return;
      }

      console.log('=== PROCESSING QUEUED MESSAGES ===');
      console.log(`Messages count: ${queuedMessages.length}`);
      console.log(`From sender: ${sender}`);

      // Combine all message bodies into a single context
      const combinedText = queuedMessages
        .map(item => item.body)
        .filter(body => body && body.trim().length > 0)
        .join(' ');

      console.log(`Combined message text: ${combinedText}`);

      if (!combinedText.trim()) {
        console.log('No valid text content in queued messages');
        return;
      }

      // Use the last message object for media and other properties
      const lastMessage = queuedMessages[queuedMessages.length - 1];
      let mediaInfo = null;

      // Process media if the last message has media
      if (lastMessage.hasMedia) {
        console.log('Processing media from last message...');
        try {
          const media = await lastMessage.message.downloadMedia();
          if (media) {
            // Handle media processing similar to handleIncomingMessage
            // For now, we'll just note that media was present
            mediaInfo = { type: 'media', hasMedia: true };
          }
        } catch (mediaError) {
          this.logger.error(`Error processing media: ${mediaError.message}`);
        }
      }

      // Generate AI response with combined context
      const response = await this.generateAIResponse(
        userId,
        combinedText,
        sender,
        mediaInfo
      );

      // Send response
      if (response && typeof response === 'string' && response.trim().length > 0) {
        try {
          console.log('=== SENDING COMBINED RESPONSE ===');
          console.log('Response to send:', response);
          console.log('Response length:', response.length);

          // Use the last message to reply
          await lastMessage.message.reply(response);
          
          // Add success reaction
          try {
            await lastMessage.message.react('✅');
          } catch (reactError) {
            console.log(`Could not add success reaction: ${reactError.message}`);
          }

          this.logger.info(`✅ Combined response sent to ${sender}: ${response.substring(0, 50)}...`);
        } catch (replyError) {
          this.logger.error(`❌ Error sending combined reply: ${replyError.message}`);
          
          // Fallback: try sending as new message
          try {
            await state.client.sendMessage(sender, response);
            this.logger.info(`✅ Fallback combined message sent to ${sender}`);
          } catch (fallbackError) {
            this.logger.error(`❌ Fallback combined message failed: ${fallbackError.message}`);
          }
        }
      } else {
        this.logger.warn(`❌ No valid combined response generated for messages from ${sender}`);
        console.log('Invalid combined response:', response);
      }

    } catch (error) {
      this.logger.error(`❌ Error processing queued messages: ${error.message}`);
      console.error('Queue processing error:', error);
    }
  }

  async generateAIResponse(userId, message, from, mediaInfo = null) {
    try {
      // Get user's bot configuration
      const botConfig = await this.getBotConfig(userId);
      
      console.log('=== BOT CONFIG ===');
      console.log('Bot Config:', JSON.stringify(botConfig, null, 2));
      console.log('Mode:', botConfig?.mode || 'unknown');
      console.log('Greeting Mode Enabled:', botConfig?.greetingMode);
      
      // Check if bot is in greeting mode
      if (botConfig?.mode === 'greeting' || botConfig?.greetingMode) {
        console.log('=== GREETING MODE ACTIVE ===');
        const greetingMessage = botConfig?.greetingMessage || 'Olá! Bem-vindo ao nosso atendimento. Como posso ajudá-lo?';
        
        // Check for greeting message cooldown
        const cooldownKey = `greeting_${from}_${userId}`;
        const lastGreeting = this.greetingCooldowns?.get(cooldownKey);
        const now = Date.now();
        const cooldownTime = (botConfig?.greetingCooldown || 60) * 1000; // Default 60 seconds
        
        if (!lastGreeting || (now - lastGreeting) > cooldownTime) {
          if (!this.greetingCooldowns) {
            this.greetingCooldowns = new Map();
          }
          this.greetingCooldowns.set(cooldownKey, now);
          this.logger.info(`📢 Sending greeting message to ${from}`);
          return greetingMessage;
        } else {
          this.logger.info(`⏰ Greeting cooldown active for ${from}`);
          return null; // Don't respond during cooldown
        }
      }

      // AI Mode
      console.log('=== AI MODE ACTIVE ===');
      this.logger.info(`🤖 Generating AI response for: ${message}`);
      
      // Prepare context with media info if available
      let enhancedMessage = message;
      if (mediaInfo) {
        if (mediaInfo.type === 'audio' && mediaInfo.transcription) {
          enhancedMessage = `[Áudio transcrito]: ${mediaInfo.transcription}`;
        } else if (mediaInfo.type === 'image' && mediaInfo.analysis) {
          enhancedMessage = `${message}\n[Análise da imagem]: ${mediaInfo.analysis}`;
        }
      }

      // Generate response using OpenAI service
      const response = await openAIService.generateResponse(
        enhancedMessage,
        null, // context
        'gpt-4o-mini', // model
        userId
      );

      console.log('=== AI SERVICE RESPONSE ===');
      console.log('Raw response:', response);
      console.log('Response type:', typeof response);
      console.log('Response success:', response?.success);
      console.log('Response text:', response?.response);
      console.log('Response length:', response?.response?.length || response?.length || 0);

      // Handle response object format {success: true, response: "text"}
      let finalResponse = null;
      if (response && typeof response === 'object' && response.success && response.response) {
        finalResponse = response.response;
        console.log('Extracted response from object:', finalResponse);
      } else if (response && typeof response === 'string') {
        finalResponse = response;
        console.log('Using direct string response:', finalResponse);
      }

      // Ensure we return a valid string
      if (finalResponse && typeof finalResponse === 'string' && finalResponse.trim().length > 0) {
        return finalResponse.trim();
      } else {
        console.warn('Invalid or empty AI response, returning fallback message');
        console.log('Final response that failed:', finalResponse);
        return 'Desculpe, não consegui processar sua mensagem no momento. Tente novamente.';
      }
    } catch (error) {
      this.logger.error(`Error generating AI response: ${error.message}`);
      console.error('=== AI RESPONSE ERROR ===', error);
      return 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.';
    }
  }

  async getBotConfig(userId) {
    try {
      const config = await prisma.botConfig.findFirst({
        where: { userId }
      });
      return config;
    } catch (error) {
      this.logger.error(`Error fetching bot config: ${error.message}`);
      return null;
    }
  }

  async loadExcludedContacts(userId) {
    try {
      const excludedContacts = await prisma.excludedContact.findMany({
        where: { userId }
      });
      
      const contactSet = new Set(excludedContacts.map(c => c.phoneNumber));
      this.excludedContacts.set(userId, contactSet);
      
      this.logger.info(`Loaded ${contactSet.size} excluded contacts for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error loading excluded contacts: ${error.message}`);
    }
  }

  isContactExcluded(userId, phoneNumber) {
    const userExcluded = this.excludedContacts.get(userId);
    if (!userExcluded) return false;
    
    // Normalize phone number (remove @c.us suffix)
    const normalizedNumber = phoneNumber.replace('@c.us', '');
    return userExcluded.has(normalizedNumber);
  }

  async sendMessage(sessionId, phoneNumber, content, mediaPath = null) {
    try {
      const state = this.sessions.get(sessionId);
      
      if (!state || !state.client || state.status !== 'connected') {
        throw new Error('Session not connected');
      }

      // Normalize phone number (add @c.us suffix if needed)
      const chatId = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@c.us`;
      
      if (mediaPath) {
        // Send media message
        const media = MessageMedia.fromFilePath(mediaPath);
        await state.client.sendMessage(chatId, media, { caption: content });
      } else {
        // Send text message
        await state.client.sendMessage(chatId, content);
      }

      this.logger.info(`✅ Message sent to ${phoneNumber}`);
      return { success: true };

    } catch (error) {
      this.logger.error(`❌ Error sending message: ${error.message}`);
      throw error;
    }
  }

  async getQRCode(sessionId) {
    // Try to get QR from stored QR codes first
    const storedQR = this.storedQRCodes.get(sessionId);
    if (storedQR) {
      console.log('QR sent to frontend');
      return {
        qrCode: storedQR,
        status: 'connecting',
        timestamp: new Date()
      };
    }
    
    const state = this.sessions.get(sessionId);
    
    if (!state) {
      return {
        error: 'Session not found',
        qrCode: null,
        status: 'not_initialized'
      };
    }

    if (state.qrCode) {
      console.log('QR sent to frontend');
      return {
        qrCode: state.qrCode,
        status: state.status,
        timestamp: state.qrTimestamp
      };
    } else {
      return {
        error: 'No QR available yet',
        qrCode: null,
        status: state.status
      };
    }
  }

  async getSessionStatus(sessionId) {
    const state = this.sessions.get(sessionId);
    
    if (!state) {
      return {
        status: 'not_initialized',
        connected: false
      };
    }

    return {
      status: state.status,
      connected: state.status === 'connected',
      diagnostics: state.getDiagnostics()
    };
  }

  async disconnectSession(sessionId) {
    try {
      const state = this.sessions.get(sessionId);
      
      if (!state) {
        return { success: false, message: 'Session not found' };
      }

      if (state.client) {
        await state.client.logout();
        await state.client.destroy();
      }

      state.cleanup();
      this.sessions.delete(sessionId);
      
      // Remove session data
      const sessionPath = path.join(__dirname, 'sessions', `session-${sessionId}`);
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      this.logger.info(`✅ Session ${sessionId} disconnected and cleaned up`);
      return { success: true };

    } catch (error) {
      this.logger.error(`Error disconnecting session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async getAllSessions() {
    const sessionsInfo = [];
    
    for (const [sessionId, state] of this.sessions) {
      sessionsInfo.push({
        sessionId,
        status: state.status,
        connected: state.status === 'connected',
        lastError: state.lastError
      });
    }

    return sessionsInfo;
  }

  // Clean up all sessions on shutdown
  async cleanup() {
    this.logger.info('🧹 Cleaning up all WhatsApp sessions...');
    
    for (const [sessionId, state] of this.sessions) {
      try {
        if (state.client) {
          await state.client.destroy();
        }
        state.cleanup();
      } catch (error) {
        this.logger.error(`Error cleaning up session ${sessionId}: ${error.message}`);
      }
    }
    
    this.sessions.clear();
    this.excludedContacts.clear();
    this.logger.info('✅ All sessions cleaned up');
  }
}

// Create singleton instance
const whatsAppManager = new WhatsAppManager();

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await whatsAppManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await whatsAppManager.cleanup();
  process.exit(0);
});

module.exports = whatsAppManager;