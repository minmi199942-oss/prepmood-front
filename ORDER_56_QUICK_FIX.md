# 주문 56 빠른 수정 가이드

## 📊 현재 상태 확인

VPS에서 실행:
```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/check_order_56_current_state.sql
```

**확인할 내용**:
1. `paid_events`에 `event_id = 8` 존재 ✅ (이미 확인됨)
2. `paid_event_processing`에 `event_id = 8` 레코드가 있는지
3. `order_item_units`가 생성되었는지
4. `warranties`가 생성되었는지
5. `invoices`가 생성되었는지
6. `orders.paid_at`이 NULL인지

---

## 🔧 해결 방법

### 시나리오 1: paid_event_processing이 없음

```bash
# paid_event_processing 생성
mysql -u prepmood_user -p prepmood -e "
INSERT INTO paid_event_processing 
(event_id, status, created_at, updated_at) 
VALUES (8, 'pending', NOW(), NOW());
"

# processPaidOrder() 실행
cd /var/www/html/backend
node scripts/fix_order_56_simple.js
```

### 시나리오 2: paid_event_processing이 있고 status = 'pending' 또는 'failed'

```bash
# processPaidOrder() 실행
cd /var/www/html/backend
node scripts/fix_order_56_simple.js
```

### 시나리오 3: paid_event_processing.status = 'success'인데 paid_at이 NULL

```bash
# processPaidOrder() 재실행 (중복 처리 가능)
cd /var/www/html/backend
node scripts/fix_order_56_simple.js
```

---

## 📝 실행 순서

1. **현재 상태 확인**:
   ```bash
   mysql -u prepmood_user -p prepmood < scripts/check_order_56_current_state.sql
   ```

2. **결과에 따라 필요한 작업만 실행**

3. **최종 확인**:
   ```bash
   mysql -u prepmood_user -p prepmood < scripts/check_order_56_current_state.sql
   ```

---

## ✅ 예상 결과

실행 후:
- `order_item_units` 생성됨
- `warranties` 생성됨
- `invoices` 생성됨
- `orders.paid_at` 업데이트됨
- `paid_event_processing.status = 'success'`
