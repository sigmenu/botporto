import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../services/auth';
import { AppError, asyncHandler } from '../middlewares/error';
import { authenticateJWT } from '../middlewares/auth';
import { authRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Validações
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres'),
  body('name').trim().isLength({ min: 2 }).withMessage('Nome deve ter pelo menos 2 caracteres'),
  body('phone').optional().isMobilePhone('pt-BR').withMessage('Telefone inválido'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha é obrigatória'),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Senha atual é obrigatória'),
  body('newPassword').isLength({ min: 8 }).withMessage('Nova senha deve ter pelo menos 8 caracteres'),
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Token é obrigatório'),
  body('password').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres'),
];

// Helper para validação
const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Dados inválidos', 400);
  }
  next();
};

// POST /api/auth/register
router.post('/register', 
  authRateLimiter,
  registerValidation,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { email, password, name, phone } = req.body;
    
    const result = await authService.register(email, password, name, phone);
    
    res.status(201).json({
      success: true,
      message: 'Usuário registrado com sucesso',
      data: result,
    });
  })
);

// POST /api/auth/login
router.post('/login',
  authRateLimiter,
  loginValidation,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    const result = await authService.login(email, password);
    
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: result,
    });
  })
);

// POST /api/auth/refresh
router.post('/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new AppError('Refresh token é obrigatório', 400);
    }
    
    const tokens = await authService.refreshToken(refreshToken);
    
    res.json({
      success: true,
      message: 'Tokens renovados com sucesso',
      data: { tokens },
    });
  })
);

// POST /api/auth/logout
router.post('/logout',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      await authService.logout(token);
    }
    
    res.json({
      success: true,
      message: 'Logout realizado com sucesso',
    });
  })
);

// POST /api/auth/verify-email
router.post('/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
      throw new AppError('Token é obrigatório', 400);
    }
    
    await authService.verifyEmail(token);
    
    res.json({
      success: true,
      message: 'Email verificado com sucesso',
    });
  })
);

// POST /api/auth/forgot-password
router.post('/forgot-password',
  authRateLimiter,
  body('email').isEmail().normalizeEmail(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    await authService.requestPasswordReset(email);
    
    res.json({
      success: true,
      message: 'Se o email existir, você receberá instruções para redefinir a senha',
    });
  })
);

// POST /api/auth/reset-password
router.post('/reset-password',
  authRateLimiter,
  resetPasswordValidation,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    
    await authService.resetPassword(token, password);
    
    res.json({
      success: true,
      message: 'Senha redefinida com sucesso',
    });
  })
);

// POST /api/auth/change-password
router.post('/change-password',
  authenticateJWT,
  changePasswordValidation,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;
    
    await authService.changePassword(userId, currentPassword, newPassword);
    
    res.json({
      success: true,
      message: 'Senha alterada com sucesso',
    });
  })
);

// GET /api/auth/me
router.get('/me',
  authenticateJWT,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    
    const user = await authService.getProfile(userId);
    
    res.json({
      success: true,
      data: user,
    });
  })
);

// PUT /api/auth/profile
router.put('/profile',
  authenticateJWT,
  [
    body('name').optional().trim().isLength({ min: 2 }),
    body('phone').optional().isMobilePhone('pt-BR'),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { name, phone } = req.body;
    
    const user = await authService.updateProfile(userId, { name, phone });
    
    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso',
      data: user,
    });
  })
);

export default router;