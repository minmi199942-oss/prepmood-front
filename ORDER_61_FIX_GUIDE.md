# 주문 61 수정 가이드

## 진단 결과 요약

### 현재 상태
- ✅ `payments` 테이블: `captured` 상태로 결제 정보 존재
- ❌ `paid_events`: 없음
- ❌ `order_item_units`: 없음
- ❌ `warranties`: 없음
- ❌ `invoices`: 없음

### 문제 원인
`createPaidEvent()`가 호출되지 않았거나 실패했습니다. 따라서 `processPaidOrder()`가 실행되지 않아 `order_item_units`, `warranties`, `invoices`가 생성되지 않았습니다.

## 해결 방법

### 방법 1: 수동 paid_events 생성 및 재처리 (권장)

#### Step 1: paid_events 수동 생성

```sql
USE prepmood;

-- payments 테이블에서 결제 정보 확인
SELECT payment_id, payment_key, status, amount, currency
FROM payments
WHERE order_number = 'ORD-20260115-079226-J3ASVO'
ORDER BY created_at DESC
LIMIT 1;

-- paid_events 생성 (payment_key 확인 후)
INSERT INTO paid_events 
    (order_id, payment_key, event_source, amount, currency, raw_payload_json)
VALUES 
    (61, 'tprep202601152144397i7W4', 'manual_verify', 128000.00, 'KRW', NULL);

-- 생성된 event_id 확인
SELECT event_id, order_id, payment_key, created_at
FROM paid_events
WHERE order_id = 61
ORDER BY event_id DESC
LIMIT 1;
```

#### Step 2: processPaidOrder() 재실행

Node.js 스크립트를 사용하여 `processPaidOrder()`를 재실행합니다.

```bash
cd /var/www/html/backend
node scripts/fix_order_61_manual.js
```

### 방법 2: 백엔드 로그 확인 후 원인 파악

```bash
pm2 logs prepmood-backend --lines 1000 | grep -E "order.*61|ORD-20260115-079226-J3ASVO|paid_events|createPaidEvent|PAID_PROCESSOR" | tail -100
```

**확인 사항**:
1. `POST /api/payments/confirm` 호출 여부
2. `createPaidEvent()` 호출 여부 및 에러 메시지
3. `alreadyProcessedStatuses` 블록 진입 여부

## 예상 원인

### 시나리오 A: createPaidEvent() 실패
**증상**: 로그에 `[payments][confirm] Paid 처리 실패` 메시지
**원인**: `createPaidEvent()` 호출 시 에러 발생 (UNIQUE 제약 위반, DB 연결 오류 등)
**해결**: 로그의 에러 메시지 확인 후 수정

### 시나리오 B: alreadyProcessedStatuses 블록 진입
**증상**: 주문이 이미 `processing` 상태였고, `payments` 테이블에 레코드가 있음
**원인**: 첫 번째 호출에서 주문 상태만 업데이트되고 `paid_events` 생성 실패
**해결**: 방법 1 (수동 생성 및 재처리)

### 시나리오 C: payments 테이블에 레코드 없음
**증상**: `payments` 테이블에 주문 61의 레코드가 없음
**원인**: `POST /api/payments/confirm`이 호출되지 않았거나 실패
**해결**: 결제 플로우 확인

## 다음 단계

1. **즉시**: 백엔드 로그 확인
2. **로그 확인 후**: 원인에 따른 해결 방법 적용
3. **가장 빠른 해결**: 방법 1 (수동 생성 및 재처리)
