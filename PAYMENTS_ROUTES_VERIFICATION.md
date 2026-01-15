# payments-routes.js 수정 사항 확인 가이드

## ✅ 수정 완료된 사항

1. **치명적 버그 수정**: `alreadyProcessedStatuses` 체크 후 `processPaidOrder()` 실행 후 `commit()` 추가
2. **이니시스 결제 흐름 추가**: `paid_events` 생성 및 `processPaidOrder()` 호출 추가

---

## 🔍 확인 방법

### 1단계: 코드 문법 확인

로컬에서 확인:
```bash
cd backend
node -c payments-routes.js
```

또는 linter 확인:
```bash
npm run lint payments-routes.js
```

---

### 2단계: 자동 배포 확인

VPS에서 확인:
```bash
# 자동 배포 로그 확인
tail -f /var/www/html/backend/deploy-run.log

# 또는 PM2 재시작 확인
pm2 status prepmood-backend
```

---

### 3단계: 테스트 주문으로 확인

**새로운 테스트 주문 생성 후 확인**:

#### 3-1. 주문 생성 및 결제 완료

1. 웹사이트에서 테스트 주문 생성
2. 결제 완료
3. `order-complete.html`에서 결제 확인 대기

#### 3-2. DB 상태 확인

VPS에서 실행:
```bash
cd /var/www/html/backend

# 최신 주문 확인
mysql -u prepmood_user -p prepmood -e "
SELECT order_id, order_number, status, paid_at, total_price
FROM orders
ORDER BY order_id DESC
LIMIT 1;
"

# paid_events 확인
mysql -u prepmood_user -p prepmood -e "
SELECT event_id, order_id, payment_key, event_source, amount, created_at
FROM paid_events
ORDER BY event_id DESC
LIMIT 1;
"

# order_item_units 확인
mysql -u prepmood_user -p prepmood -e "
SELECT order_item_unit_id, order_id, order_item_id, stock_unit_id, token_pk, unit_status
FROM order_item_units
ORDER BY order_item_unit_id DESC
LIMIT 5;
"

# warranties 확인
mysql -u prepmood_user -p prepmood -e "
SELECT id, public_id, status, owner_user_id, token_pk, created_at
FROM warranties
ORDER BY id DESC
LIMIT 5;
"

# invoices 확인
mysql -u prepmood_user -p prepmood -e "
SELECT invoice_id, invoice_number, order_id, status, total_amount, issued_at
FROM invoices
ORDER BY invoice_id DESC
LIMIT 1;
"
```

#### 3-3. 예상 결과

정상 처리 시:
- ✅ `orders.status = 'processing'`
- ✅ `orders.paid_at`이 NULL이 아님
- ✅ `paid_events` 생성됨
- ✅ `order_item_units` 생성됨 (주문 항목 수만큼)
- ✅ `warranties` 생성됨 (주문 항목 수만큼)
- ✅ `invoices` 생성됨 (1개)

---

### 4단계: 백엔드 로그 확인

VPS에서 실행:
```bash
# 실시간 로그 모니터링
pm2 logs prepmood-backend --lines 0

# 또는 최근 로그 확인
pm2 logs prepmood-backend --lines 100 | grep -E "payments.*confirm|PAID_PROCESSOR|paid_events"
```

**확인할 로그**:
- ✅ `[payments][confirm] 결제 확인 요청`
- ✅ `[PAID_EVENT_CREATOR] paid_events INSERT 성공`
- ✅ `[PAID_PROCESSOR] Paid 처리 완료`
- ✅ `[payments][confirm] Paid 처리 완료`

---

### 5단계: 재고 상태 확인

VPS에서 실행:
```bash
mysql -u prepmood_user -p prepmood -e "
SELECT 
    su.stock_unit_id,
    su.product_id,
    su.size,
    su.color,
    su.status,
    su.reserved_by_order_id,
    su.reserved_at
FROM stock_units su
WHERE su.reserved_by_order_id = (
    SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1
)
ORDER BY su.stock_unit_id;
"
```

**예상 결과**:
- ✅ `status = 'reserved'`
- ✅ `reserved_by_order_id`가 최신 주문 ID
- ✅ `reserved_at`이 NULL이 아님

---

## 🐛 문제 발생 시 확인 사항

### 문제 1: `paid_events`가 생성되지 않음

**확인**:
```bash
# 에러 로그 확인
pm2 logs prepmood-backend --lines 200 | grep -i "paid.*event\|PAID_EVENT" | tail -50
```

**가능한 원인**:
- 트랜잭션 락 타임아웃
- UNIQUE 제약 위반
- 외래키 제약 위반

---

### 문제 2: `processPaidOrder()` 실행되지 않음

**확인**:
```bash
# 로그 확인
pm2 logs prepmood-backend --lines 200 | grep -i "PAID_PROCESSOR" | tail -50
```

**가능한 원인**:
- `paid_events` 생성 실패
- 트랜잭션 에러
- 재고 부족

---

### 문제 3: 재고 상태가 변동되지 않음

**확인**:
```sql
-- 재고 상태 확인
SELECT stock_unit_id, product_id, status, reserved_by_order_id
FROM stock_units
WHERE product_id IN (
    SELECT product_id FROM order_items 
    WHERE order_id = (SELECT MAX(order_id) FROM orders)
);
```

**가능한 원인**:
- `processPaidOrder()` 실행되지 않음
- 재고 부족
- 트랜잭션 롤백

---

## 📝 빠른 확인 스크립트

VPS에서 실행:
```bash
cd /var/www/html/backend

# 최신 주문의 전체 상태 확인
mysql -u prepmood_user -p prepmood <<EOF
SELECT '=== 최신 주문 정보 ===' AS info;
SELECT order_id, order_number, status, paid_at, total_price
FROM orders
ORDER BY order_id DESC
LIMIT 1;

SELECT '=== paid_events ===' AS info;
SELECT event_id, order_id, payment_key, event_source, created_at
FROM paid_events
WHERE order_id = (SELECT MAX(order_id) FROM orders);

SELECT '=== order_item_units ===' AS info;
SELECT order_item_unit_id, order_id, stock_unit_id, token_pk, unit_status
FROM order_item_units
WHERE order_id = (SELECT MAX(order_id) FROM orders);

SELECT '=== warranties ===' AS info;
SELECT id, status, owner_user_id, token_pk, created_at
FROM warranties
WHERE source_order_item_unit_id IN (
    SELECT order_item_unit_id FROM order_item_units 
    WHERE order_id = (SELECT MAX(order_id) FROM orders)
);

SELECT '=== invoices ===' AS info;
SELECT invoice_id, invoice_number, order_id, status, total_amount, issued_at
FROM invoices
WHERE order_id = (SELECT MAX(order_id) FROM orders);
EOF
```

---

## ✅ 성공 기준

다음이 모두 확인되면 정상 작동:
1. ✅ `paid_events` 생성됨
2. ✅ `order_item_units` 생성됨
3. ✅ `warranties` 생성됨
4. ✅ `invoices` 생성됨
5. ✅ `orders.paid_at` 업데이트됨
6. ✅ 재고 상태가 `reserved`로 변경됨

---

## 🚀 다음 단계

1. **자동 배포 완료 대기** (약 1-2분)
2. **새로운 테스트 주문 생성**
3. **위의 확인 스크립트 실행**
4. **결과 공유**

결과를 공유해주시면 추가 문제가 있는지 확인하겠습니다.
