const { OpenAI } = require('openai');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.apiKey = process.env.OPENAI_API_KEY;
    
    if (this.apiKey) {
      try {
        this.client = new OpenAI({
          apiKey: this.apiKey,
        });
        this.initialized = true;
        console.log('[OpenAI Service] Initialized successfully');
      } catch (error) {
        console.error('[OpenAI Service] Failed to initialize:', error.message);
      }
    } else {
      console.warn('[OpenAI Service] No API key found in environment variables');
    }
  }

  async loadRestaurantContext(userId = 'test-user-id') {
    try {
      // Load restaurant data
      const restaurant = await prisma.restaurant.findFirst({
        where: { userId },
        include: {
          menuItems: {
            where: { isAvailable: true },
            orderBy: [
              { category: 'asc' },
              { name: 'asc' }
            ]
          },
          promotions: {
            where: { 
              isActive: true
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      // Load AI training data from bot config
      const botConfig = await prisma.botConfig.findFirst({
        where: { userId },
        include: {
          aiTrainings: {
            where: { isActive: true },
            orderBy: [
              { createdAt: 'desc' }
            ]
          }
        }
      });
      
      const aiTraining = botConfig?.aiTrainings || [];

      return { restaurant, aiTraining };
    } catch (error) {
      console.error('[OpenAI Service] Error loading restaurant context:', error);
      return { restaurant: null, aiTraining: [] };
    }
  }

  async loadBotConfig(userId = 'test-user-id') {
    try {
      const botConfig = await prisma.botConfig.findFirst({
        where: { userId }
      });

      return botConfig || { personality: 'friendly', responseLength: 'medium' };
    } catch (error) {
      console.error('[OpenAI Service] Error loading bot config:', error);
      return { personality: 'friendly', responseLength: 'medium' };
    }
  }

  getPersonalityPrompt(personality) {
    const personalities = {
      casual: 'Você é um assistente virtual casual e descontraído para um restaurante. Use emojis ocasionalmente, faça brincadeiras amigáveis e mantenha um tom relaxado e divertido. Seja como um amigo que quer ajudar com o pedido.',
      intelligent: 'Você é um assistente virtual inteligente e educativo para um restaurante. Forneça explicações detalhadas sobre ingredientes, métodos de preparo e informações nutricionais. Seja informativo e ajude o cliente a entender melhor as opções do cardápio.',
      salesperson: 'Você é um assistente virtual focado em vendas para um restaurante. Sempre promova pratos, destaque promoções ativas, crie senso de urgência e incentive o cliente a fazer pedidos maiores. Seja persuasivo mas amigável.',
      professional: 'Você é um assistente virtual profissional para um restaurante. Mantenha um tom formal, respeitoso e empresarial. Use linguagem cortês e profissional, sem gírias ou expressões muito informais.',
      friendly: 'Você é um assistente virtual amigável e caloroso para um restaurante. Seja acolhedor, demonstre interesse genuíno pelo cliente e crie uma atmosfera familiar e convidativa. Trate cada cliente como um amigo querido.',
      gourmet: 'Você é um assistente virtual sofisticado para um restaurante gourmet. Use vocabulário culinário refinado, destaque a qualidade dos ingredientes, técnicas de preparo especiais e a experiência gastronômica única. Seja elegante mas acessível.'
    };
    
    return personalities[personality] || personalities.friendly;
  }

  getResponseLengthInstructions(responseLength) {
    const instructions = {
      short: '\n\nMANTENHA RESPOSTAS CURTAS: Limite suas respostas a 1-2 frases diretas e objetivas.',
      medium: '\n\nMANTENHA RESPOSTAS MÉDIAS: Use 2-4 frases para explicar adequadamente, sem ser muito longo.',
      long: '\n\nPODE DAR RESPOSTAS DETALHADAS: Use 4-6 frases quando necessário para fornecer informações completas e úteis.'
    };
    
    return instructions[responseLength] || instructions.medium;
  }

  detectKeywordsAndEnhancePrompt(message, restaurant) {
    const lowerMessage = message.toLowerCase();
    
    // Keywords for different contexts
    const deliveryKeywords = ['delivery', 'entrega', 'entregar', 'pedido', 'pedir', 'cardápio', 'menu', 'comida', 'prato', 'lanche'];
    const reservationKeywords = ['reserva', 'mesa', 'reservar', 'lugar', 'lotação', 'disponibilidade', 'vaga'];
    const greetingKeywords = ['oi', 'olá', 'boa', 'bom', 'tarde', 'noite', 'dia', 'tchau', 'alo', 'hey'];
    
    // Check which keywords match
    const hasDeliveryKeywords = deliveryKeywords.some(word => lowerMessage.includes(word));
    const hasReservationKeywords = reservationKeywords.some(word => lowerMessage.includes(word));
    const hasGreetingKeywords = greetingKeywords.some(word => lowerMessage.includes(word));
    
    let enhancementPrompt = '';
    
    if (hasGreetingKeywords) {
      enhancementPrompt += '\n\n🎯 RESPOSTA PARA SAUDAÇÃO: Inclua saudação calorosa + link de delivery';
      if (restaurant.deliveryUrl) {
        enhancementPrompt += `\nMencione EXATAMENTE: "${restaurant.deliveryUrl}"`;
      }
    }
    
    if (hasDeliveryKeywords) {
      enhancementPrompt += '\n\n🚚 RESPOSTA SOBRE DELIVERY: DEVE incluir o link completo na resposta';
      if (restaurant.deliveryUrl) {
        enhancementPrompt += `\nLink OBRIGATÓRIO (copie exatamente): "${restaurant.deliveryUrl}"`;
      }
    }
    
    if (hasReservationKeywords) {
      enhancementPrompt += '\n\n📅 RESPOSTA SOBRE RESERVA: DEVE incluir o link completo na resposta';
      if (restaurant.reservationUrl) {
        enhancementPrompt += `\nLink OBRIGATÓRIO (copie exatamente): "${restaurant.reservationUrl}"`;
      }
    }
    
    return enhancementPrompt;
  }

  forceAppendLinks(aiResponse, originalMessage, restaurant) {
    if (!restaurant) return aiResponse;
    
    const lowerMessage = originalMessage.toLowerCase();
    const lowerResponse = aiResponse.toLowerCase();
    
    // Keywords for different contexts
    const deliveryKeywords = ['delivery', 'entrega', 'entregar', 'pedido', 'pedir', 'cardápio', 'menu', 'comida', 'prato', 'lanche'];
    const reservationKeywords = ['reserva', 'mesa', 'reservar', 'lugar', 'lotação', 'disponibilidade', 'vaga'];
    const greetingKeywords = ['oi', 'olá', 'boa', 'bom', 'tarde', 'noite', 'dia'];
    
    let finalResponse = aiResponse;
    let linksAdded = false;
    
    // Check if delivery keywords are present and link is missing
    const hasDeliveryKeywords = deliveryKeywords.some(word => lowerMessage.includes(word));
    if (hasDeliveryKeywords && restaurant.deliveryUrl) {
      // Check if any delivery URL is already in the response
      if (!lowerResponse.includes('http') || !aiResponse.includes(restaurant.deliveryUrl)) {
        finalResponse += `\n\n🚚 Peça agora: ${restaurant.deliveryUrl}`;
        linksAdded = true;
      }
    }
    
    // Check if reservation keywords are present and link is missing  
    const hasReservationKeywords = reservationKeywords.some(word => lowerMessage.includes(word));
    if (hasReservationKeywords && restaurant.reservationUrl) {
      if (!aiResponse.includes(restaurant.reservationUrl)) {
        finalResponse += `\n\n📅 Reserve aqui: ${restaurant.reservationUrl}`;
        linksAdded = true;
      }
    }
    
    // For greetings, always add delivery link if not present
    const hasGreetingKeywords = greetingKeywords.some(word => lowerMessage.includes(word));
    if (hasGreetingKeywords && restaurant.deliveryUrl) {
      if (!aiResponse.includes(restaurant.deliveryUrl)) {
        finalResponse += `\n\n📱 Faça seu pedido: ${restaurant.deliveryUrl}`;
        linksAdded = true;
      }
    }
    
    if (linksAdded) {
      console.log('[OpenAI Service] Force-appended missing links to response');
    }
    
    return finalResponse;
  }

  buildRestaurantPrompt(restaurant, aiTraining, botConfig = {}) {
    const personality = botConfig.personality || 'friendly';
    const responseLength = botConfig.responseLength || 'medium';
    
    // Base prompt with personality
    let prompt = this.getPersonalityPrompt(personality);
    
    // Add response length instructions
    prompt += this.getResponseLengthInstructions(responseLength);

    if (restaurant) {
      prompt += `\n\n=== INFORMAÇÕES DO RESTAURANTE ===`;
      prompt += `\nNome: ${restaurant.name}`;
      
      if (restaurant.description) {
        prompt += `\nDescrição: ${restaurant.description}`;
      }
      
      if (restaurant.address) {
        prompt += `\nEndereço: ${restaurant.address}`;
      }
      
      if (restaurant.phone) {
        prompt += `\nTelefone: ${restaurant.phone}`;
      }

      // Business hours
      if (restaurant.businessHours) {
        prompt += `\n\n=== HORÁRIO DE FUNCIONAMENTO ===`;
        const hours = restaurant.businessHours;
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        
        days.forEach((day, index) => {
          if (hours[day]) {
            if (hours[day].closed) {
              prompt += `\n${dayNames[index]}: Fechado`;
            } else {
              prompt += `\n${dayNames[index]}: ${hours[day].open} às ${hours[day].close}`;
            }
          }
        });
      }

      // Delivery info
      if (restaurant.acceptsDelivery || restaurant.acceptsPickup) {
        prompt += `\n\n=== SERVIÇOS DISPONÍVEIS ===`;
        if (restaurant.acceptsDelivery) {
          prompt += `\n- Delivery disponível`;
          if (restaurant.deliveryFee) {
            prompt += ` (Taxa: R$ ${restaurant.deliveryFee.toFixed(2)})`;
          }
          if (restaurant.minOrderValue) {
            prompt += ` (Pedido mínimo: R$ ${restaurant.minOrderValue.toFixed(2)})`;
          }
        }
        if (restaurant.acceptsPickup) {
          prompt += `\n- Retirada no local disponível`;
        }
      }

      // Delivery and reservation URLs - CRITICAL FOR PROACTIVE SHARING
      if (restaurant.deliveryUrl || restaurant.ifoodUrl || restaurant.uberEatsUrl || restaurant.reservationUrl) {
        prompt += `\n\n=== 🔗 LINKS CRUCIAIS - COMPARTILHE PROATIVAMENTE ===`;
        prompt += `\n⚠️  IMPORTANTE: SEMPRE inclua estes links quando relevante!`;
        
        if (restaurant.deliveryUrl) {
          prompt += `\n🚚 DELIVERY PRINCIPAL: ${restaurant.deliveryUrl}`;
          prompt += `\n   → Use para: pedidos, cardápio, delivery, entrega`;
        }
        
        if (restaurant.ifoodUrl) {
          prompt += `\n🍽️  IFOOD: ${restaurant.ifoodUrl}`;
        }
        
        if (restaurant.uberEatsUrl) {
          prompt += `\n🚗 UBER EATS: ${restaurant.uberEatsUrl}`;
        }
        
        if (restaurant.reservationUrl) {
          prompt += `\n📅 RESERVAS: ${restaurant.reservationUrl}`;
          prompt += `\n   → Use para: mesa, reserva, disponibilidade`;
        }
        
        prompt += `\n\n🎯 REGRAS DE COMPARTILHAMENTO:`;
        prompt += `\n- SEMPRE mencione o link de delivery em saudações`;
        prompt += `\n- Qualquer pergunta sobre cardápio/pedido → envie delivery link`;
        prompt += `\n- Qualquer pergunta sobre mesa/reserva → envie reservation link`;
        prompt += `\n- Seja PROATIVO: ofereça links mesmo sem pergunta direta`;
      }

      // Menu items by category
      if (restaurant.menuItems && restaurant.menuItems.length > 0) {
        prompt += `\n\n=== CARDÁPIO ===`;
        const categories = {};
        
        restaurant.menuItems.forEach(item => {
          if (!categories[item.category]) {
            categories[item.category] = [];
          }
          categories[item.category].push(item);
        });

        Object.keys(categories).forEach(category => {
          prompt += `\n\n${category.toUpperCase()}:`;
          categories[category].forEach(item => {
            prompt += `\n- ${item.name}: R$ ${item.price.toFixed(2)}`;
            if (item.description) {
              prompt += ` - ${item.description}`;
            }
            if (item.preparationTime) {
              prompt += ` (${item.preparationTime}min)`;
            }
          });
        });
      }

      // Current promotions (smart filtering for today)
      if (restaurant.promotions && restaurant.promotions.length > 0) {
        const today = new Date();
        const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        const activePromotions = restaurant.promotions.filter(promo => {
          if (promo.isRecurring) {
            return promo.recurringDays && promo.recurringDays.includes(currentDay);
          } else {
            const validFrom = new Date(promo.validFrom);
            const validUntil = new Date(promo.validUntil);
            return today >= validFrom && today <= validUntil;
          }
        });

        if (activePromotions.length > 0) {
          prompt += `\n\n=== PROMOÇÕES ATIVAS HOJE ===`;
          activePromotions.forEach(promo => {
            prompt += `\n- ${promo.title}`;
            if (promo.description) {
              prompt += `: ${promo.description}`;
            }
            const discount = promo.discountType === 'PERCENTAGE' 
              ? `${promo.discountValue}% de desconto`
              : `R$ ${promo.discountValue.toFixed(2)} de desconto`;
            prompt += ` (${discount})`;
            
            if (promo.code) {
              prompt += ` - Código: ${promo.code}`;
            }
            
            if (promo.isRecurring) {
              const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
              const activeDays = promo.recurringDays.map(d => days[d]).join(', ');
              prompt += ` - Ativa nos dias: ${activeDays}`;
            } else {
              const validUntil = new Date(promo.validUntil).toLocaleDateString('pt-BR');
              prompt += ` - Válida até ${validUntil}`;
            }
          });
        }
      }
    }

    // Add AI training examples
    if (aiTraining && aiTraining.length > 0) {
      prompt += `\n\n=== EXEMPLOS DE ATENDIMENTO ===`;
      prompt += `\nUse estes exemplos como referência para responder perguntas similares:`;
      
      aiTraining.slice(0, 10).forEach((training, index) => { // Limit to 10 examples
        prompt += `\n\nExemplo ${index + 1}:`;
        prompt += `\nPergunta: ${training.context}`;
        prompt += `\nResposta: ${training.expectedResponse}`;
      });
    }

    prompt += `\n\n=== INSTRUÇÕES DE ATENDIMENTO ===`;
    prompt += `\n🎯 PRIORIDADE MÁXIMA - COMPARTILHAMENTO DE LINKS:`;
    prompt += `\n- SEMPRE inclua links relevantes nas suas respostas`;
    prompt += `\n- Em qualquer saudação (oi, olá, boa tarde) → mencione o link de delivery`;
    prompt += `\n- Para cardápio, pedidos, delivery → SEMPRE inclua o link de delivery`;
    prompt += `\n- Para reservas, mesas → SEMPRE inclua o link de reserva`;
    prompt += `\n- Seja PROATIVO: ofereça links mesmo sem pergunta direta`;
    prompt += `\n- Links devem ser enviados como URLs completas para serem clicáveis`;
    prompt += `\n`;
    prompt += `\n📋 INSTRUÇÕES GERAIS:`;
    prompt += `\n- Seja sempre educado, amigável e prestativo`;
    prompt += `\n- Responda com informações precisas baseadas nos dados do restaurante`;
    prompt += `\n- Se não souber algo específico, seja honesto e ofereça ajuda alternativa`;
    prompt += `\n- Promova os pratos e promoções quando apropriado`;
    prompt += `\n- Ajude o cliente a fazer pedidos quando solicitado`;
    prompt += `\n- Forneça informações sobre horários, localização e serviços quando perguntado`;

    return prompt;
  }

  async generateResponse(message, context = null, model = 'gpt-4o-mini', userId = 'test-user-id') {
    try {
      if (!this.initialized || !this.client) {
        return {
          success: false,
          response: 'Desculpe, o serviço de IA não está disponível no momento.',
          error: 'OpenAI service not initialized'
        };
      }

      // Load bot configuration first to get the model
      const botConfig = await this.loadBotConfig(userId);
      
      // Use model from bot config if available, otherwise use parameter or default
      const finalModel = botConfig?.aiModel || model || 'gpt-4o-mini';
      
      console.log(`[OpenAI Service] Generating response with model ${finalModel} for message:`, message.substring(0, 100));
      console.log(`[OpenAI Service] Bot config:`, botConfig);

      // Load restaurant context and bot config
      const { restaurant, aiTraining } = await this.loadRestaurantContext(userId);

      // Build the conversation with restaurant context and AI settings
      let systemPrompt = this.buildRestaurantPrompt(restaurant, aiTraining, botConfig);
      
      // Enhance prompt based on message keywords
      if (restaurant) {
        const keywordEnhancement = this.detectKeywordsAndEnhancePrompt(message, restaurant);
        if (keywordEnhancement) {
          systemPrompt += keywordEnhancement;
        }
      }
      
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        }
      ];

      // Add context if provided
      if (context && Array.isArray(context) && context.length > 0) {
        messages.push({
          role: 'system',
          content: `Contexto da conversa anterior: ${context.slice(-3).map(msg => `${msg.role}: ${msg.content}`).join('\n')}`
        });
      }

      // Add user message
      messages.push({
        role: 'user',
        content: message
      });

      // Update AI training usage stats
      if (aiTraining && aiTraining.length > 0) {
        // Find matching training examples and increment usage
        for (const training of aiTraining) {
          if (training.keywords && training.keywords.length > 0) {
            const messageWords = message.toLowerCase();
            const hasMatchingKeyword = training.keywords.some(keyword => 
              messageWords.includes(keyword.toLowerCase())
            );
            
            if (hasMatchingKeyword) {
              await prisma.aITraining.update({
                where: { id: training.id },
                data: { 
                  usageCount: { increment: 1 },
                  lastUsed: new Date()
                }
              }).catch(err => console.error('Error updating AI training usage:', err));
            }
          }
        }
      }

      const completion = await this.client.chat.completions.create({
        model: finalModel,
        messages: messages,
        max_tokens: 500,
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });

      let response = completion.choices[0]?.message?.content;
      
      if (!response) {
        throw new Error('No response generated');
      }

      // Force append links if they're missing using fallback mechanism
      const finalResponse = this.forceAppendLinks(response.trim(), message, restaurant);
      
      console.log('[OpenAI Service] Response generated successfully');
      console.log('[OpenAI Service] Final response with forced links:', finalResponse.substring(0, 200) + '...');
      
      return {
        success: true,
        response: finalResponse,
        usage: completion.usage
      };

    } catch (error) {
      console.error('[OpenAI Service] Error generating response:', error);
      
      // Handle specific OpenAI errors
      if (error.code === 'insufficient_quota') {
        return {
          success: false,
          response: 'Desculpe, a cota da API OpenAI foi excedida. Tente novamente mais tarde.',
          error: error.message
        };
      }
      
      if (error.code === 'rate_limit_exceeded') {
        return {
          success: false,
          response: 'Muitas solicitações foram feitas. Aguarde um momento antes de tentar novamente.',
          error: error.message
        };
      }

      if (error.code === 'invalid_api_key') {
        return {
          success: false,
          response: 'Configuração da API inválida. Contate o administrador.',
          error: error.message
        };
      }

      return {
        success: false,
        response: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.',
        error: error.message
      };
    }
  }

  async generateGreeting(userName = null, model = 'gpt-4o-mini', userId = 'test-user-id') {
    try {
      if (!this.initialized || !this.client) {
        return 'Olá! Como posso ajudá-lo hoje?';
      }

      // Load restaurant info to include links in greeting
      const { restaurant } = await this.loadRestaurantContext(userId);
      
      let greeting = `Olá${userName ? `, ${userName}` : ''}! Bem-vindo${restaurant?.name ? ` ao ${restaurant.name}` : ''}! 🌟`;
      
      // Add links proactively
      if (restaurant?.deliveryUrl) {
        greeting += `\n🚚 Faça seu pedido: ${restaurant.deliveryUrl}`;
      }
      
      if (restaurant?.reservationUrl) {
        greeting += `\n📅 Reserve sua mesa: ${restaurant.reservationUrl}`;
      }
      
      greeting += '\n\nEm que posso ajudá-lo?';
      
      return greeting;

    } catch (error) {
      console.error('[OpenAI Service] Error generating greeting:', error);
      return 'Olá! Como posso ajudá-lo hoje?';
    }
  }

  isInitialized() {
    return this.initialized;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      hasApiKey: !!this.apiKey,
      model: 'gpt-4o-mini',
      availableModels: ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o']
    };
  }
}

// Create singleton instance
const openAIService = new OpenAIService();

module.exports = openAIService;