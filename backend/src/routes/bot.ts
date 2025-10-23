import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { prisma } from '../index';

type BotConfigPayload = {
  mode: 'ai' | 'greeting';
  aiEnabled: boolean;
  greetingMessage: string;
  cooldownHours: number;
  aiModel: string;
  responseLength: string;
  personality: string;
  audioProcessing: boolean;
  imageProcessing: boolean;
  autoReply: boolean;
};

const DEFAULT_BOT_CONFIG: BotConfigPayload = {
  mode: 'ai',
  aiEnabled: true,
  greetingMessage: 'Olá! Obrigado por entrar em contato. Como posso ajudá-lo?',
  cooldownHours: 5,
  aiModel: 'gpt-4o-mini',
  responseLength: 'medium',
  personality: 'friendly',
  audioProcessing: true,
  imageProcessing: true,
  autoReply: true,
};

const botConfigCache = new Map<string, BotConfigPayload>();

const buildConfig = (overrides?: Partial<BotConfigPayload>): BotConfigPayload => {
  const filtered = overrides
    ? Object.fromEntries(
        Object.entries(overrides).filter(([, value]) => value !== undefined && value !== null)
      )
    : {};

  return {
    ...DEFAULT_BOT_CONFIG,
    ...(filtered as Partial<BotConfigPayload>),
    aiModel: (filtered as Partial<BotConfigPayload>).aiModel ?? DEFAULT_BOT_CONFIG.aiModel,
  };
};

const sanitizeConfig = (body: any): BotConfigPayload => {
  const mode = (body?.mode || body?.Mode || DEFAULT_BOT_CONFIG.mode).toString().toLowerCase();
  const normalizedMode: 'ai' | 'greeting' = mode === 'greeting' ? 'greeting' : 'ai';

  return {
    mode: normalizedMode,
    aiEnabled: normalizedMode === 'ai' ? true : Boolean(body?.aiEnabled ?? false),
    greetingMessage: (body?.greetingMessage || DEFAULT_BOT_CONFIG.greetingMessage).toString(),
    cooldownHours: Number.isFinite(Number(body?.cooldownHours)) ? Number(body.cooldownHours) : DEFAULT_BOT_CONFIG.cooldownHours,
    aiModel: (body?.aiModel || body?.model || DEFAULT_BOT_CONFIG.aiModel).toString(),
    responseLength: (body?.responseLength || DEFAULT_BOT_CONFIG.responseLength).toString(),
    personality: (body?.personality || DEFAULT_BOT_CONFIG.personality).toString(),
    audioProcessing: body?.audioProcessing !== undefined ? Boolean(body.audioProcessing) : DEFAULT_BOT_CONFIG.audioProcessing,
    imageProcessing: body?.imageProcessing !== undefined ? Boolean(body.imageProcessing) : DEFAULT_BOT_CONFIG.imageProcessing,
    autoReply: body?.autoReply !== undefined ? Boolean(body.autoReply) : DEFAULT_BOT_CONFIG.autoReply,
  };
};

const router = Router();

// GET /api/bot/config - obter configuração atual do bot
router.get('/config', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const cached = botConfigCache.get(userId);

    if (cached) {
      return res.json({ success: true, config: cached, data: cached });
    }

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

    const config = buildConfig({
      personality: dbConfig?.personality,
      responseLength: dbConfig?.responseLength,
      audioProcessing: dbConfig?.audioProcessing,
      imageProcessing: dbConfig?.imageProcessing,
      aiModel: dbConfig?.model,
    });

    botConfigCache.set(userId, config);

    return res.json({ success: true, config, data: config });
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
    const sanitized = sanitizeConfig(req.body);

    botConfigCache.set(userId, sanitized);

    const saved = await prisma.botConfig.upsert({
      where: { userId },
      update: {
        personality: sanitized.personality,
        responseLength: sanitized.responseLength,
        audioProcessing: sanitized.audioProcessing,
        imageProcessing: sanitized.imageProcessing,
        model: sanitized.aiModel,
      },
      create: {
        userId,
        personality: sanitized.personality,
        responseLength: sanitized.responseLength,
        audioProcessing: sanitized.audioProcessing,
        imageProcessing: sanitized.imageProcessing,
        model: sanitized.aiModel,
      },
    });

    return res.json({ success: true, message: 'Configuração salva', config: sanitized, data: saved });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar configuração do bot',
      error: error?.message,
    });
  }
});

export default router;