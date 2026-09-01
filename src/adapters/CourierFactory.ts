import { CourierAdapter } from './CourierAdapter';
import { UrbaneBoltAdapter } from './UrbaneBoltAdapter';
import { MockCourierAdapter } from './MockCourierAdapter';
import { config } from '../config';
import logger from '../utils/logger';

class CourierFactory {
  private adapters: Map<string, CourierAdapter> = new Map();

  constructor() {
    this.registerAdapters();
  }

  private registerAdapters(): void {
    // Register UrbaneBolt
    this.adapters.set('urbanebolt', new UrbaneBoltAdapter());
    logger.info('Registered courier adapter: urbanebolt');

    // Register Mock Courier if enabled
    if (config.couriers.mockCourier.enabled) {
      this.adapters.set('mockcourier', new MockCourierAdapter());
      logger.info('Registered courier adapter: mockcourier');
    }

    // Future couriers can be registered here:
    // this.adapters.set('dhl', new DHLAdapter());
    // this.adapters.set('fedex', new FedExAdapter());
  }

  getAdapter(courierName: string): CourierAdapter {
    const adapter = this.adapters.get(courierName.toLowerCase());
    
    if (!adapter) {
      const supportedCouriers = Array.from(this.adapters.keys());
      throw new Error(
        `Unsupported courier: ${courierName}. Supported couriers: ${supportedCouriers.join(', ')}`
      );
    }

    return adapter;
  }

  getSupportedCouriers(): string[] {
    return Array.from(this.adapters.keys());
  }

  hasAdapter(courierName: string): boolean {
    return this.adapters.has(courierName.toLowerCase());
  }
}

export const courierFactory = new CourierFactory();
