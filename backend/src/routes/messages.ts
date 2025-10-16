import { Router, Request, Response, NextFunction } from 'express';
import { body, query, validationResult } from 'express-validator';
import { prisma } from '../index';
import { AppError, asyncHandler } from '../middlewares/error';
import { authenticateJWT } from '../middlewares/auth';
import { whatsappService } from '../services/whatsapp';
import { messageRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Helper para validação
const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Dados inválidos', 400);
  }
  next();
};

// GET /api/messages - Listar mensagens
router.get('/',
  authenticateJWT,
  [
    query('sessionId').notEmpty().withMessage('Session ID é obrigatório'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('contactId').optional().isString(),
    query('search').optional().isString(),
    query('type').optional().isIn(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'STICKER']),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const {
      sessionId,
      page = 1,
      limit = 50,
      contactId,
      search,
      type,
    } = req.query;
    
    // Verificar se sessão pertence ao usuário
    const session = await prisma.whatsAppSession.findFirst({
      where: { id: sessionId as string, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const whereClause: any = {
      sessionId: sessionId as string,
    };
    
    if (contactId) {
      whereClause.contactId = contactId as string;
    }
    
    if (type) {
      whereClause.type = type as string;
    }
    
    if (search) {
      whereClause.OR = [
        { content: { contains: search as string, mode: 'insensitive' } },
        { transcription: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: whereClause,
        include: {
          contact: {
            select: { id: true, name: true, phoneNumber: true },
          },
        },
        orderBy: { timestamp: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.message.count({ where: whereClause }),
    ]);
    
    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  })
);

// GET /api/messages/:id - Obter mensagem específica
router.get('/:id',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const message = await prisma.message.findFirst({
      where: {
        id,
        session: { userId },
      },
      include: {
        contact: true,
        session: {
          select: { id: true, name: true },
        },
      },
    });
    
    if (!message) {
      throw new AppError('Mensagem não encontrada', 404);
    }
    
    res.json({
      success: true,
      data: message,
    });
  })
);

// POST /api/messages/send - Enviar mensagem
router.post('/send',
  authenticateJWT,
  messageRateLimiter,
  [
    body('sessionId').notEmpty().withMessage('Session ID é obrigatório'),
    body('phoneNumber').isMobilePhone('any').withMessage('Número de telefone inválido'),
    body('content').notEmpty().withMessage('Conteúdo é obrigatório'),
    body('mediaUrl').optional().isURL().withMessage('URL de mídia inválida'),
    body('caption').optional().isString(),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { sessionId, phoneNumber, content, mediaUrl, caption } = req.body;
    
    // Verificar se sessão pertence ao usuário
    const session = await prisma.whatsAppSession.findFirst({
      where: { id: sessionId, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    // Verificar se sessão está conectada
    const whatsappSession = whatsappService.getSession(sessionId);
    if (!whatsappSession?.isConnected) {
      throw new AppError('Sessão não está conectada', 400);
    }
    
    // Enviar mensagem
    await whatsappService.sendMessage(sessionId, phoneNumber, content, {
      mediaUrl,
      caption,
    });
    
    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
    });
  })
);

// POST /api/messages/broadcast - Enviar broadcast
router.post('/broadcast',
  authenticateJWT,
  [
    body('sessionId').notEmpty().withMessage('Session ID é obrigatório'),
    body('name').trim().isLength({ min: 2 }).withMessage('Nome do broadcast é obrigatório'),
    body('content').notEmpty().withMessage('Conteúdo é obrigatório'),
    body('contacts').isArray({ min: 1 }).withMessage('Lista de contatos é obrigatória'),
    body('mediaUrl').optional().isURL().withMessage('URL de mídia inválida'),
    body('scheduledFor').optional().isISO8601().withMessage('Data de agendamento inválida'),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { sessionId, name, content, contacts, mediaUrl, scheduledFor } = req.body;
    
    // Verificar se sessão pertence ao usuário
    const session = await prisma.whatsAppSession.findFirst({
      where: { id: sessionId, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    // Verificar se contatos existem
    const existingContacts = await prisma.contact.findMany({
      where: {
        id: { in: contacts },
        sessionId,
      },
    });
    
    if (existingContacts.length !== contacts.length) {
      throw new AppError('Alguns contatos não foram encontrados', 400);
    }
    
    // Criar broadcast
    const broadcast = await prisma.broadcast.create({
      data: {
        sessionId,
        name,
        content,
        mediaUrl,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        totalRecipients: contacts.length,
        recipients: {
          create: contacts.map((contactId: string) => ({
            contactId,
          })),
        },
      },
    });
    
    // Se não é agendado, adicionar à fila imediatamente
    if (!scheduledFor) {
      const { addBroadcastToQueue } = await import('../lib/queue');
      await addBroadcastToQueue({
        broadcastId: broadcast.id,
        sessionId,
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Broadcast criado com sucesso',
      data: broadcast,
    });
  })
);

// GET /api/messages/broadcasts - Listar broadcasts
router.get('/broadcasts',
  authenticateJWT,
  [
    query('sessionId').notEmpty().withMessage('Session ID é obrigatório'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { sessionId, page = 1, limit = 20 } = req.query;
    
    // Verificar se sessão pertence ao usuário
    const session = await prisma.whatsAppSession.findFirst({
      where: { id: sessionId as string, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const [broadcasts, total] = await Promise.all([
      prisma.broadcast.findMany({
        where: { sessionId: sessionId as string },
        include: {
          recipients: {
            include: {
              contact: {
                select: { name: true, phoneNumber: true },
              },
            },
            take: 5, // Apenas 5 recipients para preview
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.broadcast.count({ where: { sessionId: sessionId as string } }),
    ]);
    
    res.json({
      success: true,
      data: {
        broadcasts,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  })
);

// GET /api/messages/broadcasts/:id - Obter broadcast específico
router.get('/broadcasts/:id',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id,
        session: { userId },
      },
      include: {
        recipients: {
          include: {
            contact: true,
          },
        },
        session: {
          select: { id: true, name: true },
        },
      },
    });
    
    if (!broadcast) {
      throw new AppError('Broadcast não encontrado', 404);
    }
    
    res.json({
      success: true,
      data: broadcast,
    });
  })
);

// DELETE /api/messages/broadcasts/:id - Cancelar/deletar broadcast
router.delete('/broadcasts/:id',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id,
        session: { userId },
      },
    });
    
    if (!broadcast) {
      throw new AppError('Broadcast não encontrado', 404);
    }
    
    if (broadcast.status === 'SENDING') {
      throw new AppError('Não é possível deletar broadcast em andamento', 400);
    }
    
    await prisma.broadcast.delete({
      where: { id },
    });
    
    res.json({
      success: true,
      message: 'Broadcast deletado com sucesso',
    });
  })
);

// POST /api/messages/schedule - Agendar mensagem
router.post('/schedule',
  authenticateJWT,
  [
    body('sessionId').notEmpty().withMessage('Session ID é obrigatório'),
    body('phoneNumber').isMobilePhone('any').withMessage('Número de telefone inválido'),
    body('content').notEmpty().withMessage('Conteúdo é obrigatório'),
    body('scheduledFor').isISO8601().withMessage('Data de agendamento é obrigatória'),
    body('mediaUrl').optional().isURL().withMessage('URL de mídia inválida'),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { sessionId, phoneNumber, content, scheduledFor, mediaUrl } = req.body;
    
    // Verificar se sessão pertence ao usuário
    const session = await prisma.whatsAppSession.findFirst({
      where: { id: sessionId, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate <= new Date()) {
      throw new AppError('Data de agendamento deve ser no futuro', 400);
    }
    
    const scheduledMessage = await prisma.scheduledMessage.create({
      data: {
        sessionId,
        recipientPhone: phoneNumber,
        content,
        mediaUrl,
        scheduledFor: scheduledDate,
        type: mediaUrl ? 'IMAGE' : 'TEXT',
      },
    });
    
    res.status(201).json({
      success: true,
      message: 'Mensagem agendada com sucesso',
      data: scheduledMessage,
    });
  })
);

// GET /api/messages/scheduled - Listar mensagens agendadas
router.get('/scheduled',
  authenticateJWT,
  [
    query('sessionId').notEmpty().withMessage('Session ID é obrigatório'),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { sessionId } = req.query;
    
    // Verificar se sessão pertence ao usuário
    const session = await prisma.whatsAppSession.findFirst({
      where: { id: sessionId as string, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    const scheduledMessages = await prisma.scheduledMessage.findMany({
      where: {
        sessionId: sessionId as string,
        executed: false,
      },
      orderBy: { scheduledFor: 'asc' },
    });
    
    res.json({
      success: true,
      data: scheduledMessages,
    });
  })
);

export default router;