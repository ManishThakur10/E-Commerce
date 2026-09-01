// DTOs for unified API
export interface CreateOrderRequest {
  order_id: string;
  courier_partner: string;
  pickup: {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  delivery: {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  package: {
    weight: number;
    length: number;
    width: number;
    height: number;
    description?: string;
  };
  payment_mode?: string;
  cod_amount?: number;
}

export interface CreateOrderResponse {
  success: boolean;
  data?: {
    order_id: string;
    courier_partner: string;
    courier_order_id: string;
    awb_number?: string;
    status: string;
    estimated_delivery?: string;
  };
  error?: ErrorResponse;
}

export interface TrackOrderResponse {
  success: boolean;
  data?: {
    order_id: string;
    courier_partner: string;
    awb_number?: string;
    current_status: string;
    tracking_history: TrackingEvent[];
  };
  error?: ErrorResponse;
}

export interface TrackingEvent {
  status: string;
  description: string;
  location?: string;
  timestamp: string;
}

export interface CancelOrderResponse {
  success: boolean;
  data?: {
    order_id: string;
    courier_partner: string;
    status: string;
    message: string;
  };
  error?: ErrorResponse;
}

export interface BulkOrderRequest {
  orders: CreateOrderRequest[];
}

export interface BulkOrderResponse {
  success: boolean;
  data?: {
    batch_id: string;
    total_orders: number;
    message: string;
  };
  error?: ErrorResponse;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
  };
}
