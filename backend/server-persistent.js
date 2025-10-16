const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const express = require('express');
const cors = require('cors');
const whatsappPersistentRoutes = require('./whatsapp-persistent-routes');
const whatsAppPersistentService = require('./whatsapp-baileys-persistent');
const botConfigRoutes = require('./bot-config-routes');

const prisma = new PrismaClient();
const app = express();

// Middleware para parsing de JSON
app.use(express.json());

// CORS configurado para o frontend na porta 3000
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rota principal
app.get('/', (req, res) => {
  res.json({ 
    message: 'WhatsApp Multi-Tenant Persistent API',
    version: '2.0.0',
    features: [
      'Multi-tenant session management',
      'Automatic reconnection after server restart',
      'Session persistence with database storage',
      'Graceful shutdown handling'
    ]
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    port: process.env.PORT || 3333,
    timestamp: new Date().toISOString(),
    message: 'Multi-tenant WhatsApp service is running',
    database: 'connected',
    sessions: 'persistent'
  });
});

// Rota de login
app.post('/api/auth/login', async (req, res) => {
  console.log('Login attempt:', req.body.email);
  const { email, password } = req.body;
  
  try {
    // Buscar usuário no banco
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) {
      console.log('Usuário não encontrado:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Email ou senha incorretos' 
      });
    }
    
    // Verificar senha
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      console.log('Senha incorreta para:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Email ou senha incorretos' 
      });
    }
    
    console.log('Login bem-sucedido:', email);
    
    // Retornar sucesso no formato esperado pelo frontend
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          plan: 'free',
          isFirstLogin: user.isFirstLogin || false,
          onboardingStep: 0,
          isActive: true,
          emailVerified: true
        },
        tokens: {
          accessToken: 'jwt-token-' + Date.now(),
          refreshToken: 'refresh-token-' + Date.now()
        }
      }
    });
    
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro no servidor' 
    });
  }
});

// Rota de registro
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'CLIENT',
        plan: 'TRIAL'
      }
    });
    
    res.json({
      success: true,
      token: 'jwt-token-' + Date.now(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: 'Email já cadastrado' 
    });
  }
});

// WhatsApp persistent routes
app.use('/api/whatsapp', whatsappPersistentRoutes);

// Legacy compatibility routes
app.use('/api/sessions', whatsappPersistentRoutes);

// Bot configuration routes
app.use('/api/bot', botConfigRoutes);

// Session management dashboard endpoint
app.get('/api/admin/sessions', async (req, res) => {
  try {
    const result = await whatsAppPersistentService.getAllSessions();
    
    if (result.success) {
      const stats = {
        totalSessions: result.sessions.length,
        connectedSessions: result.sessions.filter(s => s.status === 'CONNECTED').length,
        disconnectedSessions: result.sessions.filter(s => s.status === 'DISCONNECTED').length,
        errorSessions: result.sessions.filter(s => s.status === 'ERROR').length,
        qrPendingSessions: result.sessions.filter(s => s.status === 'QR_READY').length,
        reconnectingSessions: result.sessions.filter(s => s.healthStatus === 'RECONNECTING').length
      };
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        stats,
        sessions: result.sessions.map(session => ({
          ...session,
          uptime: session.connectedAt ? Date.now() - new Date(session.connectedAt).getTime() : null
        }))
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[Admin API] Error getting session overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load session overview'
    });
  }
});

// System stats endpoint
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [userCount, sessionCount] = await Promise.all([
      prisma.user.count(),
      prisma.whatsAppSession.count()
    ]);
    
    const result = await whatsAppPersistentService.getAllSessions();
    const activeSessions = result.success ? result.sessions.filter(s => s.status === 'CONNECTED').length : 0;
    
    res.json({
      success: true,
      stats: {
        totalUsers: userCount,
        totalSessions: sessionCount,
        activeSessions,
        systemUptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Admin API] Error getting system stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load system stats'
    });
  }
});

// Startup function to initialize all sessions
async function initializeServer() {
  try {
    console.log('\n================================');
    console.log('🚀 Starting WhatsApp Multi-Tenant Service');
    console.log('================================');
    
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    // Initialize all existing sessions
    console.log('🔄 Initializing existing WhatsApp sessions...');
    await whatsAppPersistentService.initializeAllSessions();
    
    console.log('✅ Session initialization completed');
    
  } catch (error) {
    console.error('❌ Error during server initialization:', error);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3333;

// Start server
app.listen(PORT, async () => {
  console.log(`\n
  ================================
  ✅ Servidor rodando com sucesso!
  ================================
  URL: http://localhost:${PORT}
  
  🎯 Multi-Tenant WhatsApp Service
  📱 Automatic session persistence
  🔄 Auto-reconnection enabled
  💾 Database-backed session storage
  
  Teste de login habilitado
  Use: admin@teste.com / admin123
  ================================
  `);
  
  // Initialize all sessions after server starts
  setTimeout(initializeServer, 2000);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});