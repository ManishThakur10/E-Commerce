import { CreateOrderRequest, TrackingEvent } from '../types/dtos';

// Courier adapter interface - all couriers must implement this
export interface CourierAdapter {
  readonly name: string;
  
  authenticate(): Promise<void>;
  
  createShipment(order: CreateOrderRequest): Promise<CourierShipmentResponse>;
  
  trackShipment(orderId: string): Promise<CourierTrackingResponse>;
  
  cancelShipment(orderId: string, courierOrderId: string): Promise<CourierCancelResponse>;
}

export interface CourierShipmentResponse {
  courierOrderId: string;
  awbNumber?: string;
  status: string;
  estimatedDelivery?: string;
  rawResponse: any;
}

export interface CourierTrackingResponse {
  currentStatus: string;
  trackingHistory: TrackingEvent[];
  rawResponse: any;
}

export interface CourierCancelResponse {
  status: string;
  message: string;
  rawResponse: any;
}

export class CourierError extends Error {
  constructor(
    message: string,
    public courierName: string,
    public originalError?: any,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'CourierError';
  }
}
