# VPS에서 token_master 초기화 가이드

## 현재 상황
- ✅ `products.xlsx` 파일이 최신 버전으로 업데이트됨 (42행)
- ❌ `init-token-master-from-xlsx.js` 실행 시 FK 제약조건 오류 발생
- 원인: `stock_units` 테이블이 `token_master`를 참조하고 있음

## 해결 방법

### Option 1: stock_units가 비어있는 경우 (권장)
FK를 일시적으로 제거하고 초기화 후 복원

### Option 2: stock_units에 데이터가 있는 경우
`update-token-master-from-xlsx.js` 사용 (기존 데이터 업데이트)

---

## Step 1: stock_units 상태 확인

```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood -e "
SELECT 
    COUNT(*) as total_stock_units,
    COUNT(CASE WHEN status = 'in_stock' THEN 1 END) as in_stock_count,
    COUNT(CASE WHEN status = 'reserved' THEN 1 END) as reserved_count,
    COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_count
FROM stock_units;
"
```

**결과 해석:**
- `total_stock_units = 0` → **Option 1** 사용 (FK 제거 후 초기화)
- `total_stock_units > 0` → **Option 2** 사용 (업데이트만)

---

## Option 1: 완전 초기화 (stock_units가 비어있는 경우)

### Step 1-1: FK 제약 제거

```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < migrations/044_init_token_master_with_fk_handling.sql
```

### Step 1-2: token_master 초기화

```bash
# VPS에서 실행
cd /var/www/html/backend
node init-token-master-from-xlsx.js
```

예상 결과:
- ✅ 기존 token_master 데이터 삭제
- ✅ 42개 토큰 재생성
- ✅ serial_number, rot_code, warranty_bottom_code 포함

### Step 1-3: FK 제약 복원

```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < migrations/045_restore_stock_units_fk.sql
```

---

## Option 2: 기존 데이터 업데이트 (stock_units에 데이터가 있는 경우)

```bash
# VPS에서 실행
cd /var/www/html/backend
node update-token-master-from-xlsx.js
```

예상 결과:
- ✅ 기존 token_master 데이터 유지
- ✅ serial_number, rot_code, warranty_bottom_code만 업데이트
- ✅ FK 제약조건 유지 (안전)

---

## 검증

초기화/업데이트 후 확인:

```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood -e "
SELECT 
    COUNT(*) as total_tokens,
    COUNT(serial_number) as with_serial_number,
    COUNT(rot_code) as with_rot_code,
    COUNT(warranty_bottom_code) as with_warranty_bottom_code
FROM token_master;
"
```

예상 결과:
- `total_tokens = 42`
- `with_serial_number > 0`
- `with_rot_code > 0`
- `with_warranty_bottom_code > 0`

---

## 문제 발생 시

### 문제 1: FK 제거 실패

```bash
# FK 이름 확인
mysql -u prepmood_user -p prepmood -e "
SELECT CONSTRAINT_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND REFERENCED_TABLE_NAME = 'token_master';
"
```

### 문제 2: 초기화 실패

```bash
# token_master 현재 상태 확인
mysql -u prepmood_user -p prepmood -e "
SELECT COUNT(*) as count FROM token_master;
SELECT * FROM token_master LIMIT 5;
"
```

### 문제 3: FK 복원 실패

```bash
# 참조 무결성 확인
mysql -u prepmood_user -p prepmood -e "
SELECT 
    COUNT(*) as total_stock_units,
    COUNT(CASE WHEN su.token_pk IS NOT NULL AND tm.token_pk IS NULL THEN 1 END) as orphaned_units
FROM stock_units su
LEFT JOIN token_master tm ON su.token_pk = tm.token_pk;
"
```

`orphaned_units > 0`이면 FK를 복원할 수 없습니다. `stock_units` 데이터를 먼저 정리해야 합니다.
