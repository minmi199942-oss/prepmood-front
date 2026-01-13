# 주문 56 진단 가이드

## 🔍 문제 상황
- 주문 상태: `processing`
- `paid_at`: NULL
- warranty: 없음
- invoice: 없음

## 📋 진단 단계

### Step 1: 결제 정보 확인

VPS에서 실행:
```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/check_order_56_status.sql
```

**확인 사항**:
1. `payments` 테이블에 결제 기록이 있는지
2. `payment_status`가 `captured`인지
3. `paid_events`에 이벤트가 있는지
4. `order_item_units`가 생성되었는지

---

### Step 2: 서버 로그 확인

```bash
pm2 logs prepmood-backend --lines 200 | grep -E "order_id.*56|order_number.*ORD-20260113-108182|PAID_PROCESSOR|payments.*confirm"
```

**확인할 로그**:
- `[payments][confirm]` - 결제 확인 요청
- `[PAID_PROCESSOR]` - Paid 처리 로그
- `[payments][confirm] Paid 처리 실패` - 에러 로그

---

## 🔧 가능한 원인 및 해결

### 원인 1: paymentStatus가 'captured'가 아님

**확인**:
```sql
SELECT status FROM payments WHERE order_number = 'ORD-20260113-108182-3DGPE3';
```

**해결**:
- `authorized` 상태면 → 가상계좌 입금 대기 중
- `failed` 상태면 → 결제 실패

### 원인 2: processPaidOrder() 실행 중 에러

**확인**: 서버 로그에서 에러 메시지 확인

**해결**: 에러 메시지에 따라 수정

### 원인 3: /payments/confirm이 호출되지 않음

**확인**: 
- 프론트엔드에서 `/api/payments/confirm` 호출 여부
- 브라우저 Network 탭에서 확인

**해결**: 프론트엔드 결제 완료 후 처리 로직 확인

---

## 🚀 빠른 확인 명령어

```bash
# 1. 결제 정보 확인
mysql -u prepmood_user -p prepmood -e "
SELECT 
    p.status as payment_status,
    o.status as order_status,
    o.paid_at
FROM orders o
LEFT JOIN payments p ON o.order_number = p.order_number
WHERE o.order_id = 56;
"

# 2. paid_events 확인
mysql -u prepmood_user -p prepmood -e "
SELECT 
    event_id,
    processing_status,
    error_message
FROM paid_events
WHERE order_id = 56;
"
```

---

## 💡 다음 단계

1. **Step 1 실행** → 결제 정보 확인
2. **Step 2 실행** → 서버 로그 확인
3. **결과에 따라 해결** → 원인 파악 후 수정
