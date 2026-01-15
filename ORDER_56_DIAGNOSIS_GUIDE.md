# 주문 56 진단 가이드

## 🔍 문제 상황
- 주문 상태: `processing`
- `paid_at`: NULL
- warranty: 없음
- invoice: 없음
- 결제 상태: `captured` (결제 완료)

## 📋 진단 단계

### Step 1: 진단 스크립트 실행

VPS에서 실행:
```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/check_order_56_status.sql
```

**확인 사항**:
1. `paid_events`에 이벤트가 있는지
2. `paid_event_processing` 상태 (`pending`, `processing`, `success`, `failed`)
3. `order_item_units`가 생성되었는지
4. `warranties`가 생성되었는지
5. `invoices`가 생성되었는지

---

### Step 2: 가능한 원인 분석

#### 원인 1: paid_events가 없음
**증상**: `paid_events` 테이블에 order_id=56인 레코드 없음

**원인**:
- `/api/payments/confirm`이 호출되지 않음
- 결제 확인 API에서 에러 발생

**해결**:
- 프론트엔드에서 결제 완료 후 `/api/payments/confirm` 호출 확인
- 서버 로그 확인: `pm2 logs prepmood-backend --lines 200 | grep -E "payments.*confirm|order.*56"`

---

#### 원인 2: paid_events는 있지만 paid_event_processing이 없음
**증상**: `paid_events`는 있지만 `paid_event_processing` 레코드 없음

**원인**:
- `createPaidEvent()` 함수가 `paid_event_processing` 레코드를 생성하지 않음
- 또는 별도 프로세스가 처리해야 하는데 실행되지 않음

**해결**:
- `backend/utils/paid-event-creator.js` 확인
- `paid_event_processing` 레코드 생성 로직 확인

---

#### 원인 3: paid_event_processing.status = 'pending' 또는 'processing'
**증상**: `paid_event_processing.status`가 `pending` 또는 `processing`

**원인**:
- `processPaidOrder()`가 실행 중이거나 대기 중
- 또는 실행 중 에러 발생

**해결**:
- 서버 로그 확인: `pm2 logs prepmood-backend --lines 200 | grep -E "PAID_PROCESSOR|order.*56"`
- `paid_event_processing.last_error` 확인

---

#### 원인 4: paid_event_processing.status = 'failed'
**증상**: `paid_event_processing.status = 'failed'`

**원인**:
- `processPaidOrder()` 실행 중 에러 발생
- 재고 부족, FK 제약 위반 등

**해결**:
- `paid_event_processing.last_error` 확인
- 서버 로그 확인
- 에러 메시지에 따라 수정

---

#### 원인 5: paid_event_processing.status = 'success'인데 paid_at이 NULL
**증상**: `paid_event_processing.status = 'success'`이지만 `orders.paid_at`이 NULL

**원인**:
- `processPaidOrder()`에서 `orders.paid_at` 업데이트 실패
- 트랜잭션 롤백

**해결**:
- 서버 로그에서 `[PAID_PROCESSOR] orders.paid_at 업데이트 실패` 확인
- 트랜잭션 롤백 원인 확인

---

## 🚀 빠른 확인 명령어

```bash
# 1. 주문 56 기본 정보
mysql -u prepmood_user -p prepmood -e "
SELECT 
    order_id,
    order_number,
    status,
    paid_at,
    total_price
FROM orders
WHERE order_id = 56;
"

# 2. paid_events 확인
mysql -u prepmood_user -p prepmood -e "
SELECT 
    event_id,
    order_id,
    payment_key,
    event_source,
    created_at
FROM paid_events
WHERE order_id = 56;
"

# 3. paid_event_processing 확인
mysql -u prepmood_user -p prepmood -e "
SELECT 
    pep.event_id,
    pep.status,
    pep.last_error,
    pep.processed_at
FROM paid_event_processing pep
JOIN paid_events pe ON pep.event_id = pe.event_id
WHERE pe.order_id = 56;
"
```

---

## 🔧 수동 처리 방법

### processPaidOrder() 수동 실행

**주의**: 이미 처리된 경우 중복 처리될 수 있으므로 주의

```bash
# Node.js 스크립트로 수동 실행 (별도 스크립트 필요)
# 또는 백엔드 API 엔드포인트 생성 필요
```

---

## 📝 다음 단계

진단 스크립트 실행 결과를 확인한 후:
1. 원인 파악
2. 해결 방법 결정
3. 수정 또는 수동 처리
