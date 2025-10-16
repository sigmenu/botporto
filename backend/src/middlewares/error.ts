import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  statusCode: number;
  isOperational: boolean;
  
  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';
  
  // Log do erro
  logger.error('Erro na API:', {
    message: err.message,
    stack: err.stack,
    statusCode,
    url: _req.originalUrl,
    method: _req.method,
    ip: _req.ip,
    userAgent: _req.get('User-Agent'),
  });
  
  // Resposta de erro em desenvolvimento vs produção
  const isDev = process.env.NODE_ENV === 'development';
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(isDev && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validação de dados
export const validateRequired = (fields: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const missingFields = fields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      throw new AppError(
        `Campos obrigatórios ausentes: ${missingFields.join(', ')}`,
        400
      );
    }
    
    next();
  };
};