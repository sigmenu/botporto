// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth';
import { AppError } from './error';
import { logger } from '../utils/logger';

// Estender interface Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

// Middleware de autenticação JWT
export const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new AppError('Token de acesso requerido', 401);
    }

    const decoded = await authService.verifyToken(token);
    req.user = decoded;
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação JWT:', error);
    next(error);
  }
};

// Middleware de autenticação API Key
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new AppError('Chave API requerida', 401);
    }

    const { user, permissions } = await authService.verifyApiKey(apiKey);
    req.user = user;
    (req as any).permissions = permissions;
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação API Key:', error);
    next(error);
  }
};

// Middleware de autorização por role
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Usuário não autenticado', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError('Acesso negado', 403);
    }

    next();
  };
};

// Middleware de autorização por permissão (para API Keys)
export const requirePermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPermissions = (req as any).permissions || [];

    const hasPermission = permissions.some(permission => 
      userPermissions.includes(permission) || userPermissions.includes('*')
    );

    if (!hasPermission) {
      throw new AppError('Permissões insuficientes', 403);
    }

    next();
  };
};

// Middleware para verificar propriedade do recurso
export const requireOwnership = (resourceIdParam: string = 'id') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Usuário não autenticado', 401);
      }

      // Admins podem acessar qualquer recurso
      if (req.user.role === 'ADMIN') {
        return next();
      }

      const resourceId = req.params[resourceIdParam];
      
      // Verificar se o recurso pertence ao usuário
      // Esta verificação deve ser implementada conforme o contexto
      // Por exemplo, verificar se a sessão WhatsApp pertence ao usuário
      
      next();
    } catch (error) {
      logger.error('Erro na verificação de propriedade:', error);
      next(error);
    }
  };
};

// Middleware opcional de autenticação (não falha se não autenticado)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = await authService.verifyToken(token);
        req.user = decoded;
      } catch (error) {
        // Ignorar erro de token inválido em auth opcional
        logger.warn('Token inválido em auth opcional:', error);
      }
    }
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação opcional:', error);
    next();
  }
};

// Middleware para verificar subscription ativa
export const requireActiveSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Usuário não autenticado', 401);
    }

    const { prisma } = await import('../index');
    
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user.id },
    });

    if (!subscription || subscription.status !== 'ACTIVE') {
      throw new AppError('Assinatura inativa ou inexistente', 403);
    }

    (req as any).subscription = subscription;
    next();
  } catch (error) {
    logger.error('Erro na verificação de subscription:', error);
    next(error);
  }
};

// Middleware para verificar limites de uso
export const checkUsageLimits = (limitType: 'messages' | 'contacts' | 'sessions') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Usuário não autenticado', 401);
      }

      const { prisma } = await import('../index');
      
      const subscription = await prisma.subscription.findUnique({
        where: { userId: req.user.id },
      });

      if (!subscription) {
        throw new AppError('Assinatura não encontrada', 404);
      }

      let limitReached = false;

      switch (limitType) {
        case 'messages':
          limitReached = subscription.messagesUsed >= subscription.messagesLimit;
          break;
        case 'contacts':
          limitReached = subscription.contactsUsed >= subscription.contactsLimit;
          break;
        case 'sessions':
          const sessionCount = await prisma.whatsAppSession.count({
            where: { userId: req.user.id },
          });
          limitReached = sessionCount >= subscription.sessionsLimit;
          break;
      }

      if (limitReached) {
        throw new AppError(`Limite de ${limitType} atingido`, 429);
      }

      (req as any).subscription = subscription;
      next();
    } catch (error) {
      logger.error('Erro na verificação de limites:', error);
      next(error);
    }
  };
};