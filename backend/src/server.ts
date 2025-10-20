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