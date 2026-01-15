# 주문 58 근본 원인 분석

## 🔍 현재 상황

1. **결제는 완료됨**: `payments` 테이블에 `status = 'captured'` 기록 존재
2. **`paid_events` 생성 실패**: 로그에 `[PAID_EVENT_CREATOR] paid_events 생성 실패` 반복 발생
3. **결과**: `processPaidOrder()` 실행되지 않음 → 재고 배정, 보증서, 인보이스 미생성

---

## 📊 로그 확인 방법

### 방법 1: 더 넓은 범위로 검색

VPS에서 실행:

```bash
cd /var/www/html/backend

# 주문 58 관련 모든 로그
pm2 logs prepmood-backend --lines 1000 | grep -i "58\|ORD-20260115-322539" | tail -100

# paid_events 관련 모든 로그
pm2 logs prepmood-backend --lines 1000 | grep -i "paid.*event\|PAID_EVENT" | tail -50

# payments/confirm 관련 로그
pm2 logs prepmood-backend --lines 1000 | grep -i "payments.*confirm\|/payments/confirm" | tail -50

# 최근 에러 로그 전체
pm2 logs prepmood-backend --lines 200 | grep -i "error\|❌\|failed" | tail -50
```

### 방법 2: 로그 파일 직접 확인

```bash
# PM2 로그 파일 위치 확인
pm2 describe prepmood-backend | grep "log path"

# 로그 파일 직접 확인 (예시)
tail -1000 ~/.pm2/logs/prepmood-backend-error.log | grep -i "58\|paid"
```

### 방법 3: 실시간 로그 모니터링

```bash
# 실시간 로그 확인 (새 주문 테스트 시)
pm2 logs prepmood-backend --lines 0
```

---

## 🔧 예상 원인 (우선순위별)

### 원인 1: 트랜잭션 락 타임아웃 (가능성 높음)

**증상**:
- `ER_LOCK_WAIT_TIMEOUT` 에러
- 다른 트랜잭션이 `orders` 테이블을 잠그고 있을 때 발생

**확인 방법**:
```sql
-- 현재 실행 중인 트랜잭션 확인
SHOW PROCESSLIST;

-- 락 대기 중인 쿼리 확인
SELECT * FROM information_schema.INNODB_LOCKS;
SELECT * FROM information_schema.INNODB_LOCK_WAITS;
```

**해결책**:
- `paid_events` 생성 시 `orders` 테이블 락을 사용하지 않도록 수정
- 또는 `paid_events` 생성 시 `FOR UPDATE` 제거

---

### 원인 2: 외래키 제약 위반

**증상**:
- `ER_NO_REFERENCED_ROW_2` 에러
- `order_id = 58`이 `orders` 테이블에 없음 (하지만 확인 결과 존재함)

**확인**:
```sql
SELECT order_id FROM orders WHERE order_id = 58;
```

---

### 원인 3: UNIQUE 제약 위반

**증상**:
- `ER_DUP_ENTRY` 에러
- `(order_id, payment_key)` 조합이 이미 존재

**확인**:
```sql
SELECT * FROM paid_events 
WHERE order_id = 58 AND payment_key = 'tprep20260115204203autG0';
```

**해결책**:
- 이미 존재하는 경우 기존 `paid_events` 사용 (코드에 이미 처리됨)

---

### 원인 4: 데이터 타입 불일치

**증상**:
- `amount` 값이 숫자가 아님
- `currency` 값이 잘못됨

**확인**:
```sql
-- payments 테이블의 실제 값 확인
SELECT payment_key, amount, currency 
FROM payments 
WHERE order_number = 'ORD-20260115-322539-OKY1SR';
```

---

## 🚀 근본 해결 방법

### 해결책 1: `paid_events` 생성 시 락 제거

`createPaidEvent()` 함수는 별도 커넥션(autocommit)을 사용하므로, `orders` 테이블 락이 필요 없습니다.

**확인할 코드**:
- `paid-event-creator.js`에서 `orders` 테이블 조회/락 사용 여부 확인

---

### 해결책 2: 에러 처리 개선

현재 `createPaidEvent()` 실패 시 에러를 throw하므로, `payments-routes.js`에서 catch하여 처리합니다.

**확인할 코드**:
- `payments-routes.js`의 `createPaidEvent()` 호출 부분
- 에러 발생 시 어떻게 처리하는지 확인

---

## 📝 다음 단계

1. **로그 확인**: 위의 방법으로 상세 로그 확인
2. **에러 코드 확인**: 구체적인 에러 코드 공유
3. **코드 검토**: `createPaidEvent()` 함수와 호출 부분 확인
4. **해결책 적용**: 에러 코드에 따라 적절한 해결책 적용

---

## ⚠️ 중요 사항

- **테스트 주문이므로 임시 처리는 불필요**
- **근본 원인을 파악하여 향후 주문에서 발생하지 않도록 해결**
- **로그가 비어있다면 로그 형식이나 저장 위치 확인 필요**
