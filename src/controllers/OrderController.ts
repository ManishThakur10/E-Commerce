import { Request, Response, NextFunction } from 'express';
import { orderService } from '../services/OrderService';
import { CreateOrderRequest, BulkOrderRequest } from '../types/dtos';
import logger from '../utils/logger';

export class OrderController {
  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderRequest: CreateOrderRequest = req.body;
      const order = await orderService.createOrder(orderRequest);

      res.status(201).json({
        success: true,
        data: {
          order_id: order.order_id,
          courier_partner: order.courier_partner,
          courier_order_id: order.courier_order_id,
          awb_number: order.awb_number,
          status: order.status,
        },
      });
    } catch (error: any) {
      logger.error('Create order error', { error: error.message });
      error.statusCode = 400;
      error.code = 'ORDER_CREATION_FAILED';
      next(error);
    }
  }

  async trackOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { order_id } = req.params;
      const trackingData = await orderService.trackOrder(order_id);

      res.status(200).json({
        success: true,
        data: trackingData,
      });
    } catch (error: any) {
      logger.error('Track order error', { error: error.message });
      error.statusCode = error.message.includes('not found') ? 404 : 400;
      error.code = 'ORDER_TRACKING_FAILED';
      next(error);
    }
  }

  async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { order_id } = req.params;
      const cancelData = await orderService.cancelOrder(order_id);

      res.status(200).json({
        success: true,
        data: cancelData,
      });
    } catch (error: any) {
      logger.error('Cancel order error', { error: error.message });
      error.statusCode = error.message.includes('not found') ? 404 : 400;
      error.code = 'ORDER_CANCELLATION_FAILED';
      next(error);
    }
  }

  async createBulkOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const bulkRequest: BulkOrderRequest = req.body;
      const bulkData = await orderService.createBulkOrders(bulkRequest.orders);

      res.status(202).json({
        success: true,
        data: bulkData,
      });
    } catch (error: any) {
      logger.error('Bulk order error', { error: error.message });
      error.statusCode = 400;
      error.code = 'BULK_ORDER_FAILED';
      next(error);
    }
  }

  async getBatchStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { batch_id } = req.params;
      const batchData = await orderService.getBatchStatus(batch_id);

      res.status(200).json({
        success: true,
        data: batchData,
      });
    } catch (error: any) {
      logger.error('Get batch status error', { error: error.message });
      error.statusCode = error.message.includes('not found') ? 404 : 400;
      error.code = 'BATCH_STATUS_FAILED';
      next(error);
    }
  }
}

export const orderController = new OrderController();
