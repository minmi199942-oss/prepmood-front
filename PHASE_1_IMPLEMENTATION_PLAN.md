# Phase 1: 비회원 주문 생성 API 구현 계획

**최종 업데이트**: 2026-01-16  
**기준 문서**: `SYSTEM_FLOW_DETAILED.md`, `FINAL_EXECUTION_SPEC_REVIEW.md`  
**검증**: GPT 검증 완료, 우선순위 및 분석 정확성 확인

---

## 📋 전제 검증 (핵심 불변식)

### SYSTEM_FLOW_DETAILED.md 핵심 원칙
> **Warranty는 QR 스캔이 아니라 "결제 확정(processPaidOrder)"에서만 생성된다**

### 현재 상태 확인
- ✅ `processPaidOrder()`에서 warranty 생성 → **정상**
- ❌ QR 스캔 로직에 warranty 생성 흔적 존재 → **제거 대상** (Phase 3에서 처리)
- ❌ 주문 생성 API가 비회원 흐름을 막고 있음 → **가장 치명적** (Phase 1에서 처리)

### 결론
**주문 생성 → 결제 → warranty 생성** 이 축이 먼저 완성되어야 한다.

---

## 🎯 Phase 1: 비회원 주문 생성 API (최우선)

### 왜 최우선인가?
1. **모든 흐름의 시작점**: 이후 단계(조회, QR, claim, activation, transfer) 전부 여기에 의존
2. **현재 상태로는 "비회원 주문"이 논리적으로 불완전**
3. **가장 치명적인 블로커**: 지금 상태로는 비회원 주문이 불가능

---

## 📝 작업 목록

### 1. 백엔드: `optionalAuth` 미들웨어 개선

#### 현재 상태
- ✅ `optionalAuth` 미들웨어 존재 (`backend/auth-middleware.js` 93-117줄)
- ❌ `req.authType` 플래그 없음 (명시적 구분 불가)

#### 개선 사항
```javascript
// backend/auth-middleware.js
function optionalAuth(req, res, next) {
    const token = req.cookies?.accessToken;
    
    if (!token) {
        // 토큰 없음 - 비로그인 상태로 진행
        req.user = null;
        req.authType = 'anonymous'; // ✅ 추가: 명시적 플래그
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            name: decoded.name
        };
        req.authType = 'user'; // ✅ 추가: 명시적 플래그
        console.log(`✅ 선택적 인증 성공: ${decoded.email}`);
    } catch (error) {
        // 토큰이 유효하지 않아도 에러 없이 진행
        console.log(`⚠️ 선택적 인증 실패 (무시): ${error.message}`);
        req.user = null;
        req.authType = 'anonymous'; // ✅ 추가: 명시적 플래그
    }
    
    next();
}
```

**이점**:
- `req.authType`으로 명시적 구분 가능 (`'user' | 'anonymous'`)
- 디버깅 및 로깅 용이
- 향후 `'guest'` 세션 타입 추가 시 확장 용이

---

### 2. 백엔드: 주문 생성 API 수정

#### 현재 상태
- ❌ `authenticateToken` 사용 중 (`backend/order-routes.js` 404줄)
- ❌ `user_id` 기반 idempotency만 처리 (443-445줄)
- ❌ `guest_id` 생성 로직 없음

#### 수정 사항

**2-1. 미들웨어 변경**
```javascript
// backend/order-routes.js 404줄
// 변경 전
router.post('/orders', authenticateToken, verifyCSRF, orderCreationLimiter, async (req, res) => {

// 변경 후
router.post('/orders', optionalAuth, verifyCSRF, orderCreationLimiter, async (req, res) => {
```

**2-2. `guest_id` 생성 로직 추가**
```javascript
// backend/order-routes.js (주문 생성 로직 내부)
const userId = req.user?.userId || null;
let guestId = null;
let ownerKey = null;

// 비회원 주문 처리
if (!userId) {
    // guest_id 생성 (UUID v4 또는 다른 방식)
    guestId = uuidv4(); // 또는 'guest_' + crypto.randomBytes(10).toString('hex')
    ownerKey = `g:${guestId}`;
} else {
    ownerKey = `u:${userId}`;
}
```

**2-3. Idempotency 처리 수정 (`owner_key` 방식)**
```javascript
// backend/order-routes.js (기존 442-445줄 수정)
// 변경 전
const [idemRows] = await connection.execute(
    'SELECT order_number FROM orders_idempotency WHERE user_id = ? AND idem_key = ? LIMIT 1',
    [userId, idemKey]
);

// 변경 후
const [idemRows] = await connection.execute(
    'SELECT order_number FROM orders_idempotency WHERE owner_key = ? AND idem_key = ? LIMIT 1',
    [ownerKey, idemKey]
);
```

**2-4. 주문 생성 시 `guest_id` 저장**
```javascript
// backend/order-routes.js (주문 INSERT 부분)
await connection.execute(
    `INSERT INTO orders 
     (user_id, guest_id, order_number, total_price, status, ...) 
     VALUES (?, ?, ?, ?, 'pending', ...)`,
    [userId, guestId, orderNumber, totalPrice, ...]
);
```

**2-5. Idempotency 기록 수정**
```javascript
// backend/order-routes.js (주문 생성 후)
await connection.execute(
    'INSERT IGNORE INTO orders_idempotency (owner_key, idem_key, order_number) VALUES (?, ?, ?)',
    [ownerKey, idemKey, orderNumber]
);
```

**2-6. `guest_order_access_tokens` 생성 (paid 처리 시)**
- ⚠️ **주의**: `guest_order_access_tokens`는 **paid 처리 시점**에 생성되어야 함
- `processPaidOrder()` 함수 내부에서 처리 (별도 작업)
- 이 단계에서는 주문 생성만 완료

---

### 3. 프론트엔드: 비회원 주문 지원

#### 현재 상태
- ❌ `checkout-script.js`에서 로그인 체크 (`window.miniCart.isLoggedIn` 확인)
- ❌ 비회원 주문 분기 없음

#### 수정 사항

**3-1. 로그인 체크 제거 또는 Optional 처리**
```javascript
// checkout-script.js (초기화 부분)
// 변경 전
if (!window.miniCart.isLoggedIn) {
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return;
}

// 변경 후
// 로그인 체크 제거 (optionalAuth로 서버에서 처리)
// 비회원도 주문 가능하도록 변경
```

**3-2. 주문 생성 요청 수정**
```javascript
// checkout-script.js (주문 생성 API 호출 부분)
async function createOrder(orderData) {
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': generateIdempotencyKey(), // ✅ 필수
                'X-CSRF-Token': getCSRFToken() // ✅ CSRF 토큰
            },
            credentials: 'include', // ✅ 쿠키 전송 (회원/비회원 모두)
            body: JSON.stringify(orderData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '주문 생성 실패');
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('주문 생성 실패:', error);
        throw error;
    }
}
```

**3-3. Guest Access Token 저장 위치 명확화**
```javascript
// checkout-script.js (주문 완료 후)
// ⚠️ 중요: guest_order_access_token은 paid 처리 완료 후 서버에서 발급
// 프론트엔드에서는 주문 완료 후 주문 상세 페이지로 이동
// 주문 상세 페이지에서 토큰을 받아서 저장

// 옵션 1: localStorage 사용 (90일 유효기간 고려)
localStorage.setItem(`guest_order_token_${orderNumber}`, accessToken);

// 옵션 2: sessionStorage 사용 (세션 종료 시 삭제)
sessionStorage.setItem(`guest_order_token_${orderNumber}`, accessToken);

// ✅ 권장: localStorage (90일 유효기간과 일치)
```

**3-4. 주문 완료 후 처리**
```javascript
// checkout-script.js (결제 완료 후)
async function handlePaymentSuccess(orderNumber, paymentData) {
    // 주문 상세 페이지로 이동
    // 비회원인 경우: /guest/orders.html?order=ORD-...
    // 회원인 경우: /my-orders.html?order=ORD-...
    
    const isGuest = !window.miniCart.isLoggedIn;
    const redirectUrl = isGuest 
        ? `/guest/orders.html?order=${orderNumber}`
        : `/my-orders.html?order=${orderNumber}`;
    
    window.location.href = redirectUrl;
}
```

---

## ⚠️ 주의사항 및 보완점

### 1. `guest_order_access_tokens` 생성 시점
- ❌ **주문 생성 시점에 생성하지 않음**
- ✅ **paid 처리 완료 시점에 생성** (`processPaidOrder()` 함수 내부)
- 이유: 주문이 취소되거나 결제 실패 시 불필요한 토큰 생성 방지

### 2. `owner_key` 형식
- 회원: `u:{user_id}` (예: `u:123`)
- 비회원: `g:{guest_id}` (예: `g:550e8400-e29b-41d4-a716-446655440000`)
- ⚠️ **일관성 유지 필수**: 모든 idempotency 처리에서 동일한 형식 사용

### 3. 프론트엔드 토큰 저장 위치
- ✅ **권장: localStorage** (90일 유효기간과 일치)
- ⚠️ **명확한 네이밍**: `guest_order_token_{orderNumber}` 형식으로 저장
- ⚠️ **만료 처리**: 90일 경과 시 자동 삭제 로직 추가 (선택사항)

### 4. 보안 고려사항
- ✅ CSRF 토큰 필수 (`verifyCSRF` 미들웨어)
- ✅ Idempotency Key 필수 (`X-Idempotency-Key` 헤더)
- ✅ 쿠키 기반 인증 (`credentials: 'include'`)
- ⚠️ **비회원 주문 시 민감 정보 처리**: 이메일, 전화번호 등은 주문 정보로만 사용

---

## 📊 예상 소요 시간

| 작업 | 예상 시간 | 우선순위 |
|------|----------|---------|
| `optionalAuth` 미들웨어 개선 | 30분 | 높음 |
| 주문 생성 API 수정 (백엔드) | 2-3시간 | 최우선 |
| 프론트엔드 비회원 주문 지원 | 1-2시간 | 높음 |
| 테스트 및 검증 | 1시간 | 필수 |
| **총계** | **4-6시간** | - |

---

## ✅ 완료 조건

1. ✅ 비회원이 주문 생성 가능 (로그인 없이)
2. ✅ 회원 주문과 비회원 주문 모두 정상 동작
3. ✅ `owner_key` 기반 idempotency 정상 동작
4. ✅ `guest_id` 정상 생성 및 저장
5. ✅ 프론트엔드에서 비회원 주문 플로우 정상 동작
6. ✅ 주문 완료 후 적절한 페이지로 리다이렉트

---

## 🔄 다음 단계 (Phase 2)

Phase 1 완료 후:
- **Phase 2: 비회원 주문 조회 API** 구현
- `guest_order_access_tokens`를 활용한 주문 상세 조회
- 세션 토큰 교환 방식 구현

---

## 📚 참고 문서

- `SYSTEM_FLOW_DETAILED.md` 1-1절, 1-2절 (주문 생성 흐름)
- `FINAL_EXECUTION_SPEC_REVIEW.md` (실행 스펙)
- `SYSTEM_COMPARISON_ANALYSIS.md` (현재 상태 비교)
