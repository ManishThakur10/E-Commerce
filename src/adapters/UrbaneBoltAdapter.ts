import axios, { AxiosInstance, AxiosError } from 'axios';
import { CourierAdapter, CourierShipmentResponse, CourierTrackingResponse, CourierCancelResponse, CourierError } from './CourierAdapter';
import { CreateOrderRequest, TrackingEvent } from '../types/dtos';
import { config } from '../config';
import logger, { sanitizeLog } from '../utils/logger';

interface UrbaneBoltAuthResponse {
  token?: string;
  access_token?: string;
}

interface UrbaneBoltShipmentResponse {
  order_id: string;
  awb_number?: string;
  status: string;
  estimated_delivery_date?: string;
}

export class UrbaneBoltAdapter implements CourierAdapter {
  readonly name = 'urbanebolt';
  private client: AxiosInstance;
  private authToken: string | null = null;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly retryCount: number;

  constructor() {
    this.baseUrl = config.couriers.urbaneBolt.baseUrl;
    this.apiKey = config.couriers.urbaneBolt.apiKey;
    this.timeout = config.couriers.urbaneBolt.timeout;
    this.retryCount = config.couriers.urbaneBolt.retryCount;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async authenticate(): Promise<void> {
    try {
      logger.info('Authenticating with UrbaneBolt...');
      
      const response = await this.client.post<UrbaneBoltAuthResponse>('/auth/login', {
        api_key: this.apiKey,
      });

      this.authToken = response.data.token || response.data.access_token || null;
      
      if (!this.authToken) {
        throw new Error('Authentication failed: No token received');
      }

      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;
      logger.info('UrbaneBolt authentication successful');
    } catch (error) {
      logger.error('UrbaneBolt authentication failed', { error: this.sanitizeError(error) });
      throw new CourierError('Authentication failed', this.name, error, true);
    }
  }

  async createShipment(order: CreateOrderRequest): Promise<CourierShipmentResponse> {
    return await this.withRetry(async () => {
      try {
        logger.info('Creating UrbaneBolt shipment', { order_id: order.order_id });

        // Transform unified order format to UrbaneBolt format
        const urbaneBoltRequest = this.transformToUrbaneBoltFormat(order);

        const response = await this.client.post<UrbaneBoltShipmentResponse>(
          '/shipments/create',
          urbaneBoltRequest
        );

        logger.info('UrbaneBolt shipment created', {
          order_id: order.order_id,
          courier_order_id: response.data.order_id,
        });

        return {
          courierOrderId: response.data.order_id,
          awbNumber: response.data.awb_number,
          status: this.normalizeStatus(response.data.status),
          estimatedDelivery: response.data.estimated_delivery_date,
          rawResponse: response.data,
        };
      } catch (error) {
        logger.error('UrbaneBolt shipment creation failed', {
          order_id: order.order_id,
          error: this.sanitizeError(error),
        });
        throw this.handleError(error);
      }
    });
  }

  async trackShipment(orderId: string): Promise<CourierTrackingResponse> {
    return await this.withRetry(async () => {
      try {
        logger.info('Tracking UrbaneBolt shipment', { order_id: orderId });

        const response = await this.client.get(`/shipments/${orderId}/track`);

        const trackingHistory: TrackingEvent[] = this.parseTrackingHistory(response.data);

        return {
          currentStatus: this.normalizeStatus(response.data.current_status || response.data.status),
          trackingHistory,
          rawResponse: response.data,
        };
      } catch (error) {
        logger.error('UrbaneBolt tracking failed', {
          order_id: orderId,
          error: this.sanitizeError(error),
        });
        throw this.handleError(error);
      }
    });
  }

  async cancelShipment(orderId: string, courierOrderId: string): Promise<CourierCancelResponse> {
    return await this.withRetry(async () => {
      try {
        logger.info('Cancelling UrbaneBolt shipment', {
          order_id: orderId,
          courier_order_id: courierOrderId,
        });

        const response = await this.client.post(`/shipments/${courierOrderId}/cancel`, {
          reason: 'Customer requested cancellation',
        });

        return {
          status: this.normalizeStatus(response.data.status || 'cancelled'),
          message: response.data.message || 'Shipment cancelled successfully',
          rawResponse: response.data,
        };
      } catch (error) {
        logger.error('UrbaneBolt cancellation failed', {
          order_id: orderId,
          courier_order_id: courierOrderId,
          error: this.sanitizeError(error),
        });
        throw this.handleError(error);
      }
    });
  }

  private transformToUrbaneBoltFormat(order: CreateOrderRequest): any {
    return {
      order_reference: order.order_id,
      pickup_details: {
        contact_name: order.pickup.name,
        contact_phone: order.pickup.phone,
        address_line: order.pickup.address,
        city: order.pickup.city,
        state: order.pickup.state,
        postal_code: order.pickup.pincode,
      },
      delivery_details: {
        contact_name: order.delivery.name,
        contact_phone: order.delivery.phone,
        address_line: order.delivery.address,
        city: order.delivery.city,
        state: order.delivery.state,
        postal_code: order.delivery.pincode,
      },
      package_details: {
        weight_kg: order.package.weight,
        dimensions: {
          length_cm: order.package.length,
          width_cm: order.package.width,
          height_cm: order.package.height,
        },
        description: order.package.description || 'Package',
      },
      payment_mode: order.payment_mode || 'prepaid',
      cod_amount: order.cod_amount || 0,
    };
  }

  private parseTrackingHistory(data: any): TrackingEvent[] {
    const events: TrackingEvent[] = [];
    
    if (data.tracking_events && Array.isArray(data.tracking_events)) {
      for (const event of data.tracking_events) {
        events.push({
          status: this.normalizeStatus(event.status),
          description: event.description || event.message || '',
          location: event.location,
          timestamp: event.timestamp || event.created_at || new Date().toISOString(),
        });
      }
    } else if (data.status) {
      events.push({
        status: this.normalizeStatus(data.status),
        description: data.status_description || data.message || '',
        location: data.location,
        timestamp: data.updated_at || new Date().toISOString(),
      });
    }

    return events;
  }

  private normalizeStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'created': 'pending',
      'pending': 'pending',
      'picked_up': 'in_transit',
      'in_transit': 'in_transit',
      'out_for_delivery': 'out_for_delivery',
      'delivered': 'delivered',
      'cancelled': 'cancelled',
      'failed': 'failed',
      'returned': 'returned',
    };

    return statusMap[status.toLowerCase()] || status;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        if (attempt > 1) {
          logger.info(`Retry attempt ${attempt}/${this.retryCount}`, { courier: this.name });
        }
        return await operation();
      } catch (error) {
        lastError = error;

        if (error instanceof CourierError && !error.isRetryable) {
          throw error;
        }

        if (attempt === this.retryCount) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.warn(`Operation failed, retrying in ${delay}ms`, {
          attempt,
          courier: this.name,
        });
        await this.sleep(delay);

        // Re-authenticate if auth error
        if (this.isAuthError(error)) {
          await this.authenticate();
        }
      }
    }

    throw lastError;
  }

  private handleError(error: any): CourierError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const isRetryable = !status || status >= 500 || status === 429 || axiosError.code === 'ECONNABORTED';

      return new CourierError(
        axiosError.message || 'UrbaneBolt API error',
        this.name,
        error,
        isRetryable
      );
    }

    return new CourierError(
      error.message || 'Unknown error',
      this.name,
      error,
      false
    );
  }

  private isAuthError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      return error.response?.status === 401 || error.response?.status === 403;
    }
    return false;
  }

  private sanitizeError(error: any): any {
    return sanitizeLog(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
