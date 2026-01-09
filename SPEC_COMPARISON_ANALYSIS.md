# 제시된 스펙 vs 현재 시스템 비교 분석

## 📊 현재 시스템 구조 확인

### ✅ 현재 존재하는 테이블 및 구조

#### 1. `orders` 테이블
```sql
-- 현재 구조 (확인 필요)
order_id (PK)
user_id (FK, NULL 허용 여부 확인 필요) ⚠️
order_number (UNIQUE)
status (pending/confirmed/processing/shipped/delivered/cancelled/refunded)
total_price
shipping_* (first_name, last_name, email, phone, address, ...)
-- guest_id 없음 ❌
```

**제시된 스펙과 비교**:
- ✅ `order_number` UNIQUE 존재
- ✅ `status` 존재 (값은 약간 다를 수 있음)
- ⚠️ `user_id` NULL 허용 여부 확인 필요
- ❌ `guest_id` 컬럼 없음 (추가 필요)

#### 2. `order_items` 테이블
```sql
-- 현재 구조
order_item_id (PK)
order_id (FK)
product_id
product_name, product_image
size, color
quantity (int) ⚠️
unit_price, subtotal
created_at
-- stock_unit_id 없음 ❌
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ⚠️ `quantity`는 유지 (표시용/계산용)
- ❌ `stock_unit_id` 없음 (추가 불필요 - order_item_units로 분리)

#### 3. `warranties` 테이블
```sql
-- 현재 구조
id (PK)
user_id (FK, NOT NULL) ⚠️ -- 비회원 불가
token (UNIQUE VARCHAR(20)) ⚠️ -- token_id가 아님
public_id (UNIQUE UUID)
product_name
verified_at, created_at
-- status 없음 ❌
-- owner_user_id 없음 ❌
-- source_order_item_unit_id 없음 ❌
-- activated_at 없음 ❌
-- revoked_at 없음 ❌
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ⚠️ `user_id` → `owner_user_id`로 변경 필요 (NULL 허용)
- ⚠️ `token` → `token_id` (FK)로 변경 필요
- ❌ `status` 컬럼 없음 (추가 필요)
- ❌ `source_order_item_unit_id` 없음 (추가 필요)
- ❌ `activated_at`, `revoked_at` 없음 (추가 필요)

#### 4. `token_master` 테이블
```sql
-- 현재 구조
token (PK VARCHAR(20)) ⚠️ -- id가 아님
internal_code
product_name
is_blocked (TINYINT(1))
owner_user_id (NULL 허용) ⚠️ -- 레거시, 사용 금지
owner_warranty_public_id (FK) ⚠️ -- 레거시, 사용 금지
scan_count
first_scanned_at, last_scanned_at
created_at, updated_at
-- id (PK autoinc) 없음 ⚠️
-- status 없음 ❌
-- stock_unit_id 없음 (제거 예정 - 단방향 원칙)
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ⚠️ `token`을 PK로 유지 (기존 호환성)
- ⚠️ `id` (PK autoinc) 추가 권장 (내부 FK용)
- ❌ `status` 컬럼 없음 (추가 필요)
- ⚠️ `owner_user_id`, `owner_warranty_public_id`는 레거시로 유지하되 사용 금지

#### 5. `orders_idempotency` 테이블
```sql
-- 현재 구조
id (PK)
user_id (NOT NULL) ⚠️ -- 비회원 불가
idem_key
order_number
-- guest_id 없음 ❌
```

**제시된 스펙과 비교**:
- ✅ 기본 구조 존재
- ⚠️ `user_id` NULL 허용 필요 (비회원 지원)
- ❌ `guest_id` 컬럼 추가 필요

---

## 🔍 제시된 스펙의 새 테이블들

### ❌ 현재 존재하지 않는 테이블 (신규 생성 필요)

1. **`order_item_units`** - 핵심 테이블
2. **`stock_units`** - 재고 관리
3. **`guest_orders`** - 비회원 주문 메타
4. **`guest_order_access_tokens`** - 비회원 조회 토큰
5. **`claim_tokens`** - 계정 연동 토큰
6. **`paid_events`** - paid 처리 멱등성
7. **`shipments`** - 배송 관리
8. **`shipment_units`** - 배송-실물 매핑
9. **`refund_requests`** (선택) - 환불 요청 관리

---

## ✅ 현재 시스템에서 살려서 이용할 수 있는 부분

### 1. QR 코드 인증 시스템 (`/a/:token`) ⭐⭐⭐⭐⭐
**현재 구현**: `backend/auth-routes.js` 182-748줄

**활용 방안**:
- ✅ **GET `/a/:token`**: 보증서 열람용으로 그대로 사용 가능
- ⚠️ **POST `/a/:token`**: 현재는 warranty 생성하는데, 새 스펙에서는 "활성화는 버튼에서만"이므로 수정 필요
- ✅ **token_master 조회 로직**: 그대로 활용 가능
- ✅ **로그인 체크**: `requireAuthForHTML` 그대로 사용 가능

**수정 필요**:
```javascript
// 현재: POST /a/:token에서 warranty 생성
// 수정: warranty는 이미 paid 시점에 생성되어 있으므로, 조회만 수행
// 활성화는 POST /api/warranties/:id/activate에서만
```

### 2. 주문 생성 로직 (`POST /api/orders`) ⭐⭐⭐⭐
**현재 구현**: `backend/order-routes.js` 367-643줄

**활용 방안**:
- ✅ **주문번호 생성 로직**: `generateOrderNumber()` 그대로 사용 가능
- ✅ **Idempotency 처리**: `orders_idempotency` 테이블 활용 (guest_id 지원 추가 필요)
- ✅ **주문 검증 로직**: `validateOrderRequest()` 그대로 사용 가능
- ✅ **트랜잭션 처리**: 그대로 활용 가능

**수정 필요**:
- ⚠️ `authenticateToken` → `optionalAuth` 변경 필요 (비회원 지원)
- ⚠️ `guest_id` 생성 로직 추가 필요
- ⚠️ `guest_orders` 테이블 생성 필요

### 3. 결제 확인 로직 (`POST /api/payments/confirm`) ⭐⭐⭐⭐
**현재 구현**: `backend/payments-routes.js` 64-386줄

**활용 방안**:
- ✅ **토스 API 호출 로직**: 그대로 활용 가능
- ✅ **payments 테이블 저장**: 그대로 활용 가능
- ✅ **주문 상태 업데이트**: 그대로 활용 가능

**수정 필요**:
- ❌ **paid 처리 트랜잭션 추가**: `processPaidOrder()` 함수 호출 추가 필요
- ❌ **재고 배정 로직**: 신규 구현 필요
- ❌ **order_item_units 생성**: 신규 구현 필요
- ❌ **warranty 생성**: 신규 구현 필요 (paid 시점)

### 4. 웹훅 처리 로직 (`POST /api/payments/webhook`) ⭐⭐⭐⭐
**현재 구현**: `backend/payments-routes.js` 697-765줄

**활용 방안**:
- ✅ **서명 검증 로직**: 그대로 활용 가능
- ✅ **토스 재조회 검증**: `verifyPaymentWithToss()` 그대로 활용 가능
- ✅ **멱등성 처리**: 그대로 활용 가능

**수정 필요**:
- ❌ **paid 처리 트랜잭션 추가**: `processPaidOrder()` 함수 호출 추가 필요

### 5. `token_master` 테이블 구조 ⭐⭐⭐⭐
**현재 구조**: 기본 구조는 좋음

**활용 방안**:
- ✅ **token (PK)**: 그대로 유지 (기존 호환성)
- ✅ **internal_code, product_name**: 그대로 활용 가능
- ✅ **scan_count, first_scanned_at, last_scanned_at**: 그대로 활용 가능

**수정 필요**:
- ⚠️ **id (PK autoinc) 추가**: 내부 FK용으로 권장
- ❌ **status 컬럼 추가**: issued/reserved/active/revoked
- ⚠️ **owner_* 컬럼**: 레거시로 유지하되 사용 금지 (주석 추가)

---

## ⚠️ 갈아엎고 새로 해야 하는 부분

### 1. 보증서 생성 시점 변경 (필수) 🔴
**현재**: QR 스캔 시점 (`/a/:token` GET/POST)
**제시된 스펙**: paid 시점 (결제 성공 직후)

**영향**:
- ❌ 현재 `auth-routes.js`의 warranty 생성 로직 대폭 수정 필요
- ❌ `processPaidOrder()` 함수 신규 구현 필요
- ⚠️ 기존 보증서는 그대로 유지 (마이그레이션 불필요)

**구현 방법**:
```javascript
// backend/payments-routes.js 또는 별도 파일
async function processPaidOrder({ orderId, paymentKey, source }) {
  // paid_events 멱등성 락
  // 재고 배정
  // order_item_units 생성
  // warranties 생성 (paid 시점)
}
```

### 2. QR 스캔 로직 변경 (필수) 🔴
**현재**: POST `/a/:token`에서 warranty 생성
**제시된 스펙**: GET `/a/:token`은 조회만, 활성화는 버튼에서만

**수정 필요**:
```javascript
// 현재: POST /a/:token에서 warranty 생성
// 수정: warranty는 이미 존재하므로 조회만 수행
// 활성화는 POST /api/warranties/:id/activate에서만
```

### 3. 비회원 주문 지원 (필수) 🔴
**현재**: `authenticateToken` 필수 (회원만 가능)
**제시된 스펙**: 비회원도 주문 가능

**수정 필요**:
- `authenticateToken` → `optionalAuth` 변경
- `guest_id` 생성 로직 추가
- `guest_orders` 테이블 생성
- `guest_order_access_tokens` 테이블 생성
- `claim_tokens` 테이블 생성

---

## 🗑️ 원래 있던 걸 삭제해야 하는 부분

### 1. `warranties.user_id` 컬럼 (마이그레이션 후 삭제)
**현재**: `user_id` (NOT NULL)
**제시된 스펙**: `owner_user_id` (NULL 허용)

**삭제 방법**:
```sql
-- 1. owner_user_id 추가
ALTER TABLE warranties ADD COLUMN owner_user_id INT NULL;

-- 2. 기존 데이터 마이그레이션
UPDATE warranties SET owner_user_id = user_id WHERE owner_user_id IS NULL;

-- 3. FK 제약 해제 후 user_id 삭제
ALTER TABLE warranties DROP FOREIGN KEY warranties_ibfk_1;
ALTER TABLE warranties DROP COLUMN user_id;

-- 4. 새 FK 추가
ALTER TABLE warranties ADD FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL;
```

### 2. `warranties.token` → `warranties.token_id` 변경
**현재**: `token` (VARCHAR(20) UNIQUE)
**제시된 스펙**: `token_id` (FK to token_master)

**변경 방법**:
```sql
-- 1. token_id 추가
ALTER TABLE warranties ADD COLUMN token_id VARCHAR(20) NULL;

-- 2. 기존 데이터 마이그레이션 (token_master.token과 매칭)
UPDATE warranties w
JOIN token_master tm ON w.token = tm.token
SET w.token_id = tm.token;

-- 3. FK 추가
ALTER TABLE warranties ADD FOREIGN KEY (token_id) REFERENCES token_master(token) ON DELETE SET NULL;

-- 4. token 컬럼 삭제 (또는 유지하되 deprecated로 표시)
-- ALTER TABLE warranties DROP COLUMN token; -- 또는 유지
```

### 3. `token_master.owner_warranty_public_id` FK 제약 제거 (선택)
**현재**: FK 제약 있음
**제시된 스펙**: 레거시로 유지하되 사용 금지

**권장**: FK 제약은 유지하되, 코드에서 사용 금지 (주석 추가)

---

## ⚡ 효율적인 구현 방법

### 1. 기존 코드 재사용 최대화 ⭐⭐⭐⭐⭐
**장점**:
- 검증된 로직 재사용
- 버그 위험 최소화
- 개발 시간 단축

**재사용 가능한 부분**:
- ✅ 주문번호 생성 로직
- ✅ Idempotency 처리
- ✅ 토스 API 호출 로직
- ✅ 웹훅 검증 로직
- ✅ QR 코드 인증 로직 (조회 부분)

### 2. 점진적 마이그레이션 전략 ⭐⭐⭐⭐⭐
**Phase 1**: 새 테이블 생성 (기존 테이블 유지)
- `order_item_units`, `stock_units`, `guest_orders` 등 신규 테이블 생성
- 기존 테이블은 그대로 유지

**Phase 2**: 새 로직 추가 (기존 로직과 병행)
- `processPaidOrder()` 함수 구현
- 새 주문부터 새 로직 사용
- 기존 주문은 기존 로직으로 처리

**Phase 3**: 기존 데이터 마이그레이션 (선택)
- 기존 보증서 데이터 마이그레이션 (필요 시)
- 기존 주문 데이터는 마이그레이션 불필요 (재고 배정이 안 되어 있을 가능성 높음)

**Phase 4**: 기존 로직 제거 (안정화 후)
- QR 스캔 시 warranty 생성 로직 제거
- 기존 컬럼 삭제 (user_id → owner_user_id 등)

### 3. 트랜잭션 최적화 ⭐⭐⭐⭐
**제시된 스펙의 순서**:
1. paid_events insert (멱등성)
2. 재고 배정 (FOR UPDATE)
3. order_item_units 생성
4. warranties 생성

**최적화 제안**:
```javascript
// 배치 INSERT 사용
const units = [];
const warranties = [];

for (const item of orderItems) {
  // 재고 배정
  const stockUnits = await selectStockUnits(...);
  
  for (let i = 0; i < item.quantity; i++) {
    units.push([order_item_id, i+1, stock_unit_id, token_id, 'reserved']);
    warranties.push([unit_id, token_id, owner_user_id, status]);
  }
}

// 배치 INSERT
await connection.execute('INSERT INTO order_item_units (...) VALUES ?', [units]);
await connection.execute('INSERT INTO warranties (...) VALUES ?', [warranties]);
```

---

## ❌ 불가능하거나 문제가 될 수 있는 부분

### 1. MySQL 부분 UNIQUE 인덱스 (이미 지적됨) ⚠️
**제시된 스펙**:
```sql
UNIQUE(stock_unit_id) where stock_unit_id not null  -- ❌ MySQL 미지원
```

**해결 방법**: 애플리케이션 레벨 검증
```javascript
// 트랜잭션 내에서 검증
const [existing] = await connection.execute(
  'SELECT order_item_unit_id FROM order_item_units WHERE stock_unit_id = ?',
  [stock_unit_id]
);
if (existing.length > 0) {
  throw new Error('stock_unit_id already assigned');
}
```

### 2. 기존 보증서 데이터 마이그레이션 복잡성 ⚠️
**문제**:
- 기존 보증서는 `order_item_id` 연결이 없음
- `source_order_item_unit_id` 연결 불가능

**해결 방법**:
- 기존 보증서는 `source_order_item_unit_id = NULL`로 유지
- 새 보증서부터 `source_order_item_unit_id` 필수
- 조회 시 NULL 체크로 구분

### 3. 기존 주문의 `order_item_units` 생성 복잡성 ⚠️
**문제**:
- 기존 주문은 재고 배정이 안 되어 있을 가능성 높음
- `stock_unit_id` 연결 불가능

**해결 방법**:
- 기존 주문은 `order_item_units` 생성 불필요
- 조회 시 `order_items`만 사용
- 새 주문부터 `order_item_units` 사용

---

## 🐛 제시된 스펙의 문제점 또는 개선 필요 사항

### 1. `paid_events.order_id UNIQUE` 제약 문제 (이미 지적됨) ⚠️
**문제**: 부분 환불 후 재결제 불가

**제시된 스펙의 해결책**: `idempotency_key` 기반으로 변경 권장

### 2. `order_item_units.token_id` 중복 저장 문제 (미세한 이슈) ⚠️
**제시된 스펙**:
```sql
order_item_units.token_id (FK token_master, UNIQUE, NULL 허용)
stock_units.token_id (FK token_master, UNIQUE, NULL 허용)
```

**문제**: `token_id`가 `order_item_units`와 `stock_units` 양쪽에 저장됨

**해결 방법**: 
- `order_item_units.token_id`는 조회 최적화용으로만 사용
- 실제 진실은 `stock_units.token_id`
- 또는 `order_item_units.token_id` 제거하고 `stock_units` JOIN으로 해결

**권장**: `order_item_units.token_id` 유지 (조회 최적화)

### 3. `warranties.token_id`와 `order_item_units.token_id` 중복 문제 (미세한 이슈) ⚠️
**제시된 스펙**:
```sql
warranties.token_id (FK token_master, UNIQUE, NOT NULL)
order_item_units.token_id (FK token_master, UNIQUE, NULL 허용)
```

**문제**: 같은 `token_id`가 여러 테이블에 저장됨

**해결 방법**: 정규화 관점에서는 중복이지만, 조회 최적화를 위해 허용 가능

**권장**: 그대로 유지 (조회 성능 우선)

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

### 2. 감사 로그 시스템 ⭐⭐⭐⭐
**제안**:
- `audit_logs` 테이블
- 상태 변경 이력
- 소유권 변경 이력

### 3. 배치 처리 최적화 ⭐⭐⭐⭐
**제안**:
- `order_item_units` 배치 INSERT
- `warranties` 배치 INSERT
- `FOR UPDATE SKIP LOCKED` 사용

### 4. 에러 처리 강화 ⭐⭐⭐⭐
**제안**:
- 재고 부족 시 관리자 알림
- paid 처리 실패 시 롤백 및 알림
- 부분 실패 처리 (일부 unit만 실패 시)

### 5. 성능 모니터링 ⭐⭐⭐
**제안**:
- paid 처리 시간 모니터링
- 재고 배정 시간 모니터링
- 트랜잭션 타임아웃 설정

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






