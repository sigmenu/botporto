// @ts-nocheck
// Import estático removido para evitar ERR_REQUIRE_ESM do Baileys em CJS
// import makeWASocket, { DisconnectReason, useMultiFileAuthState, WASocket, BaileysEventMap, MessageUpsertType, proto, downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { io } from '../index';
import { cacheService } from '../lib/redis';
import { addMessageToQueue } from '../lib/queue';

// Loader dinâmico do Baileys (ESM)
let Baileys: any | null = null;
async function loadBaileys() {
  if (!Baileys) {
    Baileys = await import('@whiskeysockets/baileys');
  }
  return Baileys;
}

interface WhatsAppSession {
  id: string;
  socket: any | null; // WASocket
  qrCode: string | null;
  isConnected: boolean;
  userId: string;
}

class WhatsAppService {
  private sessions: Map<string, WhatsAppSession> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;

  // Inicializar serviço e restaurar sessões ativas
  async initialize() {
    try {
      const activeSessions = await prisma.whatsAppSession.findMany({
        where: {
          status: 'CONNECTED',
        },
      });

      for (const session of activeSessions) {
        await this.createSession(session.id, session.userId);
      }

      logger.info(`WhatsApp service initialized with ${activeSessions.length} sessions`);
    } catch (error) {
      logger.error('Erro ao inicializar WhatsApp service:', error);
      throw error;
    }
  }

  // Criar nova sessão WhatsApp
  async createSession(sessionId: string, userId: string): Promise<void> {
    try {
      const B = await loadBaileys();

      if (this.sessions.has(sessionId)) {
        logger.warn(`Sessão ${sessionId} já existe`);
        return;
      }

      const sessionPath = path.join(process.cwd(), 'sessions', sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const { state, saveCreds } = await B.useMultiFileAuthState(sessionPath);

      const socket = B.default({
        auth: state,
        printQRInTerminal: false,
        browser: ['WhatsApp Bot SaaS', 'Chrome', '1.0.0'],
        defaultQueryTimeoutMs: 60 * 1000,
      });

      const sessionData: WhatsAppSession = {
        id: sessionId,
        socket,
        qrCode: null,
        isConnected: false,
        userId,
      };

      this.sessions.set(sessionId, sessionData);
      this.reconnectAttempts.set(sessionId, 0);

      // Event handlers
      socket.ev.on('connection.update', (update: any) => {
        this.handleConnectionUpdate(sessionId, update);
      });

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('messages.upsert', (messageUpdate: any) => {
        this.handleMessagesUpsert(sessionId, messageUpdate);
      });

      socket.ev.on('messages.update', (messageUpdate: any) => {
        this.handleMessagesUpdate(sessionId, messageUpdate);
      });

      socket.ev.on('presence.update', (presenceUpdate: any) => {
        this.handlePresenceUpdate(sessionId, presenceUpdate);
      });

      socket.ev.on('contacts.update', (contactsUpdate: any) => {
        this.handleContactsUpdate(sessionId, contactsUpdate);
      });

      logger.info(`Sessão WhatsApp ${sessionId} criada para usuário ${userId}`);
    } catch (error) {
      logger.error(`Erro ao criar sessão ${sessionId}:`, error);
      throw error;
    }
  }

  // Manipular atualizações de conexão
  private async handleConnectionUpdate(sessionId: string, update: any) {
    const B = await loadBaileys();
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrCodeData = await QRCode.toDataURL(qr);
        session.qrCode = qrCodeData;
        
        await prisma.whatsAppSession.update({
          where: { id: sessionId },
          data: { 
            qrCode: qrCodeData,
            status: 'CONNECTING',
          },
        });

        // Emitir QR code via WebSocket
        io.to(`session-${sessionId}`).emit('qr-code', { qrCode: qrCodeData });
        
        logger.info(`QR Code gerado para sessão ${sessionId}`);
      } catch (error) {
        logger.error(`Erro ao gerar QR Code para sessão ${sessionId}:`, error);
      }
    }

    if (connection === 'close') {
      session.isConnected = false;
      
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== B.DisconnectReason.loggedOut;
      const reconnectAttempts = this.reconnectAttempts.get(sessionId) || 0;

      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { 
          status: 'DISCONNECTED',
          lastConnected: new Date(),
        },
      });

      if (shouldReconnect && reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts.set(sessionId, reconnectAttempts + 1);
        
        logger.info(`Tentando reconectar sessão ${sessionId} (tentativa ${reconnectAttempts + 1})`);
        
        setTimeout(() => {
          this.createSession(sessionId, session.userId);
        }, 5000);
      } else {
        logger.warn(`Sessão ${sessionId} desconectada permanentemente`);
        this.sessions.delete(sessionId);
        this.reconnectAttempts.delete(sessionId);
        
        // Notificar via WebSocket
        io.to(`session-${sessionId}`).emit('session-disconnected', { sessionId });
      }
    }

    if (connection === 'open') {
      session.isConnected = true;
      session.qrCode = null;
      this.reconnectAttempts.set(sessionId, 0);

      const phoneNumber = session.socket?.user?.id?.split(':')[0];

      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { 
          status: 'CONNECTED',
          phoneNumber: phoneNumber || null,
          qrCode: null,
          lastConnected: new Date(),
        },
      });

      // Notificar via WebSocket
      io.to(`session-${sessionId}`).emit('session-connected', { sessionId, phoneNumber });
      
      logger.info(`Sessão ${sessionId} conectada com sucesso`);
    }
  }

  // Manipular mensagens recebidas
  private async handleMessagesUpsert(sessionId: string, messageUpdate: { messages: any[], type: string }) {
    const { messages, type } = messageUpdate;

    if (type !== 'notify') return;

    for (const message of messages) {
      try {
        await this.processIncomingMessage(sessionId, message);
      } catch (error) {
        logger.error(`Erro ao processar mensagem para sessão ${sessionId}:`, error);
      }
    }
  }

  // Processar mensagem recebida
  private async processIncomingMessage(sessionId: string, message: any) {
    const B = await loadBaileys();
    if (!message.key.fromMe && message.message) {
      const phoneNumber = B.jidNormalizedUser(message.key.remoteJid || '').split('@')[0];
      const messageContent = this.extractMessageContent(message);
      
      // Salvar mensagem no banco
      const savedMessage = await prisma.message.create({
        data: {
          messageId: message.key.id || '',
          sessionId,
          contactId: await this.getOrCreateContact(sessionId, phoneNumber, message),
          type: this.getMessageType(message),
          content: messageContent.text,
          mediaUrl: messageContent.mediaUrl,
          mediaCaption: messageContent.caption,
          isFromMe: false,
          status: 'DELIVERED',
          timestamp: new Date(message.messageTimestamp as number * 1000),
          metadata: {
            quotedMessage: message.message?.extendedTextMessage?.contextInfo?.quotedMessage,
            mentions: message.message?.extendedTextMessage?.contextInfo?.mentionedJid,
          },
        },
      });

      // Adicionar à fila para processamento de IA
      await addMessageToQueue({
        messageId: savedMessage.id,
        sessionId,
        content: messageContent.text,
        type: this.getMessageType(message),
        phoneNumber,
        mediaUrl: messageContent.mediaUrl,
      });

      // Emitir via WebSocket
      io.to(`session-${sessionId}`).emit('new-message', savedMessage);

      logger.info(`Mensagem processada para sessão ${sessionId} de ${phoneNumber}`);
    }
  }

  // Extrair conteúdo da mensagem
  private extractMessageContent(message: any): { text?: string; mediaUrl?: string; caption?: string } {
    const msg = message.message;
    if (!msg) return {};

    if (msg.conversation) {
      return { text: msg.conversation };
    }

    if (msg.extendedTextMessage) {
      return { text: msg.extendedTextMessage.text };
    }

    if (msg.imageMessage) {
      return { 
        text: msg.imageMessage.caption,
        caption: msg.imageMessage.caption,
      };
    }

    if (msg.videoMessage) {
      return { 
        text: msg.videoMessage.caption,
        caption: msg.videoMessage.caption,
      };
    }

    if (msg.documentMessage) {
      return { 
        text: msg.documentMessage.caption || msg.documentMessage.fileName,
        caption: msg.documentMessage.caption,
      };
    }

    if (msg.audioMessage) {
      return { text: '[Áudio]' };
    }

    if (msg.stickerMessage) {
      return { text: '[Sticker]' };
    }

    return {};
  }

  // Determinar tipo da mensagem
  private getMessageType(message: any): 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER' {
    const msg = message.message;
    if (!msg) return 'TEXT';

    if (msg.imageMessage) return 'IMAGE';
    if (msg.audioMessage) return 'AUDIO';
    if (msg.videoMessage) return 'VIDEO';
    if (msg.documentMessage) return 'DOCUMENT';
    if (msg.stickerMessage) return 'STICKER';

    return 'TEXT';
  }

  // Obter ou criar contato
  private async getOrCreateContact(sessionId: string, phoneNumber: string, message: any): Promise<string> {
    let contact = await prisma.contact.findUnique({
      where: {
        sessionId_phoneNumber: {
          sessionId,
          phoneNumber,
        },
      },
    });

    if (!contact) {
      const name = message.pushName || phoneNumber;
      
      contact = await prisma.contact.create({
        data: {
          sessionId,
          phoneNumber,
          name,
          lastMessageAt: new Date(),
        },
      });
    } else {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastMessageAt: new Date() },
      });
    }

    return contact.id;
  }

  // Enviar mensagem
  async sendMessage(sessionId: string, phoneNumber: string, content: string, options?: { 
    mediaUrl?: string;
    caption?: string;
    quotedMessageId?: string;
  }): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isConnected || !session.socket) {
      throw new Error(`Sessão ${sessionId} não está conectada`);
    }

    try {
      const jid = `${phoneNumber}@s.whatsapp.net`;
      let sentMessage;

      if (options?.mediaUrl) {
        // Enviar mídia
        sentMessage = await session.socket.sendMessage(jid, {
          image: { url: options.mediaUrl },
          caption: options.caption || content,
        });
      } else {
        // Enviar texto
        sentMessage = await session.socket.sendMessage(jid, {
          text: content,
        });
      }

      // Salvar mensagem enviada no banco
      await prisma.message.create({
        data: {
          messageId: sentMessage?.key.id || '',
          sessionId,
          contactId: await this.getOrCreateContact(sessionId, phoneNumber, { 
            key: { remoteJid: jid }, 
            pushName: phoneNumber 
          } as any),
          type: options?.mediaUrl ? 'IMAGE' : 'TEXT',
          content,
          mediaUrl: options?.mediaUrl,
          mediaCaption: options?.caption,
          isFromMe: true,
          status: 'SENT',
          timestamp: new Date(),
        },
      });

      logger.info(`Mensagem enviada para ${phoneNumber} na sessão ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao enviar mensagem na sessão ${sessionId}:`, error);
      return false;
    }
  }

  // Solicitar código de pareamento (pairing code) para login via número
  async requestPairingCode(sessionId: string, userId: string, phoneNumber: string): Promise<string> {
    // Garantir que a sessão exista
    let session = this.sessions.get(sessionId);
    if (!session) {
      await this.createSession(sessionId, userId);
      session = this.sessions.get(sessionId);
    }

    if (!session?.socket || typeof session.socket.requestPairingCode !== 'function') {
      throw new Error('Cliente WhatsApp não suporta pairing code nesta configuração');
    }

    // Sanitizar número (somente dígitos). Ex: 5511999999999
    const sanitized = (phoneNumber || '').toString().replace(/\D/g, '');
    if (!sanitized || sanitized.length < 8) {
      throw new Error('Número de telefone inválido para pairing code');
    }

    try {
      const code = await session.socket.requestPairingCode(sanitized);

      // Persistir no banco para fácil recuperação/telemetria
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: {
          status: 'CONNECTING',
          qrCode: code, // Reaproveitamos o campo para armazenar o pairing code
          lastConnected: new Date(),
        },
      });

      // Emitir também via WebSocket
      io.to(`session-${sessionId}`).emit('pairing-code', { pairingCode: code });

      logger.info(`Pairing code gerado para sessão ${sessionId}`);
      return code;
    } catch (error) {
      logger.error(`Erro ao solicitar pairing code para sessão ${sessionId}:`, error);
      throw error;
    }
  }

  // Obter sessão
  getSession(sessionId: string): WhatsAppSession | undefined {
    return this.sessions.get(sessionId);
  }

  // Desconectar sessão
  async disconnectSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      await session.socket?.logout?.();
    } catch (error) {
      logger.warn(`Erro ao realizar logout da sessão ${sessionId}:`, error);
    }

    this.sessions.delete(sessionId);

    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: { status: 'DISCONNECTED', qrCode: null },
    });

    logger.info(`Sessão ${sessionId} desconectada`);
  }

  // Manipular atualizações de mensagens (status de entrega)
  private async handleMessagesUpdate(sessionId: string, messageUpdate: any[]) {
    for (const update of messageUpdate) {
      if (update.key && update.update) {
        await prisma.message.updateMany({
          where: {
            messageId: update.key.id,
            sessionId,
          },
          data: {
            status: update.update.status === 3 ? 'READ' : 
                   update.update.status === 2 ? 'DELIVERED' : 'SENT',
          },
        });
      }
    }
  }

  // Manipular atualizações de presença
  private handlePresenceUpdate(sessionId: string, presenceUpdate: any) {
    // Emitir via WebSocket para mostrar status online/digitando
    io.to(`session-${sessionId}`).emit('presence-update', presenceUpdate);
  }

  // Manipular atualizações de contatos
  private async handleContactsUpdate(sessionId: string, contactsUpdate: any[]) {
    for (const contact of contactsUpdate) {
      if (contact.id && contact.name) {
        const phoneNumber = contact.id.split('@')[0];
        
        await prisma.contact.updateMany({
          where: {
            sessionId,
            phoneNumber,
          },
          data: {
            name: contact.name,
            profilePicture: contact.imgUrl,
          },
        });
      }
    }
  }

  // Baixar mídia
  async downloadMedia(sessionId: string, messageId: string): Promise<Buffer | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket) return null;

    try {
      const message = await prisma.message.findUnique({
        where: { messageId },
      });

      if (!message) return null;

      // Implementar download de mídia aqui
      // Retornar buffer da mídia baixada
      return null;
    } catch (error) {
      logger.error(`Erro ao baixar mídia para sessão ${sessionId}:`, error);
      return null;
    }
  }
}

export const whatsappService = new WhatsAppService();

// Função para inicializar o serviço
export const initializeWhatsAppService = async () => {
  await whatsappService.initialize();
};