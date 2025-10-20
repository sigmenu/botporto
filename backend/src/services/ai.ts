// @ts-nocheck
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { cacheService } from '../lib/redis';
import { prisma } from '../index';

interface WhatsAppSession {
  id: string;
  personality?: any;
  aiSettings?: any;
  template?: any;
  language: string;
}

interface ConversationContext {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  context: any;
}

class AIService {
  private openai: OpenAI;
  private anthropic: Anthropic;
  
  constructor() {
    // Inicializar OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }

    // Inicializar Anthropic (Claude)
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  // Processar mensagem de texto
  async processTextMessage(content: string, session: WhatsAppSession): Promise<string> {
    try {
      const context = await this.getConversationContext(session.id, content);
      const personality = this.buildPersonalityPrompt(session);
      
      // Usar Claude como principal, OpenAI como fallback
      let response = await this.processWithClaude(content, personality, context);
      
      if (!response) {
        response = await this.processWithOpenAI(content, personality, context);
      }

      if (response) {
        await this.updateConversationContext(session.id, content, response);
        return response;
      }

      return this.getFallbackResponse(session.language);
    } catch (error) {
      logger.error('Erro ao processar mensagem de texto:', error);
      return this.getErrorResponse(session.language);
    }
  }

  // Processar com Claude
  private async processWithClaude(
    content: string, 
    personality: string, 
    context: ConversationContext
  ): Promise<string | null> {
    if (!this.anthropic) {
      return null;
    }

    try {
      const messages = [
        { role: 'user' as const, content: `${personality}\n\nContexto da conversa:\n${JSON.stringify(context.context, null, 2)}\n\nMensagem do usuário: ${content}` },
      ];

      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages,
        temperature: 0.7,
      });

      const textContent = response.content.find(c => c.type === 'text');
      return textContent ? textContent.text : null;
    } catch (error) {
      logger.error('Erro ao processar com Claude:', error);
      return null;
    }
  }

  // Processar com OpenAI
  private async processWithOpenAI(
    content: string, 
    personality: string, 
    context: ConversationContext
  ): Promise<string | null> {
    if (!this.openai) {
      return null;
    }

    try {
      const messages = [
        { role: 'system' as const, content: personality },
        ...context.messages,
        { role: 'user' as const, content },
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content || null;
    } catch (error) {
      logger.error('Erro ao processar com OpenAI:', error);
      return null;
    }
  }

  // Transcrever áudio
  async transcribeAudio(audioUrl: string): Promise<string | null> {
    if (!this.openai) {
      logger.warn('OpenAI não configurado para transcrição');
      return null;
    }

    try {
      // Baixar arquivo de áudio
      const audioBuffer = await this.downloadFile(audioUrl);
      if (!audioBuffer) {
        return null;
      }

      // Criar arquivo temporário
      const audioFile = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });

      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'pt',
      });

      return response.text;
    } catch (error) {
      logger.error('Erro ao transcrever áudio:', error);
      return null;
    }
  }

  // Analisar imagem
  async analyzeImage(imageUrl: string, caption?: string): Promise<any> {
    if (!this.openai) {
      logger.warn('OpenAI não configurado para análise de imagens');
      return null;
    }

    try {
      const messages = [
        {
          role: 'user' as const,
          content: [
            {
              type: 'text',
              text: caption ? 
                `Analise esta imagem. Legenda fornecida: "${caption}". Descreva o que você vê e forneça informações relevantes.` :
                'Analise esta imagem e descreva o que você vê, fornecendo informações relevantes.',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages,
        max_tokens: 500,
      });

      const analysis = response.choices[0]?.message?.content;
      
      return {
        description: analysis,
        timestamp: new Date(),
        model: 'gpt-4-vision-preview',
      };
    } catch (error) {
      logger.error('Erro ao analisar imagem:', error);
      return null;
    }
  }

  // Processar documento
  async processDocument(documentUrl: string): Promise<any> {
    try {
      // Baixar documento
      const documentBuffer = await this.downloadFile(documentUrl);
      if (!documentBuffer) {
        return null;
      }

      // Extrair texto do documento (implementar baseado no tipo)
      const extractedText = await this.extractTextFromDocument(documentBuffer);
      
      if (!extractedText) {
        return null;
      }

      // Processar com IA
      const analysis = await this.processWithOpenAI(
        `Analise este documento e forneça um resumo: ${extractedText}`,
        'Você é um assistente que analisa documentos e fornece resumos úteis.',
        { messages: [], context: {} }
      );

      return {
        extractedText: extractedText.substring(0, 5000), // Limitar tamanho
        analysis,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Erro ao processar documento:', error);
      return null;
    }
  }

  // Processar mensagem de imagem
  async processImageMessage(imageAnalysis: any, caption: string | undefined, session: WhatsAppSession): Promise<string> {
    const personality = this.buildPersonalityPrompt(session);
    const prompt = `Baseado na análise da imagem: ${imageAnalysis.description}${caption ? ` e na legenda: "${caption}"` : ''}, responda de forma útil ao usuário.`;
    
    const context = await this.getConversationContext(session.id, prompt);
    
    let response = await this.processWithClaude(prompt, personality, context);
    if (!response) {
      response = await this.processWithOpenAI(prompt, personality, context);
    }

    return response || this.getFallbackResponse(session.language);
  }

  // Processar mensagem de documento
  async processDocumentMessage(documentAnalysis: any, session: WhatsAppSession): Promise<string> {
    const personality = this.buildPersonalityPrompt(session);
    const prompt = `Baseado na análise do documento: ${documentAnalysis.analysis}, responda de forma útil ao usuário sobre o conteúdo.`;
    
    const context = await this.getConversationContext(session.id, prompt);
    
    let response = await this.processWithClaude(prompt, personality, context);
    if (!response) {
      response = await this.processWithOpenAI(prompt, personality, context);
    }

    return response || this.getFallbackResponse(session.language);
  }

  // Construir prompt de personalidade
  private buildPersonalityPrompt(session: WhatsAppSession): string {
    const basePersonality = `Você é um assistente virtual inteligente do WhatsApp. Responda de forma amigável, útil e profissional.`;
    
    let personality = basePersonality;
    
    // Adicionar personalidade customizada
    if (session.personality) {
      personality += `\n\nPersonalidade: ${session.personality.description || ''}`;
      
      if (session.personality.tone) {
        personality += `\nTom de voz: ${session.personality.tone}`;
      }
      
      if (session.personality.specialties) {
        personality += `\nEspecialidades: ${session.personality.specialties.join(', ')}`;
      }
    }

    // Adicionar contexto do template/nicho
    if (session.template) {
      personality += `\n\nContexto do negócio: ${session.template.name} - ${session.template.description}`;
      
      if (session.template.category === 'RESTAURANT') {
        personality += `\nVocê atende para um restaurante. Pode ajudar com pedidos, cardápio e informações sobre entrega.`;
      } else if (session.template.category === 'ECOMMERCE') {
        personality += `\nVocê atende para uma loja online. Pode ajudar com produtos, pedidos e informações sobre compras.`;
      } else if (session.template.category === 'HEALTHCARE') {
        personality += `\nVocê atende para uma clínica/consultório. Pode ajudar com agendamentos e informações médicas gerais.`;
      } else if (session.template.category === 'REALESTATE') {
        personality += `\nVocê atende para uma imobiliária. Pode ajudar com informações sobre imóveis e agendamento de visitas.`;
      } else if (session.template.category === 'EDUCATION') {
        personality += `\nVocê atende para uma instituição de ensino. Pode ajudar com informações sobre cursos e matrículas.`;
      }
    }

    // Configurações de idioma
    if (session.language === 'en') {
      personality += `\nResponda sempre em inglês.`;
    } else if (session.language === 'es') {
      personality += `\nResponda sempre em espanhol.`;
    } else {
      personality += `\nResponda sempre em português brasileiro.`;
    }

    // Configurações de IA específicas
    if (session.aiSettings) {
      if (session.aiSettings.maxResponseLength) {
        personality += `\nMantenha suas respostas com no máximo ${session.aiSettings.maxResponseLength} caracteres.`;
      }
      
      if (session.aiSettings.includeEmojis) {
        personality += `\nUse emojis apropriados em suas respostas.`;
      }
      
      if (session.aiSettings.formalTone) {
        personality += `\nMantenha um tom formal e profissional.`;
      }
    }

    return personality;
  }

  // Obter contexto da conversa
  private async getConversationContext(sessionId: string, currentMessage: string): Promise<ConversationContext> {
    const cacheKey = `conversation:${sessionId}`;
    
    let context = await cacheService.get(cacheKey);
    if (!context) {
      context = {
        messages: [],
        context: {},
      };
    }

    // Obter mensagens recentes do banco se necessário
    if (context.messages.length === 0) {
      const recentMessages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { timestamp: 'desc' },
        take: 10,
      });

      context.messages = recentMessages.reverse().map(msg => ({
        role: msg.isFromMe ? 'assistant' as const : 'user' as const,
        content: msg.content || '',
      }));
    }

    return context;
  }

  // Atualizar contexto da conversa
  private async updateConversationContext(sessionId: string, userMessage: string, aiResponse: string): Promise<void> {
    const cacheKey = `conversation:${sessionId}`;
    
    let context = await cacheService.get(cacheKey) || {
      messages: [],
      context: {},
    };

    // Adicionar mensagens à conversa
    context.messages.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse }
    );

    // Manter apenas últimas 20 mensagens
    if (context.messages.length > 20) {
      context.messages = context.messages.slice(-20);
    }

    // Atualizar timestamp
    context.lastUpdate = new Date();

    // Salvar no cache por 1 hora
    await cacheService.set(cacheKey, context, 3600);
  }

  // Baixar arquivo
  private async downloadFile(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      logger.error('Erro ao baixar arquivo:', error);
      return null;
    }
  }

  // Extrair texto de documento (implementação básica)
  private async extractTextFromDocument(buffer: Buffer): Promise<string | null> {
    try {
      // Para PDF, seria necessário usar uma lib como pdf-parse
      // Para docx, seria necessário usar mammoth
      // Por simplicidade, retornando null - implementar baseado nas necessidades
      return null;
    } catch (error) {
      logger.error('Erro ao extrair texto do documento:', error);
      return null;
    }
  }

  // Resposta de fallback
  private getFallbackResponse(language: string): string {
    const responses = {
      'pt-BR': 'Desculpe, não consegui processar sua mensagem no momento. Pode tentar novamente?',
      'en': 'Sorry, I couldn\'t process your message at the moment. Can you try again?',
      'es': 'Lo siento, no pude procesar tu mensaje en este momento. ¿Puedes intentar de nuevo?',
    };
    
    return responses[language as keyof typeof responses] || responses['pt-BR'];
  }

  // Resposta de erro
  private getErrorResponse(language: string): string {
    const responses = {
      'pt-BR': 'Ocorreu um erro ao processar sua mensagem. Nossa equipe foi notificada.',
      'en': 'An error occurred while processing your message. Our team has been notified.',
      'es': 'Ocurrió un error al procesar tu mensaje. Nuestro equipo ha sido notificado.',
    };
    
    return responses[language as keyof typeof responses] || responses['pt-BR'];
  }

  // Gerar resumo de conversa
  async generateConversationSummary(sessionId: string): Promise<string | null> {
    try {
      const messages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      if (messages.length === 0) {
        return null;
      }

      const conversation = messages.reverse().map(msg => 
        `${msg.isFromMe ? 'Bot' : 'Cliente'}: ${msg.content}`
      ).join('\n');

      const prompt = `Faça um resumo desta conversa do WhatsApp:\n\n${conversation}`;

      let summary = await this.processWithClaude(
        prompt,
        'Você é um assistente que cria resumos concisos de conversas.',
        { messages: [], context: {} }
      );

      if (!summary) {
        summary = await this.processWithOpenAI(
          prompt,
          'Você é um assistente que cria resumos concisos de conversas.',
          { messages: [], context: {} }
        );
      }

      return summary;
    } catch (error) {
      logger.error('Erro ao gerar resumo de conversa:', error);
      return null;
    }
  }
}

export const aiService = new AIService();