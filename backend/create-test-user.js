const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('🔐 Criando usuário de teste...');
    
    // Hash da senha
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Verificar se usuário já existe
    const existingUser = await prisma.user.findUnique({
      where: { email: 'admin@teste.com' }
    });
    
    if (existingUser) {
      console.log('✅ Usuário admin@teste.com já existe!');
      return;
    }
    
    // Criar usuário
    const user = await prisma.user.create({
      data: {
        email: 'admin@teste.com',
        password: hashedPassword,
        name: 'Administrador',
        role: 'ADMIN',
        plan: 'PREMIUM',
        emailVerified: true,
        isActive: true,
        isFirstLogin: false
      }
    });
    
    console.log('✅ Usuário criado com sucesso!');
    console.log('📧 Email:', user.email);
    console.log('🔐 Senha: admin123');
    console.log('👤 ID:', user.id);
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
