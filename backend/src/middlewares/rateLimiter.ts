import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Rate limiter geral para API
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: {
    success: false,
    message: 'Muitas requisições. Tente novamente em alguns minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
    });
    
    res.status(429).json({
      success: false,
      message: 'Muitas requisições. Tente novamente em alguns minutos.',
    });
  },
});

// Rate limiter para autenticação (mais restritivo)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5000, // 5 tentativas por IP
  message: {
    success: false,
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  },
  skipSuccessfulRequests: true,
});

// Rate limiter para mensagens (por usuário)
export const messageRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 mensagens por minuto
  keyGenerator: (req) => {
    // Usar ID do usuário (id ou userId) se disponível, senão IP
    return (req.user && (req.user.id || req.user.userId)) || req.ip || 'anonymous';
  },
  message: {
    success: false,
    message: 'Limite de mensagens por minuto excedido.',
  },
});

// Rate limiter para webhook
export const webhookRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 100, // 100 webhooks por 5 minutos
  message: {
    success: false,
    message: 'Limite de webhooks excedido.',
  },
});