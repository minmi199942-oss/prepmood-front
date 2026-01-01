# 상품 테이블 마이그레이션 전략

## 🎯 목표

기존 `admin_products` 테이블을 새로운 스키마로 안전하게 마이그레이션:
- `gender` 컬럼 제거
- `collection_year` 컬럼 추가 (기본값 2026)
- `type` 컬럼 NULL 허용으로 변경
- 기존 데이터 보존 및 호환성 유지

---

## ⚠️ 현재 상황 분석

### 1. 코드와 DB 스키마 불일치

**문제점:**
- **코드** (`product-routes.js`, `admin-products.js`): `gender` 필드를 사용 중
- **실제 DB** (`QUICK_CHECK_PRODUCTS.sql` 실행 결과): `gender` 컬럼이 존재하지 않음
- **설계 스크립트** (`setup_admin_products_table.sql`): `gender` 컬럼 정의됨

**결론:** 이미 테이블은 `gender` 없이 생성되었을 가능성이 높음. 코드만 업데이트하면 됨.

### 2. 기존 데이터 상태 확인 필요

마이그레이션 전에 반드시 확인할 사항:
1. 현재 테이블에 데이터가 있는지
2. 있다면 데이터 수와 구조
3. `gender` 컬럼이 실제로 있는지

---

## 🔍 마이그레이션 전 확인 작업

### Step 1: 현재 상태 확인

**서버에서 실행할 SQL:**
```sql
-- 1. 테이블 구조 확인
DESCRIBE admin_products;

-- 2. 데이터 개수 확인
SELECT COUNT(*) AS total_products FROM admin_products;

-- 3. 샘플 데이터 확인 (있는 경우)
SELECT * FROM admin_products LIMIT 5;

-- 4. gender 컬럼 존재 여부 확인 (에러 발생 시 없는 것)
SELECT id, name, gender, category, type FROM admin_products LIMIT 1;
```

### Step 2: 시나리오별 대응

#### 시나리오 A: 테이블이 비어있거나 데이터가 적음 (추천)
- **상황:** 상품 데이터가 없거나 매우 적음
- **조치:** 마이그레이션 스크립트 실행 후 코드 업데이트
- **위험도:** 낮음

#### 시나리오 B: 데이터가 있고 gender 컬럼이 없음 (가능성 높음)
- **상황:** 이미 gender 없이 테이블이 생성되어 있음
- **조치:**
  1. `collection_year` 컬럼만 추가
  2. `type` 컬럼 NULL 허용 변경
  3. 코드에서 gender 제거
- **위험도:** 낮음 (gender 제거 작업 불필요)

#### 시나리오 C: 데이터가 있고 gender 컬럼이 있음
- **상황:** gender 컬럼과 데이터가 모두 존재
- **조치:**
  1. **데이터 백업** (필수!)
  2. gender 컬럼 제거 전 데이터 확인
  3. 마이그레이션 실행
- **위험도:** 중간 (백업 필수)

---

## 🛠️ 안전한 마이그레이션 절차

### Phase 1: 백업 및 확인

```sql
-- 1. 현재 데이터 백업 (있는 경우)
CREATE TABLE admin_products_backup AS SELECT * FROM admin_products;

-- 2. 백업 확인
SELECT COUNT(*) FROM admin_products_backup;
```

### Phase 2: 마이그레이션 실행

**파일:** `backend/migrations/009_add_collection_year_and_type_nullable.sql`

```sql
-- 1. collection_year 컬럼 추가 (기본값 2026, 기존 데이터 자동 적용)
ALTER TABLE admin_products
ADD COLUMN collection_year INT NOT NULL DEFAULT 2026 AFTER image;

-- 2. type 컬럼 NULL 허용 변경 (기존 데이터는 그대로 유지)
ALTER TABLE admin_products
MODIFY COLUMN type VARCHAR(100) NULL;

-- 3. gender 컬럼 제거 (있는 경우에만)
-- 주의: 먼저 DESCRIBE로 확인 후 실행
ALTER TABLE admin_products DROP COLUMN gender;

-- 4. 기존 인덱스 제거 (gender 관련)
DROP INDEX IF EXISTS idx_gender ON admin_products;
DROP INDEX IF EXISTS idx_gender_category ON admin_products;
DROP INDEX IF EXISTS idx_gender_category_type ON admin_products;

-- 5. 새로운 인덱스 추가
CREATE INDEX idx_collection_year ON admin_products(collection_year);
CREATE INDEX idx_collection_category ON admin_products(collection_year, category);
CREATE INDEX idx_collection_category_type ON admin_products(collection_year, category, type);

-- 6. 결과 확인
DESCRIBE admin_products;
SELECT COUNT(*) AS total_products FROM admin_products;
```

### Phase 3: 코드 업데이트 (마이그레이션 성공 후)

1. **백엔드** (`backend/product-routes.js`)
   - `gender` 필드 제거
   - `collection_year` 필드 추가
   - 검증 로직 업데이트

2. **프론트엔드** (`admin-qhf25za8/admin-products.js`)
   - `gender` 필드 UI 제거
   - `collection_year` 필드 UI 추가
   - 카테고리/타입 로직 업데이트

3. **프론트엔드 HTML** (`admin-qhf25za8/products.html`)
   - 필터 옵션 업데이트

### Phase 4: 검증

1. **API 테스트**
   - 상품 추가 (POST)
   - 상품 수정 (PUT)
   - 상품 조회 (GET)
   - 필터링 동작 확인

2. **데이터 무결성 확인**
   - 기존 데이터가 정상적으로 조회되는지
   - collection_year가 모두 2026으로 설정되었는지
   - type이 NULL인 non-accessories 데이터 확인

---

## 🔄 롤백 전략

문제 발생 시 되돌리기:

```sql
-- 1. 테이블 복구 (백업이 있는 경우)
DROP TABLE IF EXISTS admin_products;
CREATE TABLE admin_products AS SELECT * FROM admin_products_backup;

-- 2. 인덱스 재생성
CREATE INDEX idx_gender ON admin_products(gender);
CREATE INDEX idx_category ON admin_products(category);
CREATE INDEX idx_gender_category ON admin_products(gender, category);
CREATE INDEX idx_gender_category_type ON admin_products(gender, category, type);
```

---

## ✅ 체크리스트

마이그레이션 전:
- [ ] 현재 테이블 구조 확인 (DESCRIBE)
- [ ] 데이터 개수 확인
- [ ] gender 컬럼 존재 여부 확인
- [ ] 데이터 백업 (있는 경우)

마이그레이션 실행:
- [ ] collection_year 컬럼 추가
- [ ] type 컬럼 NULL 허용 변경
- [ ] gender 컬럼 제거 (있는 경우)
- [ ] 인덱스 업데이트

코드 업데이트:
- [ ] 백엔드 API 수정
- [ ] 프론트엔드 JS 수정
- [ ] 프론트엔드 HTML 수정

검증:
- [ ] API 테스트
- [ ] 데이터 무결성 확인
- [ ] 관리자 페이지 동작 확인
- [ ] 공개 상품 페이지 동작 확인 (있는 경우)

---

## 🚨 주의사항

1. **프로덕션 환경에서는 반드시 백업 후 실행**
2. **마이그레이션은 비즈니스 시간 외에 실행 권장**
3. **단계별로 실행하고 각 단계마다 확인**
4. **gender 컬럼 제거 시 기존 데이터가 있다면 데이터 손실 발생 가능**
   - 현재 상황으로는 gender 컬럼이 없는 것으로 보이므로 이 단계는 건너뛸 수 있음

---

## 📝 예상 시나리오

### 가장 가능성 높은 시나리오 (시나리오 B)

현재 상황으로 볼 때:
- `gender` 컬럼이 실제 DB에 없음 (이전 에러 메시지로 확인)
- 코드만 업데이트하면 되는 상황
- **마이그레이션 작업:**
  1. `collection_year` 추가 (DEFAULT 2026)
  2. `type` NULL 허용 변경
  3. 인덱스 업데이트
  4. 코드에서 gender 제거

**예상 소요 시간:** 10-15분
**위험도:** 낮음 (새 컬럼 추가만 하면 됨)

