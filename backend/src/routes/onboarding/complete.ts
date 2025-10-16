import express from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken } from '../../middleware/auth'

const router = express.Router()
const prisma = new PrismaClient()

interface OnboardingData {
  businessNiche: string
  businessName: string
  businessInfo: string
  businessPhone?: string
  businessAddress?: string
  businessWebsite?: string
  personality: string
  language: string
  welcomeMessage: string
  offlineMessage: string
  fallbackMessage: string
  aiModel: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  workingHours: any
  timezone: string
  autoResponse: boolean
  humanHandoff: boolean
  leadCapture: boolean
  isActive: boolean
}

router.post('/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const data: OnboardingData = req.body

    // Validate required fields
    if (!data.businessNiche || !data.businessName || !data.businessInfo) {
      return res.status(400).json({
        error: 'Missing required fields: businessNiche, businessName, businessInfo'
      })
    }

    // Start transaction
    await prisma.$transaction(async (tx) => {
      // Update user to mark onboarding as complete
      await tx.user.update({
        where: { id: userId },
        data: {
          company: data.businessName,
          isFirstLogin: false,
          onboardingStep: 6
        }
      })

      // Create or update bot configuration
      await tx.botConfig.upsert({
        where: { userId },
        update: {
          businessNiche: data.businessNiche,
          businessName: data.businessName,
          businessInfo: data.businessInfo,
          businessPhone: data.businessPhone,
          businessAddress: data.businessAddress,
          businessWebsite: data.businessWebsite,
          personality: data.personality,
          language: data.language,
          welcomeMessage: data.welcomeMessage,
          offlineMessage: data.offlineMessage,
          fallbackMessage: data.fallbackMessage,
          aiModel: data.aiModel,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          systemPrompt: data.systemPrompt,
          workingHours: data.workingHours,
          timezone: data.timezone,
          autoResponse: data.autoResponse,
          humanHandoff: data.humanHandoff,
          leadCapture: data.leadCapture,
          isActive: data.isActive
        },
        create: {
          userId,
          businessNiche: data.businessNiche,
          businessName: data.businessName,
          businessInfo: data.businessInfo,
          businessPhone: data.businessPhone,
          businessAddress: data.businessAddress,
          businessWebsite: data.businessWebsite,
          personality: data.personality,
          language: data.language,
          welcomeMessage: data.welcomeMessage,
          offlineMessage: data.offlineMessage,
          fallbackMessage: data.fallbackMessage,
          aiModel: data.aiModel,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          systemPrompt: data.systemPrompt,
          workingHours: data.workingHours,
          timezone: data.timezone,
          autoResponse: data.autoResponse,
          humanHandoff: data.humanHandoff,
          leadCapture: data.leadCapture,
          isActive: data.isActive
        }
      })

      // Create restaurant-specific menu templates if it's a restaurant
      if (data.businessNiche === 'RESTAURANT') {
        await createRestaurantTemplates(tx, userId, data.businessName)
      }
    })

    // Return updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        role: true,
        plan: true,
        isFirstLogin: true,
        onboardingStep: true,
        isActive: true,
        emailVerified: true
      }
    })

    res.json({
      success: true,
      message: 'Onboarding completed successfully',
      user: updatedUser
    })

  } catch (error) {
    console.error('Onboarding completion error:', error)
    res.status(500).json({
      error: 'Failed to complete onboarding'
    })
  }
})

async function createRestaurantTemplates(tx: any, userId: string, businessName: string) {
  const menuTemplate = {
    userId,
    name: `${businessName} - Cardápio Digital`,
    description: 'Template de cardápio digital para restaurante',
    category: 'MENU',
    prompts: {
      menuIntro: `🍕 **CARDÁPIO ${businessName.toUpperCase()}** 🍕\n\nConfira nossas deliciosas opções:`,
      categoryIntro: (category: string) => `\n📋 **${category}**\n`,
      itemFormat: (name: string, description: string, price: number) => 
        `• ${name} - R$ ${price.toFixed(2)}\n   ${description}\n`,
      orderPrompt: 'Para fazer seu pedido, me informe:\n• Seu nome completo\n• Endereço para entrega\n• Telefone para contato',
      deliveryInfo: '🚗 Entregamos em até 45 minutos\n💳 Aceitamos: Dinheiro, PIX, Cartão'
    },
    menuStructure: {
      categories: [
        {
          id: 'pizza',
          name: 'Pizzas',
          items: [
            { name: 'Margherita', description: 'Molho de tomate, mussarela, manjericão', price: 32.90 },
            { name: 'Calabresa', description: 'Molho de tomate, mussarela, calabresa, cebola', price: 35.90 },
            { name: 'Portuguesa', description: 'Presunto, ovos, cebola, azeitona, mussarela', price: 39.90 }
          ]
        },
        {
          id: 'bebidas',
          name: 'Bebidas',
          items: [
            { name: 'Refrigerante 2L', description: 'Coca-Cola, Guaraná, Fanta', price: 8.90 },
            { name: 'Suco Natural 500ml', description: 'Laranja, Limão, Maracujá', price: 6.90 }
          ]
        }
      ],
      deliveryAreas: [
        { name: 'Centro', deliveryFee: 5.00, minOrder: 25.00 },
        { name: 'Bairro Norte', deliveryFee: 7.00, minOrder: 30.00 },
        { name: 'Bairro Sul', deliveryFee: 8.00, minOrder: 35.00 }
      ]
    },
    isPublic: false,
    isActive: true
  }

  await tx.template.create({
    data: menuTemplate
  })

  // Create order tracking template
  const orderTemplate = {
    userId,
    name: `${businessName} - Acompanhamento de Pedidos`,
    description: 'Template para acompanhar status dos pedidos',
    category: 'ORDER_TRACKING',
    prompts: {
      orderConfirmed: '✅ Pedido confirmado!\n📝 Número: #{orderNumber}\n⏱️ Tempo estimado: {estimatedTime} minutos\n\nVocê receberá atualizações sobre o status do seu pedido.',
      preparing: '👨‍🍳 Seu pedido está sendo preparado...\n📝 Pedido #{orderNumber}\n⏱️ Previsão de entrega: {deliveryTime}',
      onTheWay: '🚗 Pedido saiu para entrega!\n📝 Pedido #{orderNumber}\n📍 Endereço: {address}\n👤 Entregador: {deliveryPerson}\n📱 Contato: {deliveryPhone}',
      delivered: '✅ Pedido entregue!\n📝 Pedido #{orderNumber}\n⭐ Que tal avaliar nosso atendimento?\n\nObrigado pela preferência!'
    },
    customFields: {
      orderStatuses: ['confirmed', 'preparing', 'ready', 'on_the_way', 'delivered'],
      trackingEnabled: true,
      notifications: true
    },
    isPublic: false,
    isActive: true
  }

  await tx.template.create({
    data: orderTemplate
  })

  // Create delivery areas template
  const deliveryTemplate = {
    userId,
    name: `${businessName} - Áreas de Entrega`,
    description: 'Template com informações de delivery',
    category: 'DELIVERY',
    prompts: {
      deliveryInfo: '🚗 **INFORMAÇÕES DE ENTREGA**\n\nConsultamos sua localização automaticamente.\nVerifique nossas áreas de entrega:',
      areaFormat: (area: string, fee: number, minOrder: number) => 
        `📍 ${area}\n   Taxa: R$ ${fee.toFixed(2)}\n   Pedido mínimo: R$ ${minOrder.toFixed(2)}\n`,
      noDelivery: '❌ Infelizmente não entregamos na sua região.\n🏪 Você pode retirar no balcão:\n📍 {businessAddress}\n⏰ {workingHours}',
      calculateDelivery: 'Para calcular o valor da entrega, informe seu CEP ou endereço completo.'
    },
    customFields: {
      deliveryRadius: 10, // km
      freeDeliveryMinValue: 50.00,
      estimatedDeliveryTime: 45 // minutes
    },
    isPublic: false,
    isActive: true
  }

  await tx.template.create({
    data: deliveryTemplate
  })
}

export default router