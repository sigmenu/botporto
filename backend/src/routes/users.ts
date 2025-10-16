import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/error';

const router = Router();

router.get('/me', authenticateJWT, asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
}));

export default router;