import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'courier_db',
    user: process.env.DB_USER || 'courier_user',
    password: process.env.DB_PASSWORD || 'courier_password',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  
  couriers: {
    urbaneBolt: {
      baseUrl: process.env.URBANE_BOLT_BASE_URL || '',
      apiKey: process.env.URBANE_BOLT_API_KEY || '',
      timeout: parseInt(process.env.URBANE_BOLT_TIMEOUT || '10000', 10),
      retryCount: parseInt(process.env.URBANE_BOLT_RETRY_COUNT || '3', 10),
    },
    mockCourier: {
      enabled: process.env.MOCK_COURIER_ENABLED === 'true',
      delay: parseInt(process.env.MOCK_COURIER_DELAY || '500', 10),
    },
  },
};
