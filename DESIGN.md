# Design Document: Multi-Courier Integration Platform

## 1. High-Level Architecture

The system is built on **Clean Architecture** principles with clear separation of concerns across multiple layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│              (Express, Routes, Controllers)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Application Layer                          │
│         (Business Logic, Validation, DTOs)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Domain Layer                              │
│         (Courier Adapter Interface, Models)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                 Infrastructure Layer                         │
│         (Database, Redis, External APIs)                     │
└──────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions:

1. **Layered Architecture**: Each layer depends only on the layer below it
2. **Dependency Inversion**: Business logic depends on abstractions (interfaces), not concrete implementations
3. **Single Responsibility**: Each module has one reason to change
4. **Open/Closed Principle**: Open for extension (new couriers), closed for modification (existing code)

## 2. Courier Adapter Pattern

### Why the Adapter Pattern?

The **Adapter/Strategy Pattern** was chosen to solve the core challenge: integrating multiple courier APIs with different request/response formats while providing a unified API to consumers.

### Benefits:

1. **Pluggability**: New couriers can be added without modifying existing code
2. **Testability**: Each adapter can be tested independently
3. **Maintainability**: Courier-specific logic is isolated
4. **Scalability**: Easy to support dozens of couriers
5. **Flexibility**: Each adapter handles its own authentication, retry logic, and transformations

### Pattern Structure:

```typescript
// Abstract interface - all adapters must implement
interface CourierAdapter {
  name: string;
  authenticate(): Promise<void>;
  createShipment(order: CreateOrderRequest): Promise<CourierShipmentResponse>;
  trackShipment(orderId: string): Promise<CourierTrackingResponse>;
  cancelShipment(orderId: string, courierOrderId: string): Promise<CourierCancelResponse>;
}

// Concrete implementations
class UrbaneBoltAdapter implements CourierAdapter { ... }
class MockCourierAdapter implements CourierAdapter { ... }
class FedExAdapter implements CourierAdapter { ... }

// Factory for adapter selection
class CourierFactory {
  private adapters: Map<string, CourierAdapter>;
  
  getAdapter(courierName: string): CourierAdapter {
    return this.adapters.get(courierName);
  }
}
```

### Data Flow:

1. **Consumer → Unified Request**: Client sends normalized order request
2. **Factory → Adapter Selection**: CourierFactory selects appropriate adapter based on `courier_partner`
3. **Adapter → Transformation**: Adapter transforms unified request to courier-specific format
4. **Adapter → API Call**: Adapter calls courier's API
5. **Adapter → Normalization**: Adapter transforms courier response to unified format
6. **Business Logic → Consumer**: Normalized response returned to consumer

### Adding a New Courier:

```
Steps:
1. Create new adapter class implementing CourierAdapter
2. Register in CourierFactory
3. Add configuration in .env

NO changes needed to:
- Controllers
- Routes
- DTOs
- OrderService
- Database schema
```

## 3. Database Schema

### orders Table

```sql
CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(100) UNIQUE NOT NULL,      -- Client-provided unique ID
  courier_partner VARCHAR(50) NOT NULL,        -- Courier name
  courier_order_id VARCHAR(100),               -- Courier's internal ID
  awb_number VARCHAR(100),                     -- Airway Bill Number
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  request_payload JSON,                        -- Original request
  response_payload JSON,                       -- Courier's response
  error_message TEXT,                          -- Error details if failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_order_id (order_id),
  INDEX idx_courier_partner (courier_partner),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

**Design Choices:**
- `order_id` is the client-provided idempotency key (UNIQUE constraint)
- JSON columns store raw payloads for debugging and audit
- Indexes on commonly queried columns
- Timestamps for audit trail

### tracking_history Table

```sql
CREATE TABLE tracking_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  status_description TEXT,
  location VARCHAR(255),
  raw_payload JSON,                            -- Raw tracking event
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_id (order_id),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);
```

**Design Choices:**
- **Append-only**: No updates, only inserts (audit requirement)
- Captures complete tracking history
- Foreign key ensures referential integrity
- Each tracking update creates a new record

### bulk_batches Table

```sql
CREATE TABLE bulk_batches (
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
);
```

**Design Choices:**
- Tracks bulk order batch progress
- Counters for monitoring success/failure rates
- Status transitions: processing → completed

## 4. Bulk Order Processing

### Problem Statement:

Processing 100 orders synchronously in a single HTTP request would:
- Take several minutes (timeout)
- Block the API server
- Provide no progress feedback
- Fail all orders if one fails

### Solution: Asynchronous Processing with Redis Queue

```
┌────────────┐
│  API POST  │
│ /bulk      │
└─────┬──────┘
      │
      ▼
┌─────────────────┐
│ Validate Orders │
└─────┬───────────┘
      │
      ▼
┌──────────────────┐
│ Create Batch     │
│ Return batch_id  │
└─────┬────────────┘
      │
      ▼
┌──────────────────┐       ┌─────────────┐
│ Queue 100 Jobs   │──────▶│ Redis Queue │
│ in Redis         │       └──────┬──────┘
└──────────────────┘              │
                                  │
                      ┌───────────▼───────────┐
                      │  Background Worker    │
                      │  (processes 5 jobs    │
                      │   concurrently)       │
                      └───────────┬───────────┘
                                  │
                  ┌───────────────┼───────────────┐
                  │               │               │
                  ▼               ▼               ▼
          ┌───────────┐   ┌───────────┐   ┌───────────┐
          │ UrbaneBolt│   │MockCourier│   │  FedEx    │
          │  API Call │   │  API Call │   │  API Call │
          └───────────┘   └───────────┘   └───────────┘
```

### Architecture Components:

1. **API Handler**:
   - Validates all orders
   - Creates batch record
   - Enqueues jobs to Redis
   - Returns `batch_id` immediately (202 Accepted)

2. **Redis Queue (Bull)**:
   - Persistent job queue
   - Retry failed jobs
   - Concurrency control (5 concurrent workers)

3. **Background Worker**:
   - Polls Redis queue
   - Processes orders independently
   - Updates batch progress
   - Handles partial success/failure

4. **Batch Tracking**:
   - Client can poll `/api/v1/batches/{batch_id}` for progress
   - Real-time counters: total, processed, successful, failed

### Trade-offs:

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Synchronous** | Simple, immediate results | Timeout, blocking, all-or-nothing | ❌ Rejected |
| **Asynchronous (Redis)** | Fast response, scalable, partial success | Additional complexity, polling required | ✅ **Selected** |
| **Webhooks** | No polling needed | Requires client webhook endpoint | ❌ Out of scope |

## 5. Idempotency

### Challenge:

Network issues can cause duplicate requests. Creating the same order twice would:
- Charge the customer twice
- Create duplicate shipments
- Cause inventory issues

### Solution: Database-Level Idempotency

```typescript
// 1. Client provides unique order_id
{
  "order_id": "ORD-12345",  // Idempotency key
  ...
}

// 2. Database enforces uniqueness
CREATE UNIQUE INDEX ON orders(order_id);

// 3. Application checks before insert
const existing = await getOrderByOrderId(order_id);
if (existing) {
  return existing;  // Return existing order, don't create new one
}

// 4. Insert with race condition protection
try {
  await insert(order);
} catch (DuplicateKeyError) {
  return await getOrderByOrderId(order_id);
}
```

### Race Condition Handling:

Two concurrent requests with same `order_id`:

```
Request A                  Request B
    |                          |
    ├─ Check exists? No        ├─ Check exists? No
    ├─ Insert                  ├─ Insert
    └─ SUCCESS                 └─ DUPLICATE KEY ERROR
                                  └─ Fetch and return existing
```

The database UNIQUE constraint ensures exactly one order is created, even under concurrent requests.

## 6. Retry Strategy

### Problem:

External APIs fail due to:
- Network timeouts
- Temporary server errors (5xx)
- Rate limiting (429)
- Authentication token expiry (401)

### Solution: Configurable Exponential Backoff

```typescript
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Don't retry client errors (4xx except 429)
      if (!isRetryable(error)) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s, 8s (capped at 10s)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await sleep(delay);
      
      // Re-authenticate on auth errors
      if (isAuthError(error)) {
        await authenticate();
      }
    }
  }
}
```

### Retry Decision Matrix:

| Error Type | HTTP Status | Retry? | Action |
|------------|-------------|--------|--------|
| Network timeout | - | ✅ Yes | Exponential backoff |
| Server error | 500-599 | ✅ Yes | Exponential backoff |
| Rate limit | 429 | ✅ Yes | Exponential backoff |
| Auth error | 401, 403 | ✅ Once | Re-authenticate then retry once |
| Validation | 400 | ❌ No | Return error immediately |
| Not found | 404 | ❌ No | Return error immediately |

### Configuration:

```env
URBANE_BOLT_TIMEOUT=10000        # Request timeout (ms)
URBANE_BOLT_RETRY_COUNT=3        # Max retry attempts
```

## 7. Error Handling

### Normalized Error Response:

All errors return consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { /* Optional additional info */ }
  },
  "request_id": "uuid"
}
```

### Error Codes:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `ORDER_CREATION_FAILED` | 400 | Courier rejected order |
| `ORDER_TRACKING_FAILED` | 400 | Tracking failed |
| `ORDER_CANCELLATION_FAILED` | 400 | Cancellation failed |
| `NOT_FOUND` | 404 | Order/resource not found |
| `INTERNAL_ERROR` | 500 | Server error |

### Error Isolation:

Courier-specific errors are transformed:

```typescript
// UrbaneBolt returns:
{
  "error": "Invalid pincode format",
  "error_code": "UB_INVALID_PIN"
}

// Platform returns:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid delivery pincode",
    "details": {
      "field": "delivery.pincode"
    }
  }
}
```

This prevents leaking courier-specific error formats to consumers.

## 8. Docker Architecture

### Multi-Container Setup:

```yaml
services:
  mysql:      # MySQL 8.x database
  redis:      # Redis 7 cache/queue
  backend:    # Node.js API server
  worker:     # Background job processor
```

### Networking:

```
┌─────────────────────────────────────────┐
│         courier-network (bridge)         │
│                                          │
│  ┌──────────┐    ┌──────────┐          │
│  │  MySQL   │◀───│ Backend  │◀─────────┼─── Host:3001
│  │  :3306   │    │  :3000   │          │
│  └──────────┘    └──────────┘          │
│                        ▲                │
│  ┌──────────┐         │                │
│  │  Redis   │◀────────┤                │
│  │  :6379   │         │                │
│  └──────────┘         │                │
│                        │                │
│  ┌──────────┐         │                │
│  │  Worker  │◀────────┘                │
│  └──────────┘                          │
└─────────────────────────────────────────┘
```

### Design Choices:

1. **Internal Networking**: Services communicate via Docker network, not localhost
2. **Port Isolation**: Only backend exposed to host (3001:3000)
3. **Health Checks**: Each service has health check for startup orchestration
4. **Named Volumes**: MySQL data persists across restarts
5. **Unique Names**: `courier-*` prefix prevents conflicts with other projects
6. **Graceful Shutdown**: SIGTERM/SIGINT handlers cleanup resources

### Production Considerations:

For production deployment:
- Use managed MySQL (AWS RDS, Google Cloud SQL)
- Use managed Redis (AWS ElastiCache, Redis Cloud)
- Deploy backend/worker as Kubernetes pods
- Add load balancer
- Add monitoring (Prometheus, Grafana)
- Add centralized logging (ELK, CloudWatch)

## 9. Scalability

### Horizontal Scaling:

```
┌─────────────┐
│Load Balancer│
└──────┬──────┘
       │
   ┌───┴────┬────────┬────────┐
   │        │        │        │
┌──▼───┐ ┌──▼───┐ ┌──▼───┐ ┌──▼───┐
│API 1 │ │API 2 │ │API 3 │ │API N │
└──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
   │        │        │        │
   └────────┴────┬───┴────────┘
                 │
        ┌────────▼────────┐
        │  Shared MySQL   │
        │  Shared Redis   │
        └─────────────────┘
```

**Stateless API**: Each backend instance is stateless, allowing infinite horizontal scaling

**Worker Scaling**: Add more worker instances to process jobs faster

```bash
docker compose -p courier-assignment up --scale worker=5
```

### Performance Characteristics:

| Component | Bottleneck | Scaling Strategy |
|-----------|------------|------------------|
| **API** | CPU | Horizontal (add instances) |
| **Worker** | Network I/O (API calls) | Horizontal (add instances) |
| **MySQL** | Disk I/O | Vertical (better hardware) + Read replicas |
| **Redis** | Memory | Vertical (more RAM) + Redis Cluster |

### Caching Strategy:

Future optimization: Cache frequent queries

```typescript
// Cache order status for 60 seconds
const cacheKey = `order:${orderId}`;
let order = await redis.get(cacheKey);
if (!order) {
  order = await database.query(...);
  await redis.setex(cacheKey, 60, JSON.stringify(order));
}
```

## 10. Security

### Implemented:

1. **Environment Variables**: All secrets in `.env` (not committed)
2. **Input Validation**: Joi schemas validate all inputs
3. **SQL Injection Protection**: Parameterized queries
4. **Log Sanitization**: API keys/passwords redacted from logs
5. **Error Sanitization**: No stack traces or sensitive data in API responses
6. **Non-Root Docker User**: Containers run as `nodejs:1001`
7. **Request Size Limits**: 10MB limit on request body

### Future Enhancements:

1. **Rate Limiting**: Prevent API abuse
   ```typescript
   import rateLimit from 'express-rate-limit';
   app.use(rateLimit({ windowMs: 60000, max: 100 }));
   ```

2. **API Authentication**: JWT tokens for API consumers
3. **HTTPS**: TLS termination at load balancer
4. **API Keys**: Per-consumer API keys
5. **IP Whitelisting**: Restrict access by IP
6. **Audit Logging**: Comprehensive audit trail
7. **Secrets Management**: HashiCorp Vault, AWS Secrets Manager

## 11. Trade-offs and Design Decisions

| Decision | Alternative | Why Chosen |
|----------|-------------|------------|
| **MySQL** | PostgreSQL | Assignment requirement |
| **Bull Queue** | RabbitMQ, Kafka | Simpler for this scale, Redis-based |
| **Native MySQL2** | Prisma, TypeORM | Lighter, more control, easier to debug |
| **Synchronous tracking** | Polling workers | Real-time requirement from assignment |
| **JSON columns** | Separate tables | Flexibility, audit trail |
| **Adapter pattern** | Single service class | Extensibility, SOLID principles |
| **Docker Compose** | Kubernetes | Simpler for interview/development |

## Conclusion

This design demonstrates production-quality software engineering:

- ✅ **Clean Architecture**: Clear separation of concerns
- ✅ **SOLID Principles**: Extensible, maintainable code
- ✅ **Adapter Pattern**: Pluggable courier integrations
- ✅ **Idempotency**: Safe retries
- ✅ **Async Processing**: Scalable bulk operations
- ✅ **Error Handling**: Normalized, user-friendly errors
- ✅ **Testing**: Comprehensive test coverage
- ✅ **Documentation**: Clear README and design docs
- ✅ **Docker**: Reproducible, isolated environment

The system is ready for:
- Adding new couriers (minutes)
- Horizontal scaling (unlimited API/worker instances)
- Production deployment (with managed services)
- Feature additions (webhooks, analytics, etc.)
