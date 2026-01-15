# 주문 56 수동 처리 가이드

## 🔍 문제 확인

**로그 분석 결과**:
- `[PAID_EVENT_CREATOR] paid_events 생성 실패` 에러 발생
- 결제는 `captured` 상태 (완료)
- `paid_events` 테이블 비어있음

## 📋 원인 파악 단계

### Step 1: 더 자세한 에러 메시지 확인

VPS에서 실행:
```bash
# 전체 에러 메시지 확인
pm2 logs prepmood-backend --lines 1000 | grep -A 10 "PAID_EVENT_CREATOR.*paid_events 생성 실패"

# 또는 최근 에러만
pm2 logs prepmood-backend --lines 200 | grep -B 5 -A 10 "orderId: 56"
```

**확인할 내용**:
- `error_code`: MySQL 에러 코드
- `error.message`: 에러 메시지
- `error.sqlState`: SQL 상태 코드

---

### Step 2: 직접 INSERT 테스트

VPS에서 실행:
```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/test_paid_events_insert.sql
```

**확인할 내용**:
- INSERT가 성공하는지
- 어떤 에러 메시지가 나오는지

---

## 🔧 해결 방법

### 방법 1: 수동으로 paid_events 생성 후 processPaidOrder() 실행

#### Step 1: paid_events 수동 생성

VPS에서 실행:
```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/fix_order_56_manual.sql
```

**확인**:
- `paid_events`에 레코드가 생성되었는지
- `paid_event_processing`에 레코드가 생성되었는지

#### Step 2: processPaidOrder() 실행

VPS에서 실행:
```bash
cd /var/www/html/backend
node scripts/fix_order_56_manual.js
```

**예상 결과**:
- 재고 배정 완료
- `order_item_units` 생성
- `warranties` 생성
- `invoices` 생성
- `orders.paid_at` 업데이트

---

### 방법 2: 에러 원인 수정 후 재시도

에러 메시지를 확인한 후:
1. 원인 파악 (FK 제약, UNIQUE 제약 등)
2. 코드 수정
3. 재시도

---

## ⚠️ 주의사항

1. **중복 처리 방지**: 이미 처리된 경우 중복 처리될 수 있음
2. **트랜잭션**: `processPaidOrder()`는 트랜잭션 내에서 실행됨
3. **멱등성**: `paid_events` UNIQUE 제약으로 중복 방지

---

## 📝 다음 단계

1. **더 자세한 에러 메시지 확인** (Step 1)
2. **직접 INSERT 테스트** (Step 2)
3. **원인 파악 후 해결**

결과를 알려주시면 다음 단계를 진행하겠습니다.
