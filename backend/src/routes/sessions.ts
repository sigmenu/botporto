// @ts-nocheck
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../index';
import { AppError, asyncHandler } from '../middlewares/error';
import { authenticateJWT, requireActiveSubscription, checkUsageLimits } from '../middlewares/auth';
import { whatsappService } from '../services/whatsapp';
import { logger } from '../utils/logger';

const router = Router();

// Helper para validação
const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Dados inválidos', 400);
  }
  next();
};

// GET /api/sessions - Listar sessões do usuário
router.get('/',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    
    const sessions = await prisma.whatsAppSession.findMany({
      where: { userId },
      include: {
        template: {
          select: { id: true, name: true, category: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({
      success: true,
      data: sessions,
    });
  })
);

// GET /api/sessions/:id - Obter sessão específica
router.get('/:id',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
      include: {
        template: true,
      },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    res.json({
      success: true,
      data: session,
    });
  })
);

// POST /api/sessions - Criar nova sessão
router.post('/',
  authenticateJWT,
  requireActiveSubscription,
  checkUsageLimits('sessions'),
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Nome deve ter pelo menos 2 caracteres'),
    body('templateId').optional().isString(),
    body('personality').optional().isObject(),
    body('aiSettings').optional().isObject(),
    body('businessHours').optional().isObject(),
    body('language').optional().isIn(['pt-BR', 'en', 'es']),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const {
      name,
      templateId,
      personality,
      aiSettings,
      businessHours,
      language = 'pt-BR',
      autoReply = true,
      humanHandover = false,
    } = req.body;
    
    // Verificar se template existe (se fornecido)
    if (templateId) {
      const template = await prisma.template.findFirst({
        where: {
          id: templateId,
          OR: [
            { userId },
            { isPublic: true },
          ],
        },
      });
      
      if (!template) {
        throw new AppError('Template não encontrado', 404);
      }
    }
    
    // Criar sessão no banco
    const session = await prisma.whatsAppSession.create({
      data: {
        userId,
        name,
        templateId,
        personality,
        aiSettings,
        businessHours,
        language,
        autoReply,
        humanHandover,
        status: 'DISCONNECTED',
      },
      include: {
        template: true,
      },
    });
    
    // Inicializar sessão WhatsApp
    try {
      await whatsappService.createSession(session.id, userId);
      
      logger.info(`Nova sessão criada: ${session.id} para usuário ${userId}`);
    } catch (error) {
      logger.error(`Erro ao inicializar sessão WhatsApp ${session.id}:`, error);
      // Não falhar, apenas log
    }
    
    res.status(201).json({
      success: true,
      message: 'Sessão criada com sucesso',
      data: session,
    });
  })
);

// PUT /api/sessions/:id - Atualizar sessão
router.put('/:id',
  authenticateJWT,
  [
    body('name').optional().trim().isLength({ min: 2 }),
    body('templateId').optional().isString(),
    body('personality').optional().isObject(),
    body('aiSettings').optional().isObject(),
    body('businessHours').optional().isObject(),
    body('language').optional().isIn(['pt-BR', 'en', 'es']),
    body('autoReply').optional().isBoolean(),
    body('humanHandover').optional().isBoolean(),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    // Verificar se sessão existe
    const existingSession = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });
    
    if (!existingSession) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    const updateData = { ...req.body };
    
    // Verificar template se fornecido
    if (updateData.templateId) {
      const template = await prisma.template.findFirst({
        where: {
          id: updateData.templateId,
          OR: [
            { userId },
            { isPublic: true },
          ],
        },
      });
      
      if (!template) {
        throw new AppError('Template não encontrado', 404);
      }
    }
    
    const session = await prisma.whatsAppSession.update({
      where: { id },
      data: updateData,
      include: {
        template: true,
      },
    });
    
    res.json({
      success: true,
      message: 'Sessão atualizada com sucesso',
      data: session,
    });
  })
);

// DELETE /api/sessions/:id - Deletar sessão
router.delete('/:id',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    // Desconectar sessão WhatsApp
    try {
      await whatsappService.disconnectSession(id);
    } catch (error) {
      logger.error(`Erro ao desconectar sessão ${id}:`, error);
    }
    
    // Deletar sessão do banco
    await prisma.whatsAppSession.delete({
      where: { id },
    });
    
    res.json({
      success: true,
      message: 'Sessão deletada com sucesso',
    });
  })
);

// POST /api/sessions/:id/connect - Conectar sessão
router.post('/:id/connect',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    // Verificar se já está conectada
    const whatsappSession = whatsappService.getSession(id);
    if (whatsappSession?.isConnected) {
      throw new AppError('Sessão já está conectada', 400);
    }
    
    // Conectar sessão
    await whatsappService.createSession(id, userId);
    
    res.json({
      success: true,
      message: 'Conectando sessão...',
    });
  })
);

// POST /api/sessions/:id/disconnect - Desconectar sessão
router.post('/:id/disconnect',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    await whatsappService.disconnectSession(id);
    
    res.json({
      success: true,
      message: 'Sessão desconectada com sucesso',
    });
  })
);

// GET /api/sessions/:id/qr - Obter QR Code
router.get('/:id/qr',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    const whatsappSession = whatsappService.getSession(id);
    
    res.json({
      success: true,
      data: {
        qrCode: session.qrCode || whatsappSession?.qrCode,
        isConnected: whatsappSession?.isConnected || false,
        status: session.status,
      },
    });
  })
);

// GET /api/sessions/:id/status - Status da sessão
router.get('/:id/status',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    const whatsappSession = whatsappService.getSession(id);
    
    res.json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        status: session.status,
        phoneNumber: session.phoneNumber,
        isConnected: whatsappSession?.isConnected || false,
        lastConnected: session.lastConnected,
      },
    });
  })
);

export default router;