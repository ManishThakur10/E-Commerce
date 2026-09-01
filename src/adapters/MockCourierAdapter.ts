import { CourierAdapter, CourierShipmentResponse, CourierTrackingResponse, CourierCancelResponse } from './CourierAdapter';
import { CreateOrderRequest, TrackingEvent } from '../types/dtos';
import { config } from '../config';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class MockCourierAdapter implements CourierAdapter {
  readonly name = 'mockcourier';
  private readonly delay: number;
  private readonly shipments: Map<string, any> = new Map();

  constructor() {
    this.delay = config.couriers.mockCourier.delay;
  }

  async authenticate(): Promise<void> {
    await this.simulateDelay();
    logger.info('MockCourier authenticated (simulated)');
  }

  async createShipment(order: CreateOrderRequest): Promise<CourierShipmentResponse> {
    await this.simulateDelay();
    
    logger.info('MockCourier creating shipment', { order_id: order.order_id });

    const courierOrderId = `MOCK-${uuidv4().substring(0, 8).toUpperCase()}`;
    const awbNumber = `AWB${Date.now()}`;

    const shipmentData = {
      courierOrderId,
      awbNumber,
      status: 'pending',
      order,
      events: [
        {
          status: 'pending',
          description: 'Shipment created',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    this.shipments.set(order.order_id, shipmentData);

    logger.info('MockCourier shipment created', {
      order_id: order.order_id,
      courier_order_id: courierOrderId,
    });

    return {
      courierOrderId,
      awbNumber,
      status: 'pending',
      estimatedDelivery: this.calculateEstimatedDelivery(),
      rawResponse: shipmentData,
    };
  }

  async trackShipment(orderId: string): Promise<CourierTrackingResponse> {
    await this.simulateDelay();
    
    logger.info('MockCourier tracking shipment', { order_id: orderId });

    const shipment = this.shipments.get(orderId);
    
    if (!shipment) {
      // Simulate a shipment in transit
      const mockEvents: TrackingEvent[] = [
        {
          status: 'pending',
          description: 'Shipment created',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          status: 'in_transit',
          description: 'Package picked up',
          location: 'Origin Hub',
          timestamp: new Date(Date.now() - 43200000).toISOString(),
        },
        {
          status: 'in_transit',
          description: 'In transit to destination',
          location: 'Regional Hub',
          timestamp: new Date().toISOString(),
        },
      ];

      return {
        currentStatus: 'in_transit',
        trackingHistory: mockEvents,
        rawResponse: { order_id: orderId, events: mockEvents },
      };
    }

    // Update shipment status simulation
    this.updateShipmentStatus(orderId, shipment);

    return {
      currentStatus: shipment.status,
      trackingHistory: shipment.events,
      rawResponse: shipment,
    };
  }

  async cancelShipment(orderId: string, courierOrderId: string): Promise<CourierCancelResponse> {
    await this.simulateDelay();
    
    logger.info('MockCourier cancelling shipment', {
      order_id: orderId,
      courier_order_id: courierOrderId,
    });

    const shipment = this.shipments.get(orderId);
    
    if (shipment) {
      shipment.status = 'cancelled';
      shipment.events.push({
        status: 'cancelled',
        description: 'Shipment cancelled by customer',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'cancelled',
      message: 'Shipment cancelled successfully',
      rawResponse: { order_id: orderId, courier_order_id: courierOrderId },
    };
  }

  private updateShipmentStatus(_orderId: string, shipment: any): void {
    const age = Date.now() - new Date(shipment.events[0].timestamp).getTime();
    const hours = age / (1000 * 60 * 60);

    if (hours > 72 && shipment.status !== 'delivered') {
      shipment.status = 'delivered';
      shipment.events.push({
        status: 'delivered',
        description: 'Package delivered successfully',
        location: 'Destination',
        timestamp: new Date().toISOString(),
      });
    } else if (hours > 48 && shipment.status === 'pending') {
      shipment.status = 'in_transit';
      shipment.events.push({
        status: 'in_transit',
        description: 'Package in transit',
        location: 'Regional Hub',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private calculateEstimatedDelivery(): string {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    return deliveryDate.toISOString().split('T')[0];
  }

  private simulateDelay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.delay));
  }
}
