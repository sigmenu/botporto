import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redis: Redis;

export const initializeRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redis = new Redis(redisUrl, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    } as any);
    
    redis.on('connect', () => {
      logger.info('Conectado ao Redis');
    });
    
    redis.on('error', (error) => {
      logger.error('Erro no Redis:', error);
    });
    
    redis.on('close', () => {
      logger.warn('Conexão com Redis fechada');
    });
    
    // Testar conexão
    await redis.ping();
    
  } catch (error) {
    logger.error('Erro ao conectar no Redis:', error);
    throw error;
  }
};

export const getRedis = (): Redis => {
  if (!redis) {
    throw new Error('Redis não inicializado');
  }
  return redis;
};

// Funções utilitárias para cache
export const cacheService = {
  // Armazenar dados com TTL
  set: async (key: string, value: any, ttl: number = 3600): Promise<void> => {
    const client = getRedis();
    await client.setex(key, ttl, JSON.stringify(value));
  },
  
  // Recuperar dados do cache
  get: async (key: string): Promise<any> => {
    const client = getRedis();
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  },
  
  // Deletar chave
  del: async (key: string): Promise<void> => {
    const client = getRedis();
    await client.del(key);
  },
  
  // Verificar se existe
  exists: async (key: string): Promise<boolean> => {
    const client = getRedis();
    const result = await client.exists(key);
    return result === 1;
  },
  
  // Incrementar contador
  incr: async (key: string): Promise<number> => {
    const client = getRedis();
    return await client.incr(key);
  },
  
  // Definir TTL em chave existente
  expire: async (key: string, ttl: number): Promise<void> => {
    const client = getRedis();
    await client.expire(key, ttl);
  },
  
  // Obter todas as chaves com padrão
  keys: async (pattern: string): Promise<string[]> => {
    const client = getRedis();
    return await client.keys(pattern);
  },
  
  // Hash operations
  hset: async (key: string, field: string, value: any): Promise<void> => {
    const client = getRedis();
    await client.hset(key, field, JSON.stringify(value));
  },
  
  hget: async (key: string, field: string): Promise<any> => {
    const client = getRedis();
    const data = await client.hget(key, field);
    return data ? JSON.parse(data) : null;
  },
  
  hgetall: async (key: string): Promise<Record<string, any>> => {
    const client = getRedis();
    const data = await client.hgetall(key);
    const result: Record<string, any> = {};
    
    for (const [field, value] of Object.entries(data)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }
    
    return result;
  },
  
  hdel: async (key: string, field: string): Promise<void> => {
    const client = getRedis();
    await client.hdel(key, field);
  },
};