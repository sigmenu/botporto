import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { prisma } from '../index';

const router = Router();

// GET /api/bot/config - obter configuração atual do bot
router.get('/config', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    const dbConfig = await prisma.botConfig.findUnique({
      where: { userId },
      select: {
        personality: true,
        responseLength: true,
        audioProcessing: true,
        imageProcessing: true,
        model: true,
      },
    });

    if (dbConfig) {
      return res.json({ success: true, data: dbConfig });
    }

    return res.json({
      success: true,
      data: {
        personality: 'friendly',
        responseLength: 'medium',
        audioProcessing: false,
        imageProcessing: false,
        model: 'gpt-4o-mini',
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter configuração do bot',
      error: error?.message,
    });
  }
});

// POST /api/bot/config - atualizar configuração do bot
router.post('/config', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const {
      personality,
      responseLength,
      audioProcessing,
      imageProcessing,
      model,
    } = req.body || {};

    const dataToSave: any = {};
    if (personality !== undefined) dataToSave.personality = String(personality);
    if (responseLength !== undefined) dataToSave.responseLength = String(responseLength);
    if (audioProcessing !== undefined) dataToSave.audioProcessing = !!audioProcessing;
    if (imageProcessing !== undefined) dataToSave.imageProcessing = !!imageProcessing;
    if (model !== undefined) dataToSave.model = String(model || 'gpt-4o-mini');

    const saved = await prisma.botConfig.upsert({
      where: { userId },
      update: { ...dataToSave },
      create: {
        userId,
        personality: dataToSave.personality ?? 'friendly',
        responseLength: dataToSave.responseLength ?? 'medium',
        audioProcessing: dataToSave.audioProcessing ?? false,
        imageProcessing: dataToSave.imageProcessing ?? false,
        model: dataToSave.model ?? 'gpt-4o-mini',
      },
    });

    return res.json({ success: true, message: 'Configuração salva', data: saved });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar configuração do bot',
      error: error?.message,
    });
  }
});

export default router;