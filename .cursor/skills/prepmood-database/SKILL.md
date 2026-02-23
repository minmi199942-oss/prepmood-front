---
name: prepmood-database
description: Database schema and SSOT principles for Prepmood project. Use when working with database tables, writing migrations, or making schema decisions. Enforces SSOT rules, state transition constraints, and data integrity patterns.
---

# Prepmood Database Best Practices

## SSOT (Single Source of Truth)

### Status Fields Hierarchy
```
NEVER use orders.status for policy decisions!

SSOT Fields (권리/정책 판단 기준):
✅ warranties.status          → 보증서 권리 상태
✅ order_item_units.unit_status → 물류 단위 상태
✅ stock_units.status          → 실물 재고 상태

View/Aggregate Fields (화면 표시용):
❌ orders.status              → 집계 결과 (정책 판단 금지)
```

### State Transition Rules

**warranties.status**:
- `pending` → `active` (활성화)
- `active` → `transferred` (양도)
- `active` → `revoked` (취소)
- `transferred` → (종료)

**order_item_units.unit_status**:
- `reserved` → `shipped` (출고)
- `shipped` → `delivered` (배송 완료)
- `shipped` → `returned` (반품)

**stock_units.status**:
- `available` → `reserved` (주문)
- `reserved` → `shipped` (출고)
- `shipped` → `delivered` (배송)

## Schema Design Principles

### 1. Check db_structure_actual.txt First
Before any schema change:
```bash
# Always read this file first
cat backend/scripts/db_structure_actual.txt
```

### 2. Table Naming (snake_case)
```sql
-- ✅ Correct
CREATE TABLE order_items (...);
CREATE TABLE stock_units (...);

-- ❌ Wrong
CREATE TABLE OrderItems (...);
CREATE TABLE stockUnits (...);
```

### 3. Column Naming (snake_case)
```sql
-- ✅ Correct
user_id, created_at, product_name

-- ❌ Wrong
userId, createdAt, productName
```

### 4. Index Naming (idx_ prefix)
```sql
-- ✅ Correct
CREATE INDEX idx_user_id ON orders(user_id);
CREATE INDEX idx_order_id ON order_items(order_id);

-- ❌ Wrong
CREATE INDEX user_id_index ON orders(user_id);
```

## Required Columns

### Every Table Should Have
```sql
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

Exception: `orders` table currently missing these (add in migration).

### Primary Keys
```sql
-- ✅ Correct: AUTO_INCREMENT for internal IDs
id INT PRIMARY KEY AUTO_INCREMENT

-- ✅ Correct: VARCHAR for business IDs
id VARCHAR(128) PRIMARY KEY  -- e.g., admin_products.id
```

## Foreign Keys

### Always Add FK Constraints
```sql
-- ✅ Correct: With FK constraint + index
CREATE TABLE order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT,
  
  INDEX idx_order_id (order_id),
  INDEX idx_product_id (product_id)
);

-- ❌ Wrong: No FK constraint
CREATE TABLE order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id VARCHAR(128) NOT NULL
);
```

### FK Cascade Rules
- `ON DELETE CASCADE`: 부모 삭제 시 자식도 삭제 (예: order → order_items)
- `ON DELETE RESTRICT`: 부모 삭제 금지 (예: admin_products → order_items)
- `ON DELETE SET NULL`: 부모 삭제 시 NULL (드물게 사용)

## Unique Constraints

### When to Use UNIQUE
```sql
-- ✅ Required: Business-critical uniqueness
token_master.token UNIQUE  -- 토큰 중복 방지
admin_products.short_name UNIQUE  -- 상품 단축명 중복 방지
users.email UNIQUE  -- 이메일 중복 방지

-- ❌ Wrong: Missing UNIQUE on token
CREATE TABLE token_master (
  token VARCHAR(100) NOT NULL  -- Should be UNIQUE
);
```

## Timestamps

### Use DATETIME (not TIMESTAMP)
```sql
-- ✅ Correct: DATETIME (wider range)
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

-- ❌ Wrong: TIMESTAMP (limited range)
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## JSON Columns

### When to Use JSON
```sql
-- ✅ Correct: Semi-structured data that changes frequently
warranty_events.old_value JSON  -- 이전 값 스냅샷
warranty_events.new_value JSON  -- 새 값 스냅샷

-- ❌ Wrong: Use JSON for structured data
orders.customer_info JSON  -- Should be separate columns
```

### Parsing JSON in Code
```javascript
// ✅ Correct: Safe parsing
function safeParseJson(val, fallback = {}) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  if (typeof val !== 'string') return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

const oldValue = safeParseJson(row.old_value, {});

// ❌ Wrong: Direct JSON.parse (can throw on null)
const oldValue = JSON.parse(row.old_value);
```

## Indexes

### When to Add Index
- Foreign keys (always)
- Columns used in WHERE clauses
- Columns used in JOIN conditions
- Columns used in ORDER BY

```sql
-- ✅ Correct: Index on frequently queried columns
CREATE INDEX idx_user_id ON orders(user_id);
CREATE INDEX idx_status ON orders(status);
CREATE INDEX idx_created_at ON orders(created_at);

-- ❌ Wrong: Index on every column (overhead)
CREATE INDEX idx_notes ON orders(notes);  -- Rarely queried
```

## Migrations

### Migration File Naming
```
backend/migrations/
  073_create_paid_events.sql
  074_create_paid_event_processing.sql
  075_create_order_item_units.sql
```

Format: `{number}_{description}.sql`

### Migration Structure
```sql
-- ✅ Correct: Clear structure
-- Migration: 073_create_paid_events.sql
-- Purpose: Create paid_events table for payment tracking
-- Author: [Name]
-- Date: 2026-01-XX

-- Check if table exists
CREATE TABLE IF NOT EXISTS paid_events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  ...
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  INDEX idx_order_id (order_id)
);
```

### Update SSOT After Migration
```bash
# After running migration
1. Update db_structure_actual.txt
2. Update SCHEMA_SSOT.md if needed
3. Commit both files together
```

## Transaction Patterns

### Always Use Transactions for Multi-Step Operations
```javascript
// ✅ Correct: Transaction with rollback
const connection = await mysql.createConnection(dbConfig);
try {
  await connection.beginTransaction();
  
  // Step 1
  await connection.execute(
    'INSERT INTO orders (...) VALUES (...)',
    [...]
  );
  
  // Step 2
  await connection.execute(
    'UPDATE stock_units SET status = ? WHERE id = ?',
    ['reserved', unitId]
  );
  
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
```

### Lock Order (Deadlock Prevention)
Always acquire locks in this order:
1. `stock_units`
2. `orders`
3. `warranties`
4. `invoices`

```javascript
// ✅ Correct: Consistent lock order
await connection.execute('SELECT * FROM stock_units WHERE id = ? FOR UPDATE', [unitId]);
await connection.execute('SELECT * FROM orders WHERE order_id = ? FOR UPDATE', [orderId]);

// ❌ Wrong: Inconsistent lock order (deadlock risk)
await connection.execute('SELECT * FROM orders WHERE order_id = ? FOR UPDATE', [orderId]);
await connection.execute('SELECT * FROM stock_units WHERE id = ? FOR UPDATE', [unitId]);
```

## Data Integrity

### Atomic Updates
```sql
-- ✅ Correct: Update with condition check
UPDATE warranties 
SET status = 'revoked', revoked_at = NOW() 
WHERE id = ? AND status = 'active';

-- Then check affectedRows = 1 in code

-- ❌ Wrong: SELECT then UPDATE (race condition)
SELECT status FROM warranties WHERE id = ?;
-- (check status in code)
UPDATE warranties SET status = 'revoked' WHERE id = ?;
```

### Validate Constraints
```javascript
// ✅ Correct: Check affectedRows
const [result] = await connection.execute(
  'UPDATE warranties SET status = ? WHERE id = ? AND status = ?',
  ['revoked', warrantyId, 'active']
);

if (result.affectedRows !== 1) {
  throw new Error('Warranty 상태 업데이트 실패');
}

// ❌ Wrong: No validation
await connection.execute(
  'UPDATE warranties SET status = ? WHERE id = ?',
  ['revoked', warrantyId]
);
```

## Common Patterns

### Product-Related Tables
```
admin_products (id: VARCHAR)
  ← stock_units (product_id FK)
  ← order_items (product_id FK)
  ← token_master (product_id FK)
  ← product_options (product_id FK)
```

### Order-Related Tables
```
orders (order_id: INT)
  ← order_items (order_id FK)
    ← order_item_units (order_item_id FK)
      ← warranties (unit_id FK)
  ← paid_events (order_id FK)
  ← invoices (order_id FK)
```

### Warranty-Related Tables
```
warranties (id: INT)
  ← warranty_events (warranty_id FK)
  ← warranty_transfers (warranty_id FK)
```

## Forbidden Patterns

### Never Rely on orders.status
```javascript
// ❌ FORBIDDEN: Using orders.status for policy
const [order] = await connection.execute(
  'SELECT status FROM orders WHERE order_id = ?',
  [orderId]
);

if (order.status === 'completed') {
  // Policy decision based on orders.status (WRONG!)
}

// ✅ Correct: Use warranties.status
const [warranty] = await connection.execute(
  'SELECT status FROM warranties WHERE unit_id = ?',
  [unitId]
);

if (warranty.status === 'active') {
  // Policy decision based on SSOT (CORRECT!)
}
```

### Never Skip FK Constraints
```sql
-- ❌ FORBIDDEN: No FK constraint
CREATE TABLE order_items (
  order_id INT NOT NULL  -- No FK = data integrity risk
);

-- ✅ Correct: Always add FK
CREATE TABLE order_items (
  order_id INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);
```

## References

- `db_structure_actual.txt`: Actual database structure (ALWAYS check first)
- `SCHEMA_SSOT.md`: Schema documentation
- `START_HERE.md`: Project workflow
- `SYSTEM_FLOW_DETAILED.md`: System flow diagrams
