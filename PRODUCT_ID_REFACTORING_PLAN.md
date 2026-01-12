# Product ID 구조 개선 마이그레이션 계획

## 📋 GPT 제안 검토 결과

### ✅ **GPT 제안은 타당하며, 단계적 접근이 필요**

**현재 문제점**:
1. **URL 라우팅 문제**: `PM-25-SH-Teneu-Solid-LB-S/M/L` 형식의 product_id에 슬래시(`/`) 포함
   - ✅ **해결됨**: 옵션 API를 query 방식으로 변경 (완료)
2. **옵션 추출 의존성**: `extractSizesFromProductId()`, `extractColorFromProductId()` 함수로 product_id 파싱
   - ⚠️ **문제**: product_id 구조 변경 시 파싱 로직 실패 가능
3. **유연성 부족**: 사이즈/색상이 product_id에 하드코딩되어 있어 옵션 추가/변경 시 product_id 변경 필요
4. **SSOT 원칙 위배**: 사이즈/색상 정보가 `stock_units`와 `admin_products.id`에 중복 저장

**GPT 제안**:
- **즉시 해결**: 옵션 API를 query 방식으로 변경 ✅ (완료)
- **중장기 정상화**: `admin_products.id`에서 사이즈 제거, 색상 코드도 제거 권장

---

## 🎯 목표 구조

### 현재 구조
```
admin_products.id: PM-25-SH-Teneu-Solid-LB-S/M/L
├─ 사이즈 포함: S/M/L
├─ 색상 코드 포함: LB (Light Blue)
└─ 문제: URL 라우팅, 파싱 의존성, 유연성 부족
```

### 목표 구조
```
admin_products.id: PM-25-SH-Teneu-Solid-LB
├─ 사이즈 제거: stock_units.size에서 관리 (이미 구현됨)
├─ 색상 코드 유지 (일단): 색상은 product_options 테이블로 분리 예정
└─ 최종 목표: PM-25-SH-Teneu-Solid (색상도 제거)
```

**단계적 접근**:
1. **Phase 1**: 사이즈만 제거 (슬래시 문제 해결)
2. **Phase 2**: 색상 코드도 제거 (product_options 테이블 활용)

---

## 🔍 현재 product_id 참조 현황

### 1. 데이터베이스 테이블 (FK 또는 참조)

| 테이블 | 컬럼 | 관계 | 영향도 |
|--------|------|------|--------|
| `stock_units` | `product_id` | FK → `admin_products.id` | 🔴 높음 (재고 데이터) |
| `order_items` | `product_id` | 참조 (FK 없음) | 🔴 높음 (주문 데이터) |
| `token_master` | `product_id` | FK → `admin_products.id` | 🟡 중간 (토큰 데이터) |

### 2. 코드에서 product_id 사용

| 파일 | 사용 방식 | 영향도 |
|------|----------|--------|
| `backend/product-routes.js` | `extractSizesFromProductId()`, `extractColorFromProductId()` | 🔴 높음 (파싱 로직) |
| `backend/order-routes.js` | 주문 생성 시 product_id 검증 | 🟡 중간 |
| `backend/stock-routes.js` | 재고 조회/생성 시 product_id 사용 | 🔴 높음 |
| `frontend/buy-script.js` | 상품 옵션 로드 (query 방식으로 변경됨) | 🟢 낮음 |

---

## 📊 마이그레이션 전략

### ⚠️ **핵심 리스크: PK 직접 UPDATE는 위험**

**문제점**:
- `stock_units.product_id`가 `admin_products.id`를 FK로 참조 (`ON DELETE RESTRICT`)
- PK를 직접 UPDATE하면:
  - FK 제약 때문에 막히거나 (`ON UPDATE RESTRICT` 기본값)
  - 중간 상태에서 고아(orphan) 레코드 발생 가능
  - 운영 중 서비스가 읽으면 순간적으로 데이터 불일치 발생

**결론**: **PK를 직접 바꾸는 방식은 운영 안정성 측면에서 비추천**

### 전략 선택: **옵션 B - 병행 운영 (Canonical ID 방식)**

**이유**:
1. **PK UPDATE 없음**: 기존 `id`는 유지, 새 `canonical_id` 컬럼 추가
2. **운영 중단 최소화**: 기존 코드는 계속 동작, 점진적 전환
3. **롤백 용이**: 매핑 테이블 기반 역변환 가능
4. **위험 분산**: 단계별로 검증 가능

**접근 방식**:
1. **신규 상품부터 새 규칙 적용** (즉시 가능)
2. **기존 상품은 canonical_id 추가** (병행 운영)
3. **코드에서 점진적 전환** (fallback 지원)
4. **충분히 검증 후 최종 전환** (컬럼 swap)

---

## 🗓️ 단계별 마이그레이션 계획

### Phase 1: 신규 상품 규칙 정의 및 적용 (즉시 시작 가능)

**목적**: 신규 상품부터 사이즈/색상 코드 제거된 ID 사용

**⚠️ GPT 최종 지적 (A)**: admin_products.id가 VARCHAR(50)이면 신규 규칙이 커지면 바로 폭발
- **해결**: Phase 1 시작 전에 admin_products.id도 128로 확장 필수

**사전 작업 (운영 영향 0)**:
```sql
-- ⚠️ GPT 최종 지적 (A): admin_products.id를 128로 확장 (Phase 1 시작 전 필수)
-- 신규 상품이 id 컬럼에 들어가는데 50이면 부족할 수 있음
ALTER TABLE admin_products
MODIFY COLUMN id VARCHAR(128)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
```

**작업**:

#### 1-1. 새 product_id 규칙 정의
**규칙**:
```
기존: PM-25-SH-Teneu-Solid-LB-S/M/L
신규: PM-25-SH-Teneu-Solid-LB  (사이즈 제거)

최종 목표: PM-25-SH-Teneu-Solid  (색상도 제거, Phase 2에서)
```

**규칙 문서화**:
- `PRODUCT_ID_STANDARD.md` 생성
- 관리자 페이지에 규칙 안내 추가

#### 1-2. 관리자 페이지 수정
**파일**: `admin-qhf25za8/admin-products.js`

**수정 내용**:
- 상품 추가 시 product_id 입력 필드에 규칙 안내 표시
- 사이즈/색상 코드 자동 제거 로직 (선택사항)
- 유효성 검증: 슬래시(`/`) 포함 시 경고

**예상 작업 시간**: 2-3시간

**의존성**: 없음

**완료 조건**:
- 신규 상품 추가 시 사이즈 제거된 ID 사용
- 규칙 문서화 완료

---

### Phase 2: 기존 상품 마이그레이션 준비 (데이터 분석)

**목적**: 기존 데이터 영향도 분석 및 마이그레이션 스크립트 작성

**작업**:

#### 2-1. 기존 product_id 분석
**스크립트**: `backend/scripts/analyze_product_ids.sql`

**⚠️ GPT 지적 사항 반영**: 매핑 로직을 `SUBSTRING_INDEX(id, '/', 1)`로 변경 (더 안전하고 케이스 커버 넓음)

```sql
-- 1. 현재 product_id 패턴 분석
SELECT 
    id,
    name,
    CASE 
        WHEN id LIKE '%/%' THEN '사이즈 포함'
        WHEN id LIKE '%-LB-%' OR id LIKE '%-GY-%' OR id LIKE '%-BK-%' OR id LIKE '%-NV-%' OR id LIKE '%-WH-%' THEN '색상 코드 포함'
        ELSE '정상'
    END AS pattern_type,
    -- ⚠️ GPT 제안: SUBSTRING_INDEX 사용 (슬래시부터 오른쪽 전체 제거)
    CASE 
        WHEN id LIKE '%/%' THEN SUBSTRING_INDEX(id, '/', 1)
        ELSE id
    END AS suggested_new_id
FROM admin_products
WHERE id LIKE '%/%' OR id LIKE '%-LB-%' OR id LIKE '%-GY-%' OR id LIKE '%-BK-%' OR id LIKE '%-NV-%' OR id LIKE '%-WH-%'
ORDER BY id;

-- 2. 중복 확인 (GPT 제안: new_id + name 조합으로 확인)
SELECT 
    suggested_new_id,
    name,
    COUNT(*) as count,
    GROUP_CONCAT(id ORDER BY id) as old_ids
FROM (
    SELECT 
        id,
        name,
        CASE 
            WHEN id LIKE '%/%' THEN SUBSTRING_INDEX(id, '/', 1)
            ELSE id
        END AS suggested_new_id
    FROM admin_products
    WHERE id LIKE '%/%'
) AS candidates
GROUP BY suggested_new_id, name
HAVING count > 1;

-- ⚠️ 중복 종류 구분:
-- A) 서로 다른 상품이 우연히 같은 new_id로 합쳐짐 (진짜 충돌 - 수동 해결 필요)
-- B) 같은 상품이지만 컬러/라인업 구분이 원래 애매해서 합쳐짐 (정책 결정 필요)
```

#### 2-2. 참조 무결성 확인
**스크립트**: `backend/scripts/check_product_id_references.sql`

**⚠️ GPT 지적 사항 반영**: order_items는 FK가 없어서 조용히 갈라질 수 있음, 정합성 리포트 필수

```sql
-- stock_units 참조 확인 (FK 존재)
SELECT 
    COUNT(*) as stock_units_count,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_count
FROM stock_units;

-- order_items 참조 확인 (FK 없음 - ⚠️ 조용히 갈라질 수 있음)
SELECT 
    COUNT(*) as order_items_count,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_count
FROM order_items;

-- token_master 참조 확인 (FK 존재)
SELECT 
    COUNT(*) as token_master_count,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id IS NOT NULL AND product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_count
FROM token_master
WHERE product_id IS NOT NULL;

-- ⚠️ order_items 정합성 리포트 (마이그레이션 전/후 비교용)
SELECT 
    'order_items 정합성 리포트' AS report_type,
    COUNT(*) as total_items,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_product_ids,
    GROUP_CONCAT(DISTINCT CASE WHEN product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_list
FROM order_items;
```

#### 2-3. 마이그레이션 스크립트 작성
**파일**: `backend/migrations/062_migrate_product_id_remove_sizes.sql`

**전략**: 
- 기존 product_id를 새 형식으로 변환하는 매핑 테이블 생성
- 단계별로 각 테이블 업데이트

**예상 작업 시간**: 4-6시간

**의존성**: Phase 1 완료 권장

**완료 조건**:
- 기존 데이터 분석 완료
- 마이그레이션 스크립트 작성 완료
- 롤백 계획 수립

---

### Phase 3: 병행 운영 전환 (Canonical ID 방식) - GPT 옵션 B

**목적**: PK UPDATE 없이 canonical_id 컬럼 추가 후 점진적 전환

**⚠️ 중요**: GPT 제안 방식 - PK 직접 UPDATE 위험 회피

**작업 순서**:

#### 3-1. 백업
```sql
-- 전체 데이터베이스 백업
mysqldump -u [user] -p prepmood > backup_before_product_id_migration.sql

-- 관련 테이블만 백업
mysqldump -u [user] -p prepmood admin_products stock_units order_items token_master > backup_product_tables.sql
```

#### 3-2. 매핑 테이블 생성 및 확정
**파일**: `backend/migrations/062_create_product_id_mapping.sql`

**⚠️ GPT 최종 지적 사항 반영**:
- VARCHAR 길이: 50 → 128 (미래 제품명 규칙 대비)
- **스펙 통일**: charset/collation은 현재 PK와 완전 동일하게 (`utf8mb4_unicode_ci`)
- **Idempotent 보강 (B)**: 재실행 가능한 형태로 수정 (운영 중 재배포/롤백/핫픽스 대비)

**현재 admin_products.id 스펙 확인**:
- 타입: `VARCHAR(128)` (Phase 1에서 확장됨)
- Charset: `utf8mb4`
- Collation: `utf8mb4_unicode_ci`

```sql
-- ⚠️ GPT 최종 지적 (B): Idempotent 보강 - 재실행 가능한 형태
-- 매핑 테이블 생성 (롤백용으로 영구 보존)
-- IF NOT EXISTS로 재실행 안전
CREATE TABLE IF NOT EXISTS product_id_mapping (
    old_id VARCHAR(128) PRIMARY KEY,
    new_id VARCHAR(128) NOT NULL,
    conflict_resolution VARCHAR(500) NULL COMMENT '중복 해결 방법 기록',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_new_id (new_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ⚠️ GPT 제안: SUBSTRING_INDEX 사용 (슬래시부터 오른쪽 전체 제거)
-- ⚠️ GPT 최종 지적 (B): ON DUPLICATE KEY UPDATE로 재실행 안전
-- 매핑 데이터 생성 (사이즈 제거) - 재실행 가능
INSERT INTO product_id_mapping (old_id, new_id)
SELECT 
    id as old_id,
    SUBSTRING_INDEX(id, '/', 1) as new_id  -- 슬래시부터 오른쪽 전체 제거
FROM admin_products
WHERE id LIKE '%/%'
ON DUPLICATE KEY UPDATE 
    new_id = VALUES(new_id), 
    updated_at = CURRENT_TIMESTAMP;

-- 중복이 없는 상품은 자동으로 매핑 (new_id = old_id) - 재실행 가능
INSERT INTO product_id_mapping (old_id, new_id)
SELECT 
    id as old_id,
    id as new_id
FROM admin_products
WHERE id NOT IN (SELECT old_id FROM product_id_mapping)
ON DUPLICATE KEY UPDATE 
    new_id = VALUES(new_id), 
    updated_at = CURRENT_TIMESTAMP;
```

#### 3-3. 중복 확인 및 해결 (GPT 제안: new_id + name 조합)
```sql
-- ⚠️ GPT 제안: new_id 단독만으로는 부족, name과 조합으로 확인
SELECT 
    pm.new_id,
    ap.name,
    COUNT(*) as count,
    GROUP_CONCAT(pm.old_id ORDER BY pm.old_id) as old_ids,
    GROUP_CONCAT(ap.name ORDER BY pm.old_id SEPARATOR ' | ') as names
FROM product_id_mapping pm
JOIN admin_products ap ON pm.old_id = ap.id
GROUP BY pm.new_id, ap.name
HAVING count > 1;

-- 중복 종류 구분:
-- A) 서로 다른 상품이 우연히 같은 new_id로 합쳐짐 (진짜 충돌 - 수동 해결 필요)
--    → conflict_resolution에 해결 방법 기록 (예: "PM-25-SH-Teneu-Solid-LB-v2" 사용)
-- B) 같은 상품이지만 컬러/라인업 구분이 원래 애매해서 합쳐짐 (정책 결정 필요)
--    → 정책 결정 후 conflict_resolution에 기록
```

**중복 해결 예시**:
```sql
-- 예: 진짜 충돌인 경우 수동으로 해결
UPDATE product_id_mapping
SET new_id = 'PM-25-SH-Teneu-Solid-LB-v2',
    conflict_resolution = '중복 충돌 해결: 원본과 구분을 위해 -v2 추가'
WHERE old_id = 'PM-25-SH-Teneu-Solid-LB-M/L';
```

#### 3-4. Canonical ID 컬럼 추가 (병행 운영) - GPT 5단계 시나리오

**⚠️ GPT 핵심 지적**: UNIQUE 인덱스는 중복 해결 후에 생성해야 함

**Step 1: Expand (스키마 확장) - admin_products**
```sql
-- ⚠️ GPT 최종 제안: 스펙을 현재 PK와 완전 동일하게
-- admin_products.id 스펙: VARCHAR(128) (Phase 1에서 확장됨), utf8mb4, utf8mb4_unicode_ci
-- canonical_id는 길이 128, charset/collation은 동일
-- ⚠️ GPT 최종 지적 (B): IF NOT EXISTS로 재실행 안전 (실제로는 컬럼 존재 확인 필요)
ALTER TABLE admin_products
ADD COLUMN IF NOT EXISTS canonical_id VARCHAR(128) NULL 
COMMENT '정규화된 상품 ID (사이즈 제거, 슬래시 없음)' 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
AFTER id;

-- ⚠️ UNIQUE는 나중에 (중복 해결 후)
-- CREATE UNIQUE INDEX는 Step 1-4에서 실행
-- (선택) GPT 제안: INDEX admin_products(canonical_id)를 UNIQUE 전에 임시로 만들어도 됨 (조회 성능)
CREATE INDEX IF NOT EXISTS idx_admin_products_canonical_id_temp 
ON admin_products(canonical_id);
```

**Step 1-2: Backfill (데이터 채우기) - admin_products**
```sql
-- ⚠️ GPT 제안: migration_status 기준이 아니라 "매핑 존재" 기준
-- 매핑 테이블로 canonical_id 백필 (상태 조건 없이)
UPDATE admin_products ap
JOIN product_id_mapping pm ON ap.id = pm.old_id
SET ap.canonical_id = pm.new_id;

-- 신규 상품은 자동으로 canonical_id = id (슬래시 없음)
UPDATE admin_products
SET canonical_id = id
WHERE canonical_id IS NULL;
```

**Step 1-3: 충돌 리포트 (UNIQUE 전 필수)**
```sql
-- ⚠️ GPT 제안: UNIQUE 생성 전에 반드시 중복 확인 및 해결
-- canonical_id 중복 확인
SELECT 
    canonical_id, 
    COUNT(*) as cnt, 
    GROUP_CONCAT(id ORDER BY id) as ids,
    GROUP_CONCAT(name ORDER BY id SEPARATOR ' | ') as names
FROM admin_products
WHERE canonical_id IS NOT NULL
GROUP BY canonical_id
HAVING cnt > 1;

-- 중복이 발견되면 수동으로 해결:
-- 예: UPDATE admin_products SET canonical_id = 'PM-25-SH-Teneu-Solid-LB-v2' WHERE id = '...';
```

**Step 1-4: UNIQUE 인덱스 생성 (중복 해결 후)**
```sql
-- ⚠️ GPT 제안: 중복 해결 후에만 UNIQUE 생성
-- 중복이 모두 해결된 후 실행

-- ⚠️ GPT 최종 지적 (E): UNIQUE 인덱스 생성 전 "canonical_id가 NULL인 행" 정책 필요
-- Backfill 완료 후 canonical_id는 전 행 NOT NULL이 맞다 (정규 키가 SSOT 역할)
-- 먼저 NULL 체크
SELECT COUNT(*) as null_count
FROM admin_products
WHERE canonical_id IS NULL;

-- NULL이 0이면 NOT NULL 제약 추가
ALTER TABLE admin_products
MODIFY COLUMN canonical_id VARCHAR(128)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- 임시 인덱스 제거 후 UNIQUE 생성
DROP INDEX IF EXISTS idx_admin_products_canonical_id_temp ON admin_products;
CREATE UNIQUE INDEX uk_admin_products_canonical_id 
ON admin_products(canonical_id);
```

**Step 2: Expand (스키마 확장) - stock_units**
```sql
-- stock_units에 product_id_canonical 컬럼 추가 (NULL 허용)
-- ⚠️ GPT 최종 제안: 스펙을 admin_products.id와 완전 동일하게
-- ⚠️ GPT 최종 지적 (B): 재실행 안전 (컬럼 존재 확인 필요)
ALTER TABLE stock_units
ADD COLUMN IF NOT EXISTS product_id_canonical VARCHAR(128) NULL 
COMMENT '정규화된 상품 ID (canonical_id 참조)' 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
AFTER product_id;

-- ⚠️ GPT 제안: non-unique 인덱스부터 (UNIQUE는 나중에 필요 시)
CREATE INDEX IF NOT EXISTS idx_stock_units_product_id_canonical 
ON stock_units(product_id_canonical);
```

**Step 2-2: Backfill (데이터 채우기) - stock_units**
```sql
-- ⚠️ GPT 제안: migration_status 기준이 아니라 "매핑 존재" 기준
-- 매핑 테이블로 product_id_canonical 백필 (상태 조건 없이)
UPDATE stock_units su
JOIN product_id_mapping pm ON su.product_id = pm.old_id
SET su.product_id_canonical = pm.new_id;

-- 참조 무결성 확인 (중요)
SELECT COUNT(*) as orphan_count
FROM stock_units su
LEFT JOIN admin_products ap ON su.product_id_canonical = ap.canonical_id
WHERE su.product_id_canonical IS NOT NULL
  AND ap.canonical_id IS NULL;
```

**Step 3: Dual-read (조회는 양쪽 지원) - GPT 제안**

**⚠️ GPT 핵심 지적**: 
- "정규화 함수"를 단 하나로 통일
- 모든 조회 로직에서 "id 또는 canonical_id로 검색" 지원
- 특히 옵션 API, 재고 조회, 관리자 상품 조회, 토큰 조회

**파일**: `backend/product-routes.js`, `backend/stock-routes.js`, `backend/order-routes.js`

**정규화 함수 (단일 함수로 통일)**:
```javascript
// ⚠️ GPT 제안: 정규화 함수를 단 하나로 통일
// 모든 라우트가 이 함수를 사용하도록

/**
 * product_id를 canonical_id로 정규화
 * ⚠️ GPT 최종 제안: connection 주입/트랜잭션 컨텍스트 고려
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @param {Object} connection - MySQL connection (트랜잭션 컨텍스트 유지)
 * @returns {string|null} - canonical_id (없으면 null)
 */
async function resolveProductId(productId, connection) {
    if (!productId) return null;
    
    // ⚠️ GPT 최종 제안: connection을 인자로 받아 트랜잭션 컨텍스트 유지
    // 라우트가 트랜잭션을 열면 그 conn을 그대로 전달
    const [products] = await connection.execute(
        `SELECT id, canonical_id
         FROM admin_products 
         WHERE canonical_id = ? OR id = ? 
         LIMIT 1`,
        [productId, productId]
    );
    
    if (products.length === 0) {
        return null;
    }
    
    // ⚠️ GPT 제안: "반드시 canonical_id"로 통일 (없으면 id 반환이 아니라)
    // canonical_id가 있으면 사용, 없으면 id를 canonical로 간주 (신규 상품)
    return products[0].canonical_id || products[0].id;
}

/**
 * ⚠️ GPT 최종 지적 (D): resolveLegacy 함수 필요
 * stock_units dual-write 규칙이 "product_id=입력값 그대로"면 데이터 오염 발생
 * 입력이 canonical로 들어오는 순간 product_id가 canonical로 저장됨
 * 정말로 단일 규칙을 원하면: product_id(legacy)에는 반드시 admin_products.id(legacy)가 들어가게
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @param {Object} connection - MySQL connection
 * @returns {Object|null} - {legacy_id, canonical_id} 또는 null
 */
async function resolveProductIdBoth(productId, connection) {
    if (!productId) return null;
    
    // ⚠️ GPT 최종 지적 (D): 1쿼리로 legacy_id와 canonical_id 둘 다 얻기
    const [products] = await connection.execute(
        `SELECT id AS legacy_id, canonical_id
         FROM admin_products
         WHERE canonical_id = ? OR id = ?
         LIMIT 1`,
        [productId, productId]
    );
    
    if (products.length === 0) {
        return null;
    }
    
    const result = products[0];
    return {
        legacy_id: result.legacy_id,  // admin_products.id (항상 legacy)
        canonical_id: result.canonical_id || result.legacy_id  // canonical_id 또는 id
    };
}

/**
 * ⚠️ GPT 최종 지적 (C): resolveProductIdWithLogging() 성능 개선
 * 2번 쿼리 + 핫패스 로그로 성능 흔들 수 있음
 * 해결: 1쿼리로 통합하고, legacy hit 판단을 결과값으로만 계산
 * 로그는 주기(예: 1000회마다) + rate limit로만
 */
let legacyHitCount = 0;
let totalResolveCount = 0;

async function resolveProductIdWithLogging(productId, connection) {
    totalResolveCount++;
    
    if (!productId) return null;
    
    // ⚠️ GPT 최종 지적 (C): 1쿼리로 통합
    const [products] = await connection.execute(
        `SELECT id, canonical_id
         FROM admin_products
         WHERE canonical_id = ? OR id = ?
         LIMIT 1`,
        [productId, productId]
    );
    
    if (products.length === 0) {
        return null;
    }
    
    const result = products[0];
    const canonicalId = result.canonical_id || result.id;
    
    // ⚠️ GPT 최종 지적 (C): legacy hit 여부는 결과값으로만 계산
    // "입력값이 id로만 매칭되고 canonical_id로는 매칭 안 됐다"를 별도 카운트
    const isLegacyHit = (productId === result.id && result.canonical_id && result.canonical_id !== result.id);
    
    if (isLegacyHit) {
        legacyHitCount++;
        // ⚠️ GPT 최종 지적 (C): 로그는 주기(1000회마다) + rate limit로만
        if (legacyHitCount % 1000 === 0) {
            const rate = ((legacyHitCount / totalResolveCount) * 100).toFixed(2);
            console.log(`[MONITORING] Legacy hit rate: ${rate}% (${legacyHitCount}/${totalResolveCount})`);
        }
    }
    
    return canonicalId;
}

/**
 * product_id로 상품 조회 (dual-read 지원)
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @returns {Object|null} - 상품 객체 또는 null
 */
async function findProductById(productId) {
    if (!productId) return null;
    
    const [products] = await connection.execute(
        `SELECT * FROM admin_products 
         WHERE canonical_id = ? OR id = ? 
         LIMIT 1`,
        [productId, productId]
    );
    
    return products[0] || null;
}
```

**옵션 API 수정 (SQL 괄호 버그 수정 + connection 주입)**:
```javascript
// ⚠️ GPT 지적: AND/OR 우선순위 버그 수정 + connection 주입
router.get('/products/options', async (req, res) => {
    let connection;
    try {
        const { product_id } = req.query;
        
        connection = await mysql.createConnection(dbConfig);
        
        // ⚠️ GPT 최종 제안: connection을 인자로 전달
        const canonicalId = await resolveProductId(product_id, connection);
        if (!canonicalId) {
            return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
        }
        
        // ⚠️ GPT 제안: 괄호 필수 (AND가 OR보다 먼저 묶이는 버그 방지)
        const [sizeColorRows] = await connection.execute(
            `SELECT DISTINCT size, color, COUNT(*) as stock_count
             FROM stock_units
             WHERE (product_id = ? OR product_id_canonical = ?)
               AND status = 'in_stock'
             GROUP BY size, color`,
            [canonicalId, canonicalId]  // legacy와 canonical 둘 다 검색
        );
        
        // ... 응답 생성
    } finally {
        if (connection) await connection.end();
    }
});
```

**재고 조회 수정 (connection 주입)**:
```javascript
// stock-routes.js
async function getStockByProductId(productId, connection) {
    // ⚠️ GPT 최종 제안: connection을 인자로 받아 트랜잭션 컨텍스트 유지
    const canonicalId = await resolveProductId(productId, connection);
    if (!canonicalId) return [];
    
    // ⚠️ 괄호 필수
    const [rows] = await connection.execute(
        `SELECT * FROM stock_units
         WHERE (product_id = ? OR product_id_canonical = ?)
         ORDER BY created_at DESC`,
        [canonicalId, canonicalId]
    );
    
    return rows;
}
```

**토큰 조회 수정 (중요 - GPT 우선순위)**:
```javascript
// ⚠️ GPT 제안: token_master는 "조회 dual-read"를 최우선
// QR 흐름 때문에 토큰 조회에서 product_id가 old든 new든 제품이 찾아져야 함
async function getTokenBySerial(serialNumber) {
    const [tokens] = await connection.execute(
        `SELECT tm.*, ap.canonical_id, ap.id as product_id_legacy
         FROM token_master tm
         LEFT JOIN admin_products ap ON (tm.product_id = ap.canonical_id OR tm.product_id = ap.id)
         WHERE tm.serial_number = ?
         LIMIT 1`,
        [serialNumber]
    );
    
    return tokens[0] || null;
}
```

**Step 4: Dual-read - 관리자 UI Fallback 지원**

**파일**: `admin-qhf25za8/admin-products.js`

**수정 내용**:
- URL 파라미터로 받은 product_id가 없으면 canonical_id로도 조회
- 상품 수정/삭제 시 양쪽 모두 지원

```javascript
// 기존 코드 수정
async function openEditProductModal(productId) {
    // canonical_id 또는 legacy id로 조회 (dual-read)
    const product = products.find(p => 
        p.id === productId || p.canonical_id === productId
    );
    // ...
}

async function deleteProduct(productId) {
    // API 호출 시 정규화된 ID 사용 (또는 API에서 dual-read 지원)
    const response = await fetch(
        `${API_BASE_URL}/admin/products/${encodeURIComponent(productId)}`, 
        { method: 'DELETE' }
    );
    // ...
}
```

**Step 5: Dual-write (쓰기 경로 점진 전환) - GPT 제안**

**⚠️ GPT 핵심 지적**: 
- "쓰기"는 원칙적으로 canonical_id로 저장
- legacy 입력도 받아서 resolve 후 canonical로 저장
- 이렇게 하면 검증 기간 동안 데이터가 자연스럽게 canonical로 수렴

**신규 상품 생성**:
```javascript
// product-routes.js - POST /admin/products
router.post('/admin/products', authenticateToken, requireAdmin, async (req, res) => {
    const { id, name, price, ... } = req.body;
    
    // ⚠️ GPT 제안: 신규 상품은 id는 슬래시 없는 새 규칙, canonical_id=id 강제
    // 슬래시 검증
    if (id.includes('/')) {
        return res.status(400).json({
            success: false,
            message: '상품 ID에 슬래시(/)를 포함할 수 없습니다.'
        });
    }
    
    await connection.execute(
        `INSERT INTO admin_products (id, canonical_id, name, price, ...) 
         VALUES (?, ?, ?, ?, ...)`,
        [id, id, name, price, ...]  // canonical_id = id (신규는 동일)
    );
});
```

**신규 stock_units 생성 (쓰기 규칙 단일화)**:
```javascript
// stock-routes.js
// ⚠️ GPT 최종 지적 (D): Dual-write의 쓰기 규칙을 진짜 단일 규칙으로 고정
// product_id는 "항상 legacy_id(admin_products.id)"로 유지
// product_id_canonical은 "항상 canonical_id"로 유지
// 입력이 canonical이면, 매핑을 통해 legacy id를 역으로 찾아서 저장
async function createStockUnit(productId, tokenPk, connection) {
    // ⚠️ GPT 최종 지적 (D): resolveProductIdBoth로 legacy_id와 canonical_id 둘 다 얻기
    const resolved = await resolveProductIdBoth(productId, connection);
    if (!resolved) {
        throw new Error('상품을 찾을 수 없습니다.');
    }
    
    // ⚠️ GPT 최종 지적 (D): 쓰기 규칙 진짜 고정
    // product_id = legacy_id (쿼리로 확정한 admin_products.id)
    // product_id_canonical = canonical_id (쿼리로 확정한 canonical_id)
    await connection.execute(
        `INSERT INTO stock_units (product_id, product_id_canonical, token_pk, status) 
         VALUES (?, ?, ?, 'in_stock')`,
        [resolved.legacy_id, resolved.canonical_id, tokenPk]  // 무조건 legacy_id/canonical_id 고정
    );
}
```

**주문 생성 (order_items)**:
```javascript
// order-routes.js
// ⚠️ GPT 최종 제안: order_items는 FK가 없으니 "저장 시점에 canonical로 정규화"가 제일 효과적
// 새 데이터부터 canonical만 저장 (원칙 고정)
async function createOrderItem(orderId, productId, quantity, connection) {
    // legacy 입력도 받아서 resolve 후 canonical로 저장
    const canonicalId = await resolveProductId(productId, connection);
    if (!canonicalId) {
        throw new Error('상품을 찾을 수 없습니다.');
    }
    
    // ⚠️ GPT 최종 제안: 새 주문부터는 canonical 저장 (원칙 고정)
    // 이 원칙이 다른 테이블에도 동일하게 적용되도록 문서로 명시
    await connection.execute(
        `INSERT INTO order_items (order_id, product_id, quantity) 
         VALUES (?, ?, ?)`,
        [orderId, canonicalId, quantity]  // canonical로 저장 (원칙)
    );
}
```

**토큰 생성 (token_master)**:
```javascript
// ⚠️ GPT 최종 제안: token_master는 "쓰기 canonical 전환"보다 "읽기 호환"이 먼저
// 하지만 가능하면 canonical로 저장 (order_items와 동일 원칙)
async function createToken(productId, serialNumber, connection) {
    const canonicalId = await resolveProductId(productId, connection);
    if (!canonicalId) {
        throw new Error('상품을 찾을 수 없습니다.');
    }
    
    // ⚠️ GPT 최종 제안: order_items와 동일 원칙 - canonical로 저장
    await connection.execute(
        `INSERT INTO token_master (product_id, serial_number, ...) 
         VALUES (?, ?, ...)`,
        [canonicalId, serialNumber, ...]  // canonical로 저장 (원칙)
    );
}
```

**Step 6: Cutover (최종 전환) - GPT 제안**

**⚠️ GPT 핵심 지적**: 
- 운영 로그/지표로 old-id 사용이 사실상 0에 수렴한 뒤
- "1~2주 검증"은 dual-read/dual-write가 돌아간 상태에서의 검증

**검증 기간 (1-2주) - 모니터링 (GPT 최종 제안: DB+로그 기반)**:

**⚠️ GPT 최종 지적 (문서 표현 개선)**: 
- "old-id 사용률" → "legacy 입력 hit rate(로그)" + "orphan/NULL(DB)"로 명칭 고정
- stock_units는 그 표현이 애매해짐

**A) DB 기반 모니터링 (가능한 범위)**:
```sql
-- ⚠️ GPT 최종 제안: stock_units는 product_id != canonical_id 비교가 성립하지 않음
-- (같은 row에 canonical_id가 없을 수 있음)
-- 대신 product_id_canonical이 NULL이거나 orphan을 체크

-- stock_units orphan/NULL 체크
SELECT 
    'stock_units orphan/NULL 리포트' AS report_type,
    COUNT(*) as total_units,
    COUNT(CASE WHEN product_id_canonical IS NULL THEN 1 END) as canonical_null_count,
    COUNT(CASE WHEN product_id_canonical IS NOT NULL AND product_id_canonical NOT IN (SELECT canonical_id FROM admin_products WHERE canonical_id IS NOT NULL) THEN 1 END) as orphan_count
FROM stock_units;

-- order_items orphan 체크 (canonical_id에 매칭되지 않는 값 = legacy 또는 오염값)
SELECT 
    'order_items orphan 리포트' AS report_type,
    COUNT(*) as total_items,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id NOT IN (SELECT canonical_id FROM admin_products WHERE canonical_id IS NOT NULL) THEN product_id END) as orphan_count,
    GROUP_CONCAT(DISTINCT CASE WHEN product_id NOT IN (SELECT canonical_id FROM admin_products WHERE canonical_id IS NOT NULL) THEN product_id END LIMIT 10) as sample_orphan_ids
FROM order_items;

-- token_master orphan 체크
SELECT 
    'token_master orphan 리포트' AS report_type,
    COUNT(*) as total_tokens,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id IS NOT NULL AND product_id NOT IN (SELECT canonical_id FROM admin_products WHERE canonical_id IS NOT NULL) THEN product_id END) as orphan_count
FROM token_master
WHERE product_id IS NOT NULL;
```

**B) 로그 기반 모니터링 (정확)**:
```javascript
// ⚠️ GPT 최종 제안: resolveProductIdWithLogging()에 "입력이 legacy로 들어왔는지" 카운트 로그
// 입력이 admin_products.id로만 매칭되고 canonical_id로는 매칭 안 됐던 케이스를 legacy-hit로 집계
// 1~2주 검증은 이 지표로 판단하는 게 정확

// resolveProductIdWithLogging() 함수 사용 (위에 정의됨)
// 주기적으로 로그 확인:
console.log(`[MONITORING] Legacy 입력 hit rate: ${(legacyHitCount / totalResolveCount * 100).toFixed(2)}%`);
console.log(`[MONITORING] Legacy hits: ${legacyHitCount} / Total resolves: ${totalResolveCount}`);

// 검증 완료 기준:
// - legacy 입력 hit rate가 0%에 수렴 (예: 1주일 동안 0%)
// - DB 기반 orphan_count가 0
// - canonical_null_count가 0 (stock_units)
```

**최종 전환 (legacy 입력 hit rate 0에 수렴 후) - GPT 최종 제안**:

**⚠️ GPT 최종 지적 (F): Cutover는 "짧은 점검창"을 잡고 한 번에**
- 사전 리허설(스테이징) - **구체적인 합격 기준 필요**
- 운영에서 짧은 점검창
- 바로 정합성 리포트

**사전 리허설 합격 기준 (스테이징에서)**:
1. **DDL 수행 시간 측정**: 
   - `ALTER TABLE stock_units DROP COLUMN ... CHANGE COLUMN ... ADD CONSTRAINT ...` 전체 수행 시간
   - 목표: 5분 이내 (데이터량에 따라 조정)
2. **정합성 리포트 3종 통과**:
   - stock_units orphan_count = 0
   - order_items orphan_count = 0
   - token_master orphan_count = 0
3. **Smoke Test 통과**:
   - 옵션 API 5~10개 케이스 통과
   - 주문 생성 5~10개 케이스 통과
   - 토큰 조회 5~10개 케이스 통과

**Step 1: FK 이름 조회 (하드코딩 제거)**:
```sql
-- ⚠️ GPT 최종 제안: FK 이름을 하드코딩하지 말고 조회로 찾기
-- information_schema로 FK 이름 조회 후 드롭
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND REFERENCED_TABLE_NAME = 'admin_products'
  AND REFERENCED_COLUMN_NAME = 'id';

-- 조회된 FK 이름으로 드롭 (예: stock_units_ibfk_1)
-- ALTER TABLE stock_units DROP FOREIGN KEY [조회된_FK_이름];
```

**Step 2: 컬럼 Swap (짧은 점검창)**:
```sql
-- ⚠️ GPT 최종 제안: 컬럼 드롭/체인지/새 FK는 MySQL 설정/버전에 따라 테이블 락이 길어질 수 있음
-- 짧은 점검창을 잡고 한 번에 실행

-- 1. stock_units.product_id를 product_id_canonical로 교체
ALTER TABLE stock_units
DROP FOREIGN KEY [조회된_FK_이름];  -- Step 1에서 조회한 FK 이름 사용

ALTER TABLE stock_units
DROP COLUMN product_id,
CHANGE COLUMN product_id_canonical product_id VARCHAR(128) NOT NULL
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 새 FK 추가 (canonical_id 참조)
ALTER TABLE stock_units
ADD CONSTRAINT fk_stock_units_product_id_canonical
FOREIGN KEY (product_id) REFERENCES admin_products(canonical_id) ON DELETE RESTRICT;
```

-- 2. order_items 업데이트 (선택적 - 조회에서 resolve로 커버 가능)
-- ⚠️ GPT 제안: 기존 주문은 굳이 급하게 전체 UPDATE 안 해도 됨
-- 필요하면 "리포트 기반으로" 천천히 업데이트
UPDATE order_items oi
JOIN product_id_mapping pm ON oi.product_id = pm.old_id
SET oi.product_id = pm.new_id
WHERE oi.product_id IN (SELECT old_id FROM product_id_mapping);

-- ⚠️ 정합성 리포트 (GPT 제안) - Cutover 직후 즉시 실행
SELECT 
    'order_items 마이그레이션 후 정합성' AS report_type,
    COUNT(*) as total_items,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id NOT IN (SELECT canonical_id FROM admin_products WHERE canonical_id IS NOT NULL) THEN product_id END) as orphan_count
FROM order_items;

-- ⚠️ GPT 최종 지적 (F): Cutover 직후 핵심 플로우 smoke test
-- 옵션 API, 주문 생성, 토큰 조회 등 즉시 테스트

-- 3. token_master 업데이트 (선택적 - 조회에서 resolve로 커버 가능)
UPDATE token_master tm
JOIN product_id_mapping pm ON tm.product_id = pm.old_id
SET tm.product_id = pm.new_id
WHERE tm.product_id IN (SELECT old_id FROM product_id_mapping)
  AND tm.product_id IS NOT NULL;

-- 4. admin_products.id는 "끝까지 유지(옵션 B 유지)"가 더 안전
-- ⚠️ GPT 최종 제안: admin_products.id는 끝까지 유지
-- id는 legacy 식별자(외부 참조/과거 데이터)
-- canonical_id는 정규 기준(현재/미래 기준)
-- 이렇게 2축으로 남겨두면, 과거 주문/토큰/캐시/외부 링크까지 전부 흡수 가능
-- 따라서 id는 변경하지 않고, canonical_id를 기본값으로 사용 (권장)
```

#### 3-7. 파싱 로직 제거 (GPT 제안: 타이밍 조정)

**⚠️ GPT 제안**: 파싱 제거는 "DB 마이그레이션 완료"가 아니라 **"실제 런타임에서 파싱을 호출하지 않는 상태가 일정 기간 유지된 뒤"**

**순서**:
1. **옵션 API가 stock_units 기반으로 색상/사이즈를 내리기** (이미 진행 중)
2. **관리자에서 신규 상품은 슬래시 없는 ID만 생성** (Phase 1)
3. **정규화 함수(resolveProductId) 사용으로 전환** (Step 3에서 완료)
4. **파싱 로직을 deprecated로 표시하고, 로그 모니터링**
5. **전체 상품이 canonical로 커버되고 파싱 호출이 0에 수렴하면 파싱 함수 삭제**

**파일**: `backend/product-routes.js`

**수정 내용**:
```javascript
// ⚠️ DEPRECATED: 정규화 함수 사용 권장
// 파싱 로직은 fallback용으로만 유지
function extractSizesFromProductId(productId) {
    // ⚠️ DEPRECATED: resolveProductId + stock_units 직접 조회 사용 권장
    console.warn('extractSizesFromProductId is deprecated. Use resolveProductId + stock_units directly.');
    // ... 기존 로직 유지 (fallback용, 점진적 제거)
}

function extractColorFromProductId(productId) {
    // ⚠️ DEPRECATED: resolveProductId + stock_units 직접 조회 사용 권장
    console.warn('extractColorFromProductId is deprecated. Use resolveProductId + stock_units directly.');
    // ... 기존 로직 유지 (fallback용, 점진적 제거)
}

// 옵션 API는 이미 Step 3에서 정규화 함수로 전환됨
// 파싱 로직은 더 이상 사용하지 않음
```

**모니터링**:
```javascript
// 파싱 함수 호출 모니터링 (제거 전 확인용)
let parseFunctionCallCount = 0;

function extractSizesFromProductId(productId) {
    parseFunctionCallCount++;
    if (parseFunctionCallCount % 100 === 0) {
        console.warn(`[DEPRECATED] extractSizesFromProductId 호출 횟수: ${parseFunctionCallCount}`);
    }
    // ... 기존 로직
}
```

**예상 작업 시간**: 10-12시간 (백업 + Expand + Backfill + Dual-read + Dual-write + 검증 + Cutover)

**의존성**: Phase 2 완료 필수

**완료 조건**:
- Expand (스키마 확장) 완료
- Backfill (데이터 채우기) 완료
- Dual-read (조회 양쪽 지원) 완료
- Dual-write (쓰기 점진 전환) 완료
- 검증 기간 (1-2주) 완료
- Cutover (최종 전환) 완료
- 파싱 로직 제거 (런타임 미사용 확인 후)

---

### Phase 4: 색상 코드 제거 (선택적, Phase 3 완료 후)

**목적**: product_id에서 색상 코드도 제거, `product_options` 테이블 활용

**작업**:

#### 4-1. product_options 테이블 생성 (이미 Phase 15에 계획됨)
- `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md` Phase 15 참조

#### 4-2. 색상 코드 제거 마이그레이션
- Phase 3와 동일한 방식으로 진행
- 색상 코드 제거 로직 추가

**예상 작업 시간**: 4-6시간

**의존성**: Phase 3 완료 필수, Phase 15 완료 필수

**완료 조건**:
- product_id에서 색상 코드 제거 완료
- product_options 테이블 기반 옵션 관리 완료

---

## ⚠️ 리스크 관리

### 1. 데이터 손실 리스크
- **리스크**: 마이그레이션 중 데이터 손실
- **대응**: 
  - 모든 단계 전 백업 필수
  - 트랜잭션으로 원자성 보장
  - 단계별 검증 후 다음 단계 진행

### 2. 중복 ID 리스크
- **리스크**: 사이즈 제거 후 중복 ID 발생
- **대응**:
  - 마이그레이션 전 중복 확인 필수
  - 중복 발생 시 수동 해결 (예: `PM-25-SH-Teneu-Solid-LB-v2`)

### 3. 참조 무결성 리스크
- **리스크**: FK 제약 위반
- **대응**:
  - 각 단계별 참조 무결성 확인
  - FK 제약 일시 해제 후 마이그레이션 (필요 시)

### 4. 코드 호환성 리스크
- **리스크**: 기존 코드가 파싱 로직에 의존
- **대응**:
  - 모든 product_id 사용처 확인
  - 파싱 로직 제거 전 대체 로직 구현
  - **Fallback 지원**: legacy id도 계속 받는 fallback 일정 기간 유지

### 5. 관리자 UI/캐시 깨짐 리스크 (GPT 지적)
- **리스크**: 관리자 페이지가 admin_products.id를 URL 파라미터나 DOM key로 사용
- **대응**:
  - URL 파라미터로 받은 product_id가 없으면 canonical_id로도 조회
  - 상품 수정/삭제 시 양쪽 모두 지원
  - 브라우저 캐시/링크가 예전 ID여도 동작하도록 fallback

### 6. 토큰/QR 체계 충돌 리스크 (GPT 지적)
- **리스크**: token_master.product_id 조회 경로와 맞물림
- **대응**:
  - token_master.product_id 조회 시 "old/new 동시 허용" 기간 유지
  - 관리자에서 시리얼로 역추적 시 양쪽 모두 지원

### 7. 롤백 계획 (GPT 제안)
- **리스크**: DB 덤프만으로는 부분 복구 어려움
- **대응**:
  - **매핑 테이블 기반 역변환**: `product_id_mapping` 유지
  - 역마이그레이션 스크립트 준비:
    ```sql
    -- 역마이그레이션 예시
    UPDATE stock_units su
    JOIN product_id_mapping pm ON su.product_id = pm.new_id
    SET su.product_id = pm.old_id
    WHERE pm.migration_status = 'completed';
    ```

---

## 📋 실행 체크리스트

### Phase 1: 신규 상품 규칙 적용
- [ ] 새 product_id 규칙 정의 문서화
- [ ] 관리자 페이지에 규칙 안내 추가
- [ ] 상품 추가 시 유효성 검증 추가
- [ ] 신규 상품부터 새 규칙 적용 시작

### Phase 2: 마이그레이션 준비
- [ ] 기존 product_id 패턴 분석
- [ ] 참조 무결성 확인
- [ ] 마이그레이션 스크립트 작성
- [ ] 테스트 환경에서 마이그레이션 테스트
- [ ] 롤백 계획 수립

### Phase 3: 병행 운영 전환 (Canonical ID 방식) - GPT 5단계 시나리오
- [ ] **Expand (스키마 확장)**
  - [ ] 전체 데이터베이스 백업
  - [ ] 매핑 테이블 생성 (VARCHAR(128) 사용)
  - [ ] 매핑 데이터 생성 (SUBSTRING_INDEX 사용)
  - [ ] admin_products.canonical_id 컬럼 추가 (NULL 허용, UNIQUE 없음)
  - [ ] stock_units.product_id_canonical 컬럼 추가 (NULL 허용, non-unique 인덱스)
- [ ] **Backfill (데이터 채우기) - 재실행 가능(idempotent)**
  - [ ] admin_products.canonical_id 백필 (매핑 존재 기준, 상태 조건 없음)
  - [ ] stock_units.product_id_canonical 백필 (매핑 존재 기준)
  - [ ] 중복 확인 및 해결 (new_id + name 조합)
  - [ ] canonical_id NOT NULL 제약 추가 (GPT 지적 E - Backfill 완료 후)
  - [ ] UNIQUE 인덱스 생성 (중복 해결 후, NOT NULL 후)
  - [ ] 참조 무결성 확인 (orphan 리포트 0 확인)
- [ ] **코드 배포 1차 (Dual-read만 먼저)**
  - [ ] 정규화 함수 구현 (resolveProductId, resolveProductIdBoth, resolveProductIdWithLogging)
  - [ ] 옵션 API 수정 (SQL 괄호 버그 수정, connection 주입)
  - [ ] 재고 조회 수정 (dual-read, connection 주입)
  - [ ] 토큰 조회 수정 (dual-read, 최우선, connection 주입)
  - [ ] 관리자 UI fallback 지원 (URL 파라미터 양쪽 지원)
- [ ] **코드 배포 2차 (Dual-write)**
  - [ ] 신규 상품 생성: canonical_id=id 강제
  - [ ] 신규 stock_units: resolveProductIdBoth로 legacy_id/canonical_id 둘 다 고정 저장 (GPT 지적 D)
  - [ ] 주문 생성: canonical로 저장 (legacy 입력도 resolve)
  - [ ] 토큰 생성: canonical로 저장 (가능하면)
- [ ] **검증 기간 (1-2주)**
  - [ ] DB 기반 모니터링: orphan/NULL 리포트 (일 단위)
  - [ ] 로그 기반 모니터링: legacy 입력 hit rate (일 단위)
  - [ ] 검증 완료 기준: legacy hit rate 0% 수렴, orphan_count 0
- [ ] **Cutover (최종 전환) - 짧은 점검창**
  - [ ] 사전 리허설 (스테이징): DDL 시간 측정, 정합성 리포트 3종, smoke test 통과
  - [ ] FK 이름 조회 (information_schema)
  - [ ] stock_units 컬럼 swap (FK 교체)
  - [ ] order_items 업데이트 (선택적, 리포트 기반)
  - [ ] token_master 업데이트 (선택적, 조회에서 resolve로 커버 가능)
  - [ ] 정합성 리포트 즉시 확인 (3종)
  - [ ] 핵심 플로우 smoke test 즉시 실행
  - [ ] 파싱 로직 제거 (런타임에서 미사용 확인 후)

### Phase 4: 색상 코드 제거 (선택적)
- [ ] product_options 테이블 생성
- [ ] 색상 코드 제거 마이그레이션
- [ ] 옵션 API 수정 (product_options 기반)

---

## 🎯 최종 목표 구조

### 완전한 정상화 후
```
admin_products.id: PM-25-SH-Teneu-Solid
├─ 사이즈: product_options 테이블에서 관리
├─ 색상: product_options 테이블에서 관리
└─ 재고: stock_units 테이블에서 관리

장점:
- URL-safe (슬래시 없음)
- 유연성 (옵션 추가/변경 시 product_id 변경 불필요)
- SSOT 준수 (옵션 정보는 product_options/stock_units에만)
- 확장성 (새 사이즈/색상 추가 용이)
```

---

## 📝 GPT 제안 검토 결론

### ✅ **GPT 제안은 매우 타당하며, 옵션 B (병행 운영) 방식 채택**

**GPT의 핵심 지적 사항**:
1. ✅ **PK 직접 UPDATE는 위험**: FK 제약 때문에 막히거나 중간 상태에서 고아 발생
2. ✅ **매핑 로직 개선**: `SUBSTRING_INDEX(id, '/', 1)` 사용 (더 안전)
3. ✅ **중복 확인 강화**: new_id + name 조합으로 확인
4. ✅ **order_items 정합성**: FK 없어서 조용히 갈라질 수 있음, 리포트 필수
5. ✅ **관리자 UI/캐시**: URL 파라미터 fallback 지원 필요
6. ✅ **롤백 계획**: 매핑 테이블 기반 역변환 준비

**채택한 전략**: **옵션 B - 병행 운영 (Canonical ID 방식)**
- PK UPDATE 없이 `canonical_id` 컬럼 추가
- 점진적 전환 (fallback 지원)
- 충분히 검증 후 최종 전환

**즉시 실행 가능**:
- ✅ Phase 1: 신규 상품 규칙 적용 (즉시 시작 가능)

**충분한 계획 후 실행**:
- ⚠️ Phase 2-3: 기존 상품 병행 운영 전환 (백업 + 테스트 필수)
- ⚠️ **PK UPDATE 제거**: canonical_id 방식으로 변경

**선택적 개선**:
- 🟢 Phase 4: 색상 코드 제거 (product_options 테이블 완성 후)

**현실적인 접근**:
1. **지금**: 신규 상품부터 사이즈 제거된 ID 사용
2. **다음**: 기존 상품 canonical_id 추가 및 병행 운영
3. **검증**: 충분한 기간(1-2주) 검증
4. **최종 전환**: 모든 코드가 canonical_id 사용 확인 후 컬럼 swap
5. **나중**: 색상 코드도 제거 (product_options 테이블 활용)

---

---

## 🔄 GPT 제안 반영 요약

### 주요 변경 사항 (1차 반영)

1. **전략 변경**: PK 직접 UPDATE → Canonical ID 병행 운영
2. **매핑 로직 개선**: 길이 기반 자르기 → `SUBSTRING_INDEX(id, '/', 1)`
3. **중복 확인 강화**: new_id만 → new_id + name 조합
4. **order_items 정합성**: 리포트 추가
5. **관리자 UI**: Fallback 지원 추가
6. **롤백 계획**: 매핑 테이블 기반 역변환 추가
7. **파싱 로직 제거 타이밍**: 런타임 미사용 확인 후 제거

### 주요 변경 사항 (2차 반영 - 핵심 버그/함정 수정)

8. **UNIQUE 인덱스 생성 타이밍**: 백필 전 → 중복 해결 후
9. **VARCHAR 길이**: 50 → 128 (미래 제품명 규칙 대비)
10. **SQL AND/OR 우선순위 버그**: 괄호 추가 `(product_id = ? OR product_id_canonical = ?) AND status = ?`
11. **migration_status 기준 백필 제거**: 매핑 존재 기준으로 변경
12. **5단계 시나리오 구조화**: Expand → Backfill → Dual-read → Dual-write → Cutover
13. **정규화 함수 단일화**: `resolveProductId()` 단일 함수로 통일
14. **토큰 조회 우선순위**: token_master는 "조회 dual-read" 최우선
15. **order_items 현실적 접근**: 저장 시점 정규화, 기존 주문은 조회에서 resolve로 커버

### 주요 변경 사항 (3차 반영 - 최종 보강)

16. **스펙 통일**: charset/collation을 현재 PK와 완전 동일하게 (`utf8mb4_unicode_ci`)
17. **resolveProductId() 트랜잭션 친화화**: connection을 인자로 받아 트랜잭션 컨텍스트 유지
18. **Dual-write 쓰기 규칙 단일화**: stock_units는 `product_id=legacy, product_id_canonical=canonical`로 고정
19. **모니터링 현실화**: DB 기반(orphan 체크) + 로그 기반(legacy hit rate) 조합
20. **Cutover 안전장치**: FK 이름 조회, 짧은 점검창, admin_products.id 유지(옵션 B)

### 주요 변경 사항 (4차 반영 - 핵심 함정 수정)

21. **admin_products.id 확장 (A)**: Phase 1 시작 전에 VARCHAR(50) → VARCHAR(128) 확장 필수
22. **Idempotent 보강 (B)**: 모든 DDL/INSERT를 재실행 가능한 형태로 수정 (IF NOT EXISTS, ON DUPLICATE KEY UPDATE)
23. **resolveProductIdWithLogging() 성능 개선 (C)**: 2쿼리 → 1쿼리 통합, 로그는 주기(1000회마다)로만
24. **resolveProductIdBoth() 추가 (D)**: stock_units 쓰기 규칙 진짜 단일화 (legacy_id/canonical_id 둘 다 쿼리로 확정)
25. **canonical_id NOT NULL 제약 (E)**: Backfill 완료 후 NOT NULL 추가 (정규 키 SSOT 역할)
26. **Cutover 리허설 기준 구체화 (F)**: DDL 시간 측정, 정합성 리포트 3종, smoke test 통과 기준
27. **문서 표현 개선**: "old-id 사용률" → "legacy 입력 hit rate" + "orphan/NULL"로 명칭 고정
28. **실행 순서 운영 절차화**: 사전 변경 → Backfill → 코드 배포 1차(Dual-read) → 코드 배포 2차(Dual-write) → 검증 → Cutover

### 리스크 감소 효과

- ✅ **PK UPDATE 위험 제거**: canonical_id 추가 방식으로 변경
- ✅ **운영 중단 최소화**: 점진적 전환, fallback 지원
- ✅ **롤백 용이성 향상**: 매핑 테이블 기반 역변환 가능
- ✅ **데이터 손실 방지**: 단계별 검증, 정합성 리포트
- ✅ **UNIQUE 생성 실패 방지**: 중복 해결 후 생성
- ✅ **SQL 버그 방지**: AND/OR 우선순위 괄호 추가
- ✅ **호환성 보장**: dual-read/dual-write로 자연스러운 전환
- ✅ **스펙 통일**: charset/collation 일치로 인덱스 효율/조인 최적화 보장
- ✅ **트랜잭션 안정성**: connection 주입으로 트랜잭션 컨텍스트 유지
- ✅ **쓰기 규칙 명확화**: 단일 규칙으로 데이터 오염 방지
- ✅ **모니터링 정확성**: DB+로그 기반으로 실제 사용률 추적
- ✅ **Cutover 안전성**: FK 이름 조회, 점검창, id 유지로 운영 리스크 최소화
- ✅ **사전 확장**: admin_products.id 확장으로 신규 상품 등록 실패 방지
- ✅ **재실행 안전성**: Idempotent 보강으로 재배포/롤백/핫픽스 안전
- ✅ **성능 최적화**: 1쿼리 통합, 주기적 로그로 성능 영향 최소화
- ✅ **쓰기 규칙 명확화**: resolveProductIdBoth로 진짜 단일 규칙 보장
- ✅ **정규 키 SSOT**: NOT NULL 제약으로 canonical_id가 진짜 기준 역할
- ✅ **리허설 기준**: 구체적인 합격 기준으로 Cutover 안전성 확보

---

**문서 버전**: 4.0  
**작성일**: 2026-01-11  
**최종 수정일**: 2026-01-11 (GPT 최종 핵심 함정 수정 반영)  
**기준 문서**: `PRODUCT_ID_ROUTING_REVIEW.md`, `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`, `DATABASE_SCHEMA_OVERVIEW.md`  
**GPT 검토 반영**: 
- 1차: 옵션 B (병행 운영) 방식 채택
- 2차: 핵심 버그/함정 수정 (UNIQUE 타이밍, SQL 버그, 5단계 시나리오)
- 3차: 최종 보강 (스펙 통일, 트랜잭션 친화화, 쓰기 규칙, 모니터링, Cutover 안전장치)
- 4차: 핵심 함정 수정 (A-F 6가지 함정, Idempotent, 성능, 리허설 기준, 실행 순서)

**최종 판정**: 현재 문서는 "핵심 위험 요소를 전부 잡고, 실행 순서도 운영 친화적으로 정리된 상태"
- ✅ 모든 핵심 함정(A-F) 수정 완료
- ✅ Idempotent 보강으로 재실행 안전
- ✅ 성능 최적화 및 쓰기 규칙 명확화
- ✅ Cutover 리허설 기준 구체화
- ✅ 실행 순서 운영 절차화 완료
