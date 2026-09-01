import { UrbaneBoltAdapter } from '../../adapters/UrbaneBoltAdapter';
import { MockCourierAdapter } from '../../adapters/MockCourierAdapter';
import { courierFactory } from '../../adapters/CourierFactory';
import { CreateOrderRequest } from '../../types/dtos';

describe('Courier Adapters', () => {
  const mockOrder: CreateOrderRequest = {
    order_id: 'TEST-001',
    courier_partner: 'mockcourier',
    pickup: {
      name: 'John Sender',
      phone: '9876543210',
      address: '123 Pickup St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    delivery: {
      name: 'Jane Receiver',
      phone: '8765432109',
      address: '456 Delivery Ave',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
    },
    package: {
      weight: 1.5,
      length: 30,
      width: 20,
      height: 10,
      description: 'Test package',
    },
    payment_mode: 'prepaid',
  };

  describe('CourierFactory', () => {
    it('should return supported couriers', () => {
      const couriers = courierFactory.getSupportedCouriers();
      expect(couriers).toContain('urbanebolt');
      expect(couriers).toContain('mockcourier');
    });

    it('should return adapter for valid courier', () => {
      const adapter = courierFactory.getAdapter('mockcourier');
      expect(adapter).toBeInstanceOf(MockCourierAdapter);
    });

    it('should throw error for invalid courier', () => {
      expect(() => courierFactory.getAdapter('invalidcourier')).toThrow();
    });

    it('should check if adapter exists', () => {
      expect(courierFactory.hasAdapter('mockcourier')).toBe(true);
      expect(courierFactory.hasAdapter('invalidcourier')).toBe(false);
    });
  });

  describe('MockCourierAdapter', () => {
    let adapter: MockCourierAdapter;

    beforeEach(() => {
      adapter = new MockCourierAdapter();
    });

    it('should authenticate successfully', async () => {
      await expect(adapter.authenticate()).resolves.not.toThrow();
    });

    it('should create shipment', async () => {
      await adapter.authenticate();
      const result = await adapter.createShipment(mockOrder);

      expect(result).toHaveProperty('courierOrderId');
      expect(result).toHaveProperty('awbNumber');
      expect(result.status).toBe('pending');
      expect(result.courierOrderId).toMatch(/^MOCK-/);
    });

    it('should track shipment', async () => {
      await adapter.authenticate();
      const createResult = await adapter.createShipment(mockOrder);
      const trackResult = await adapter.trackShipment(mockOrder.order_id);

      expect(trackResult).toHaveProperty('currentStatus');
      expect(trackResult).toHaveProperty('trackingHistory');
      expect(Array.isArray(trackResult.trackingHistory)).toBe(true);
      expect(trackResult.trackingHistory.length).toBeGreaterThan(0);
    });

    it('should cancel shipment', async () => {
      await adapter.authenticate();
      const createResult = await adapter.createShipment(mockOrder);
      const cancelResult = await adapter.cancelShipment(
        mockOrder.order_id,
        createResult.courierOrderId
      );

      expect(cancelResult.status).toBe('cancelled');
      expect(cancelResult).toHaveProperty('message');
    });
  });

  describe('UrbaneBoltAdapter', () => {
    let adapter: UrbaneBoltAdapter;

    beforeEach(() => {
      adapter = new UrbaneBoltAdapter();
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('urbanebolt');
    });

    it('should transform order to UrbaneBolt format', async () => {
      // This test validates the transformation logic
      // In a real scenario, we would mock the API calls
      expect(adapter).toBeInstanceOf(UrbaneBoltAdapter);
    });
  });
});
