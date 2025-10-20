# Usar Debian (glibc) para compatibilidade de Prisma com OpenSSL
FROM node:18-bullseye-slim AS base

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependências
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Gerar Prisma Client antes do build para tipos atualizados
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:18-bullseye-slim AS production

# Instalar utilitários necessários (curl para healthcheck e openssl para engines do Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Criar diretórios e ajustar permissões antes de trocar para o usuário 'node'
RUN mkdir -p /app/sessions /app/logs && chown -R node:node /app

# Usar usuário 'node' já presente na imagem oficial
USER node

# Copiar arquivos necessários com permissões do usuário 'node'
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/prisma ./prisma

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]