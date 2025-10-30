# 보안 및 안정성 감사 보고서
**생성일**: 2025-10-30  
**대상**: 주문 시스템 전체 (프론트엔드 + 백엔드)

---

## 📋 목차
1. [전체 흐름 분석](#전체-흐름-분석)
2. [보안 취약점 분석](#보안-취약점-분석)
3. [악용 가능성 분석](#악용-가능성-분석)
4. [데이터 무결성 분석](#데이터-무결성-분석)
5. [권장 수정사항](#권장-수정사항)

---

## 🔄 전체 흐름 분석

### 1. 주문 생성 플로우
```
프론트엔드 (checkout-script.js)
├─ 1. 장바구니 로드 (window.miniCart.getCartItems())
├─ 2. 사용자 정보 자동 입력 (/api/auth/me)
├─ 3. 폼 검증 (validateForms)
│   ├─ 필수 필드 검증
│   ├─ 이메일 형식 검증
│   ├─ 국가별 postalCode/phone 검증
│   └─ 주소 길이 검증 (10-200자)
├─ 4. 데이터 수집 (collectOrderData)
│   ├─ cartItems → items 변환
│   ├─ product_id 문자열 변환 (VARCHAR 대응)
│   └─ shipping 정보 수집
├─ 5. Idempotency Key 생성 (UUID v4)
├─ 6. POST /api/orders 호출
│   └─ 헤더: X-Idempotency-Key, Content-Type
│
백엔드 (order-routes.js)
├─ 1. 인증 검증 (authenticateToken)
├─ 2. Rate Limiting (orderCreationLimiter: 10회/분)
├─ 3. Idempotency Key 검증
│   └─ 기존 주문이 있으면 재전송
├─ 4. 입력 검증 (validateOrderRequest)
│   ├─ shipping 필드 검증
│   ├─ items 배열 검증
│   └─ 국가별 postal/phone 검증
├─ 5. 상품 정보 조회 (admin_products)
│   └─ product_id 존재 확인 + 가격 재계산
├─ 6. 트랜잭션 시작
├─ 7. 주문번호 생성 (지수 백오프 재시도)
├─ 8. orders 테이블 INSERT
├─ 9. order_items 테이블 INSERT
├─ 10. orders_idempotency 테이블 INSERT
├─ 11. 커밋
└─ 12. 응답 반환
```

---

## 🔒 보안 취약점 분석

### ⚠️ 심각도: 높음 (CRITICAL)

#### 1. CSRF 공격 취약점
**위치**: 모든 POST/PUT/DELETE API  
**문제점**:
- CSRF 토큰 검증 없음
- SameSite 쿠키만으로는 부족 (SameSite='none' 설정됨)
- 공격자가 사용자 세션을 이용해 주문 생성 가능

**영향**:
- 악성 사이트에서 사용자 모르게 주문 생성
- 결제 정보 유출
- DoS 공격 (대량 주문)

**권장 수정**:
```javascript
// Double Submit Cookie 패턴 또는 CSRF 토큰 추가
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);

// 또는
app.use((req, res, next) => {
    res.cookie('XSRF-TOKEN', req.csrfToken());
    next();
});
```

#### 2. 카드 정보 평문 전송/저장
**위치**: checkout-script.js:424-428  
**문제점**:
- 카드 정보를 평문으로 서버에 전송 (MOCK 모드에서 사용 안 하지만 전송됨)
- 로그에 노출 가능성

**영향**:
- 네트워크 스니핑 시 정보 유출
- 로그 파일에 민감 정보 저장

**권장 수정**:
- MOCK 모드에서는 카드 정보 전송 제거
- TOSS 모드에서는 토스 위젯으로 직접 처리 (서버 경유 금지)

#### 3. SQL Injection 위험 (완화됨, 하지만 검토 필요)
**위치**: 모든 SQL 쿼리  
**현재 상태**: Prepared Statement 사용 중 ✅  
**잠재적 문제**:
- 동적 테이블/컬럼명 사용 시 위험
- 현재는 모두 매개변수화되어 안전함

**검토 필요 코드**:
```javascript
// 안전함 (매개변수화됨)
await connection.execute('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);

// 위험 (동적 테이블명 사용 시)
// const tableName = req.body.table; // ❌ 위험
// await connection.execute(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
```

---

### ⚠️ 심각도: 중간 (HIGH)

#### 4. XSS 취약점 부분 존재
**위치**: checkout-script.js:231-240  
**문제점**:
- `escapeHtml()` 함수 사용 중 ✅ (안전)
- 하지만 `innerHTML` 사용 시 위험

**안전한 코드**:
```javascript
orderItemsContainer.innerHTML = cartItems.map(item => `
  <div>${escapeHtml(item.name)}</div>  // ✅ escapeHtml 사용
`).join('');
```

**검토 필요**:
- 모든 사용자 입력에 `escapeHtml()` 적용 확인 필요

#### 5. Rate Limiting 설정 완화
**위치**: backend/index.js:42-56  
**현재**: 15분당 500회  
**문제점**:
- 주문 생성 API는 별도 제한 있음 (10회/분) ✅
- 하지만 일반 API는 500회로 너무 높음

**권장 수정**:
```javascript
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100 // 더 낮은 제한
});
```

#### 6. 주문 조회 시 권한 검증
**위치**: order-routes.js:717-773  
**현재 상태**: ✅ 권한 검증 있음 (user_id 확인)  
**안전**: `WHERE order_number = ? AND user_id = ?` 사용

#### 7. 결제 확인 API 권한 검증
**위치**: payments-routes.js:105-122  
**현재 상태**: ✅ 권한 검증 있음 (user_id 확인)  
**안전**: 본인 주문만 확인 가능

---

### ⚠️ 심각도: 낮음 (MEDIUM)

#### 8. 에러 메시지 정보 노출
**위치**: 전체  
**현재 상태**: 부분 마스킹 적용 ✅  
**문제점**:
- Stack trace 노출 (production에서는 비활성화 권장)
- 파일 경로 노출 가능성

**권장 수정**:
```javascript
if (process.env.NODE_ENV === 'production') {
    Logger.log('주문 생성 오류:', { 
        error: error.message,
        // stack 제거 또는 마스킹
    });
}
```

#### 9. Idempotency Key 예측 가능성
**위치**: checkout-script.js:443  
**현재**: UUID v4 사용 ✅ (안전)  
**추가 보안**:
- 재사용 방지 (타임스탬프 + UUID)
- 서버에서 만료 시간 검증

#### 10. 주문번호 생성 예측 가능성
**위치**: order-routes.js:304-342  
**현재**: 타임스탬프 + 랜덤 ✅  
**문제점**:
- 동일 밀리초에 생성 시 충돌 가능
- 하지만 지수 백오프 재시도로 완화됨 ✅

---

## 🚨 악용 가능성 분석

### 1. 주문 조작 공격

#### A. 가격 조작 시도
**공격 시나리오**: 클라이언트에서 item.price를 조작하여 전송  
**방어**: ✅ **안전**
```javascript
// 서버에서 가격 재계산
const serverPrice = parseFloat(product.price); // ✅ DB에서 가격 조회
const subtotal = serverPrice * item.quantity; // ✅ 서버 계산
```

#### B. 수량 조작 시도
**공격 시나리오**: 음수 수량, 0, 매우 큰 수량 전송  
**방어**: ✅ **안전**
```javascript
// 검증 로직
if (quantity < 1 || quantity > 10) { // ✅ 범위 제한
    errors[`${prefix}.quantity`] = '수량은 1-10 사이여야 합니다';
}
```

#### C. 상품 추가/삭제 시도
**공격 시나리오**: 존재하지 않는 product_id 전송  
**방어**: ✅ **안전**
```javascript
// 상품 존재 확인
if (productRows.length === 0) { // ✅ 검증
    return res.status(400).json({ ... });
}
```

### 2. 주문 중복 생성 공격

#### A. 동일 Idempotency Key 재사용
**방어**: ✅ **안전**
```javascript
// Idempotency Key 검증
if (idemRows.length) {
    return res.status(200).json({ ... }); // ✅ 기존 주문 반환
}
```

#### B. 빠른 연속 요청
**방어**: ✅ **안전**
- Rate Limiting: 10회/분
- 트랜잭션 격리
- UNIQUE 제약조건

### 3. 권한 우회 공격

#### A. 타인 주문 조회 시도
**방어**: ✅ **안전**
```javascript
// user_id 검증
WHERE order_number = ? AND user_id = ? // ✅ 필수
```

#### B. 인증 없이 주문 생성
**방어**: ✅ **안전**
```javascript
router.post('/orders', authenticateToken, ...); // ✅ 인증 필수
```

### 4. DoS 공격

#### A. 대량 주문 생성
**방어**: ⚠️ **부분 완화**
- Rate Limiting: 10회/분 ✅
- 하지만 분당 10회면 여전히 부담
- 데이터베이스 연결 풀 고갈 가능

**권장**:
- IP 기반 추가 제한
- 사용자별 일일 주문 제한

#### B. 대량 조회 요청
**방어**: ⚠️ **완화 필요**
- Rate Limiting: 500회/15분 → 너무 높음

### 5. 세션 하이재킹

#### A. 쿠키 탈취
**방어**: ✅ **안전**
```javascript
httpOnly: true,      // ✅ JavaScript 접근 불가
secure: production,  // ✅ HTTPS만
sameSite: 'none'     // ⚠️ CSRF 위험 (다른 보안 조치 필요)
```

---

## 🔐 데이터 무결성 분석

### 1. 트랜잭션 처리
**상태**: ✅ **적절**
- `beginTransaction()` → 작업 수행 → `commit()` / `rollback()`
- 모든 주문 관련 INSERT가 하나의 트랜잭션 내

### 2. 외래키 제약조건
**상태**: ✅ **적절**
- `orders.user_id` → `users.user_id`
- `cart_items.product_id` → `admin_products.id`
- `order_items.order_id` → `orders.order_id`

### 3. UNIQUE 제약조건
**상태**: ✅ **적절**
- `orders.order_number` UNIQUE
- `orders_idempotency (user_id, idem_key)` UNIQUE

### 4. NOT NULL 제약조건
**상태**: ✅ **적절**
- 필수 필드는 NOT NULL 설정

### 5. CHECK 제약조건
**상태**: ✅ **적절**
- `status` 허용값 제한
- `shipping_method` 허용값 제한
- `total_price >= 0`
- `shipping_cost >= 0`

---

## 🔧 권장 수정사항

### 🔴 즉시 수정 필요 (심각)

#### 1. CSRF 보호 추가
```javascript
// backend/index.js
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

app.use(csrfProtection);

// 모든 POST/PUT/DELETE 요청에 CSRF 토큰 검증
app.use('/api/orders', csrfProtection);
app.use('/api/payments', csrfProtection);
```

#### 2. 카드 정보 전송 제거 (MOCK 모드)
```javascript
// checkout-script.js
function collectOrderData() {
    // ...
    payment: window.__PAYMENT_MODE__ === 'MOCK' ? {} : {
        // TOSS 모드에서만 전송 (실제로는 토스 위젯으로 직접)
    }
}
```

#### 3. Production 환경에서 Stack Trace 숨김
```javascript
// 모든 catch 블록
if (process.env.NODE_ENV === 'production') {
    Logger.log('오류', { error: error.message }); // stack 제거
} else {
    Logger.log('오류', { error: error.message, stack: error.stack });
}
```

---

### 🟡 단기 수정 권장 (중요)

#### 4. Rate Limiting 강화
```javascript
// 더 엄격한 제한
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100 // 500 → 100
});
```

#### 5. 주문 수량 상한 추가 검증
```javascript
// 단일 주문 총 수량 제한
const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
if (totalQuantity > 50) {
    errors.items = '주문 총 수량은 50개 이하여야 합니다';
}
```

#### 6. 주소 필드 SQL Injection 방지 강화
```javascript
// 현재는 Prepared Statement로 안전하지만, 길이 제한 확인
if (shipping.address.length > 200) {
    errors['shipping.address'] = '주소가 너무 깁니다';
}
```

#### 7. 웹훅 서명 검증 활성화 (현재 조건부)
```javascript
// 현재: 시크릿 키 없으면 건너뛰기
// 권장: 프로덕션에서는 필수로 설정
if (!webhookSecret) {
    return res.status(500).json({ 
        error: 'Webhook secret not configured' 
    });
}
```

---

### 🟢 장기 개선 권장 (선택)

#### 8. 입력 검증 라이브러리 통일
- `express-validator` 일관성 있게 사용

#### 9. 로깅 시스템 개선
- 구조화된 로깅
- 민감 정보 자동 마스킹

#### 10. 모니터링 및 알람
- 비정상 주문 패턴 감지
- Rate Limit 초과 알람

---

## ✅ 현재 잘 구현된 부분

1. **SQL Injection 방지**: 모든 쿼리가 Prepared Statement 사용 ✅
2. **인증/인가**: 모든 민감 API에 `authenticateToken` 적용 ✅
3. **가격 재계산**: 서버에서 가격 재계산하여 조작 방지 ✅
4. **Idempotency**: 중복 주문 생성 방지 ✅
5. **트랜잭션**: 데이터 일관성 보장 ✅
6. **입력 검증**: 프론트엔드 + 백엔드 이중 검증 ✅
7. **마스킹**: 민감 정보 로그 마스킹 ✅
8. **XSS 방지**: `escapeHtml()` 사용 ✅

---

## 📊 종합 평가

| 항목 | 점수 | 상태 |
|------|------|------|
| SQL Injection 방지 | ⭐⭐⭐⭐⭐ | 우수 |
| 인증/인가 | ⭐⭐⭐⭐⭐ | 우수 |
| 데이터 무결성 | ⭐⭐⭐⭐⭐ | 우수 |
| XSS 방지 | ⭐⭐⭐⭐ | 양호 |
| CSRF 방지 | ⭐⭐ | 개선 필요 |
| Rate Limiting | ⭐⭐⭐ | 양호 |
| 에러 처리 | ⭐⭐⭐⭐ | 양호 |
| 민감 정보 보호 | ⭐⭐⭐ | 개선 필요 |

**전체 평가**: ⭐⭐⭐⭐ (4/5)  
**운영 가능**: ✅ (CSRF 보호 추가 후 권장)

---

## 🎯 우선순위별 수정 계획

### Phase 1 (즉시 - 1주 내)
1. CSRF 보호 추가
2. MOCK 모드 카드 정보 전송 제거
3. Production Stack Trace 숨김

### Phase 2 (단기 - 1개월 내)
4. Rate Limiting 강화
5. 웹훅 서명 검증 필수화
6. 주문 수량 상한 강화

### Phase 3 (장기 - 지속적)
7. 로깅 시스템 개선
8. 모니터링 시스템 구축
9. 정기적인 보안 감사

---

## 📝 결론

현재 시스템은 **기본적인 보안 요건은 충족**하고 있으며, 특히 **SQL Injection 방지**, **인증/인가**, **데이터 무결성** 측면에서 **우수**합니다.

하지만 **CSRF 보호 추가**와 **민감 정보 보호 강화**가 필요합니다. 위의 권장사항을 적용하면 **프로덕션 운영에 충분히 안전한 수준**이 됩니다.


