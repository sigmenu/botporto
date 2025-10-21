// @ts-nocheck
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import fs from 'fs'
import path from 'path'
import P from 'pino'
import OpenAI from 'openai'

// Load environment variables
dotenv.config()

// Initialize Prisma client
const prisma = new PrismaClient()

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Check if OpenAI API key is configured
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️ OPENAI_API_KEY not set. AI mode will not work properly.')
}

// WhatsApp connections storage
const whatsappConnections = new Map()
const qrCodes = new Map()
const connectionStatus = new Map()
const messageQueues = new Map()
const botConfigs = new Map() // userId -> {model}
const lastGreetingTimes = new Map() // phoneNumber -> timestamp

// Create sessions directory if it doesn't exist
const sessionsDir = path.join(__dirname, '../sessions')
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true })
}

// Create Express application
const app = express()
const PORT = parseInt(process.env.PORT || '3333', 10)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key'

// Middleware
app.use(helmet())
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3002',
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ],
  credentials: true,
}))
app.use(compression())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Auth middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    })
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      })
    }
    // Ensure userId is available in req.user
    req.user = {
      userId: decoded.userId || decoded.id,
      email: decoded.email,
      role: decoded.role
    }
    next()
  })
}

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'WhatsApp Bot SaaS API',
    message: 'WhatsApp Bot API is running with database connection',
    version: '1.0.0',
    status: 'online',
    mode: 'production',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      login: '/api/auth/login',
      register: '/api/auth/register',
      me: '/api/auth/me'
    }
  })
})

// Health check
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      message: 'Server running with database connection'
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', { email: req.body.email })

    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      })
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        role: true,
        plan: true,
        isFirstLogin: true,
        onboardingStep: true,
        isActive: true,
        emailVerified: true,
        company: true,
        phone: true
      }
    })

    if (!user) {
      console.log('❌ User not found:', email)
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      })
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      })
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', email)
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      })
    }

    // Create JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Return user data (excluding password)
    const { password: _, ...userWithoutPassword } = user

    console.log('✅ Login successful:', { email, userId: user.id })

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        tokens: {
          accessToken: token,
          refreshToken: token // For now, using same token
        }
      }
    })

  } catch (error) {
    console.error('❌ Login error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    })
  }
})

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('📝 Registration attempt:', { email: req.body.email })

    const { name, email, password, company, phone } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required'
      })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        company: company || null,
        phone: phone || null,
        role: 'CLIENT',
        plan: 'TRIAL',
        isFirstLogin: true,
        onboardingStep: 0,
        isActive: true,
        emailVerified: false
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        isFirstLogin: true,
        onboardingStep: true,
        isActive: true,
        emailVerified: true,
        company: true,
        phone: true
      }
    })

    // Create JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    console.log('✅ Registration successful:', { email, userId: user.id })

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user,
        tokens: {
          accessToken: token,
          refreshToken: token
        }
      }
    })

  } catch (error) {
    console.error('❌ Registration error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    })
  }
})

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        isFirstLogin: true,
        onboardingStep: true,
        isActive: true,
        emailVerified: true,
        company: true,
        phone: true
      }
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    res.json({
      success: true,
      data: {
        user
      }
    })

  } catch (error) {
    console.error('❌ Get user error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    })
  }
})

// Logout endpoint (client-side token removal)
app.post('/api/auth/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  })
})

// Complete onboarding endpoint
app.post('/api/onboarding/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const {
      businessNiche,
      businessName,
      businessInfo,
      businessPhone,
      businessAddress,
      businessWebsite,
      personality,
      language,
      welcomeMessage,
      offlineMessage,
      workingHours,
      autoResponse,
      humanHandoff,
      leadCapture
    } = req.body

    // Validate required fields
    if (!businessNiche || !businessName || !businessInfo || !personality) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: businessNiche, businessName, businessInfo, personality'
      })
    }

    // Update user to mark onboarding as complete
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        isFirstLogin: false,
        onboardingStep: 6,
        company: businessName
      }
    })

    // Create or update bot configuration (simplified for now)
    console.log('Bot configuration data:', {
      userId,
      businessNiche,
      businessName,
      businessInfo,
      personality,
      language: language || 'pt-BR',
      workingHours: workingHours || {},
      autoResponse: autoResponse !== undefined ? autoResponse : true,
      humanHandoff: humanHandoff !== undefined ? humanHandoff : false,
      leadCapture: leadCapture !== undefined ? leadCapture : true
    })

    res.json({
      success: true,
      message: 'Onboarding completed successfully',
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          plan: updatedUser.plan,
          isFirstLogin: updatedUser.isFirstLogin,
          onboardingStep: updatedUser.onboardingStep,
          isActive: updatedUser.isActive,
          emailVerified: updatedUser.emailVerified,
          company: updatedUser.company,
          phone: updatedUser.phone
        },
        nextStep: 'whatsapp-connection'
      }
    })

  } catch (error) {
    console.error('❌ Onboarding complete error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error during onboarding completion'
    })
  }
})

// WhatsApp QR Code endpoint
app.get('/api/whatsapp/qr', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    console.log('🔗 WhatsApp QR requested for user:', userId)

    // Check if user already has a QR ready or is connected
    const existingStatus = connectionStatus.get(userId)
    const existingQR = qrCodes.get(userId)

    if (existingQR && existingStatus === 'qr_ready') {
      console.log('🔄 Returning existing QR for user:', userId)
      return res.json({
        success: true,
        message: 'QR code available',
        qr: existingQR,
        status: 'waiting_scan',
        data: {
          userId,
          generated_at: new Date().toISOString(),
          expires_in: 20
        }
      })
    }

    if (existingStatus === 'connected') {
      console.log('✅ User already connected:', userId)
      return res.json({
        success: true,
        message: 'WhatsApp already connected',
        connected: true,
        status: 'connected'
      })
    }

    // Only clear if we need to create a fresh connection
    if (whatsappConnections.has(userId) && existingStatus !== 'qr_ready') {
      console.log('🔄 Clearing stale connection for user:', userId)
      const oldSock = whatsappConnections.get(userId)
      try {
        oldSock.end()
      } catch (e) {
        console.log('❌ Error ending old socket:', e.message)
      }
      whatsappConnections.delete(userId)
      connectionStatus.delete(userId)
      qrCodes.delete(userId)

      // Clear old session files only when creating fresh connection
      const userSessionPath = path.join(sessionsDir, `user_${userId}`)
      if (fs.existsSync(userSessionPath)) {
        console.log('🗑️ Removing old session files for user:', userId)
        fs.rmSync(userSessionPath, { recursive: true, force: true })
      }
    }

    // Set up session path
    const userSessionPath = path.join(sessionsDir, `user_${userId}`)
    console.log('📁 Session path:', userSessionPath)

    const { state, saveCreds } = await useMultiFileAuthState(userSessionPath)

    // Create WhatsApp socket with proper pino logger
    const logger = P({ level: 'silent' }) // Silent logger to reduce noise

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ['WhatsApp Bot SaaS', 'Chrome', '1.0.0']
    })

    // Store socket reference
    whatsappConnections.set(userId, sock)
    connectionStatus.set(userId, 'connecting')

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      console.log('📱 Connection update for user', userId, ':', { connection, hasQr: !!qr })

      if (qr) {
        try {
          // Generate QR code data URL
          const qrDataURL = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          })
          qrCodes.set(userId, qrDataURL)
          connectionStatus.set(userId, 'qr_ready')
          console.log('✅ QR code generated for user:', userId)
        } catch (qrError) {
          console.error('❌ QR code generation error:', qrError)
        }
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp connected successfully for user:', userId)
        connectionStatus.set(userId, 'connected')
        qrCodes.delete(userId) // Clean up QR code

        // Get user info
        const userInfo = sock.user
        console.log('👤 Connected as:', userInfo?.name, '|', userInfo?.id)

        // Set up message handler with queue system
        sock.ev.on('messages.upsert', async (m) => {
          try {
            const msg = m.messages[0]
            if (!msg.key.fromMe && m.type === 'notify') {
              const from = msg.key.remoteJid
              const message = msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text || ''

              if (!message) return
              console.log('💬 Message from', from, ':', message)

              // Add to queue
              if (!messageQueues.has(from)) {
                messageQueues.set(from, {
                  messages: [],
                  timer: null
                })
              }

              const queue = messageQueues.get(from)
              queue.messages.push(message)

              // Clear existing timer
              if (queue.timer) {
                clearTimeout(queue.timer)
              }

              // Show typing indicator
              await sock.sendPresenceUpdate('composing', from)

              // Set new timer for 10 seconds
              queue.timer = setTimeout(async () => {
                const allMessages = queue.messages.join(' ')
                const config = botConfigs.get(userId) || { mode: 'AI' }

                try {
                  let responseText: string

                  // Normalize mode to uppercase for comparison
                  const mode = (config.mode || 'AI').toString().toUpperCase()

                  if (mode === 'GREETING') {
                    // Check cooldown for greeting mode
                    const lastTime = lastGreetingTimes.get(from) || 0
                    const now = Date.now()
                    const cooldownMs = (config.cooldownHours || 24) * 60 * 60 * 1000

                    if (now - lastTime < cooldownMs) {
                      console.log('🕐 Cooldown active, not sending greeting')
                      queue.messages = []
                      queue.timer = null
                      await sock.sendPresenceUpdate('paused', from)
                      return
                    }

                    responseText = config.greetingMessage || 'Olá! Obrigado por entrar em contato.'
                    lastGreetingTimes.set(from, now)
                    console.log('👋 Sending greeting message')

                  } else {
                    // AI mode - OpenAI integration
                    console.log('🤖 Processing with AI:', allMessages)

                    if (!process.env.OPENAI_API_KEY) {
                      throw new Error('OpenAI API key not configured')
                    }

                    const completion = await openai.chat.completions.create({
                      model: 'gpt-3.5-turbo',
                      messages: [
                        {
                          role: 'system',
                          content: 'Você é um assistente virtual amigável no WhatsApp. Responda de forma útil, concisa e em português. Mantenha suas respostas curtas e relevantes para WhatsApp.'
                        },
                        { role: 'user', content: allMessages }
                      ],
                      max_tokens: 500,
                      temperature: 0.7
                    })

                    responseText = completion.choices[0]?.message?.content?.trim() || 'Desculpe, não consegui processar sua mensagem.'
                    console.log('🎯 AI responded successfully')
                  }

                  await sock.sendPresenceUpdate('paused', from)
                  await sock.sendMessage(from, { text: responseText })
                  console.log('✅ Response sent to', from)

                } catch (error) {
                  console.error('❌ Error processing message:', error)

                  // More specific error handling
                  let errorMessage = 'Desculpe, ocorreu um erro ao processar sua mensagem.'

                  if (error instanceof Error) {
                    if (error.message.includes('OpenAI API key')) {
                      errorMessage = 'Serviço de IA temporariamente indisponível. Tente novamente mais tarde.'
                    } else if (error.message.includes('rate_limit')) {
                      errorMessage = 'Muitas mensagens enviadas. Aguarde um momento e tente novamente.'
                    } else if (error.message.includes('quota')) {
                      errorMessage = 'Limite de uso do serviço atingido. Tente novamente mais tarde.'
                    }
                  }

                  try {
                    await sock.sendPresenceUpdate('paused', from)
                    await sock.sendMessage(from, { text: errorMessage })
                  } catch (sendError) {
                    console.error('❌ Error sending error message:', sendError)
                  }
                }

                // Clear queue
                queue.messages = []
                queue.timer = null
              }, 10000) // Wait 10 seconds
            }
          } catch (error) {
            console.error('❌ Error handling message:', error)
          }
        })

        console.log('🤖 Message handler activated for user:', userId)
      }

      if (connection === 'close') {
        console.log('🔌 Connection closed for user:', userId)
        const reason = (lastDisconnect?.error as any)?.output?.statusCode

        whatsappConnections.delete(userId)
        qrCodes.delete(userId)

        if (reason === DisconnectReason.loggedOut) {
          console.log('📤 User logged out, cleaning session')
          connectionStatus.set(userId, 'logged_out')
          // Clean up session files
          try {
            fs.rmSync(userSessionPath, { recursive: true, force: true })
          } catch (err) {
            console.error('Error cleaning session:', err)
          }
        } else {
          console.log('🔄 Disconnected due to:', reason, 'Will attempt reconnect if needed')
          connectionStatus.set(userId, 'disconnected')
        }
      }
    })

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds)

    // Wait a bit for QR code generation
    setTimeout(() => {
      const qrDataURL = qrCodes.get(userId)
      const status = connectionStatus.get(userId)

      if (qrDataURL) {
        res.json({
          success: true,
          message: 'QR code generated successfully',
          qr: qrDataURL,
          status: 'waiting_scan',
          data: {
            userId,
            generated_at: new Date().toISOString(),
            expires_in: 20 // QR codes typically expire in ~20 seconds
          }
        })
      } else if (status === 'connected') {
        res.json({
          success: true,
          message: 'WhatsApp already connected',
          connected: true,
          qr: null
        })
      } else {
        res.json({
          success: false,
          message: 'QR code generation in progress, please try again',
          status: 'generating'
        })
      }
    }, 3000) // Wait 3 seconds for QR generation

  } catch (error) {
    console.error('❌ WhatsApp QR error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating QR code',
      error: error.message
    })
  }
})

// WhatsApp QR Refresh endpoint - Force generate new QR without clearing session
app.post('/api/whatsapp/qr/refresh', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    console.log('🔄 WhatsApp QR refresh requested for user:', userId)

    // Check if user has an active socket
    const sock = whatsappConnections.get(userId)
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: 'No active WhatsApp connection. Please generate initial QR first.',
        status: 'no_connection'
      })
    }

    // Clear existing QR to force new one
    qrCodes.delete(userId)
    connectionStatus.set(userId, 'refreshing')

    // The socket should automatically generate a new QR
    // Wait for new QR generation
    let attempts = 0
    const checkQR = setInterval(() => {
      const qr = qrCodes.get(userId)
      if (qr || attempts > 10) {
        clearInterval(checkQR)
        if (qr) {
          res.json({
            success: true,
            message: 'QR code refreshed successfully',
            qr,
            status: 'waiting_scan',
            data: {
              userId,
              generated_at: new Date().toISOString(),
              expires_in: 20
            }
          })
        } else {
          res.json({
            success: false,
            message: 'QR refresh timeout. Please try generating a new connection.',
            status: 'timeout'
          })
        }
      }
      attempts++
    }, 500)

  } catch (error) {
    console.error('❌ WhatsApp QR refresh error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error while refreshing QR code',
      error: error.message
    })
  }
})

// WhatsApp Status endpoint
app.get('/api/whatsapp/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    // Check if user has an active connection
    const isConnected = whatsappConnections.has(userId)
    const status = connectionStatus.get(userId) || 'disconnected'
    const sock = whatsappConnections.get(userId)

    console.log('📱 WhatsApp status check for user:', userId, '- Connected:', isConnected, '- Status:', status)

    let userInfo = null
    if (isConnected && sock?.user) {
      userInfo = {
        name: sock.user.name,
        id: sock.user.id,
        phone: sock.user.id?.split(':')[0] || 'Unknown'
      }
    }

    res.json({
      success: true,
      connected: isConnected && status === 'connected',
      status: status,
      message: isConnected && status === 'connected'
        ? 'WhatsApp is connected'
        : `WhatsApp is ${status}`,
      data: {
        userId,
        connectionStatus: status,
        userInfo,
        last_check: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('❌ WhatsApp status error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error while checking WhatsApp status'
    })
  }
})

// WhatsApp Send Message endpoint
app.post('/api/whatsapp/send', authenticateToken, async (req, res) => {
  try {
    const { to, message } = req.body
    const userId = req.user.userId

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, message'
      })
    }

    const sock = whatsappConnections.get(userId)
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp not connected. Please connect first.'
      })
    }

    // Format phone number - add @s.whatsapp.net if not present
    const phoneNumber = to.includes('@') ? to : `${to}@s.whatsapp.net`

    console.log('📤 Sending message to', phoneNumber, 'from user:', userId)
    console.log('💬 Message:', message)

    await sock.sendMessage(phoneNumber, { text: message })

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        to: phoneNumber,
        message: message,
        sentAt: new Date().toISOString()
      }
    })

    console.log('✅ Message sent successfully to', phoneNumber)

  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    })
  }
})

// WhatsApp Disconnect endpoint
app.post('/api/whatsapp/disconnect', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    console.log('🔌 WhatsApp disconnect requested for user:', userId)

    const sock = whatsappConnections.get(userId)

    if (sock) {
      try {
        // Properly logout from WhatsApp
        await sock.logout()
        console.log('✅ WhatsApp logout successful for user:', userId)
      } catch (logoutError) {
        console.error('⚠️ Error during logout:', logoutError)
        // Continue with cleanup even if logout fails
      }

      // Clean up connections
      whatsappConnections.delete(userId)
      qrCodes.delete(userId)
      connectionStatus.set(userId, 'logged_out')

      // Clean up session files
      const userSessionPath = path.join(sessionsDir, `user_${userId}`)
      try {
        if (fs.existsSync(userSessionPath)) {
          fs.rmSync(userSessionPath, { recursive: true, force: true })
          console.log('🗑️ Session files cleaned for user:', userId)
        }
      } catch (cleanupError) {
        console.error('⚠️ Error cleaning session files:', cleanupError)
      }
    }

    res.json({
      success: true,
      message: 'WhatsApp disconnected successfully',
      data: {
        userId,
        disconnected_at: new Date().toISOString(),
        status: 'logged_out'
      }
    })

  } catch (error) {
    console.error('❌ WhatsApp disconnect error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error while disconnecting WhatsApp'
    })
  }
})

// Bot Configuration endpoint
app.post('/api/bot/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { mode, greetingMessage, cooldownHours, model } = req.body

    // Normalize/config defaults
    const normalizedModel = (model || mode || 'gpt-4o-mini').toString()

    const botConfig = await prisma.botConfig.upsert({
      where: { userId },
      update: {
        model: normalizedModel,
      },
      create: {
        userId,
        model: normalizedModel,
      }
    })

    // Maintain in-memory minimal cache
    botConfigs.set(userId, { model: botConfig.model })

    res.json({
      success: true,
      message: 'Bot configuration saved successfully',
      data: { model: botConfig.model }
    })
  } catch (error) {
    console.error('❌ Bot config save error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error while saving bot config'
    })
  }
})

// Get Bot Configuration endpoint
app.get('/api/bot/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    const dbConfig = await prisma.botConfig.findUnique({
      where: { userId },
      select: { model: true }
    })

    if (dbConfig) {
      botConfigs.set(userId, dbConfig)
      res.json({ success: true, data: dbConfig })
    } else {
      const defaultConfig = { model: 'gpt-4o-mini' }
      res.json({ success: true, data: defaultConfig })
    }
  } catch (error) {
    console.error('❌ Bot config get error:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error while getting bot config'
    })
  }
})

// Test database connection
app.get('/api/test/db', async (req, res) => {
  try {
    const userCount = await prisma.user.count()
    const users = await prisma.user.findMany({
      select: {
        email: true,
        name: true,
        role: true,
        isActive: true
      },
      take: 5
    })

    res.json({
      success: true,
      message: 'Database connection successful',
      data: {
        totalUsers: userCount,
        sampleUsers: users
      }
    })
  } catch (error) {
    console.error('Database test error:', error)
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  })
})

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
  console.error('❌ Server error:', error)

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  })
})

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...')
  await prisma.$disconnect()
  process.exit(0)
})

// Start server
const startServer = (port: number) => {
  const server = app.listen(port, async () => {
    try {
      // Test database connection on startup
      await prisma.$queryRaw`SELECT 1`
      console.log(`🚀 Server running on port ${port}`)
      console.log(`📍 Health check: http://localhost:${port}/health`)
      console.log(`🔐 Login: http://localhost:${port}/api/auth/login`)
      console.log(`🧪 DB Test: http://localhost:${port}/api/test/db`)
      console.log(`📊 Database: Connected`)
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)

      // Load bot configurations from database into memory cache
      try {
        const botConfigsFromDb = await prisma.botConfig.findMany({
          select: {
            userId: true,
            model: true
          }
        })

        botConfigsFromDb.forEach(config => {
          botConfigs.set(config.userId, {
            model: config.model
          })
        })

        console.log(`🤖 Loaded ${botConfigsFromDb.length} bot configurations from database`)
      } catch (loadError) {
        console.warn('⚠️ Could not load bot configs from database:', loadError)
      }
    } catch (error) {
      console.error('❌ Database connection failed on startup:', error)
    }
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`❌ Port ${port} is busy, trying port ${port + 1}...`)
      startServer(port + 1)
    } else {
      console.error('❌ Server startup error:', err)
      process.exit(1)
    }
  })

  return server
}

startServer(PORT)

export default app