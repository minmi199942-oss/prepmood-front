---
name: prepmood-backend
description: Node.js/Express/MySQL backend best practices for Prepmood project. Use when writing API routes, database operations, payment processing, or server-side code. Applies security patterns, transaction management, and SSOT principles.
---

# Prepmood Backend Best Practices

## Core Principles

### 1. SSOT (Single Source of Truth)
- `orders.status`: 집계 결과 (뷰용), 직접 정책 판단 금지
- `warranties.status`: 권리/정책 상태의 SSOT ✅
- `order_item_units.unit_status`: 물류 단위 상태의 SSOT ✅
- `stock_units.status`: 실물 재고 상태의 SSOT ✅

### 2. Atomic State Transitions
```javascript
// ✅ Correct: Atomic update with condition check
const [result] = await connection.execute(
  `UPDATE warranties 
   SET status = 'revoked', revoked_at = NOW() 
   WHERE id = ? AND status = 'active'`,
  [warrantyId]
);

if (result.affectedRows !== 1) {
  throw new Error('Warranty 상태 업데이트 실패');
}

// ❌ Wrong: SELECT then UPDATE (race condition)
const [warranty] = await connection.execute(
  'SELECT * FROM warranties WHERE id = ?',
  [warrantyId]
);
if (warranty.status === 'active') {
  await connection.execute(
    'UPDATE warranties SET status = ? WHERE id = ?',
    ['revoked', warrantyId]
  );
}
```

## Security

### SQL Injection Prevention
```javascript
// ✅ Correct: Prepared statements
await connection.execute(
  'SELECT * FROM users WHERE email = ?',
  [email]
);

// ❌ Wrong: String concatenation
await connection.query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

### XSS Prevention (API responses)
```javascript
// ✅ Correct: Sanitize user input
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

const safeInput = escapeHtml(userInput);
```

### JWT Token (httpOnly cookie only)
```javascript
// ✅ Correct: httpOnly cookie
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

// ❌ Wrong: Send in response body (localStorage risk)
res.json({ token });
```

## Database Patterns

### Connection Management
```javascript
// ✅ Correct: Pool + finally release
async function processOrder(orderId) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    await connection.beginTransaction();
    
    // Operations
    await connection.execute('...');
    await connection.execute('...');
    
    await connection.commit();
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
```

### Lock Order (Deadlock Prevention)
Always acquire locks in this order:
1. `stock_units`
2. `orders`
3. `warranties`
4. `invoices`

### Retry Logic (Lock Timeout)
```javascript
// ✅ Correct: Exponential backoff
const maxRetries = 3;
const retryDelay = 1000;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    const result = await someOperation();
    return result;
  } catch (error) {
    if (error.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < maxRetries) {
      const delay = retryDelay * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    throw error;
  }
}
```

## Error Handling

### Standard Pattern
```javascript
// ✅ Correct: try-catch + Logger
try {
  const result = await someAsyncOperation();
  Logger.log('작업 성공', { result });
  return result;
} catch (error) {
  Logger.error('작업 실패', {
    error: error.message,
    stack: error.stack
  });
  throw error;
}

// ❌ Wrong: console.log
someAsyncOperation()
  .then(result => console.log(result))
  .catch(err => console.error(err));
```

### API Response Format
```javascript
// ✅ Success response
res.json({
  success: true,
  data: { ... },
  message: "작업 완료"
});

// ✅ Error response
res.status(400).json({
  success: false,
  error: "에러 메시지",
  code: "ERROR_CODE"
});
```

## Async Patterns

### Use async/await (not Promise.then)
```javascript
// ✅ Correct
async function fetchData() {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    Logger.error('API 호출 실패', { error: error.message });
    throw error;
  }
}

// ❌ Wrong
function fetchData() {
  return fetch(url)
    .then(response => response.json())
    .catch(err => console.log(err));
}
```

### Parallel Operations
```javascript
// ✅ Correct: Promise.all for independent operations
const [user, orders, warranties] = await Promise.all([
  fetchUser(userId),
  fetchOrders(userId),
  fetchWarranties(userId)
]);

// ❌ Wrong: Sequential await
const user = await fetchUser(userId);
const orders = await fetchOrders(userId);
const warranties = await fetchWarranties(userId);
```

## Code Style

### Use const/let (never var)
```javascript
// ✅ Correct
const API_BASE = process.env.API_BASE;
let currentUser = null;

// ❌ Wrong
var API_BASE = process.env.API_BASE;
var currentUser = null;
```

### Function Naming (camelCase)
```javascript
// ✅ Correct
async function getUserEmail() { ... }
function verifyCode() { ... }

// ❌ Wrong
async function get_user_email() { ... }
function VerifyCode() { ... }
```

### Constants (UPPER_SNAKE_CASE)
```javascript
// ✅ Correct
const MAX_RETRIES = 3;
const API_BASE_URL = process.env.API_BASE;

// ❌ Wrong
const maxRetries = 3;
const apiBaseUrl = process.env.API_BASE;
```

## Project-Specific Rules

### Color Standardization
```javascript
// ✅ Correct: Standard values only
const STANDARD_COLORS = [
  'Black', 'Navy', 'White', 'Grey',
  'Light Blue', 'Light Grey'  // Note: Space required
];

// ❌ Wrong: 'LightBlue' (no space)
```

### Product ID Format
```javascript
// ✅ Correct: URL-safe (no slashes)
const productId = 'PM-25-SH-Teneu-Solid-LB';

// ❌ Wrong: Contains slash
const productId = 'PM-25-SH-Teneu-Solid-LB/M';
```

### Order Processing Flow
```javascript
// Required sequence:
// 1. paid_events 생성
// 2. processPaidOrder() 실행
// 3. order_item_units 생성
// 4. warranties 생성
// 5. invoices 생성
```

## Logging

### Use Logger (not console.log)
```javascript
// ✅ Correct
Logger.log('주문 생성', { orderId, userId });
Logger.error('결제 실패', { error: error.message });
Logger.warn('재고 부족', { productId, requested, available });

// ❌ Wrong
console.log('주문 생성', orderId);
console.error('결제 실패:', error);
```

## Environment Variables

### Always use .env (never hardcode)
```javascript
// ✅ Correct
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

// ❌ Wrong
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'password123'
};
```

## Performance Optimization

### Defer Await Until Needed (Impact: HIGH)
```javascript
// ❌ Wrong: await before condition check
async function updateResource(resourceId, userId) {
  const permissions = await fetchPermissions(userId);
  const resource = await getResource(resourceId);
  
  if (!resource) {
    return { error: 'Not found' };  // Already waited for permissions!
  }
  
  return processResource(resource, permissions);
}

// ✅ Correct: await only when needed
async function updateResource(resourceId, userId) {
  const resource = await getResource(resourceId);
  
  if (!resource) {
    return { error: 'Not found' };  // No unnecessary await
  }
  
  const permissions = await fetchPermissions(userId);
  return processResource(resource, permissions);
}
```

### API Route Parallelization (Impact: CRITICAL)
```javascript
// ❌ Wrong: Sequential awaits (3 round trips)
async function GET(request) {
  const session = await auth();
  const config = await fetchConfig();
  const data = await fetchData(session.user.id);
  return Response.json({ data, config });
}

// ✅ Correct: Start early, await late (1 round trip for independent ops)
async function GET(request) {
  const sessionPromise = auth();
  const configPromise = fetchConfig();
  const session = await sessionPromise;
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id)
  ]);
  return Response.json({ data, config });
}
```

### Early Return (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: Continues after finding error
function validateUsers(users) {
  let hasError = false;
  let errorMessage = '';
  
  for (const user of users) {
    if (!user.email) {
      hasError = true;
      errorMessage = 'Email required';
    }
  }
  
  return hasError ? { valid: false, error: errorMessage } : { valid: true };
}

// ✅ Correct: Return immediately on first error
function validateUsers(users) {
  for (const user of users) {
    if (!user.email) {
      return { valid: false, error: 'Email required' };
    }
  }
  return { valid: true };
}
```

### Build Index Maps for Repeated Lookups (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: O(n) per lookup → 1M ops for 1000×1000
function processOrders(orders, users) {
  return orders.map(order => ({
    ...order,
    user: users.find(u => u.id === order.userId)
  }));
}

// ✅ Correct: O(1) per lookup → 2K ops
function processOrders(orders, users) {
  const userById = new Map(users.map(u => [u.id, u]));
  
  return orders.map(order => ({
    ...order,
    user: userById.get(order.userId)
  }));
}
```

### Use Set/Map for O(1) Lookups (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: O(n) per check
const allowedIds = ['a', 'b', 'c'];
items.filter(item => allowedIds.includes(item.id));

// ✅ Correct: O(1) per check
const allowedIds = new Set(['a', 'b', 'c']);
items.filter(item => allowedIds.has(item.id));
```

### Cache Function Results (Impact: MEDIUM)
```javascript
// ❌ Wrong: Redundant computation
function processProducts(products) {
  return products.map(product => ({
    ...product,
    slug: slugify(product.name)  // Called 100+ times for same names
  }));
}

// ✅ Correct: Cache results
const slugifyCache = new Map();

function cachedSlugify(text) {
  if (slugifyCache.has(text)) {
    return slugifyCache.get(text);
  }
  const result = slugify(text);
  slugifyCache.set(text, result);
  return result;
}

function processProducts(products) {
  return products.map(product => ({
    ...product,
    slug: cachedSlugify(product.name)
  }));
}
```

### Combine Multiple Array Iterations (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: 3 iterations
const admins = users.filter(u => u.isAdmin);
const testers = users.filter(u => u.isTester);
const inactive = users.filter(u => !u.isActive);

// ✅ Correct: 1 iteration
const admins = [];
const testers = [];
const inactive = [];

for (const user of users) {
  if (user.isAdmin) admins.push(user);
  if (user.isTester) testers.push(user);
  if (!user.isActive) inactive.push(user);
}
```

### Cache Property Access in Loops (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: 3 lookups × N iterations
for (let i = 0; i < arr.length; i++) {
  process(obj.config.settings.value);
}

// ✅ Correct: 1 lookup total
const value = obj.config.settings.value;
const len = arr.length;
for (let i = 0; i < len; i++) {
  process(value);
}
```

### Early Length Check for Array Comparisons (Impact: MEDIUM-HIGH)
```javascript
// ❌ Wrong: Always runs expensive comparison
function hasChanges(current, original) {
  return current.sort().join() !== original.sort().join();
}

// ✅ Correct: O(1) length check first
function hasChanges(current, original) {
  if (current.length !== original.length) {
    return true;
  }
  // Only sort when lengths match
  const currentSorted = [...current].sort();
  const originalSorted = [...original].sort();
  for (let i = 0; i < currentSorted.length; i++) {
    if (currentSorted[i] !== originalSorted[i]) {
      return true;
    }
  }
  return false;
}
```

## References

- `START_HERE.md`: Project structure and workflow
- `SCHEMA_SSOT.md`: Database schema (SSOT)
- `db_structure_actual.txt`: Actual database structure
- `SYSTEM_FLOW_DETAILED.md`: System flow diagrams
