const { makeInMemoryStore, makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, makeLibSignalRepository } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const P = require('pino');
const openAIService = require('./openai-service');
const botConfigService = require('./bot-config-service');
const { PrismaClient } = require('@prisma/client');

// Initialize Prisma client for session persistence
const prisma = new PrismaClient();

// WebSocket stability configuration
const WS_CONFIG = {
  HEARTBEAT_INTERVAL: 25000, // 25 seconds
  QR_TIMEOUT: 30000, // 30 seconds for QR scan (updated per user request)
  RETRY_BASE_DELAY: 100, // 100ms for faster QR generation
  MAX_RETRY_DELAY: 2000, // 2 seconds maximum for QR operations
  MAX_RETRY_ATTEMPTS: 2, // Reduce retry attempts for faster response
  CONNECTION_BUFFER_TIME: 10000, // 10 seconds buffer during QR scan
  PING_TIMEOUT: 10000 // 10 seconds ping timeout
};

// Create sessions directory if it doesn't exist (old format for backward compatibility)
const sessionsDir = path.join(__dirname, 'baileys_sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// Create data directory for persistent storage
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Use baileys_sessions directory for all session operations
const phoneSessionsDir = path.join(__dirname, 'baileys_sessions');
if (!fs.existsSync(phoneSessionsDir)) {
  fs.mkdirSync(phoneSessionsDir, { recursive: true });
}

// Create session registry directory for file-based persistence backup
const sessionRegistryDir = path.join(dataDir, 'session_registry');
if (!fs.existsSync(sessionRegistryDir)) {
  fs.mkdirSync(sessionRegistryDir, { recursive: true });
}

// File-based session registry
const sessionRegistryFile = path.join(sessionRegistryDir, 'active_sessions.json');

// Path for cooldowns persistence
const cooldownsFile = path.join(dataDir, 'greeting_cooldowns.json');

// Debug logging for WebSocket monitoring
const debugLogFile = path.join(dataDir, 'debug.log');

// WebSocket logging function
function logWebSocketEvent(sessionId, event, data) {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} [${sessionId}] ${event}: ${JSON.stringify(data)}\n`;
  try {
    fs.appendFileSync(debugLogFile, logEntry);
  } catch (error) {
    console.error('[WS Debug] Failed to write to debug log:', error);
  }
  console.log(`[WS DEBUG ${sessionId}] ${event}:`, data);
}

// Store active connections
const connections = new Map();

// Store QR codes for each session
const qrCodes = new Map();

// Store WebSocket heartbeat intervals
const heartbeatIntervals = new Map();

// Store connection retry attempts
const retryAttempts = new Map();

// Store connection event buffers during QR scan
const connectionBuffers = new Map();

// Logger configuration
const logger = P({ level: 'error' });

class WhatsAppService {
  constructor() {
    // Store active WhatsApp sessions
    this.sessions = {}; // phoneNumber -> session object
    
    // Store conversation history for context
    this.conversationHistory = new Map();
    
    // Store greeting cooldowns for each phone number
    this.greetingCooldowns = new Map(); // phoneNumber -> timestamp
    
    // Track conflict attempts per phone number for exponential backoff
    this.conflictCounts = new Map(); // phoneNumber -> { count: number, lastConflict: timestamp }
    
    // Cache auth state initialization for faster QR generation
    this.authStateCache = new Map(); // sessionId -> { authState, timestamp }
    
    // Message queue system for batching messages
    this.messageQueues = new Map(); // phoneNumber -> { messages: [], timer: null }
    this.queueDelay = 1000; // 1 second delay for faster response
    
    // Load persisted cooldowns on startup
    this.loadCooldowns();
    
    // Save cooldowns periodically (every 5 minutes)
    setInterval(() => {
      this.saveCooldowns();
    }, 5 * 60 * 1000);
    
    // Initialize debug log
    this.initializeDebugLog();
    
    // Discover existing sessions on startup
    this.discoverExistingSessions().catch(err => {
      console.error('[WhatsApp Service] Error discovering existing sessions:', err);
    });
    
    console.log('[WhatsApp Service] Initialized with enhanced WebSocket stability and message queue system');
    
    // Initialize session persistence
    this.setupGracefulShutdown();
    
    // Pre-warm service for faster QR generation
    this.preWarmService();
    
    // Load saved sessions on startup
    this.loadSavedSessions();
  }

  // REMOVED: validateBaileysAuthState function that interfered with authentication
  // Baileys handles auth state validation naturally - no manual intervention needed


  // REMOVED: reconstructAuthState function that interfered with authentication
  // Baileys creates proper auth state naturally - no manual reconstruction needed

  // REMOVED: performHybridRestoration and cleanSignalFilesOnly functions that interfered with authentication
  // Baileys handles session restoration naturally - no manual signal cleanup needed

  // REMOVED: Signal stub functions and automatic recovery that interfere with authentication
  // Baileys handles signal protocol functions naturally - no manual intervention needed

  // Helper function to get connection by phone number
  getConnectionByPhone(phoneNumber) {
    for (const [sessionId, connection] of this.connections) {
      if (connection.phoneNumber === phoneNumber) {
        return connection;
      }
    }
    return null;
  }

  // Helper function to remove connection by phone number
  removeConnectionByPhone(phoneNumber) {
    for (const [sessionId, connection] of this.connections) {
      if (connection.phoneNumber === phoneNumber) {
        this.connections.delete(sessionId);
        console.log(`[Connection Cleanup] Removed connection for ${phoneNumber}`);
        break;
      }
    }
  }

  // Enhanced message decryption error recovery
  async handleDecryptionError(error, phoneNumber, sessionId, message = null) {
    console.log(`[Decryption Recovery] 🔧 Handling decryption error for ${phoneNumber}:`, error.message);
    
    try {
      // Check if this is a known decryption error
      if (error.message.includes('repository.decryptMessage is not a function') ||
          error.message.includes('signalRepository.jidToSignalProtocolAddress is not a function') ||
          error.message.includes('Bad MAC') ||
          error.message.includes('decrypt')) {
        
        console.warn(`[Decryption Recovery] ⚠️ Detected session corruption for ${phoneNumber}. Attempting recovery...`);
        
        // Try to recover the session
        const recovered = await this.recoverCorruptedSession(phoneNumber, sessionId);
        
        if (recovered) {
          console.log(`[Decryption Recovery] ✅ Session recovered for ${phoneNumber}. Message will be reprocessed.`);
          return { recovered: true, retry: true };
        } else {
          console.error(`[Decryption Recovery] ❌ Session recovery failed for ${phoneNumber}. Clearing session.`);
          
          // Clear the session completely as last resort
          await this.clearSessionCompletely(phoneNumber, sessionId);
          
          return { 
            recovered: false, 
            retry: false, 
            message: 'Desculpe, houve um problema técnico. Por favor, conecte sua sessão do WhatsApp novamente.' 
          };
        }
      }
      
      // For other types of errors, use the existing fallback handler
      return await this.handleMessageDecryptionFailure(message, phoneNumber, sessionId, 0);
      
    } catch (recoveryError) {
      console.error(`[Decryption Recovery] ❌ Recovery process failed:`, recoveryError.message);
      return { 
        recovered: false, 
        retry: false, 
        message: 'Desculpe, não foi possível processar sua mensagem no momento.' 
      };
    }
  }

  // Recover corrupted session by reconstructing auth state
  async recoverCorruptedSession(phoneNumber, sessionId) {
    console.log(`[Session Recovery] 🔧 Attempting to recover corrupted session for ${phoneNumber}`);
    
    try {
      const connection = connections.get(sessionId);
      if (!connection) {
        console.warn(`[Session Recovery] ⚠️ No connection found for ${sessionId}`);
        return false;
      }
      
      const sessionPath = connection.sessionPath || path.join(phoneSessionsDir, phoneNumber);
      
      // Load auth state naturally with Baileys
      console.log(`[Session Recovery] Loading auth state naturally for ${phoneNumber}...`);
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      
      console.log(`[Session Recovery] ✅ Auth state loaded for ${phoneNumber}. Recreating socket...`);
      
      // Close the current socket
      if (connection.sock) {
        connection.sock.end();
      }
      
      // Create a new socket with the natural auth state
      const newSock = makeWASocket({
        auth: state,
          printQRInTerminal: false,
          browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
          logger: P({ level: 'silent' }),
          version: (await fetchLatestBaileysVersion()).version,
          markOnlineOnConnect: false,
          generateHighQualityLinkPreview: true,
          syncFullHistory: false,
          shouldSyncHistoryMessage: () => false,
          makeSignalRepository: makeCacheableSignalKeyStore
        });
        
      // Update the connection
      connection.sock = newSock;
      connection.saveCreds = saveCreds;
      connection.status = 'recovering';
      
      // Set up the connection handlers again
      await this.setupConnectionHandlers(newSock, phoneNumber, sessionId);
      
      console.log(`[Session Recovery] ✅ Session recovery completed for ${phoneNumber}`);
      return true;
      
    } catch (error) {
      console.error(`[Session Recovery] ❌ Recovery failed:`, error.message);
      return false;
    }
  }

  // Set up connection handlers for a socket (used in recovery)
  async setupConnectionHandlers(sock, phoneNumber, sessionId) {
    console.log(`[Connection Setup] Setting up handlers for ${phoneNumber}`);
    
    try {
      // Set up the main connection handler
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
          console.log(`[Connection Setup] ✅ Socket reconnected for ${phoneNumber}`);
          const conn = connections.get(sessionId);
          if (conn) {
            conn.status = 'connected';
          }
        } else if (connection === 'close') {
          console.log(`[Connection Setup] Socket closed for ${phoneNumber}`);
          const disconnectReason = lastDisconnect?.error?.output?.statusCode;
          
          if (disconnectReason !== DisconnectReason.loggedOut) {
            // Attempt to reconnect
            setTimeout(async () => {
              console.log(`[Connection Setup] Attempting reconnect for ${phoneNumber}`);
              await this.initializeSessionWithPhoneNumber(phoneNumber, sessionId);
            }, 5000);
          }
        }
      });

      // Set up message handlers
      sock.ev.on('messages.upsert', async (m) => {
        const messages = m.messages || [];
        
        for (const message of messages) {
          if (message.key.fromMe || !message.message) continue;
          
          try {
            // Process the message with decryption error handling
            await this.processIncomingMessage(message, phoneNumber, sessionId);
          } catch (error) {
            console.error(`[Connection Setup] Message processing error for ${phoneNumber}:`, error.message);
            
            // Use our decryption error recovery
            if (error.message.includes('decrypt') || error.message.includes('repository')) {
              const recovery = await this.handleDecryptionError(error, phoneNumber, sessionId, message);
              if (recovery.retry) {
                // Retry the message processing after recovery
                try {
                  await this.processIncomingMessage(message, phoneNumber, sessionId);
                } catch (retryError) {
                  console.error(`[Connection Setup] Retry failed for ${phoneNumber}:`, retryError.message);
                }
              }
            }
          }
        }
      });

      return true;
      
    } catch (error) {
      console.error(`[Connection Setup] Failed to set up handlers for ${phoneNumber}:`, error.message);
      return false;
    }
  }

  // Enhanced message decryption fallback handler
  async handleMessageDecryptionFailure(message, phoneNumber, sessionId, retryCount = 0) {
    console.log(`[Decryption Fallback] 🔐 Handling decryption failure for ${phoneNumber} (attempt ${retryCount + 1})`);
    
    try {
      const maxRetries = 3;
      const baseDelay = 100; // Start with 100ms
      
      if (retryCount >= maxRetries) {
        console.warn(`[Decryption Fallback] ⚠️ Max retries exceeded for ${phoneNumber}. Sending generic response.`);
        
        // Send a generic response when decryption fails completely
        return {
          success: false,
          action: 'generic_response',
          responseText: 'Desculpe, houve um problema técnico. Pode repetir sua mensagem?',
          retries: retryCount
        };
      }
      
      // Calculate exponential backoff delay
      const delay = baseDelay * Math.pow(2, retryCount);
      
      console.log(`[Decryption Fallback] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Try different decryption approaches
      const fallbackMethods = [
        'retry_extraction',
        'skip_decryption',
        'force_text_only'
      ];
      
      const method = fallbackMethods[retryCount % fallbackMethods.length];
      console.log(`[Decryption Fallback] Trying method: ${method}`);
      
      switch (method) {
        case 'retry_extraction':
          // Retry message text extraction with different approach
          try {
            const messageText = this.extractMessageTextFallback(message);
            if (messageText) {
              console.log(`[Decryption Fallback] ✅ Text extracted via fallback: "${messageText.substring(0, 50)}..."`);
              return {
                success: true,
                action: 'extracted_text',
                messageText: messageText,
                retries: retryCount + 1
              };
            }
          } catch (extractError) {
            console.warn(`[Decryption Fallback] Extraction retry failed:`, extractError.message);
          }
          break;
          
        case 'skip_decryption':
          // Try to handle without decryption
          console.log(`[Decryption Fallback] Attempting to skip decryption step`);
          try {
            return {
              success: true,
              action: 'skip_processing',
              responseText: 'Mensagem recebida, mas não foi possível processar o conteúdo.',
              retries: retryCount + 1
            };
          } catch (skipError) {
            console.warn(`[Decryption Fallback] Skip method failed:`, skipError.message);
          }
          break;
          
        case 'force_text_only':
          // Force text-only processing
          console.log(`[Decryption Fallback] Forcing text-only processing`);
          try {
            const simpleText = message?.message?.conversation || 
                             message?.message?.extendedTextMessage?.text || 
                             'Mensagem não textual recebida';
            
            return {
              success: true,
              action: 'force_text',
              messageText: simpleText,
              retries: retryCount + 1
            };
          } catch (forceError) {
            console.warn(`[Decryption Fallback] Force text failed:`, forceError.message);
          }
          break;
      }
      
      // If we reach here, the current method failed - try next attempt
      return await this.handleMessageDecryptionFailure(message, phoneNumber, sessionId, retryCount + 1);
      
    } catch (error) {
      console.error(`[Decryption Fallback] ❌ Fallback handler error:`, error.message);
      
      return {
        success: false,
        action: 'error',
        responseText: 'Desculpe, não consegui processar sua mensagem no momento.',
        error: error.message,
        retries: retryCount
      };
    }
  }
  
  // Fallback message text extraction with simplified approach
  extractMessageTextFallback(message) {
    console.log('[Decryption Fallback] Attempting simplified text extraction...');
    
    try {
      if (!message || !message.message) {
        return null;
      }
      
      const msgContent = message.message;
      
      // Try basic text fields first (most likely to work without decryption)
      if (msgContent.conversation) {
        return msgContent.conversation;
      }
      
      if (msgContent.extendedTextMessage?.text) {
        return msgContent.extendedTextMessage.text;
      }
      
      // Try other simple text types
      const simpleTextFields = [
        'imageMessage.caption',
        'videoMessage.caption',
        'documentMessage.caption',
        'buttonsResponseMessage.selectedButtonId',
        'listResponseMessage.singleSelectReply.selectedRowId'
      ];
      
      for (const fieldPath of simpleTextFields) {
        try {
          const value = fieldPath.split('.').reduce((obj, key) => obj?.[key], msgContent);
          if (typeof value === 'string' && value.trim()) {
            console.log(`[Decryption Fallback] ✅ Found text in ${fieldPath}`);
            return value.trim();
          }
        } catch (pathError) {
          // Continue to next field
        }
      }
      
      // Return a generic indicator if nothing found
      return 'Mensagem recebida (conteúdo não textual)';
      
    } catch (error) {
      console.warn('[Decryption Fallback] Simplified extraction failed:', error.message);
      return null;
    }
  }

  // Enhanced session file persistence with comprehensive file saving
  async forceSaveSessionFiles(phoneNumber, saveCredsCallback = null) {
    console.log(`[Session Persistence] 💾 Force saving session files for ${phoneNumber}`);
    
    try {
      const sessionPath = path.join(phoneSessionsDir, phoneNumber);
      
      // Ensure session directory exists
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
        console.log(`[Session Persistence] Created session directory: ${sessionPath}`);
      }
      
      const savedFiles = [];
      let totalSize = 0;
      
      // Force save credentials using the provided callback
      if (saveCredsCallback && typeof saveCredsCallback === 'function') {
        try {
          console.log(`[Session Persistence] Calling saveCreds synchronously for ${phoneNumber}...`);
          await saveCredsCallback();
          console.log(`[Session Persistence] ✅ saveCreds completed for ${phoneNumber}`);
        } catch (saveError) {
          console.error(`[Session Persistence] ❌ saveCreds failed:`, saveError.message);
          return { success: false, reason: 'save_creds_failed', error: saveError.message };
        }
      } else {
        console.warn(`[Session Persistence] ⚠️ No saveCreds callback provided for ${phoneNumber}`);
        // Continue without saving - we'll still inventory existing files
      }
      
      // Wait a moment for files to be written
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Inventory all files in session directory
      try {
        const files = fs.readdirSync(sessionPath);
        console.log(`[Session Persistence] Found ${files.length} files in session directory:`);
        
        for (const file of files) {
          const filePath = path.join(sessionPath, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              const fileSize = stats.size;
              totalSize += fileSize;
              savedFiles.push({
                filename: file,
                size: fileSize,
                modified: stats.mtime.toISOString()
              });
              console.log(`[Session Persistence]   - ${file}: ${fileSize} bytes (${stats.mtime.toISOString()})`);
            }
          } catch (statError) {
            console.warn(`[Session Persistence] ⚠️ Could not stat file ${file}:`, statError.message);
          }
        }
        
        // Check for critical files
        const criticalFiles = ['creds.json'];
        const requiredFiles = [];
        const missingCritical = [];
        
        for (const critical of criticalFiles) {
          const found = savedFiles.find(f => f.filename === critical);
          if (found) {
            requiredFiles.push(found);
            console.log(`[Session Persistence] ✅ Critical file found: ${critical} (${found.size} bytes)`);
          } else {
            missingCritical.push(critical);
            console.warn(`[Session Persistence] ⚠️ Critical file missing: ${critical}`);
          }
        }
        
        // Check for app-state-sync files (these are important for session restoration)
        const appStateSyncFiles = savedFiles.filter(f => f.filename.includes('app-state-sync'));
        console.log(`[Session Persistence] Found ${appStateSyncFiles.length} app-state-sync files`);
        
        // Save session metadata
        const metadata = {
          phoneNumber,
          savedAt: new Date().toISOString(),
          totalFiles: savedFiles.length,
          totalSize,
          criticalFiles: requiredFiles,
          appStateSyncFiles: appStateSyncFiles.length,
          missingCritical,
          allFiles: savedFiles
        };
        
        const metadataPath = path.join(sessionPath, 'session-metadata.json');
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        console.log(`[Session Persistence] ✅ Saved session metadata: ${metadataPath}`);
        
        // Update session registry
        this.saveSessionToFile(phoneNumber, {
          phoneNumber,
          status: 'saved',
          lastSaved: new Date().toISOString(),
          fileCount: savedFiles.length,
          totalSize
        });
        
        console.log(`[Session Persistence] 🎉 Force save completed for ${phoneNumber}: ${savedFiles.length} files, ${totalSize} bytes total`);
        
        return {
          success: true,
          phoneNumber,
          sessionPath,
          files: savedFiles,
          totalSize,
          criticalFiles: requiredFiles.length,
          missingCritical,
          appStateSyncFiles: appStateSyncFiles.length
        };
        
      } catch (dirError) {
        console.error(`[Session Persistence] ❌ Failed to read session directory:`, dirError.message);
        return { success: false, reason: 'directory_read_failed', error: dirError.message };
      }
      
    } catch (error) {
      console.error(`[Session Persistence] ❌ Force save failed for ${phoneNumber}:`, error.message);
      return { success: false, reason: 'general_error', error: error.message };
    }
  }

  // Enhanced session startup discovery with detailed logging
  async discoverExistingSessions() {
    console.log(`[Session Discovery] 🔍 Scanning for existing sessions...`);
    
    const discoveredSessions = [];
    
    try {
      // Check sessions directory
      if (fs.existsSync(phoneSessionsDir)) {
        const sessionFolders = fs.readdirSync(phoneSessionsDir);
        console.log(`[Session Discovery] Found ${sessionFolders.length} session folders`);
        
        for (const folder of sessionFolders) {
          if (folder.startsWith('.')) continue; // Skip hidden files
          
          const sessionPath = path.join(phoneSessionsDir, folder);
          try {
            const stats = fs.statSync(sessionPath);
            if (stats.isDirectory()) {
              console.log(`[Session Discovery] Analyzing session folder: ${folder}`);
              
              // Count files in session
              const files = fs.readdirSync(sessionPath);
              const fileDetails = [];
              let totalSize = 0;
              
              for (const file of files) {
                try {
                  const filePath = path.join(sessionPath, file);
                  const fileStats = fs.statSync(filePath);
                  if (fileStats.isFile()) {
                    fileDetails.push({
                      name: file,
                      size: fileStats.size,
                      modified: fileStats.mtime
                    });
                    totalSize += fileStats.size;
                  }
                } catch (fileError) {
                  console.warn(`[Session Discovery] ⚠️ Could not read file ${file}:`, fileError.message);
                }
              }
              
              // Check for critical files
              const hasCreds = fileDetails.some(f => f.name === 'creds.json');
              const hasAppState = fileDetails.some(f => f.name.includes('app-state-sync'));
              const hasMetadata = fileDetails.some(f => f.name === 'session-metadata.json');
              
              const sessionInfo = {
                phoneNumber: folder,
                sessionPath,
                fileCount: fileDetails.length,
                totalSize,
                hasCreds,
                hasAppState,
                hasMetadata,
                files: fileDetails,
                lastModified: Math.max(...fileDetails.map(f => f.modified.getTime())),
                createdAt: stats.birthtime
              };
              
              discoveredSessions.push(sessionInfo);
              
              console.log(`[Session Discovery]   📱 ${folder}: ${fileDetails.length} files, ${totalSize} bytes`);
              console.log(`[Session Discovery]       - creds.json: ${hasCreds ? '✅' : '❌'}`);
              console.log(`[Session Discovery]       - app-state files: ${hasAppState ? '✅' : '❌'}`);
              console.log(`[Session Discovery]       - metadata: ${hasMetadata ? '✅' : '❌'}`);
            }
          } catch (statError) {
            console.warn(`[Session Discovery] ⚠️ Could not stat ${folder}:`, statError.message);
          }
        }
      } else {
        console.log(`[Session Discovery] Sessions directory does not exist: ${phoneSessionsDir}`);
      }
      
      console.log(`[Session Discovery] 🎯 Discovered ${discoveredSessions.length} existing sessions`);
      return discoveredSessions;
      
    } catch (error) {
      console.error(`[Session Discovery] ❌ Error during session discovery:`, error.message);
      return [];
    }
  }

  async preWarmService() {
    console.log('[QR Performance] Pre-warming service for faster QR generation...');
    const startTime = Date.now();
    
    try {
      // Pre-create session folders structure
      await this.ensureSessionFoldersExist();
      
      // Initialize Baileys modules early
      const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
      
      // Pre-warm crypto modules
      require('crypto');
      require('qrcode');
      
      console.log(`[QR Performance] Service pre-warmed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('[QR Performance] Error pre-warming service:', error);
    }
  }

  async ensureSessionFoldersExist() {
    try {
      // Ensure base directories exist
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (!fs.existsSync(phoneSessionsDir)) {
        fs.mkdirSync(phoneSessionsDir, { recursive: true });
      }
      if (!fs.existsSync(sessionRegistryDir)) {
        fs.mkdirSync(sessionRegistryDir, { recursive: true });
      }
      
      console.log('[QR Performance] Session folder structure ready');
    } catch (error) {
      console.error('[QR Performance] Error creating session folders:', error);
    }
  }

  initializeDebugLog() {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `\n${timestamp} [SYSTEM] WhatsApp Service initialized with WebSocket stability enhancements\n`;
      fs.appendFileSync(debugLogFile, logEntry);
    } catch (error) {
      console.error('[WhatsApp Service] Failed to initialize debug log:', error);
    }
  }

  async handleIncomingMessage(sock, message, sessionId = 'default') {
    try {
      // Debug: Log the complete message structure for debugging
      console.log('[WhatsApp Service] [DEBUG] Received message structure:', {
        hasMessage: !!message.message,
        messageKeys: message.message ? Object.keys(message.message) : [],
        messageType: message.message ? Object.keys(message.message)[0] : null,
        hasKey: !!message.key,
        fromMe: message.key?.fromMe
      });

      // Skip messages from ourselves
      if (message.key?.fromMe) {
        console.log('[WhatsApp Service] Ignoring message from ourselves');
        return;
      }

      // Extract message text with enhanced debugging
      const messageText = this.extractMessageText(message);
      if (!messageText) {
        console.log('[WhatsApp Service] No text content in message, message details:', {
          messageExists: !!message.message,
          messageStructure: message.message ? JSON.stringify(message.message, null, 2) : null,
          messageType: message.message ? Object.keys(message.message)[0] : null
        });
        return;
      }

      // Get sender information
      const senderJid = message.key.remoteJid;
      const senderNumber = senderJid.split('@')[0];
      
      console.log(`[WhatsApp Service] Message from ${senderNumber}: ${messageText.substring(0, 100)}`);

      // Get user configuration
      const userId = 'default'; // In production, map this to actual user
      const config = botConfigService.getUserConfig(userId);

      // Check if auto-reply is enabled
      if (!config.autoReply) {
        console.log('[WhatsApp Service] Auto-reply disabled, ignoring message');
        return;
      }

      // Check business hours (immediate response for out-of-hours)
      if (!botConfigService.isWithinBusinessHours(userId)) {
        console.log('[WhatsApp Service] Outside business hours, sending out-of-hours message');
        const outOfHoursMsg = 'Obrigado pela sua mensagem! Estamos fora do horário de atendimento. Retornaremos assim que possível.';
        await this.sendResponse(sock, senderJid, outOfHoursMsg);
        return;
      }

      // Add message to queue for processing
      this.addMessageToQueue(sock, senderJid, messageText, sessionId, userId);

    } catch (error) {
      console.error('[WhatsApp Service] Error in handleIncomingMessage:', error);
      
      // Send error message to user
      try {
        const errorMsg = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.';
        await this.sendResponse(sock, message.key.remoteJid, errorMsg);
      } catch (sendError) {
        console.error('[WhatsApp Service] Failed to send error message:', sendError);
      }
    }
  }

  addMessageToQueue(sock, senderJid, messageText, sessionId, userId) {
    const senderNumber = senderJid.split('@')[0];
    
    // Get or create queue for this user
    if (!this.messageQueues.has(senderNumber)) {
      this.messageQueues.set(senderNumber, {
        messages: [],
        timer: null,
        sock: sock,
        senderJid: senderJid,
        sessionId: sessionId,
        userId: userId
      });
    }

    const queue = this.messageQueues.get(senderNumber);
    
    // Add message to queue
    queue.messages.push({
      text: messageText,
      timestamp: Date.now()
    });

    console.log(`[WhatsApp Service] Added message to queue for ${senderNumber}. Queue size: ${queue.messages.length}`);

    // Clear existing timer if any
    if (queue.timer) {
      clearTimeout(queue.timer);
    }

    // Set new timer for 8 seconds
    queue.timer = setTimeout(() => {
      this.processQueuedMessages(senderNumber);
    }, this.queueDelay);

    console.log(`[WhatsApp Service] Timer set for ${senderNumber} - will process in ${this.queueDelay/1000} seconds`);
  }

  async processQueuedMessages(senderNumber) {
    const queue = this.messageQueues.get(senderNumber);
    if (!queue || queue.messages.length === 0) {
      return;
    }

    console.log(`[WhatsApp Service] Processing ${queue.messages.length} queued messages from ${senderNumber}`);

    try {
      // Combine all messages into context
      const combinedMessages = queue.messages.map(msg => msg.text).join('\n');
      const { sock, senderJid, userId } = queue;
      
      // Generate response based on mode
      let responseText;
      
      if (botConfigService.isAIMode(userId)) {
        console.log('[WhatsApp Service] AI mode - generating AI response for queued messages');
        
        // Get conversation history for context
        const history = this.getConversationHistory(senderJid);
        
        // Get configured AI model
        const aiModel = botConfigService.getAIModel(userId);
        
        // Generate AI response with combined messages
        const aiResult = await openAIService.generateResponse(combinedMessages, history, aiModel);
        
        if (aiResult.success) {
          responseText = aiResult.response;
          
          // Update conversation history
          this.updateConversationHistory(senderJid, [
            { role: 'user', content: combinedMessages },
            { role: 'assistant', content: responseText }
          ]);
        } else {
          console.error('[WhatsApp Service] AI response failed:', aiResult.error);
          responseText = aiResult.response; // This contains the fallback message
        }
        
      } else if (botConfigService.isGreetingMode(userId)) {
        console.log('[WhatsApp Service] Greeting mode - checking cooldown');
        
        // Get cooldown configuration
        const cooldownHours = botConfigService.getGreetingCooldownHours(userId);
        const cooldownMessage = botConfigService.getGreetingCooldownMessage(userId);
        const silentCooldown = botConfigService.isGreetingSilentCooldown(userId);
        
        // Check if on cooldown
        if (this.isGreetingOnCooldown(senderNumber, cooldownHours)) {
          const hoursRemaining = this.getTimeUntilNextGreeting(senderNumber, cooldownHours);
          console.log(`[WhatsApp Service] Greeting on cooldown for ${senderNumber}, ${hoursRemaining} hours remaining`);
          
          if (silentCooldown) {
            // Don't send any message during cooldown
            console.log('[WhatsApp Service] Silent cooldown - not sending any message');
            responseText = null;
          } else if (cooldownMessage) {
            // Send alternative cooldown message
            responseText = cooldownMessage;
          } else {
            // Default behavior: don't send anything
            responseText = null;
          }
        } else {
          // Not on cooldown, send greeting and update timestamp
          console.log('[WhatsApp Service] Sending greeting message and updating cooldown');
          responseText = botConfigService.getGreetingMessage(userId);
          this.updateGreetingCooldown(senderNumber);
        }
        
      } else {
        console.log('[WhatsApp Service] Unknown mode, using default greeting');
        responseText = 'Olá! Obrigado por entrar em contato. Como posso ajudá-lo?';
      }

      // Send response
      if (responseText) {
        await this.sendResponse(sock, senderJid, responseText);
        console.log(`[WhatsApp Service] Response sent to ${senderNumber} for ${queue.messages.length} combined messages`);
      }

    } catch (error) {
      console.error('[WhatsApp Service] Error processing queued messages:', error);
      
      // Send error message to user
      try {
        const errorMsg = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.';
        await this.sendResponse(queue.sock, queue.senderJid, errorMsg);
      } catch (sendError) {
        console.error('[WhatsApp Service] Failed to send error message:', sendError);
      }
    } finally {
      // Clear the queue
      this.messageQueues.delete(senderNumber);
      console.log(`[WhatsApp Service] Cleared message queue for ${senderNumber}`);
    }
  }

  clearAllMessageQueues() {
    const clearedCount = this.messageQueues.size;
    
    // Clear all timers first to prevent any pending processing
    for (const [phoneNumber, queue] of this.messageQueues) {
      if (queue.timer) {
        clearTimeout(queue.timer);
        console.log(`[WhatsApp Service] [MESSAGE QUEUE] Cleared timer for ${phoneNumber}`);
      }
    }
    
    // Clear all queues
    this.messageQueues.clear();
    
    console.log(`[WhatsApp Service] [MESSAGE QUEUE] Cleared all message queues on reconnection`);
    return clearedCount;
  }

  extractMessageText(message) {
    try {
      if (!message || !message.message) {
        console.log('[WhatsApp Service] [TEXT EXTRACTION] No message object');
        return null;
      }

      const msgContent = message.message;
      console.log('[WhatsApp Service] [TEXT EXTRACTION] Available message types:', Object.keys(msgContent));

      // Handle different message types with comprehensive coverage
      const textSources = [
        // Basic text messages
        msgContent.conversation,
        msgContent.extendedTextMessage?.text,
        
        // Media messages with captions
        msgContent.imageMessage?.caption,
        msgContent.videoMessage?.caption,
        msgContent.documentMessage?.caption,
        msgContent.audioMessage?.caption,
        
        // Button and template messages
        msgContent.buttonsMessage?.contentText,
        msgContent.templateMessage?.hydratedTemplate?.hydratedContentText,
        msgContent.listMessage?.description,
        
        // Interactive messages
        msgContent.buttonsResponseMessage?.selectedDisplayText,
        msgContent.listResponseMessage?.singleSelectReply?.selectedRowId,
        
        // Contact and location messages
        msgContent.contactMessage?.displayName,
        msgContent.locationMessage?.name,
        
        // Quoted messages
        msgContent.extendedTextMessage?.contextInfo?.quotedMessage?.conversation,
        
        // Ephemeral messages
        msgContent.ephemeralMessage?.message?.conversation,
        msgContent.ephemeralMessage?.message?.extendedTextMessage?.text,
        
        // View once messages
        msgContent.viewOnceMessage?.message?.conversation,
        msgContent.viewOnceMessage?.message?.extendedTextMessage?.text,
        
        // Protocol messages (sometimes contain text)
        msgContent.protocolMessage?.editedMessage?.conversation,
        
        // Sticker messages (may have text)
        msgContent.stickerMessage?.firstFrameLength ? '[Sticker]' : null,
        
        // Audio messages
        msgContent.audioMessage && msgContent.audioMessage.seconds ? '[Audio Message]' : null,
        
        // Document messages  
        msgContent.documentMessage?.fileName ? `[Document: ${msgContent.documentMessage.fileName}]` : null
      ];

      // Find first non-null, non-empty text
      for (const text of textSources) {
        if (text && typeof text === 'string' && text.trim().length > 0) {
          console.log('[WhatsApp Service] [TEXT EXTRACTION] Extracted text:', text.substring(0, 100));
          return text.trim();
        }
      }

      // If no text found, log the message structure for debugging
      console.log('[WhatsApp Service] [TEXT EXTRACTION] No text found in message, full structure:');
      console.log(JSON.stringify(msgContent, null, 2));

      return null;
    } catch (error) {
      console.error('[WhatsApp Service] Error extracting message text:', error);
      console.log('[WhatsApp Service] [TEXT EXTRACTION] Message causing error:', JSON.stringify(message, null, 2));
      return null;
    }
  }

  async sendResponse(sock, jid, text) {
    try {
      await sock.sendMessage(jid, { text });
    } catch (error) {
      console.error('[WhatsApp Service] Error sending response:', error);
      throw error;
    }
  }

  getConversationHistory(jid) {
    return this.conversationHistory.get(jid) || [];
  }

  updateConversationHistory(jid, newMessages) {
    let history = this.getConversationHistory(jid);
    history.push(...newMessages);
    
    // Keep only last 10 messages for context
    if (history.length > 10) {
      history = history.slice(-10);
    }
    
    this.conversationHistory.set(jid, history);
  }

  // Check if greeting cooldown is active for a phone number
  isGreetingOnCooldown(phoneNumber, cooldownHours) {
    const lastGreeting = this.greetingCooldowns.get(phoneNumber);
    
    if (!lastGreeting) {
      return false; // No previous greeting
    }
    
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const timeSinceLastGreeting = Date.now() - lastGreeting;
    
    return timeSinceLastGreeting < cooldownMs;
  }

  // Update greeting cooldown timestamp
  updateGreetingCooldown(phoneNumber) {
    this.greetingCooldowns.set(phoneNumber, Date.now());
    console.log(`[WhatsApp Service] Updated greeting cooldown for ${phoneNumber}`);
    // Save cooldowns after update
    this.saveCooldowns();
  }

  // Get time until next greeting is available (in hours)
  getTimeUntilNextGreeting(phoneNumber, cooldownHours) {
    const lastGreeting = this.greetingCooldowns.get(phoneNumber);
    
    if (!lastGreeting) {
      return 0; // No cooldown
    }
    
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const timeSinceLastGreeting = Date.now() - lastGreeting;
    const timeRemaining = cooldownMs - timeSinceLastGreeting;
    
    if (timeRemaining <= 0) {
      return 0;
    }
    
    return Math.ceil(timeRemaining / (60 * 60 * 1000)); // Return hours
  }

  // Clear cooldown for a specific phone number
  clearGreetingCooldown(phoneNumber) {
    this.greetingCooldowns.delete(phoneNumber);
    console.log(`[WhatsApp Service] Cleared greeting cooldown for ${phoneNumber}`);
  }

  // Get all active cooldowns
  getAllCooldowns() {
    const cooldowns = {};
    for (const [phone, timestamp] of this.greetingCooldowns) {
      cooldowns[phone] = {
        lastGreeting: new Date(timestamp).toISOString(),
        timestamp
      };
    }
    return cooldowns;
  }

  // Save cooldowns to file for persistence
  saveCooldowns() {
    try {
      const cooldowns = {};
      for (const [phone, timestamp] of this.greetingCooldowns) {
        cooldowns[phone] = timestamp;
      }
      
      fs.writeFileSync(cooldownsFile, JSON.stringify(cooldowns, null, 2));
      console.log(`[WhatsApp Service] Saved ${this.greetingCooldowns.size} cooldowns to file`);
    } catch (error) {
      console.error('[WhatsApp Service] Error saving cooldowns:', error);
    }
  }

  // Load cooldowns from file on startup
  loadCooldowns() {
    try {
      if (fs.existsSync(cooldownsFile)) {
        const data = fs.readFileSync(cooldownsFile, 'utf8');
        const cooldowns = JSON.parse(data);
        
        // Load cooldowns into memory
        for (const [phone, timestamp] of Object.entries(cooldowns)) {
          this.greetingCooldowns.set(phone, timestamp);
        }
        
        console.log(`[WhatsApp Service] Loaded ${this.greetingCooldowns.size} cooldowns from file`);
        
        // Clean up expired cooldowns
        this.cleanupExpiredCooldowns();
      } else {
        console.log('[WhatsApp Service] No existing cooldowns file found, starting fresh');
      }
    } catch (error) {
      console.error('[WhatsApp Service] Error loading cooldowns:', error);
    }
  }

  // Clean up expired cooldowns
  cleanupExpiredCooldowns() {
    const maxCooldownHours = 48; // Maximum possible cooldown in hours
    const maxCooldownMs = maxCooldownHours * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;
    
    for (const [phone, timestamp] of this.greetingCooldowns) {
      if (now - timestamp > maxCooldownMs) {
        this.greetingCooldowns.delete(phone);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[WhatsApp Service] Cleaned up ${cleaned} expired cooldowns`);
      this.saveCooldowns(); // Save after cleanup
    }
  }

  // Enhanced session persistence methods with file-based backup
  async loadSavedSessions() {
    console.log('[Session Persistence] Loading saved sessions on server startup...');
    
    let savedSessions = [];
    
    // First, scan sessions directory for physical auth folders (most reliable)
    try {
      if (fs.existsSync(phoneSessionsDir)) {
        const sessionFolders = fs.readdirSync(phoneSessionsDir);
        console.log(`[Session Persistence] Found session folders: ${sessionFolders.join(', ')}`)
        
        // Evaluate sessions with app-state files prioritized
        const sessionCandidates = [];
        
        for (const folderName of sessionFolders) {
          const folderPath = path.join(phoneSessionsDir, folderName);
          
          // Skip if not a directory
          if (!fs.statSync(folderPath).isDirectory()) continue;
          
          // Check if it contains auth files
          const credsFile = path.join(folderPath, 'creds.json');
          if (fs.existsSync(credsFile)) {
            console.log(`[Session Persistence] Found session folder with auth data: ${folderName}`);
            
            // Check for app-state files first (critical for restoration)
            const hasAppStateFiles = await this.hasAppStateFiles(folderPath);
            
            // Accept any folder name, prioritizing those with app-state files
            const sessionName = folderName;
            const phoneNumber = /^\d+$/.test(folderName) ? folderName : sessionName;
            
            // Always validate auth state, but collect sessions by priority
            const isAuthValid = await this.validateAuthState(folderPath);
            
            sessionCandidates.push({
              folderName: sessionName,
              phoneNumber: phoneNumber,
              folderPath: folderPath,
              hasAppStateFiles: hasAppStateFiles,
              isAuthValid: isAuthValid,
              priority: hasAppStateFiles ? 1 : 2 // Priority 1 = has app-state files
            });
            
            console.log(`[Session Persistence] Session candidate: ${sessionName} (app-state: ${hasAppStateFiles}, auth-valid: ${isAuthValid})`);
          }
        }
        
        // Sort by priority (sessions with app-state files first)
        sessionCandidates.sort((a, b) => a.priority - b.priority);
        
        // Add valid sessions to restoration list, prioritizing those with app-state files
        for (const candidate of sessionCandidates) {
          if (candidate.isAuthValid && candidate.hasAppStateFiles) {
            savedSessions.push({
              id: `session_${candidate.phoneNumber}`,
              phoneNumber: candidate.phoneNumber,
              status: 'CONNECTED',
              lastConnected: new Date().toISOString(),
              userId: 'system'
            });
            console.log(`[Session Persistence] ✅ PRIORITY session added for restoration: ${candidate.phoneNumber} (${candidate.folderName})`);
          } else {
            console.log(`[Session Persistence] ❌ Skipping session ${candidate.folderName}: app-state=${candidate.hasAppStateFiles}, auth-valid=${candidate.isAuthValid}`);
          }
        }
        console.log(`[Session Persistence] Found ${savedSessions.length} valid sessions from folder scan`);
      }
    } catch (scanError) {
      console.error('[Session Persistence] Session folder scan failed:', scanError.message);
    }
    
    // If no sessions found from folder scan, try file registry
    if (savedSessions.length === 0) {
      try {
        if (fs.existsSync(sessionRegistryFile)) {
          const fileData = fs.readFileSync(sessionRegistryFile, 'utf8');
          const registry = JSON.parse(fileData);
          savedSessions = Object.values(registry).filter(session => 
            (session.status === 'CONNECTED' || session.status === 'PENDING_RECONNECTION') && 
            session.phoneNumber
          );
          console.log(`[Session Persistence] Found ${savedSessions.length} sessions from file backup`);
        }
      } catch (fileError) {
        console.error('[Session Persistence] File backup also failed:', fileError.message);
      }
    }

    // Final fallback: scan sessions directory for physical auth folders
    if (savedSessions.length === 0) {
      console.log('[Session Persistence] No sessions found in database/registry, scanning sessions folder...');
      try {
        if (fs.existsSync(phoneSessionsDir)) {
          const sessionFolders = fs.readdirSync(phoneSessionsDir);
          console.log(`[Session Persistence] Found session folders: ${sessionFolders.join(', ')}`);
          
          // Apply same enhanced logic to fallback scan
          const fallbackCandidates = [];
          
          for (const folderName of sessionFolders) {
            const folderPath = path.join(phoneSessionsDir, folderName);
            
            // Skip if not a directory
            if (!fs.statSync(folderPath).isDirectory()) continue;
            
            // Check if it contains auth files
            const credsFile = path.join(folderPath, 'creds.json');
            if (fs.existsSync(credsFile)) {
              console.log(`[Session Persistence] FALLBACK: Found session folder with auth data: ${folderName}`);
              
              // Check for app-state files first (critical for restoration)
              const hasAppStateFiles = await this.hasAppStateFiles(folderPath);
              
              // Accept any folder name, prioritizing those with app-state files
              const sessionName = folderName;
              const phoneNumber = /^\d+$/.test(folderName) ? folderName : sessionName;
              
              fallbackCandidates.push({
                folderName: sessionName,
                phoneNumber: phoneNumber,
                folderPath: folderPath,
                hasAppStateFiles: hasAppStateFiles,
                priority: hasAppStateFiles ? 1 : 2 // Priority 1 = has app-state files
              });
              
              console.log(`[Session Persistence] FALLBACK: Session candidate: ${sessionName} (app-state: ${hasAppStateFiles})`);
            }
          }
          
          // Sort by priority and add sessions with app-state files
          fallbackCandidates.sort((a, b) => a.priority - b.priority);
          
          for (const candidate of fallbackCandidates) {
            if (candidate.hasAppStateFiles) {
              savedSessions.push({
                id: `session_${candidate.phoneNumber}`,
                phoneNumber: candidate.phoneNumber,
                status: 'CONNECTED',
                lastConnected: new Date().toISOString(),
                userId: 'system'
              });
              console.log(`[Session Persistence] ✅ FALLBACK: Added priority session for restoration: ${candidate.phoneNumber} (${candidate.folderName})`);
            } else {
              console.log(`[Session Persistence] ❌ FALLBACK: Skipping session ${candidate.folderName}: no app-state files`);
            }
          }
          console.log(`[Session Persistence] Found ${savedSessions.length} sessions from folder scan`);
        }
      } catch (scanError) {
        console.error('[Session Persistence] Session folder scan failed:', scanError.message);
        return;
      }
    }

    if (savedSessions.length === 0) {
      console.log('[Session Persistence] No sessions to restore');
      return;
    }

    console.log(`[Session Persistence] Starting automatic restoration of ${savedSessions.length} sessions...`);

    for (const session of savedSessions) {
      try {
        console.log(`[Session Persistence] AUTO-RESTORING session for ${session.phoneNumber}`);
        
        // Check if session is already active to prevent duplicates
        if (this.sessions[session.phoneNumber] || connections.has(`phone_${session.phoneNumber}`)) {
          console.log(`⚠️ [Session Persistence] Session for ${session.phoneNumber} already exists, skipping duplicate`);
          continue;
        }
        
        // Check if session files exist and validate auth state
        const phoneSessionPath = path.join(phoneSessionsDir, session.phoneNumber);
        const credsFile = path.join(phoneSessionPath, 'creds.json');
        
        console.log(`[Session Persistence] Checking auth files at: ${phoneSessionPath}`);
        
        if (fs.existsSync(phoneSessionPath) && fs.existsSync(credsFile)) {
          // Validate auth state before attempting restoration
          const isAuthValid = await this.validateAuthState(phoneSessionPath);
          if (!isAuthValid) {
            console.log(`⚠️ [Session Persistence] Auth state corrupted for ${session.phoneNumber}, cleaning up...`);
            await this.cleanupCorruptedSession(session.phoneNumber);
            continue;
          }
          
          console.log(`[Session Persistence] Found valid auth files for ${session.phoneNumber}, auto-restoring connection...`);
          
          // Mark session as connecting
          await this.saveSessionToStorage(session.phoneNumber, session.id, 'CONNECTING');

          // Initialize session with existing auth state immediately
          // Enhanced error handling for 'Cannot read properties of undefined (reading map)' errors
          let sock;
          try {
            console.log(`[Session Restoration] 🔄 Initializing session with validated auth state for ${session.phoneNumber}`);
            sock = await this.initializeSessionWithPhoneNumber(session.phoneNumber, session.id);
            console.log(`[Session Restoration] ✅ Session initialization completed successfully for ${session.phoneNumber}`);
          } catch (initError) {
            console.error(`[Session Restoration] ❌ Failed to initialize session for ${session.phoneNumber}:`, initError.message);
            
            // Check for specific auth state corruption errors
            if (initError.message.includes('Cannot read properties of undefined (reading \'map\')')) {
              console.log(`[Session Restoration] 🧹 Detected auth state corruption ('map' error) for ${session.phoneNumber}, cleaning up...`);
              await this.cleanupCorruptedSession(session.phoneNumber);
              await this.saveSessionToStorage(session.phoneNumber, session.id, 'DISCONNECTED');
              continue; // Skip to next session
            }
            
            // For other errors, mark as disconnected and continue
            await this.saveSessionToStorage(session.phoneNumber, session.id, 'DISCONNECTED');
            continue;
          }
          
          // Important: Store the session immediately for status checks
          const sessionKey = `phone_${session.phoneNumber}`;
          if (!connections.has(sessionKey)) {
            connections.set(sessionKey, {
              sock,
              phoneNumber: session.phoneNumber,
              sessionPath: phoneSessionPath,
              status: 'connecting',
              isConnected: false,
              connectionStartTime: Date.now()
            });
          }
          
          console.log(`✅ [Session Persistence] Successfully initiated auto-restoration for ${session.phoneNumber}`);
          console.log(`   - Session will reconnect automatically without manual intervention`);
          console.log(`   - Message handler is active and ready`);
        } else {
          console.log(`⚠️ [Session Persistence] Session auth files not found for ${session.phoneNumber} at ${phoneSessionPath}`);
          console.log(`   - Directory exists: ${fs.existsSync(phoneSessionPath)}`);
          console.log(`   - Creds.json exists: ${fs.existsSync(credsFile)}`);
          await this.saveSessionToStorage(session.phoneNumber, session.id, 'DISCONNECTED');
        }
      } catch (error) {
        console.error(`❌ [Session Persistence] Error restoring session for ${session.phoneNumber}:`, error);
        await this.saveSessionToStorage(session.phoneNumber, session.id, 'DISCONNECTED');
      }
    }

    console.log(`[Session Persistence] Completed automatic session restoration process`);
    console.log(`[Session Persistence] Active sessions will reconnect without manual intervention`);
  }

  async hasAppStateFiles(sessionPath) {
    try {
      const allFiles = fs.readdirSync(sessionPath);
      const appStateSyncFiles = allFiles.filter(file => 
        file.startsWith('app-state-sync-key-') || 
        file.startsWith('app-state-sync-version-')
      );
      return appStateSyncFiles.length > 0;
    } catch (error) {
      console.error(`[App State Check] Error checking ${sessionPath}:`, error.message);
      return false;
    }
  }

  async validateAuthState(sessionPath) {
    try {
      const credsFile = path.join(sessionPath, 'creds.json');
      
      // Check if essential files exist
      if (!fs.existsSync(credsFile)) {
        console.log(`[Auth Validation] Missing creds.json in ${sessionPath}`);
        return false;
      }
      
      // Try to parse credentials file - be more lenient for sessions with app-state files
      const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
      
      // Check for essential authentication data - allow incomplete auth if app-state files exist
      const hasAppStateFiles = await this.hasAppStateFiles(sessionPath);
      if (!hasAppStateFiles && (!creds.me || !creds.me.id)) {
        console.log(`[Auth Validation] Invalid credentials structure and no app-state files in ${sessionPath}`);
        return false;
      }
      
      // Read all files in the session directory
      const allFiles = fs.readdirSync(sessionPath);
      
      // Check for at least one session file
      const sessionFiles = allFiles.filter(file => file.startsWith('session-'));
      if (sessionFiles.length === 0) {
        console.log(`[Auth Validation] No session files found in ${sessionPath}`);
        return false;
      }
      
      // CRITICAL: Check for app-state-sync files (required to prevent 'map' error)
      const appStateSyncFiles = allFiles.filter(file => file.startsWith('app-state-sync-key-'));
      if (appStateSyncFiles.length === 0) {
        console.log(`[Auth Validation] ⚠️ Missing app-state-sync-key files in ${sessionPath} - this causes 'Cannot read properties of undefined (reading map)' errors`);
        return false;
      }
      
      console.log(`[Auth Validation] ✅ Auth state valid for ${sessionPath} (${sessionFiles.length} session files, ${appStateSyncFiles.length} app-state-sync files)`);
      return true;
    } catch (error) {
      console.error(`[Auth Validation] Error validating ${sessionPath}:`, error.message);
      return false;
    }
  }

  async cleanupCorruptedSession(phoneNumber) {
    try {
      console.log(`[Session Cleanup] Cleaning up corrupted session for ${phoneNumber}`);
      
      const sessionPath = path.join(phoneSessionsDir, phoneNumber);
      
      // Remove from memory
      if (this.sessions[phoneNumber]) {
        try {
          this.sessions[phoneNumber].sock?.end();
        } catch (e) {
          // Ignore socket cleanup errors
        }
        delete this.sessions[phoneNumber];
      }
      
      // Remove from file registry
      await this.removeSessionFromFile(phoneNumber);
      
      // Remove session directory
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`[Session Cleanup] Removed corrupted session directory: ${sessionPath}`);
      }
      
      console.log(`[Session Cleanup] Completed cleanup for ${phoneNumber}`);
    } catch (error) {
      console.error(`[Session Cleanup] Error cleaning up ${phoneNumber}:`, error);
    }
  }

  async saveSessionToStorage(phoneNumber, sessionId, status = 'CONNECTED') {
    const sessionData = {
      id: sessionId,
      phoneNumber: phoneNumber,
      status: status,
      lastConnected: new Date().toISOString(),
      userId: 'system'
    };

    // Always save to file backup first (most reliable)
    this.saveSessionToFile(phoneNumber, sessionData);
    
    // Skip database save for now to focus on connection stability
    // File-based persistence is sufficient until foreign key issues are resolved
    console.log(`[Session Persistence] Saved session for ${phoneNumber} with status ${status} (File Only)`);
  }

  saveSessionToFile(phoneNumber, sessionData) {
    try {
      let registry = {};
      
      // Load existing registry
      if (fs.existsSync(sessionRegistryFile)) {
        const fileData = fs.readFileSync(sessionRegistryFile, 'utf8');
        registry = JSON.parse(fileData);
      }
      
      // Update registry
      registry[phoneNumber] = sessionData;
      
      // Save registry synchronously to ensure persistence
      fs.writeFileSync(sessionRegistryFile, JSON.stringify(registry, null, 2));
      console.log(`[Session Persistence] [FILE WRITE] Synchronously saved session registry for ${phoneNumber}`);
      
      // Verify file was written
      if (fs.existsSync(sessionRegistryFile)) {
        const verifyData = fs.readFileSync(sessionRegistryFile, 'utf8');
        const verifyRegistry = JSON.parse(verifyData);
        if (verifyRegistry[phoneNumber]) {
          console.log(`[Session Persistence] [FILE WRITE] Verified session ${phoneNumber} exists in registry`);
        } else {
          console.error(`[Session Persistence] [FILE WRITE] Failed to verify session ${phoneNumber} in registry`);
        }
      }
      
    } catch (error) {
      console.error(`[Session Persistence] [FILE WRITE] Failed to save to file registry:`, error);
    }
  }

  async removeSessionFromFile(phoneNumber) {
    try {
      let registry = {};
      
      // Load existing registry
      if (fs.existsSync(sessionRegistryFile)) {
        const fileData = fs.readFileSync(sessionRegistryFile, 'utf8');
        registry = JSON.parse(fileData);
      }
      
      // Remove session from registry
      delete registry[phoneNumber];
      
      // Save registry synchronously
      fs.writeFileSync(sessionRegistryFile, JSON.stringify(registry, null, 2));
      console.log(`[Session Persistence] [FILE WRITE] Synchronously removed session ${phoneNumber} from registry`);
      
    } catch (error) {
      console.error(`[Session Persistence] [FILE WRITE] Failed to remove session from file registry:`, error);
    }
  }

  cleanupOldBackups(sessionPath) {
    try {
      const files = fs.readdirSync(sessionPath);
      const backupFiles = files.filter(file => file.startsWith('creds_backup_')).sort();
      
      // Keep only the latest 3 backups
      if (backupFiles.length > 3) {
        const filesToDelete = backupFiles.slice(0, backupFiles.length - 3);
        filesToDelete.forEach(file => {
          const filePath = path.join(sessionPath, file);
          fs.unlinkSync(filePath);
          console.log(`[Session Persistence] [FILE WRITE] Cleaned up old backup: ${file}`);
        });
      }
    } catch (error) {
      console.error(`[Session Persistence] Error cleaning up old backups:`, error);
    }
  }

  async verifySessionFiles(phoneNumber) {
    try {
      const sessionPath = path.join(phoneSessionsDir, phoneNumber);
      const credsPath = path.join(sessionPath, 'creds.json');
      
      console.log(`[Session Persistence] [FILE VERIFY] Verifying session files for ${phoneNumber}`);
      
      if (!fs.existsSync(sessionPath)) {
        console.error(`[Session Persistence] [FILE VERIFY] Session directory missing: ${sessionPath}`);
        return false;
      }
      
      if (!fs.existsSync(credsPath)) {
        console.error(`[Session Persistence] [FILE VERIFY] creds.json missing: ${credsPath}`);
        return false;
      }
      
      // Verify creds.json is valid JSON
      try {
        const credsData = fs.readFileSync(credsPath, 'utf8');
        const creds = JSON.parse(credsData);
        if (!creds.me || !creds.me.id) {
          console.error(`[Session Persistence] [FILE VERIFY] Invalid creds.json structure for ${phoneNumber}`);
          return false;
        }
        console.log(`[Session Persistence] [FILE VERIFY] Valid creds.json found for ${phoneNumber} (${credsData.length} bytes)`);
      } catch (parseError) {
        console.error(`[Session Persistence] [FILE VERIFY] creds.json parse error for ${phoneNumber}:`, parseError);
        return false;
      }
      
      // Check for session files
      const sessionFiles = fs.readdirSync(sessionPath).filter(file => file.startsWith('session-'));
      console.log(`[Session Persistence] [FILE VERIFY] Found ${sessionFiles.length} session files for ${phoneNumber}: ${sessionFiles.join(', ')}`);
      
      return true;
    } catch (error) {
      console.error(`[Session Persistence] [FILE VERIFY] Error verifying session files for ${phoneNumber}:`, error);
      return false;
    }
  }

  async markSessionForReconnection(phoneNumber) {
    console.log(`[Session Persistence] Marking session ${phoneNumber} for reconnection`);
    
    // Update file registry
    try {
      let registry = {};
      if (fs.existsSync(sessionRegistryFile)) {
        const fileData = fs.readFileSync(sessionRegistryFile, 'utf8');
        registry = JSON.parse(fileData);
      }
      
      if (registry[phoneNumber]) {
        registry[phoneNumber].status = 'PENDING_RECONNECTION';
        registry[phoneNumber].lastConnected = new Date().toISOString();
        fs.writeFileSync(sessionRegistryFile, JSON.stringify(registry, null, 2));
        console.log(`[Session Persistence] File registry marked ${phoneNumber} for reconnection`);
      }
    } catch (error) {
      console.error(`[Session Persistence] Failed to update file registry:`, error);
    }
    
    // Try database update
    try {
      const session = await prisma.whatsAppSession.findFirst({
        where: { phoneNumber: phoneNumber }
      });

      if (session) {
        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { status: 'PENDING_RECONNECTION' }
        });
        console.log(`[Session Persistence] Database marked ${phoneNumber} for reconnection`);
      }
    } catch (error) {
      console.warn(`[Session Persistence] Database mark failed for ${phoneNumber}:`, error.message);
    }
  }

  async clearSessionCompletely(phoneNumber, sessionId) {
    console.log(`[Session Cleanup] 🧹 Starting complete session cleanup for ${phoneNumber} (${sessionId})`);
    
    try {
      // Step 1: Close active socket connection safely
      if (sessionId && connections.has(sessionId)) {
        const connection = connections.get(sessionId);
        if (connection && connection.sock) {
          try {
            console.log(`[Session Cleanup] Gracefully closing socket for ${phoneNumber}`);
            
            // Try to logout gracefully first
            if (typeof connection.sock.logout === 'function') {
              await Promise.race([
                connection.sock.logout(),
                new Promise(resolve => setTimeout(resolve, 3000)) // 3s timeout
              ]);
            }
            
            // Force end the socket
            if (typeof connection.sock.end === 'function') {
              connection.sock.end();
            }
            
            console.log(`[Session Cleanup] ✅ Socket closed for ${phoneNumber}`);
          } catch (socketError) {
            console.warn(`[Session Cleanup] ⚠️ Socket close warning for ${phoneNumber}:`, socketError.message);
          }
        }
      }
      
      // Step 2: Clear all memory references
      console.log(`[Session Cleanup] Clearing memory references for ${phoneNumber}`);
      connections.delete(sessionId);
      qrCodes.delete(sessionId);
      heartbeatIntervals.delete(sessionId);
      retryAttempts.delete(sessionId);
      connectionBuffers.delete(sessionId);
      
      // Clear auth state cache
      if (this.authStateCache) {
        this.authStateCache.delete(sessionId);
        console.log(`[Session Cleanup] Cleared auth state cache for ${sessionId}`);
      }
      
      // Clear conversation history
      if (phoneNumber && this.conversationHistory) {
        this.conversationHistory.delete(phoneNumber);
        console.log(`[Session Cleanup] Cleared conversation history for ${phoneNumber}`);
      }
      
      // Clear greeting cooldowns
      if (phoneNumber && this.greetingCooldowns) {
        this.greetingCooldowns.delete(phoneNumber);
        console.log(`[Session Cleanup] Cleared greeting cooldowns for ${phoneNumber}`);
      }
      
      // Clear conflict counts
      if (phoneNumber && this.conflictCounts) {
        this.conflictCounts.delete(phoneNumber);
        console.log(`[Session Cleanup] Cleared conflict counts for ${phoneNumber}`);
      }
      
      // Clear message queues
      if (phoneNumber && this.messageQueues) {
        const queue = this.messageQueues.get(phoneNumber);
        if (queue && queue.timer) {
          clearTimeout(queue.timer);
        }
        this.messageQueues.delete(phoneNumber);
        console.log(`[Session Cleanup] Cleared message queues for ${phoneNumber}`);
      }
      
      // Clear sessions map
      if (phoneNumber && this.sessions) {
        delete this.sessions[phoneNumber];
        console.log(`[Session Cleanup] Cleared sessions map for ${phoneNumber}`);
      }
      
      // Step 3: Remove from file registry
      if (phoneNumber) {
        try {
          let registry = {};
          if (fs.existsSync(sessionRegistryFile)) {
            const fileData = fs.readFileSync(sessionRegistryFile, 'utf8');
            registry = JSON.parse(fileData);
          }
          
          delete registry[phoneNumber];
          fs.writeFileSync(sessionRegistryFile, JSON.stringify(registry, null, 2));
          console.log(`[Session Cleanup] ✅ Removed ${phoneNumber} from file registry`);
        } catch (error) {
          console.error(`[Session Cleanup] ❌ Failed to remove from file registry:`, error.message);
        }
      }
      
      // Step 4: Remove from database
      if (phoneNumber) {
        try {
          await prisma.whatsAppSession.deleteMany({
            where: { phoneNumber: phoneNumber }
          });
          console.log(`[Session Cleanup] ✅ Removed ${phoneNumber} from database`);
        } catch (error) {
          console.warn(`[Session Cleanup] ⚠️ Database removal warning for ${phoneNumber}:`, error.message);
        }
      }
      
      // Step 5: Remove session files (both old and new formats)
      const sessionPathsToClean = [];
      
      // Phone-based session path (new format)
      if (phoneNumber) {
        sessionPathsToClean.push(path.join(phoneSessionsDir, phoneNumber));
      }
      
      // Session ID-based path (old format)
      if (sessionId) {
        sessionPathsToClean.push(path.join(sessionsDir, sessionId));
      }
      
      for (const sessionPath of sessionPathsToClean) {
        try {
          if (fs.existsSync(sessionPath)) {
            // Get file count before deletion for logging
            const files = fs.readdirSync(sessionPath);
            const fileCount = files.length;
            
            console.log(`[Session Cleanup] Removing ${fileCount} files from: ${sessionPath}`);
            
            // Remove only files and subdirectories, but keep the main directory
            // This prevents ENOENT errors when Baileys tries to save credentials
            for (const file of files) {
              const filePath = path.join(sessionPath, file);
              try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                  fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                  fs.unlinkSync(filePath);
                }
              } catch (fileError) {
                console.warn(`[Session Cleanup] ⚠️ Could not remove ${filePath}:`, fileError.message);
              }
            }
            
            console.log(`[Session Cleanup] ✅ Removed ${fileCount} session files from ${sessionPath} (directory preserved)`);
          } else {
            console.log(`[Session Cleanup] ℹ️ Session path does not exist: ${sessionPath}`);
          }
        } catch (error) {
          console.error(`[Session Cleanup] ❌ Failed to remove session files from ${sessionPath}:`, error.message);
        }
      }
      
      // Step 6: Force garbage collection if available
      if (global.gc) {
        try {
          global.gc();
          console.log(`[Session Cleanup] ✅ Forced garbage collection`);
        } catch (gcError) {
          console.warn(`[Session Cleanup] ⚠️ Garbage collection warning:`, gcError.message);
        }
      }
      
      console.log(`[Session Cleanup] 🎉 Complete session cleanup finished for ${phoneNumber || sessionId}`);
      
    } catch (error) {
      console.error(`[Session Cleanup] ❌ Error during complete session cleanup:`, error);
      throw error; // Re-throw to ensure callers know cleanup failed
    }
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n[Session Persistence] Received ${signal}, saving sessions...`);
      
      try {
        // Force save ALL session files for active sessions
        console.log(`[Session Persistence] Force saving ${connections.size} active sessions before shutdown...`);
        let savedSessions = 0;
        
        for (const [sessionId, connection] of connections) {
          if (connection.phoneNumber && connection.status === 'connected') {
            try {
              console.log(`[Session Persistence] Force saving session for ${connection.phoneNumber}...`);
              
              // Try to get saveCreds from the connection or create it
              let saveCreds = connection.saveCreds;
              if (!saveCreds && connection.state) {
                // Create saveCreds from the auth state if needed
                const sessionPath = path.join(phoneSessionsDir, connection.phoneNumber);
                const { saveCreds: stateSaveCreds } = await useMultiFileAuthState(sessionPath);
                saveCreds = stateSaveCreds;
              }
              
              if (saveCreds) {
                const saveResult = await this.forceSaveSessionFiles(connection.phoneNumber, saveCreds);
                if (saveResult.success) {
                  console.log(`✅ [Session Persistence] Saved session for ${connection.phoneNumber}: ${saveResult.files.length} files`);
                  savedSessions++;
                } else {
                  console.error(`❌ [Session Persistence] Failed to save session for ${connection.phoneNumber}:`, saveResult.error);
                }
              } else {
                console.warn(`⚠️ [Session Persistence] No saveCreds available for ${connection.phoneNumber}`);
              }
              
              // Also mark for reconnection
              await this.markSessionForReconnection(connection.phoneNumber);
              
            } catch (sessionError) {
              console.error(`[Session Persistence] Error saving session for ${connection.phoneNumber}:`, sessionError);
            }
          }
        }
        
        console.log(`[Session Persistence] Successfully saved ${savedSessions}/${connections.size} sessions`);
        
        // Save cooldowns
        this.saveCooldowns();
        
        console.log('[Session Persistence] All sessions saved for reconnection');
        
        // Close database connection
        await prisma.$disconnect();
        
        process.exit(0);
      } catch (error) {
        console.error('[Session Persistence] Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    console.log('[Session Persistence] Graceful shutdown handlers set up');
  }

  async initializeSessionWithPhoneNumber(phoneNumber, sessionId = null) {
    try {
      const actualSessionId = sessionId || `phone_${phoneNumber}`;
      
      // Use phone number based session path
      const sessionPath = path.join(phoneSessionsDir, phoneNumber);
      
      console.log(`[Session Persistence] Initializing session for ${phoneNumber} at ${sessionPath}`);
      
      // Ensure session directory exists
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
        console.log(`[Session Persistence] Created session directory for ${phoneNumber}`);
      }

      // Load session data with corruption detection
      let state, saveCreds;
      
      try {
        console.log(`[Session Init] Loading auth state for ${phoneNumber}...`);
        
        // Validate session path and files before loading
        if (!fs.existsSync(sessionPath)) {
          throw new Error(`Session path does not exist: ${sessionPath}`);
        }
        
        const credsPath = path.join(sessionPath, 'creds.json');
        if (!fs.existsSync(credsPath)) {
          throw new Error(`Credentials file missing: ${credsPath}`);
        }
        
        // Protected auth state loading with enhanced error handling
        let authState;
        try {
          authState = await useMultiFileAuthState(sessionPath);
        } catch (authLoadError) {
          console.error(`[Session Init] ❌ Auth state loading failed for ${phoneNumber}:`, authLoadError.message);
          if (authLoadError.message.includes("Cannot read properties of undefined (reading 'map')")) {
            console.error(`[Session Init] ❌ Detected corrupted auth state keys for ${phoneNumber} - forcing cleanup`);
            throw new Error('AUTH_STATE_CORRUPTED: Auth state keys are corrupted and cannot be loaded');
          }
          throw authLoadError;
        }
        
        if (!authState || !authState.state) {
          throw new Error(`Invalid auth state returned for ${phoneNumber}`);
        }
        
        state = authState.state;
        saveCreds = authState.saveCreds;
        
        // Enhanced validation of auth state integrity after successful load
        if (!state || !state.keys) {
          console.error(`[Session Init] ❌ Invalid auth state keys for ${phoneNumber}: state.keys is missing`);
          throw new Error('AUTH_STATE_CORRUPTED: Missing auth state keys');
        }
        
        if (typeof state.keys.get !== 'function') {
          console.error(`[Session Init] ❌ Invalid auth state keys for ${phoneNumber}: keys.get is not a function`);
          throw new Error('AUTH_STATE_CORRUPTED: Auth state keys.get method is missing');
        }
        
        // Additional validation: test the keys.get function
        try {
          // Test that the keys.get function works before proceeding
          await state.keys.get('test-key-validation');
          console.log(`[Session Init] ✅ Auth state keys validation passed for ${phoneNumber}`);
        } catch (keysTestError) {
          console.error(`[Session Init] ❌ Auth state keys.get test failed for ${phoneNumber}:`, keysTestError.message);
          if (keysTestError.message.includes("Cannot read properties of undefined (reading 'map')")) {
            throw new Error('AUTH_STATE_CORRUPTED: Auth state keys.get function is corrupted');
          }
          // If it's just a normal "key not found" error, that's fine
          console.log(`[Session Init] ✅ Auth state keys test completed for ${phoneNumber} (key not found is normal)`);
        }
        
        if (!state.keys || typeof state.keys.get !== 'function') {
          throw new Error('Auth state validation failed - missing keys or get function');
        }
        
        console.log(`[Session Init] ✅ Auth state loaded successfully for ${phoneNumber}`);
        
      } catch (loadError) {
        console.warn(`[Session Init] ⚠️ Failed to load auth state for ${phoneNumber}:`, loadError.message);
        console.log(`[Session Init] This indicates corrupted or incomplete session files`);
        
        // Clear corrupted session completely
        console.log(`[Session Init] 🧹 Clearing corrupted session for ${phoneNumber}...`);
        await this.clearSessionCompletely(phoneNumber, actualSessionId);
        
        // Load fresh auth state after cleanup
        console.log(`[Session Init] 🔄 Loading fresh auth state for ${phoneNumber}...`);
        try {
          const freshAuthState = await useMultiFileAuthState(sessionPath);
          state = freshAuthState.state;
          saveCreds = freshAuthState.saveCreds;
          console.log(`[Session Init] ✅ Fresh auth state loaded for ${phoneNumber}`);
        } catch (freshLoadError) {
          console.error(`[Session Init] ❌ Failed to load fresh auth state for ${phoneNumber}:`, freshLoadError.message);
          throw freshLoadError;
        }
      }
      
      // Create socket with enhanced configuration for decryption stability
      console.log(`[Socket Init] Creating enhanced socket for ${phoneNumber} with signal protocol support...`);
      
      let sock;
      try {
        sock = makeWASocket({
          auth: state,
          printQRInTerminal: false,
          browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
          logger: logger,
          version: (await fetchLatestBaileysVersion()).version,
          markOnlineOnConnect: false,
          generateHighQualityLinkPreview: true,
          syncFullHistory: false,
          shouldSyncHistoryMessage: () => false,
          makeSignalRepository: makeCacheableSignalKeyStore,
          // Enhanced signal protocol configuration for decryption stability
          getMessage: async (key) => {
            // This helps with message decryption by providing historical messages if needed
            return null;
          },
          // Ensure proper retry mechanism for failed decryptions
          retryRequestDelayMs: 250,
          maxMsgRetryCount: 3,
        // Enhanced message receipt handling
        markOnlineOnConnect: false,
        fireInitQueries: true,
        // Improved auth state handling
        shouldIgnoreJid: () => false,
        // Better connection recovery
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        // Enhanced message processing
        emitOwnEvents: true,
        generateHighQualityLinkPreview: false,
        patchMessageBeforeSending: (message) => {
          // Add message ID for tracking
          message.messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          return message;
        }
        });
      } catch (socketError) {
        console.error(`[Socket Init] ❌ Socket creation failed for ${phoneNumber}:`, socketError.message);
        
        // Check for specific error types
        if (socketError.message.includes("Cannot read properties of undefined (reading 'map')")) {
          console.error(`[Socket Init] ❌ Detected corrupted auth state keys for ${phoneNumber} - signal protocol data corrupted`);
          throw new Error('SOCKET_AUTH_CORRUPTED: Auth state keys are corrupted and cannot be used for socket creation');
        }
        
        // Generic socket creation error
        throw new Error(`SOCKET_CREATION_FAILED: ${socketError.message}`);
      }
      
      // Fix signal protocol functions after restoration
      console.log(`[Socket Init] ✅ Socket initialized for ${phoneNumber} - checking signal protocol`);
      
      // Verify auth state is properly loaded and add signal repository if missing
      if (sock.authState && sock.authState.keys) {
        console.log(`[Socket Init] ✅ Auth state keys properly loaded for ${phoneNumber}`);
        
        // Check and add signal repository if missing to prevent decryptMessage errors
        try {
          let hasSignalRepo = false;
          
          // First validate that the keys object is properly formed
          if (!sock.authState || !sock.authState.keys) {
            console.warn(`[Socket Init] ⚠️ Missing auth state or keys for ${phoneNumber}`);
            hasSignalRepo = false;
          } else if (typeof sock.authState.keys.get !== 'function') {
            console.warn(`[Socket Init] ⚠️ Keys object missing get method for ${phoneNumber} - likely corrupted`);
            hasSignalRepo = false;
          } else {
            try {
              // Try to check if signal repository exists
              const existingRepo = sock.authState.keys.get('signal-repository');
              hasSignalRepo = !!existingRepo;
              console.log(`[Socket Init] 🔍 Signal repository check for ${phoneNumber}: ${hasSignalRepo ? 'exists' : 'missing'}`);
            } catch (getError) {
              console.warn(`[Socket Init] ⚠️ Error checking signal repository for ${phoneNumber}:`, getError.message);
              hasSignalRepo = false;
            }
          }
          
          if (!hasSignalRepo) {
            console.log(`[Socket Init] 🔧 Adding signal repository for ${phoneNumber}...`);
            try {
              const signalRepository = makeLibSignalRepository(sock.authState.keys);
              sock.authState.keys.set('signal-repository', signalRepository);
              console.log(`[Socket Init] ✅ Signal repository added for ${phoneNumber}`);
            } catch (addError) {
              console.error(`[Socket Init] ❌ Failed to add signal repository for ${phoneNumber}:`, addError.message);
            }
          } else {
            console.log(`[Socket Init] ✅ Signal repository already exists for ${phoneNumber}`);
          }
        } catch (error) {
          console.warn(`[Socket Init] ⚠️ Could not verify/add signal repository for ${phoneNumber}:`, error.message);
        }
      } else {
        console.error(`[Socket Init] ❌ Auth state or keys missing for ${phoneNumber}`);
      }

      // Apply stub functions to prevent crashes from missing signal functions
      // TEMPORARILY DISABLED: this.createSignalStubFunctions(sock);
      
      // Store phone number in socket for recovery purposes
      sock.phoneNumber = phoneNumber;

      // Store connection with phone number
      connections.set(actualSessionId, {
        sock,
        phoneNumber: phoneNumber,
        sessionPath: sessionPath,
        saveCreds: saveCreds,
        status: 'connecting',
        qrStartTime: Date.now(),
        lastPing: null,
        connectionStartTime: Date.now(),
        reconnectAttempts: 0,
        isStable: false,
        qrScanInProgress: false,
        preserveQRState: null,
        isConnected: false
      });
      
      // Also store in the main sessions tracking
      this.sessions[phoneNumber] = {
        sock,
        phoneNumber: phoneNumber,
        sessionPath: sessionPath,
        saveCreds: saveCreds,
        status: 'connecting'
      };

      // Set up enhanced connection handler for persistent sessions
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const conn = connections.get(actualSessionId);
        
        console.log(`[Session Persistence] Connection update for ${phoneNumber}:`, { connection, hasQR: !!qr });
        
        if (connection === 'open') {
          console.log(`✅ [Session Persistence] Auto-reconnected session for ${phoneNumber}`);
          
          // Clear conflict count on successful connection
          if (this.conflictCounts.has(phoneNumber)) {
            console.log(`[Session Persistence] Clearing conflict count for ${phoneNumber} after successful connection`);
            this.conflictCounts.delete(phoneNumber);
          }
          
          // Update connection status
          if (conn) {
            conn.status = 'connected';
            conn.isConnected = true;
            conn.phoneNumber = phoneNumber;
            conn.lastConnected = Date.now();
          }
          
          // Update the sessions tracking
          if (this.sessions[phoneNumber]) {
            this.sessions[phoneNumber].status = 'connected';
          }
          
          // Save to storage immediately with verification
          await this.saveSessionToStorage(phoneNumber, actualSessionId, 'CONNECTED');
          
          // Force save ALL auth state files immediately on connection open
          try {
            console.log(`[Session Persistence] [FILE WRITE] Starting comprehensive session save for ${phoneNumber}`);
            
            // Use our enhanced forceSaveSessionFiles function to save ALL auth state files
            const saveResult = await this.forceSaveSessionFiles(phoneNumber, saveCreds);
            
            if (saveResult.success) {
              console.log(`✅ [Session Persistence] [FILE WRITE] Comprehensive session save completed for ${phoneNumber}`);
              console.log(`[Session Persistence] [FILE WRITE] Saved files:`, saveResult.files.map(f => `${f.name} (${f.size} bytes)`).join(', '));
              
              // Verify all session files exist with detailed reporting
              const verified = await this.verifySessionFiles(phoneNumber);
              if (verified) {
                console.log(`✅ [Session Persistence] All session files verified for ${phoneNumber}`);
              } else {
                console.error(`❌ [Session Persistence] Session file verification failed for ${phoneNumber}`);
              }
            } else {
              console.error(`❌ [Session Persistence] [FILE WRITE] Session save failed for ${phoneNumber}:`, saveResult.error);
            }
            
          } catch (saveError) {
            console.error(`❌ [Session Persistence] [FILE WRITE] Error in comprehensive session save:`, saveError);
          }
          
          // Set up heartbeat
          this.setupWebSocketHeartbeat(actualSessionId, sock);
          
        } else if (connection === 'close') {
          const disconnectReason = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = disconnectReason !== DisconnectReason.loggedOut;
          
          console.log(`[Session Persistence] Session ${phoneNumber} disconnected. Reason: ${disconnectReason}, Reconnect: ${shouldReconnect}`);
          
          // Handle conflict/replacement error specifically (440)
          if (disconnectReason === 440) {
            console.log(`⚠️ [Session Persistence] Conflict detected for ${phoneNumber} - session replaced elsewhere`);
            
            // Update conflict count and calculate exponential backoff delay
            const conflictInfo = this.conflictCounts.get(phoneNumber) || { count: 0, lastConflict: 0 };
            const now = Date.now();
            
            // Reset count if last conflict was more than 5 minutes ago
            if (now - conflictInfo.lastConflict > 5 * 60 * 1000) {
              conflictInfo.count = 0;
            }
            
            conflictInfo.count++;
            conflictInfo.lastConflict = now;
            this.conflictCounts.set(phoneNumber, conflictInfo);
            
            // Calculate exponential backoff: 15, 30, 60, 120, 240 seconds (max 4 minutes)
            const baseDelay = 15000; // 15 seconds
            const maxDelay = 240000; // 4 minutes
            const backoffDelay = Math.min(baseDelay * Math.pow(2, conflictInfo.count - 1), maxDelay);
            
            console.log(`[Session Persistence] Conflict #${conflictInfo.count} - waiting ${backoffDelay/1000}s before reconnection...`);
            
            // Stop trying after 10 consecutive conflicts
            if (conflictInfo.count > 10) {
              console.log(`❌ [Session Persistence] Too many conflicts for ${phoneNumber}, giving up after 10 attempts`);
              await this.saveSessionToStorage(phoneNumber, sessionId, 'CONFLICT_ABANDONED');
              return;
            }
            
            // Mark session for reconnection with exponential backoff
            await this.markSessionForReconnection(phoneNumber);
            
            // Exponential backoff delay
            setTimeout(() => {
              console.log(`[Session Persistence] Attempting reconnection after ${backoffDelay/1000}s conflict delay for ${phoneNumber}`);
              this.initializeSessionWithPhoneNumber(phoneNumber, sessionId);
            }, backoffDelay);
            
          } else if (shouldReconnect) {
            console.log(`[Session Persistence] Session ${phoneNumber} will attempt reconnection...`);
            await this.markSessionForReconnection(phoneNumber);
            
            // Standard reconnection delay
            setTimeout(() => {
              this.initializeSessionWithPhoneNumber(phoneNumber, sessionId);
            }, 5000);
          } else {
            console.log(`[Session Persistence] Session ${phoneNumber} was manually logged out, clearing completely...`);
            
            // Complete session cleanup for manual logout
            await this.clearSessionCompletely(phoneNumber, actualSessionId);
          }
        }
      });

      // Enhanced credentials update handler - ensures ALL auth state files are saved
      sock.ev.on('creds.update', async () => {
        try {
          console.log(`[Session Persistence] [CREDS UPDATE] 📝 Credentials update triggered for ${phoneNumber}`);
          
          // Get current file count before save
          const filesBefore = fs.existsSync(sessionPath) ? fs.readdirSync(sessionPath).length : 0;
          
          // Call saveCreds to save ALL auth state files (not just creds.json)
          await saveCreds();
          
          // Get file count after save
          const filesAfter = fs.existsSync(sessionPath) ? fs.readdirSync(sessionPath).length : 0;
          
          console.log(`[Session Persistence] [CREDS UPDATE] ✅ Auth state save completed for ${phoneNumber}`);
          console.log(`[Session Persistence] [CREDS UPDATE] 📊 Files: ${filesBefore} → ${filesAfter} (${filesAfter - filesBefore >= 0 ? '+' : ''}${filesAfter - filesBefore})`);
          
          // Verify critical files exist
          const credsPath = path.join(sessionPath, 'creds.json');
          const allFiles = fs.existsSync(sessionPath) ? fs.readdirSync(sessionPath) : [];
          const appStateSyncFiles = allFiles.filter(f => f.startsWith('app-state-sync-key-'));
          const sessionFiles = allFiles.filter(f => f.startsWith('session-'));
          
          if (fs.existsSync(credsPath)) {
            const stats = fs.statSync(credsPath);
            console.log(`[Session Persistence] [CREDS UPDATE] ✅ creds.json verified (${stats.size} bytes)`);
          } else {
            console.error(`[Session Persistence] [CREDS UPDATE] ❌ creds.json missing after save!`);
          }
          
          console.log(`[Session Persistence] [CREDS UPDATE] 📁 Session files breakdown:`);
          console.log(`[Session Persistence] [CREDS UPDATE]    - app-state-sync files: ${appStateSyncFiles.length}`);
          console.log(`[Session Persistence] [CREDS UPDATE]    - session files: ${sessionFiles.length}`);
          console.log(`[Session Persistence] [CREDS UPDATE]    - total files: ${allFiles.length}`);
          
          // Log sample of file names for debugging
          if (allFiles.length > 0) {
            const sampleFiles = allFiles.slice(0, 5).join(', ');
            console.log(`[Session Persistence] [CREDS UPDATE] 📄 Sample files: ${sampleFiles}${allFiles.length > 5 ? ' ...' : ''}`);
          }
          
          // Verify minimum required files for session restoration
          if (appStateSyncFiles.length === 0) {
            console.warn(`[Session Persistence] [CREDS UPDATE] ⚠️ No app-state-sync files found - this may cause restoration issues`);
          }
          
          // Create backup copy of creds.json for extra safety
          if (fs.existsSync(credsPath)) {
            const backupPath = path.join(sessionPath, `creds_backup_${Date.now()}.json`);
            fs.copyFileSync(credsPath, backupPath);
            console.log(`[Session Persistence] [CREDS UPDATE] 💾 Backup created: creds_backup_${Date.now()}.json`);
            
            // Keep only latest 3 backups
            this.cleanupOldBackups(sessionPath);
          }
          
        } catch (error) {
          console.error(`[Session Persistence] [CREDS UPDATE] ❌ Error during credentials save for ${phoneNumber}:`, error.message);
        }
      });

      // Enhanced auth-state.update handler - captures ALL auth state changes including app-state-sync
      sock.ev.on('auth-state.update', async (update) => {
        try {
          console.log(`[Session Persistence] [AUTH STATE] 🔄 Auth state update received for ${phoneNumber}`, Object.keys(update));
          
          // Check if this update contains app-state-sync data
          if (update['app-state-sync-key'] || update['app-state-sync-version'] || update.keys) {
            console.log(`[Session Persistence] [AUTH STATE] 📊 Critical auth data updated - forcing save`);
            
            // Get current file count before save
            const filesBefore = fs.existsSync(sessionPath) ? fs.readdirSync(sessionPath).length : 0;
            
            // Force save all auth state files
            await saveCreds();
            
            // Get file count after save and verify
            const filesAfter = fs.existsSync(sessionPath) ? fs.readdirSync(sessionPath).length : 0;
            const appStateSyncFiles = fs.existsSync(sessionPath) 
              ? fs.readdirSync(sessionPath).filter(f => f.startsWith('app-state-sync-key-')).length 
              : 0;
            
            console.log(`[Session Persistence] [AUTH STATE] ✅ Auth state save completed: ${filesBefore} → ${filesAfter} files`);
            console.log(`[Session Persistence] [AUTH STATE] 📱 App-state-sync files: ${appStateSyncFiles}`);
            
            // Specifically verify app-state-sync files were saved
            if (appStateSyncFiles === 0 && (update['app-state-sync-key'] || update.keys)) {
              console.warn(`[Session Persistence] [AUTH STATE] ⚠️ App-state-sync update received but no files saved!`);
            }
          } else {
            console.log(`[Session Persistence] [AUTH STATE] ℹ️ Non-critical auth update, skipping forced save`);
          }
        } catch (error) {
          console.error(`[Session Persistence] [AUTH STATE] ❌ Error during auth-state save for ${phoneNumber}:`, error.message);
        }
      });
      
      // Set up enhanced message handler for auto-restored sessions with decryption retry
      sock.ev.on('messages.upsert', async (m) => {
        const maxRetries = 3;
        let retryCount = 0;
        
        const processMessage = async () => {
          try {
            const message = m.messages[0];
            
            // Only process messages that are not from us and are notifications
            if (!message.key.fromMe && m.type === 'notify') {
              console.log(`[Session Persistence] New message received for ${phoneNumber} (attempt ${retryCount + 1})`);
              await this.handleIncomingMessage(sock, message, actualSessionId);
            }
          } catch (error) {
            const isDecryptionError = error.message && (
              error.message.includes('Bad MAC') ||
              error.message.includes('failed to decrypt') ||
              error.message.includes('Decryption error') ||
              error.message.includes('Invalid key') ||
              error.message.includes('Authentication tag verification failed') ||
              error.message.includes('repository.decryptMessage is not a function') ||
              error.message.includes('signalRepository.jidToSignalProtocolAddress is not a function') ||
              error.message.includes('decryptMessage is not a function') ||
              error.message.includes('jidToSignalProtocolAddress is not a function')
            );
            
            console.error(`[Session Persistence] Error handling message for ${phoneNumber} (attempt ${retryCount + 1}):`, error);
            
            if (isDecryptionError && retryCount < maxRetries) {
              retryCount++;
              const retryDelay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
              
              console.log(`[Session Persistence] [DECRYPTION RETRY] Retrying in ${retryDelay}ms for ${phoneNumber} (attempt ${retryCount}/${maxRetries})`);
              
              setTimeout(processMessage, retryDelay);
              return;
            }
            
            if (isDecryptionError && retryCount >= maxRetries) {
              console.error(`[Session Persistence] [DECRYPTION FAILURE] Max retries reached for ${phoneNumber}, session may need reset`);
            }
          }
        };
        
        await processMessage();
      });

      return sock;
      
    } catch (error) {
      console.error(`[Session Persistence] Error initializing session for ${phoneNumber}:`, error);
      throw error;
    }
  }

  // WebSocket stability methods
  setupWebSocketHeartbeat(sessionId, sock) {
    logWebSocketEvent(sessionId, 'HEARTBEAT_SETUP', { interval: WS_CONFIG.HEARTBEAT_INTERVAL });
    
    const heartbeatInterval = setInterval(() => {
      try {
        if (sock.ws && sock.ws.readyState === 1) {
          // Send ping to keep connection alive
          sock.ws.ping();
          logWebSocketEvent(sessionId, 'HEARTBEAT_PING', { timestamp: Date.now() });
        } else {
          logWebSocketEvent(sessionId, 'HEARTBEAT_INVALID_STATE', { 
            readyState: sock.ws?.readyState,
            wsExists: !!sock.ws 
          });
          this.clearHeartbeat(sessionId);
        }
      } catch (error) {
        logWebSocketEvent(sessionId, 'HEARTBEAT_ERROR', { error: error.message });
        this.clearHeartbeat(sessionId);
      }
    }, WS_CONFIG.HEARTBEAT_INTERVAL);
    
    heartbeatIntervals.set(sessionId, heartbeatInterval);
    
    // Set up WebSocket ping/pong handlers
    if (sock.ws) {
      sock.ws.on('pong', () => {
        logWebSocketEvent(sessionId, 'HEARTBEAT_PONG', { timestamp: Date.now() });
      });
      
      sock.ws.on('ping', () => {
        logWebSocketEvent(sessionId, 'HEARTBEAT_PING_RECEIVED', { timestamp: Date.now() });
      });
    }
  }

  clearHeartbeat(sessionId) {
    const interval = heartbeatIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      heartbeatIntervals.delete(sessionId);
      logWebSocketEvent(sessionId, 'HEARTBEAT_CLEARED', {});
    }
  }

  calculateRetryDelay(attempt) {
    const delay = Math.min(
      WS_CONFIG.RETRY_BASE_DELAY * Math.pow(2, attempt),
      WS_CONFIG.MAX_RETRY_DELAY
    );
    return delay + Math.random() * 1000; // Add jitter
  }

  async retryWithBackoff(sessionId, operation, maxAttempts = WS_CONFIG.MAX_RETRY_ATTEMPTS) {
    let lastError;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        logWebSocketEvent(sessionId, 'RETRY_ATTEMPT', { 
          attempt: attempt + 1, 
          maxAttempts,
          operation: operation.name || 'unknown'
        });
        
        const result = await operation();
        
        if (result.success) {
          logWebSocketEvent(sessionId, 'RETRY_SUCCESS', { 
            attempt: attempt + 1,
            operation: operation.name || 'unknown'
          });
          retryAttempts.delete(sessionId);
          return result;
        }
        
        lastError = new Error(result.message || 'Operation failed');
      } catch (error) {
        lastError = error;
        logWebSocketEvent(sessionId, 'RETRY_ERROR', { 
          attempt: attempt + 1,
          error: error.message,
          operation: operation.name || 'unknown'
        });
      }
      
      if (attempt < maxAttempts - 1) {
        const delay = this.calculateRetryDelay(attempt);
        logWebSocketEvent(sessionId, 'RETRY_DELAY', { 
          attempt: attempt + 1,
          delay,
          nextAttempt: attempt + 2
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    retryAttempts.set(sessionId, maxAttempts);
    logWebSocketEvent(sessionId, 'RETRY_FAILED', { 
      maxAttempts,
      finalError: lastError?.message,
      operation: operation.name || 'unknown'
    });
    
    throw lastError || new Error('Max retry attempts reached');
  }

  setupConnectionBuffer(sessionId) {
    const buffer = {
      events: [],
      isBuffering: true,
      startTime: Date.now()
    };
    
    connectionBuffers.set(sessionId, buffer);
    logWebSocketEvent(sessionId, 'BUFFER_STARTED', { 
      bufferTime: WS_CONFIG.CONNECTION_BUFFER_TIME 
    });
    
    // Auto-flush buffer after buffer time
    setTimeout(() => {
      this.flushConnectionBuffer(sessionId);
    }, WS_CONFIG.CONNECTION_BUFFER_TIME);
    
    return buffer;
  }

  flushConnectionBuffer(sessionId) {
    const buffer = connectionBuffers.get(sessionId);
    if (buffer && buffer.isBuffering) {
      buffer.isBuffering = false;
      logWebSocketEvent(sessionId, 'BUFFER_FLUSHED', { 
        eventCount: buffer.events.length,
        duration: Date.now() - buffer.startTime
      });
      
      // Process buffered events
      buffer.events.forEach(event => {
        logWebSocketEvent(sessionId, 'BUFFER_PROCESS_EVENT', { 
          event: event.type,
          timestamp: event.timestamp
        });
      });
      
      connectionBuffers.delete(sessionId);
    }
  }

  addToConnectionBuffer(sessionId, eventType, eventData) {
    const buffer = connectionBuffers.get(sessionId);
    if (buffer && buffer.isBuffering) {
      buffer.events.push({
        type: eventType,
        data: eventData,
        timestamp: Date.now()
      });
      logWebSocketEvent(sessionId, 'BUFFER_ADD_EVENT', { 
        event: eventType,
        bufferSize: buffer.events.length
      });
      return true;
    }
    return false;
  }

  async initializeSession(sessionId = 'default') {
    try {
      logWebSocketEvent(sessionId, 'SESSION_INIT_START', { sessionId });
      console.log(`[WhatsApp Service] Initializing session with enhanced stability: ${sessionId}`);
      
      // Session path
      const sessionPath = path.join(sessionsDir, sessionId);
      console.log(`[WhatsApp Service] Session path: ${sessionPath}`);
      logWebSocketEvent(sessionId, 'SESSION_PATH', { sessionPath });
      
      // Ensure session directory exists and is writable
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
        console.log(`[WhatsApp Service] Created session directory: ${sessionPath}`);
        logWebSocketEvent(sessionId, 'SESSION_DIR_CREATED', { sessionPath });
      }
      
      // Load session data with corruption detection
      console.log(`[WhatsApp Service] Loading auth state for session: ${sessionId}`);
      let state, saveCreds;
      
      try {
        const authState = await useMultiFileAuthState(sessionPath);
        state = authState.state;
        saveCreds = authState.saveCreds;
        
        // Validate auth state integrity after successful load
        if (!state || !state.keys || typeof state.keys.get !== 'function') {
          throw new Error('Auth state validation failed - missing keys or get function');
        }
        
        logWebSocketEvent(sessionId, 'AUTH_STATE_LOADED', { hasState: !!state });
        console.log(`[WhatsApp Service] ✅ Auth state loaded successfully for ${sessionId}`);
        
      } catch (loadError) {
        console.warn(`[WhatsApp Service] ⚠️ Failed to load auth state for ${sessionId}:`, loadError.message);
        console.log(`[WhatsApp Service] This indicates corrupted or incomplete session files`);
        logWebSocketEvent(sessionId, 'AUTH_STATE_CORRUPTED', { error: loadError.message });
        
        // Clear corrupted session completely
        console.log(`[WhatsApp Service] 🧹 Clearing corrupted session for ${sessionId}...`);
        await this.clearSessionCompletely(null, sessionId);
        
        // Load fresh auth state after cleanup
        console.log(`[WhatsApp Service] 🔄 Loading fresh auth state for ${sessionId}...`);
        try {
          const freshAuthState = await useMultiFileAuthState(sessionPath);
          state = freshAuthState.state;
          saveCreds = freshAuthState.saveCreds;
          console.log(`[WhatsApp Service] ✅ Fresh auth state loaded for ${sessionId}`);
          logWebSocketEvent(sessionId, 'AUTH_STATE_RELOADED', { sessionId });
        } catch (freshLoadError) {
          console.error(`[WhatsApp Service] ❌ Failed to load fresh auth state for ${sessionId}:`, freshLoadError.message);
          throw freshLoadError;
        }
      }
      
      logWebSocketEvent(sessionId, 'AUTH_STATE_READY', { sessionId });
      
      // Enhanced stability settings for auth state
      if (state.creds) {
        state.creds.processHistoryMsg = false;
        state.creds.syncFullHistory = false;
        logWebSocketEvent(sessionId, 'AUTH_STATE_OPTIMIZED', { 
          processHistoryMsg: false,
          syncFullHistory: false
        });
      }
      
      // Get latest version
      console.log(`[WhatsApp Service] Fetching latest Baileys version...`);
      const { version } = await fetchLatestBaileysVersion();
      console.log(`[WhatsApp Service] Using Baileys version: ${version}`);
      logWebSocketEvent(sessionId, 'BAILEYS_VERSION', { version });
      
      // Create enhanced socket configuration for stability
      console.log(`[WhatsApp Service] Creating WhatsApp socket with stability enhancements for session: ${sessionId}`);
      
      const socketConfig = {
        auth: state,
        printQRInTerminal: false,
        browser: ['Chrome', 'Chrome', '10.0.0'],
        connectTimeoutMs: WS_CONFIG.QR_TIMEOUT,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: WS_CONFIG.HEARTBEAT_INTERVAL,
        receivedPendingNotifications: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        fireInitQueries: false,
        generateHighQualityLinkPreview: false,
        patchMessageBeforeSending: (message) => {
          // Add timestamp to prevent message duplication
          message.messageTimestamp = Date.now();
          return message;
        }
      };
      
      logWebSocketEvent(sessionId, 'SOCKET_CONFIG', socketConfig);
      const sock = makeWASocket(socketConfig);

      // Fix signal protocol functions after restoration
      console.log(`[Socket Init] ✅ Socket initialized for ${sessionId} - checking signal protocol`);
      
      // Verify auth state is properly loaded and add signal repository if missing
      if (sock.authState && sock.authState.keys) {
        console.log(`[Socket Init] ✅ Auth state keys properly loaded for ${sessionId}`);
        
        // Check and add signal repository if missing to prevent decryptMessage errors
        try {
          let hasSignalRepo = false;
          
          // First validate that the keys object is properly formed
          if (!sock.authState || !sock.authState.keys) {
            console.warn(`[Socket Init] ⚠️ Missing auth state or keys for ${sessionId}`);
            hasSignalRepo = false;
          } else if (typeof sock.authState.keys.get !== 'function') {
            console.warn(`[Socket Init] ⚠️ Keys object missing get method for ${sessionId} - likely corrupted`);
            hasSignalRepo = false;
          } else {
            try {
              // Try to check if signal repository exists
              console.log(`[Socket Init] 🔍 Attempting signal repository check for ${sessionId}...`);
              const existingRepo = await sock.authState.keys.get('signal-repository');
              hasSignalRepo = !!existingRepo;
              console.log(`[Socket Init] ✅ Signal repository check for ${sessionId}: ${hasSignalRepo ? 'exists' : 'missing'}`);
            } catch (getError) {
              console.error(`[Socket Init] ❌ Error checking signal repository for ${sessionId}:`, getError.message);
              
              // Check if this is the specific corruption we're dealing with
              if (getError.message.includes("Cannot read properties of undefined (reading 'map')")) {
                console.log(`[Socket Init] 🧹 Detected auth state corruption for ${sessionId} - clearing and restarting`);
                
                // Clear the corrupted session completely
                try {
                  await this.clearSessionCompletely(sessionId);
                  console.log(`[Socket Init] ✅ Corrupted session cleared for ${sessionId}`);
                } catch (clearError) {
                  console.error(`[Socket Init] ❌ Error clearing corrupted session:`, clearError.message);
                }
                
                // Throw specific corruption error to trigger fresh restart
                throw new Error(`AUTH_STATE_CORRUPTED: Session ${sessionId} had corrupted auth state and has been cleared for fresh start`);
              }
              
              hasSignalRepo = false;
            }
          }
          
          if (!hasSignalRepo) {
            console.log(`[Socket Init] 🔧 Adding signal repository for ${sessionId}...`);
            const signalRepository = makeLibSignalRepository(sock.authState.keys);
            sock.authState.keys.set('signal-repository', signalRepository);
            console.log(`[Socket Init] ✅ Signal repository added for ${sessionId}`);
          } else {
            console.log(`[Socket Init] ✅ Signal repository already exists for ${sessionId}`);
          }
        } catch (error) {
          console.warn(`[Socket Init] ⚠️ Could not verify/add signal repository for ${sessionId}:`, error.message);
        }
      } else {
        console.error(`[Socket Init] ❌ Auth state or keys missing for ${sessionId}`);
      }

      // Set up connection buffer during QR scan phase
      this.setupConnectionBuffer(sessionId);

      // Store connection with enhanced state tracking
      console.log(`[WhatsApp Service] Storing enhanced connection object for session: ${sessionId}`);
      connections.set(sessionId, {
        sock,
        qr: null,
        isConnected: false,
        connectionStatus: 'initializing',
        qrTimestamp: null,
        qrGenerating: true,
        qrStartTime: Date.now(),
        lastPing: null,
        connectionStartTime: Date.now(),
        reconnectAttempts: 0,
        isStable: false,
        qrScanInProgress: false,
        preserveQRState: null
      });

      logWebSocketEvent(sessionId, 'CONNECTION_STORED', { 
        status: 'initializing',
        qrGenerating: true
      });

      // Enhanced connection update handler with stability improvements
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const conn = connections.get(sessionId);
        
        // Log all connection updates with detailed information
        logWebSocketEvent(sessionId, 'CONNECTION_UPDATE', {
          connection,
          hasQR: !!qr,
          hasDisconnect: !!lastDisconnect,
          disconnectReason: lastDisconnect?.error?.output?.statusCode,
          timestamp: Date.now()
        });
        
        console.log(`[WhatsApp Service] Enhanced connection update for session ${sessionId}:`, {
          connection,
          hasQR: !!qr,
          hasDisconnect: !!lastDisconnect,
          disconnectReason: lastDisconnect?.error?.output?.statusCode
        });
        
        // Buffer events during QR scan phase to prevent premature disconnections
        if (conn?.qrScanInProgress && connection !== 'open') {
          const buffered = this.addToConnectionBuffer(sessionId, 'CONNECTION_UPDATE', {
            connection,
            hasQR: !!qr,
            disconnectReason: lastDisconnect?.error?.output?.statusCode
          });
          
          if (buffered) {
            logWebSocketEvent(sessionId, 'CONNECTION_BUFFERED', { 
              connection,
              reason: 'QR scan in progress' 
            });
            // Continue processing critical events even when buffered
            if (qr || connection === 'open') {
              // Allow QR and successful connection through
            } else {
              return; // Buffer other events during QR scan
            }
          }
        }
        
        // Handle QR code with enhanced stability
        if (qr) {
          console.log(`[WhatsApp Service] QR code received for session: ${sessionId}`);
          logWebSocketEvent(sessionId, 'QR_RECEIVED', { 
            qrLength: qr.length,
            timestamp: Date.now()
          });
          
          try {
            // Mark QR scan as in progress to prevent disconnections
            if (conn) {
              conn.qrScanInProgress = true;
              conn.preserveQRState = {
                qrData: qr,
                timestamp: Date.now()
              };
            }
            
            // Generate QR code with enhanced error handling
            const qrDataUrl = await QRCode.toDataURL(qr, {
              width: 256,
              margin: 2,
              color: {
                dark: '#000000',
                light: '#FFFFFF'
              },
              errorCorrectionLevel: 'M'
            });
            
            if (conn) {
              conn.qr = qrDataUrl;
              conn.qrTimestamp = Date.now();
              conn.connectionStatus = 'qr_ready';
              conn.qrGenerating = false;
              conn.qrStartTime = null;
              conn.isStable = true; // Mark as stable once QR is ready
              
              logWebSocketEvent(sessionId, 'QR_GENERATED', { 
                qrDataUrlLength: qrDataUrl.length,
                timestamp: conn.qrTimestamp
              });
              
              console.log(`[WhatsApp Service] QR code stored successfully for session: ${sessionId}`);
              
              // Set up heartbeat immediately after QR generation
              this.setupWebSocketHeartbeat(sessionId, sock);
              
              // Start QR scan timeout with extended time
              setTimeout(() => {
                if (conn && conn.qrScanInProgress && !conn.isConnected) {
                  logWebSocketEvent(sessionId, 'QR_SCAN_TIMEOUT', { 
                    duration: WS_CONFIG.QR_TIMEOUT 
                  });
                  conn.qrScanInProgress = false;
                  this.flushConnectionBuffer(sessionId);
                }
              }, WS_CONFIG.QR_TIMEOUT);
              
            } else {
              console.error(`[WhatsApp Service] No connection object found when storing QR for session: ${sessionId}`);
              logWebSocketEvent(sessionId, 'QR_NO_CONNECTION', {});
            }
            qrCodes.set(sessionId, qrDataUrl);
          } catch (err) {
            console.error('[WhatsApp Service] Error generating QR code:', err);
            logWebSocketEvent(sessionId, 'QR_GENERATION_ERROR', { error: err.message });
            
            // Reset QR state on error
            if (conn) {
              conn.qrGenerating = false;
              conn.qrStartTime = null;
              conn.qrScanInProgress = false;
            }
          }
        }

        // Enhanced disconnect handling with proper error recovery
        if (connection === 'close') {
          const disconnectReason = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = disconnectReason !== DisconnectReason.loggedOut;
          
          logWebSocketEvent(sessionId, 'CONNECTION_CLOSED', {
            disconnectReason,
            shouldReconnect,
            lastDisconnectMessage: lastDisconnect?.error?.message
          });
          
          console.log(`[WhatsApp Service] Enhanced disconnect handling for ${sessionId}. Reason: ${disconnectReason}, Reconnect: ${shouldReconnect}`);
          
          // Clear heartbeat
          this.clearHeartbeat(sessionId);
          
          if (conn) {
            // Preserve QR state if scan was in progress
            if (conn.qrScanInProgress && conn.preserveQRState) {
              logWebSocketEvent(sessionId, 'QR_STATE_PRESERVED', {
                preservedTimestamp: conn.preserveQRState.timestamp,
                reason: 'QR scan was in progress'
              });
              
              // Don't clear QR immediately - give time for reconnection
              setTimeout(() => {
                if (conn && !conn.isConnected) {
                  conn.qr = null;
                  conn.qrScanInProgress = false;
                  conn.preserveQRState = null;
                  qrCodes.delete(sessionId);
                  logWebSocketEvent(sessionId, 'QR_STATE_CLEARED_DELAYED', {});
                }
              }, 10000); // 10 second delay
            } else {
              conn.qr = null;
              conn.qrScanInProgress = false;
              conn.preserveQRState = null;
              qrCodes.delete(sessionId);
            }
            
            conn.isConnected = false;
            conn.connectionStatus = 'disconnected';
            conn.qrGenerating = false;
            conn.qrTimestamp = null;
            conn.qrStartTime = null;
            conn.isStable = false;
            conn.reconnectAttempts = (conn.reconnectAttempts || 0) + 1;
          }
          
          // Enhanced reconnection logic with exponential backoff
          if (shouldReconnect && conn && conn.reconnectAttempts < WS_CONFIG.MAX_RETRY_ATTEMPTS) {
            const retryDelay = this.calculateRetryDelay(conn.reconnectAttempts);
            
            logWebSocketEvent(sessionId, 'RECONNECT_SCHEDULED', {
              attempt: conn.reconnectAttempts,
              delay: retryDelay,
              maxAttempts: WS_CONFIG.MAX_RETRY_ATTEMPTS
            });
            
            console.log(`[WhatsApp Service] Scheduling reconnection attempt ${conn.reconnectAttempts}/${WS_CONFIG.MAX_RETRY_ATTEMPTS} in ${retryDelay}ms`);
            
            setTimeout(async () => {
              try {
                if (conn && !conn.isConnected) {
                  logWebSocketEvent(sessionId, 'RECONNECT_ATTEMPT', { 
                    attempt: conn.reconnectAttempts 
                  });
                  
                  // Clear old socket
                  if (conn.sock) {
                    try {
                      conn.sock.end();
                    } catch (e) {
                      // Ignore cleanup errors
                    }
                  }
                  
                  // Reinitialize session
                  await this.initializeSession(sessionId);
                }
              } catch (error) {
                logWebSocketEvent(sessionId, 'RECONNECT_FAILED', { 
                  error: error.message,
                  attempt: conn.reconnectAttempts
                });
              }
            }, retryDelay);
            
          } else if (disconnectReason === DisconnectReason.loggedOut) {
            console.log(`[WhatsApp Service] Permanent logout, clearing session completely`);
            logWebSocketEvent(sessionId, 'PERMANENT_LOGOUT', {});
            
            // Complete session cleanup for manual logout
            if (conn && conn.phoneNumber) {
              await this.clearSessionCompletely(conn.phoneNumber, sessionId);
            } else {
              // Fallback cleanup if phone number not available
              const sessionPath = path.join(sessionsDir, sessionId);
              try {
                if (fs.existsSync(sessionPath)) {
                  console.log(`[WhatsApp Service] Clearing auth state: ${sessionPath}`);
                  fs.rmSync(sessionPath, { recursive: true, force: true });
                  logWebSocketEvent(sessionId, 'AUTH_STATE_CLEARED', { sessionPath });
                }
              } catch (error) {
                console.error(`[WhatsApp Service] Error clearing auth state:`, error);
                logWebSocketEvent(sessionId, 'AUTH_CLEAR_ERROR', { error: error.message });
              }
              
              if (conn) {
                conn.sock = null;
                conn.connectionStatus = 'logged_out';
                conn.reconnectAttempts = WS_CONFIG.MAX_RETRY_ATTEMPTS; // Prevent further attempts
              }
            }
          } else {
            logWebSocketEvent(sessionId, 'MAX_RECONNECT_REACHED', { 
              attempts: conn?.reconnectAttempts || 0 
            });
            console.log(`[WhatsApp Service] Max reconnection attempts reached for ${sessionId}`);
          }
          
        } else if (connection === 'open') {
          console.log(`[WhatsApp Service] Successfully connected for session: ${sessionId}`);
          logWebSocketEvent(sessionId, 'CONNECTION_OPENED', { timestamp: Date.now() });
          
          if (conn) {
            conn.isConnected = true;
            conn.connectionStatus = 'connected';
            conn.qr = null;
            conn.qrGenerating = false;
            conn.qrStartTime = null;
            conn.qrScanInProgress = false;
            conn.preserveQRState = null;
            conn.lastConnected = Date.now();
            conn.reconnectAttempts = 0; // Reset retry counter on success
            conn.isStable = true;
            
            // Clear any pending message queues to prevent old messages from interfering with fresh AI responses
            console.log(`[WhatsApp Service] [MESSAGE QUEUE] Clearing old message queues on reconnection`);
            const clearedQueues = this.clearAllMessageQueues();
            if (clearedQueues > 0) {
              console.log(`[WhatsApp Service] [MESSAGE QUEUE] Cleared ${clearedQueues} pending message queues`);
            }
            
            // Get phone number info and save session to database
            try {
              const userInfo = sock.user;
              if (userInfo && userInfo.id) {
                conn.phoneNumber = userInfo.id.split(':')[0];
                console.log(`[WhatsApp Service] Phone number detected: ${conn.phoneNumber}`);
                logWebSocketEvent(sessionId, 'PHONE_DETECTED', { 
                  phoneNumber: conn.phoneNumber 
                });
                
                // Save session to storage with persistence
                await this.saveSessionToStorage(conn.phoneNumber, sessionId, 'CONNECTED');
                
                // Force save ALL auth state files immediately on successful connection
                try {
                  console.log(`[Session Persistence] [FILE WRITE] Starting comprehensive session save for ${conn.phoneNumber}`);
                  
                  // Get the saveCreds function from the auth state
                  const sessionPath = path.join(sessionsDir, sessionId);
                  const { saveCreds } = await useMultiFileAuthState(sessionPath);
                  
                  // Use our enhanced forceSaveSessionFiles function
                  const saveResult = await this.forceSaveSessionFiles(conn.phoneNumber, saveCreds);
                  
                  if (saveResult.success) {
                    console.log(`✅ [Session Persistence] [FILE WRITE] Comprehensive session save completed for ${conn.phoneNumber}`);
                    console.log(`[Session Persistence] [FILE WRITE] Saved files:`, saveResult.files.map(f => `${f.name} (${f.size} bytes)`).join(', '));
                  } else {
                    console.error(`❌ [Session Persistence] [FILE WRITE] Session save failed for ${conn.phoneNumber}:`, saveResult.error);
                  }
                  
                } catch (saveError) {
                  console.error(`❌ [Session Persistence] [FILE WRITE] Error in comprehensive session save:`, saveError);
                }
                
                // Ensure session files are copied to phone-number based directory for persistence
                const phoneSessionPath = path.join(phoneSessionsDir, conn.phoneNumber);
                const sessionPath = path.join(sessionsDir, sessionId);
                
                console.log(`[Session Persistence] [FILE COPY] Ensuring session files are in ${phoneSessionPath}`);
                
                if (fs.existsSync(sessionPath)) {
                  // Always create phone session directory if it doesn't exist
                  if (!fs.existsSync(phoneSessionPath)) {
                    fs.mkdirSync(phoneSessionPath, { recursive: true });
                    console.log(`[Session Persistence] [FILE COPY] Created directory: ${phoneSessionPath}`);
                  }
                  
                  // Copy/update session files to phone-based directory
                  const files = fs.readdirSync(sessionPath);
                  let copiedFiles = 0;
                  
                  for (const file of files) {
                    const sourcePath = path.join(sessionPath, file);
                    const destPath = path.join(phoneSessionPath, file);
                    
                    try {
                      fs.copyFileSync(sourcePath, destPath);
                      copiedFiles++;
                      
                      // Verify the file was copied and has content
                      if (fs.existsSync(destPath)) {
                        const stats = fs.statSync(destPath);
                        console.log(`[Session Persistence] [FILE COPY] Copied ${file} (${stats.size} bytes) to ${phoneSessionPath}`);
                      } else {
                        console.error(`[Session Persistence] [FILE COPY] WARNING: ${file} not found after copy`);
                      }
                    } catch (copyError) {
                      console.error(`[Session Persistence] [FILE COPY] Error copying ${file}:`, copyError);
                    }
                  }
                  
                  console.log(`[Session Persistence] [FILE COPY] Copied ${copiedFiles}/${files.length} session files to ${phoneSessionPath}`);
                  
                  // Verify creds.json exists in phone directory
                  const phoneCredsPath = path.join(phoneSessionPath, 'creds.json');
                  if (fs.existsSync(phoneCredsPath)) {
                    const stats = fs.statSync(phoneCredsPath);
                    console.log(`[Session Persistence] [FILE VERIFY] creds.json exists in phone directory (${stats.size} bytes)`);
                  } else {
                    console.error(`[Session Persistence] [FILE VERIFY] WARNING: creds.json missing in phone directory: ${phoneSessionPath}`);
                  }
                } else {
                  console.error(`[Session Persistence] [FILE COPY] WARNING: Source session path not found: ${sessionPath}`);
                }
              }
            } catch (err) {
              console.log('[WhatsApp Service] Could not detect phone number:', err.message);
              logWebSocketEvent(sessionId, 'PHONE_DETECTION_ERROR', { 
                error: err.message 
              });
            }
            
            // Set up heartbeat for connected session
            this.setupWebSocketHeartbeat(sessionId, sock);
          }
          
          // Flush any buffered events
          this.flushConnectionBuffer(sessionId);
          qrCodes.delete(sessionId);
          
        } else if (connection === 'connecting') {
          console.log(`[WhatsApp Service] Connecting for session: ${sessionId}`);
          logWebSocketEvent(sessionId, 'CONNECTION_CONNECTING', { timestamp: Date.now() });
          
          if (conn) {
            conn.connectionStatus = 'connecting';
          }
        }
      });

      // Enhanced credentials update handler
      sock.ev.on('creds.update', () => {
        logWebSocketEvent(sessionId, 'CREDS_UPDATE', { timestamp: Date.now() });
        saveCreds();
      });

      // Enhanced message handler with decryption error handling and retry logic
      sock.ev.on('messages.upsert', async (m) => {
        const maxRetries = 3;
        let retryCount = 0;
        
        const processMessage = async () => {
          try {
            const message = m.messages[0];
            
            // Only process messages that are not from us and are notifications
            if (!message.key.fromMe && m.type === 'notify') {
              logWebSocketEvent(sessionId, 'MESSAGE_RECEIVED', { 
                messageId: message.key.id,
                from: message.key.remoteJid,
                timestamp: Date.now(),
                attempt: retryCount + 1
              });
              
              console.log(`[WhatsApp Service] New message received in session ${sessionId} (attempt ${retryCount + 1})`);
              await this.handleIncomingMessage(sock, message, sessionId);
            }
          } catch (error) {
            const isDecryptionError = error.message && (
              error.message.includes('Bad MAC') ||
              error.message.includes('failed to decrypt') ||
              error.message.includes('Decryption error') ||
              error.message.includes('Invalid key') ||
              error.message.includes('Authentication tag verification failed') ||
              error.message.includes('repository.decryptMessage is not a function') ||
              error.message.includes('signalRepository.jidToSignalProtocolAddress is not a function') ||
              error.message.includes('decryptMessage is not a function') ||
              error.message.includes('jidToSignalProtocolAddress is not a function')
            );
            
            console.error(`[WhatsApp Service] Error handling message in session ${sessionId} (attempt ${retryCount + 1}):`, error);
            
            if (isDecryptionError && retryCount < maxRetries) {
              retryCount++;
              const retryDelay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000); // Exponential backoff, max 5s
              
              console.log(`[WhatsApp Service] [DECRYPTION RETRY] Decryption error detected, retrying in ${retryDelay}ms (attempt ${retryCount}/${maxRetries})`);
              
              logWebSocketEvent(sessionId, 'DECRYPTION_RETRY', { 
                error: error.message,
                attempt: retryCount,
                maxRetries: maxRetries,
                retryDelay: retryDelay
              });
              
              setTimeout(processMessage, retryDelay);
              return;
            }
            
            if (isDecryptionError && retryCount >= maxRetries) {
              console.error(`[WhatsApp Service] [DECRYPTION FAILURE] Failed to decrypt message after ${maxRetries} attempts, triggering automatic recovery`);
              
              logWebSocketEvent(sessionId, 'DECRYPTION_FAILURE_MAX_RETRIES', { 
                error: error.message,
                attempts: retryCount,
                action: 'Triggering automatic recovery with hybrid restoration'
              });
              
              // Trigger automatic recovery for persistent decryption failures
              console.log(`[WhatsApp Service] Triggering automatic recovery for ${phoneNumber} due to persistent decryption failures`);
              try {
                await this.performAutomaticRecovery(phoneNumber, error);
                console.log(`[WhatsApp Service] ✅ Automatic recovery completed for ${phoneNumber}`);
              } catch (recoveryError) {
                console.error(`[WhatsApp Service] ❌ Automatic recovery failed for ${phoneNumber}:`, recoveryError.message);
              }
            }
            
            logWebSocketEvent(sessionId, 'MESSAGE_HANDLE_ERROR', { 
              error: error.message,
              isDecryptionError,
              finalAttempt: retryCount >= maxRetries
            });
          }
        };
        
        await processMessage();
      });

      // Enhanced WebSocket event monitoring
      if (sock.ws) {
        sock.ws.on('open', () => {
          logWebSocketEvent(sessionId, 'WEBSOCKET_OPENED', { timestamp: Date.now() });
        });
        
        sock.ws.on('close', (code, reason) => {
          logWebSocketEvent(sessionId, 'WEBSOCKET_CLOSED', { 
            code, 
            reason: reason?.toString(),
            timestamp: Date.now()
          });
          this.clearHeartbeat(sessionId);
        });
        
        sock.ws.on('error', (error) => {
          logWebSocketEvent(sessionId, 'WEBSOCKET_ERROR', { 
            error: error.message,
            timestamp: Date.now()
          });
        });
        
        sock.ws.on('message', (data) => {
          logWebSocketEvent(sessionId, 'WEBSOCKET_MESSAGE', { 
            dataLength: data?.length || 0,
            timestamp: Date.now()
          });
        });
      }

      logWebSocketEvent(sessionId, 'SESSION_INIT_COMPLETE', { 
        sessionId,
        timestamp: Date.now()
      });

      return {
        success: true,
        message: 'Session initialized successfully with enhanced stability'
      };
    } catch (error) {
      console.error(`[WhatsApp Service] Error initializing session ${sessionId}:`, error);
      logWebSocketEvent(sessionId, 'SESSION_INIT_ERROR', { 
        error: error.message,
        stack: error.stack
      });
      
      // Cleanup on initialization error
      this.clearHeartbeat(sessionId);
      const conn = connections.get(sessionId);
      if (conn) {
        conn.qrGenerating = false;
        conn.qrStartTime = null;
        conn.connectionStatus = 'error';
      }
      
      return {
        success: false,
        message: error.message
      };
    }
  }

  async getQRCode(sessionId = 'default', force = false) {
    const startTime = Date.now();
    const perfLog = {
      sessionId,
      force,
      startTime,
      steps: {}
    };

    try {
      logWebSocketEvent(sessionId, 'QR_REQUEST', { force, timestamp: startTime });
      console.log(`[QR Performance] QR code request started for session: ${sessionId} (force: ${force})`);
      
      perfLog.steps.requestReceived = Date.now() - startTime;
      
      // Use retry logic for QR generation
      const result = await this.retryWithBackoff(sessionId, async () => {
        return await this.generateQRCodeWithStability(sessionId, force);
      });
      
      perfLog.steps.qrGenerated = Date.now() - startTime;
      perfLog.totalTime = Date.now() - startTime;
      perfLog.success = result.success;
      
      console.log(`[QR Performance] QR generation completed in ${perfLog.totalTime}ms:`, {
        sessionId,
        success: result.success,
        force,
        breakdown: perfLog.steps
      });
      
      return result;
      
    } catch (error) {
      perfLog.totalTime = Date.now() - startTime;
      perfLog.error = error.message;
      
      console.error(`[QR Performance] QR generation failed after ${perfLog.totalTime}ms:`, perfLog);
      logWebSocketEvent(sessionId, 'QR_REQUEST_FAILED', { 
        error: error.message,
        performanceData: perfLog,
        timestamp: Date.now()
      });
      
      return {
        success: false,
        message: error.message || 'Failed to generate QR code after retries'
      };
    }
  }

  async generateQRCodeWithStability(sessionId, force) {
    let conn = connections.get(sessionId);
    
    logWebSocketEvent(sessionId, 'QR_GENERATION_START', { 
      force, 
      hasConnection: !!conn,
      connectionStatus: conn?.connectionStatus
    });
    
    // Check if already connected
    if (conn && conn.isConnected) {
      console.log(`[WhatsApp Service] Session ${sessionId} already connected`);
      return {
        success: false,
        message: 'Already connected to WhatsApp'
      };
    }

    // Enhanced QR generation state checking
    if (!force && conn && conn.qrGenerating) {
      if (conn.qrStartTime && (Date.now() - conn.qrStartTime > WS_CONFIG.QR_TIMEOUT)) {
        logWebSocketEvent(sessionId, 'QR_GENERATION_STUCK', {
          stuckDuration: Date.now() - conn.qrStartTime
        });
        console.log(`[WhatsApp Service] QR generation stuck for ${Math.floor((Date.now() - conn.qrStartTime) / 1000)}s, resetting...`);
        conn.qrGenerating = false;
        conn.qrStartTime = null;
      } else if (conn.qr) {
        logWebSocketEvent(sessionId, 'QR_CACHE_HIT', { 
          qrAge: Date.now() - conn.qrTimestamp 
        });
        return {
          success: true,
          qr: conn.qr,
          message: 'QR code ready from cache'
        };
      }
    }

    // Enhanced cleanup logic
    if (force || (conn && ['disconnected', 'error'].includes(conn.connectionStatus))) {
      console.log(`[WhatsApp Service] Enhanced cleanup for session: ${sessionId} (force: ${force})`);
      logWebSocketEvent(sessionId, 'QR_CLEANUP_START', { force, status: conn?.connectionStatus });
      
      // Clear heartbeat before cleanup
      this.clearHeartbeat(sessionId);
      
      if (conn && conn.sock) {
        try {
          conn.sock.end();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      connections.delete(sessionId);
      qrCodes.delete(sessionId);
      
      // Clear auth state when forcing regeneration
      if (force) {
        const sessionPath = path.join(sessionsDir, sessionId);
        try {
          if (fs.existsSync(sessionPath)) {
            console.log(`[WhatsApp Service] Clearing auth state for fresh start: ${sessionPath}`);
            fs.rmSync(sessionPath, { recursive: true, force: true });
            logWebSocketEvent(sessionId, 'AUTH_STATE_CLEARED_FORCE', { sessionPath });
          }
        } catch (error) {
          console.error(`[WhatsApp Service] Error clearing auth state:`, error);
          logWebSocketEvent(sessionId, 'AUTH_CLEAR_ERROR_FORCE', { error: error.message });
        }
      }
      
      conn = null;
    }

    // Return cached QR if fresh (within timeout)
    if (!force && conn && conn.qr && conn.qrTimestamp && 
        (Date.now() - conn.qrTimestamp < WS_CONFIG.QR_TIMEOUT)) {
      const qrAge = Date.now() - conn.qrTimestamp;
      console.log(`[WhatsApp Service] Returning cached QR for session: ${sessionId} (${Math.floor(qrAge / 1000)}s old)`);
      logWebSocketEvent(sessionId, 'QR_CACHE_RETURN', { qrAge });
      
      return {
        success: true,
        qr: conn.qr,
        message: 'QR code retrieved from cache'
      };
    }

    // Enhanced session initialization
    if (conn && conn.sock) {
      this.clearHeartbeat(sessionId);
      try {
        conn.sock.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      connections.delete(sessionId);
    }

    // Initialize new session with enhanced stability
    logWebSocketEvent(sessionId, 'QR_SESSION_INIT', { timestamp: Date.now() });
    
    let initResult;
    try {
      initResult = await this.initializeSession(sessionId);
    } catch (initError) {
      if (initError.message.includes('AUTH_STATE_CORRUPTED')) {
        console.log(`[QR Generation] ♻️ Detected corrupted auth state for ${sessionId}, retrying with fresh session...`);
        
        // Wait a moment for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try initializing again after corruption cleanup
        initResult = await this.initializeSession(sessionId);
      } else {
        throw initError;
      }
    }
    
    if (!initResult.success) {
      throw new Error(initResult.message);
    }
    
    // Enhanced QR waiting with detailed monitoring
    let attempts = 0;
    const maxAttempts = Math.floor(WS_CONFIG.QR_TIMEOUT / 500); // 500ms intervals
    
    while (attempts < maxAttempts) {
      conn = connections.get(sessionId);
      
      if (conn && conn.qr) {
        logWebSocketEvent(sessionId, 'QR_READY', { 
          attempts,
          duration: attempts * 500,
          qrLength: conn.qr.length
        });
        
        console.log(`[WhatsApp Service] QR code ready for session: ${sessionId} after ${attempts * 500}ms`);
        return {
          success: true,
          qr: conn.qr,
          message: 'QR code generated successfully with enhanced stability'
        };
      }
      
      // Enhanced status logging
      if (attempts % 10 === 0) {
        logWebSocketEvent(sessionId, 'QR_WAIT_STATUS', {
          attempt: attempts,
          maxAttempts,
          hasConnection: !!conn,
          status: conn?.connectionStatus,
          isGenerating: conn?.qrGenerating
        });
        
        console.log(`[WhatsApp Service] QR wait attempt ${attempts}/${maxAttempts} for session: ${sessionId}`);
        if (conn) {
          console.log(`[WhatsApp Service] Status: ${conn.connectionStatus}, generating: ${conn.qrGenerating}, hasQR: ${!!conn.qr}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    // Enhanced timeout handling
    logWebSocketEvent(sessionId, 'QR_TIMEOUT', { 
      totalAttempts: attempts,
      duration: WS_CONFIG.QR_TIMEOUT
    });
    
    console.log(`[WhatsApp Service] QR generation timeout for session: ${sessionId} after ${WS_CONFIG.QR_TIMEOUT}ms`);
    
    const timeoutConn = connections.get(sessionId);
    if (timeoutConn) {
      timeoutConn.qrGenerating = false;
      timeoutConn.qrStartTime = null;
      timeoutConn.connectionStatus = 'timeout';
      logWebSocketEvent(sessionId, 'QR_STATE_RESET_TIMEOUT', {});
    }
    
    throw new Error(`QR code generation timeout after ${WS_CONFIG.QR_TIMEOUT}ms. Please try again.`);
  }

  async getStatus(sessionId = 'default') {
    try {
      let conn = connections.get(sessionId);
      
      if (!conn) {
        // If specific session not found, check for any active connection
        console.log(`[WhatsApp Service] Session '${sessionId}' not found, checking all connections...`);
        
        // Check phone-based sessions first
        for (const [phoneNumber, session] of Object.entries(this.sessions)) {
          const phoneSessionKey = `phone_${phoneNumber}`;
          const phoneConn = connections.get(phoneSessionKey);
          
          if (phoneConn && phoneConn.isConnected) {
            console.log(`[WhatsApp Service] Found active phone session: ${phoneNumber}`);
            return {
              success: true,
              connected: true,
              status: 'connected',
              message: 'WhatsApp connected',
              phoneNumber: phoneNumber,
              lastConnected: phoneConn.lastConnected || null
            };
          }
        }
        
        // Check all connections
        let activeConnection = null;
        for (const [id, connection] of connections) {
          console.log(`[WhatsApp Service] Found session '${id}' with status: ${connection.connectionStatus || connection.status}, connected: ${connection.isConnected}`);
          if (connection.isConnected) {
            activeConnection = connection;
            console.log(`[WhatsApp Service] Using active session '${id}' for status`);
            break;
          }
        }
        
        if (activeConnection) {
          return {
            success: true,
            connected: activeConnection.isConnected,
            status: activeConnection.connectionStatus || activeConnection.status || 'connected',
            message: 'WhatsApp connected',
            phoneNumber: activeConnection.phoneNumber || null,
            lastConnected: activeConnection.lastConnected || null
          };
        }
        
        // Check if there's a connecting session
        for (const [id, connection] of connections) {
          if (connection.status === 'connecting' || connection.connectionStatus === 'connecting') {
            console.log(`[WhatsApp Service] Found connecting session '${id}'`);
            return {
              success: true,
              connected: false,
              status: 'connecting',
              message: 'WhatsApp is connecting...',
              phoneNumber: connection.phoneNumber || null,
              lastConnected: null
            };
          }
        }
        
        return {
          success: true,
          connected: false,
          status: 'disconnected',
          message: 'No active sessions found',
          phoneNumber: null,
          lastConnected: null
        };
      }

      console.log(`[WhatsApp Service] Checking status for session '${sessionId}': connected=${conn.isConnected}, status=${conn.connectionStatus}`);
      
      return {
        success: true,
        connected: conn.isConnected,
        status: conn.connectionStatus,
        message: conn.isConnected ? 'WhatsApp connected' : 'WhatsApp disconnected',
        phoneNumber: conn.phoneNumber || null,
        lastConnected: conn.lastConnected || null
      };
    } catch (error) {
      console.error(`[WhatsApp Service] Error getting status:`, error);
      return {
        success: false,
        connected: false,
        status: 'error',
        message: error.message,
        phoneNumber: null,
        lastConnected: null
      };
    }
  }

  async sendMessage(sessionId = 'default', to, message) {
    try {
      const conn = connections.get(sessionId);
      
      if (!conn || !conn.isConnected) {
        return {
          success: false,
          message: 'WhatsApp not connected'
        };
      }

      // Format number (add @s.whatsapp.net suffix)
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      
      // Send message
      const result = await conn.sock.sendMessage(jid, { text: message });
      
      console.log(`[WhatsApp Service] Message sent to ${to}`);
      return {
        success: true,
        messageId: result.key.id,
        message: 'Message sent successfully'
      };
    } catch (error) {
      console.error(`[WhatsApp Service] Error sending message:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async disconnectSession(sessionId = 'default') {
    try {
      logWebSocketEvent(sessionId, 'DISCONNECT_REQUEST', { timestamp: Date.now() });
      console.log(`[WhatsApp Service] Enhanced disconnection for session: ${sessionId}`);
      
      const conn = connections.get(sessionId);
      
      // Clear all stability features
      this.clearHeartbeat(sessionId);
      this.flushConnectionBuffer(sessionId);
      
      if (conn && conn.sock) {
        try {
          await conn.sock.logout();
          conn.sock.end();
          logWebSocketEvent(sessionId, 'SOCKET_LOGOUT_SUCCESS', {});
        } catch (logoutError) {
          console.log(`[WhatsApp Service] Logout error (expected): ${logoutError.message}`);
          logWebSocketEvent(sessionId, 'SOCKET_LOGOUT_ERROR', { 
            error: logoutError.message 
          });
        }
      }
      
      // Clean up all tracking data
      connections.delete(sessionId);
      qrCodes.delete(sessionId);
      retryAttempts.delete(sessionId);
      connectionBuffers.delete(sessionId);
      
      // Clear auth state cache
      this.authStateCache.delete(sessionId);
      
      // Clear all session data and encryption keys
      try {
        console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Starting comprehensive session cleanup for ${sessionId}`);
        
        // Clear from baileys_sessions directory
        const sessionPath = path.join(sessionsDir, sessionId);
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Cleared session files from: ${sessionPath}`);
        }
        
        // Clear from sessions directory (phone-based)
        const phoneSessionPath = path.join(phoneSessionsDir, sessionId);
        if (fs.existsSync(phoneSessionPath)) {
          fs.rmSync(phoneSessionPath, { recursive: true, force: true });
          console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Cleared phone session files from: ${phoneSessionPath}`);
        }
        
        // Clear from data directory if exists
        const dataSessionPath = path.join(dataDir, sessionId);
        if (fs.existsSync(dataSessionPath)) {
          fs.rmSync(dataSessionPath, { recursive: true, force: true });
          console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Cleared data files from: ${dataSessionPath}`);
        }
        
        // Clear any additional encryption key stores
        const encryptionPaths = [
          path.join(__dirname, 'auth_info_baileys'),
          path.join(__dirname, 'session_data'),
          path.join(__dirname, '.baileys_store'),
          path.join(__dirname, 'whatsapp_session')
        ];
        
        for (const encPath of encryptionPaths) {
          const sessionEncPath = path.join(encPath, sessionId);
          if (fs.existsSync(sessionEncPath)) {
            fs.rmSync(sessionEncPath, { recursive: true, force: true });
            console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Cleared encryption data from: ${sessionEncPath}`);
          }
        }
        
        // Clear conversation history for this session
        const conversationKeys = Array.from(this.conversationHistory.keys()).filter(key => key.startsWith(sessionId));
        conversationKeys.forEach(key => this.conversationHistory.delete(key));
        console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Cleared ${conversationKeys.length} conversation histories`);
        
        // Clear greeting cooldowns for this session
        const cooldownKeys = Array.from(this.greetingCooldowns.keys()).filter(key => key.startsWith(sessionId));
        cooldownKeys.forEach(key => this.greetingCooldowns.delete(key));
        console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Cleared ${cooldownKeys.length} greeting cooldowns`);
        
        // Clear message queues for this session
        const queueKeys = Array.from(this.messageQueues.keys()).filter(key => key.startsWith(sessionId));
        queueKeys.forEach(key => {
          const queue = this.messageQueues.get(key);
          if (queue && queue.timer) {
            clearTimeout(queue.timer);
          }
          this.messageQueues.delete(key);
        });
        console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Cleared ${queueKeys.length} message queues`);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Forced garbage collection`);
        }
        
        logWebSocketEvent(sessionId, 'SESSION_FILES_CLEARED', { 
          paths: [sessionPath, phoneSessionPath, dataSessionPath],
          encryptionPathsCleared: encryptionPaths.length,
          conversationHistoriesCleared: conversationKeys.length,
          cooldownsCleared: cooldownKeys.length,
          messageQueuesCleared: queueKeys.length
        });
        
        console.log(`[WhatsApp Service] [ENCRYPTION CLEANUP] Comprehensive cleanup completed for ${sessionId}`);
        
      } catch (cleanupError) {
        console.error(`[WhatsApp Service] Error clearing session files:`, cleanupError);
        logWebSocketEvent(sessionId, 'SESSION_FILES_CLEAR_ERROR', { 
          error: cleanupError.message 
        });
      }
      
      logWebSocketEvent(sessionId, 'DISCONNECT_COMPLETE', { 
        timestamp: Date.now()
      });
      
      return {
        success: true,
        message: 'Disconnected successfully with complete cleanup'
      };
    } catch (error) {
      console.error(`[WhatsApp Service] Error disconnecting:`, error);
      logWebSocketEvent(sessionId, 'DISCONNECT_ERROR', { 
        error: error.message 
      });
      
      // Force cleanup even on error
      this.clearHeartbeat(sessionId);
      this.flushConnectionBuffer(sessionId);
      connections.delete(sessionId);
      qrCodes.delete(sessionId);
      retryAttempts.delete(sessionId);
      connectionBuffers.delete(sessionId);
      this.authStateCache.delete(sessionId);
      
      // Try to clear session files even on error
      try {
        const sessionPath = path.join(sessionsDir, sessionId);
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        const phoneSessionPath = path.join(phoneSessionsDir, sessionId);
        if (fs.existsSync(phoneSessionPath)) {
          fs.rmSync(phoneSessionPath, { recursive: true, force: true });
        }
        const dataSessionPath = path.join(dataDir, sessionId);
        if (fs.existsSync(dataSessionPath)) {
          fs.rmSync(dataSessionPath, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.error(`[WhatsApp Service] Error clearing session files on error:`, cleanupError);
      }
      
      return {
        success: false,
        message: error.message
      };
    }
  }

  async refreshQR(sessionId = 'default') {
    try {
      console.log(`[WhatsApp Service] Refreshing QR for session: ${sessionId}`);
      
      // Use getQRCode with force=true to regenerate
      return await this.getQRCode(sessionId, true);
    } catch (error) {
      console.error(`[WhatsApp Service] Error refreshing QR:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

// Create singleton instance
const whatsAppService = new WhatsAppService();

module.exports = whatsAppService;