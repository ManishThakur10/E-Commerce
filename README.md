# Multi-Courier Integration Platform

A production-quality backend system that provides a unified API for integrating multiple courier/logistics providers. Built with clean architecture principles and a pluggable adapter pattern that allows adding new couriers without modifying core business logic.

## Overview

This platform abstracts away courier-specific complexities and provides a single, normalized API for:
- Creating shipments across multiple couriers
- Tracking shipments in real-time
- Cancelling orders
- Processing bulk orders asynchronously

## Architecture

The system follows **Clean Architecture** and **SOLID** principles with a pluggable **Adapter/Strategy Pattern** for courier integrations.

```
┌─────────────────────────────────────────────────────────┐
│                      REST API Layer                      │
│         (Express Controllers + Routes + DTOs)            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   Business Logic Layer                   │
│              (Order Service + Validation)                │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Courier Adapter Interface                   │
│         (authenticate, create, track, cancel)            │
└─────┬──────────────────────────────────────┬───────────┘
      │                                       │
┌─────▼─────────┐                  ┌─────────▼──────────┐
│  UrbaneBolt   │                  │   Mock Courier     │
│    Adapter    │                  │     Adapter        │
└───────────────┘                  └────────────────────┘
```

## Technology Stack

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MySQL 8.x (in Docker)
- **Cache/Queue**: Redis 7 (in Docker)
- **Queue Processing**: Bull
- **Validation**: Joi
- **Testing**: Jest
- **Containerization**: Docker + Docker Compose
- **ORM**: Native MySQL2 driver with connection pooling

## Prerequisites

- Docker
- Docker Compose
- (Optional) MySQL Workbench for database inspection

**Note**: You do NOT need Node.js, MySQL, or Redis installed locally. Everything runs in Docker.

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:

```env
# Application
NODE_ENV=development
PORT=3000

# Database (MySQL in Docker)
DB_HOST=mysql
DB_PORT=3306
DB_NAME=courier_db
DB_USER=courier_user
DB_PASSWORD=courier_password

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# UrbaneBolt Configuration
URBANE_BOLT_BASE_URL=https://uat-api.urbanebolt.com
URBANE_BOLT_API_KEY=your_api_key_here
URBANE_BOLT_TIMEOUT=10000
URBANE_BOLT_RETRY_COUNT=3

# Mock Courier (for testing)
MOCK_COURIER_ENABLED=true
MOCK_COURIER_DELAY=500
```

## Quick Start

### 1. Start the Complete System

```bash
docker compose -p courier-assignment up --build
```

This starts:
- MySQL database (internal port 3306)
- Redis (internal port 6379)
- Backend API (http://localhost:3001)
- Background Worker

### 2. Verify Services are Running

```bash
docker compose -p courier-assignment ps
```

You should see 4 services running:
- `courier-mysql`
- `courier-redis`
- `courier-backend`
- `courier-worker`

### 3. Check Health

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-09-01T10:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

## API Endpoints

### 1. Create Order

**POST** `/api/v1/orders`

```bash
curl -X POST http://localhost:3001/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ORD-12345",
    "courier_partner": "mockcourier",
    "pickup": {
      "name": "John Sender",
      "phone": "9876543210",
      "address": "123 Pickup Street, Building A",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    },
    "delivery": {
      "name": "Jane Receiver",
      "phone": "8765432109",
      "address": "456 Delivery Avenue, Flat 5B",
      "city": "Delhi",
      "state": "Delhi",
      "pincode": "110001"
    },
    "package": {
      "weight": 1.5,
      "length": 30,
      "width": 20,
      "height": 10,
      "description": "Electronics - Smartphone"
    },
    "payment_mode": "prepaid"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "ORD-12345",
    "courier_partner": "mockcourier",
    "courier_order_id": "MOCK-A1B2C3D4",
    "awb_number": "AWB1725184800000",
    "status": "pending"
  }
}
```

### 2. Track Order

**GET** `/api/v1/orders/{order_id}/track`

```bash
curl http://localhost:3001/api/v1/orders/ORD-12345/track
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "ORD-12345",
    "courier_partner": "mockcourier",
    "awb_number": "AWB1725184800000",
    "current_status": "in_transit",
    "tracking_history": [
      {
        "status": "pending",
        "description": "Shipment created",
        "timestamp": "2026-09-01T10:00:00.000Z"
      },
      {
        "status": "in_transit",
        "description": "Package picked up",
        "location": "Origin Hub",
        "timestamp": "2026-09-01T12:00:00.000Z"
      }
    ]
  }
}
```

### 3. Cancel Order

**POST** `/api/v1/orders/{order_id}/cancel`

```bash
curl -X POST http://localhost:3001/api/v1/orders/ORD-12345/cancel
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "ORD-12345",
    "courier_partner": "mockcourier",
    "status": "cancelled",
    "message": "Shipment cancelled successfully"
  }
}
```

### 4. Bulk Orders

**POST** `/api/v1/orders/bulk`

```bash
curl -X POST http://localhost:3001/api/v1/orders/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [
      {
        "order_id": "BULK-001",
        "courier_partner": "mockcourier",
        "pickup": { ... },
        "delivery": { ... },
        "package": { ... }
      },
      {
        "order_id": "BULK-002",
        "courier_partner": "urbanebolt",
        "pickup": { ... },
        "delivery": { ... },
        "package": { ... }
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "batch_id": "BATCH-550e8400-e29b-41d4-a716-446655440000",
    "total_orders": 2,
    "message": "Orders are being processed asynchronously"
  }
}
```

### 5. Check Batch Status

**GET** `/api/v1/batches/{batch_id}`

```bash
curl http://localhost:3001/api/v1/batches/BATCH-550e8400-e29b-41d4-a716-446655440000
```

## Docker Commands

### Start Services
```bash
docker compose -p courier-assignment up --build
```

### Start in Background
```bash
docker compose -p courier-assignment up -d --build
```

### Stop Services
```bash
docker compose -p courier-assignment down
```

### View Logs
```bash
# All services
docker compose -p courier-assignment logs -f

# Specific service
docker compose -p courier-assignment logs -f backend
docker compose -p courier-assignment logs -f worker
docker compose -p courier-assignment logs -f mysql
```

### Check Status
```bash
docker compose -p courier-assignment ps
```

### Rebuild Services
```bash
docker compose -p courier-assignment up --build --force-recreate
```

### Remove Everything (including volumes)
```bash
docker compose -p courier-assignment down -v
```

## Database Access

The MySQL database is isolated inside Docker. To access it:

```bash
docker exec -it courier-mysql mysql -u courier_user -pcourier_password courier_db
```

Or use MySQL Workbench with:
- **Host**: localhost
- **Port**: 3306 (or 3307 if exposed)
- **Username**: courier_user
- **Password**: courier_password
- **Database**: courier_db

## Running Tests

### Inside Docker
```bash
docker compose -p courier-assignment exec backend npm test
```

### Locally (requires Node.js)
```bash
npm install
npm test
```

## Database Migrations

Migrations run automatically when the backend starts. To run manually:

```bash
docker compose -p courier-assignment exec backend npm run migrate
```

## Adding a New Courier

To add a new courier (e.g., "FedEx"):

1. **Create Adapter**: `src/adapters/FedExAdapter.ts`

```typescript
import { CourierAdapter, CourierShipmentResponse, CourierTrackingResponse, CourierCancelResponse } from './CourierAdapter';

export class FedExAdapter implements CourierAdapter {
  readonly name = 'fedex';
  
  async authenticate(): Promise<void> {
    // FedEx authentication logic
  }
  
  async createShipment(order: CreateOrderRequest): Promise<CourierShipmentResponse> {
    // Transform unified order to FedEx format
    // Call FedEx API
    // Transform FedEx response to unified format
  }
  
  async trackShipment(orderId: string): Promise<CourierTrackingResponse> {
    // FedEx tracking logic
  }
  
  async cancelShipment(orderId: string, courierOrderId: string): Promise<CourierCancelResponse> {
    // FedEx cancellation logic
  }
}
```

2. **Register Adapter**: `src/adapters/CourierFactory.ts`

```typescript
import { FedExAdapter } from './FedExAdapter';

private registerAdapters(): void {
  this.adapters.set('urbanebolt', new UrbaneBoltAdapter());
  this.adapters.set('mockcourier', new MockCourierAdapter());
  this.adapters.set('fedex', new FedExAdapter()); // Add this line
}
```

3. **Add Configuration**: `.env`

```env
FEDEX_BASE_URL=https://api.fedex.com
FEDEX_API_KEY=your_key
FEDEX_TIMEOUT=10000
```

4. **No changes required to**:
   - Controllers
   - Routes
   - DTOs
   - Business logic
   - Database schema

## Project Structure

```
.
├── src/
│   ├── adapters/              # Courier adapter implementations
│   │   ├── CourierAdapter.ts  # Interface definition
│   │   ├── CourierFactory.ts  # Adapter registry
│   │   ├── UrbaneBoltAdapter.ts
│   │   └── MockCourierAdapter.ts
│   ├── config/                # Configuration
│   │   └── index.ts
│   ├── controllers/           # Request handlers
│   │   ├── OrderController.ts
│   │   └── HealthController.ts
│   ├── database/              # Database connection & migrations
│   │   ├── connection.ts
│   │   └── migrate.ts
│   ├── middleware/            # Express middleware
│   │   ├── validation.ts
│   │   └── errorHandler.ts
│   ├── queue/                 # Background job queue
│   │   └── orderQueue.ts
│   ├── routes/                # API routes
│   │   └── index.ts
│   ├── services/              # Business logic
│   │   └── OrderService.ts
│   ├── types/                 # TypeScript types & DTOs
│   │   └── dtos.ts
│   ├── utils/                 # Utilities
│   │   └── logger.ts
│   ├── __tests__/             # Tests
│   ├── index.ts               # Application entry point
│   └── worker.ts              # Background worker
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example
├── .gitignore
├── .dockerignore
├── README.md
└── DESIGN.md
```

## Troubleshooting

### Port 3001 already in use
```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9

# Or change the port in docker-compose.yml
ports:
  - "3002:3000"  # Changed from 3001
```

### Database connection failed
```bash
# Check MySQL is healthy
docker compose -p courier-assignment logs mysql

# Restart services
docker compose -p courier-assignment restart mysql backend
```

### Redis connection failed
```bash
# Check Redis is healthy
docker compose -p courier-assignment logs redis

# Restart services
docker compose -p courier-assignment restart redis backend worker
```

### Worker not processing jobs
```bash
# Check worker logs
docker compose -p courier-assignment logs -f worker

# Restart worker
docker compose -p courier-assignment restart worker
```

### Migrations not running
```bash
# Run manually
docker compose -p courier-assignment exec backend npm run migrate
```

### Clean slate (reset everything)
```bash
# Stop and remove all containers, networks, and volumes
docker compose -p courier-assignment down -v

# Rebuild and start
docker compose -p courier-assignment up --build
```

## Security Considerations

- ✅ All secrets in environment variables (not committed)
- ✅ `.env` in `.gitignore`
- ✅ Input validation on all endpoints
- ✅ SQL injection protection (parameterized queries)
- ✅ Sensitive data redacted from logs
- ✅ Non-root user in Docker containers
- ✅ Request size limits
- ✅ Structured error responses (no sensitive data leakage)

## Features

- ✅ **Unified API**: Single API for multiple couriers
- ✅ **Pluggable Architecture**: Add new couriers without changing core logic
- ✅ **Idempotency**: Duplicate order_id requests handled gracefully
- ✅ **Async Processing**: Bulk orders processed in background
- ✅ **Retry Logic**: Automatic retry with exponential backoff
- ✅ **Tracking History**: Append-only audit trail
- ✅ **Error Handling**: Normalized error responses
- ✅ **Health Checks**: Monitor system health
- ✅ **Graceful Shutdown**: Clean resource cleanup
- ✅ **Structured Logging**: JSON logs with request IDs
- ✅ **Docker Isolation**: Complete containerization
- ✅ **Comprehensive Tests**: Unit and integration tests

## License

ISC

## Author

Interview Assignment - Multi-Courier Integration Platform
