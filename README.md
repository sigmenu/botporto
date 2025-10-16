# 🤖 WhatsApp Bot SaaS Platform

Uma plataforma SaaS completa e pronta para produção para criar e gerenciar bots de WhatsApp com inteligência artificial avançada.

## 📋 Índice

- [Características](#-características)
- [Tecnologias](#-tecnologias)
- [Arquitetura](#-arquitetura)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Uso](#-uso)
- [Status Atual](#-status-atual)
- [API Reference](#-api-reference)
- [Deploy](#-deploy)
- [Contribuição](#-contribuição)
- [Licença](#-licença)

## ✨ Características

### 🚀 Core Features
- **Multi-sessões WhatsApp**: Gerencie múltiplas contas simultâneas
- **IA Avançada**: Integração com **GPT-4o-mini** (padrão), GPT-3.5, GPT-4o e Claude
- **Seleção de Modelos IA**: Escolha entre diferentes modelos via dashboard
- **Sistema de Restaurantes**: Gestão completa de cardápios, horários e promoções
- **Processamento de Mídia**: Áudio (Whisper) e imagem (GPT-4 Vision) com IA
- **Respostas Automáticas**: Sistema inteligente de auto-resposta

### 🔧 Funcionalidades Avançadas
- **🎵 Transcrição de Áudio**: Whisper API para converter voz em texto (português)
- **🖼️ Análise de Imagens**: GPT-4 Vision para identificar comidas, ler menus e responder sobre fotos
- **📊 Gestão de Restaurantes**: Cardápios digitais, promoções recorrentes, horário de funcionamento
- **🤖 Personalidades de IA**: 6 tipos (Amigável, Casual, Inteligente, Vendedor, Profissional, Gourmet)
- **⏰ Promoções Inteligentes**: Sistema automático baseado em dias da semana
- **🚫 Contatos Excluídos**: Sistema para pausar respostas para números específicos

### 📊 Analytics e Gestão
- **Dashboard Completo**: 5 abas (Dashboard, Restaurant Info, AI Config, Excluded Contacts, Promotions)
- **Sistema de Webhooks**: Integração com sistemas externos
- **Rate Limiting**: Controle de uso por cliente
- **Multi-idiomas**: PT-BR (foco no mercado brasileiro)
- **Sistema de Assinaturas**: Planos e billing

## 🛠 Tecnologias

### Backend
- **Node.js** + **TypeScript** + **Express**
- **Baileys** - WhatsApp Web API
- **Prisma ORM** + **PostgreSQL**
- **Redis** - Cache e filas
- **Bull** - Queue system
- **Socket.IO** - Tempo real
- **JWT** - Autenticação

### Frontend
- **Next.js 14** + **App Router**
- **TypeScript** + **Tailwind CSS**
- **Shadcn/ui** - Componentes
- **Zustand** - State management
- **React Query** - Data fetching
- **Socket.IO Client** - Real-time

### IA e Integrações
- **OpenAI API** (GPT-4o-mini, GPT-4o, GPT-3.5, Whisper, Vision)
- **Anthropic Claude API**
- **Configuração de Modelos IA**: Seleção dinâmica via dashboard
- **Media Processing**: Form-data para uploads de mídia
- **Stripe** - Pagamentos
- **Winston** - Logging

### DevOps
- **Docker** + **Docker Compose**
- **Nginx** - Load balancer/proxy
- **PM2** - Process management
- **GitHub Actions** - CI/CD

## 🏗 Arquitetura

```
whatsapp-bot-saas/
├── backend/           # API Node.js + Express
│   ├── media-service.js      # Processamento de áudio/imagem
│   ├── openai-service.js     # Integração OpenAI com contexto
│   ├── whatsapp-enhanced.js  # WhatsApp com suporte a mídia
│   ├── server-with-auth.js   # API REST completa
│   ├── prisma/
│   │   └── schema.prisma     # Models: Restaurant, MenuItem, Promotion, etc.
│   ├── temp/                 # Storage temporário para mídia
│   └── test-*.js            # Scripts de teste
├── frontend/         # Dashboard Next.js
│   ├── app/
│   │   └── dashboard/
│   │       └── page.tsx     # Dashboard com 5 abas principais
│   ├── components/          # Componentes React
│   └── lib/                # Utilitários
├── docs/             # Documentação técnica
└── README.md         # Este arquivo
```

## 🚀 Instalação

### Pré-requisitos
- Node.js 18+
- Docker e Docker Compose
- PostgreSQL 15+
- Redis 7+

### 1. Clone o Repositório
```bash
git clone https://github.com/seu-usuario/whatsapp-bot-saas.git
cd whatsapp-bot-saas
```

### 2. Configuração das Variáveis de Ambiente
```bash
# Copie os arquivos de exemplo
cp .env.example .env

# Configure as variáveis necessárias no .env
```

### 3. Instalação com Docker (Recomendado)
```bash
# Subir todos os serviços
docker-compose up -d

# Verificar status
docker-compose ps
```

### 4. Instalação Manual

#### Backend
```bash
cd backend
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## ⚙️ Configuração

### Variáveis de Ambiente Essenciais

#### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/whatsapp_bot_saas

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=seu-jwt-secret-super-seguro

# OpenAI
OPENAI_API_KEY=sk-sua-chave-openai

# Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-sua-chave-anthropic

# Stripe
STRIPE_SECRET_KEY=sk_test_sua-chave-stripe
STRIPE_PUBLISHABLE_KEY=pk_test_sua-chave-stripe

# URLs
API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Configuração do Banco de Dados
```bash
# Executar migrações
cd backend
npx prisma migrate dev

# (Opcional) Seed inicial
npx prisma db seed
```

## 📱 Uso

### 1. Acessar a Plataforma
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/health

### 2. Criar Conta
1. Registre-se em `/register`
2. Confirme o email (se configurado)
3. Acesse o dashboard

### 3. Configurar WhatsApp
1. Crie uma nova sessão
2. Escaneie o QR Code com WhatsApp
3. Configure personalidade e templates

### 4. Templates Disponíveis

#### 🍕 Restaurante (IMPLEMENTADO)
- **Cardápio Digital Completo**: Categorias, preços, ingredientes, tempo de preparo
- **Promoções Inteligentes**: Sistema recorrente (ex: "Quarta da Pizza")
- **Horário de Funcionamento**: Configuração por dia da semana
- **Informações de Entrega**: Taxa, pedido mínimo, URLs de delivery
- **Análise de Imagens**: Cliente fotografa comida e IA identifica
- **Transcrição de Áudio**: Cliente pergunta por voz sobre o menu
- **6 Personalidades de IA**: Amigável, Vendedor, Gourmet, etc.

#### 🛒 E-commerce
- Catálogo de produtos
- Carrinho de compras
- Status de pedidos
- Suporte ao cliente

#### 🏥 Saúde
- Agendamento de consultas
- Lembretes de medicação
- Informações médicas
- Confirmação de consultas

#### 🏠 Imobiliária
- Listagem de imóveis
- Agendamento de visitas
- Informações de propriedades
- Contato com corretores

#### 🎓 Educação
- Informações de cursos
- Processo de matrícula
- Cronograma de aulas
- Suporte acadêmico

## 🎯 Status Atual

### ✅ Funcionalidades Implementadas e Testadas

#### 🤖 Sistema de IA Avançado
- **GPT-4o-mini**: Configurado como modelo padrão (melhor custo-benefício)
- **Seleção de Modelos**: Dashboard permite escolha entre GPT-4o-mini, GPT-3.5-turbo e GPT-4o
- **6 Personalidades**: Amigável, Casual, Inteligente, Vendedor, Profissional, Gourmet
- **Controle de Resposta**: Curta, Média ou Longa
- **Configuração Dinâmica**: Mudança sem reinicialização

#### 🍕 Sistema de Restaurantes COMPLETO
- **Gestão de Informações**: Nome, endereço, telefone, horários
- **Cardápio Digital**: Categorias, preços, ingredientes, tempo de preparo, alérgenos
- **Promoções Inteligentes**: Sistema recorrente baseado em dias da semana
- **Integração com IA**: Contexto automático em todas as respostas
- **URLs de Delivery**: iFood, Uber Eats, links de reserva

#### 🎵🖼️ Processamento de Mídia COMPLETO
- **Transcrição de Áudio**: OpenAI Whisper para português brasileiro
- **Análise de Imagens**: GPT-4 Vision para identificar comidas e ler menus
- **Controle por Usuário**: Toggle individual para áudio e imagem
- **Avisos de Custo**: Transparência sobre custos adicionais da API
- **Casos de Uso**: Exemplos específicos para restaurantes

#### 📱 WhatsApp Integration
- **QR Code Generation**: ✅ Funcionando corretamente após correções
- **Session Management**: ✅ Limpeza automática de sessões corrompidas
- **Connection Status**: ✅ Monitoramento em tempo real
- **Media Processing**: ✅ Suporte a áudio e imagem integrado
- **Message Processing**: ✅ Integrado com sistema de IA e contexto de restaurante

#### 🎛️ Dashboard Completo (5 Abas)
- **Dashboard**: Status geral e WhatsApp connection
- **Restaurant Info**: Gestão completa de informações do restaurante
- **AI Config**: Personalidade, mídia processing, treinamento de IA
- **Excluded Contacts**: Sistema para pausar respostas
- **Promotions**: Gestão de promoções com recorrência

### 🔧 Componentes Técnicos

#### Backend Services
- `media-service.js`: ✅ Processamento completo de áudio/imagem com OpenAI
- `openai-service.js`: ✅ Sistema de IA com contexto de restaurante e personalidades
- `whatsapp-enhanced.js`: ✅ WhatsApp com detecção e processamento de mídia
- `server-with-auth.js`: ✅ API REST com endpoints de restaurante e mídia
- `prisma/schema.prisma`: ✅ Models completos (Restaurant, MenuItem, Promotion, etc.)

#### Frontend Components
- `app/dashboard/page.tsx`: ✅ Dashboard com 5 abas e controles de mídia
- Sistema de Autenticação: ✅ Login/registro funcional
- Real-time Updates: ✅ Status WhatsApp e configurações

#### Banco de Dados (PostgreSQL)
- **User**: Gestão de usuários
- **Restaurant**: Informações completas do restaurante
- **MenuItem**: Cardápio com categorias, preços, ingredientes
- **Promotion**: Sistema de promoções com recorrência
- **BotConfig**: IA settings + media processing toggles
- **AITraining**: Exemplos de treinamento customizados
- **ExcludedContact**: Lista de contatos pausados

### 🚀 Próximos Passos Recomendados
1. **E-commerce Template**: Expandir para outros nichos além de restaurantes
2. **Analytics Avançado**: Métricas de uso de mídia e efetividade
3. **Integrações**: APIs de delivery (iFood, Uber Eats)
4. **Multi-idiomas**: Expandir suporte além do português
5. **White-label**: Sistema de rebranding para revendedores

### ✨ Funcionalidades Implementadas Recentemente (2025)
- ✅ **Sistema de Restaurantes**: Gestão completa de cardápios e promoções
- ✅ **Processamento de Áudio**: Whisper API para transcrição em português
- ✅ **Análise de Imagens**: GPT-4 Vision para identificar comidas e ler menus
- ✅ **Personalidades de IA**: 6 tipos diferentes de atendimento
- ✅ **Promoções Inteligentes**: Sistema automático baseado em dias da semana
- ✅ **Controles de Mídia**: Dashboard com toggles e avisos de custo
- ✅ **Contatos Excluídos**: Sistema para pausar respostas específicas

## 📚 API Reference

### Autenticação
```bash
# Registrar usuário
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Nome Usuario"
}

# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

# Perfil do usuário
GET /api/auth/me
Authorization: Bearer <token>
```

### Sessões WhatsApp
```bash
# Listar sessões
GET /api/sessions
Authorization: Bearer <token>

# Criar sessão
POST /api/sessions
{
  "name": "Minha Sessão",
  "templateId": "template-id",
  "language": "pt-BR"
}

# Conectar sessão
POST /api/sessions/:id/connect

# Obter QR Code
GET /api/sessions/:id/qr
```

### Mensagens
```bash
# Enviar mensagem
POST /api/messages/send
{
  "sessionId": "session-id",
  "phoneNumber": "5511999999999",
  "content": "Olá! Como posso ajudar?"
}

# Listar mensagens
GET /api/messages?sessionId=session-id&page=1&limit=50

# Criar broadcast
POST /api/messages/broadcast
{
  "sessionId": "session-id",
  "name": "Promoção Black Friday",
  "content": "🔥 Black Friday chegou!",
  "contacts": ["contact-id-1", "contact-id-2"]
}
```

### Restaurantes
```bash
# Configurar informações do restaurante
POST /api/restaurant/info
{
  "name": "Pizzaria Bella Vista",
  "address": "Rua das Flores, 123",
  "phone": "(11) 99999-9999",
  "businessHours": {
    "monday": {"open": "18:00", "close": "23:00"},
    "sunday": {"closed": true}
  },
  "deliveryFee": 5.50,
  "minOrderValue": 25.00
}

# Adicionar item ao menu
POST /api/restaurant/menu
{
  "name": "Pizza Margherita",
  "description": "Massa artesanal, molho de tomate...",
  "price": 35.90,
  "category": "Pizzas",
  "preparationTime": 25,
  "ingredients": ["massa", "molho", "mozzarella"]
}

# Criar promoção
POST /api/restaurant/promotions
{
  "title": "Quarta da Pizza",
  "description": "30% de desconto em todas as pizzas",
  "discountType": "PERCENTAGE",
  "discountValue": 30,
  "isRecurring": true,
  "recurringDays": [3]
}

# Buscar promoções ativas
GET /api/restaurant/promotions/active?userId=user-id
```

### Configuração de IA
```bash
# Configurar IA e processamento de mídia
POST /api/bot/config
{
  "personality": "friendly",
  "responseLength": "medium",
  "audioProcessing": true,
  "imageProcessing": true,
  "userId": "user-id"
}
```

### Contatos Excluídos
```bash
# Adicionar contato à lista de exclusão
POST /api/excluded-contacts
{
  "phoneNumber": "5511888888888",
  "reason": "Cliente solicitou pausa",
  "userId": "user-id"
}

# Listar contatos excluídos
GET /api/excluded-contacts?userId=user-id
```

### Webhooks
```bash
# Configurar webhook
POST /api/webhooks
{
  "name": "Meu Webhook",
  "url": "https://meusite.com/webhook",
  "events": ["message.received", "session.connected"]
}
```

## 🚀 Deploy

### Deploy com Docker
```bash
# Produção
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Deploy Manual

#### Backend
```bash
cd backend
npm run build
pm2 start ecosystem.config.js
```

#### Frontend
```bash
cd frontend
npm run build
npm start
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
    }
}
```

### SSL com Let's Encrypt
```bash
# Instalar certbot
apt install certbot python3-certbot-nginx

# Obter certificado
certbot --nginx -d seu-dominio.com
```

## 🔒 Segurança

### Medidas Implementadas
- Rate limiting por endpoint
- Validação de entrada rigorosa
- Sanitização de dados
- Headers de segurança
- JWT com refresh tokens
- Blacklist de tokens
- Criptografia de dados sensíveis

### Recomendações
- Use HTTPS em produção
- Mantenha dependências atualizadas
- Configure firewall adequadamente
- Monitore logs regularmente
- Implemente backup automático

## 📊 Monitoramento

### Logs
```bash
# Visualizar logs backend
docker logs whatsapp-bot-backend -f

# Visualizar logs frontend
docker logs whatsapp-bot-frontend -f
```

### Health Checks
- Backend: `/health`
- Métricas: `/metrics`
- Status: `/status`

### Prometheus + Grafana (Opcional)
Configure monitoramento avançado com as imagens Docker incluídas.

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch: `git checkout -b feature/nova-feature`
3. Commit suas mudanças: `git commit -m 'Adiciona nova feature'`
4. Push para a branch: `git push origin feature/nova-feature`
5. Abra um Pull Request

### Padrões de Código
- Use TypeScript
- Siga ESLint config
- Escreva testes
- Documente funções
- Commits em português

## 📝 Changelog

### v2.0.0 (2025-01-20) - 🍕 Sistema de Restaurantes + Mídia
- **🍕 Sistema de Restaurantes COMPLETO**: Gestão de cardápios, horários, promoções
- **🎵 Processamento de Áudio**: OpenAI Whisper para transcrição em português
- **🖼️ Análise de Imagens**: GPT-4 Vision para identificar comidas e ler menus
- **🤖 6 Personalidades de IA**: Amigável, Casual, Inteligente, Vendedor, Profissional, Gourmet
- **⏰ Promoções Inteligentes**: Sistema recorrente baseado em dias da semana
- **🚫 Contatos Excluídos**: Sistema para pausar respostas específicas
- **📊 Dashboard 5 Abas**: Restaurant Info, AI Config, Excluded Contacts, Promotions
- **💰 Controles de Custo**: Avisos sobre custos de processamento de mídia
- **🗄️ Database Schema**: 7 novos models (Restaurant, MenuItem, Promotion, etc.)

### v1.1.0 (2025-01-09) - 🚀 Atualizações de IA
- **🧠 Atualização do Modelo IA**: Migração para GPT-4o-mini como padrão
- **⚡ Seleção de Modelos**: Dashboard com opções GPT-4o-mini, GPT-3.5-turbo e GPT-4o
- **🔧 Configuração Dinâmica**: Gestão de modelos IA via bot-config-service
- **🐛 Correções de QR Code**: Resolução de timeouts na geração de QR
- **📊 Melhor Debugging**: Logging aprimorado para sessões WhatsApp
- **🔄 Session Management**: Limpeza automática de sessões corrompidas

### v1.0.0 (2024-01-01) - Lançamento Inicial
- ✨ Lançamento inicial da plataforma
- 🤖 Integração com Baileys WhatsApp
- 🧠 IA com OpenAI e Claude
- 🎨 Dashboard básico
- 🐳 Docker support
- 📊 Sistema de analytics base

## 📄 Licença

Este projeto está licenciado sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## 🆘 Suporte

### Problemas Comuns

#### WhatsApp não conecta
1. **QR Code inválido ou timeout**:
   ```bash
   # Limpe as sessões corrompidas
   rm -rf backend/baileys_sessions
   
   # Reinicie o servidor
   npm restart
   
   # Gere novo QR code
   curl -X GET "http://localhost:3001/api/whatsapp/qr"
   ```

2. **Sessão corrompida**: O sistema agora limpa automaticamente sessões corrompidas
3. **Cache de browser**: Limpe o cache do navegador se o QR não aparecer

#### Erro de banco de dados
1. Verifique conexão PostgreSQL
2. Execute migrações: `npx prisma migrate deploy`
3. Reinicie os serviços

#### IA não responde
1. **Verificação de API Keys**:
   ```bash
   # Verifique se as chaves estão configuradas
   echo $OPENAI_API_KEY
   ```

2. **Seleção de Modelo**: 
   - Acesse Dashboard → Configurar Bot → Modelo de IA
   - Teste diferentes modelos (GPT-4o-mini recomendado)

3. **Limites de API**: Confirme cotas das APIs OpenAI/Anthropic

4. **Logs de Debug**:
   ```bash
   # Veja logs em tempo real
   docker logs whatsapp-bot-backend -f
   ```

### Contato
- 📧 Email: suporte@whatsappbotsaas.com
- 💬 Discord: [Nossa Comunidade](https://discord.gg/whatsappbotsaas)
- 📚 Docs: [docs.whatsappbotsaas.com](https://docs.whatsappbotsaas.com)

---

<div align="center">
  <p>Feito com ❤️ para a comunidade open source</p>
  <p>⭐ Se este projeto te ajudou, considere dar uma estrela!</p>
</div>