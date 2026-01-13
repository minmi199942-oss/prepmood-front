# Phase 7 테스트 데이터 생성 가이드

## 🎯 상황
- warranty가 있는 토큰 없음
- revoked 상태 warranty 없음

## 📋 해결 방법

### 방법 1: 기존 warranty 확인 후 사용

```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/check_existing_warranties.sql
```

**결과 확인**:
- warranty가 있으면 → 그 warranty 사용
- 없으면 → 방법 2로 진행

---

### 방법 2: 테스트용 revoked warranty 생성

기존 warranty가 있다면 하나를 revoked로 변경:

```sql
-- MySQL 접속
mysql -u prepmood_user -p prepmood

-- 1. 변경할 warranty 확인
SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    tm.token
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.status IN ('issued', 'issued_unassigned')
LIMIT 1;

-- 2. revoked로 변경 (위에서 확인한 warranty_id 사용)
-- 예시: warranty_id가 10인 경우
UPDATE warranties 
SET status = 'revoked', revoked_at = NOW()
WHERE id = 10 AND status IN ('issued', 'issued_unassigned');

-- 3. 변경 확인
SELECT 
    w.id,
    w.status,
    w.revoked_at,
    tm.token
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.id = 10;
```

---

### 방법 3: 실제 주문이 있다면 그 주문의 warranty 사용

실제 주문이 있다면:

```sql
-- 주문의 warranty 확인
SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    tm.token,
    o.order_id,
    o.order_number
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
JOIN orders o ON oi.order_id = o.order_id
WHERE w.status IN ('issued', 'issued_unassigned')
ORDER BY w.id DESC
LIMIT 5;
```

---

## 🧪 테스트 진행

### Step 1: 기존 warranty 확인

```bash
mysql -u prepmood_user -p prepmood < scripts/check_existing_warranties.sql
```

### Step 2: 결과에 따라 진행

**케이스 A: warranty가 있는 경우**
- 시나리오 1 테스트 진행
- 하나를 revoked로 변경하여 시나리오 3 테스트 진행

**케이스 B: warranty가 없는 경우**
- 실제 주문이 있다면 그 주문의 warranty 확인
- 없으면 Phase 5로 진행 (보증서 활성화 API 구현)

---

## ✅ 다음 단계

1. **기존 warranty 확인** → `check_existing_warranties.sql` 실행
2. **결과 확인** → warranty 있으면 테스트, 없으면 Phase 5 진행
