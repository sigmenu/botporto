// @ts-nocheck
import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/error';
import { cacheService } from '../lib/redis';

interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
  private readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
  private readonly REFRESH_TOKEN_EXPIRES_IN = '30d';
  
  // Registrar usuário
  async register(email: string, password: string, name: string, phone?: string): Promise<{ user: any; tokens: AuthTokens }> {
    try {
      // Verificar se usuário já existe
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new AppError('Email já está em uso', 400);
      }

      // Hash da senha
      const hashedPassword = await this.hashPassword(password);
      
      // Gerar token de verificação
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Criar usuário
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          phone,
          verificationToken,
          subscription: {
            create: {
              plan: 'FREE',
              status: 'ACTIVE',
              messagesLimit: 100,
              contactsLimit: 50,
              sessionsLimit: 1,
            },
          },
        },
        include: {
          subscription: true,
        },
      });

      // Gerar tokens
      const tokens = await this.generateTokens(user.id, user.email, user.role);

      // Log da atividade
      await this.logActivity(user.id, 'USER_REGISTERED', 'User', user.id);

      logger.info(`Usuário registrado: ${email}`);

      return {
        user: this.sanitizeUser(user),
        tokens,
      };
    } catch (error) {
      logger.error('Erro ao registrar usuário:', error);
      throw error;
    }
  }

  // Login do usuário
  async login(email: string, password: string): Promise<{ user: any; tokens: AuthTokens }> {
    try {
      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          subscription: true,
        },
      });

      if (!user) {
        throw new AppError('Credenciais inválidas', 401);
      }

      // Verificar senha
      const isValidPassword = await this.verifyPassword(password, user.password);
      if (!isValidPassword) {
        throw new AppError('Credenciais inválidas', 401);
      }

      // Verificar se usuário está ativo
      if (!user.isActive) {
        throw new AppError('Conta desativada', 401);
      }

      // Gerar tokens
      const tokens = await this.generateTokens(user.id, user.email, user.role);

      // Log da atividade
      await this.logActivity(user.id, 'USER_LOGIN', 'User', user.id);

      logger.info(`Usuário logado: ${email}`);

      return {
        user: this.sanitizeUser(user),
        tokens,
      };
    } catch (error) {
      logger.error('Erro no login:', error);
      throw error;
    }
  }

  // Refresh token
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verificar token
      const decoded = jwt.verify(refreshToken, this.JWT_SECRET) as TokenPayload;
      
      // Verificar se token não está na blacklist
      const isBlacklisted = await cacheService.exists(`blacklist:${refreshToken}`);
      if (isBlacklisted) {
        throw new AppError('Token inválido', 401);
      }

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user || !user.isActive) {
        throw new AppError('Usuário não encontrado', 401);
      }

      // Gerar novos tokens
      const tokens = await this.generateTokens(user.id, user.email, user.role);

      // Blacklist do token antigo
      await cacheService.set(`blacklist:${refreshToken}`, true, 30 * 24 * 60 * 60); // 30 dias

      return tokens;
    } catch (error) {
      logger.error('Erro ao renovar token:', error);
      throw new AppError('Token inválido', 401);
    }
  }

  // Logout
  async logout(token: string): Promise<void> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
      
      // Adicionar token à blacklist
      await cacheService.set(`blacklist:${token}`, true, 7 * 24 * 60 * 60); // 7 dias

      // Log da atividade
      await this.logActivity(decoded.id, 'USER_LOGOUT', 'User', decoded.id);

      logger.info(`Usuário deslogado: ${decoded.email}`);
    } catch (error) {
      logger.error('Erro no logout:', error);
      throw error;
    }
  }

  // Verificar email
  async verifyEmail(token: string): Promise<void> {
    try {
      const user = await prisma.user.findFirst({
        where: { verificationToken: token },
      });

      if (!user) {
        throw new AppError('Token de verificação inválido', 400);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          verificationToken: null,
        },
      });

      // Log da atividade
      await this.logActivity(user.id, 'EMAIL_VERIFIED', 'User', user.id);

      logger.info(`Email verificado: ${user.email}`);
    } catch (error) {
      logger.error('Erro ao verificar email:', error);
      throw error;
    }
  }

  // Solicitar reset de senha
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Não revelar se email existe
        return;
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hora

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry,
        },
      });

      // Aqui você enviaria o email com o token
      // await emailService.sendPasswordResetEmail(email, resetToken);

      // Log da atividade
      await this.logActivity(user.id, 'PASSWORD_RESET_REQUESTED', 'User', user.id);

      logger.info(`Reset de senha solicitado: ${email}`);
    } catch (error) {
      logger.error('Erro ao solicitar reset de senha:', error);
      throw error;
    }
  }

  // Reset de senha
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: {
            gt: new Date(),
          },
        },
      });

      if (!user) {
        throw new AppError('Token de reset inválido ou expirado', 400);
      }

      const hashedPassword = await this.hashPassword(newPassword);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });

      // Log da atividade
      await this.logActivity(user.id, 'PASSWORD_RESET', 'User', user.id);

      logger.info(`Senha redefinida: ${user.email}`);
    } catch (error) {
      logger.error('Erro ao redefinir senha:', error);
      throw error;
    }
  }

  // Alterar senha
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AppError('Usuário não encontrado', 404);
      }

      // Verificar senha atual
      const isValidPassword = await this.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        throw new AppError('Senha atual incorreta', 400);
      }

      // Hash da nova senha
      const hashedPassword = await this.hashPassword(newPassword);

      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      // Log da atividade
      await this.logActivity(userId, 'PASSWORD_CHANGED', 'User', userId);

      logger.info(`Senha alterada para usuário: ${user.email}`);
    } catch (error) {
      logger.error('Erro ao alterar senha:', error);
      throw error;
    }
  }

  // Verificar token
  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      // Verificar se token não está na blacklist
      const isBlacklisted = await cacheService.exists(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new AppError('Token inválido', 401);
      }

      const decoded = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
      
      // Verificar se usuário ainda existe e está ativo
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user || !user.isActive) {
        throw new AppError('Usuário não encontrado', 401);
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Token inválido', 401);
      }
      throw error;
    }
  }

  // Obter perfil do usuário
  async getProfile(userId: string): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscription: true,
          whatsappSessions: {
            select: {
              id: true,
              name: true,
              status: true,
              phoneNumber: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user) {
        throw new AppError('Usuário não encontrado', 404);
      }

      return this.sanitizeUser(user);
    } catch (error) {
      logger.error('Erro ao obter perfil:', error);
      throw error;
    }
  }

  // Atualizar perfil
  async updateProfile(userId: string, data: { name?: string; phone?: string }): Promise<any> {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data,
        include: {
          subscription: true,
        },
      });

      // Log da atividade
      await this.logActivity(userId, 'PROFILE_UPDATED', 'User', userId);

      return this.sanitizeUser(user);
    } catch (error) {
      logger.error('Erro ao atualizar perfil:', error);
      throw error;
    }
  }

  // Gerar chave API
  async generateApiKey(userId: string, name: string, permissions: string[] = []): Promise<string> {
    try {
      const key = `wba_${crypto.randomBytes(32).toString('hex')}`;

      await prisma.apiKey.create({
        data: {
          userId,
          name,
          key,
          permissions,
        },
      });

      // Log da atividade
      await this.logActivity(userId, 'API_KEY_GENERATED', 'ApiKey', key);

      return key;
    } catch (error) {
      logger.error('Erro ao gerar chave API:', error);
      throw error;
    }
  }

  // Verificar chave API
  async verifyApiKey(apiKey: string): Promise<{ user: any; permissions: string[] }> {
    try {
      const key = await prisma.apiKey.findUnique({
        where: { key: apiKey },
        include: { user: true },
      });

      if (!key || !key.isActive || !key.user.isActive) {
        throw new AppError('Chave API inválida', 401);
      }

      if (key.expiresAt && key.expiresAt < new Date()) {
        throw new AppError('Chave API expirada', 401);
      }

      // Atualizar último uso
      await prisma.apiKey.update({
        where: { id: key.id },
        data: { lastUsed: new Date() },
      });

      return {
        user: this.sanitizeUser(key.user),
        permissions: key.permissions,
      };
    } catch (error) {
      logger.error('Erro ao verificar chave API:', error);
      throw error;
    }
  }

  // Métodos privados
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async generateTokens(userId: string, email: string, role: string): Promise<AuthTokens> {
    const payload: TokenPayload = { id: userId, email, role };

    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
    } as any);

    const refreshToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRES_IN,
    } as any);

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any): any {
    const { password, resetToken, verificationToken, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  private async logActivity(
    userId: string,
    action: string,
    entity: string,
    entityId: string,
    details?: any
  ): Promise<void> {
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          action,
          entity,
          entityId,
          details,
        },
      });
    } catch (error) {
      logger.error('Erro ao registrar atividade:', error);
    }
  }
}

export const authService = new AuthService();