# 제시된 스펙 vs 현재 시스템 종합 비교 분석

## 📊 현재 시스템 상세 분석

### ✅ 현재 구현된 핵심 기능

#### 1. QR 코드 인증 시스템 (`/a/:token`)
**위치**: `backend/auth-routes.js` 182-748줄

**현재 동작**:
```javascript
// GET /a/:token
router.get('/a/:token', requireAuthForHTML, async (req, res) => {
  // 1. 토큰 검증
  const [tokenMaster] = await connection.execute(
    'SELECT * FROM token_master WHERE token = ?',
    [token]
  );
  
  // 2. 첫 스캔 시 보증서 생성 ⚠️
  if (isFirstScan) {
    await connection.execute(
      'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, token, publicId, productName, utcDateTime, utcDateTime]
    );
  }
  
  // 3. 보증서 상세 페이지 렌더링
  return res.render('warranty-detail', { warranty });
});

// POST /a/:token
router.post('/a/:token', authenticateToken, async (req, res) => {
  // 보증서 생성 (첫 스캔 시) ⚠️
  await connection.execute(
    'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, token, publicId, productName, utcDateTime, utcDateTime]
  );
});
```

**제시된 스펙과 비교**:
- ✅ **토큰 검증 로직**: 그대로 활용 가능
- ✅ **가품 경고 로직**: 그대로 활용 가능
- ✅ **로그인 체크**: `requireAuthForHTML` 그대로 사용 가능
- ❌ **보증서 생성 로직**: 제거 필요 (paid 시점에 생성)
- ⚠️ **보증서 조회 로직**: 수정 필요 (이미 생성되어 있음)

**활용 방안**:
```javascript
// GET /a/:token 수정
router.get('/a/:token', requireAuthForHTML, async (req, res) => {
  const token = req.params.token;
  const userId = req.user.userId;
  
  // 1. 토큰 검증 (기존 로직 그대로)
  const [tokenMaster] = await connection.execute(
    'SELECT * FROM token_master WHERE token = ?',
    [token]
  );
  
  if (tokenMaster.length === 0 || tokenMaster[0].is_blocked === 1) {
    return res.status(400).render('fake', { title: '가품 경고' });
  }
  
  // 2. 보증서 조회 (이미 생성되어 있음)
  const [warranty] = await connection.execute(
    `SELECT w.*, tm.product_name 
     FROM warranties w
     JOIN token_master tm ON w.token_id = tm.token
     WHERE w.token_id = ? AND w.owner_user_id = ?`,
    [token, userId]
  );
  
  if (warranty.length === 0) {
    return res.status(404).render('error', { message: '보증서를 찾을 수 없습니다.' });
  }
  
  // 3. 보증서 상세 페이지 렌더링
  return res.render('warranty-detail', { warranty: warranty[0] });
});

// POST /a/:token 제거 또는 비활성화
// 활성화는 POST /api/warranties/:id/activate에서만 수행
```

#### 2. 주문 생성 로직 (`POST /api/orders`)
**위치**: `backend/order-routes.js` 367-643줄

**현재 동작**:
```javascript
router.post('/orders', authenticateToken, verifyCSRF, async (req, res) => {
  const userId = req.user?.userId || null; // ⚠️ authenticateToken이 필수이므로 항상 존재
  
  // 1. Idempotency 처리
  const [idemRows] = await connection.execute(
    'SELECT order_number FROM orders_idempotency WHERE user_id = ? AND idem_key = ?',
    [userId, idemKey] // ⚠️ user_id가 필수
  );
  
  // 2. 주문 생성
  await connection.execute(
    'INSERT INTO orders (user_id, order_number, total_price, status, ...) VALUES (?, ?, ?, ?, ...)',
    [userId, orderNumber, finalTotal, 'pending', ...]
  );
  
  // 3. order_items 생성
  for (const itemData of orderItemsData) {
    await connection.execute(
      'INSERT INTO order_items (order_id, product_id, quantity, ...) VALUES (?, ?, ?, ...)',
      [orderId, itemData.product_id, itemData.quantity, ...]
    );
  }
  
  // 4. Idempotency 기록
  await connection.execute(
    'INSERT IGNORE INTO orders_idempotency (user_id, idem_key, order_number) VALUES (?, ?, ?)',
    [userId, idemKey, orderNumber] // ⚠️ user_id가 필수
  );
});
```

**제시된 스펙과 비교**:
- ✅ **주문번호 생성**: `generateOrderNumber()` 그대로 활용 가능
- ✅ **주문 검증**: `validateOrderRequest()` 그대로 활용 가능
- ✅ **트랜잭션 처리**: 그대로 활용 가능
- ❌ **authenticateToken**: `optionalAuth`로 변경 필요
- ❌ **guest_id 생성**: 신규 구현 필요
- ❌ **guest_orders 생성**: 신규 구현 필요
- ⚠️ **Idempotency**: `user_id` NULL 허용 및 `guest_id` 추가 필요

**활용 방안**:
```javascript
// 수정된 주문 생성 로직
router.post('/orders', optionalAuth, verifyCSRF, async (req, res) => {
  const userId = req.user?.userId || null;
  let guestId = null;
  
  // 1. 비회원 주문 처리
  if (!userId) {
    guestId = uuidv4();
    // guest_orders는 orders 생성 후에 생성
  }
  
  // 2. Idempotency 처리 (수정)
  const [idemRows] = await connection.execute(
    userId 
      ? 'SELECT order_number FROM orders_idempotency WHERE user_id = ? AND idem_key = ?'
      : 'SELECT order_number FROM orders_idempotency WHERE guest_id = ? AND idem_key = ?',
    userId ? [userId, idemKey] : [guestId, idemKey]
  );
  
  // 3. 주문 생성
  await connection.execute(
    'INSERT INTO orders (user_id, guest_id, order_number, total_price, status, ...) VALUES (?, ?, ?, ?, ?, ...)',
    [userId, guestId, orderNumber, finalTotal, 'pending', ...]
  );
  
  // 4. 비회원인 경우 guest_orders 생성
  if (!userId) {
    await connection.execute(
      'INSERT INTO guest_orders (guest_id, order_id, email, name, phone) VALUES (?, ?, ?, ?, ?)',
      [guestId, orderId, shipping.email, shipping.name, shipping.phone]
    );
    
    // guest_order_access_token 생성
    const accessToken = generateRandomToken();
    await connection.execute(
      'INSERT INTO guest_order_access_tokens (order_id, token, expires_at) VALUES (?, ?, ?)',
      [orderId, accessToken, new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)]
    );
    
    // claim_token 생성
    const claimToken = generateRandomToken();
    await connection.execute(
      'INSERT INTO claim_tokens (order_id, token, expires_at) VALUES (?, ?, ?)',
      [orderId, claimToken, new Date(Date.now() + 15 * 60 * 1000)]
    );
  }
  
  // 5. order_items 생성 (기존 로직 그대로)
  // ...
  
  // 6. Idempotency 기록 (수정)
  await connection.execute(
    'INSERT IGNORE INTO orders_idempotency (user_id, guest_id, idem_key, order_number) VALUES (?, ?, ?, ?)',
    [userId, guestId, idemKey, orderNumber]
  );
});
```

#### 3. 결제 확인 로직 (`POST /api/payments/confirm`)
**위치**: `backend/payments-routes.js` 64-386줄

**현재 동작**:
```javascript
router.post('/payments/confirm', authenticateToken, verifyCSRF, async (req, res) => {
  // 1. 토스 API 호출
  const confirmResponse = await fetch(`${tossApiBase}/v1/payments/confirm`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      paymentKey: paymentKey,
      orderId: orderNumber,
      amount: serverAmount
    })
  });
  
  // 2. payments 테이블 저장
  await connection.execute(
    `INSERT INTO payments (order_number, gateway, payment_key, status, amount, currency, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderNumber, isMockMode ? 'mock' : 'toss', paymentKey, paymentStatus, serverAmount, currency, JSON.stringify(confirmData)]
  );
  
  // 3. 주문 상태 업데이트
  await connection.execute(
    'UPDATE orders SET status = ? WHERE order_number = ?',
    [orderStatus, orderNumber]
  );
  
  // ❌ 재고 배정 없음
  // ❌ order_item_units 생성 없음
  // ❌ warranty 생성 없음
});
```

**제시된 스펙과 비교**:
- ✅ **토스 API 호출**: 그대로 활용 가능
- ✅ **payments 테이블 저장**: 그대로 활용 가능
- ✅ **주문 상태 업데이트**: 그대로 활용 가능
- ❌ **paid 처리 트랜잭션**: 신규 구현 필요

**활용 방안**:
```javascript
// 수정된 결제 확인 로직
router.post('/payments/confirm', authenticateToken, verifyCSRF, async (req, res) => {
  // ... 기존 로직 그대로 ...
  
  // 4. payments 테이블 저장 (기존 로직 그대로)
  await connection.execute(
    `INSERT INTO payments (order_number, gateway, payment_key, status, amount, currency, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderNumber, isMockMode ? 'mock' : 'toss', paymentKey, paymentStatus, serverAmount, currency, JSON.stringify(confirmData)]
  );
  
  // 5. 주문 상태 업데이트 (기존 로직 그대로)
  await connection.execute(
    'UPDATE orders SET status = ? WHERE order_number = ?',
    [orderStatus, orderNumber]
  );
  
  // 6. paid 처리 트랜잭션 호출 (신규 추가) ⭐
  if (paymentStatus === 'captured') {
    await processPaidOrder({
      orderId: order.order_id,
      paymentKey: paymentKey,
      source: 'confirm'
    });
  }
  
  // ... 나머지 로직 그대로 ...
});
```

#### 4. 웹훅 처리 로직 (`POST /api/payments/webhook`)
**위치**: `backend/payments-routes.js` 697-765줄

**현재 동작**:
```javascript
router.post('/payments/webhook', async (req, res) => {
  // 1. 토스 재조회 검증
  const verifiedPayment = await verifyPaymentWithToss(paymentKey);
  
  // 2. payments 테이블 업데이트
  await connection.execute(
    'UPDATE payments SET status = ?, updated_at = NOW() WHERE payment_key = ?',
    [paymentStatus, paymentKey]
  );
  
  // 3. orders 테이블 업데이트
  await connection.execute(
    'UPDATE orders SET status = ?, updated_at = NOW() WHERE order_number = ?',
    [orderStatus, verifiedOrderId]
  );
  
  // ❌ paid 처리 트랜잭션 없음
});
```

**제시된 스펙과 비교**:
- ✅ **토스 재조회 검증**: 그대로 활용 가능
- ✅ **payments 테이블 업데이트**: 그대로 활용 가능
- ✅ **orders 테이블 업데이트**: 그대로 활용 가능
- ❌ **paid 처리 트랜잭션**: 신규 구현 필요

**활용 방안**:
```javascript
// 수정된 웹훅 처리 로직
router.post('/payments/webhook', async (req, res) => {
  // ... 기존 로직 그대로 ...
  
  // 4. paid 처리 트랜잭션 호출 (신규 추가) ⭐
  if (paymentStatus === 'captured') {
    await processPaidOrder({
      orderId: verifiedOrderId,
      paymentKey: paymentKey,
      source: 'webhook'
    });
  }
  
  // ... 나머지 로직 그대로 ...
});
```

---

## 🔍 제시된 스펙의 핵심 변경사항

### 1. 보증서 생성 시점 변경 (QR 스캔 → paid 시점) 🔴

#### 현재 시스템
- **시점**: QR 스캔 시 (`/a/:token` GET/POST)
- **위치**: `backend/auth-routes.js` 247-292줄, 621-624줄
- **문제점**:
  - 사용자가 QR을 안 찍으면 보증서가 없음
  - 환불 정책(활성화 전 환불 가능)을 기술적으로 보장할 수 없음

#### 제시된 스펙
- **시점**: paid 시점 (결제 성공 직후)
- **위치**: `processPaidOrder()` 함수 내부
- **장점**:
  - 보증서는 항상 존재하므로 환불 판정 가능
  - 활성화 전/후 정책을 기술적으로 보장

#### 변경 영향
- ❌ **현재 QR 스캔 로직 대폭 수정 필요**
- ❌ **`processPaidOrder()` 함수 신규 구현 필요**
- ⚠️ **기존 보증서는 그대로 유지** (마이그레이션 불필요)

### 2. 비회원 주문 지원 추가 🔴

#### 현재 시스템
- **인증**: `authenticateToken` 필수 (회원만 가능)
- **문제점**: 비회원 주문 불가

#### 제시된 스펙
- **인증**: `optionalAuth` (비회원 지원)
- **추가 필요**: `guest_id`, `guest_orders`, `guest_order_access_tokens`, `claim_tokens`

#### 변경 영향
- ❌ **`authenticateToken` → `optionalAuth` 변경 필요**
- ❌ **비회원 주문 로직 신규 구현 필요**

### 3. `order_item_units` 테이블 도입 🔴

#### 현재 시스템
- **구조**: `order_items.quantity`만 있음
- **문제점**: 실물 단위 추적 불가, 부분 배송/부분 환불 불가

#### 제시된 스펙
- **구조**: `order_item_units` 테이블 (quantity만큼 분해)
- **장점**: 실물 단위별 추적 가능, 부분 배송/부분 환불 가능

#### 변경 영향
- ❌ **`order_item_units` 테이블 신규 생성 필요**
- ❌ **paid 처리 로직에서 quantity만큼 생성 필요**

### 4. 재고 관리 시스템 도입 🔴

#### 현재 시스템
- **구조**: 재고 관리 시스템 없음
- **문제점**: 재고 배정 불가, 시리얼/바코드 관리 불가

#### 제시된 스펙
- **구조**: `stock_units` 테이블
- **장점**: 재고 배정 가능, 시리얼/바코드 관리 가능

#### 변경 영향
- ❌ **`stock_units` 테이블 신규 생성 필요**
- ❌ **재고 배정 로직 신규 구현 필요**
- ❌ **xlsx 업로드로 재고 등록 기능 필요**

---

## ✅ 현재 시스템에서 살려서 이용할 수 있는 부분

### 1. QR 코드 인증 시스템 ⭐⭐⭐⭐⭐ (90% 재사용 가능)

#### 재사용 가능한 부분
```javascript
// 1. 토큰 검증 로직 (100% 재사용)
const [tokenMasterRows] = await connection.execute(
  'SELECT * FROM token_master WHERE token = ?',
  [token]
);

// 2. 가품 경고 로직 (100% 재사용)
if (tokenMasterRows.length === 0 || tokenMaster.is_blocked === 1) {
  return res.status(400).render('fake', { title: '가품 경고' });
}

// 3. 로그인 체크 (100% 재사용)
requireAuthForHTML // 그대로 사용 가능

// 4. 스캔 카운트 업데이트 (100% 재사용)
UPDATE token_master 
SET scan_count = scan_count + 1,
    first_scanned_at = ?,
    last_scanned_at = ?
WHERE token = ?
```

#### 수정 필요한 부분
```javascript
// ❌ 제거: 보증서 생성 로직
// await connection.execute(
//   'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
//   [userId, token, publicId, productName, utcDateTime, utcDateTime]
// );

// ✅ 추가: 보증서 조회 로직
const [warranty] = await connection.execute(
  `SELECT w.*, tm.product_name 
   FROM warranties w
   JOIN token_master tm ON w.token_id = tm.token
   WHERE w.token_id = ? AND w.owner_user_id = ?`,
  [token, userId]
);
```

**재사용률**: 약 90%
- 토큰 검증, 가품 경고, 로그인 체크는 그대로 사용 가능
- 보증서 생성 로직만 제거하고 조회 로직으로 변경

### 2. 주문 생성 로직 ⭐⭐⭐⭐ (80% 재사용 가능)

#### 재사용 가능한 부분
```javascript
// 1. 주문번호 생성 로직 (100% 재사용)
async function generateOrderNumber(connection, maxRetries = 3) {
  // 그대로 활용 가능
}

// 2. 주문 검증 로직 (100% 재사용)
const validationErrors = validateOrderRequest(req);
// 그대로 활용 가능

// 3. 트랜잭션 처리 (100% 재사용)
await connection.beginTransaction();
// 그대로 활용 가능

// 4. order_items 생성 로직 (100% 재사용)
for (const itemData of orderItemsData) {
  await connection.execute(
    'INSERT INTO order_items (order_id, product_id, quantity, ...) VALUES (?, ?, ?, ...)',
    [orderId, itemData.product_id, itemData.quantity, ...]
  );
}
```

#### 수정 필요한 부분
```javascript
// ⚠️ 수정: authenticateToken → optionalAuth
router.post('/orders', optionalAuth, verifyCSRF, ...)

// ⚠️ 수정: 비회원 지원 추가
const userId = req.user?.userId || null;
let guestId = null;

if (!userId) {
  guestId = uuidv4();
  // guest_orders 생성 로직 추가
}

// ⚠️ 수정: Idempotency 처리
const [idemRows] = await connection.execute(
  userId 
    ? 'SELECT order_number FROM orders_idempotency WHERE user_id = ? AND idem_key = ?'
    : 'SELECT order_number FROM orders_idempotency WHERE guest_id = ? AND idem_key = ?',
  userId ? [userId, idemKey] : [guestId, idemKey]
);
```

**재사용률**: 약 80%
- 주문번호 생성, 검증, 트랜잭션, order_items 생성은 그대로 사용 가능
- 비회원 지원만 추가하면 됨

### 3. 결제 확인 로직 ⭐⭐⭐⭐ (85% 재사용 가능)

#### 재사용 가능한 부분
```javascript
// 1. 토스 API 호출 로직 (100% 재사용)
const confirmResponse = await fetch(`${tossApiBase}/v1/payments/confirm`, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${authHeader}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    paymentKey: paymentKey,
    orderId: orderNumber,
    amount: serverAmount
  })
});

// 2. payments 테이블 저장 (100% 재사용)
await connection.execute(
  `INSERT INTO payments (order_number, gateway, payment_key, status, amount, currency, payload_json)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [orderNumber, isMockMode ? 'mock' : 'toss', paymentKey, paymentStatus, serverAmount, currency, JSON.stringify(confirmData)]
);

// 3. 주문 상태 업데이트 (100% 재사용)
await connection.execute(
  'UPDATE orders SET status = ? WHERE order_number = ?',
  [orderStatus, orderNumber]
);
```

#### 추가 필요한 부분
```javascript
// ❌ 추가: paid 처리 트랜잭션 호출
if (paymentStatus === 'captured') {
  await processPaidOrder({
    orderId: order.order_id,
    paymentKey: paymentKey,
    source: 'confirm'
  });
}
```

**재사용률**: 약 85%
- 토스 API 호출, payments 저장, 주문 상태 업데이트는 그대로 사용 가능
- `processPaidOrder()` 함수 호출만 추가하면 됨

### 4. 웹훅 처리 로직 ⭐⭐⭐⭐ (85% 재사용 가능)

#### 재사용 가능한 부분
```javascript
// 1. 토스 재조회 검증 (100% 재사용)
const verifiedPayment = await verifyPaymentWithToss(paymentKey);

// 2. payments 테이블 업데이트 (100% 재사용)
await connection.execute(
  'UPDATE payments SET status = ?, updated_at = NOW() WHERE payment_key = ?',
  [paymentStatus, paymentKey]
);

// 3. orders 테이블 업데이트 (100% 재사용)
await connection.execute(
  'UPDATE orders SET status = ?, updated_at = NOW() WHERE order_number = ?',
  [orderStatus, verifiedOrderId]
);
```

#### 추가 필요한 부분
```javascript
// ❌ 추가: paid 처리 트랜잭션 호출
if (paymentStatus === 'captured') {
  await processPaidOrder({
    orderId: verifiedOrderId,
    paymentKey: paymentKey,
    source: 'webhook'
  });
}
```

**재사용률**: 약 85%
- 토스 재조회 검증, payments/orders 업데이트는 그대로 사용 가능
- `processPaidOrder()` 함수 호출만 추가하면 됨

---

## ⚠️ 갈아엎고 새로 해야 하는 부분

### 1. 보증서 생성 로직 (QR 스캔 → paid 시점) 🔴

#### 현재 구현
**위치**: `backend/auth-routes.js` 247-292줄, 621-624줄

**현재 코드**:
```javascript
// GET /a/:token
if (isFirstScan) {
  await connection.execute(
    'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, token, publicId, productName, utcDateTime, utcDateTime]
  );
}

// POST /a/:token
await connection.execute(
  'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  [userId, token, publicId, productName, utcDateTime, utcDateTime]
);
```

#### 제시된 스펙 로직
**위치**: `processPaidOrder()` 함수 내부

**새 코드**:
```javascript
// paid 시점에 warranty 생성
for (const unit of order_item_units) {
  await connection.execute(
    `INSERT INTO warranties 
     (source_order_item_unit_id, token_id, owner_user_id, status, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [unit.id, unit.token_id, order.user_id || null, order.user_id ? 'issued' : 'issued_unassigned']
  );
}
```

#### 변경 방법
1. **QR 스캔 로직에서 warranty 생성 제거**
2. **`processPaidOrder()` 함수 신규 구현**
3. **결제 확인/웹훅에서 `processPaidOrder()` 호출 추가**

**구현 난이도**: 중간
- 기존 로직 제거는 간단
- `processPaidOrder()` 함수 구현이 핵심

### 2. 비회원 주문 지원 추가 🔴

#### 현재 구현
**위치**: `backend/order-routes.js` 367줄

**현재 코드**:
```javascript
router.post('/orders', authenticateToken, verifyCSRF, ...)
// authenticateToken이 필수이므로 비회원 불가
```

#### 제시된 스펙 로직
**새 코드**:
```javascript
router.post('/orders', optionalAuth, verifyCSRF, ...)

const userId = req.user?.userId || null;
let guestId = null;

if (!userId) {
  guestId = uuidv4();
  // guest_orders 생성
  // guest_order_access_tokens 생성
  // claim_tokens 생성
}
```

#### 변경 방법
1. **`optionalAuth` 미들웨어 생성**
2. **비회원 주문 로직 추가**
3. **`guest_orders`, `guest_order_access_tokens`, `claim_tokens` 테이블 생성**

**구현 난이도**: 낮음
- 미들웨어 생성은 간단
- 비회원 로직 추가도 간단

### 3. `processPaidOrder()` 함수 신규 구현 🔴

#### 현재 시스템
- **없음**: paid 처리 트랜잭션 없음

#### 제시된 스펙
- **필수**: paid 처리 트랜잭션 구현

#### 구현 방법
```javascript
// backend/payments-routes.js 또는 별도 파일
async function processPaidOrder({ orderId, paymentKey, source }) {
  const connection = await mysql.createConnection(dbConfig);
  await connection.beginTransaction();
  
  try {
    // 1. paid_events 멱등성 락
    try {
      await connection.execute(
        'INSERT INTO paid_events (order_id, payment_key, event_source, created_at) VALUES (?, ?, ?, NOW())',
        [orderId, paymentKey, source]
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        // 이미 처리됨
        await connection.rollback();
        await connection.end();
        return { success: true, alreadyProcessed: true };
      }
      throw error;
    }
    
    // 2. 주문 조회
    const [orders] = await connection.execute(
      'SELECT * FROM orders WHERE order_id = ? FOR UPDATE',
      [orderId]
    );
    const order = orders[0];
    
    // 3. order_items 가져오기
    const [orderItems] = await connection.execute(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY order_item_id',
      [orderId]
    );
    
    // 4. 재고 배정 및 order_item_units 생성
    const units = [];
    const warranties = [];
    
    for (const item of orderItems) {
      const needQty = item.quantity;
      
      // 재고 선택 및 배정
      const [stockUnits] = await connection.execute(
        `SELECT stock_unit_id, token_id 
         FROM stock_units 
         WHERE product_id = ? AND status = 'in_stock' 
         ORDER BY stock_unit_id 
         LIMIT ? 
         FOR UPDATE SKIP LOCKED`,
        [item.product_id, needQty]
      );
      
      if (stockUnits.length < needQty) {
        throw new Error('재고 부족');
      }
      
      // 재고 상태 변경
      const stockUnitIds = stockUnits.map(su => su.stock_unit_id);
      await connection.execute(
        'UPDATE stock_units SET status = ? WHERE stock_unit_id IN (?)',
        ['reserved', stockUnitIds]
      );
      
      // order_item_units 생성
      for (let i = 0; i < needQty; i++) {
        const unitSeq = i + 1;
        const stockUnitId = stockUnits[i].stock_unit_id;
        const tokenId = stockUnits[i].token_id;
        
        const [unitResult] = await connection.execute(
          `INSERT INTO order_item_units 
           (order_item_id, unit_seq, stock_unit_id, token_id, unit_status, created_at)
           VALUES (?, ?, ?, ?, 'reserved', NOW())`,
          [item.order_item_id, unitSeq, stockUnitId, tokenId]
        );
        
        const unitId = unitResult.insertId;
        
        // warranties 생성
        const ownerUserId = order.user_id || null;
        const warrantyStatus = order.user_id ? 'issued' : 'issued_unassigned';
        
        units.push([item.order_item_id, unitSeq, stockUnitId, tokenId, 'reserved']);
        warranties.push([unitId, tokenId, ownerUserId, warrantyStatus]);
      }
    }
    
    // 배치 INSERT
    if (units.length > 0) {
      await connection.execute(
        'INSERT INTO order_item_units (order_item_id, unit_seq, stock_unit_id, token_id, unit_status, created_at) VALUES ?',
        [units.map(u => [...u, 'NOW()'])]
      );
    }
    
    // warranties 배치 INSERT는 unit_id를 알아야 하므로 순차 처리
    for (const warranty of warranties) {
      await connection.execute(
        `INSERT INTO warranties 
         (source_order_item_unit_id, token_id, owner_user_id, status, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        warranty
      );
    }
    
    // 5. 주문 상태 업데이트
    await connection.execute(
      'UPDATE orders SET status = ?, paid_at = NOW() WHERE order_id = ?',
      ['paid', orderId]
    );
    
    await connection.commit();
    await connection.end();
    
    return { success: true, alreadyProcessed: false };
    
  } catch (error) {
    await connection.rollback();
    await connection.end();
    throw error;
  }
}
```

**구현 난이도**: 높음
- 복잡한 트랜잭션 로직
- 재고 배정, order_item_units 생성, warranties 생성 모두 포함

---

## 🗑️ 원래 있던 걸 삭제해야 하는 부분

### 1. QR 스캔 시 warranty 생성 로직 제거 🔴

#### 현재 구현
**위치**: `backend/auth-routes.js` 247-292줄, 621-624줄

**제거할 코드**:
```javascript
// GET /a/:token에서 제거
if (isFirstScan) {
  await connection.execute(
    'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, token, publicId, productName, utcDateTime, utcDateTime]
  );
}

// POST /a/:token에서 제거
await connection.execute(
  'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  [userId, token, publicId, productName, utcDateTime, utcDateTime]
);
```

**대체 코드**:
```javascript
// 보증서 조회만 수행
const [warranty] = await connection.execute(
  `SELECT w.*, tm.product_name 
   FROM warranties w
   JOIN token_master tm ON w.token_id = tm.token
   WHERE w.token_id = ? AND w.owner_user_id = ?`,
  [token, userId]
);
```

### 2. `warranties.user_id` 컬럼 삭제 (마이그레이션 후) 🔴

#### 현재 상태
```sql
warranties.user_id (INT NOT NULL)
```

#### 삭제 방법
```sql
-- 1단계: owner_user_id 추가
ALTER TABLE warranties 
  ADD COLUMN owner_user_id INT NULL;

-- 2단계: 기존 데이터 마이그레이션
UPDATE warranties 
SET owner_user_id = user_id,
    status = 'active'  -- 기존 보증서는 활성 상태로 간주
WHERE owner_user_id IS NULL;

-- 3단계: FK 제약 해제 후 user_id 삭제
ALTER TABLE warranties
  DROP FOREIGN KEY warranties_ibfk_1;  -- FK 이름 확인 필요
  DROP COLUMN user_id;

-- 4단계: 새 FK 추가
ALTER TABLE warranties
  ADD FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL;
```

**주의사항**:
- ⚠️ 기존 보증서 데이터 보존 필수
- ⚠️ FK 제약 해제 전에 백업 권장

### 3. `warranties.token` 컬럼 삭제 또는 deprecated (마이그레이션 후) 🟡

#### 현재 상태
```sql
warranties.token (VARCHAR(20) UNIQUE)
```

#### 변경 방법
```sql
-- 옵션 A: 삭제
ALTER TABLE warranties DROP COLUMN token;

-- 옵션 B: deprecated로 표시 (권장)
ALTER TABLE warranties 
  MODIFY COLUMN token VARCHAR(20) COMMENT 'DEPRECATED: Use token_id instead';
```

**권장**: 옵션 B (deprecated로 표시)
- 이유: 기존 코드와의 호환성
- 점진적 마이그레이션 가능

---

## ⚡ 효율적인 구현 방법

### 1. 기존 코드 재사용 최대화 ⭐⭐⭐⭐⭐

#### 재사용 가능한 핵심 로직
1. ✅ **주문번호 생성**: `generateOrderNumber()` 그대로 사용
2. ✅ **Idempotency 처리**: `orders_idempotency` 테이블 활용 (guest_id 지원 추가)
3. ✅ **토스 API 호출**: 그대로 활용 가능
4. ✅ **웹훅 검증**: `verifyPaymentWithToss()` 그대로 활용 가능
5. ✅ **QR 코드 인증**: 토큰 검증 로직 그대로 활용 가능

#### 재사용으로 절약되는 시간
- 주문번호 생성 로직: 2-3시간 절약
- Idempotency 처리: 1-2시간 절약
- 토스 API 호출: 3-4시간 절약
- 웹훅 검증: 2-3시간 절약
- QR 코드 인증: 1-2시간 절약

**총 절약 시간**: 약 9-14시간

### 2. 점진적 마이그레이션 전략 ⭐⭐⭐⭐⭐

#### Phase 1: 신규 테이블 생성 (기존 테이블 유지)
**목적**: 기존 시스템에 영향 없이 새 기능 추가

**작업**:
- `order_item_units`, `stock_units`, `guest_orders` 등 신규 테이블 생성
- 기존 테이블은 그대로 유지

**장점**:
- 기존 시스템 정상 동작 보장
- 롤백 가능
- 테스트 용이

#### Phase 2: 새 로직 추가 (기존 로직과 병행)
**목적**: 새 주문부터 새 로직 사용

**작업**:
- `processPaidOrder()` 함수 구현
- `POST /api/payments/confirm`에 호출 추가
- `POST /api/payments/webhook`에 호출 추가

**장점**:
- 기존 주문은 기존 로직으로 처리
- 새 주문만 새 로직 사용
- 점진적 전환 가능

#### Phase 3: 기존 데이터 마이그레이션 (선택)
**목적**: 기존 보증서 데이터 마이그레이션

**작업**:
- `warranties.user_id` → `owner_user_id` 마이그레이션
- `warranties.token` → `token_id` 마이그레이션
- `warranties.status` 설정

**주의사항**:
- 기존 주문의 `order_item_units` 생성은 불필요 (재고 배정이 안 되어 있을 가능성 높음)
- 기존 보증서는 그대로 유지

#### Phase 4: 기존 로직 제거 (안정화 후)
**목적**: 중복 로직 제거

**작업**:
- QR 스캔 시 warranty 생성 로직 제거
- 기존 컬럼 삭제 (user_id → owner_user_id 등)

**주의사항**:
- 충분한 테스트 후 수행
- 백업 필수

### 3. 트랜잭션 최적화 ⭐⭐⭐⭐

#### 배치 INSERT 사용
**현재 방식 (비효율)**:
```javascript
for (let i = 0; i < quantity; i++) {
  await connection.execute('INSERT INTO order_item_units ...');
}
```

**개선 방식 (효율적)**:
```javascript
const units = [];
for (let i = 0; i < quantity; i++) {
  units.push([order_item_id, i+1, stock_unit_id, token_id, 'reserved']);
}
await connection.execute(
  'INSERT INTO order_item_units (order_item_id, unit_seq, stock_unit_id, token_id, unit_status) VALUES ?',
  [units]
);
```

**성능 개선**: 
- quantity = 10인 경우: 10번 INSERT → 1번 INSERT
- 약 90% 시간 단축

#### FOR UPDATE SKIP LOCKED 사용
**현재 방식**:
```sql
SELECT id FROM stock_units 
WHERE product_id = ? AND status = 'in_stock' 
LIMIT ? 
FOR UPDATE
```

**개선 방식**:
```sql
SELECT id FROM stock_units 
WHERE product_id = ? AND status = 'in_stock' 
ORDER BY id 
LIMIT ? 
FOR UPDATE SKIP LOCKED
```

**성능 개선**:
- 동시 주문 시 대기 시간 감소
- 데드락 위험 감소

---

## ❌ 불가능하거나 문제가 될 수 있는 부분

### 1. MySQL 부분 UNIQUE 인덱스 (이미 지적됨) ⚠️

#### 문제
```sql
-- ❌ MySQL 미지원
UNIQUE(stock_unit_id) where stock_unit_id not null
```

#### 해결 방법
```javascript
// 애플리케이션 레벨 검증
const [existing] = await connection.execute(
  'SELECT order_item_unit_id FROM order_item_units WHERE stock_unit_id = ?',
  [stock_unit_id]
);
if (existing.length > 0) {
  throw new Error('stock_unit_id already assigned');
}
```

**주의사항**:
- 트랜잭션 내에서 검증해야 함
- 동시성 문제 가능성 있음 (FOR UPDATE 사용 권장)

### 2. 기존 보증서 데이터 마이그레이션 복잡성 ⚠️

#### 문제
- 기존 보증서는 `source_order_item_unit_id` 연결이 없음
- `order_item_units`가 없을 수 있음

#### 해결 방법
```sql
-- 기존 보증서는 source_order_item_unit_id = NULL로 유지
ALTER TABLE warranties 
  MODIFY COLUMN source_order_item_unit_id INT NULL;

-- 조회 시 NULL 체크로 구분
SELECT * FROM warranties 
WHERE owner_user_id = ? 
  AND (source_order_item_unit_id IS NOT NULL OR created_at < '2025-01-01')
```

**주의사항**:
- 기존 보증서는 `source_order_item_unit_id = NULL`로 유지
- 새 보증서부터 `source_order_item_unit_id` 필수

### 3. 기존 주문의 `order_item_units` 생성 복잡성 ⚠️

#### 문제
- 기존 주문은 재고 배정이 안 되어 있을 가능성 높음
- `stock_unit_id` 연결 불가능

#### 해결 방법
- 기존 주문은 `order_item_units` 생성 불필요
- 조회 시 `order_items`만 사용
- 새 주문부터 `order_item_units` 사용

**주의사항**:
- 조회 로직에서 `order_item_units` 존재 여부 확인 필요
- 기존 주문과 새 주문 분기 처리 필요

---

## 🐛 제시된 스펙의 문제점 또는 개선 필요 사항

### 1. `paid_events.order_id UNIQUE` 제약 문제 (이미 지적됨) ⚠️

#### 문제
```sql
paid_events.order_id (UNIQUE)
```
- 부분 환불 후 재결제 불가

#### 제시된 스펙의 해결책
```sql
paid_events.idempotency_key (UNIQUE)
paid_events.order_id (FK)
```

**권장**: ✅ 제시된 해결책 채택

### 2. `order_item_units.token_id` 중복 저장 문제 (미세한 이슈) ⚠️

#### 문제
```sql
order_item_units.token_id (FK token_master)
stock_units.token_id (FK token_master)
```
- `token_id`가 두 테이블에 저장됨

#### 해결 방법
- `order_item_units.token_id`는 조회 최적화용으로만 사용
- 실제 진실은 `stock_units.token_id`
- 또는 `order_item_units.token_id` 제거하고 `stock_units` JOIN으로 해결

**권장**: `order_item_units.token_id` 유지 (조회 최적화)
- 이유: JOIN 비용 절약
- 정규화 관점에서는 중복이지만, 성능 우선

### 3. `warranties.token_id`와 `order_item_units.token_id` 중복 문제 (미세한 이슈) ⚠️

#### 문제
```sql
warranties.token_id (FK token_master)
order_item_units.token_id (FK token_master)
```
- 같은 `token_id`가 여러 테이블에 저장됨

#### 해결 방법
- 정규화 관점에서는 중복이지만, 조회 최적화를 위해 허용 가능

**권장**: 그대로 유지 (조회 성능 우선)
- 이유: JOIN 비용 절약
- 실무에서는 성능이 더 중요

---

## ✅ 제시된 스펙의 좋은 부분

### 1. SSOT 3중 분리 원칙 ⭐⭐⭐⭐⭐
**매우 우수**: 상태가 섞이지 않아 버그 위험 최소화

### 2. `order_item_units` 테이블 도입 ⭐⭐⭐⭐⭐
**필수**: 실물 단위 추적 가능, 부분 배송/부분 환불 처리 가능

### 3. paid 시점 warranty 생성 ⭐⭐⭐⭐⭐
**정책과 기술의 일치**: 환불 정책을 기술적으로 보장

### 4. claim과 active 분리 ⭐⭐⭐⭐⭐
**명확한 UX**: 비회원 구매 후 계정 연동과 활성화 분리

### 5. 단방향 참조 원칙 ⭐⭐⭐⭐⭐
**데이터 일관성**: 양방향 참조 문제 해결

### 6. `paid_events` 멱등성 락 ⭐⭐⭐⭐⭐
**안전성**: 중복 실행 방지

### 7. `shipments` 테이블 분리 ⭐⭐⭐⭐⭐
**확장성**: 부분 배송, 복수 박스, 송장 수정 이력 관리 가능

---

## 💡 추가되면 좋을 부분

### 1. 관리자 알림 시스템 ⭐⭐⭐⭐
**제안**:
- 재고 부족 알림
- 환불 요청 알림
- 양도 요청 알림

**구현 방법**:
```sql
CREATE TABLE admin_notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  type ENUM('stock_low', 'refund_request', 'transfer_request'),
  order_id INT NULL,
  warranty_id INT NULL,
  message TEXT,
  status ENUM('unread', 'read'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. 감사 로그 시스템 ⭐⭐⭐⭐
**제안**:
- 상태 변경 이력
- 소유권 변경 이력
- 환불 이력

**구현 방법**:
```sql
CREATE TABLE audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  table_name VARCHAR(50),
  record_id INT,
  action ENUM('create', 'update', 'delete'),
  old_values JSON,
  new_values JSON,
  user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. 배치 처리 최적화 ⭐⭐⭐⭐
**제안**:
- `order_item_units` 배치 INSERT
- `warranties` 배치 INSERT
- `FOR UPDATE SKIP LOCKED` 사용

**이미 스펙에 반영됨**: ✅

### 4. 에러 처리 강화 ⭐⭐⭐⭐
**제안**:
- 재고 부족 시 관리자 알림
- paid 처리 실패 시 롤백 및 알림
- 부분 실패 처리 (일부 unit만 실패 시)

**구현 방법**:
```javascript
try {
  await processPaidOrder({ orderId, paymentKey, source });
} catch (error) {
  if (error.message === '재고 부족') {
    // 관리자 알림
    await notifyAdmin('재고 부족', { orderId });
    // 주문 상태를 'paid_but_out_of_stock'로 변경
    await connection.execute(
      'UPDATE orders SET status = ? WHERE order_id = ?',
      ['paid_but_out_of_stock', orderId]
    );
  }
  throw error;
}
```

### 5. 성능 모니터링 ⭐⭐⭐
**제안**:
- paid 처리 시간 모니터링
- 재고 배정 시간 모니터링
- 트랜잭션 타임아웃 설정

**구현 방법**:
```javascript
const startTime = Date.now();
await processPaidOrder({ orderId, paymentKey, source });
const duration = Date.now() - startTime;

if (duration > 5000) {
  Logger.warn('paid 처리 시간 초과', { orderId, duration });
}
```

---

## 🎯 최종 권장사항

### 즉시 구현 가능한 부분 (우선순위 높음)
1. ✅ **paid 처리 트랜잭션**: `processPaidOrder()` 함수 구현
2. ✅ **order_item_units 테이블**: 신규 생성
3. ✅ **stock_units 테이블**: 신규 생성
4. ✅ **비회원 주문 지원**: `guest_orders`, `guest_order_access_tokens`, `claim_tokens` 테이블 생성

### 점진적 마이그레이션 (우선순위 중간)
1. ⚠️ **warranties 테이블 마이그레이션**: `user_id` → `owner_user_id`
2. ⚠️ **warranties 테이블 마이그레이션**: `token` → `token_id`
3. ⚠️ **QR 스캔 로직 수정**: warranty 생성 → 조회만

### 선택적 개선 (우선순위 낮음)
1. 💡 **관리자 알림 시스템**: 재고 부족, 환불 요청 등
2. 💡 **감사 로그 시스템**: 상태 변경 이력
3. 💡 **성능 모니터링**: 처리 시간 추적

---

## 📋 구현 체크리스트

### Phase 1: 신규 테이블 생성
- [ ] `order_item_units` 테이블 생성
- [ ] `stock_units` 테이블 생성
- [ ] `guest_orders` 테이블 생성
- [ ] `guest_order_access_tokens` 테이블 생성
- [ ] `claim_tokens` 테이블 생성
- [ ] `paid_events` 테이블 생성
- [ ] `shipments` 테이블 생성
- [ ] `shipment_units` 테이블 생성
- [ ] `refund_requests` 테이블 생성 (선택)

### Phase 2: 기존 테이블 수정
- [ ] `orders.guest_id` 컬럼 추가
- [ ] `orders.user_id` NULL 허용 확인 및 변경
- [ ] `orders_idempotency.user_id` NULL 허용
- [ ] `orders_idempotency.guest_id` 컬럼 추가
- [ ] `warranties.owner_user_id` 컬럼 추가
- [ ] `warranties.status` 컬럼 추가
- [ ] `warranties.source_order_item_unit_id` 컬럼 추가
- [ ] `warranties.activated_at` 컬럼 추가
- [ ] `warranties.revoked_at` 컬럼 추가
- [ ] `warranties.token_id` 컬럼 추가
- [ ] `token_master.id` 컬럼 추가 (PK autoinc)
- [ ] `token_master.status` 컬럼 추가

### Phase 3: 백엔드 로직 구현
- [ ] `processPaidOrder()` 함수 구현
- [ ] `POST /api/payments/confirm`에 `processPaidOrder()` 호출 추가
- [ ] `POST /api/payments/webhook`에 `processPaidOrder()` 호출 추가
- [ ] `POST /api/orders` 비회원 지원 (optionalAuth)
- [ ] `GET /guest/orders/:token` 구현
- [ ] `POST /api/orders/:orderId/claim` 구현
- [ ] `POST /api/warranties/:id/activate` 구현
- [ ] `GET /a/:token` 수정 (warranty 생성 → 조회만)
- [ ] `POST /api/refunds/request` 구현
- [ ] `POST /api/admin/shipments` 구현

### Phase 4: 기존 데이터 마이그레이션 (선택)
- [ ] 기존 `warranties.user_id` → `owner_user_id` 마이그레이션
- [ ] 기존 `warranties.token` → `token_id` 마이그레이션
- [ ] 기존 `warranties.status` 설정 (기존 데이터는 'active'로 간주)

### Phase 5: 기존 로직 제거 (안정화 후)
- [ ] `POST /a/:token`에서 warranty 생성 로직 제거
- [ ] `warranties.user_id` 컬럼 삭제
- [ ] `warranties.token` 컬럼 삭제 (또는 deprecated로 표시)

---

## 🔍 제시된 스펙 검증 결과

### ✅ 검증 통과
- SSOT 3중 분리 원칙
- 단방향 참조 원칙
- paid 시점 warranty 생성
- claim과 active 분리
- 멱등성 처리

### ⚠️ 수정 필요 (이미 스펙에 반영됨)
- `paid_events.order_id UNIQUE` → `idempotency_key UNIQUE` 권장
- MySQL 부분 UNIQUE 인덱스 → 애플리케이션 레벨 검증

### 💡 추가 권장사항
- 배치 INSERT 최적화
- FOR UPDATE SKIP LOCKED 사용
- 관리자 알림 시스템
- 감사 로그 시스템

---

## 📝 결론

**제시된 스펙은 매우 우수하며, 현재 시스템과의 호환성도 좋습니다.**

**주요 발견사항**:
1. ✅ 기존 QR 코드 시스템은 그대로 활용 가능 (조회 부분)
2. ✅ 기존 주문/결제 로직은 그대로 활용 가능 (paid 처리 트랜잭션만 추가)
3. ⚠️ 보증서 생성 시점 변경 필요 (QR 스캔 → paid 시점)
4. ⚠️ 비회원 주문 지원 추가 필요
5. ✅ 점진적 마이그레이션 전략으로 안전하게 전환 가능

**구현 난이도**: 중간 (기존 코드 재사용 가능)
**구현 시간**: 예상 2-3주 (테이블 생성 + 로직 구현 + 테스트)

**재사용 가능한 코드**: 약 80-90%
- QR 코드 인증: 90% 재사용 가능
- 주문 생성: 80% 재사용 가능
- 결제 확인: 85% 재사용 가능
- 웹훅 처리: 85% 재사용 가능

**신규 구현 필요**: 약 10-20%
- `processPaidOrder()` 함수: 신규 구현
- 비회원 주문 로직: 신규 구현
- `order_item_units` 생성 로직: 신규 구현
- 재고 배정 로직: 신규 구현






