import { Router } from 'express';
import { orderController } from '../controllers/OrderController';
import { healthCheck } from '../controllers/HealthController';
import { validateRequest } from '../middleware/validation';
import { createOrderSchema, bulkOrderSchema } from '../middleware/validation';

const router = Router();

// Health check
router.get('/health', healthCheck);

// Order routes
router.post(
  '/api/v1/orders',
  validateRequest(createOrderSchema),
  (req, res, next) => orderController.createOrder(req, res, next)
);

router.get(
  '/api/v1/orders/:order_id/track',
  (req, res, next) => orderController.trackOrder(req, res, next)
);

router.post(
  '/api/v1/orders/:order_id/cancel',
  (req, res, next) => orderController.cancelOrder(req, res, next)
);

router.post(
  '/api/v1/orders/bulk',
  validateRequest(bulkOrderSchema),
  (req, res, next) => orderController.createBulkOrders(req, res, next)
);

router.get(
  '/api/v1/batches/:batch_id',
  (req, res, next) => orderController.getBatchStatus(req, res, next)
);

export default router;
