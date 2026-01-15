# 주문 후처리 파이프라인 문제 분석

**작성일**: 2026-01-15  
**문제**: `payments.status = 'captured'`인데 `paid_events`가 생성되지 않음

---

## 🔍 문제 현황

### 확인된 사실
1. **대부분의 주문**: `payments.status = 'captured'`인데 `paid_events` 없음
   - 주문 61, 60, 58, 57, 55, 54, 53, 51, 50 등
2. **주문 56**: `paid_events`는 있지만 `processing_status = failed`
   - 에러: `Field 'order_id' doesn't have a default value` (이미 수정된 버그)
3. **백엔드 로그**: `createPaidEvent()` 호출은 되지만 실패
   - 에러 위치: `paid-event-creator.js:59:56`
   - 에러 메시지가 잘려서 보임

---

## 🔎 원인 분석

### 가능한 원인

#### 1. UNIQUE 제약 위반
- `paid_events` 테이블에 `(order_id, payment_key)` UNIQUE 제약 존재
- 하지만 코드에 중복 체크 로직이 있음 (89-109번 라인)
- **확인 필요**: 실제로 중복인지, 아니면 다른 에러인지

#### 2. NOT NULL 제약 위반
- `orderId`, `paymentKey`, `amount`, `currency`, `eventSource`가 null일 수 있음
- **확인 필요**: 실제 전달되는 값 확인

#### 3. FK 제약 위반
- `order_id`가 `orders` 테이블에 없을 수 있음
- 하지만 `payments` 테이블에는 저장되었으므로 주문은 존재함
- **확인 필요**: 실제 `order_id` 값 확인

#### 4. 데이터 타입 불일치
- `amount`가 숫자가 아닐 수 있음
- `eventSource`가 enum 값과 맞지 않을 수 있음
- **확인 필요**: 실제 전달되는 데이터 타입 확인

---

## 🛠️ 해결 방법

### 1단계: 상세 에러 로그 확인

VPS에서 실행:
```bash
cd /var/www/html/backend
bash scripts/check_paid_events_error_detailed.sh
```

**확인 사항**:
- 전체 에러 메시지 (잘린 부분 포함)
- 에러 코드 (`ER_`로 시작하는 MySQL 에러 코드)
- 스택 트레이스

### 2단계: paid_events 테이블 구조 확인

```sql
DESCRIBE paid_events;
SHOW CREATE TABLE paid_events;
```

**확인 사항**:
- 컬럼 타입 및 제약 조건
- UNIQUE 제약 조건
- FK 제약 조건

### 3단계: 실제 데이터 확인

```sql
-- payments 테이블에서 결제 정보 확인
SELECT 
    p.payment_id,
    p.order_number,
    p.payment_key,
    p.status,
    p.amount,
    p.currency,
    o.order_id,
    o.status as order_status
FROM payments p
JOIN orders o ON p.order_number = o.order_number
WHERE o.status = 'processing'
  AND p.status = 'captured'
  AND NOT EXISTS (
      SELECT 1 FROM paid_events WHERE order_id = o.order_id
  )
LIMIT 5;
```

### 4단계: 수동 테스트

실제 데이터로 `createPaidEvent()` 호출 테스트:
```bash
cd /var/www/html/backend
node -e "
const { createPaidEvent } = require('./utils/paid-event-creator');
createPaidEvent({
    orderId: 61,
    paymentKey: '실제_payment_key',
    amount: 128000.00,
    currency: 'KRW',
    eventSource: 'redirect',
    rawPayload: null
}).then(result => {
    console.log('성공:', result);
}).catch(error => {
    console.error('실패:', error.message);
    console.error('에러 코드:', error.code);
    console.error('스택:', error.stack);
});
"
```

---

## 📋 체크리스트

- [ ] 상세 에러 로그 확인 (`check_paid_events_error_detailed.sh`)
- [ ] `paid_events` 테이블 구조 확인
- [ ] 실제 전달되는 데이터 확인
- [ ] 수동 테스트 실행
- [ ] 에러 원인 파악
- [ ] 수정 사항 적용

---

## 💡 예상 해결책

### 시나리오 1: UNIQUE 제약 위반
**원인**: 이미 `paid_events`가 존재하는데 중복 체크 로직이 제대로 작동하지 않음

**해결**: 
- 중복 체크 로직 개선
- 또는 `INSERT IGNORE` 사용

### 시나리오 2: NOT NULL 제약 위반
**원인**: `paymentKey` 또는 다른 필수 필드가 null

**해결**:
- `payments-routes.js`에서 전달 전 null 체크 추가
- 기본값 설정

### 시나리오 3: 데이터 타입 불일치
**원인**: `amount`가 문자열이거나 `eventSource`가 enum 값과 맞지 않음

**해결**:
- 데이터 타입 변환 추가
- enum 값 검증

---

**다음 단계**: 상세 에러 로그 확인 후 원인 파악
