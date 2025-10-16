'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bot, MessageSquare, Zap, Users, BarChart3, Globe } from 'lucide-react'
import Link from 'next/link'

export default function HomePage() {
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (user) {
      router.push('/dashboard')
    }
  }, [user, router])

  const features = [
    {
      icon: Bot,
      title: 'IA Avançada',
      description: 'Integração com GPT-4, Claude e Whisper para conversas inteligentes'
    },
    {
      icon: MessageSquare,
      title: 'Multi-sessões',
      description: 'Gerencie múltiplas contas do WhatsApp em uma única plataforma'
    },
    {
      icon: Zap,
      title: 'Automação',
      description: 'Respostas automáticas, agendamento e broadcasts inteligentes'
    },
    {
      icon: Users,
      title: 'CRM Integrado',
      description: 'Gestão completa de contatos com tags e campos personalizados'
    },
    {
      icon: BarChart3,
      title: 'Analytics',
      description: 'Relatórios detalhados e métricas de desempenho em tempo real'
    },
    {
      icon: Globe,
      title: 'Multi-idioma',
      description: 'Suporte a português, inglês e espanhol com IA personalizada'
    }
  ]

  const plans = [
    {
      name: 'Gratuito',
      price: 'R$ 0',
      period: '/mês',
      features: ['100 mensagens/mês', '1 sessão WhatsApp', '50 contatos', 'Suporte por email'],
      popular: false
    },
    {
      name: 'Básico',
      price: 'R$ 47',
      period: '/mês',
      features: ['2.000 mensagens/mês', '3 sessões WhatsApp', '500 contatos', 'Templates de IA', 'Suporte prioritário'],
      popular: true
    },
    {
      name: 'Profissional',
      price: 'R$ 97',
      period: '/mês',
      features: ['10.000 mensagens/mês', '10 sessões WhatsApp', '2.000 contatos', 'API completa', 'Webhooks', 'Suporte 24/7'],
      popular: false
    },
    {
      name: 'Enterprise',
      price: 'R$ 297',
      period: '/mês',
      features: ['Mensagens ilimitadas', 'Sessões ilimitadas', 'Contatos ilimitados', 'White-label', 'Gerente dedicado'],
      popular: false
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Bot className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">WhatsApp Bot SaaS</h1>
          </div>
          <div className="space-x-4">
            <Link href="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/signup">
              <Button>Começar Grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <Badge variant="secondary" className="mb-4">
            🚀 Plataforma SaaS Completa
          </Badge>
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Automatize seu WhatsApp<br />
            com <span className="text-blue-600">Inteligência Artificial</span>
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Crie bots inteligentes para WhatsApp com IA avançada, templates por nicho de negócio 
            e ferramentas profissionais de gestão e analytics.
          </p>
          <div className="space-x-4">
            <Link href="/signup">
              <Button size="lg" className="px-8">
                Começar Grátis Agora
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="px-8">
                Fazer Login
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-white">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">
              Tudo que você precisa para automatizar
            </h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Nossa plataforma oferece todas as ferramentas necessárias para criar e gerenciar 
              bots de WhatsApp profissionais com IA.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="h-full">
                <CardHeader>
                  <feature.icon className="h-10 w-10 text-blue-600 mb-4" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">
              Planos para todos os tamanhos
            </h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Escolha o plano ideal para seu negócio. Comece grátis e escale conforme cresce.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {plans.map((plan, index) => (
              <Card key={index} className={`relative h-full ${plan.popular ? 'ring-2 ring-blue-600' : ''}`}>
                {plan.popular && (
                  <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    Mais Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-center">
                    <div className="text-2xl font-bold">{plan.name}</div>
                    <div className="text-3xl font-bold text-blue-600 mt-2">
                      {plan.price}<span className="text-sm text-gray-600">{plan.period}</span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center text-sm">
                        <span className="w-2 h-2 bg-blue-600 rounded-full mr-3"></span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.price === 'R$ 0' ? '/signup' : '/signup'}>
                    <Button 
                      className="w-full" 
                      variant={plan.popular ? 'default' : 'outline'}
                    >
                      {plan.price === 'R$ 0' ? 'Começar Grátis' : 'Escolher Plano'}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Bot className="h-8 w-8" />
            <h4 className="text-2xl font-bold">WhatsApp Bot SaaS</h4>
          </div>
          <p className="text-gray-400 mb-8">
            A plataforma mais completa para automatizar seu WhatsApp com IA.
          </p>
          <div className="border-t border-gray-800 pt-8">
            <p className="text-gray-500">
              © 2024 WhatsApp Bot SaaS. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}