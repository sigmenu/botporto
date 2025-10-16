import { Router, Request, Response, NextFunction } from 'express';
import { body, query, validationResult } from 'express-validator';
import { prisma } from '../index';
import { AppError, asyncHandler } from '../middlewares/error';
import { authenticateJWT } from '../middlewares/auth';

const router = Router();

const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Dados inválidos', 400);
  }
  next();
};

// GET /api/contacts - Listar contatos
router.get('/',
  authenticateJWT,
  [
    query('sessionId').notEmpty().withMessage('Session ID é obrigatório'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { sessionId, page = 1, limit = 50, search } = req.query;
    
    const session = await prisma.whatsAppSession.findFirst({
      where: { id: sessionId as string, userId },
    });
    
    if (!session) {
      throw new AppError('Sessão não encontrada', 404);
    }
    
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const whereClause: any = { sessionId: sessionId as string };
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { phoneNumber: { contains: search as string } },
      ];
    }
    
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where: whereClause,
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.contact.count({ where: whereClause }),
    ]);
    
    res.json({
      success: true,
      data: {
        contacts,
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

// PUT /api/contacts/:id - Atualizar contato
router.put('/:id',
  authenticateJWT,
  [
    body('name').optional().trim().isLength({ min: 1 }),
    body('email').optional().isEmail(),
    body('tags').optional().isArray(),
    body('notes').optional().isString(),
    body('customFields').optional().isObject(),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const contact = await prisma.contact.findFirst({
      where: {
        id,
        session: { userId },
      },
    });
    
    if (!contact) {
      throw new AppError('Contato não encontrado', 404);
    }
    
    const updatedContact = await prisma.contact.update({
      where: { id },
      data: req.body,
    });
    
    res.json({
      success: true,
      message: 'Contato atualizado com sucesso',
      data: updatedContact,
    });
  })
);

export default router;