import { database } from './database/connection';
import { orderQueue, OrderJobData } from './queue/orderQueue';
import { orderService } from './services/OrderService';
import logger from './utils/logger';
import { Job } from 'bull';

async function processOrder(job: Job<OrderJobData>): Promise<void> {
  const { orderId, batchId } = job.data;

  logger.info('Processing order job', {
    job_id: job.id,
    order_id: orderId,
    batch_id: batchId,
  });

  try {
    // Get order details
    const [order] = await database.query(
      `SELECT * FROM orders WHERE order_id = ? LIMIT 1`,
      [orderId]
    );

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Process order
    const orderRequest = typeof order.request_payload === 'string' 
      ? JSON.parse(order.request_payload) 
      : order.request_payload;

    await orderService.createOrder(orderRequest);

    // Update batch progress if part of bulk
    if (batchId) {
      await orderService.updateBatchProgress(batchId, true);
    }

    logger.info('Order job completed successfully', {
      job_id: job.id,
      order_id: orderId,
    });
  } catch (error: any) {
    logger.error('Order job failed', {
      job_id: job.id,
      order_id: orderId,
      error: error.message,
    });

    // Update batch progress if part of bulk
    if (batchId) {
      await orderService.updateBatchProgress(batchId, false);
    }

    throw error;
  }
}

async function startWorker(): Promise<void> {
  try {
    // Connect to database
    await database.connect();
    logger.info('Worker database connected');

    // Process jobs
    orderQueue.process(5, async (job: Job<OrderJobData>) => {
      return await processOrder(job);
    });

    logger.info('Worker started, processing jobs...');

    orderQueue.on('completed', (job) => {
      logger.info('Job completed', { job_id: job.id });
    });

    orderQueue.on('failed', (job, error) => {
      logger.error('Job failed', {
        job_id: job.id,
        error: error.message,
      });
    });
  } catch (error) {
    logger.error('Failed to start worker', { error });
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Worker received ${signal}, starting graceful shutdown...`);

  try {
    await orderQueue.close();
    logger.info('Queue closed');

    await database.close();
    logger.info('Database connection closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during worker shutdown', { error });
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start worker
startWorker();
