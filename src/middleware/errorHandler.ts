import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const requestId = uuidv4();
  req.headers['x-request-id'] = requestId;

  logger.info('Incoming request', {
    request_id: requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  next();
}

export function errorHandler(err: ApiError, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string;

  logger.error('Request error', {
    request_id: requestId,
    error: err.message,
    stack: err.stack,
  });

  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details: err.details,
    },
    request_id: requestId,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] as string;

  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
    },
    request_id: requestId,
  });
}
