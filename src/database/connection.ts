import mysql from 'mysql2/promise';
import { config } from '../config';
import logger from '../utils/logger';

class Database {
  private pool: mysql.Pool | null = null;

  async connect(): Promise<void> {
    try {
      this.pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });

      // Test connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      logger.info('Database connected successfully', {
        host: config.database.host,
        database: config.database.name,
      });
    } catch (error) {
      logger.error('Database connection failed', { error });
      throw error;
    }
  }

  getPool(): mysql.Pool {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.pool;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const pool = this.getPool();
    const [rows] = await pool.execute(sql, params);
    return rows as T[];
  }

  async execute(sql: string, params?: any[]): Promise<any> {
    const pool = this.getPool();
    return await pool.execute(sql, params);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }
}

export const database = new Database();
