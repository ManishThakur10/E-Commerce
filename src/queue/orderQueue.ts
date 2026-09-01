import Queue from 'bull';
import { config } from '../config';
import logger from '../utils/logger';

export const orderQueue = new Queue('order-processing', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
  },
});

orderQueue.on('error', (error) => {
  logger.error('Queue error', { error });
});

orderQueue.on('failed', (job, error) => {
  logger.error('Job failed', {
    job_id: job.id,
    data: job.data,
    error,
  });
});

logger.info('Order queue initialized', {
  redis_host: config.redis.host,
  redis_port: config.redis.port,
});

export interface OrderJobData {
  orderId: string;
  batchId?: string;
}
