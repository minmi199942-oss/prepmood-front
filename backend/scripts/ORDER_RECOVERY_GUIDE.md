# 주문 처리 중단 문제 해결 가이드

## 🎯 문제 상황
"재고는 차감되었는데 보증서/인보이스가 생성되지 않음"

## 📋 단계별 해결 방법

### 1단계: 문제 진단 (어떤 주문이 문제인지 확인)

#### 방법 A: SQL로 확인 (권장)

```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u root -p prepmood < scripts/check_order_status_detailed.sql
```

SQL 파일에서 주문 번호를 변경:
```sql
SET @order_number = 'YOUR_ORDER_NUMBER' COLLATE utf8mb4_unicode_ci;
```

#### 방법 B: 배치 스크립트로 확인

```bash
cd /var/www/html/backend
node scripts/recover_pipeline_batch.js --dry-run --limit=20
```

**확인 사항**:
- ✅ `paid_events` 존재 여부
- ✅ `order_item_units` 존재 여부  
- ✅ `warranties` 존재 여부
- ✅ `invoices` 존재 여부
- ✅ `stock_units.reserved_by_order_id` 확인 (재고가 실제로 차감되었는지)

---

### 2단계: 원인 파악

#### 시나리오 A: 재고는 차감되었지만 paid_events가 없음
**원인**: `createPaidEvent()` 실패 또는 호출되지 않음
**해결**: 3단계 방법 1 사용

#### 시나리오 B: paid_events는 있지만 order_item_units가 없음
**원인**: `processPaidOrder()`가 재고 배정 후 실패
**해결**: 3단계 방법 2 사용

#### 시나리오 C: order_item_units는 있지만 warranties가 없음
**원인**: `processPaidOrder()`가 warranties 생성 단계에서 실패
**해결**: 3단계 방법 2 사용 (재실행하면 멱등성으로 처리됨)

#### 시나리오 D: 재고가 차감되었지만 다른 데이터가 없음
**원인**: 트랜잭션 실패 후 재고만 남아있거나, 다른 경로에서 재고만 차감됨
**해결**: 3단계 방법 3 사용 (재고 정리 후 재처리)

---

### 3단계: 복구 실행

#### 방법 1: 단일 주문 복구 (paid_events 없음)

```bash
cd /var/www/html/backend
node scripts/fix_missing_paid_events.js [order_id]
```

**예시**:
```bash
node scripts/fix_missing_paid_events.js 61
```

**동작**:
1. `paid_events` 생성 (없는 경우)
2. `processPaidOrder()` 실행
3. `orders.status` 집계 함수 호출

---

#### 방법 2: paid_events는 있지만 뒷부분이 끊긴 경우

**paid_events가 있는 경우**, `processPaidOrder()`만 재실행:

```bash
cd /var/www/html/backend
node scripts/fix_missing_paid_events.js [order_id]
```

이 스크립트는 `paid_events`가 이미 있으면 자동으로 `processPaidOrder()`만 재실행합니다.

---

#### 방법 3: 재고만 차감된 경우 (특수 케이스)

재고가 차감되었지만 다른 데이터가 없는 경우, 재고를 먼저 정리한 후 재처리:

```sql
-- 1. 재고 상태 확인
SELECT 
    su.stock_unit_id,
    su.product_id,
    su.size,
    su.color,
    su.status,
    su.reserved_by_order_id,
    o.order_number
FROM stock_units su
LEFT JOIN orders o ON su.reserved_by_order_id = o.order_id
WHERE su.reserved_by_order_id = [order_id];

-- 2. 재고 해제 (필요한 경우만)
-- ⚠️ 주의: 이 작업은 신중하게 수행해야 합니다
UPDATE stock_units
SET status = 'in_stock',
    reserved_at = NULL,
    reserved_by_order_id = NULL
WHERE reserved_by_order_id = [order_id]
  AND status = 'reserved';

-- 3. 그 다음 방법 1 또는 2로 재처리
```

---

#### 방법 4: 배치 복구 (여러 주문 한 번에)

```bash
cd /var/www/html/backend

# 1. 먼저 문제 확인 (dry-run)
node scripts/recover_pipeline_batch.js --dry-run --limit=10

# 2. 실제 복구 실행
node scripts/recover_pipeline_batch.js --limit=10
```

**동작**:
- `paid_events`가 없는 주문: 생성 후 `processPaidOrder()` 실행
- `paid_events`는 있지만 `order_item_units`가 없는 주문: `processPaidOrder()`만 재실행

---

### 4단계: 로그 확인

복구 후 로그 확인:

```bash
pm2 logs prepmood-backend --lines 200 | grep -E "FIX_MISSING_PAID_EVENTS|RECOVER_PIPELINE_BATCH|PAID_PROCESSOR"
```

**확인 사항**:
- ✅ `[PAID_PROCESSOR] Paid 처리 완료` 메시지
- ❌ 에러 메시지가 있으면 원인 파악

---

### 5단계: 결과 검증

```sql
-- 복구 후 상태 확인
SELECT 
    o.order_id,
    o.order_number,
    o.status,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM warranties 
     WHERE source_order_item_unit_id IN (
         SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
     )) as warranties_count,
    (SELECT COUNT(*) FROM invoices WHERE order_id = o.order_id) as invoices_count
FROM orders o
WHERE o.order_id = [order_id];
```

**기대 결과**:
- ✅ `paid_events_count` >= 1
- ✅ `order_item_units_count` >= 1 (주문 상품 수량과 일치)
- ✅ `warranties_count` >= 1 (order_item_units 수와 일치)
- ✅ `invoices_count` >= 1

---

## ⚠️ 주의사항

1. **트랜잭션 안전성**: 각 복구 스크립트는 트랜잭션으로 처리되므로, 실패해도 다른 주문에 영향을 주지 않습니다.

2. **멱등성**: `processPaidOrder()`는 멱등성을 보장합니다. 중복 실행해도 안전합니다.

3. **재고 정리**: 방법 3(재고 해제)은 신중하게 수행해야 합니다. 가능하면 복구 스크립트가 자동으로 처리하도록 하는 것이 좋습니다.

4. **결제 상태**: `payments.status = 'captured'`인 주문만 복구합니다.

---

## 🔍 문제 해결

### 에러: "결제 상태가 'captured'가 아닙니다"
**원인**: `payments.status`가 `'authorized'` 또는 다른 상태
**해결**: 해당 주문은 아직 결제가 완료되지 않았으므로 복구하지 않습니다.

### 에러: "paid_events 생성 실패: eventId가 null입니다"
**원인**: `createPaidEvent()` 함수 내부 오류
**해결**: 
1. 백엔드 로그 확인: `pm2 logs prepmood-backend --lines 200 | grep PAID_EVENT_CREATOR`
2. UNIQUE 제약 위반 여부 확인
3. DB 연결 상태 확인

### 에러: "재고 부족"
**원인**: 재고가 이미 다른 주문에 배정되었거나 부족함
**해결**: 
1. 재고 상태 확인: `SELECT * FROM stock_units WHERE product_id = ? AND status = 'in_stock'`
2. 필요시 재고 해제 후 재처리

### 에러: "주문을 찾을 수 없습니다"
**원인**: 잘못된 `order_id` 입력
**해결**: 올바른 `order_id` 확인 후 재실행

### 💡 참고: WEBHOOK_ATTEMPT_UNRESOLVED (webhook 미해결 결제)

토스 웹훅 처리 중 `payment_attempts`를 paymentKey 기준으로 결정적으로 찾지 못한 경우,
백엔드는 자동으로 processPaidOrder를 실행하지 않고 다음을 남깁니다.

- `paid_events`: 이미 생성된 상태일 수 있음 (결제 증거)
- `payments.status`: 'captured' 등으로 갱신됨
- `orders`: 아직 paid 처리/재고 배정/보증서 생성이 안 된 상태 (processPaidOrder 미실행)
- `webhook_events.processing_status`: `UNRESOLVED_ATTEMPT` (webhook_events 테이블 기준, 최종 처리 상태 — 같은 요청 안에서 PROCESSED/FAILED로 덮지 않음)
- 로그: `[payments][webhook] WEBHOOK_ATTEMPT_UNRESOLVED` 메시지

이 경우 복구는 다음 순서로 진행합니다.

1. **미해결 webhook 이벤트 조회**
   ```sql
   SELECT id, provider_name, provider_event_id, event_type, received_at
   FROM webhook_events
   WHERE processing_status = 'UNRESOLVED_ATTEMPT'
   ORDER BY received_at ASC;
   ```
2. 각 이벤트에 대해 관련 주문/결제를 식별:
   - `payments.payment_key` = 토스 웹훅의 `paymentKey`
   - `payments.order_number` 또는 `orders.order_number` 로 주문 찾기
3. 해당 주문이 위의 5단계 결과 검증 기준에서
   - `paid_events_count >= 1` 이고
   - `order_item_units_count = 0` 인 경우  
   → **시나리오 B**(paid_events는 있지만 order_item_units 없음)로 보고,
   `fix_missing_paid_events.js` 또는 `recover_pipeline_batch.js` 를 사용해 `processPaidOrder()`를 재실행합니다.

> 중요: 현재 복구 스크립트들은 `webhook_events` 테이블을 직접 읽지 않습니다.  
> `payments.status='captured'` 이면서 `paid_events`/`order_item_units` 구조가 비정상인 주문을 기준으로 자동 복구 대상을 찾으며,  
> `UNRESOLVED_ATTEMPT`로 마킹된 webhook 이벤트에 해당하는 주문도 이 구조에 해당하는 경우 자동 복구 범위에 자연스럽게 포함됩니다.
>
> 요약: WEBHOOK_ATTEMPT_UNRESOLVED는 "웹훅에서 자동 처리하지 않은 결제"를 의미하는 **관측용/운영용 표식**이며,  
> recovery 스크립트나 수동 점검 시 **우선 확인해야 하는 미해결 결제 리스트**이지만  
> 그 자체가 "자동 복구 성공" 상태를 뜻하지는 않습니다.

---

## 📚 관련 스크립트

- `check_order_status_detailed.sql`: 주문 상태 상세 진단
- `fix_missing_paid_events.js`: 단일 주문 복구
- `recover_pipeline_batch.js`: 배치 복구
- `recover_order_by_number.js`: 주문 번호로 복구

---

## 🚀 빠른 시작

**가장 빠른 해결 방법**:

```bash
# 1. 문제가 있는 주문 확인
cd /var/www/html/backend
node scripts/recover_pipeline_batch.js --dry-run --limit=10

# 2. 복구 실행
node scripts/recover_pipeline_batch.js --limit=10

# 3. 로그 확인
pm2 logs prepmood-backend --lines 100 | tail -50
```

이렇게 하면 대부분의 문제가 자동으로 해결됩니다!
