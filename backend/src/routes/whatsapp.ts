import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth';
import { prisma } from '../index';
import { whatsappService } from '../services/whatsapp';

const router = Router();

// GET /api/whatsapp/status - retorna status geral baseado em sessões do usuário
router.get('/status', authenticateJWT, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    const session = await prisma.whatsAppSession.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true, phoneNumber: true, lastConnected: true },
    });

    const connected = session?.status === 'CONNECTED';

    return res.json({
      success: true,
      connected,
      status: session?.status || 'DISCONNECTED',
      data: {
        userId,
        sessionId: session?.id,
        phone: session?.phoneNumber,
        lastConnected: session?.lastConnected,
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

    // Buscar ou criar sessão padrão do usuário
    let session = await prisma.whatsAppSession.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      session = await prisma.whatsAppSession.create({
        data: {
          userId,
          name: 'Minha sessão',
          status: 'DISCONNECTED',
        },
      });
    }

    // Garantir que a sessão está inicializada no serviço (gera QR async)
    const current = whatsappService.getSession(session.id);
    if (!current) {
      try {
        await whatsappService.createSession(session.id, userId);
      } catch (_) {
        // segue, o QR pode ainda não estar pronto
      }
    }

    // Recarregar sessão do banco para pegar QR/status atualizados
    const latest = await prisma.whatsAppSession.findUnique({
      where: { id: session.id },
      select: { id: true, status: true, qrCode: true, phoneNumber: true, lastConnected: true },
    });

    // Montar resposta compatível
    if (latest?.status === 'CONNECTED') {
      return res.json({
        success: true,
        connected: true,
        status: 'CONNECTED',
        message: 'WhatsApp já conectado',
        data: {
          userId,
          sessionId: latest.id,
          phone: latest.phoneNumber,
          lastConnected: latest.lastConnected,
        },
      });
    }

    return res.json({
      success: true,
      message: latest?.qrCode ? 'QR code disponível' : 'Conectando... aguarde o QR',
      qr: latest?.qrCode || null,
      status: latest?.status || 'CONNECTING',
      data: {
        userId,
        sessionId: latest?.id || session.id,
        generated_at: new Date().toISOString(),
        expires_in: 20,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Erro ao gerar/obter QR', error: error?.message });
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