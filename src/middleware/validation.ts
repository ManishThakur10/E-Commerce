import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

export const createOrderSchema = Joi.object({
  order_id: Joi.string().required().max(100),
  courier_partner: Joi.string().required().max(50),
  pickup: Joi.object({
    name: Joi.string().required().max(100),
    phone: Joi.string().required().max(20),
    address: Joi.string().required().max(500),
    city: Joi.string().required().max(100),
    state: Joi.string().required().max(100),
    pincode: Joi.string().required().max(10),
  }).required(),
  delivery: Joi.object({
    name: Joi.string().required().max(100),
    phone: Joi.string().required().max(20),
    address: Joi.string().required().max(500),
    city: Joi.string().required().max(100),
    state: Joi.string().required().max(100),
    pincode: Joi.string().required().max(10),
  }).required(),
  package: Joi.object({
    weight: Joi.number().required().min(0.1).max(50),
    length: Joi.number().required().min(1).max(200),
    width: Joi.number().required().min(1).max(200),
    height: Joi.number().required().min(1).max(200),
    description: Joi.string().optional().max(500),
  }).required(),
  payment_mode: Joi.string().optional().valid('prepaid', 'cod'),
  cod_amount: Joi.number().optional().min(0),
});

export const bulkOrderSchema = Joi.object({
  orders: Joi.array()
    .items(createOrderSchema)
    .min(1)
    .max(100)
    .required(),
});

export function validateRequest(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details,
        },
      });
      return;
    }

    req.body = value;
    next();
  };
}
