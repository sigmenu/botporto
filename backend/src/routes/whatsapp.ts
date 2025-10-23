import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { prisma } from '../index';
import { whatsappService } from '../services/whatsapp';
import { logger } from '../utils/logger';

const QR_POLL_INTERVAL_MS = 500;
const QR_MAX_ATTEMPTS = 20;

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

const selectSessionFields = {
  id: true,
  status: true,
  qrCode: true,
  phoneNumber: true,
  lastConnected: true,
};

const ensureSession = async (userId: string) => {
  let session = await prisma.whatsAppSession.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: selectSessionFields,
  });

  if (!session) {
    session = await prisma.whatsAppSession.create({
      data: {
        userId,
        name: 'Minha sessão',
        status: 'DISCONNECTED',
      },
      select: selectSessionFields,
    });
  }

  return session;
};

const waitForQrCode = async (sessionId: string) => {
  for (let attempt = 0; attempt < QR_MAX_ATTEMPTS; attempt++) {
    const latest = await prisma.whatsAppSession.findUnique({
      where: { id: sessionId },
      select: selectSessionFields,
    });

    if (latest?.qrCode || latest?.status === 'CONNECTED') {
      return latest;
    }

    await wait(QR_POLL_INTERVAL_MS);
  }

  return prisma.whatsAppSession.findUnique({
    where: { id: sessionId },
    select: selectSessionFields,
  });
};

const router = Router();

// GET /api/whatsapp/status - retorna status geral baseado em sessões do usuário
router.get('/status', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    const session = await prisma.whatsAppSession.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: selectSessionFields,
    });

    const status = session?.status || 'DISCONNECTED';
    const connected = status === 'CONNECTED';
    const lastConnected = session?.lastConnected ? session.lastConnected.toISOString() : null;

    return res.json({
      success: true,
      connected,
      status,
      phoneNumber: session?.phoneNumber || null,
      lastConnected,
      message: connected ? 'WhatsApp is connected' : `WhatsApp is ${status}`,
      data: {
        userId,
        sessionId: session?.id || null,
        phone: session?.phoneNumber || null,
        lastConnected,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao consultar status do WhatsApp' });
  }
});

// GET /api/whatsapp/qr - inicia/retorna QR para a sessão mais recente do usuário
router.get('/qr', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    let session = await ensureSession(userId);

    // Garantir que a sessão está inicializada (gera QR async)
    const activeSession = whatsappService.getSession(session.id);
    if (!activeSession) {
      try {
        await whatsappService.resetSession(session.id);
      } catch (error) {
        logger.warn('Erro ao resetar sessão antes de criar nova conexão WhatsApp:', error);
      }

      try {
        await whatsappService.createSession(session.id, userId);
      } catch (error) {
        // Registro do erro apenas para debugging sem quebrar o fluxo
        logger.error('Erro ao criar sessão WhatsApp:', error);
      }
    }

    session = (await waitForQrCode(session.id)) || session;

    if (session.status === 'CONNECTED') {
      const lastConnected = session.lastConnected ? session.lastConnected.toISOString() : null;
      return res.json({
        success: true,
        connected: true,
        status: 'CONNECTED',
        message: 'WhatsApp já conectado',
        phoneNumber: session.phoneNumber || null,
        lastConnected,
        data: {
          userId,
          sessionId: session.id,
          phone: session.phoneNumber || null,
          lastConnected,
        },
      });
    }

    return res.json({
      success: true,
      connected: false,
      status: session.status || 'CONNECTING',
      message: session.qrCode ? 'QR code disponível' : 'Conectando... aguarde o QR',
      qrCode: session.qrCode || null,
      qr: session.qrCode || null,
      data: {
        userId,
        sessionId: session.id,
        generated_at: new Date().toISOString(),
        expires_in: 20,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao gerar/obter QR', error: error?.message });
  }
});

// POST /api/whatsapp/qr/refresh - força a geração de um novo QR
router.post('/qr/refresh', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    let session = await ensureSession(userId);

    if (session.status === 'CONNECTED') {
      const lastConnected = session.lastConnected ? session.lastConnected.toISOString() : null;
      return res.json({
        success: true,
        connected: true,
        status: 'CONNECTED',
        message: 'WhatsApp já está conectado, não é necessário atualizar o QR.',
        data: {
          userId,
          sessionId: session.id,
          phone: session.phoneNumber || null,
          lastConnected,
        },
      });
    }

    try {
      await whatsappService.resetSession(session.id);
    } catch (error) {
      logger.warn('Não foi possível resetar sessão antes do refresh:', error);
    }

    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: { status: 'CONNECTING', qrCode: null },
    });

    try {
      await whatsappService.createSession(session.id, userId);
    } catch (error) {
      logger.error('Erro ao recriar sessão WhatsApp durante refresh:', error);
    }

    session = (await waitForQrCode(session.id)) || session;

    if (session.qrCode) {
      return res.json({
        success: true,
        connected: false,
        status: session.status || 'CONNECTING',
        message: 'QR code atualizado com sucesso',
        qrCode: session.qrCode,
        qr: session.qrCode,
        data: {
          userId,
          sessionId: session.id,
          generated_at: new Date().toISOString(),
          expires_in: 20,
        },
      });
    }

    return res.status(504).json({
      success: false,
      message: 'Tempo esgotado ao tentar atualizar o QR code. Tente novamente.',
      status: session.status || 'TIMEOUT',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao atualizar QR code', error: error?.message });
  }
});

// POST /api/whatsapp/disconnect - encerra a sessão atual
router.post('/disconnect', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    const session = await prisma.whatsAppSession.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: selectSessionFields,
    });

    if (!session) {
      return res.json({
        success: true,
        message: 'Nenhuma sessão ativa encontrada.',
        data: { userId, sessionId: null },
      });
    }

    try {
      await whatsappService.disconnectSession(session.id);
    } catch (error) {
      logger.warn('Erro ao desconectar sessão do WhatsApp:', error);
    }

    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: { status: 'DISCONNECTED', qrCode: null, lastConnected: new Date() },
    });

    return res.json({
      success: true,
      message: 'WhatsApp desconectado com sucesso.',
      data: {
        userId,
        sessionId: session.id,
        status: 'DISCONNECTED',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao desconectar WhatsApp', error: error?.message });
  }
});

// POST /api/whatsapp/request-pairing-code - gera código de pareamento para login por número
router.post('/request-pairing-code', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Informe o número do telefone (E.164 ou somente dígitos).' });
    }

    // Obter ou criar sessão padrão do usuário
    let session = await prisma.whatsAppSession.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      session = await prisma.whatsAppSession.create({
        data: { userId, name: 'Minha sessão', status: 'DISCONNECTED' },
      });
    }

    // Se já conectado, não há pairing code
    if (session.status === 'CONNECTED') {
      return res.status(200).json({
        success: true,
        connected: true,
        status: 'CONNECTED',
        message: 'WhatsApp já conectado. Não é necessário pairing code.',
        data: { sessionId: session.id, phone: session.phoneNumber, lastConnected: session.lastConnected },
      });
    }

    // Solicitar pairing code via serviço
    const pairingCode = await whatsappService.requestPairingCode(session.id, userId, phone);

    return res.status(200).json({
      success: true,
      connected: false,
      status: 'CONNECTING',
      message: 'Pairing code gerado com sucesso.',
      pairingCode,
      data: { sessionId: session.id, generated_at: new Date().toISOString(), expires_in: 120 },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao solicitar pairing code', error: error?.message });
  }
});

export default router;