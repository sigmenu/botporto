/// <reference types="node" />
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')
  
  try {
    // 1. Criar usuário admin
    const hashedPassword = await bcrypt.hash('admin123', 10)
    
    const admin = await prisma.user.upsert({
      where: { email: 'admin@teste.com' },
      update: {
        password: hashedPassword,
        name: 'Administrador'
      },
      create: {
        email: 'admin@teste.com',
        password: hashedPassword,
        name: 'Administrador',
        role: 'ADMIN',
        plan: 'ENTERPRISE',
        isFirstLogin: false,
        emailVerified: true,
        company: 'Sistema Admin',
        phone: '11999999999'
      }
    })
    
    console.log('✅ Usuário admin criado/atualizado:', admin.email)

    // 2. Criar subscription para o admin
    await prisma.subscription.upsert({
      where: { userId: admin.id },
      update: {},
      create: {
        userId: admin.id,
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        messagesLimit: 999999,
        contactsLimit: 999999,
        sessionsLimit: 999999
      } as any
    })
    
    console.log('✅ Subscription criada para admin')

    // 3. Criar templates (sem upsert, apenas create)
    const templatesData = [
      {
        userId: admin.id,
        name: 'Restaurante - Atendimento Completo',
        category: 'RESTAURANT',
        description: 'Template completo para restaurantes e delivery',
        prompts: {
          welcome: 'Olá! 🍕 Bem-vindo ao {businessName}! Como posso ajudar você hoje?',
          menu: 'Aqui está nosso cardápio atualizado. O que gostaria de pedir?',
          delivery: 'Fazemos entrega em até 40 minutos! Qual seu endereço?',
          hours: 'Funcionamos de Seg a Sex das 11h às 23h, Sáb e Dom das 11h às 00h',
          payment: 'Aceitamos Pix, cartão e dinheiro (com troco)'
        },
        isPublic: true,
        isActive: true
      },
      {
        userId: admin.id,
        name: 'E-commerce - Vendas Online',
        category: 'ECOMMERCE',
        description: 'Template para lojas virtuais e vendas online',
        prompts: {
          welcome: 'Olá! Bem-vindo à {businessName}! Como posso ajudar?',
          catalog: 'Temos várias categorias de produtos. Qual te interessa?',
          shipping: 'Entregamos em todo Brasil! Frete grátis acima de R$ 150',
          payment: 'Parcelamos em até 12x sem juros no cartão',
          tracking: 'Para rastrear seu pedido, me informe o número'
        },
        isPublic: true,
        isActive: true
      },
      {
        userId: admin.id,
        name: 'Clínica - Atendimento Médico',
        category: 'CLINIC',
        description: 'Template para clínicas e consultórios médicos',
        prompts: {
          welcome: 'Olá! Bem-vindo à {businessName}. Como posso ajudar?',
          appointment: 'Para agendar uma consulta, preciso de alguns dados',
          insurance: 'Atendemos diversos convênios. Qual o seu?',
          emergency: 'Para emergências, procure o pronto-socorro mais próximo',
          hours: 'Atendemos de Seg a Sex das 8h às 18h'
        },
        isPublic: true,
        isActive: true
      }
    ]

    // Deletar templates existentes e criar novos
    await prisma.template.deleteMany({
      where: { userId: admin.id } as any
    })

    for (const templateData of templatesData) {
      await prisma.template.create({
        data: templateData as any
      })
    }
    
    console.log('✅ Templates criados:', templatesData.length)

    // 4. Criar usuário de teste
    const testPassword = await bcrypt.hash('teste123', 10)
    
    const testUser = await prisma.user.upsert({
      where: { email: 'teste@teste.com' },
      update: {},
      create: {
        email: 'teste@teste.com',
        password: testPassword,
        name: 'Usuário Teste',
        role: 'CLIENT',
        plan: 'TRIAL',
        isFirstLogin: true,
        emailVerified: false
      }
    })
    
    console.log('✅ Usuário de teste criado:', testUser.email)

    console.log('\n🎉 Seed executado com sucesso!')
    console.log('\n📝 Credenciais de acesso:')
    console.log('   Admin: admin@teste.com / admin123')
    console.log('   Teste: teste@teste.com / teste123')
    
  } catch (error) {
    console.error('❌ Erro no seed:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
