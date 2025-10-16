import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/error';

const router = Router();

router.get('/', authenticateJWT, asyncHandler(async (req, res) => {
  res.json({ success: true, data: [] });
}));

export default router;