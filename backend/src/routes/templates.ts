// @ts-nocheck
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
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

// GET /api/templates - Listar templates
router.get('/',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    
    const templates = await prisma.template.findMany({
      where: {
        OR: [
          { userId },
          { isPublic: true },
        ],
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({
      success: true,
      data: templates,
    });
  })
);

// POST /api/templates - Criar template
router.post('/',
  authenticateJWT,
  [
    body('name').trim().isLength({ min: 2 }),
    body('description').optional().isString(),
    body('category').isIn(['RESTAURANT', 'ECOMMERCE', 'HEALTHCARE', 'REALESTATE', 'EDUCATION', 'CUSTOM']),
    body('prompts').isObject(),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    
    const template = await prisma.template.create({
      data: {
        ...req.body,
        userId,
      },
    });
    
    res.status(201).json({
      success: true,
      message: 'Template criado com sucesso',
      data: template,
    });
  })
);

export default router;