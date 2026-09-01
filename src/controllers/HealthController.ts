import { Request, Response } from 'express';
import { database } from '../database/connection';
import Redis from 'redis';
import { config } from '../config';
import logger from '../utils/logger';

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const health: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'disconnected',
      redis: 'disconnected',
    },
  };

  try {
    // Check database
    await database.query('SELECT 1');
    health.services.database = 'connected';
  } catch (error) {
    logger.error('Database health check failed', { error });
    health.status = 'unhealthy';
  }

  try {
    // Check Redis
    const redisClient = Redis.createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
    });
    await redisClient.connect();
    await redisClient.ping();
    await redisClient.quit();
    health.services.redis = 'connected';
  } catch (error) {
    logger.error('Redis health check failed', { error });
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
}
