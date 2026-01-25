# 예약된 재고 해제 가이드

## 목적
주문 처리 실패로 인해 예약(reserved) 상태로 남아있는 재고를 안전하게 해제하는 방법

---

## 문제 상황

### 발생 가능한 시나리오
1. **재고만 예약되고 나머지 실패**
   - `processPaidOrder()`가 재고 배정 후 실패
   - 트랜잭션 롤백이 제대로 되지 않아 재고만 `reserved` 상태로 남음

2. **paid_events는 있지만 order_item_units 없음**
   - `paid_events`는 별도 커넥션(autocommit)으로 생성되어 남아있음
   - `processPaidOrder()`가 재고 배정 후 실패하여 `order_item_units`가 생성되지 않음

3. **주문이 완전히 실패했지만 재고만 남음**
   - 네트워크 오류, 타임아웃 등으로 트랜잭션이 부분적으로만 커밋됨

---

## 해제 전 확인 사항

### 0. 예약된 재고가 있는 주문 찾기

**먼저 문제가 있는 주문을 찾아야 합니다:**

```sql
-- 예약된 재고가 있는 모든 주문 확인
SELECT 
    o.order_id,
    o.order_number,
    o.status as order_status,
    o.paid_at,
    o.created_at,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM stock_units WHERE reserved_by_order_id = o.order_id AND status = 'reserved') as reserved_stock_count
FROM orders o
WHERE EXISTS (
    SELECT 1 FROM stock_units 
    WHERE reserved_by_order_id = o.order_id 
    AND status = 'reserved'
)
ORDER BY o.order_id DESC
LIMIT 20;
```

**또는 SQL 파일 사용:**
```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/find_orders_with_reserved_stock.sql
```

### 1. 주문 상태 확인 (order_id를 찾은 후)

```sql
-- 주문 정보 확인 (order_id를 실제 값으로 변경)
SET @order_id = 123;  -- 여기에 실제 order_id 입력

SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM stock_units WHERE reserved_by_order_id = o.order_id AND status = 'reserved') as reserved_stock_count
FROM orders o
WHERE o.order_id = @order_id;
```

### 2. 예약된 재고 확인

```sql
-- 예약된 재고 확인 (order_id를 실제 값으로 변경)
SET @order_id = 64;  -- 여기에 실제 order_id 입력

SELECT 
    su.stock_unit_id,
    su.product_id,
    su.size,
    su.color,
    su.status,
    su.reserved_at,
    su.reserved_by_order_id,
    o.order_number,
    (SELECT COUNT(*) FROM order_item_units oiu WHERE oiu.stock_unit_id = su.stock_unit_id) as unit_count,
    (SELECT COUNT(*) FROM order_item_units oiu 
     WHERE oiu.stock_unit_id = su.stock_unit_id 
     AND oiu.unit_status IN ('reserved', 'shipped', 'delivered')) as active_unit_count,
    (SELECT COUNT(*) FROM order_item_units oiu 
     WHERE oiu.stock_unit_id = su.stock_unit_id 
     AND oiu.active_lock = 1) as active_lock_count
FROM stock_units su
LEFT JOIN orders o ON su.reserved_by_order_id = o.order_id
WHERE su.reserved_by_order_id = @order_id AND su.status = 'reserved';
```

### 3. 안전장치 확인

**해제 가능한 조건**:
- ✅ `order_item_units`가 없거나 모두 `refunded` 상태
- ✅ `active_lock = 1`인 `order_item_units`가 없음
- ✅ 주문이 실제로 완료되지 않음 (paid_events는 있지만 order_item_units 없음)

**해제 불가능한 조건**:
- ❌ `active_lock = 1`인 `order_item_units`가 연결되어 있음
- ❌ 주문이 정상 처리 중 (`paid_events`와 `order_item_units` 모두 존재)

---

## 해제 방법

### 방법 1: 스크립트 사용 (권장)

#### 1단계: 문제 확인 (dry-run)

```bash
cd /var/www/html/backend

# 특정 주문의 예약된 재고 확인
node scripts/release_reserved_stock.js --order-id=123 --dry-run

# 모든 예약된 재고 확인
node scripts/release_reserved_stock.js --check-all
```

#### 2단계: 실제 해제

```bash
# 특정 주문의 예약된 재고 해제
node scripts/release_reserved_stock.js --order-id=123

# 사유와 함께 해제
node scripts/release_reserved_stock.js --order-id=123 --reason="주문 처리 실패로 인한 재고 해제"
```

**스크립트 동작**:
1. 예약된 재고 확인
2. 각 재고의 안전장치 체크
3. 해제 가능한 재고만 해제
4. 상세 로그 기록

---

### 방법 2: SQL 직접 실행 (고급 사용자용)

**⚠️ 주의**: 이 방법은 신중하게 사용해야 합니다. 먼저 dry-run으로 확인하세요.

#### 1단계: 재고 상태 확인

```sql
-- 예약된 재고 확인
SELECT 
    su.stock_unit_id,
    su.product_id,
    su.reserved_by_order_id,
    (SELECT COUNT(*) FROM order_item_units oiu 
     WHERE oiu.stock_unit_id = su.stock_unit_id 
     AND oiu.active_lock = 1) as active_lock_count
FROM stock_units su
WHERE su.reserved_by_order_id = [order_id] 
  AND su.status = 'reserved';
```

#### 2단계: 안전장치 확인

```sql
-- active_lock이 있는지 확인
SELECT 
    oiu.order_item_unit_id,
    oiu.unit_status,
    oiu.active_lock
FROM order_item_units oiu
WHERE oiu.stock_unit_id IN (
    SELECT stock_unit_id FROM stock_units 
    WHERE reserved_by_order_id = [order_id] AND status = 'reserved'
)
AND oiu.active_lock = 1;
```

**결과가 있으면 해제 금지!**

#### 3단계: 재고 해제

```sql
-- ⚠️ 주의: active_lock이 없는 경우만 실행
UPDATE stock_units
SET status = 'in_stock',
    reserved_at = NULL,
    reserved_by_order_id = NULL,
    updated_at = NOW()
WHERE reserved_by_order_id = [order_id]
  AND status = 'reserved'
  AND stock_unit_id NOT IN (
      -- active_lock이 있는 order_item_units와 연결된 재고는 제외
      SELECT DISTINCT oiu.stock_unit_id
      FROM order_item_units oiu
      WHERE oiu.active_lock = 1
  );
```

---

## 해제 후 조치

### 1. 재고 해제 확인

```sql
-- 해제된 재고 확인
SELECT 
    stock_unit_id,
    product_id,
    status,
    reserved_by_order_id
FROM stock_units
WHERE stock_unit_id IN (
    -- 해제한 재고 ID들
);
```

### 2. 주문 재처리 (필요한 경우)

재고를 해제한 후 주문을 재처리하려면:

```bash
# paid_events가 없는 경우
node scripts/fix_missing_paid_events.js [order_id]

# paid_events가 있는 경우
node scripts/recover_order_by_number.js [order_number]
```

---

## 자동 복구 시나리오

### 시나리오 A: paid_events 없음

**상황**: 재고만 예약되고 `paid_events`가 없음

**해결**:
1. 재고 해제
2. 주문 재처리 (결제 확인 후)

### 시나리오 B: paid_events는 있지만 order_item_units 없음

**상황**: `paid_events`는 있지만 `processPaidOrder()`가 재고 배정 후 실패

**해결**:
1. 재고 해제
2. `processPaidOrder()` 재실행

```bash
node scripts/fix_missing_paid_events.js [order_id]
```

### 시나리오 C: 모든 데이터가 없음

**상황**: 재고만 예약되고 다른 데이터가 전혀 없음

**해결**:
1. 재고 해제
2. 주문 상태 확인 후 필요시 재처리

---

## 안전장치

### 스크립트 내장 안전장치

1. **active_lock 체크**: 활성 주문 단위가 연결되어 있으면 해제 금지
2. **paid_events 체크**: 주문이 정상 처리 중이면 해제 금지
3. **트랜잭션 사용**: 원자적 처리 보장
4. **상세 로깅**: 모든 작업 기록

### 수동 확인 체크리스트

재고 해제 전 확인:
- [ ] `order_item_units`가 없거나 모두 `refunded` 상태
- [ ] `active_lock = 1`인 `order_item_units`가 없음
- [ ] 주문이 실제로 완료되지 않았음
- [ ] 재고 해제 후 주문 재처리 계획 수립

---

## 예시

### 예시 1: 단일 주문 재고 해제

```bash
# 1. 확인
node scripts/release_reserved_stock.js --order-id=123 --dry-run

# 출력 예시:
# 📋 주문 ID 123에 예약된 재고: 2개
# 주문 번호: ORD-20250125-001
# 주문 상태: pending
# 
# ✅ 해제 가능: 2개
#    - stock_unit_id: 456, product_id: PM-26-SH-Teneu-Solid-LB
#    - stock_unit_id: 457, product_id: PM-26-SH-Teneu-Solid-LB

# 2. 실제 해제
node scripts/release_reserved_stock.js --order-id=123

# 출력 예시:
# ✅ 재고 해제 완료: 2개
# 해제된 재고:
#    - stock_unit_id: 456, product_id: PM-26-SH-Teneu-Solid-LB
#    - stock_unit_id: 457, product_id: PM-26-SH-Teneu-Solid-LB
```

### 예시 2: 모든 고아 재고 확인

```bash
node scripts/release_reserved_stock.js --check-all

# 출력 예시:
# 📋 예약된 재고: 5개
# 
# ✅ 해제 가능: 3개
#    - stock_unit_id: 456, order_id: 123, order_number: ORD-20250125-001
#    - stock_unit_id: 457, order_id: 124, order_number: ORD-20250125-002
#    - stock_unit_id: 458, order_id: 125, order_number: ORD-20250125-003
# 
# ⚠️  해제 불가 (활성 주문 단위 연결): 1개
# 🔍 검토 필요: 1개
```

---

## 주의사항

### ⚠️ 절대 하지 말아야 할 것

1. **활성 주문 단위가 있는 재고 해제 금지**
   - `active_lock = 1`인 `order_item_units`가 연결된 재고는 해제하면 안 됨
   - 주문이 정상 처리 중일 수 있음

2. **트랜잭션 외부에서 직접 UPDATE 금지**
   - 안전장치 없이 직접 UPDATE하면 데이터 불일치 발생 가능

3. **일괄 해제 금지**
   - 주문별로 확인 후 해제해야 함

### ✅ 안전한 사용 방법

1. **항상 dry-run으로 먼저 확인**
2. **주문별로 하나씩 처리**
3. **해제 후 로그 확인**
4. **필요시 주문 재처리**

---

## 관련 스크립트

- `release_reserved_stock.js`: 예약된 재고 해제 스크립트
- `fix_missing_paid_events.js`: 주문 복구 스크립트
- `recover_order_by_number.js`: 주문 번호로 복구
- `recover_pipeline_batch.js`: 배치 복구

---

## 참고 문서

- `ORDER_RECOVERY_GUIDE.md`: 주문 복구 가이드
- `PIPELINE_RECOVERY_GUIDE.md`: 파이프라인 복구 가이드
- `backend/utils/stock-corrector.js`: 재고 정정 유틸리티
