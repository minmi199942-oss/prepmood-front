# Code Review Classification Examples

## Critical Examples

### SQL Injection Vulnerability
**Comment**: "User input is directly concatenated into SQL query. This is a security vulnerability."

**Code**:
```javascript
const query = `SELECT * FROM orders WHERE user_id = ${userId}`;
const [results] = await connection.query(query);
```

**Classification**: Critical

**Remediation**:
```javascript
const [results] = await connection.execute(
  'SELECT * FROM orders WHERE user_id = ?',
  [userId]
);
```

---

### XSS Vulnerability
**Comment**: "User input is inserted into innerHTML without sanitization."

**Code**:
```javascript
document.getElementById('result').innerHTML = userInput;
```

**Classification**: Critical

**Remediation**:
```javascript
// Use escapeHtml utility function
document.getElementById('result').innerHTML = escapeHtml(userInput);

// Or use textContent for plain text
document.getElementById('result').textContent = userInput;
```

---

### Race Condition
**Comment**: "This check-then-act pattern is not atomic. Two requests could both pass the check."

**Code**:
```javascript
const stock = await getStock(productId);
if (stock > 0) {
  await decrementStock(productId);
  // Process order
}
```

**Classification**: Critical

**Remediation**:
```javascript
// Use atomic UPDATE with WHERE condition
const [result] = await connection.execute(
  'UPDATE stock_units SET quantity = quantity - 1 WHERE product_id = ? AND quantity > 0',
  [productId]
);

if (result.affectedRows === 1) {
  // Process order
} else {
  throw new Error('Insufficient stock');
}
```

---

## Major Examples

### Missing Error Handling
**Comment**: "This async function doesn't handle errors. If the API call fails, the error will be unhandled."

**Code**:
```javascript
async function fetchUserData(userId) {
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();
  return data;
}
```

**Classification**: Major

**Remediation**:
```javascript
async function fetchUserData(userId) {
  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    Logger.error('Failed to fetch user data', { userId, error: error.message });
    throw error;
  }
}
```

---

### N+1 Query Problem
**Comment**: "This loop executes a database query for each order. This will be slow with many orders."

**Code**:
```javascript
const orders = await getOrders();
for (const order of orders) {
  order.items = await getOrderItems(order.id);
}
```

**Classification**: Major

**Remediation**:
```javascript
// Use JOIN or batch query
const orders = await getOrdersWithItems();
// Or batch load:
const orderIds = orders.map(o => o.id);
const allItems = await getOrderItemsBatch(orderIds);
// Then map items to orders
```

---

### Missing Input Validation
**Comment**: "Email format is not validated before processing."

**Code**:
```javascript
function createUser(email) {
  return db.users.create({ email });
}
```

**Classification**: Major

**Remediation**:
```javascript
function createUser(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  return db.users.create({ email });
}
```

---

## Minor Examples

### Magic Number
**Comment**: "The number 86400000 should be a named constant for clarity."

**Code**:
```javascript
setTimeout(callback, 86400000);
```

**Classification**: Minor

**Remediation**:
```javascript
const MILLISECONDS_PER_DAY = 86400000;
setTimeout(callback, MILLISECONDS_PER_DAY);
```

---

### Unclear Variable Name
**Comment**: "Variable name 'data' is too generic. Consider a more descriptive name."

**Code**:
```javascript
const data = await fetchUserOrders();
```

**Classification**: Minor

**Remediation**:
```javascript
const userOrders = await fetchUserOrders();
```

---

### Missing JSDoc
**Comment**: "This function would benefit from JSDoc comments explaining parameters and return value."

**Code**:
```javascript
function calculateTotal(items, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  return subtotal * (1 + taxRate);
}
```

**Classification**: Minor

**Remediation**:
```javascript
/**
 * Calculate total price including tax
 * 
 * @param {Array<{price: number}>} items - Array of items with price property
 * @param {number} taxRate - Tax rate as decimal (e.g., 0.1 for 10%)
 * @returns {number} Total price including tax
 */
function calculateTotal(items, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  return subtotal * (1 + taxRate);
}
```

---

## Invalid Examples

### Framework Mismatch
**Comment**: "You should use React hooks instead of class components."

**Context**: Project uses vanilla JavaScript, no frameworks.

**Classification**: Invalid

**Reason**: The project doesn't use React. The suggestion is based on incorrect assumptions about the tech stack.

---

### Overly Prescriptive
**Comment**: "You must use arrow functions everywhere. Regular functions are outdated."

**Code**:
```javascript
function processOrder(order) {
  // Processing logic
}
```

**Classification**: Invalid

**Reason**: Both arrow functions and regular functions are valid in modern JavaScript. The choice between them depends on context (hoisting, `this` binding, etc.). The current code is perfectly fine.

---

### Misunderstood Requirement
**Comment**: "This should use a database transaction."

**Context**: The code is reading data only, no writes involved.

**Code**:
```javascript
const user = await getUser(userId);
const orders = await getOrders(userId);
```

**Classification**: Invalid

**Reason**: Transactions are for ensuring atomicity of multiple writes. For read-only operations, transactions are unnecessary and add overhead.

---

### Contradicts Project Rules
**Comment**: "You should use `var` instead of `const` for this variable since it might be reassigned later."

**Context**: Project rules explicitly state "NEVER use `var`. Always use `const` or `let`."

**Classification**: Invalid

**Reason**: The comment contradicts explicit project coding standards. The current code follows the project's rules correctly.
