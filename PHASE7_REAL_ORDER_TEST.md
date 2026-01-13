# Phase 7 실제 주문 테스트 가이드

## 🎯 테스트 목표

실제 주문을 통해 Phase 7의 모든 시나리오를 테스트합니다.

---

## 📋 테스트 흐름

### Step 1: 실제 주문하기

1. **브라우저에서 상품 선택**
   ```
   https://prepmood.kr/buy.html?product_id=PM-26-SH-Teneu-Solid-LB
   ```
   - 재고가 있는 상품 선택

2. **주문 진행**
   - 사이즈/색상 선택
   - 장바구니에 추가
   - 주문하기
   - 결제 진행

3. **결제 완료**
   - 결제 완료 후 `processPaidOrder()` 자동 실행
   - warranty 자동 생성됨
   - invoice 자동 생성됨

---

### Step 2: 데이터 확인 (VPS)

```bash
# MySQL 접속
mysql -u prepmood_user -p prepmood
```

```sql
-- 1. 최근 주문 확인
SELECT 
    order_id,
    order_number,
    status,
    paid_at,
    user_id
FROM orders
ORDER BY order_id DESC
LIMIT 1;

-- 2. 생성된 warranty 확인
SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    w.owner_user_id,
    w.source_order_item_unit_id,
    w.created_at,
    tm.token,
    tm.product_name
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.source_order_item_unit_id IN (
    SELECT order_item_unit_id 
    FROM order_item_units 
    WHERE order_item_id IN (
        SELECT order_item_id 
        FROM order_items 
        WHERE order_id = 56  -- 위에서 확인한 order_id
    )
);

-- 3. 생성된 invoice 확인
SELECT 
    invoice_id,
    invoice_number,
    order_id,
    status,
    total_amount
FROM invoices
WHERE order_id = 56;  -- 위에서 확인한 order_id
```

---

### Step 3: 시나리오 1 테스트 (warranty 있음)

1. **warranty가 있는 토큰 확인**
   - Step 2에서 확인한 `token` 사용

2. **브라우저에서 QR 스캔 URL 접근**
   ```
   https://prepmood.kr/a/{TOKEN}
   ```

3. **예상 결과**:
   - ✅ 200 OK
   - ✅ warranty 정보 표시
   - ✅ warranty 생성 안 됨 (기존 warranty 조회만)

---

### Step 4: 시나리오 3 테스트 (revoked 상태)

1. **테스트용 revoked warranty 생성**

```sql
-- warranty를 revoked로 변경
UPDATE warranties 
SET status = 'revoked', revoked_at = NOW()
WHERE id = ?  -- Step 2에서 확인한 warranty_id
  AND status IN ('issued', 'issued_unassigned');

-- 변경 확인
SELECT 
    w.id,
    w.status,
    w.revoked_at,
    tm.token
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.id = ?;
```

2. **브라우저에서 QR 스캔 URL 접근**
   ```
   https://prepmood.kr/a/{TOKEN}
   ```

3. **예상 결과**:
   - ✅ 403 Forbidden
   - ✅ "이 보증서는 환불 처리되어 더 이상 유효하지 않습니다." 메시지

---

### Step 5: 테스트 후 원복 (선택사항)

테스트용으로 revoked로 변경한 warranty를 원래 상태로 되돌리려면:

```sql
-- 원래 상태로 복구
UPDATE warranties 
SET status = 'issued', revoked_at = NULL
WHERE id = ? AND status = 'revoked';
```

---

## ✅ 테스트 체크리스트

### 주문 및 데이터 생성
- [ ] 실제 주문 완료
- [ ] warranty 생성 확인
- [ ] invoice 생성 확인
- [ ] order_item_units 생성 확인

### 시나리오 1 (warranty 있음)
- [ ] warranty 있는 토큰으로 접근
- [ ] 200 OK 응답
- [ ] warranty 정보 표시
- [ ] warranty 생성 안 됨

### 시나리오 3 (revoked 상태)
- [ ] warranty를 revoked로 변경
- [ ] revoked 토큰으로 접근
- [ ] 403 Forbidden 응답
- [ ] "보증서 무효" 메시지 표시

---

## 📊 확인 사항

### 서버 로그 확인

```bash
# VPS에서 실행
pm2 logs prepmood-backend --lines 100 | grep -E "PAID_PROCESSOR|AUTH|warranty"
```

**확인할 로그**:
- `[PAID_PROCESSOR] warranties 생성 완료` - 주문 시 warranty 생성
- `[PAID_PROCESSOR] invoices 생성 완료` - 주문 시 invoice 생성
- `[AUTH] 정품 인증 요청` - QR 스캔 시 (시나리오 1)
- `[AUTH] revoked 상태 보증서 접근 시도` - revoked 접근 시 (시나리오 3)

---

## 🎉 장점

1. ✅ **현실적인 테스트**: 실제 주문 흐름으로 테스트
2. ✅ **전체 흐름 확인**: 주문 → 결제 → warranty 생성 → QR 스캔
3. ✅ **인보이스 확인**: invoice도 함께 생성되는지 확인 가능
4. ✅ **시간 효율적**: 한 번의 주문으로 모든 시나리오 테스트 가능

---

## 💡 팁

- **테스트 주문**: 실제 결제가 아닌 테스트 모드로 주문 가능하면 더 좋음
- **데이터 백업**: 테스트 전 데이터 백업 권장
- **원복**: 테스트 후 revoked warranty를 원래 상태로 되돌리기

---

**이 방법이 훨씬 현실적이고 효율적입니다!** 😊
