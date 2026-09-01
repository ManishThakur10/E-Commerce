import { database } from '../database/connection';
import { courierFactory } from '../adapters/CourierFactory';
import { CreateOrderRequest } from '../types/dtos';
import { orderQueue } from '../queue/orderQueue';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface Order {
  id?: number;
  order_id: string;
  courier_partner: string;
  courier_order_id?: string;
  awb_number?: string;
  status: string;
  request_payload?: any;
  response_payload?: any;
  error_message?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class OrderService {
  async createOrder(request: CreateOrderRequest): Promise<Order> {
    const { order_id, courier_partner } = request;

    try {
      // Check idempotency - order_id must be unique
      const existingOrder = await this.getOrderByOrderId(order_id);
      if (existingOrder) {
        logger.info('Duplicate order request, returning existing order', { order_id });
        return existingOrder;
      }

      // Validate courier
      if (!courierFactory.hasAdapter(courier_partner)) {
        throw new Error(
          `Unsupported courier: ${courier_partner}. Supported: ${courierFactory.getSupportedCouriers().join(', ')}`
        );
      }

      // Create order record with pending status
      const order: Order = {
        order_id,
        courier_partner,
        status: 'pending',
        request_payload: request,
      };

      await this.saveOrder(order);

      // Get courier adapter and create shipment
      const adapter = courierFactory.getAdapter(courier_partner);
      await adapter.authenticate();
      
      const shipmentResponse = await adapter.createShipment(request);

      // Update order with courier response
      order.courier_order_id = shipmentResponse.courierOrderId;
      order.awb_number = shipmentResponse.awbNumber;
      order.status = shipmentResponse.status;
      order.response_payload = shipmentResponse.rawResponse;

      await this.updateOrder(order_id, order);

      // Create initial tracking entry
      await this.addTrackingHistory(order_id, shipmentResponse.status, 'Shipment created', null, shipmentResponse.rawResponse);

      logger.info('Order created successfully', {
        order_id,
        courier_partner,
        courier_order_id: order.courier_order_id,
      });

      return order;
    } catch (error: any) {
      logger.error('Order creation failed', { order_id, error: error.message });

      // Update order with error
      await this.updateOrder(order_id, {
        status: 'failed',
        error_message: error.message,
      } as Order);

      throw error;
    }
  }

  async trackOrder(orderId: string): Promise<any> {
    const order = await this.getOrderByOrderId(orderId);
    
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    try {
      const adapter = courierFactory.getAdapter(order.courier_partner);
      await adapter.authenticate();
      
      const trackingResponse = await adapter.trackShipment(orderId);

      // Update order status
      await this.updateOrder(orderId, {
        status: trackingResponse.currentStatus,
      } as Order);

      // Add new tracking events
      for (const event of trackingResponse.trackingHistory) {
        await this.addTrackingHistory(
          orderId,
          event.status,
          event.description,
          event.location || null,
          { timestamp: event.timestamp }
        );
      }

      return {
        order_id: orderId,
        courier_partner: order.courier_partner,
        awb_number: order.awb_number,
        current_status: trackingResponse.currentStatus,
        tracking_history: trackingResponse.trackingHistory,
      };
    } catch (error: any) {
      logger.error('Order tracking failed', { order_id: orderId, error: error.message });
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<any> {
    const order = await this.getOrderByOrderId(orderId);
    
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (!order.courier_order_id) {
      throw new Error('Cannot cancel order: No courier order ID');
    }

    try {
      const adapter = courierFactory.getAdapter(order.courier_partner);
      await adapter.authenticate();
      
      const cancelResponse = await adapter.cancelShipment(orderId, order.courier_order_id);

      // Update order status
      await this.updateOrder(orderId, {
        status: cancelResponse.status,
      } as Order);

      // Add tracking event
      await this.addTrackingHistory(
        orderId,
        cancelResponse.status,
        cancelResponse.message,
        null,
        cancelResponse.rawResponse
      );

      return {
        order_id: orderId,
        courier_partner: order.courier_partner,
        status: cancelResponse.status,
        message: cancelResponse.message,
      };
    } catch (error: any) {
      logger.error('Order cancellation failed', { order_id: orderId, error: error.message });
      throw error;
    }
  }

  async createBulkOrders(orders: CreateOrderRequest[]): Promise<any> {
    const batchId = `BATCH-${uuidv4()}`;
    const totalOrders = orders.length;

    if (totalOrders > 100) {
      throw new Error('Bulk order limit exceeded. Maximum 100 orders per batch.');
    }

    try {
      // Create batch record
      await database.execute(
        `INSERT INTO bulk_batches (batch_id, total_orders, status) VALUES (?, ?, ?)`,
        [batchId, totalOrders, 'processing']
      );

      // Queue all orders for background processing
      for (const order of orders) {
        await orderQueue.add({
          orderId: order.order_id,
          batchId,
        });
      }

      logger.info('Bulk orders queued', { batch_id: batchId, total_orders: totalOrders });

      return {
        batch_id: batchId,
        total_orders: totalOrders,
        message: 'Orders are being processed asynchronously',
      };
    } catch (error: any) {
      logger.error('Bulk order creation failed', { batch_id: batchId, error: error.message });
      throw error;
    }
  }

  async getBatchStatus(batchId: string): Promise<any> {
    const [batch] = await database.query(
      `SELECT * FROM bulk_batches WHERE batch_id = ?`,
      [batchId]
    );

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    return batch;
  }

  async updateBatchProgress(batchId: string, success: boolean): Promise<void> {
    await database.execute(
      `UPDATE bulk_batches 
       SET processed_orders = processed_orders + 1,
           ${success ? 'successful_orders = successful_orders + 1' : 'failed_orders = failed_orders + 1'},
           status = IF(processed_orders + 1 >= total_orders, 'completed', 'processing'),
           updated_at = CURRENT_TIMESTAMP
       WHERE batch_id = ?`,
      [batchId]
    );
  }

  private async saveOrder(order: Order): Promise<void> {
    await database.execute(
      `INSERT INTO orders (order_id, courier_partner, status, request_payload) 
       VALUES (?, ?, ?, ?)`,
      [
        order.order_id,
        order.courier_partner,
        order.status,
        JSON.stringify(order.request_payload),
      ]
    );
  }

  private async updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.courier_order_id) {
      fields.push('courier_order_id = ?');
      values.push(updates.courier_order_id);
    }
    if (updates.awb_number) {
      fields.push('awb_number = ?');
      values.push(updates.awb_number);
    }
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.response_payload) {
      fields.push('response_payload = ?');
      values.push(JSON.stringify(updates.response_payload));
    }
    if (updates.error_message) {
      fields.push('error_message = ?');
      values.push(updates.error_message);
    }

    if (fields.length > 0) {
      values.push(orderId);
      await database.execute(
        `UPDATE orders SET ${fields.join(', ')} WHERE order_id = ?`,
        values
      );
    }
  }

  private async getOrderByOrderId(orderId: string): Promise<Order | null> {
    const rows = await database.query<Order>(
      `SELECT * FROM orders WHERE order_id = ? LIMIT 1`,
      [orderId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  private async addTrackingHistory(
    orderId: string,
    status: string,
    description: string,
    location: string | null,
    rawPayload: any
  ): Promise<void> {
    try {
      await database.execute(
        `INSERT INTO tracking_history (order_id, status, status_description, location, raw_payload) 
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, status, description, location, JSON.stringify(rawPayload)]
      );
    } catch (error: any) {
      // Ignore duplicate tracking entries
      if (error.code !== 'ER_DUP_ENTRY') {
        logger.error('Failed to add tracking history', { order_id: orderId, error: error.message });
      }
    }
  }
}

export const orderService = new OrderService();
