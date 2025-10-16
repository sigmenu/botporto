import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { logger } from './utils/logger';
import { errorHandler } from './middlewares/error';
import { rateLimiter } from './middlewares/rateLimiter';
import routes from './routes';
import { initializeWhatsAppService } from './services/whatsapp';
import { initializeRedis } from './lib/redis';
import { initializeQueue } from './lib/queue';

// Carregar variáveis de ambiente
dotenv.config();

// Inicializar Prisma
export const prisma = new PrismaClient();

// Criar aplicação Express
const app = express();
const server = createServer(app);

// Inicializar Socket.IO
export const io = new Server(server, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    credentials: true,
  },
});

// Middlewares globais
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

// Configuração CORS mais permissiva para desenvolvimento
const corsOptions = {
  origin: function (origin: any, callback: any) {
    // Permitir requisições sem origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL,
      process.env.NEXT_PUBLIC_APP_URL
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Não permitido pelo CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  exposedHeaders: ['Authorization'],
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
app.use('/api', rateLimiter);

// Root route
app.get('/', (_req, res) => {
  res.json({
    success: true,
    name: 'WhatsApp Bot SaaS API',
    message: 'WhatsApp Bot API is running',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      sessions: '/api/sessions',
      messages: '/api/messages',
      contacts: '/api/contacts',
      templates: '/api/templates',
      webhooks: '/api/webhooks',
      analytics: '/api/analytics',
      subscriptions: '/api/subscriptions'
    },
    documentation: 'https://github.com/your-repo/whatsapp-bot-saas'
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'connected' : 'disconnected',
    redis: process.env.REDIS_URL ? 'connected' : 'disconnected'
  });
});

// Rotas da API
app.use('/api', routes);

// Error handler
app.use(errorHandler);

// Socket.IO handlers
io.on('connection', (socket) => {
  logger.info(`Cliente conectado: ${socket.id}`);
  
  socket.on('join-session', (sessionId: string) => {
    socket.join(`session-${sessionId}`);
    logger.info(`Socket ${socket.id} entrou na sessão ${sessionId}`);
  });
  
  socket.on('leave-session', (sessionId: string) => {
    socket.leave(`session-${sessionId}`);
    logger.info(`Socket ${socket.id} saiu da sessão ${sessionId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Cliente desconectado: ${socket.id}`);
  });
});

// Função de inicialização
async function bootstrap() {
  try {
    // Conectar ao banco de dados (opcional)
    if (process.env.DATABASE_URL) {
      try {
        await prisma.$connect();
        logger.info('Conectado ao banco de dados');
      } catch (error) {
        logger.warn('Falha ao conectar com banco de dados (continuando sem DB):', error);
      }
    } else {
      logger.info('DATABASE_URL não definida, rodando sem banco de dados');
    }
    
    // Inicializar Redis (opcional)
    if (process.env.REDIS_URL) {
      try {
        await initializeRedis();
        logger.info('Redis inicializado');
        
        // Inicializar fila de mensagens
        await initializeQueue();
        logger.info('Sistema de filas inicializado');
      } catch (error) {
        logger.warn('Falha ao inicializar Redis/Queue (continuando sem cache):', error);
      }
    } else {
      logger.info('REDIS_URL não definida, rodando sem cache');
    }
    
    // Inicializar serviço WhatsApp (opcional)
    if (process.env.DATABASE_URL) {
      try {
        await initializeWhatsAppService();
        logger.info('Serviço WhatsApp inicializado');
      } catch (error) {
        logger.warn('Falha ao inicializar WhatsApp service (continuando sem WhatsApp):', error);
      }
    } else {
      logger.info('WhatsApp service não inicializado (requer banco de dados)');
    }
    
    // Iniciar servidor
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      logger.info(`🚀 Servidor rodando na porta ${PORT}`);
      logger.info(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📍 Health check: http://localhost:${PORT}/health`);
      logger.info(`💾 Database: ${process.env.DATABASE_URL ? 'conectado' : 'desconectado'}`);
      logger.info(`⚡ Redis: ${process.env.REDIS_URL ? 'conectado' : 'desconectado'}`);
    });
  } catch (error) {
    logger.error('Erro crítico ao inicializar aplicação:', error);
    process.exit(1);
  }
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (error: Error) => {
  logger.error('Unhandled Rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM recebido, iniciando graceful shutdown');
  
  server.close(() => {
    logger.info('Servidor HTTP fechado');
  });
  
  await prisma.$disconnect();
  logger.info('Conexão com banco de dados fechada');
  
  process.exit(0);
});

// Iniciar aplicação
bootstrap();