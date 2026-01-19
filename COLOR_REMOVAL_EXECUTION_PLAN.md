# ID/NAME 색상 제거 실행 계획

**작성일**: 2026-01-16  
**목적**: `admin_products.id`와 `admin_products.name`에서 색상 정보 제거

---

## 📋 작업 개요

### 변경 사항

1. **ID 변경**:
   - `PM-26-SH-Teneu-Solid-LB` → `PM-26-SH-Teneu-Solid`
   - `PM-26-Outer-LeStripe-Suit-NV` → `PM-26-Outer-LeStripe-Suit`

2. **NAME 변경**:
   - `"... - Black"` → `"..."`
   - `"... - Light Blue"` → `"..."`

---

## ⚠️ 사전 준비

### 1. 백업 필수
```bash
# 전체 DB 백업
mysqldump -u prepmood_user -p prepmood > backup_before_color_removal_$(date +%Y%m%d_%H%M%S).sql
```

### 2. 서버 중단
- PM2 서비스 중단
- 또는 애플리케이션 서버 중단

### 3. 현재 데이터 확인
```sql
-- 색상 코드가 있는 ID 확인
SELECT id, name FROM admin_products 
WHERE id LIKE '%-LB' OR id LIKE '%-GY' OR id LIKE '%-BK' 
   OR id LIKE '%-NV' OR id LIKE '%-WH' OR id LIKE '%-WT'
ORDER BY id;

-- NAME에 색상이 있는지 확인
SELECT id, name FROM admin_products 
WHERE name LIKE '% - Black' OR name LIKE '% - Navy' 
   OR name LIKE '% - Light Blue' OR name LIKE '% - Grey'
   OR name LIKE '% - Light Grey' OR name LIKE '% - White'
ORDER BY id;
```

---

## 🚀 실행 단계

### Step 1: 마이그레이션 스크립트 실행

```bash
# 서버에 접속
mysql -u prepmood_user -p prepmood < backend/migrations/073_remove_color_from_id_and_name.sql
```

또는 MySQL 클라이언트에서:
```sql
SOURCE backend/migrations/073_remove_color_from_id_and_name.sql;
```

### Step 2: 결과 확인

스크립트가 자동으로 다음을 확인합니다:
- ✅ ID에 색상 코드가 남아있는지
- ✅ NAME에 색상이 남아있는지
- ✅ 고아 레코드 확인 (참조 무결성)

### Step 3: 수동 검증 (선택)

```sql
-- 최종 결과 확인
SELECT id, name, short_name FROM admin_products ORDER BY id;

-- 참조 테이블 확인
SELECT DISTINCT product_id FROM stock_units ORDER BY product_id;
SELECT DISTINCT product_id FROM token_master WHERE product_id IS NOT NULL ORDER BY product_id;
SELECT DISTINCT product_id FROM order_items ORDER BY product_id;
```

---

## 🔍 스크립트 동작 방식

### 1. FK 제약 일시 제거
- `stock_units`
- `token_master`
- `order_stock_issues`
- `product_options`
- `cart_items` (있는 경우)

### 2. ID 매핑 테이블 생성
- 임시 테이블에 `old_id → new_id` 매핑 저장
- 중복 확인 (중복 시 중단)

### 3. 참조 테이블 업데이트
- `stock_units.product_id`
- `token_master.product_id`
- `order_stock_issues.product_id`
- `product_options.product_id`
- `cart_items.product_id`
- `order_items.product_id` (FK 없지만 참조)

### 4. admin_products.id 업데이트
- 매핑 테이블 기반으로 ID 업데이트

### 5. admin_products.name 업데이트
- `- Black`, `- Navy`, `- Light Blue` 등 제거

### 6. FK 제약 재설정
- 모든 FK 제약 재설정

### 7. 정합성 검증
- 색상 코드 잔존 확인
- 고아 레코드 확인

---

## ⚠️ 주의사항

### 1. 중복 ID 발생 가능성

**문제**: 서로 다른 색상의 상품이 같은 base ID로 합쳐질 수 있음

**예시**:
```
PM-26-SH-Teneu-Solid-LB  (Light Blue)
PM-26-SH-Teneu-Solid-BK  (Black)
→ 둘 다 PM-26-SH-Teneu-Solid로 변경 시 충돌
```

**해결**: 스크립트가 중복을 감지하고 중단합니다. 수동으로 처리 필요.

**확인 방법**:
```sql
-- 스크립트 실행 전 미리 확인
SELECT 
    SUBSTRING_INDEX(id, '-', -1) as color_code,
    SUBSTRING(id, 1, LENGTH(id) - 3) as base_id,
    COUNT(*) as count,
    GROUP_CONCAT(id ORDER BY id) as ids
FROM admin_products
WHERE id LIKE '%-LB' OR id LIKE '%-GY' OR id LIKE '%-BK' 
   OR id LIKE '%-NV' OR id LIKE '%-WH' OR id LIKE '%-WT'
GROUP BY base_id
HAVING count > 1;
```

### 2. product_options 테이블 확인

**전제 조건**: `product_options` 테이블에 모든 색상 옵션이 등록되어 있어야 함

**확인**:
```sql
SELECT product_id, color, COUNT(*) 
FROM product_options 
GROUP BY product_id, color;
```

### 3. 기존 주문/보증서 데이터

**영향 없음**: 
- `order_items.product_name`은 스냅샷이므로 변경 안 됨 (정상)
- `warranties.product_name`은 스냅샷이므로 변경 안 됨 (정상)

---

## 🔄 롤백 계획

### 문제 발생 시

1. **백업에서 복원**:
```bash
mysql -u prepmood_user -p prepmood < backup_before_color_removal_YYYYMMDD_HHMMSS.sql
```

2. **수동 롤백** (백업이 없는 경우):
   - 매핑 테이블이 남아있다면 역변환 가능
   - 하지만 스크립트가 임시 테이블을 삭제하므로 백업 필수

---

## ✅ 완료 조건

1. ✅ `admin_products.id`에 색상 코드 없음
2. ✅ `admin_products.name`에 색상 정보 없음
3. ✅ 모든 참조 테이블 정합성 유지
4. ✅ FK 제약 정상 작동
5. ✅ 고아 레코드 없음

---

## 📊 예상 소요 시간

- **백업**: 1-2분
- **마이그레이션 실행**: 1-3분 (데이터 양에 따라)
- **검증**: 1분
- **총 소요 시간**: 약 5-10분

---

## 🎯 실행 후 확인 사항

### 1. 애플리케이션 재시작
```bash
pm2 restart prepmood-backend
```

### 2. 기능 테스트
- 상품 목록 조회
- 상품 상세 조회
- 옵션 선택 (색상/사이즈)
- 주문 생성
- 재고 관리

### 3. 로그 확인
```bash
pm2 logs prepmood-backend
```

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
