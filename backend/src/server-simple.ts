import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Criar aplicação Express
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middlewares básicos
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3002',
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'WhatsApp Bot SaaS API (Simple Mode)',
    message: 'WhatsApp Bot API is running in simple mode',
    version: '1.0.0',
    status: 'online',
    mode: 'simple',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      test: '/api/test',
      authTest: '/api/auth/test',
      login: '/api/auth/login',
      register: '/api/auth/register',
      me: '/api/auth/me',
      refresh: '/api/auth/refresh',
      logout: '/api/auth/logout'
    },
    note: 'Running without database dependencies for testing'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Simple server running without database',
    mode: 'simple'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Simple server is working!',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Authentication endpoints
app.post('/api/auth/register', (req, res) => {
  console.log('🔐 Register endpoint called:', { body: req.body });
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Nome, email e senha são obrigatórios',
    });
  }
  
  if (email === 'admin@teste.com') {
    return res.status(409).json({
      success: false,
      message: 'Este email já está em uso',
    });
  }
  
  const mockUser = {
    id: 'mock-user-id',
    name,
    email,
    role: 'USER',
    emailVerified: false,
    isActive: true,
  };
  
  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  };
  
  res.status(201).json({
    success: true,
    message: 'Usuário criado com sucesso',
    token: mockTokens.accessToken,  // For simple frontend compatibility
    user: mockUser,  // For simple frontend compatibility
    data: {
      user: mockUser,
      tokens: mockTokens,
    },
  });
});

app.post('/api/auth/login', (req, res) => {
  console.log('🔐 Login endpoint called:', { body: req.body });
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email e senha são obrigatórios',
    });
  }
  
  if (email === 'admin@teste.com' && password === 'admin123') {
    const mockUser = {
      id: 'admin-id',
      name: 'Administrador',
      email: 'admin@teste.com',
      role: 'ADMIN',
      emailVerified: true,
      isActive: true,
    };
    
    const mockTokens = {
      accessToken: 'mock-admin-access-token',
      refreshToken: 'mock-admin-refresh-token',
    };
    
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token: mockTokens.accessToken,  // For simple frontend compatibility
      user: mockUser,  // For simple frontend compatibility
      data: {
        user: mockUser,
        tokens: mockTokens,
      },
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Email ou senha incorretos',
    });
  }
});

app.get('/api/auth/me', (req, res) => {
  console.log('🔐 Me endpoint called');
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Token de autorização é obrigatório',
    });
  }
  
  const mockUser = {
    id: 'admin-id',
    name: 'Administrador',
    email: 'admin@teste.com',
    role: 'ADMIN',
    emailVerified: true,
    isActive: true,
  };
  
  res.json({
    success: true,
    data: {
      user: mockUser,
    },
  });
});

app.post('/api/auth/refresh', (req, res) => {
  console.log('🔐 Refresh endpoint called');
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token é obrigatório',
    });
  }
  
  const mockTokens = {
    accessToken: 'new-mock-access-token',
    refreshToken: 'new-mock-refresh-token',
  };
  
  res.json({
    success: true,
    message: 'Token renovado com sucesso',
    data: {
      tokens: mockTokens,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  console.log('🔐 Logout endpoint called');
  res.json({
    success: true,
    message: 'Logout realizado com sucesso',
  });
});

// Basic auth test endpoint
app.post('/api/auth/test', (req, res) => {
  const { email, password } = req.body;
  
  res.json({
    success: true,
    message: 'Auth endpoint test',
    data: {
      email: email || 'test@example.com',
      received: !!email && !!password,
    },
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
  console.error('Error:', error);
  
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

// Start server with port conflict handling
function startServer(port: number) {
  const server = app.listen(port, () => {
    console.log(`🚀 Simple server running on port ${port}`);
    console.log(`📍 Health check: http://localhost:${port}/health`);
    console.log(`🧪 Test endpoint: http://localhost:${port}/api/test`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`❌ Port ${port} is busy, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('❌ Server startup error:', err);
      process.exit(1);
    }
  });
  
  return server;
}

startServer(PORT);

export default app;