'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_ENDPOINTS } from '@/config/api';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [botMode, setBotMode] = useState('AI'); // 'AI' or 'GREETING'
  const [greetingMessage, setGreetingMessage] = useState('Olá! Obrigado por entrar em contato. Em breve retornaremos.');
  const [aiModel, setAiModel] = useState('gpt-4o-mini'); // AI model selection
  const [cooldownHours, setCooldownHours] = useState(5);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  
  // Tab navigation state
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Restaurant configuration state
  const [restaurantInfo, setRestaurantInfo] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    description: '',
    deliveryFee: 0,
    minOrderValue: 0,
    acceptsDelivery: true,
    acceptsPickup: true,
    deliveryUrl: '',
    reservationUrl: '',
    whatsappNumber: '',
    businessHours: {
      monday: { open: '09:00', close: '22:00', closed: false },
      tuesday: { open: '09:00', close: '22:00', closed: false },
      wednesday: { open: '09:00', close: '22:00', closed: false },
      thursday: { open: '09:00', close: '22:00', closed: false },
      friday: { open: '09:00', close: '22:00', closed: false },
      saturday: { open: '09:00', close: '23:00', closed: false },
      sunday: { open: '10:00', close: '21:00', closed: false }
    }
  });
  
  const [menuItems, setMenuItems] = useState([]);
  const [newMenuItem, setNewMenuItem] = useState({
    name: '',
    description: '',
    price: 0,
    category: '',
    isAvailable: true,
    preparationTime: 0,
    ingredients: [],
    allergens: [],
    tags: []
  });
  
  const [promotions, setPromotions] = useState([]);
  const [newPromotion, setNewPromotion] = useState({
    title: '',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: 0,
    minOrderValue: 0,
    validFrom: '',
    validUntil: '',
    isActive: true,
    code: '',
    isRecurring: false,
    recurringDays: []
  });
  
  const [aiTraining, setAiTraining] = useState([]);
  const [newAiTraining, setNewAiTraining] = useState({
    context: '',
    expectedResponse: '',
    category: 'general',
    keywords: [],
    priority: 1,
    isActive: true
  });
  
  // AI Configuration state
  const [aiConfig, setAiConfig] = useState({
    responseLength: 'medium',
    personality: 'friendly',
    audioProcessing: true,
    imageProcessing: true
  });
  
  // Excluded contacts state
  const [excludedContacts, setExcludedContacts] = useState([]);
  const [newExcludedContact, setNewExcludedContact] = useState({
    phoneNumber: '',
    reason: ''
  });
  
  // WhatsApp status state
  const [whatsappStatus, setWhatsappStatus] = useState({
    connected: false,
    status: 'disconnected',
    phoneNumber: null,
    lastConnected: null,
    message: 'Status desconhecido'
  });
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  
  const router = useRouter();
  
  useEffect(() => {
    const loadUserData = () => {
      console.log('Dashboard: Loading user data...');
      const token = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      
      if (!token || !userData) {
        console.log('Dashboard: No token or user data, redirecting to login');
        window.location.href = '/login';
        return;
      }
      
      try {
        const parsedUser = JSON.parse(userData);
        console.log('Dashboard: User loaded:', parsedUser);
        setUser(parsedUser);
        
        // Check if this is the user's first login
        if (parsedUser.isFirstLogin) {
          console.log('Dashboard: First login detected, redirecting to onboarding');
          window.location.href = '/onboarding';
          return;
        }
      } catch (error) {
        console.error('Dashboard: Error parsing user data', error);
        window.location.href = '/login';
        return;
      }
      
      setIsLoading(false);
    };
    
    loadUserData();
  }, []);

  useEffect(() => {
    loadBotConfig();
    loadRestaurantData();
    loadExcludedContacts();
  }, []);

  useEffect(() => {
    // Check WhatsApp status on mount and then poll every 10 seconds
    checkWhatsAppStatus();
    
    const statusInterval = setInterval(checkWhatsAppStatus, 10000);
    
    return () => clearInterval(statusInterval);
  }, []);

  const handleLogout = () => {
    console.log('Dashboard: Logging out...');
    localStorage.clear();
    window.location.href = '/login';
  };

  const checkWhatsAppStatus = async () => {
    if (isCheckingStatus) return; // Prevent multiple simultaneous checks
    
    try {
      setIsCheckingStatus(true);
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.whatsapp.status, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        setWhatsappStatus({
          connected: result.connected || false,
          status: result.status || 'disconnected',
          phoneNumber: result.phoneNumber || null,
          lastConnected: result.lastConnected || null,
          message: result.message || 'Status desconhecido'
        });
      } else {
        console.error('Failed to check WhatsApp status:', response.status);
        setWhatsappStatus(prev => ({ ...prev, message: 'Erro ao verificar status' }));
      }
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
      setWhatsappStatus(prev => ({ ...prev, message: 'Erro de conexão' }));
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const loadBotConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.bot.config, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.config) {
          setBotMode(result.config.mode === 'ai' ? 'AI' : 'GREETING');
          setGreetingMessage(result.config.greetingMessage || '');
          setCooldownHours(result.config.cooldownHours || 0);
          setAiModel(result.config.aiModel || 'gpt-4o-mini');
          setAiConfig({
            responseLength: result.config.responseLength || 'medium',
            personality: result.config.personality || 'friendly'
          });
          console.log('Bot config loaded:', result.config);
        }
      } else {
        console.error('Failed to load bot config:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const saveBotConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.bot.config, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          mode: botMode === 'AI' ? 'ai' : 'greeting',
          aiEnabled: botMode === 'AI',
          greetingMessage: greetingMessage || 'Olá! Obrigado por entrar em contato. Como posso ajudá-lo?',
          aiModel: aiModel,
          responseLength: aiConfig.responseLength,
          personality: aiConfig.personality,
          audioProcessing: aiConfig.audioProcessing,
          imageProcessing: aiConfig.imageProcessing,
          autoReply: true
        })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        alert('Configurações salvas com sucesso!');
        console.log('Bot config saved:', result.config);
      } else {
        alert('Erro ao salvar: ' + (result.message || 'Erro desconhecido'));
        console.error('Save error:', result);
      }
    } catch (error) {
      console.error('Error saving bot config:', error);
      alert('Erro ao salvar configurações');
    }
  };

  // Restaurant data management functions
  const loadRestaurantData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/restaurant/info?userId=test-user-id', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setRestaurantInfo(prev => ({ ...prev, ...result.data }));
          setMenuItems(result.data.menuItems || []);
          setPromotions(result.data.promotions || []);
        }
      }
    } catch (error) {
      console.error('Error loading restaurant data:', error);
    }
  };

  const saveRestaurantInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/restaurant/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...restaurantInfo, userId: 'test-user-id' })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        alert('Informações do restaurante salvas com sucesso!');
      } else {
        alert('Erro ao salvar: ' + (result.message || 'Erro desconhecido'));
      }
    } catch (error) {
      console.error('Error saving restaurant info:', error);
      alert('Erro ao salvar informações do restaurante');
    }
  };

  const addMenuItem = async () => {
    if (!newMenuItem.name || !newMenuItem.category || newMenuItem.price <= 0) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/restaurant/menu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...newMenuItem, userId: 'test-user-id' })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        setMenuItems([...menuItems, result.data]);
        setNewMenuItem({
          name: '',
          description: '',
          price: 0,
          category: '',
          isAvailable: true,
          preparationTime: 0,
          ingredients: [],
          allergens: [],
          tags: []
        });
        alert('Item adicionado ao menu com sucesso!');
      } else {
        alert('Erro ao adicionar item: ' + (result.message || 'Erro desconhecido'));
      }
    } catch (error) {
      console.error('Error adding menu item:', error);
      alert('Erro ao adicionar item ao menu');
    }
  };

  const deleteMenuItem = async (id) => {
    if (!confirm('Tem certeza que deseja remover este item do menu?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/restaurant/menu/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setMenuItems(menuItems.filter(item => item.id !== id));
        alert('Item removido do menu com sucesso!');
      } else {
        alert('Erro ao remover item do menu');
      }
    } catch (error) {
      console.error('Error deleting menu item:', error);
      alert('Erro ao remover item do menu');
    }
  };

  const addPromotion = async () => {
    if (!newPromotion.title || !newPromotion.description || !newPromotion.validFrom || !newPromotion.validUntil) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/restaurant/promotions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...newPromotion, userId: 'test-user-id' })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        setPromotions([...promotions, result.data]);
        setNewPromotion({
          title: '',
          description: '',
          discountType: 'PERCENTAGE',
          discountValue: 0,
          minOrderValue: 0,
          validFrom: '',
          validUntil: '',
          isActive: true,
          code: ''
        });
        alert('Promoção adicionada com sucesso!');
      } else {
        alert('Erro ao adicionar promoção: ' + (result.message || 'Erro desconhecido'));
      }
    } catch (error) {
      console.error('Error adding promotion:', error);
      alert('Erro ao adicionar promoção');
    }
  };

  const deletePromotion = async (id) => {
    if (!confirm('Tem certeza que deseja remover esta promoção?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/restaurant/promotions/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setPromotions(promotions.filter(promo => promo.id !== id));
        alert('Promoção removida com sucesso!');
      } else {
        alert('Erro ao remover promoção');
      }
    } catch (error) {
      console.error('Error deleting promotion:', error);
      alert('Erro ao remover promoção');
    }
  };

  const addAiTraining = async () => {
    if (!newAiTraining.context || !newAiTraining.expectedResponse) {
      alert('Por favor, preencha o contexto e a resposta esperada');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/ai/training', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...newAiTraining, userId: 'test-user-id' })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        setAiTraining([...aiTraining, result.data]);
        setNewAiTraining({
          context: '',
          expectedResponse: '',
          category: 'general',
          keywords: [],
          priority: 1,
          isActive: true
        });
        alert('Treinamento de IA adicionado com sucesso!');
      } else {
        alert('Erro ao adicionar treinamento: ' + (result.message || 'Erro desconhecido'));
      }
    } catch (error) {
      console.error('Error adding AI training:', error);
      alert('Erro ao adicionar treinamento de IA');
    }
  };

  const deleteAiTraining = async (id) => {
    if (!confirm('Tem certeza que deseja remover este treinamento?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/ai/training/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setAiTraining(aiTraining.filter(training => training.id !== id));
        alert('Treinamento removido com sucesso!');
      } else {
        alert('Erro ao remover treinamento');
      }
    } catch (error) {
      console.error('Error deleting AI training:', error);
      alert('Erro ao remover treinamento');
    }
  };

  // Excluded contacts functions
  const loadExcludedContacts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/excluded-contacts?userId=test-user-id', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setExcludedContacts(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error loading excluded contacts:', error);
    }
  };

  const addExcludedContact = async () => {
    if (!newExcludedContact.phoneNumber) {
      alert('Por favor, informe o número de telefone');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/excluded-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...newExcludedContact, userId: 'test-user-id' })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        setExcludedContacts([...excludedContacts, result.data]);
        setNewExcludedContact({ phoneNumber: '', reason: '' });
        alert('Contato adicionado à lista de excluídos!');
      } else {
        alert('Erro ao adicionar contato: ' + (result.message || 'Erro desconhecido'));
      }
    } catch (error) {
      console.error('Error adding excluded contact:', error);
      alert('Erro ao adicionar contato excluído');
    }
  };

  const removeExcludedContact = async (id) => {
    if (!confirm('Tem certeza que deseja remover este contato da lista de excluídos?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/excluded-contacts/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setExcludedContacts(excludedContacts.filter(contact => contact.id !== id));
        alert('Contato removido da lista de excluídos!');
      } else {
        alert('Erro ao remover contato');
      }
    } catch (error) {
      console.error('Error removing excluded contact:', error);
      alert('Erro ao remover contato');
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.whatsapp.disconnect, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        // Update status immediately
        setWhatsappStatus({
          connected: false,
          status: 'disconnected',
          phoneNumber: null,
          lastConnected: new Date().toISOString(),
          message: 'Desconectado com sucesso'
        });
        
        setShowDisconnectConfirm(false);
        
        // Show success message
        alert('WhatsApp desconectado com sucesso! Você pode conectar um novo dispositivo agora.');
        
        // Redirect to connect page after a short delay
        setTimeout(() => {
          window.location.href = '/whatsapp/connect';
        }, 1500);
      } else {
        const error = await response.json();
        alert(`Erro ao desconectar: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      alert('Erro ao desconectar WhatsApp');
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Erro ao carregar dados do usuário</p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Fazer Login
          </button>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-8">
            {/* User Info */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Informações da Conta</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Plano</p>
                  <p className="font-medium">{user.plan}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Função</p>
                  <p className="font-medium">{user.role}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-medium text-green-600">
                    {user.isActive ? 'Ativo' : 'Inativo'}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-2">Mensagens</h3>
                <p className="text-3xl font-bold text-blue-600">0</p>
                <p className="text-sm text-gray-600">Total de mensagens enviadas</p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-2">Contatos</h3>
                <p className="text-3xl font-bold text-green-600">0</p>
                <p className="text-sm text-gray-600">Contatos ativos</p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">WhatsApp</h3>
                  <button 
                    onClick={checkWhatsAppStatus}
                    disabled={isCheckingStatus}
                    className="text-sm px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isCheckingStatus ? '🔄' : '↻'}
                  </button>
                </div>
                <div className="flex items-center mb-2">
                  <div className={`w-3 h-3 rounded-full mr-2 ${whatsappStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <p className={`text-3xl font-bold ${whatsappStatus.connected ? 'text-green-600' : 'text-red-600'}`}>
                    {whatsappStatus.connected ? 'Conectado' : 'Desconectado'}
                  </p>
                </div>
                {whatsappStatus.phoneNumber && (
                  <p className="text-sm text-gray-600">+{whatsappStatus.phoneNumber}</p>
                )}
                <p className="text-sm text-gray-600">{whatsappStatus.message}</p>
                {whatsappStatus.lastConnected && (
                  <p className="text-xs text-gray-500 mt-1">
                    Última conexão: {new Date(whatsappStatus.lastConnected).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Próximos Passos</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">
                      {whatsappStatus.connected ? 'WhatsApp Conectado' : 'Conectar WhatsApp'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {whatsappStatus.connected 
                        ? `Conectado como +${whatsappStatus.phoneNumber}` 
                        : 'Configure sua conexão com o WhatsApp'
                      }
                    </p>
                  </div>
                  {!whatsappStatus.connected && (
                    <button 
                      onClick={() => window.location.href = '/whatsapp/connect'}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Conectar
                    </button>
                  )}
                  {whatsappStatus.connected && (
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => window.location.href = '/whatsapp/connect'}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Reconectar
                      </button>
                      <button 
                        onClick={() => setShowDisconnectConfirm(true)}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Desconectar
                      </button>
                      <span className="text-green-600 font-semibold flex items-center">✓</span>
                    </div>
                  )}
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-medium">Configurar Bot</h3>
                      <p className="text-sm text-gray-600">Personalize as respostas do seu assistente</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 border rounded">
                    <label className="flex items-center gap-2 mb-4">
                      <span>Modo do Bot:</span>
                      <select 
                        value={botMode} 
                        onChange={(e) => setBotMode(e.target.value)} 
                        className="border rounded px-2 py-1"
                      >
                        <option value="AI">Inteligência Artificial</option>
                        <option value="GREETING">Mensagem de Saudação</option>
                      </select>
                    </label>
                    
                    {botMode === 'AI' && (
                      <div className="mb-4">
                        <label className="flex items-center gap-2 mb-2">
                          <span>Modelo de IA:</span>
                          <select 
                            value={aiModel} 
                            onChange={(e) => setAiModel(e.target.value)} 
                            className="border rounded px-2 py-1"
                          >
                            <option value="gpt-4o-mini">GPT-4o Mini (Recomendado - Melhor custo-benefício)</option>
                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy - Mais rápido)</option>
                            <option value="gpt-4o">GPT-4o (Premium - Melhor qualidade)</option>
                          </select>
                        </label>
                        <p className="text-xs text-gray-500 ml-20">
                          GPT-4o Mini oferece excelente qualidade com custo reduzido
                        </p>
                      </div>
                    )}
                    
                    {botMode === 'GREETING' && (
                      <>
                        <textarea
                          placeholder="Digite sua mensagem de saudação..."
                          value={greetingMessage}
                          onChange={(e) => setGreetingMessage(e.target.value)}
                          className="w-full border rounded p-2 mb-4"
                          rows={4}
                        />
                        <label className="flex items-center gap-2 mb-4">
                          <span>Reenviar após (horas):</span>
                          <input
                            type="number"
                            min="1"
                            value={cooldownHours}
                            onChange={(e) => setCooldownHours(parseInt(e.target.value))}
                            className="border rounded px-2 py-1 w-20"
                          />
                        </label>
                      </>
                    )}
                    
                    <button 
                      onClick={saveBotConfig} 
                      className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                    >
                      Salvar Configurações
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'ai-config':
        return (
          <div className="space-y-8">
            {/* AI Configuration */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Configuração da IA</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tamanho da Resposta</label>
                  <select
                    value={aiConfig.responseLength}
                    onChange={(e) => setAiConfig({...aiConfig, responseLength: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="short">Curta (1-2 frases)</option>
                    <option value="medium">Média (2-4 frases)</option>
                    <option value="long">Longa (4-6 frases)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Personalidade da IA</label>
                  <select
                    value={aiConfig.personality}
                    onChange={(e) => setAiConfig({...aiConfig, personality: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="casual">Casual - Emojis, brincadeiras, tom relaxado</option>
                    <option value="intelligent">Inteligente - Explicações detalhadas, educativo</option>
                    <option value="salesperson">Vendedor - Foco em vendas, promoções, urgência</option>
                    <option value="professional">Profissional - Formal, respeitoso, empresarial</option>
                    <option value="friendly">Amigável - Caloroso, acolhedor, como um amigo</option>
                    <option value="gourmet">Gourmet - Sofisticado, foco em detalhes culinários</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-3">Exemplos de Personalidade</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  {aiConfig.personality === 'casual' && (
                    <p className="text-sm text-gray-600">
                      "Oi! 😊 Que bom te ver aqui! Temos umas pizzas incríveis hoje, vai querer dar uma olhada no cardápio? 🍕"
                    </p>
                  )}
                  {aiConfig.personality === 'intelligent' && (
                    <p className="text-sm text-gray-600">
                      "Olá! Nosso cardápio oferece uma variedade de pratos cuidadosamente preparados. Posso explicar os ingredientes e métodos de preparo de qualquer item que desperte seu interesse."
                    </p>
                  )}
                  {aiConfig.personality === 'salesperson' && (
                    <p className="text-sm text-gray-600">
                      "Olá! Hoje temos uma promoção especial de 20% de desconto em pizzas grandes! Aproveite agora, válido apenas hoje. Que tal fazer seu pedido?"
                    </p>
                  )}
                  {aiConfig.personality === 'professional' && (
                    <p className="text-sm text-gray-600">
                      "Boa tarde. Agradeço seu contato conosco. Estou à disposição para apresentar nosso cardápio e auxiliá-lo com seu pedido."
                    </p>
                  )}
                  {aiConfig.personality === 'friendly' && (
                    <p className="text-sm text-gray-600">
                      "Olá, querido! Como vai você? Que alegria ter você aqui! O que posso preparar de especial para você hoje?"
                    </p>
                  )}
                  {aiConfig.personality === 'gourmet' && (
                    <p className="text-sm text-gray-600">
                      "Bem-vindo à nossa experiência gastronômica. Nossos pratos são elaborados com ingredientes selecionados e técnicas refinadas. Permita-me apresentar nossas especialidades."
                    </p>
                  )}
                </div>
              </div>

              {/* Media Processing Settings */}
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">Processamento de Mídia</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={aiConfig.audioProcessing}
                        onChange={(e) => setAiConfig({...aiConfig, audioProcessing: e.target.checked})}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Processar mensagens de áudio</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-7">
                      Usa OpenAI Whisper para transcrever áudios dos clientes
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2 ml-7">
                      <p className="text-xs text-yellow-800">
                        💰 <strong>Custo adicional:</strong> ~$0.006 por minuto de áudio
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={aiConfig.imageProcessing}
                        onChange={(e) => setAiConfig({...aiConfig, imageProcessing: e.target.checked})}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Analisar imagens enviadas</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-7">
                      Usa GPT-4 Vision para identificar comidas, ler menus e responder sobre imagens
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2 ml-7">
                      <p className="text-xs text-yellow-800">
                        💰 <strong>Custo adicional:</strong> ~$0.01-0.04 por imagem (depende da resolução)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Casos de uso para restaurantes:</h4>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>• <strong>Áudio:</strong> Cliente envia pergunta por voz sobre o cardápio</li>
                    <li>• <strong>Imagem:</strong> Cliente fotografa um prato e pergunta sobre ingredientes</li>
                    <li>• <strong>Menu:</strong> Cliente envia foto de menu externo para comparar preços</li>
                    <li>• <strong>Produto:</strong> Cliente fotografa comida de outro local perguntando "vocês fazem isso?"</li>
                  </ul>
                </div>
              </div>
              
              <button 
                onClick={saveBotConfig}
                className="mt-6 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Salvar Configurações de IA
              </button>
            </div>

            {/* AI Training */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Treinamento de IA</h2>
              
              {/* Add New Training */}
              <div className="border rounded p-4 mb-6">
                <h3 className="font-medium mb-3">Adicionar Exemplo de Treinamento</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contexto/Pergunta *</label>
                    <textarea
                      placeholder="Ex: Cliente pergunta sobre horário de funcionamento"
                      value={newAiTraining.context}
                      onChange={(e) => setNewAiTraining({...newAiTraining, context: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Resposta Esperada *</label>
                    <textarea
                      placeholder="Ex: Funcionamos de segunda a sexta das 9h às 22h..."
                      value={newAiTraining.expectedResponse}
                      onChange={(e) => setNewAiTraining({...newAiTraining, expectedResponse: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <select
                        value={newAiTraining.category}
                        onChange={(e) => setNewAiTraining({...newAiTraining, category: e.target.value})}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="general">Geral</option>
                        <option value="menu">Cardápio</option>
                        <option value="hours">Horários</option>
                        <option value="delivery">Delivery</option>
                        <option value="promotions">Promoções</option>
                      </select>
                    </div>
                    <div>
                      <select
                        value={newAiTraining.priority}
                        onChange={(e) => setNewAiTraining({...newAiTraining, priority: parseInt(e.target.value)})}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value={1}>Prioridade Baixa</option>
                        <option value={2}>Prioridade Normal</option>
                        <option value={3}>Prioridade Alta</option>
                      </select>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={addAiTraining}
                  className="mt-3 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Adicionar Treinamento
                </button>
              </div>

              {/* AI Training List */}
              <div className="space-y-2">
                {aiTraining.map((training) => (
                  <div key={training.id} className="border rounded p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {training.category}
                          </span>
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                            Prioridade {training.priority}
                          </span>
                        </div>
                        <p className="text-sm font-medium mb-1">Contexto:</p>
                        <p className="text-sm text-gray-600 mb-2">{training.context}</p>
                        <p className="text-sm font-medium mb-1">Resposta:</p>
                        <p className="text-sm text-gray-600">{training.expectedResponse}</p>
                      </div>
                      <button
                        onClick={() => deleteAiTraining(training.id)}
                        className="text-red-600 hover:text-red-800 ml-2"
                      >
                        ❌
                      </button>
                    </div>
                  </div>
                ))}
                {aiTraining.length === 0 && (
                  <p className="text-gray-500 text-center py-4">Nenhum treinamento adicionado ainda</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'excluded-contacts':
        return (
          <div className="space-y-8">
            {/* Excluded Contacts */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Contatos Excluídos</h2>
              <p className="text-gray-600 mb-6">
                Contatos nesta lista não receberão respostas automáticas do bot.
              </p>
              
              {/* Add New Excluded Contact */}
              <div className="border rounded p-4 mb-6">
                <h3 className="font-medium mb-3">Adicionar Contato à Lista de Excluídos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Número do telefone *"
                      value={newExcludedContact.phoneNumber}
                      onChange={(e) => setNewExcludedContact({...newExcludedContact, phoneNumber: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Motivo (opcional)"
                      value={newExcludedContact.reason}
                      onChange={(e) => setNewExcludedContact({...newExcludedContact, reason: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </div>
                <button 
                  onClick={addExcludedContact}
                  className="mt-3 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Adicionar à Lista de Excluídos
                </button>
              </div>

              {/* Excluded Contacts List */}
              <div className="space-y-2">
                {excludedContacts.map((contact) => (
                  <div key={contact.id} className="border rounded p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium">{contact.phoneNumber}</p>
                      {contact.reason && (
                        <p className="text-sm text-gray-600">Motivo: {contact.reason}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Adicionado em: {new Date(contact.excludedAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <button
                      onClick={() => removeExcludedContact(contact.id)}
                      className="text-green-600 hover:text-green-800"
                    >
                      ✅ Reativar
                    </button>
                  </div>
                ))}
                {excludedContacts.length === 0 && (
                  <p className="text-gray-500 text-center py-4">Nenhum contato excluído</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'promotions':
        return (
          <div className="space-y-8">
            {/* Promotions */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Promoções</h2>
              
              {/* Add New Promotion */}
              <div className="border rounded p-4 mb-6">
                <h3 className="font-medium mb-3">Adicionar Promoção</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Título da promoção *"
                      value={newPromotion.title}
                      onChange={(e) => setNewPromotion({...newPromotion, title: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Código (opcional)"
                      value={newPromotion.code}
                      onChange={(e) => setNewPromotion({...newPromotion, code: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <select
                      value={newPromotion.discountType}
                      onChange={(e) => setNewPromotion({...newPromotion, discountType: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="PERCENTAGE">Porcentagem</option>
                      <option value="FIXED">Valor Fixo</option>
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Valor do desconto"
                      value={newPromotion.discountValue}
                      onChange={(e) => setNewPromotion({...newPromotion, discountValue: parseFloat(e.target.value)})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  
                  {/* Recurring Options */}
                  <div className="md:col-span-2">
                    <label className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        checked={newPromotion.isRecurring}
                        onChange={(e) => setNewPromotion({...newPromotion, isRecurring: e.target.checked})}
                        className="mr-2"
                      />
                      Promoção recorrente (repete em dias específicos da semana)
                    </label>
                    
                    {newPromotion.isRecurring && (
                      <div className="ml-6">
                        <p className="text-sm text-gray-600 mb-2">Selecione os dias da semana:</p>
                        <div className="flex flex-wrap gap-2">
                          {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day, index) => (
                            <label key={index} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={newPromotion.recurringDays.includes(index)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewPromotion({
                                      ...newPromotion, 
                                      recurringDays: [...newPromotion.recurringDays, index]
                                    });
                                  } else {
                                    setNewPromotion({
                                      ...newPromotion, 
                                      recurringDays: newPromotion.recurringDays.filter(d => d !== index)
                                    });
                                  }
                                }}
                                className="mr-1"
                              />
                              <span className="text-sm">{day}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {!newPromotion.isRecurring && (
                    <>
                      <div>
                        <input
                          type="date"
                          placeholder="Data início *"
                          value={newPromotion.validFrom}
                          onChange={(e) => setNewPromotion({...newPromotion, validFrom: e.target.value})}
                          className="w-full border rounded px-3 py-2"
                        />
                      </div>
                      <div>
                        <input
                          type="date"
                          placeholder="Data fim *"
                          value={newPromotion.validUntil}
                          onChange={(e) => setNewPromotion({...newPromotion, validUntil: e.target.value})}
                          className="w-full border rounded px-3 py-2"
                        />
                      </div>
                    </>
                  )}
                  
                  <div className="md:col-span-2">
                    <textarea
                      placeholder="Descrição da promoção *"
                      value={newPromotion.description}
                      onChange={(e) => setNewPromotion({...newPromotion, description: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                      rows={2}
                    />
                  </div>
                </div>
                <button 
                  onClick={addPromotion}
                  className="mt-3 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Adicionar Promoção
                </button>
              </div>

              {/* Promotions List */}
              <div className="space-y-2">
                {promotions.map((promo) => (
                  <div key={promo.id} className="border rounded p-3 flex justify-between items-center">
                    <div>
                      <h4 className="font-medium">{promo.title}</h4>
                      <p className="text-sm text-gray-600">{promo.description}</p>
                      <p className="text-sm">
                        <span className="font-medium">
                          {promo.discountType === 'PERCENTAGE' ? `${promo.discountValue}%` : `R$ ${promo.discountValue?.toFixed(2)}`}
                        </span>
                        {promo.isRecurring ? (
                          <span className="text-gray-500 ml-2">
                            • Recorrente: {promo.recurringDays?.map(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(', ')}
                          </span>
                        ) : (
                          <span className="text-gray-500 ml-2">
                            • {new Date(promo.validFrom).toLocaleDateString()} a {new Date(promo.validUntil).toLocaleDateString()}
                          </span>
                        )}
                        {promo.code && (
                          <span className="text-gray-500 ml-2">• Código: {promo.code}</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => deletePromotion(promo.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ❌
                    </button>
                  </div>
                ))}
                {promotions.length === 0 && (
                  <p className="text-gray-500 text-center py-4">Nenhuma promoção ativa</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'restaurant':
        return (
          <div className="space-y-8">
            {/* Restaurant Info */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Informações do Restaurante</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nome do Restaurante *</label>
                  <input
                    type="text"
                    value={restaurantInfo.name}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, name: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Nome do seu restaurante"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                  <input
                    type="text"
                    value={restaurantInfo.phone}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, phone: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Endereço</label>
                  <input
                    type="text"
                    value={restaurantInfo.address}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, address: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Endereço completo"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
                  <textarea
                    value={restaurantInfo.description}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, description: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                    placeholder="Descrição do seu restaurante..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Taxa de Delivery (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={restaurantInfo.deliveryFee}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, deliveryFee: parseFloat(e.target.value)})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pedido Mínimo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={restaurantInfo.minOrderValue}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, minOrderValue: parseFloat(e.target.value)})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">WhatsApp do Restaurante</label>
                  <input
                    type="text"
                    value={restaurantInfo.whatsappNumber}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, whatsappNumber: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">URL do Delivery</label>
                  <input
                    type="url"
                    value={restaurantInfo.deliveryUrl}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, deliveryUrl: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="https://ifood.com.br/delivery/..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">URL de Reservas</label>
                  <input
                    type="url"
                    value={restaurantInfo.reservationUrl}
                    onChange={(e) => setRestaurantInfo({...restaurantInfo, reservationUrl: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    placeholder="https://reservas.com/..."
                  />
                </div>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={restaurantInfo.acceptsDelivery}
                      onChange={(e) => setRestaurantInfo({...restaurantInfo, acceptsDelivery: e.target.checked})}
                      className="mr-2"
                    />
                    Aceita Delivery
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={restaurantInfo.acceptsPickup}
                      onChange={(e) => setRestaurantInfo({...restaurantInfo, acceptsPickup: e.target.checked})}
                      className="mr-2"
                    />
                    Aceita Retirada
                  </label>
                </div>
              </div>
              <button 
                onClick={saveRestaurantInfo}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Salvar Informações
              </button>
            </div>

            {/* Menu Items */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Cardápio</h2>
              
              {/* Add New Menu Item */}
              <div className="border rounded p-4 mb-6">
                <h3 className="font-medium mb-3">Adicionar Item ao Menu</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Nome do item *"
                      value={newMenuItem.name}
                      onChange={(e) => setNewMenuItem({...newMenuItem, name: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Categoria *"
                      value={newMenuItem.category}
                      onChange={(e) => setNewMenuItem({...newMenuItem, category: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Preço *"
                      value={newMenuItem.price}
                      onChange={(e) => setNewMenuItem({...newMenuItem, price: parseFloat(e.target.value)})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="Tempo de preparo (min)"
                      value={newMenuItem.preparationTime}
                      onChange={(e) => setNewMenuItem({...newMenuItem, preparationTime: parseInt(e.target.value)})}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <textarea
                      placeholder="Descrição do item"
                      value={newMenuItem.description}
                      onChange={(e) => setNewMenuItem({...newMenuItem, description: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                      rows={2}
                    />
                  </div>
                </div>
                <button 
                  onClick={addMenuItem}
                  className="mt-3 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Adicionar Item
                </button>
              </div>

              {/* Menu Items List */}
              <div className="space-y-2">
                {menuItems.map((item) => (
                  <div key={item.id} className="border rounded p-3 flex justify-between items-center">
                    <div>
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-gray-600">{item.description}</p>
                      <p className="text-sm">
                        <span className="font-medium">R$ {item.price?.toFixed(2)}</span>
                        <span className="text-gray-500 ml-2">• {item.category}</span>
                        {item.preparationTime && (
                          <span className="text-gray-500 ml-2">• {item.preparationTime}min</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteMenuItem(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ❌
                    </button>
                  </div>
                ))}
                {menuItems.length === 0 && (
                  <p className="text-gray-500 text-center py-4">Nenhum item no cardápio ainda</p>
                )}
              </div>
            </div>

          </div>
        );

      default:
        return <div>Tab não encontrada</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Olá, {user.name}! 👋
            </h1>
            <p className="text-gray-600">
              Bem-vindo ao painel do seu assistente virtual WhatsApp
            </p>
          </div>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Sair
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="flex border-b overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-3 font-medium whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('restaurant')}
              className={`px-6 py-3 font-medium whitespace-nowrap ${
                activeTab === 'restaurant'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Informações do Restaurante
            </button>
            <button
              onClick={() => setActiveTab('ai-config')}
              className={`px-6 py-3 font-medium whitespace-nowrap ${
                activeTab === 'ai-config'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Configurar IA
            </button>
            <button
              onClick={() => setActiveTab('excluded-contacts')}
              className={`px-6 py-3 font-medium whitespace-nowrap ${
                activeTab === 'excluded-contacts'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Contatos Excluídos
            </button>
            <button
              onClick={() => setActiveTab('promotions')}
              className={`px-6 py-3 font-medium whitespace-nowrap ${
                activeTab === 'promotions'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Promoções
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>

      {/* Disconnect Confirmation Dialog */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirmar Desconexão</h3>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja desconectar este WhatsApp? 
              Isso removerá completamente a sessão atual e você precisará escanear 
              um novo QR code para reconectar.
            </p>
            {whatsappStatus.phoneNumber && (
              <p className="text-sm text-gray-500 mb-4">
                Dispositivo atual: +{whatsappStatus.phoneNumber}
              </p>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                disabled={isDisconnecting}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isDisconnecting ? 'Desconectando...' : 'Desconectar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}