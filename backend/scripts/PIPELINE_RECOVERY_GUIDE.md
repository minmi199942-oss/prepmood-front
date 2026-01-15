# 주문 후처리 파이프라인 복구 가이드

## 개요

주문 완료 후 `paid_events`가 생성되지 않거나 `processPaidOrder()`가 실패하여 `order_item_units`, `warranties`, `invoices`가 생성되지 않은 주문들을 복구하는 방법입니다.

## 문제 진단

### 1. 문제가 있는 주문 확인

VPS에서 실행:
```bash
cd /var/www/html/backend
mysql -u root -p prepmood < scripts/check_order_processing_pipeline.sql
```

또는 직접 쿼리:
```sql
USE prepmood;

-- paid_events가 없는 주문
SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM warranties 
     WHERE source_order_item_unit_id IN (
         SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
     )) as warranties_count,
    (SELECT COUNT(*) FROM invoices WHERE order_id = o.order_id) as invoices_count
FROM orders o
JOIN payments p ON o.order_number = p.order_number
WHERE o.status IN ('processing', 'pending')
  AND p.status = 'captured'
  AND NOT EXISTS (SELECT 1 FROM paid_events WHERE order_id = o.order_id)
ORDER BY o.order_id DESC
LIMIT 10;
```

## 복구 방법

### 방법 1: 단일 주문 복구

특정 주문 하나만 복구하는 경우:

```bash
cd /var/www/html/backend
node scripts/fix_missing_paid_events.js [order_id]
```

**예시**:
```bash
node scripts/fix_missing_paid_events.js 61
```

**동작**:
1. 주문 정보 확인
2. `payments` 테이블에서 결제 정보 확인
3. `paid_events`가 없으면 생성
4. `processPaidOrder()` 실행
5. `orders.status` 집계 함수 호출

### 방법 2: 배치 복구 (권장)

여러 주문을 한 번에 복구하는 경우:

#### 1단계: 문제 확인 (dry-run)

```bash
cd /var/www/html/backend
node scripts/recover_pipeline_batch.js --dry-run --limit=10
```

**출력 예시**:
```
🔍 문제가 있는 주문 검색 중...

📋 발견된 주문: 3개

1. 주문 61 (ORD-20260115-079226-J3ASVO)
   - 상태: processing
   - paid_events: 0개
   - order_item_units: 0개
   - warranties: 0개
   - invoices: 0개

2. 주문 60 (ORD-20260115-075432-K2BSVO)
   - 상태: processing
   - paid_events: 0개
   - order_item_units: 0개
   - warranties: 0개
   - invoices: 0개

...

🔍 --dry-run 모드: 실제 복구는 수행하지 않습니다.
```

#### 2단계: 실제 복구

```bash
cd /var/www/html/backend
node scripts/recover_pipeline_batch.js --limit=10
```

**옵션**:
- `--dry-run`: 실제 복구하지 않고 문제가 있는 주문만 확인
- `--limit=N`: 최대 N개 주문만 처리 (기본값: 10)

**출력 예시**:
```
🔄 주문 복구 시작...

✅ 주문 61 복구 완료
✅ 주문 60 복구 완료
❌ 주문 58 복구 실패: 결제 상태가 'captured'가 아닙니다. 현재 상태: authorized

📊 복구 결과 요약:
   ✅ 성공: 2개
   ❌ 실패: 1개
```

## 복구 후 검증

### 1. 주문 상태 확인

```sql
USE prepmood;

SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM warranties 
     WHERE source_order_item_unit_id IN (
         SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
     )) as warranties_count,
    (SELECT COUNT(*) FROM invoices WHERE order_id = o.order_id) as invoices_count
FROM orders o
WHERE o.order_id IN (61, 60, 58)
ORDER BY o.order_id DESC;
```

### 2. 로그 확인

```bash
pm2 logs prepmood-backend --lines 100 | grep -E "FIX_MISSING_PAID_EVENTS|RECOVER_PIPELINE_BATCH"
```

## 주의사항

1. **트랜잭션 안전성**: 각 주문 복구는 트랜잭션으로 처리되므로, 실패해도 다른 주문에 영향을 주지 않습니다.

2. **중복 실행**: `paid_events`가 이미 있는 경우 `processPaidOrder()`만 재실행합니다. 멱등성 보장.

3. **결제 상태 확인**: `payments.status = 'captured'`인 주문만 복구합니다.

4. **로그 확인**: 복구 실패 시 백엔드 로그를 확인하여 원인을 파악하세요.

## 문제 해결

### 에러: "결제 상태가 'captured'가 아닙니다"

**원인**: `payments.status`가 `'authorized'` 또는 다른 상태

**해결**: 해당 주문은 아직 결제가 완료되지 않았으므로 복구하지 않습니다.

### 에러: "paid_events 생성 실패: eventId가 null입니다"

**원인**: `createPaidEvent()` 함수 내부 오류

**해결**: 
1. 백엔드 로그 확인: `pm2 logs prepmood-backend --lines 200 | grep PAID_EVENT_CREATOR`
2. UNIQUE 제약 위반 여부 확인
3. DB 연결 상태 확인

### 에러: "주문을 찾을 수 없습니다"

**원인**: 잘못된 `order_id` 입력

**해결**: 올바른 `order_id` 확인 후 재실행

## 참고 문서

- `check_order_processing_pipeline.sql`: 파이프라인 상태 진단 쿼리
- `fix_missing_paid_events.js`: 단일 주문 복구 스크립트
- `recover_pipeline_batch.js`: 배치 복구 스크립트
- `ORDER_PROCESSING_ISSUE_ANALYSIS.md`: 문제 분석 문서
