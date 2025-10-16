import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/error';

const router = Router();

router.get('/', authenticateJWT, asyncHandler(async (req, res) => {
  res.json({ success: true, data: { messages: 0, contacts: 0, sessions: 0 } });
}));

export default router;