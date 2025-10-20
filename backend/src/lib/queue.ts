// @ts-nocheck
import Bull, { Queue, Job } from 'bull';
import { getRedis } from './redis';
import { logger } from '../utils/logger';
import { aiService } from '../services/ai';
import { whatsappService } from '../services/whatsapp';
import { prisma } from '../index';

interface MessageQueueData {
  messageId: string;
  sessionId: string;
  content: string;
  type: string;
  phoneNumber: string;
  mediaUrl?: string;
}

interface BroadcastQueueData {
  broadcastId: string;
  sessionId: string;
}

let messageQueue: Queue<MessageQueueData>;
let broadcastQueue: Queue<BroadcastQueueData>;

export const initializeQueue = async () => {
  const redis = getRedis();

  // Fila de processamento de mensagens com IA
  messageQueue = new Bull('message-processing', {
    redis: {
      port: redis.options.port || 6379,
      host: redis.options.host || 'localhost',
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  // Fila de broadcast
  broadcastQueue = new Bull('broadcast-processing', {
    redis: {
      port: redis.options.port || 6379,
      host: redis.options.host || 'localhost',
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 50,
      removeOnFail: 20,
    },
  });

  // Processar mensagens
  messageQueue.process('process-message', 5, async (job: Job<MessageQueueData>) => {
    return await processMessage(job.data);
  });

  // Processar broadcasts
  broadcastQueue.process('send-broadcast', 3, async (job: Job<BroadcastQueueData>) => {
    return await processBroadcast(job.data);
  });

  // Event listeners para logs
  messageQueue.on('completed', (job) => {
    logger.info(`Job de mensagem ${job.id} concluído`);
  });

  messageQueue.on('failed', (job, err) => {
    logger.error(`Job de mensagem ${job.id} falhou:`, err);
  });

  broadcastQueue.on('completed', (job) => {
    logger.info(`Job de broadcast ${job.id} concluído`);
  });

  broadcastQueue.on('failed', (job, err) => {
    logger.error(`Job de broadcast ${job.id} falhou:`, err);
  });

  logger.info('Sistema de filas inicializado');
};

// Adicionar mensagem à fila
export const addMessageToQueue = async (data: MessageQueueData, options?: Bull.JobOptions) => {
  if (!messageQueue) {
    throw new Error('Fila de mensagens não inicializada');
  }

  const job = await messageQueue.add('process-message', data, {
    delay: 1000, // Delay de 1 segundo para não sobrecarregar
    ...options,
  });

  logger.info(`Mensagem ${data.messageId} adicionada à fila`);
  return job.id;
};

// Adicionar broadcast à fila
export const addBroadcastToQueue = async (data: BroadcastQueueData, options?: Bull.JobOptions) => {
  if (!broadcastQueue) {
    throw new Error('Fila de broadcast não inicializada');
  }

  const job = await broadcastQueue.add('send-broadcast', data, {
    delay: 2000, // Delay de 2 segundos entre broadcasts
    ...options,
  });

  logger.info(`Broadcast ${data.broadcastId} adicionado à fila`);
  return job.id;
};

// Processar mensagem individual
async function processMessage(data: MessageQueueData): Promise<void> {
  try {
    const { messageId, sessionId, content, type, phoneNumber, mediaUrl } = data;

    // Obter configurações da sessão
    const session = await prisma.whatsAppSession.findUnique({
      where: { id: sessionId },
      include: {
        template: true,
        user: {
          include: { subscription: true },
        },
      },
    });

    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada`);
    }

    // Verificar se auto-reply está ativo
    if (!session.autoReply) {
      logger.info(`Auto-reply desabilitado para sessão ${sessionId}`);
      return;
    }

    // Verificar horário de funcionamento
    if (!isWithinBusinessHours(session.businessHours)) {
      logger.info(`Mensagem recebida fora do horário de funcionamento para sessão ${sessionId}`);
      
      // Enviar mensagem automática de horário
      const outOfHoursMessage = getOutOfHoursMessage(session.businessHours, session.language);
      if (outOfHoursMessage) {
        await whatsappService.sendMessage(sessionId, phoneNumber, outOfHoursMessage);
      }
      return;
    }

    // Verificar limites de uso
    if (!await checkUsageLimits(session.userId)) {
      logger.warn(`Limite de uso excedido para usuário ${session.userId}`);
      return;
    }

    let aiResponse = '';

    // Processar com IA baseado no tipo de mensagem
    switch (type) {
      case 'TEXT':
        aiResponse = await aiService.processTextMessage(content, session);
        break;
      case 'AUDIO':
        // Transcrever áudio primeiro
        const transcription = await aiService.transcribeAudio(mediaUrl || '');
        if (transcription) {
          await prisma.message.update({
            where: { id: messageId },
            data: { transcription },
          });
          aiResponse = await aiService.processTextMessage(transcription, session);
        }
        break;
      case 'IMAGE':
        // Analisar imagem
        const imageAnalysis = await aiService.analyzeImage(mediaUrl || '', content);
        if (imageAnalysis) {
          await prisma.message.update({
            where: { id: messageId },
            data: { imageAnalysis },
          });
          aiResponse = await aiService.processImageMessage(imageAnalysis, content, session);
        }
        break;
      case 'DOCUMENT':
        // Processar documento
        const documentAnalysis = await aiService.processDocument(mediaUrl || '');
        if (documentAnalysis) {
          await prisma.message.update({
            where: { id: messageId },
            data: { documentAnalysis },
          });
          aiResponse = await aiService.processDocumentMessage(documentAnalysis, session);
        }
        break;
    }

    // Salvar resposta da IA
    if (aiResponse) {
      await prisma.message.update({
        where: { id: messageId },
        data: {
          aiProcessed: true,
          aiResponse,
        },
      });

      // Enviar resposta se não estiver em takeover humano
      if (!session.humanHandover) {
        await whatsappService.sendMessage(sessionId, phoneNumber, aiResponse);
      }

      // Atualizar estatísticas de uso
      await updateUsageStats(session.userId);
    }

    logger.info(`Mensagem ${messageId} processada com sucesso`);
  } catch (error) {
    logger.error(`Erro ao processar mensagem ${data.messageId}:`, error);
    throw error;
  }
}

// Processar broadcast
async function processBroadcast(data: BroadcastQueueData): Promise<void> {
  try {
    const { broadcastId, sessionId } = data;

    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      include: {
        recipients: {
          include: { contact: true },
        },
      },
    });

    if (!broadcast) {
      throw new Error(`Broadcast ${broadcastId} não encontrado`);
    }

    // Atualizar status do broadcast
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { 
        status: 'SENDING',
        startedAt: new Date(),
      },
    });

    let sentCount = 0;
    let failedCount = 0;

    // Enviar para cada recipient
    for (const recipient of broadcast.recipients) {
      try {
        await whatsappService.sendMessage(
          sessionId,
          recipient.contact.phoneNumber,
          broadcast.content,
          broadcast.mediaUrl ? { mediaUrl: broadcast.mediaUrl } : undefined
        );

        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        sentCount++;
        
        // Delay entre mensagens para evitar ban
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          },
        });
        failedCount++;
      }
    }

    // Atualizar status final do broadcast
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: 'COMPLETED',
        sentCount,
        failedCount,
        completedAt: new Date(),
      },
    });

    logger.info(`Broadcast ${broadcastId} concluído: ${sentCount} enviadas, ${failedCount} falharam`);
  } catch (error) {
    logger.error(`Erro ao processar broadcast ${data.broadcastId}:`, error);
    
    await prisma.broadcast.update({
      where: { id: data.broadcastId },
      data: { status: 'FAILED' },
    });
    
    throw error;
  }
}

// Verificar se está dentro do horário de funcionamento
function isWithinBusinessHours(businessHours: any): boolean {
  if (!businessHours || !businessHours.enabled) {
    return true; // Sempre ativo se não configurado
  }

  const now = new Date();
  const currentDay = now.getDay(); // 0 = domingo, 1 = segunda, etc.
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const daySchedule = businessHours.schedule[currentDay];
  if (!daySchedule || !daySchedule.active) {
    return false;
  }

  const startTime = daySchedule.start.hour * 60 + daySchedule.start.minute;
  const endTime = daySchedule.end.hour * 60 + daySchedule.end.minute;

  return currentTime >= startTime && currentTime <= endTime;
}

// Obter mensagem de fora de horário
function getOutOfHoursMessage(businessHours: any, language: string = 'pt-BR'): string | null {
  if (!businessHours?.outOfHoursMessage) {
    const messages = {
      'pt-BR': 'Obrigado pelo contato! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Responderemos assim que possível.',
      'en': 'Thank you for contacting us! Our business hours are Monday to Friday, 8 AM to 6 PM. We will respond as soon as possible.',
      'es': 'Gracias por contactarnos! Nuestro horario de atención es de lunes a viernes, de 8 AM a 6 PM. Responderemos lo antes posible.',
    };
    
    return messages[language as keyof typeof messages] || messages['pt-BR'];
  }

  return businessHours.outOfHoursMessage;
}

// Verificar limites de uso
async function checkUsageLimits(userId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return false;
  }

  return subscription.messagesUsed < subscription.messagesLimit;
}

// Atualizar estatísticas de uso
async function updateUsageStats(userId: string): Promise<void> {
  await prisma.subscription.update({
    where: { userId },
    data: {
      messagesUsed: {
        increment: 1,
      },
    },
  });

  // Registrar uso diário
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.usage.upsert({
    where: {
      subscriptionId_date: {
        subscriptionId: (await prisma.subscription.findUnique({ where: { userId } }))!.id,
        date: today,
      },
    },
    update: {
      messagesCount: {
        increment: 1,
      },
    },
    create: {
      subscriptionId: (await prisma.subscription.findUnique({ where: { userId } }))!.id,
      date: today,
      messagesCount: 1,
    },
  });
}

// Obter estatísticas das filas
export const getQueueStats = async () => {
  if (!messageQueue || !broadcastQueue) {
    return null;
  }

  const [messageWaiting, messagePaused, messageActive, messageCompleted, messageFailed] = 
    await Promise.all([
      messageQueue.getWaiting(),
      messageQueue.getPaused(),
      messageQueue.getActive(),
      messageQueue.getCompleted(),
      messageQueue.getFailed(),
    ]);

  const [broadcastWaiting, broadcastPaused, broadcastActive, broadcastCompleted, broadcastFailed] = 
    await Promise.all([
      broadcastQueue.getWaiting(),
      broadcastQueue.getPaused(),
      broadcastQueue.getActive(),
      broadcastQueue.getCompleted(),
      broadcastQueue.getFailed(),
    ]);

  return {
    message: {
      waiting: messageWaiting.length,
      paused: messagePaused.length,
      active: messageActive.length,
      completed: messageCompleted.length,
      failed: messageFailed.length,
    },
    broadcast: {
      waiting: broadcastWaiting.length,
      paused: broadcastPaused.length,
      active: broadcastActive.length,
      completed: broadcastCompleted.length,
      failed: broadcastFailed.length,
    },
  };
};