# 주문 61 진단 가이드

## 문제 상황
- 주문 61: `status = 'processing'`, `paid_at = NULL`
- `paid_events`: 없음
- `order_item_units`: 없음
- `warranties`: 없음
- `invoices`: 없음

## 진단 단계

### Step 1: DB 상태 확인 (VPS에서 실행)

```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/check_order_61_detailed.sql
```

**확인 사항**:
1. `payments` 테이블에 주문 61의 결제 정보가 있는지
2. `paid_events` 테이블에 레코드가 있는지
3. `paid_event_processing` 테이블에 에러 메시지가 있는지

### Step 2: 백엔드 로그 확인

```bash
pm2 logs prepmood-backend --lines 500 | grep -E "order.*61|ORD-20260115-079226-J3ASVO|paid_events|PAID_PROCESSOR|payments.*confirm" | tail -100
```

**확인 사항**:
1. `POST /api/payments/confirm` 호출 여부
2. `createPaidEvent()` 호출 여부 및 에러 메시지
3. `processPaidOrder()` 호출 여부 및 에러 메시지

### Step 3: 예상 원인별 확인

#### 시나리오 A: createPaidEvent() 실패
**증상**: 로그에 `[payments][confirm] Paid 처리 실패` 메시지
**원인**: `createPaidEvent()` 호출 시 에러 발생 (UNIQUE 제약 위반, DB 연결 오류 등)
**해결**: 로그의 에러 메시지 확인 후 수정

#### 시나리오 B: alreadyProcessedStatuses 블록 진입
**증상**: `payments` 테이블에 결제 정보가 있지만 `paid_events`는 없음
**원인**: 주문이 이미 `processing` 상태였고, `existingPaymentStatus !== 'captured'`
**해결**: `alreadyProcessedStatuses` 블록의 로직 확인

#### 시나리오 C: payments 테이블에 결제 정보 없음
**증상**: `payments` 테이블에 주문 61의 레코드가 없음
**원인**: `POST /api/payments/confirm`이 호출되지 않았거나 실패
**해결**: 결제 플로우 확인

## 예상 해결 방법

### 방법 1: 수동 paid_events 생성 및 재처리

```sql
-- 1. payments 테이블에서 결제 정보 확인
SELECT payment_key, status, amount, currency
FROM payments
WHERE order_number = 'ORD-20260115-079226-J3ASVO'
ORDER BY created_at DESC
LIMIT 1;

-- 2. paid_events 수동 생성 (payment_key 확인 후)
-- INSERT INTO paid_events (order_id, payment_key, event_source, amount, currency, raw_payload_json)
-- VALUES (61, '확인한_payment_key', 'manual_verify', 128000.00, 'KRW', NULL);

-- 3. processPaidOrder() 재실행 (Node.js 스크립트 필요)
```

### 방법 2: 코드 수정 후 재처리

1. `payments-routes.js`의 에러 처리 개선
2. `createPaidEvent()` 실패 시 더 명확한 에러 메시지
3. 주문 상태와 `paid_events` 생성의 원자성 보장

## 다음 단계

1. **즉시**: VPS에서 `check_order_61_detailed.sql` 실행
2. **즉시**: 백엔드 로그 확인
3. **결과 확인 후**: 원인에 따른 해결 방법 적용
