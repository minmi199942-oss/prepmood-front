# 주문 58 문제 해결 가이드

## 🔍 문제 원인

**핵심 문제**: `createPaidEvent()` 함수가 실패하여 `paid_events`가 생성되지 않음

**증상**:
- `payments` 테이블에는 결제 기록이 있음 (`status = 'captured'`)
- `paid_events` 테이블이 비어있음
- 로그에 `[PAID_EVENT_CREATOR] paid_events 생성 실패` 반복 발생
- 결과적으로 `processPaidOrder()`가 실행되지 않음

---

## 📊 상세 에러 확인

VPS에서 실행하여 구체적인 에러 메시지 확인:

```bash
cd /var/www/html/backend
bash scripts/check_paid_event_error.sh
```

또는 직접 확인:

```bash
pm2 logs prepmood-backend --lines 500 | grep -A 15 "PAID_EVENT_CREATOR.*paid_events 생성 실패" | tail -50
```

**확인할 에러 코드**:
- `ER_LOCK_WAIT_TIMEOUT` - 트랜잭션 락 타임아웃 (주문 56에서도 발생)
- `ER_DUP_ENTRY` - UNIQUE 제약 위반
- `ER_NO_REFERENCED_ROW_2` - 외래키 제약 위반
- 기타 SQL 에러

---

## 🔧 예상 원인 및 해결책

### 원인 1: 트랜잭션 락 타임아웃 (`ER_LOCK_WAIT_TIMEOUT`)

**증상**:
- 로그에 `ER_LOCK_WAIT_TIMEOUT` 에러
- 다른 트랜잭션이 `orders` 테이블을 잠그고 있을 가능성

**해결책**:
1. **임시 조치**: `paid_events` 수동 생성 후 `processPaidOrder()` 실행
2. **근본 해결**: 트랜잭션 락 순서 최적화 또는 타임아웃 증가

---

### 원인 2: UNIQUE 제약 위반 (`ER_DUP_ENTRY`)

**증상**:
- 로그에 `ER_DUP_ENTRY` 에러
- `(order_id, payment_key)` 조합이 이미 존재

**해결책**:
- 이미 존재하는 `paid_events`를 사용하도록 코드 수정 (이미 처리됨)
- 하지만 현재는 `paid_events`가 비어있으므로 이 원인은 아닐 가능성 높음

---

### 원인 3: 외래키 제약 위반

**증상**:
- 로그에 `ER_NO_REFERENCED_ROW_2` 에러
- `order_id = 58`이 `orders` 테이블에 없음

**확인**:
```sql
SELECT order_id FROM orders WHERE order_id = 58;
```

**해결책**:
- 주문이 존재하는지 확인
- 존재한다면 외래키 제약 문제

---

## 🚀 즉시 해결 방법

### 방법 1: `paid_events` 수동 생성 후 `processPaidOrder()` 실행

VPS에서 실행:

```bash
cd /var/www/html/backend

# 1. paid_events 수동 생성
mysql -u prepmood_user -p prepmood <<EOF
INSERT INTO paid_events 
(order_id, payment_key, event_source, amount, currency, confirmed_at, created_at)
VALUES 
(58, 'tprep20260115204203autG0', 'redirect', 128000.00, 'KRW', NOW(), NOW());
EOF

# 2. paid_event_processing 생성
mysql -u prepmood_user -p prepmood <<EOF
INSERT INTO paid_event_processing 
(event_id, status, created_at, updated_at)
SELECT event_id, 'pending', NOW(), NOW()
FROM paid_events
WHERE order_id = 58;
EOF

# 3. processPaidOrder() 실행
node -e "
const { processPaidOrder } = require('./utils/paid-order-processor');
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  });
  
  await conn.beginTransaction();
  
  const [pe] = await conn.execute('SELECT event_id, payment_key, amount, currency FROM paid_events WHERE order_id = 58');
  
  await processPaidOrder({
    connection: conn,
    paidEventId: pe[0].event_id,
    orderId: 58,
    paymentKey: pe[0].payment_key,
    amount: parseFloat(pe[0].amount),
    currency: pe[0].currency,
    eventSource: 'redirect',
    rawPayload: null
  });
  
  await conn.commit();
  await conn.end();
  console.log('✅ 완료');
})();
"
```

---

### 방법 2: Node.js 스크립트로 자동 처리

더 안전한 방법으로 스크립트 작성 예정.

---

## 📝 다음 단계

1. **상세 에러 로그 확인**: `check_paid_event_error.sh` 실행
2. **에러 코드 확인**: 구체적인 에러 코드 공유
3. **해결책 적용**: 에러 코드에 따라 적절한 해결책 적용

---

## ⚠️ 주의사항

- `paid_events`는 "결제 증거"이므로 반드시 생성되어야 함
- `processPaidOrder()`는 `paid_events`가 있어야만 실행 가능
- 트랜잭션 락 문제는 근본적으로 해결해야 함
