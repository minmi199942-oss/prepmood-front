# Phase 2 테스트 가이드

## 📋 테스트 목표
**`processPaidOrder()` 함수가 정상적으로 작동하는지 확인**

---

## ⚠️ 사전 준비

### 1. 재고 데이터 준비 (필수)
`processPaidOrder()`는 `stock_units.status = 'in_stock'`인 재고만 배정합니다.

**재고 생성 SQL**:
```sql
USE prepmood;

-- 1. admin_products에서 상품 ID 확인
SELECT id, name FROM admin_products LIMIT 5;

-- 2. token_master에서 token_pk 확인
SELECT token_pk, token, product_name FROM token_master LIMIT 5;

-- 3. stock_units에 재고 생성 (예시)
-- 상품 ID와 token_pk를 실제 값으로 변경해야 함
INSERT INTO stock_units 
(product_id, token_pk, status, created_at, updated_at)
VALUES 
('m-sh-001', 1, 'in_stock', NOW(), NOW()),
('m-sh-001', 2, 'in_stock', NOW(), NOW()),
('m-sh-001', 3, 'in_stock', NOW(), NOW());
```

**재고 확인**:
```sql
SELECT 
    stock_unit_id,
    product_id,
    token_pk,
    status,
    reserved_by_order_id
FROM stock_units
WHERE status = 'in_stock'
ORDER BY stock_unit_id;
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 정상 결제 완료 (회원 주문)

**목표**: 결제 완료 시 재고 배정, 주문 단위 생성, 보증서 생성, 인보이스 생성이 모두 정상 작동하는지 확인

**절차**:
1. 회원 로그인
2. 상품 선택 및 주문 생성
3. 결제 진행 (MOCK 모드 또는 실제 결제)
4. 결제 완료 후 데이터 확인

**확인 사항**:
```sql
-- 1. paid_events 확인
SELECT * FROM paid_events WHERE order_id = ?;

-- 2. stock_units 상태 확인 (reserved로 변경되었는지)
SELECT 
    stock_unit_id,
    product_id,
    status,
    reserved_at,
    reserved_by_order_id
FROM stock_units
WHERE reserved_by_order_id = ?;

-- 3. order_item_units 확인
SELECT 
    order_item_unit_id,
    order_item_id,
    unit_seq,
    stock_unit_id,
    token_pk,
    unit_status
FROM order_item_units
WHERE order_item_id IN (
    SELECT order_item_id FROM order_items WHERE order_id = ?
);

-- 4. warranties 확인 (회원: status='issued', owner_user_id 설정)
SELECT 
    id,
    source_order_item_unit_id,
    token_pk,
    owner_user_id,
    status,
    created_at
FROM warranties
WHERE source_order_item_unit_id IN (
    SELECT order_item_unit_id FROM order_item_units 
    WHERE order_item_id IN (
        SELECT order_item_id FROM order_items WHERE order_id = ?
    )
);

-- 5. invoices 확인
SELECT 
    invoice_id,
    invoice_number,
    order_id,
    status,
    total_amount
FROM invoices
WHERE order_id = ?;

-- 6. orders.paid_at 확인
SELECT 
    order_id,
    order_number,
    status,
    paid_at
FROM orders
WHERE order_id = ?;
```

**예상 결과**:
- ✅ `paid_events`에 레코드 1개 생성
- ✅ `stock_units.status`가 `reserved`로 변경
- ✅ `order_item_units`가 주문 수량만큼 생성
- ✅ `warranties`가 주문 수량만큼 생성 (`status='issued'`, `owner_user_id` 설정)
- ✅ `invoices`에 레코드 1개 생성
- ✅ `orders.paid_at`이 설정됨

---

### 시나리오 2: 정상 결제 완료 (비회원 주문)

**목표**: 비회원 주문 시 `warranties.status='issued_unassigned'`, `owner_user_id=NULL`로 생성되는지 확인

**절차**:
1. 비로그인 상태에서 주문 생성
2. 결제 진행
3. 결제 완료 후 데이터 확인

**확인 사항**:
```sql
-- warranties 확인 (비회원: status='issued_unassigned', owner_user_id=NULL)
SELECT 
    id,
    source_order_item_unit_id,
    token_pk,
    owner_user_id,
    status,
    created_at
FROM warranties
WHERE source_order_item_unit_id IN (
    SELECT order_item_unit_id FROM order_item_units 
    WHERE order_item_id IN (
        SELECT order_item_id FROM order_items WHERE order_id = ?
    )
);
```

**예상 결과**:
- ✅ `warranties.status = 'issued_unassigned'`
- ✅ `warranties.owner_user_id = NULL`

---

### 시나리오 3: 중복 처리 방지 (멱등성)

**목표**: 같은 `paymentKey`로 재요청 시 중복 처리되지 않는지 확인

**절차**:
1. 결제 완료 후 같은 `paymentKey`로 다시 요청
2. 로그 확인

**확인 사항**:
```sql
-- paid_events 확인 (같은 order_id, payment_key 조합이 1개만 있어야 함)
SELECT 
    event_id,
    order_id,
    payment_key,
    confirmed_at
FROM paid_events
WHERE order_id = ? AND payment_key = ?;
```

**예상 결과**:
- ✅ `paid_events`에 레코드 1개만 존재
- ✅ 로그에 "이미 처리된 주문" 메시지
- ✅ `processPaidOrder()`가 `alreadyProcessed: true` 반환

---

### 시나리오 4: 재고 부족

**목표**: 재고가 부족한 경우 에러가 발생하는지 확인

**절차**:
1. 재고가 부족한 상품으로 주문 생성
2. 결제 진행
3. 에러 확인

**확인 사항**:
- 서버 로그 확인
- `paid_events`는 기록되었는지 확인 (증거 보존)

**예상 결과**:
- ✅ 에러 발생: "재고 부족: 상품 X, 필요: Y, 가용: Z"
- ✅ `paid_events`는 기록됨 (증거 보존)
- ✅ 결제는 성공 처리 (에러는 로깅만)

---

### 시나리오 5: 금액 불일치

**목표**: 주문 금액과 결제 금액이 불일치할 때 처리 확인

**절차**:
1. 주문 생성 (예: 100,000원)
2. 다른 금액으로 결제 시도 (예: 50,000원)
3. 에러 확인

**예상 결과**:
- ✅ 에러 발생: "결제 금액 불일치: 주문=100000, 결제=50000"
- ✅ `paid_events`는 기록됨 (증거 보존)

---

## 🔍 데이터 정합성 검증

### 검증 스크립트

```sql
USE prepmood;

-- 특정 주문의 Paid 처리 결과 확인
SET @order_id = ?; -- 테스트 주문 ID

SELECT '=== paid_events 확인 ===' AS info;
SELECT * FROM paid_events WHERE order_id = @order_id;

SELECT '=== stock_units 상태 확인 ===' AS info;
SELECT 
    stock_unit_id,
    product_id,
    status,
    reserved_at,
    reserved_by_order_id
FROM stock_units
WHERE reserved_by_order_id = @order_id;

SELECT '=== order_item_units 확인 ===' AS info;
SELECT 
    oiu.order_item_unit_id,
    oiu.order_item_id,
    oiu.unit_seq,
    oiu.stock_unit_id,
    oiu.token_pk,
    oiu.unit_status,
    oi.product_id,
    oi.quantity
FROM order_item_units oiu
JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
WHERE oi.order_id = @order_id
ORDER BY oiu.order_item_id, oiu.unit_seq;

SELECT '=== warranties 확인 ===' AS info;
SELECT 
    w.id,
    w.source_order_item_unit_id,
    w.token_pk,
    w.owner_user_id,
    w.status,
    w.created_at,
    tm.token,
    tm.product_name
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.source_order_item_unit_id IN (
    SELECT order_item_unit_id FROM order_item_units 
    WHERE order_item_id IN (
        SELECT order_item_id FROM order_items WHERE order_id = @order_id
    )
);

SELECT '=== invoices 확인 ===' AS info;
SELECT 
    invoice_id,
    invoice_number,
    order_id,
    status,
    total_amount,
    issued_at
FROM invoices
WHERE order_id = @order_id;

SELECT '=== orders.paid_at 확인 ===' AS info;
SELECT 
    order_id,
    order_number,
    user_id,
    status,
    paid_at
FROM orders
WHERE order_id = @order_id;
```

---

## 📝 테스트 체크리스트

### 기본 기능
- [ ] 회원 주문 결제 완료 시 모든 데이터 생성
- [ ] 비회원 주문 결제 완료 시 `warranties.status='issued_unassigned'`
- [ ] 중복 처리 방지 (멱등성)
- [ ] 재고 부족 시 에러 처리
- [ ] 금액 불일치 시 에러 처리

### 데이터 정합성
- [ ] `paid_events` 레코드 생성
- [ ] `stock_units.status`가 `reserved`로 변경
- [ ] `order_item_units`가 정확한 수량만큼 생성
- [ ] `warranties`가 정확한 수량만큼 생성
- [ ] `invoices` 레코드 생성
- [ ] `orders.paid_at` 설정

### 에러 처리
- [ ] Paid 처리 실패 시에도 결제 성공 유지
- [ ] 에러 로깅 정상 작동
- [ ] 트랜잭션 롤백 정상 작동

---

## 🚀 빠른 테스트 방법

### 1. 재고 생성 (필수)
```sql
-- admin_products와 token_master 조인하여 재고 생성
INSERT INTO stock_units (product_id, token_pk, status, created_at, updated_at)
SELECT 
    ap.id as product_id,
    tm.token_pk,
    'in_stock' as status,
    NOW() as created_at,
    NOW() as updated_at
FROM admin_products ap
CROSS JOIN token_master tm
LIMIT 10; -- 10개 재고 생성
```

### 2. 주문 생성
- 웹사이트에서 주문 생성
- 또는 API로 직접 주문 생성

### 3. 결제 진행
- MOCK 모드: `MOCK_GATEWAY=1` 환경변수 설정
- 실제 결제: 토스페이먼츠 테스트 카드 사용

### 4. 결과 확인
- 위의 검증 스크립트 실행
- 서버 로그 확인

---

## ⚠️ 주의사항

1. **재고 데이터 필수**: `stock_units`에 `status='in_stock'`인 재고가 있어야 함
2. **트랜잭션**: 테스트 중 에러 발생 시 트랜잭션이 롤백될 수 있음
3. **로그 확인**: 서버 로그에서 상세한 처리 과정 확인 가능
4. **멱등성**: 같은 `paymentKey`로 재요청 시 중복 처리되지 않음

---

## 🐛 문제 해결

### 문제: "재고 부족" 에러
**원인**: `stock_units`에 `status='in_stock'`인 재고가 없음
**해결**: 위의 재고 생성 SQL 실행

### 문제: "주문을 찾을 수 없습니다" 에러
**원인**: `order_id`가 잘못되었거나 주문이 존재하지 않음
**해결**: 주문 ID 확인

### 문제: "결제 금액 불일치" 에러
**원인**: 주문 금액과 결제 금액이 다름
**해결**: 주문 금액과 결제 금액 일치 확인
