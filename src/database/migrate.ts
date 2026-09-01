import { database } from './connection';
import logger from '../utils/logger';

const migrations = [
  {
    name: '001_create_orders_table',
    up: `
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(100) UNIQUE NOT NULL,
        courier_partner VARCHAR(50) NOT NULL,
        courier_order_id VARCHAR(100),
        awb_number VARCHAR(100),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        request_payload JSON,
        response_payload JSON,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_courier_partner (courier_partner),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    name: '002_create_tracking_history_table',
    up: `
      CREATE TABLE IF NOT EXISTS tracking_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        status_description TEXT,
        location VARCHAR(255),
        raw_payload JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    name: '003_create_bulk_batches_table',
    up: `
      CREATE TABLE IF NOT EXISTS bulk_batches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(100) UNIQUE NOT NULL,
        total_orders INT NOT NULL DEFAULT 0,
        processed_orders INT NOT NULL DEFAULT 0,
        successful_orders INT NOT NULL DEFAULT 0,
        failed_orders INT NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'processing',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_batch_id (batch_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
];

export async function runMigrations(): Promise<void> {
  try {
    await database.connect();
    
    logger.info('Starting database migrations...');
    
    // First, ensure migrations table exists
    try {
      await database.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    } catch (error) {
      logger.error('Failed to create migrations table', { error });
      throw error;
    }
    
    for (const migration of migrations) {
      try {
        const existingRows = await database.query(
          'SELECT * FROM migrations WHERE name = ?',
          [migration.name]
        );
        
        if (existingRows.length === 0) {
          logger.info(`Running migration: ${migration.name}`);
          await database.execute(migration.up);
          await database.execute(
            'INSERT INTO migrations (name) VALUES (?)',
            [migration.name]
          );
          logger.info(`Migration completed: ${migration.name}`);
        } else {
          logger.debug(`Migration already applied: ${migration.name}`);
        }
      } catch (error) {
        logger.error(`Migration ${migration.name} failed`, { error });
        throw error;
      }
    }
    
    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', { error });
    throw error;
  }
}

// Allow running migrations directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations finished');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration process failed', { error });
      process.exit(1);
    });
}
