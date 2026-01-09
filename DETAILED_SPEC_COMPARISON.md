# 제시된 스펙 vs 현재 시스템 상세 비교 분석

## 📊 현재 시스템 구조 상세 확인

### ✅ 현재 존재하는 핵심 테이블

#### 1. `orders` 테이블
**현재 구조**:
```sql
order_id (PK, INT AUTO_INCREMENT)
user_id (FK, INT) -- NULL 허용 여부 확인 필요 ⚠️
order_number (UNIQUE, VARCHAR(32))
status (VARCHAR(50)) -- pending/confirmed/processing/shipped/delivered/cancelled/refunded
total_price (DECIMAL(10,2))
shipping_first_name, shipping_last_name
shipping_email, shipping_phone
shipping_address, shipping_city, shipping_postal_code, shipping_country
shipping_method, shipping_cost
estimated_delivery
created_at, updated_at
```

**제시된 스펙과 비교**:
- ✅ `order_number` UNIQUE 존재
- ✅ `status` 존재 (값은 약간 다를 수 있음)
- ⚠️ `user_id` NULL 허용 여부 확인 필요 (비회원 지원을 위해 필요)
- ❌ `guest_id` 컬럼 없음 (추가 필요)
- ✅ 배송 정보 컬럼 존재

**활용 방안**: 
- ✅ 기본 구조는 그대로 활용 가능
- ⚠️ `guest_id` 컬럼만 추가하면 됨

#### 2. `order_items` 테이블
**현재 구조**:
```sql
order_item_id (PK, INT AUTO_INCREMENT)
order_id (FK, INT)
product_id (VARCHAR(50))
product_name, product_image
size, color
quantity (INT) -- ⚠️ 표시용/계산용으로 유지
unit_price, subtotal
created_at
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ⚠️ `quantity`는 유지 (표시용/계산용)
- ❌ `stock_unit_id` 없음 (추가 불필요 - order_item_units로 분리)

**활용 방안**:
- ✅ 그대로 활용 가능
- ⚠️ `order_item_units` 테이블과 병행 사용

#### 3. `warranties` 테이블
**현재 구조**:
```sql
id (PK, INT AUTO_INCREMENT)
user_id (FK, INT NOT NULL) -- ⚠️ 비회원 불가
token (UNIQUE, VARCHAR(20)) -- ⚠️ token_id가 아님
public_id (UNIQUE, CHAR(36)) -- UUID
product_name (VARCHAR(255))
verified_at (DATETIME) -- ⚠️ issued_at과 의미 다름
created_at (DATETIME)
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ⚠️ `user_id` → `owner_user_id`로 변경 필요 (NULL 허용)
- ⚠️ `token` → `token_id` (FK)로 변경 필요
- ❌ `status` 컬럼 없음 (추가 필요)
- ❌ `source_order_item_unit_id` 없음 (추가 필요)
- ❌ `activated_at` 없음 (추가 필요)
- ❌ `revoked_at` 없음 (추가 필요)
- ⚠️ `verified_at` → `issued_at`으로 의미 변경 또는 별도 컬럼 추가

**활용 방안**:
- ✅ `public_id`는 그대로 활용 가능 (외부 노출용)
- ✅ `product_name`은 그대로 활용 가능
- ⚠️ 마이그레이션 필요 (user_id → owner_user_id, token → token_id)

#### 4. `token_master` 테이블
**현재 구조**:
```sql
token (PK, VARCHAR(20)) -- ⚠️ id가 아님
internal_code (VARCHAR(100))
product_name (VARCHAR(255))
is_blocked (TINYINT(1))
owner_user_id (INT NULL) -- ⚠️ 레거시, 사용 금지
owner_warranty_public_id (FK, CHAR(36)) -- ⚠️ 레거시, 사용 금지
scan_count (INT)
first_scanned_at, last_scanned_at (DATETIME)
created_at, updated_at (DATETIME)
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ⚠️ `token`을 PK로 유지 (기존 호환성)
- ⚠️ `id` (PK autoinc) 추가 권장 (내부 FK용)
- ❌ `status` 컬럼 없음 (추가 필요)
- ⚠️ `owner_user_id`, `owner_warranty_public_id`는 레거시로 유지하되 사용 금지

**활용 방안**:
- ✅ `token` PK는 그대로 활용 가능
- ✅ `internal_code`, `product_name`은 그대로 활용 가능
- ✅ `scan_count`, `first_scanned_at`, `last_scanned_at`은 그대로 활용 가능
- ⚠️ `id` (PK autoinc) 추가 권장

#### 5. `orders_idempotency` 테이블
**현재 구조**:
```sql
id (PK, BIGINT AUTO_INCREMENT)
user_id (INT NOT NULL) -- ⚠️ 비회원 불가
idem_key (VARCHAR(64))
order_number (VARCHAR(32))
created_at (DATETIME)
UNIQUE(user_id, idem_key)
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ⚠️ `user_id` NULL 허용 필요 (비회원 지원)
- ❌ `guest_id` 컬럼 추가 필요

**활용 방안**:
- ✅ 기본 구조는 그대로 활용 가능
- ⚠️ `user_id` NULL 허용 및 `guest_id` 추가 필요

#### 6. `payments` 테이블
**현재 구조**:
```sql
id (PK)
order_number (VARCHAR(32))
gateway (VARCHAR(50)) -- mock/toss
payment_key (VARCHAR(255))
status (VARCHAR(50)) -- captured/authorized/failed
amount (DECIMAL(10,2))
currency (VARCHAR(10))
payload_json (TEXT)
created_at, updated_at
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ✅ 그대로 활용 가능

---

## 🔍 제시된 스펙의 새 테이블들 (신규 생성 필요)

### 1. `order_item_units` 테이블 ⭐⭐⭐⭐⭐ (핵심)
**목적**: 실물 단위 추적 (quantity > 1인 경우 분해)

**현재 시스템**: 없음

**필요성**: 매우 높음
- 부분 배송/부분 환불 처리 불가
- 실물별 상태 관리 불가
- 재고-토큰-보증서 1:1 매칭 불가

**구현 난이도**: 중간
- 테이블 생성은 간단
- paid 처리 로직에서 quantity만큼 생성하는 로직 필요

### 2. `stock_units` 테이블 ⭐⭐⭐⭐⭐ (핵심)
**목적**: 재고 단위 관리 (시리얼/바코드)

**현재 시스템**: 없음

**필요성**: 매우 높음
- 재고 배정 불가
- 시리얼/바코드 관리 불가
- 재고 상태 관리 불가

**구현 난이도**: 높음
- xlsx 업로드로 재고 등록 기능 필요
- 재고 배정 로직 필요

### 3. `guest_orders` 테이블 ⭐⭐⭐⭐
**목적**: 비회원 주문 메타 정보

**현재 시스템**: 없음

**필요성**: 높음 (비회원 주문 지원 필수)

**구현 난이도**: 낮음
- 단순 메타 정보 저장

### 4. `guest_order_access_tokens` 테이블 ⭐⭐⭐⭐
**목적**: 비회원 주문 조회 토큰 (read-only)

**현재 시스템**: 없음

**필요성**: 높음 (비회원 주문 조회 필수)

**구현 난이도**: 낮음
- 토큰 생성/검증 로직 필요

### 5. `claim_tokens` 테이블 ⭐⭐⭐⭐
**목적**: 계정 연동 토큰 (1회용, 짧은 TTL)

**현재 시스템**: 없음

**필요성**: 높음 (비회원 주문 연동 필수)

**구현 난이도**: 낮음
- 토큰 생성/검증/만료 처리 로직 필요

### 6. `paid_events` 테이블 ⭐⭐⭐⭐⭐ (핵심)
**목적**: paid 처리 멱등성 락

**현재 시스템**: 없음

**필요성**: 매우 높음
- 중복 실행 방지 필수
- 재고 중복 배정 방지
- 보증서 중복 생성 방지

**구현 난이도**: 낮음
- 단순 UNIQUE 제약으로 해결

### 7. `shipments` 테이블 ⭐⭐⭐⭐
**목적**: 배송 관리 (택배사/송장번호)

**현재 시스템**: 없음 (orders에 직접 저장 가능하지만 분리 권장)

**필요성**: 높음
- 부분 배송 지원
- 복수 박스 지원
- 송장 수정 이력 관리

**구현 난이도**: 중간
- 테이블 생성은 간단
- 관리자 출고 로직 필요

### 8. `shipment_units` 테이블 ⭐⭐⭐⭐
**목적**: 배송-실물 매핑

**현재 시스템**: 없음

**필요성**: 높음 (부분 배송 지원 필수)

**구현 난이도**: 낮음
- 단순 매핑 테이블

### 9. `refund_requests` 테이블 ⭐⭐⭐ (선택)
**목적**: 환불 요청 관리

**현재 시스템**: 없음

**필요성**: 중간 (운영 편의)

**구현 난이도**: 낮음
- 단순 요청 관리 테이블

---

## ✅ 현재 시스템에서 살려서 이용할 수 있는 부분

### 1. QR 코드 인증 시스템 (`/a/:token`) ⭐⭐⭐⭐⭐

#### 현재 구현 위치
- `backend/auth-routes.js` 182-748줄
- GET `/a/:token`: 보증서 열람
- POST `/a/:token`: 보증서 생성 (현재)

#### 활용 방안
**✅ 그대로 활용 가능한 부분**:
```javascript
// 1. 토큰 검증 로직
const [tokenMasterRows] = await connection.execute(
  'SELECT * FROM token_master WHERE token = ?',
  [token]
);

// 2. 가품 경고 로직
if (tokenMasterRows.length === 0 || tokenMaster.is_blocked === 1) {
  return res.status(400).render('fake', { title: '가품 경고' });
}

// 3. 로그인 체크
requireAuthForHTML // 그대로 사용 가능

// 4. 스캔 카운트 업데이트
UPDATE token_master SET scan_count = scan_count + 1, ...
```

**⚠️ 수정 필요한 부분**:
```javascript
// 현재: POST /a/:token에서 warranty 생성
// 수정: warranty는 이미 paid 시점에 생성되어 있으므로, 조회만 수행

// 기존 코드 (제거 필요):
await connection.execute(
  'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  [userId, token, publicId, productName, utcDateTime, utcDateTime]
);

// 새 코드 (조회만):
const [warranty] = await connection.execute(
  `SELECT w.*, tm.product_name 
   FROM warranties w
   JOIN token_master tm ON w.token_id = tm.token
   WHERE w.token_id = ? AND w.owner_user_id = ?`,
  [token, userId]
);
```

**결론**: 
- ✅ GET `/a/:token`은 그대로 활용 가능 (조회 로직만 수정)
- ❌ POST `/a/:token`의 warranty 생성 로직은 제거 필요
- ✅ 활성화는 `POST /api/warranties/:id/activate`에서만 수행

### 2. 주문 생성 로직 (`POST /api/orders`) ⭐⭐⭐⭐

#### 현재 구현 위치
- `backend/order-routes.js` 367-643줄

#### 활용 방안
**✅ 그대로 활용 가능한 부분**:
```javascript
// 1. 주문번호 생성 로직
async function generateOrderNumber(connection, maxRetries = 3) {
  // 그대로 활용 가능
}

// 2. Idempotency 처리
const [idemRows] = await connection.execute(
  'SELECT order_number FROM orders_idempotency WHERE user_id = ? AND idem_key = ?',
  [userId, idemKey]
);

// 3. 주문 검증 로직
const validationErrors = validateOrderRequest(req);
// 그대로 활용 가능

// 4. 트랜잭션 처리
await connection.beginTransaction();
// 그대로 활용 가능
```

**⚠️ 수정 필요한 부분**:
```javascript
// 현재: authenticateToken 필수
router.post('/orders', authenticateToken, verifyCSRF, ...)

// 수정: optionalAuth로 변경
router.post('/orders', optionalAuth, verifyCSRF, ...)

// 현재: user_id만 처리
const userId = req.user?.userId || null;

// 수정: 비회원 지원 추가
const userId = req.user?.userId || null;
let guestId = null;

if (!userId) {
  // 비회원 주문 처리
  guestId = generateGuestId(); // UUID 등
  await connection.execute(
    'INSERT INTO guest_orders (guest_id, order_id, email, ...) VALUES (?, ?, ?, ...)',
    [guestId, orderId, shipping.email, ...]
  );
}

// orders 테이블에 저장
await connection.execute(
  'INSERT INTO orders (user_id, guest_id, order_number, ...) VALUES (?, ?, ?, ...)',
  [userId, guestId, orderNumber, ...]
);
```

**결론**: 
- ✅ 기본 로직은 그대로 활용 가능
- ⚠️ 비회원 지원 추가 필요
- ✅ Idempotency 로직은 그대로 활용 가능 (guest_id 지원 추가 필요)

### 3. 결제 확인 로직 (`POST /api/payments/confirm`) ⭐⭐⭐⭐

#### 현재 구현 위치
- `backend/payments-routes.js` 64-386줄

#### 활용 방안
**✅ 그대로 활용 가능한 부분**:
```javascript
// 1. 토스 API 호출 로직
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
```

**❌ 추가 필요한 부분**:
```javascript
// paid 처리 트랜잭션 호출 추가
await processPaidOrder({
  orderId: order.order_id,
  paymentKey: paymentKey,
  source: 'confirm'
});
```

**결론**: 
- ✅ 기본 로직은 그대로 활용 가능
- ❌ `processPaidOrder()` 함수 호출만 추가하면 됨

### 4. 웹훅 처리 로직 (`POST /api/payments/webhook`) ⭐⭐⭐⭐

#### 현재 구현 위치
- `backend/payments-routes.js` 697-765줄

#### 활용 방안
**✅ 그대로 활용 가능한 부분**:
```javascript
// 1. 서명 검증 로직 (현재는 재조회 검증 사용)
const verifiedPayment = await verifyPaymentWithToss(paymentKey);
// 그대로 활용 가능

// 2. 멱등성 처리
const [existingPayments] = await connection.execute(
  'SELECT status FROM payments WHERE payment_key = ?',
  [paymentKey]
);
// 그대로 활용 가능

// 3. payments 테이블 업데이트
await connection.execute(
  'UPDATE payments SET status = ?, updated_at = NOW() WHERE payment_key = ?',
  [paymentStatus, paymentKey]
);
// 그대로 활용 가능
```

**❌ 추가 필요한 부분**:
```javascript
// paid 처리 트랜잭션 호출 추가
if (paymentStatus === 'captured') {
  await processPaidOrder({
    orderId: verifiedOrderId,
    paymentKey: paymentKey,
    source: 'webhook'
  });
}
```

**결론**: 
- ✅ 기본 로직은 그대로 활용 가능
- ❌ `processPaidOrder()` 함수 호출만 추가하면 됨

---

## ⚠️ 갈아엎고 새로 해야 하는 부분

### 1. 보증서 생성 시점 변경 (필수) 🔴

#### 현재 구현
**위치**: `backend/auth-routes.js` 247-292줄, 621-624줄

**현재 로직**:
```javascript
// QR 스캔 시점에 warranty 생성
if (isFirstScan) {
  // 보증서 자동 발급
  await connection.execute(
    'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, token, publicId, productName, utcDateTime, utcDateTime]
  );
}
```

#### 제시된 스펙 로직
**위치**: `processPaidOrder()` 함수 내부

**새 로직**:
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

#### 변경 영향
- ❌ **현재 QR 스캔 로직 대폭 수정 필요**
- ❌ **`processPaidOrder()` 함수 신규 구현 필요**
- ⚠️ **기존 보증서는 그대로 유지** (마이그레이션 불필요)

#### 구현 방법
```javascript
// 1. processPaidOrder() 함수 신규 구현
// backend/payments-routes.js 또는 별도 파일
async function processPaidOrder({ orderId, paymentKey, source }) {
  // paid_events 멱등성 락
  // 재고 배정
  // order_item_units 생성
  // warranties 생성 (paid 시점)
}

// 2. POST /api/payments/confirm에 추가
await processPaidOrder({
  orderId: order.order_id,
  paymentKey: paymentKey,
  source: 'confirm'
});

// 3. POST /api/payments/webhook에 추가
if (paymentStatus === 'captured') {
  await processPaidOrder({
    orderId: verifiedOrderId,
    paymentKey: paymentKey,
    source: 'webhook'
  });
}

// 4. POST /a/:token 수정 (warranty 생성 제거)
// 기존: warranty 생성
// 수정: warranty 조회만 수행
```

### 2. QR 스캔 로직 변경 (필수) 🔴

#### 현재 구현
**위치**: `backend/auth-routes.js` 182-479줄

**현재 동작**:
1. GET `/a/:token`: 토큰 검증 → 보증서 조회 또는 생성
2. POST `/a/:token`: 보증서 생성 (첫 스캔 시)

#### 제시된 스펙 동작
1. GET `/a/:token`: 보증서 조회만 (이미 생성되어 있음)
2. 활성화는 `POST /api/warranties/:id/activate`에서만

#### 변경 영향
- ❌ **POST `/a/:token`의 warranty 생성 로직 제거 필요**
- ❌ **GET `/a/:token`의 warranty 생성 로직 제거 필요**
- ✅ **보증서 조회 로직은 그대로 활용 가능**

#### 구현 방법
```javascript
// GET /a/:token 수정
router.get('/a/:token', authLimiter, requireAuthForHTML, async (req, res) => {
  const token = req.params.token;
  const userId = req.user.userId;
  
  // 1. 토큰 검증 (기존 로직 그대로)
  const [tokenMasterRows] = await connection.execute(
    'SELECT * FROM token_master WHERE token = ?',
    [token]
  );
  
  if (tokenMasterRows.length === 0 || tokenMaster.is_blocked === 1) {
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
    // 보증서가 없으면 (비회원 주문 등) 에러 처리
    return res.status(404).render('error', { message: '보증서를 찾을 수 없습니다.' });
  }
  
  // 3. 보증서 상세 페이지 렌더링
  return res.render('warranty-detail', { warranty: warranty[0] });
});

// POST /a/:token 제거 또는 비활성화
// 또는 활성화 API로 변경
router.post('/a/:token', authLimiter, authenticateToken, async (req, res) => {
  // 활성화는 POST /api/warranties/:id/activate로 리다이렉트
  // 또는 여기서 활성화 처리 (하지만 스펙상 별도 API 권장)
});
```

### 3. 비회원 주문 지원 (필수) 🔴

#### 현재 구현
**위치**: `backend/order-routes.js` 367줄

**현재 동작**:
```javascript
router.post('/orders', authenticateToken, verifyCSRF, ...)
// authenticateToken이 필수이므로 비회원 불가
```

#### 제시된 스펙 동작
```javascript
router.post('/orders', optionalAuth, verifyCSRF, ...)
// optionalAuth로 변경하여 비회원 지원
```

#### 변경 영향
- ❌ **`authenticateToken` → `optionalAuth` 변경 필요**
- ❌ **`guest_id` 생성 로직 추가 필요**
- ❌ **`guest_orders` 테이블 생성 필요**
- ❌ **`guest_order_access_tokens` 테이블 생성 필요**
- ❌ **`claim_tokens` 테이블 생성 필요**

#### 구현 방법
```javascript
// 1. optionalAuth 미들웨어 생성 (또는 기존 auth-middleware.js 수정)
function optionalAuth(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    req.user = null; // 비회원
    return next();
  }
  
  // 토큰 검증 (기존 authenticateToken 로직)
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      req.user = null; // 비회원
      return next();
    }
    req.user = decoded;
    next();
  });
}

// 2. 주문 생성 로직 수정
router.post('/orders', optionalAuth, verifyCSRF, ...)

const userId = req.user?.userId || null;
let guestId = null;

if (!userId) {
  // 비회원 주문 처리
  guestId = uuidv4(); // 또는 다른 방식
  
  // guest_orders 생성은 orders 생성 후에 수행
  await connection.execute(
    'INSERT INTO guest_orders (guest_id, order_id, email, name, phone) VALUES (?, ?, ?, ?, ?)',
    [guestId, orderId, shipping.email, shipping.name, shipping.phone]
  );
  
  // guest_order_access_token 생성
  const accessToken = generateRandomToken();
  await connection.execute(
    'INSERT INTO guest_order_access_tokens (order_id, token, expires_at) VALUES (?, ?, ?)',
    [orderId, accessToken, new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)] // 90일
  );
  
  // claim_token 생성
  const claimToken = generateRandomToken();
  await connection.execute(
    'INSERT INTO claim_tokens (order_id, token, expires_at) VALUES (?, ?, ?)',
    [orderId, claimToken, new Date(Date.now() + 15 * 60 * 1000)] // 15분
  );
}

// orders 테이블에 저장
await connection.execute(
  'INSERT INTO orders (user_id, guest_id, order_number, ...) VALUES (?, ?, ?, ...)',
  [userId, guestId, orderNumber, ...]
);
```

---

## 🗑️ 원래 있던 걸 삭제해야 하는 부분

### 1. `warranties.user_id` 컬럼 (마이그레이션 후 삭제) 🔴

#### 현재 상태
```sql
warranties.user_id (INT NOT NULL)
```

#### 제시된 스펙
```sql
warranties.owner_user_id (INT NULL)
```

#### 삭제 방법
```sql
-- 1단계: owner_user_id 추가
ALTER TABLE warranties 
  ADD COLUMN owner_user_id INT NULL COMMENT '소유자 (기존 user_id에서 마이그레이션)';

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

### 2. `warranties.token` → `warranties.token_id` 변경 🔴

#### 현재 상태
```sql
warranties.token (VARCHAR(20) UNIQUE)
```

#### 제시된 스펙
```sql
warranties.token_id (FK to token_master.token)
```

#### 변경 방법
```sql
-- 1단계: token_id 추가
ALTER TABLE warranties 
  ADD COLUMN token_id VARCHAR(20) NULL COMMENT '토큰 (FK to token_master.token)';

-- 2단계: 기존 데이터 마이그레이션
UPDATE warranties w
JOIN token_master tm ON w.token = tm.token
SET w.token_id = tm.token;

-- 3단계: FK 추가
ALTER TABLE warranties
  ADD FOREIGN KEY (token_id) REFERENCES token_master(token) ON DELETE SET NULL;

-- 4단계: token 컬럼 삭제 (또는 유지하되 deprecated로 표시)
-- 옵션 A: 삭제
ALTER TABLE warranties DROP COLUMN token;

-- 옵션 B: 유지 (deprecated)
ALTER TABLE warranties 
  MODIFY COLUMN token VARCHAR(20) COMMENT 'DEPRECATED: Use token_id instead';
```

**권장**: 옵션 B (유지)
- 이유: 기존 코드와의 호환성
- 점진적 마이그레이션 가능

### 3. `warranties.verified_at` → `warranties.issued_at` 변경 (선택) 🟡

#### 현재 상태
```sql
warranties.verified_at (DATETIME)
```

#### 제시된 스펙
```sql
warranties.issued_at (DATETIME)
```

#### 변경 방법
```sql
-- 옵션 A: 컬럼명 변경
ALTER TABLE warranties 
  CHANGE COLUMN verified_at issued_at DATETIME;

-- 옵션 B: 새 컬럼 추가 후 마이그레이션
ALTER TABLE warranties 
  ADD COLUMN issued_at DATETIME NULL;
  
UPDATE warranties 
SET issued_at = verified_at 
WHERE issued_at IS NULL;

-- 이후 verified_at 삭제 (선택)
```

**권장**: 옵션 A (컬럼명 변경)
- 이유: 의미가 동일함 (발급 = 검증)

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






