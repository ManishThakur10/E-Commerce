import { createOrderSchema, bulkOrderSchema } from '../../middleware/validation';

describe('Validation', () => {
  describe('createOrderSchema', () => {
    const validOrder = {
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
      },
    };

    it('should validate correct order', () => {
      const { error } = createOrderSchema.validate(validOrder);
      expect(error).toBeUndefined();
    });

    it('should reject missing order_id', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        order_id: undefined,
      });
      expect(error).toBeDefined();
    });

    it('should reject missing courier_partner', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        courier_partner: undefined,
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid weight', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        package: { ...validOrder.package, weight: -1 },
      });
      expect(error).toBeDefined();
    });

    it('should accept optional payment_mode', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        payment_mode: 'cod',
        cod_amount: 1000,
      });
      expect(error).toBeUndefined();
    });
  });

  describe('bulkOrderSchema', () => {
    const validOrder = {
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
      },
    };

    it('should validate bulk orders', () => {
      const { error } = bulkOrderSchema.validate({
        orders: [validOrder, { ...validOrder, order_id: 'TEST-002' }],
      });
      expect(error).toBeUndefined();
    });

    it('should reject empty orders array', () => {
      const { error } = bulkOrderSchema.validate({ orders: [] });
      expect(error).toBeDefined();
    });

    it('should reject more than 100 orders', () => {
      const orders = Array(101)
        .fill(null)
        .map((_, i) => ({ ...validOrder, order_id: `TEST-${i}` }));
      const { error } = bulkOrderSchema.validate({ orders });
      expect(error).toBeDefined();
    });
  });
});
