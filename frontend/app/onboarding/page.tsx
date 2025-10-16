'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { API_ENDPOINTS } from '@/config/api'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { 
  ChevronLeft, 
  ChevronRight, 
  Bot, 
  Building2,
  MessageSquare,
  Palette,
  Settings,
  Smartphone,
  CheckCircle,
  UtensilsCrossed,
  ShoppingBag,
  Stethoscope,
  Home,
  Dumbbell,
  GraduationCap,
  Zap,
  Users,
  Heart,
  Trophy,
  BookOpen,
  Phone,
  QrCode
} from 'lucide-react'
import toast from 'react-hot-toast'

interface OnboardingData {
  // Step 1: Business Niche
  businessNiche: string
  
  // Step 2: Business Information
  businessName: string
  businessInfo: string
  businessPhone: string
  businessAddress: string
  businessWebsite: string
  
  // Step 3: Bot Personality
  personality: string
  language: string
  
  // Step 4: Message Templates
  welcomeMessage: string
  offlineMessage: string
  workingHours: {
    [key: string]: {
      start: string
      end: string
      active: boolean
    }
  }
  
  // Step 5: Features
  autoResponse: boolean
  humanHandoff: boolean
  leadCapture: boolean
}

const NICHES = [
  {
    id: 'RESTAURANT',
    name: 'Restaurante',
    description: 'Pizzarias, lanchonetes, delivery',
    icon: UtensilsCrossed,
    color: 'text-orange-500 bg-orange-50 border-orange-200'
  },
  {
    id: 'ECOMMERCE',
    name: 'E-commerce',
    description: 'Loja virtual, produtos físicos',
    icon: ShoppingBag,
    color: 'text-blue-500 bg-blue-50 border-blue-200'
  },
  {
    id: 'CLINIC',
    name: 'Clínica/Consultório',
    description: 'Médicos, dentistas, saúde',
    icon: Stethoscope,
    color: 'text-green-500 bg-green-50 border-green-200'
  },
  {
    id: 'REALESTATE',
    name: 'Imobiliária',
    description: 'Corretores, gestão de imóveis',
    icon: Home,
    color: 'text-purple-500 bg-purple-50 border-purple-200'
  },
  {
    id: 'GYM',
    name: 'Academia',
    description: 'Fitness, personal trainer',
    icon: Dumbbell,
    color: 'text-red-500 bg-red-50 border-red-200'
  },
  {
    id: 'EDUCATION',
    name: 'Educação',
    description: 'Cursos, coaching, treinamentos',
    icon: GraduationCap,
    color: 'text-indigo-500 bg-indigo-50 border-indigo-200'
  }
]

const NICHE_TEMPLATES = {
  RESTAURANT: {
    personality: 'FRIENDLY',
    welcomeMessage: 'Olá! Bem-vindo ao {businessName}! 😋\n\nSou seu assistente virtual e estou aqui para ajudar com:\n• Cardápio e preços\n• Pedidos e delivery\n• Reservas\n• Informações gerais\n\nComo posso te ajudar hoje?',
    offlineMessage: 'Obrigado pelo contato! 🌙\n\nNo momento estamos fechados, mas em breve responderemos sua mensagem.\n\n⏰ Horário de funcionamento:\n{workingHours}\n\nPara emergências, ligue: {businessPhone}',
  },
  ECOMMERCE: {
    personality: 'SALES',
    welcomeMessage: 'Olá! Bem-vindo à {businessName}! 🛍️\n\nSou seu assistente de vendas e estou aqui para:\n• Mostrar nossos produtos\n• Tirar dúvidas sobre compras\n• Acompanhar pedidos\n• Oferecer promoções exclusivas\n\nO que você está procurando hoje?',
    offlineMessage: 'Obrigado pelo interesse! 🌙\n\nNo momento nosso atendimento está offline, mas você pode:\n• Navegar pelo site: {businessWebsite}\n• Enviar sua dúvida que responderemos em breve\n\n⏰ Atendimento: {workingHours}',
  },
  CLINIC: {
    personality: 'PROFESSIONAL',
    welcomeMessage: 'Olá! Bem-vindo à {businessName}! 🏥\n\nSou o assistente virtual da clínica e posso ajudar com:\n• Agendamento de consultas\n• Informações sobre especialidades\n• Documentação necessária\n• Confirmação de exames\n\nComo posso te ajudar?',
    offlineMessage: 'Obrigado pelo contato! 🌙\n\nNo momento estamos em horário de descanso, mas sua mensagem é importante para nós.\n\n⏰ Horário de atendimento:\n{workingHours}\n\n🚨 Emergência: Procure o hospital mais próximo\n☎️ Contato: {businessPhone}',
  },
  REALESTATE: {
    personality: 'PROFESSIONAL',
    welcomeMessage: 'Olá! Bem-vindo à {businessName}! 🏠\n\nSou seu consultor imobiliário virtual e posso ajudar com:\n• Busca de imóveis\n• Agendamento de visitas\n• Informações sobre financiamento\n• Avaliação de imóveis\n\nQue tipo de imóvel você procura?',
    offlineMessage: 'Obrigado pelo interesse! 🌙\n\nNo momento nossos consultores estão offline, mas:\n• Deixe sua mensagem que retornaremos\n• Veja nosso portfólio: {businessWebsite}\n\n⏰ Atendimento: {workingHours}\n☎️ Plantão: {businessPhone}',
  },
  GYM: {
    personality: 'FRIENDLY',
    welcomeMessage: 'E aí, futuro atleta! Bem-vindo à {businessName}! 💪\n\nSou seu assistente fitness e posso ajudar com:\n• Planos e modalidades\n• Agendamento de aulas\n• Avaliação física\n• Dicas de treino\n\nVamos começar sua transformação?',
    offlineMessage: 'Opa! Que bom te ver aqui! 🌙\n\nNo momento a recepção está fechada, mas:\n• Segunda já estamos de volta!\n• Confira nossas redes sociais\n• Deixe sua mensagem!\n\n⏰ Funcionamento: {workingHours}\n💪 Nunca pare!',
  },
  EDUCATION: {
    personality: 'PROFESSIONAL',
    welcomeMessage: 'Olá! Bem-vindo à {businessName}! 🎓\n\nSou seu assistente educacional e posso ajudar com:\n• Informações sobre cursos\n• Processo de matrícula\n• Cronograma de aulas\n• Certificações\n\nQual área de conhecimento te interessa?',
    offlineMessage: 'Obrigado pelo interesse em aprender! 🌙\n\nNo momento nossa equipe está offline, mas:\n• Deixe sua dúvida que responderemos\n• Acesse nossa plataforma: {businessWebsite}\n\n⏰ Atendimento: {workingHours}\n📚 O conhecimento não para!',
  }
}

const PERSONALITIES = [
  {
    id: 'FRIENDLY',
    name: 'Amigável',
    description: 'Tom casual, emojis, próximo ao cliente',
    icon: Heart,
    traits: ['Descontraído', 'Empático', 'Acolhedor']
  },
  {
    id: 'PROFESSIONAL',
    name: 'Profissional',
    description: 'Formal, direto, focado em resultados',
    icon: Users,
    traits: ['Formal', 'Objetivo', 'Confiável']
  },
  {
    id: 'SALES',
    name: 'Vendedor',
    description: 'Persuasivo, foco em conversão',
    icon: Trophy,
    traits: ['Persuasivo', 'Convincente', 'Motivador']
  },
  {
    id: 'SUPPORT',
    name: 'Suporte',
    description: 'Paciente, detalhista, resolve problemas',
    icon: BookOpen,
    traits: ['Paciente', 'Detalhista', 'Prestativo']
  }
]

const DEFAULT_WORKING_HOURS = {
  monday: { start: '08:00', end: '18:00', active: true },
  tuesday: { start: '08:00', end: '18:00', active: true },
  wednesday: { start: '08:00', end: '18:00', active: true },
  thursday: { start: '08:00', end: '18:00', active: true },
  friday: { start: '08:00', end: '18:00', active: true },
  saturday: { start: '09:00', end: '14:00', active: true },
  sunday: { start: '00:00', end: '00:00', active: false }
}

export default function OnboardingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  
  const [data, setData] = useState<OnboardingData>({
    businessNiche: '',
    businessName: '',
    businessInfo: '',
    businessPhone: '',
    businessAddress: '',
    businessWebsite: '',
    personality: '',
    language: 'pt-BR',
    welcomeMessage: '',
    offlineMessage: '',
    workingHours: DEFAULT_WORKING_HOURS,
    autoResponse: true,
    humanHandoff: false,
    leadCapture: true
  })

  useEffect(() => {
    // Load user data from localStorage
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser)
        setUser(userData)
        console.log('Onboarding: User loaded', userData)
        
        // If not first login, redirect to dashboard
        if (!userData.isFirstLogin) {
          console.log('Onboarding: Not first login, redirecting to dashboard')
          router.push('/dashboard')
        }
      } catch (error) {
        console.error('Onboarding: Error parsing user data', error)
      }
    }
  }, [router])

  const updateData = (updates: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...updates }))
  }

  const nextStep = async () => {
    if (currentStep < 6) {
      setCurrentStep(prev => prev + 1)
    } else {
      await completeOnboarding()
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const completeOnboarding = async () => {
    try {
      setLoading(true)
      
      const response = await fetch(API_ENDPOINTS.onboarding.complete, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error('Erro ao finalizar onboarding')
      }

      // Update user data in localStorage
      if (user) {
        const updatedUser = { ...user, isFirstLogin: false }
        localStorage.setItem('user', JSON.stringify(updatedUser))
        console.log('Onboarding: Updated user isFirstLogin to false')
      }
      toast.success('Configuração concluída! Bem-vindo!')
      router.push('/dashboard')
      
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro ao finalizar configuração')
    } finally {
      setLoading(false)
    }
  }

  const loadNicheTemplate = (nicheId: string) => {
    const template = NICHE_TEMPLATES[nicheId as keyof typeof NICHE_TEMPLATES]
    if (template) {
      updateData({
        businessNiche: nicheId,
        personality: template.personality,
        welcomeMessage: template.welcomeMessage,
        offlineMessage: template.offlineMessage,
        workingHours: DEFAULT_WORKING_HOURS
      })
    }
  }

  const progress = (currentStep / 6) * 100

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Bot className="h-12 w-12 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Configuração Inicial</h1>
          </div>
          <p className="text-gray-600">Vamos configurar seu bot em 6 passos simples</p>
          
          {/* Progress Bar */}
          <div className="mt-6 max-w-md mx-auto">
            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <span>Passo {currentStep} de 6</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          <Card className="min-h-[600px]">
            <CardContent className="p-8">
              
              {/* Step 1: Business Niche */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <Building2 className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Qual é o seu nicho de negócio?</h2>
                    <p className="text-gray-600">Escolha a categoria que melhor representa seu negócio</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {NICHES.map((niche) => {
                      const Icon = niche.icon
                      const isSelected = data.businessNiche === niche.id
                      
                      return (
                        <Card 
                          key={niche.id} 
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                          }`}
                          onClick={() => loadNicheTemplate(niche.id)}
                        >
                          <CardContent className="p-6 text-center">
                            <div className={`p-3 rounded-lg inline-flex mb-4 ${niche.color}`}>
                              <Icon className="h-8 w-8" />
                            </div>
                            <h3 className="font-semibold mb-2">{niche.name}</h3>
                            <p className="text-sm text-gray-600">{niche.description}</p>
                            {isSelected && (
                              <CheckCircle className="h-6 w-6 text-blue-600 mx-auto mt-3" />
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Step 2: Business Information */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <Building2 className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Informações do seu negócio</h2>
                    <p className="text-gray-600">Conte-nos mais sobre sua empresa</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="businessName">Nome do Negócio *</Label>
                        <Input
                          id="businessName"
                          value={data.businessName}
                          onChange={(e) => updateData({ businessName: e.target.value })}
                          placeholder="Ex: Pizzaria do João"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="businessPhone">Telefone</Label>
                        <Input
                          id="businessPhone"
                          value={data.businessPhone}
                          onChange={(e) => updateData({ businessPhone: e.target.value })}
                          placeholder="(11) 99999-9999"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="businessWebsite">Site</Label>
                        <Input
                          id="businessWebsite"
                          value={data.businessWebsite}
                          onChange={(e) => updateData({ businessWebsite: e.target.value })}
                          placeholder="https://meusite.com.br"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="businessInfo">Descrição do Negócio *</Label>
                        <Textarea
                          id="businessInfo"
                          value={data.businessInfo}
                          onChange={(e) => updateData({ businessInfo: e.target.value })}
                          placeholder="Descreva seu negócio, produtos/serviços principais..."
                          className="h-32"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="businessAddress">Endereço</Label>
                        <Textarea
                          id="businessAddress"
                          value={data.businessAddress}
                          onChange={(e) => updateData({ businessAddress: e.target.value })}
                          placeholder="Rua, número, bairro, cidade..."
                          className="h-20"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Bot Personality */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <Palette className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Personalidade do Bot</h2>
                    <p className="text-gray-600">Como seu bot deve se comunicar com os clientes?</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PERSONALITIES.map((personality) => {
                      const Icon = personality.icon
                      const isSelected = data.personality === personality.id
                      
                      return (
                        <Card 
                          key={personality.id}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                          }`}
                          onClick={() => updateData({ personality: personality.id })}
                        >
                          <CardContent className="p-6">
                            <div className="flex items-start space-x-4">
                              <div className="p-3 bg-gray-100 rounded-lg">
                                <Icon className="h-6 w-6 text-gray-600" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <h3 className="font-semibold">{personality.name}</h3>
                                  {isSelected && <CheckCircle className="h-5 w-5 text-blue-600" />}
                                </div>
                                <p className="text-sm text-gray-600 mb-3">{personality.description}</p>
                                <div className="flex flex-wrap gap-1">
                                  {personality.traits.map((trait) => (
                                    <Badge key={trait} variant="secondary" className="text-xs">
                                      {trait}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Step 4: Message Templates */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <MessageSquare className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Mensagens do Bot</h2>
                    <p className="text-gray-600">Personalize as mensagens principais</p>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <Label htmlFor="welcomeMessage">Mensagem de Boas-vindas</Label>
                      <Textarea
                        id="welcomeMessage"
                        value={data.welcomeMessage}
                        onChange={(e) => updateData({ welcomeMessage: e.target.value })}
                        placeholder="Primeira mensagem que o cliente receberá..."
                        className="h-32"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use {'{businessName}'} para incluir o nome do seu negócio
                      </p>
                    </div>
                    
                    <div>
                      <Label htmlFor="offlineMessage">Mensagem de Ausência</Label>
                      <Textarea
                        id="offlineMessage"
                        value={data.offlineMessage}
                        onChange={(e) => updateData({ offlineMessage: e.target.value })}
                        placeholder="Mensagem enviada fora do horário de funcionamento..."
                        className="h-32"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use {'{workingHours}'} e {'{businessPhone}'} para incluir informações automáticas
                      </p>
                    </div>

                    {/* Working Hours */}
                    <div>
                      <Label>Horário de Funcionamento</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        {Object.entries(data.workingHours).map(([day, hours]) => {
                          const dayNames = {
                            monday: 'Segunda',
                            tuesday: 'Terça',
                            wednesday: 'Quarta',
                            thursday: 'Quinta',
                            friday: 'Sexta',
                            saturday: 'Sábado',
                            sunday: 'Domingo'
                          }

                          return (
                            <div key={day} className="flex items-center space-x-3 p-3 border rounded-lg">
                              <Switch
                                checked={hours.active}
                                onCheckedChange={(checked) => 
                                  updateData({
                                    workingHours: {
                                      ...data.workingHours,
                                      [day]: { ...hours, active: checked }
                                    }
                                  })
                                }
                              />
                              <span className="w-16 text-sm">{dayNames[day as keyof typeof dayNames]}</span>
                              {hours.active ? (
                                <>
                                  <Input
                                    type="time"
                                    value={hours.start}
                                    onChange={(e) => 
                                      updateData({
                                        workingHours: {
                                          ...data.workingHours,
                                          [day]: { ...hours, start: e.target.value }
                                        }
                                      })
                                    }
                                    className="w-24"
                                  />
                                  <span>às</span>
                                  <Input
                                    type="time"
                                    value={hours.end}
                                    onChange={(e) => 
                                      updateData({
                                        workingHours: {
                                          ...data.workingHours,
                                          [day]: { ...hours, end: e.target.value }
                                        }
                                      })
                                    }
                                    className="w-24"
                                  />
                                </>
                              ) : (
                                <span className="text-gray-500 text-sm">Fechado</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Features */}
              {currentStep === 5 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <Settings className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Recursos do Bot</h2>
                    <p className="text-gray-600">Configure as funcionalidades que deseja ativar</p>
                  </div>
                  
                  <div className="space-y-6">
                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold mb-1">Resposta Automática</h3>
                            <p className="text-sm text-gray-600">
                              Bot responde automaticamente usando IA
                            </p>
                          </div>
                          <Switch
                            checked={data.autoResponse}
                            onCheckedChange={(checked) => updateData({ autoResponse: checked })}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold mb-1">Transferência Humana</h3>
                            <p className="text-sm text-gray-600">
                              Permite transferir conversa para atendente humano
                            </p>
                          </div>
                          <Switch
                            checked={data.humanHandoff}
                            onCheckedChange={(checked) => updateData({ humanHandoff: checked })}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold mb-1">Captura de Leads</h3>
                            <p className="text-sm text-gray-600">
                              Coleta automaticamente dados dos contatos
                            </p>
                          </div>
                          <Switch
                            checked={data.leadCapture}
                            onCheckedChange={(checked) => updateData({ leadCapture: checked })}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Step 6: WhatsApp Connection */}
              {currentStep === 6 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <Smartphone className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Conectar WhatsApp</h2>
                    <p className="text-gray-600">Agora vamos conectar seu WhatsApp ao bot</p>
                  </div>
                  
                  <div className="text-center space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                      <QrCode className="h-24 w-24 text-yellow-600 mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">Pronto para conectar!</h3>
                      <p className="text-sm text-gray-600">
                        Após finalizar, você será direcionado para conectar seu WhatsApp via QR Code
                      </p>
                    </div>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                      <h4 className="font-semibold mb-2">Resumo da Configuração:</h4>
                      <div className="space-y-1 text-sm">
                        <p><strong>Nicho:</strong> {NICHES.find(n => n.id === data.businessNiche)?.name}</p>
                        <p><strong>Negócio:</strong> {data.businessName}</p>
                        <p><strong>Personalidade:</strong> {PERSONALITIES.find(p => p.id === data.personality)?.name}</p>
                        <p><strong>Recursos:</strong> 
                          {data.autoResponse && ' Resposta Automática'}
                          {data.humanHandoff && ', Transferência Humana'}
                          {data.leadCapture && ', Captura de Leads'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </CardContent>
            
            {/* Navigation */}
            <div className="border-t px-8 py-6">
              <div className="flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={prevStep}
                  disabled={currentStep === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Anterior
                </Button>
                
                <Button 
                  onClick={nextStep}
                  disabled={
                    (currentStep === 1 && !data.businessNiche) ||
                    (currentStep === 2 && (!data.businessName || !data.businessInfo)) ||
                    (currentStep === 3 && !data.personality) ||
                    loading
                  }
                >
                  {loading ? 'Finalizando...' : currentStep === 6 ? 'Finalizar' : 'Próximo'}
                  {currentStep < 6 && <ChevronRight className="h-4 w-4 ml-2" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
    </AuthGuard>
  )
}