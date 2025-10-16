const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const express = require('express');
const cors = require('cors');
// WhatsApp routes - Now using whatsapp-web.js
const whatsappRoutes = require('./whatsapp-webjs-routes');
const botConfigRoutes = require('./bot-config-routes');

const prisma = new PrismaClient();
const app = express();

// Middleware para parsing de JSON
app.use(express.json());

// CORS configurado para o frontend nas portas 3000, 3001, e 3002 para flexibilidade
app.use(cors({
    origin: function(origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:3002'
        ];
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rota principal
app.get('/', (req, res) => {
  res.json({ message: 'API funcionando' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    port: process.env.PORT || 3333,
    timestamp: new Date().toISOString(),
    message: 'Server is running'
  });
});

// Rota de login
app.post('/api/auth/login', async (req, res) => {
  console.log('Login attempt:', req.body.email);
  const { email, password } = req.body;
  
  try {
    // Buscar usuário no banco
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) {
      console.log('Usuário não encontrado:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Email ou senha incorretos' 
      });
    }
    
    // Verificar senha
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      console.log('Senha incorreta para:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Email ou senha incorretos' 
      });
    }
    
    console.log('Login bem-sucedido:', email);
    
    // Retornar sucesso no formato esperado pelo frontend
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          plan: 'free',
          isFirstLogin: user.isFirstLogin || false,
          onboardingStep: 0,
          isActive: true,
          emailVerified: true
        },
        tokens: {
          accessToken: 'jwt-token-' + Date.now(),
          refreshToken: 'refresh-token-' + Date.now()
        }
      }
    });
    
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro no servidor' 
    });
  }
});

// Rota de registro
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'CLIENT',
        plan: 'TRIAL'
      }
    });
    
    res.json({
      success: true,
      token: 'jwt-token-' + Date.now(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: 'Email já cadastrado' 
    });
  }
});

// Rotas do WhatsApp - usando whatsapp-web.js
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/sessions', whatsappRoutes);

// Clear session endpoint for manual reset
app.post('/api/whatsapp/clear-session', async (req, res) => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required'
    });
  }
  
  try {
    // Get WhatsApp manager instance
    const whatsappManager = require('./whatsapp-webjs-service');
    
    if (whatsappManager.clearSessionCompletely) {
      await whatsappManager.clearSessionCompletely(phoneNumber, `session_${phoneNumber}`);
      
      console.log(`✅ Session cleared manually for phone: ${phoneNumber}`);
      
      res.json({
        success: true,
        message: `Session cleared successfully for ${phoneNumber}`,
        data: {
          phoneNumber: phoneNumber,
          clearedAt: new Date().toISOString()
        }
      });
    } else {
      throw new Error('clearSessionCompletely method not available');
    }
    
  } catch (error) {
    console.error('❌ Error clearing session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear session',
      error: error.message
    });
  }
});

// Bot configuration routes
app.use('/api/bot', botConfigRoutes);

// Restaurant info endpoints
app.post('/api/restaurant/info', async (req, res) => {
  console.log('=== RESTAURANT INFO REQUEST ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Request headers:', req.headers.authorization ? 'Has Auth' : 'No Auth');
  
  const { 
    name, 
    description,
    address, 
    phone, 
    whatsappNumber,
    email, 
    businessHours, 
    deliveryFee, 
    minOrderValue,
    deliveryTax,
    minimumOrder, 
    deliveryUrl,
    acceptsDelivery, 
    acceptsPickup, 
    logo, 
    banner,
    ifoodUrl,
    uberEatsUrl,
    reservationUrl
  } = req.body;
  
  // In a real app, extract userId from JWT token
  let userId = req.body.userId || 'test-user-id';
  console.log('Using userId:', userId);
  
  try {
    // First, check if user exists or create a default user
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      console.log('User not found, creating default user...');
      // Create a default user for testing
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@test.com`,
          password: 'hashed_password',
          name: 'Default User',
          company: 'Test Company'
        }
      });
      console.log('Created default user:', user.id);
    }
    
    userId = user.id; // Ensure we use the actual user ID
    // Check if restaurant already exists for this user
    let restaurant = await prisma.restaurant.findFirst({
      where: { userId }
    });

    const restaurantData = {
      name: name || '',
      description: description || null,
      address: address || null,
      phone: phone || null,
      whatsappNumber: whatsappNumber || null,
      businessHours: businessHours ? JSON.stringify(businessHours) : JSON.stringify({}),
      deliveryFee: parseFloat(deliveryFee) || 0,
      minOrderValue: parseFloat(minOrderValue) || 0,
      deliveryTax: parseFloat(deliveryTax) || 0,
      minimumOrder: parseFloat(minimumOrder) || 0,
      deliveryUrl: deliveryUrl || null,
      ifoodUrl: ifoodUrl || null,
      uberEatsUrl: uberEatsUrl || null,
      reservationUrl: reservationUrl || null,
      acceptsDelivery: acceptsDelivery !== undefined ? acceptsDelivery : true,
      acceptsPickup: acceptsPickup !== undefined ? acceptsPickup : true
    };

    if (restaurant) {
      // Update existing restaurant
      restaurant = await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: restaurantData
      });
    } else {
      // Create new restaurant
      restaurant = await prisma.restaurant.create({
        data: {
          userId,
          ...restaurantData
        }
      });
    }
    
    res.json({
      success: true,
      data: restaurant
    });
  } catch (error) {
    console.error('=== ERROR SAVING RESTAURANT INFO ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'Registro duplicado encontrado',
        error: 'Unique constraint violation'
      });
    }
    
    if (error.code === 'P2003') {
      return res.status(400).json({
        success: false,
        message: 'Erro de referência: usuário não encontrado',
        error: 'Foreign key constraint violation - user does not exist'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar informações do restaurante',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get restaurant info
app.get('/api/restaurant/info', async (req, res) => {
  // In a real app, extract userId from JWT token
  const userId = req.query.userId || 'test-user-id';
  
  console.log('=== FETCHING RESTAURANT INFO ===');
  console.log('UserId:', userId);
  
  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: { userId },
      include: {
        menuItems: {
          orderBy: [
            { category: 'asc' },
            { name: 'asc' }
          ]
        },
        promotions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    console.log('Retrieved restaurant:', restaurant ? {
      ...restaurant,
      hasDescription: !!restaurant.description,
      hasDeliveryUrl: !!restaurant.deliveryUrl,
      hasWhatsappNumber: !!restaurant.whatsappNumber
    } : null);
    
    res.json({
      success: true,
      data: restaurant
    });
  } catch (error) {
    console.error('Error fetching restaurant info:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar informações do restaurante',
      error: error.message
    });
  }
});

// Menu items endpoints
app.post('/api/restaurant/menu', async (req, res) => {
  const { 
    name, 
    description, 
    price, 
    category, 
    isAvailable, 
    image, 
    preparationTime, 
    ingredients, 
    allergens, 
    nutritionalInfo, 
    extras, 
    tags, 
    order 
  } = req.body;
  
  // In a real app, extract userId from JWT token
  const userId = req.body.userId || 'test-user-id';
  
  try {
    // Find or create restaurant first
    let restaurant = await prisma.restaurant.findUnique({
      where: { userId }
    });
    
    if (!restaurant) {
      restaurant = await prisma.restaurant.create({
        data: {
          userId,
          name: 'Meu Restaurante'
        }
      });
    }
    
    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        name,
        description,
        price,
        category,
        isAvailable,
        image,
        preparationTime,
        ingredients,
        allergens,
        nutritionalInfo,
        extras,
        tags,
        order
      }
    });
    
    res.json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    console.error('Error saving menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar item do menu',
      error: error.message
    });
  }
});

// Update menu item
app.put('/api/restaurant/menu/:id', async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  try {
    const menuItem = await prisma.menuItem.update({
      where: { id },
      data: updateData
    });
    
    res.json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar item do menu',
      error: error.message
    });
  }
});

// Delete menu item
app.delete('/api/restaurant/menu/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await prisma.menuItem.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Item do menu removido com sucesso'
    });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover item do menu',
      error: error.message
    });
  }
});

// Promotions endpoints
app.post('/api/restaurant/promotions', async (req, res) => {
  const { 
    title, 
    description, 
    discountType, 
    discountValue, 
    minOrderValue, 
    maxDiscount, 
    validFrom, 
    validUntil, 
    isActive, 
    code, 
    usageLimit, 
    applicableItems, 
    conditions,
    isRecurring,
    recurringDays
  } = req.body;
  
  // In a real app, extract userId from JWT token
  const userId = req.body.userId || 'test-user-id';
  
  try {
    // Find or create restaurant first
    let restaurant = await prisma.restaurant.findUnique({
      where: { userId }
    });
    
    if (!restaurant) {
      restaurant = await prisma.restaurant.create({
        data: {
          userId,
          name: 'Meu Restaurante'
        }
      });
    }
    
    const promotion = await prisma.promotion.create({
      data: {
        restaurantId: restaurant.id,
        title,
        description,
        discountType,
        discountValue,
        minOrderValue,
        maxDiscount,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
        isActive,
        code,
        usageLimit,
        applicableItems,
        conditions,
        isRecurring,
        recurringDays
      }
    });
    
    res.json({
      success: true,
      data: promotion
    });
  } catch (error) {
    console.error('Error saving promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar promoção',
      error: error.message
    });
  }
});

// Update promotion
app.put('/api/restaurant/promotions/:id', async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  
  // Convert date strings to Date objects if present
  if (updateData.validFrom) updateData.validFrom = new Date(updateData.validFrom);
  if (updateData.validUntil) updateData.validUntil = new Date(updateData.validUntil);
  
  try {
    const promotion = await prisma.promotion.update({
      where: { id },
      data: updateData
    });
    
    res.json({
      success: true,
      data: promotion
    });
  } catch (error) {
    console.error('Error updating promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar promoção',
      error: error.message
    });
  }
});

// Delete promotion
app.delete('/api/restaurant/promotions/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await prisma.promotion.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Promoção removida com sucesso'
    });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover promoção',
      error: error.message
    });
  }
});

// Get active promotions for today (including recurring)
app.get('/api/restaurant/promotions/active', async (req, res) => {
  const userId = req.query.userId || 'test-user-id';
  
  try {
    const today = new Date();
    const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Find restaurant first
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId }
    });
    
    if (!restaurant) {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // Get all promotions for the restaurant
    const promotions = await prisma.promotion.findMany({
      where: { 
        restaurantId: restaurant.id,
        isActive: true,
        OR: [
          // Regular promotions within date range
          {
            isRecurring: false,
            validFrom: { lte: today },
            validUntil: { gte: today }
          },
          // Recurring promotions for today
          {
            isRecurring: true,
            recurringDays: { has: currentDay }
          }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({
      success: true,
      data: promotions
    });
  } catch (error) {
    console.error('Error fetching active promotions:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar promoções ativas',
      error: error.message
    });
  }
});

// AI Training endpoints
app.post('/api/ai/training', async (req, res) => {
  const { 
    context, 
    expectedResponse, 
    category, 
    keywords, 
    priority, 
    isActive 
  } = req.body;
  
  // In a real app, extract userId from JWT token
  const userId = req.body.userId || 'test-user-id';
  
  try {
    const aiTraining = await prisma.aITraining.create({
      data: {
        userId,
        context,
        expectedResponse,
        category,
        keywords,
        priority,
        isActive
      }
    });
    
    res.json({
      success: true,
      data: aiTraining
    });
  } catch (error) {
    console.error('Error saving AI training:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar treinamento de IA',
      error: error.message
    });
  }
});

// Get AI training data
app.get('/api/ai/training', async (req, res) => {
  // In a real app, extract userId from JWT token
  const userId = req.query.userId || 'test-user-id';
  
  try {
    const aiTraining = await prisma.aITraining.findMany({
      where: { 
        userId,
        isActive: true
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    
    res.json({
      success: true,
      data: aiTraining
    });
  } catch (error) {
    console.error('Error fetching AI training:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar treinamento de IA',
      error: error.message
    });
  }
});

// Update AI training
app.put('/api/ai/training/:id', async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  try {
    const aiTraining = await prisma.aITraining.update({
      where: { id },
      data: updateData
    });
    
    res.json({
      success: true,
      data: aiTraining
    });
  } catch (error) {
    console.error('Error updating AI training:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar treinamento de IA',
      error: error.message
    });
  }
});

// Delete AI training
app.delete('/api/ai/training/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await prisma.aITraining.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Treinamento de IA removido com sucesso'
    });
  } catch (error) {
    console.error('Error deleting AI training:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover treinamento de IA',
      error: error.message
    });
  }
});

// Excluded Contacts endpoints
app.post('/api/excluded-contacts', async (req, res) => {
  const { phoneNumber, reason } = req.body;
  const userId = req.body.userId || 'test-user-id';
  
  try {
    const excludedContact = await prisma.excludedContact.create({
      data: {
        userId,
        phoneNumber,
        reason,
        isActive: true
      }
    });
    
    res.json({
      success: true,
      data: excludedContact
    });
  } catch (error) {
    console.error('Error adding excluded contact:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao adicionar contato excluído',
      error: error.message
    });
  }
});

// Get excluded contacts
app.get('/api/excluded-contacts', async (req, res) => {
  const userId = req.query.userId || 'test-user-id';
  
  try {
    const excludedContacts = await prisma.excludedContact.findMany({
      where: { 
        userId,
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({
      success: true,
      data: excludedContacts
    });
  } catch (error) {
    console.error('Error fetching excluded contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar contatos excluídos',
      error: error.message
    });
  }
});

// Delete excluded contact
app.delete('/api/excluded-contacts/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await prisma.excludedContact.update({
      where: { id },
      data: { isActive: false }
    });
    
    res.json({
      success: true,
      message: 'Contato removido da lista de excluídos'
    });
  } catch (error) {
    console.error('Error removing excluded contact:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover contato da lista de excluídos',
      error: error.message
    });
  }
});

// Check if contact is excluded (for message handling)
app.get('/api/excluded-contacts/check/:phoneNumber', async (req, res) => {
  const { phoneNumber } = req.params;
  const userId = req.query.userId || 'test-user-id';
  
  try {
    const excludedContact = await prisma.excludedContact.findFirst({
      where: { 
        userId,
        phoneNumber,
        isActive: true
      }
    });
    
    res.json({
      success: true,
      isExcluded: !!excludedContact,
      data: excludedContact
    });
  } catch (error) {
    console.error('Error checking excluded contact:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar contato excluído',
      error: error.message
    });
  }
});

// Force save endpoint for testing session persistence
app.post('/api/whatsapp/force-save', async (req, res) => {
  const { phoneNumber } = req.body;
  
  console.log(`[Force Save] Force saving session for phone: ${phoneNumber}`);
  
  try {
    // Get WhatsApp manager instance
    const whatsappManager = require('./whatsapp-webjs-service');
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    // Find active session connection
    const connections = whatsappManager.getConnections ? whatsappManager.getConnections() : new Map();
    let connection = null;
    let saveCreds = null;
    
    // Look for connection by phone number
    for (const [sessionId, conn] of connections) {
      if (conn.phoneNumber === phoneNumber && conn.status === 'connected') {
        connection = conn;
        saveCreds = conn.saveCreds;
        break;
      }
    }
    
    // whatsapp-web.js uses LocalAuth - no manual creds saving needed
    console.log(`[Force Save] WhatsApp-web.js handles auth automatically via LocalAuth`);
    
    if (!saveCreds) {
      return res.status(404).json({
        success: false,
        message: `No active session or saved credentials found for ${phoneNumber}`
      });
    }
    
    // Force save using the enhanced function
    console.log(`[Force Save] Using forceSaveSessionFiles for ${phoneNumber}`);
    const saveResult = await whatsappManager.forceSaveSessionFiles(phoneNumber, saveCreds);
    
    if (saveResult.success) {
      console.log(`✅ [Force Save] Successfully saved session for ${phoneNumber}`);
      
      res.json({
        success: true,
        message: `Session force saved successfully for ${phoneNumber}`,
        data: {
          phoneNumber: phoneNumber,
          savedAt: new Date().toISOString(),
          sessionPath: saveResult.sessionPath,
          totalFiles: saveResult.files.length,
          totalSize: saveResult.totalSize,
          criticalFiles: saveResult.criticalFiles,
          appStateSyncFiles: saveResult.appStateSyncFiles,
          files: saveResult.files.map(f => `${f.filename} (${f.size} bytes)`)
        }
      });
    } else {
      console.error(`❌ [Force Save] Failed to save session for ${phoneNumber}:`, saveResult.error);
      res.status(500).json({
        success: false,
        message: 'Failed to force save session',
        error: saveResult.error || 'Unknown error'
      });
    }
    
  } catch (error) {
    console.error('❌ [Force Save] Error in force save endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to force save session',
      error: error.message
    });
  }
});

// Session save test endpoint
app.post('/api/whatsapp/save-test', async (req, res) => {
  const { phoneNumber, force } = req.body;
  
  console.log(`[Save Test] Testing session save for phone: ${phoneNumber}, force: ${force}`);
  
  try {
    // Get WhatsApp manager instance
    const whatsappManager = require('./whatsapp-webjs-service');
    
    // Test session save functionality
    const testResults = {
      phoneNumber: phoneNumber || 'test_session',
      timestamp: new Date().toISOString(),
      tests: []
    };
    
    // Test 1: Force save creds if session exists
    if (phoneNumber && whatsappManager.sessions && whatsappManager.sessions[phoneNumber]) {
      try {
        console.log(`[Save Test] Testing force save of auth state for ${phoneNumber}`);
        
        // whatsapp-web.js handles session persistence automatically via LocalAuth
        console.log(`[Save Test] WhatsApp-web.js session is auto-persisted`);
        
        // Verify files exist
        const fs = require('fs');
        const credsPath = require('path').join(sessionPath, 'creds.json');
        if (fs.existsSync(credsPath)) {
          const stats = fs.statSync(credsPath);
          testResults.tests.push({
            test: 'force_save_creds',
            status: 'success',
            details: `creds.json exists (${stats.size} bytes)`
          });
          console.log(`[Save Test] ✅ Force save successful - creds.json (${stats.size} bytes)`);
        } else {
          testResults.tests.push({
            test: 'force_save_creds',
            status: 'failed',
            details: 'creds.json not found after save'
          });
          console.log(`[Save Test] ❌ Force save failed - creds.json not found`);
        }
      } catch (saveError) {
        testResults.tests.push({
          test: 'force_save_creds',
          status: 'error',
          details: saveError.message
        });
        console.error(`[Save Test] ❌ Force save error:`, saveError);
      }
    } else {
      testResults.tests.push({
        test: 'force_save_creds',
        status: 'skipped',
        details: 'No active session found'
      });
    }
    
    // Test 2: Verify session files exist
    if (phoneNumber) {
      try {
        console.log(`[Save Test] Verifying session files for ${phoneNumber}`);
        const verified = await whatsappManager.verifySessionFiles(phoneNumber);
        testResults.tests.push({
          test: 'verify_session_files',
          status: verified ? 'success' : 'failed',
          details: verified ? 'All session files verified' : 'Session file verification failed'
        });
        console.log(`[Save Test] ${verified ? '✅' : '❌'} Session verification: ${verified}`);
      } catch (verifyError) {
        testResults.tests.push({
          test: 'verify_session_files',
          status: 'error',
          details: verifyError.message
        });
        console.error(`[Save Test] ❌ Verification error:`, verifyError);
      }
    }
    
    // Test 3: Test registry save/load
    try {
      console.log(`[Save Test] Testing session registry save/load`);
      const testSessionData = {
        id: 'test_session',
        phoneNumber: phoneNumber || 'test_phone',
        status: 'TESTING',
        lastConnected: new Date().toISOString(),
        userId: 'test_user'
      };
      
      whatsappManager.saveSessionToFile(phoneNumber || 'test_phone', testSessionData);
      
      // Verify registry was saved
      const fs = require('fs');
      const registryPath = require('path').join(__dirname, 'data', 'session_registry', 'active_sessions.json');
      if (fs.existsSync(registryPath)) {
        const registryData = fs.readFileSync(registryPath, 'utf8');
        const registry = JSON.parse(registryData);
        if (registry[phoneNumber || 'test_phone']) {
          testResults.tests.push({
            test: 'registry_save_load',
            status: 'success',
            details: 'Session registry save/load working'
          });
          console.log(`[Save Test] ✅ Registry save/load successful`);
        } else {
          testResults.tests.push({
            test: 'registry_save_load',
            status: 'failed',
            details: 'Session not found in registry after save'
          });
          console.log(`[Save Test] ❌ Registry save failed - session not in registry`);
        }
      } else {
        testResults.tests.push({
          test: 'registry_save_load',
          status: 'failed',
          details: 'Registry file not created'
        });
        console.log(`[Save Test] ❌ Registry file not created`);
      }
    } catch (registryError) {
      testResults.tests.push({
        test: 'registry_save_load',
        status: 'error',
        details: registryError.message
      });
      console.error(`[Save Test] ❌ Registry error:`, registryError);
    }
    
    // Summary
    const successCount = testResults.tests.filter(t => t.status === 'success').length;
    const totalTests = testResults.tests.length;
    
    console.log(`[Save Test] Completed ${totalTests} tests, ${successCount} successful`);
    
    res.json({
      success: true,
      message: `Session save test completed: ${successCount}/${totalTests} tests passed`,
      data: testResults
    });
    
  } catch (error) {
    console.error('❌ Error in save test endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run save test',
      error: error.message
    });
  }
});

// Global error handler for JSON responses
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log('API endpoint not found:', req.method, req.path);
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// 404 handler for all other routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`
  ================================
  ✅ Servidor rodando com sucesso!
  ================================
  URL: http://localhost:${PORT}
  
  Teste de login habilitado
  Use: admin@teste.com / admin123
  ================================
  `);
});
