# 상품 관리 시스템 최종 설계 문서

## 📋 목표 구조 (SSOT - Single Source of Truth)

**한 문장 정리:**
- 상품은 모두 Collection 2026에 속한다.
- 분류는 2단계: category(대분류) + type(소분류, ACCESSORIES만)
- gender 같은 추가 축은 없다.
- **Collection Year로 연도 관리 (2026, 2027... 확장 가능)**

**테이블 역할:**
- `admin_products`는 공개 상품 목록(`/api/products`)과 관리자 관리(`/api/admin/products`)가 공통으로 사용하는 단일 상품 마스터 테이블이다.
- 테이블명에 `admin_` 접두사가 있지만, 실제로는 공개/관리자 모두가 사용하는 메인 상품 테이블이다.

---

## 🗄️ 데이터베이스 설계

### 테이블 구조: `admin_products`

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | VARCHAR(50) | 상품 ID | PRIMARY KEY |
| `name` | VARCHAR(255) | 상품명 | NOT NULL |
| `price` | INT | 가격 (원) | NOT NULL |
| `image` | VARCHAR(500) | 이미지 URL | NULL 허용 |
| `collection_year` | INT | 컬렉션 연도 (2026, 2027...) | NOT NULL, DEFAULT 2026 |
| `category` | VARCHAR(100) | 대분류 | NOT NULL |
| `type` | VARCHAR(100) | 소분류 (ACCESSORIES만 사용) | NULL 허용 |
| `description` | TEXT | 상품 설명 | NULL 허용 |
| `created_at` | DATETIME | 생성일시 | DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | 수정일시 | DEFAULT CURRENT_TIMESTAMP ON UPDATE |

**인덱스:**
- `idx_collection_year` (collection_year)
- `idx_category` (category)
- `idx_collection_category` (collection_year, category)
- `idx_collection_category_type` (collection_year, category, type)

### 카테고리 체계 (소문자 통일)

**Category (대분류):**
- `tops` (상의)
- `bottoms` (하의)
- `outer` (아우터)
- `bags` (가방) - **복수형 사용 (기존 코드베이스와 일치)**
- `accessories` (액세서리)

**전역 표준:**
- category 값은 전역 표준으로 `bags`(복수형)를 사용한다.
- 기존 코드베이스(`header.partial`, `search.html`, `catalog-data.js` 등)가 이미 `bags`를 사용 중이므로 일관성 유지.

**Type (소분류):**
- `category`가 `accessories`일 때만 사용:
  - `cap` (모자)
  - `wallet` (지갑)
  - `tie` (넥타이)
  - `scarf` (목도리)
  - `belt` (벨트)
- 그 외 카테고리는 `type = NULL`

**정책:**
- Non-accessories 카테고리는 `type`을 NULL로 저장
- 의미 명확화, 빈 문자열 혼동 방지
- **중요:** DB 컬럼은 `NULL` 허용으로 설정 (`type VARCHAR(100) NULL`)

**정규화 규칙 예시:**
- `category='tops'`, `type=null` 입력 → 그대로 저장 (`null`)
- `category='tops'`, `type='cap'` 입력 → 서버가 `type`을 `NULL`로 정규화하여 저장 (non-accessories는 항상 NULL)
- `category='accessories'`, `type='cap'` 입력 → 그대로 저장 (`cap`은 유효한 액세서리 타입)
- `category='accessories'`, `type='shirt'` 입력 → 검증 오류 (유효하지 않은 액세서리 타입)
- `category='accessories'`, `type=null` 입력 → 검증 오류 (accessories는 type 필수)

---

## 🔌 API 설계

### 요청 필수값 재정의

**필수 필드:**
- `id`, `name`, `price`, `category`

**선택 필드:**
- `image`, `description`, `type`, `collection_year`

**조건부 필수:**
- `category`가 `accessories`이면 `type`은 필수
- `collection_year`: API 요청에서 생략 가능하며, 생략 시 서버가 2026을 기본값으로 적용 (DB에서는 NOT NULL + DEFAULT 2026)

### 값 검증 (화이트리스트)

```javascript
const VALID_CATEGORIES = ['tops', 'bottoms', 'outer', 'bags', 'accessories'];
const ACCESSORY_TYPES = ['cap', 'wallet', 'tie', 'scarf', 'belt'];
const CURRENT_COLLECTION_YEAR = 2026; // 기본값
const COLLECTION_YEAR_MIN = 2000; // 최소 연도
const COLLECTION_YEAR_MAX = 2100; // 최대 연도

// 검증 규칙:
// 1. category는 VALID_CATEGORIES 안에 있어야 함
// 2. category가 'accessories'면 type은 ACCESSORY_TYPES 안에 있어야 함 (필수)
// 3. category가 'accessories'가 아니면 type은 NULL로 저장 (입력되어도 NULL로 정규화)
// 4. collection_year는 숫자, 기본값 2026, 유효 범위: 2000~2100
```

**정규화 정책 (관대한 방식):**
- `category`가 `accessories`가 아니면 `type` 값이 들어와도 무시하고 NULL로 저장
- 관리자 실수에 강함, 서버가 데이터 정규화

### API 엔드포인트

#### GET /api/products (공개 API)

**기본 동작:** `collection_year` 미지정 시 `CURRENT_COLLECTION_YEAR`(기본 2026)만 반환
- 운영 안정성: 2027 컬렉션 추가 시 2026+2027이 섞여 보이는 사고 방지
- 공개 상품 페이지는 기본적으로 현재 컬렉션만 표시하는 것이 자연스러움

**쿼리 파라미터 (선택):**
- `collection_year`: 컬렉션 연도 필터 (예: 2026)
- `category`: 카테고리 필터 (예: `tops`, `bags`)

#### GET /api/admin/products (관리자 API, 미구현 시)

**기본 동작:** 필터 없으면 전체 컬렉션, 전체 카테고리 반환
- 관리자는 모든 연도의 상품을 조회할 수 있어야 함

**쿼리 파라미터 (선택):**
- `collection_year`: 컬렉션 연도 필터 (미지정 시 전체)
- `category`: 카테고리 필터 (미지정 시 전체)
- `type`: 타입 필터 (액세서리 타입, 미지정 시 전체)

#### POST /api/admin/products
**Body:**
```json
{
  "id": "PM-26-SH-001",
  "name": "테뉴 솔리드 셔츠",
  "price": 128000,
  "collection_year": 2026,
  "category": "tops",
  "type": null,
  "image": "/uploads/products/...",
  "description": "설명"
}
```

**검증 규칙:**
- `collection_year`: 숫자, 유효 범위 2000~2100 (생략 시 서버가 2026 기본값 적용)
- `category`: `['tops', 'bottoms', 'outer', 'bags', 'accessories']` 중 하나
- `type`: `category`가 `'accessories'`면 필수, 그 외는 NULL로 정규화 (입력되어도 무시)

#### PUT /api/admin/products/:id
동일한 Body 구조

---

## 🎨 프론트엔드 설계

### 관리자 페이지 (admin-qhf25za8)

#### 상품 추가/수정 모달

**필드 구성:**
1. **기본 정보**
   - 상품 ID (`id`)
   - 상품명 (`name`)
   - 가격 (`price`)
   - 이미지 (`image`)

2. **컬렉션/카테고리**
   - 컬렉션 연도 (`collection_year`) - 드롭다운 또는 숫자 입력, 기본값 2026 자동 채움 (생략 가능하나 UI에서는 기본값 표시)
   - 카테고리 (`category`) - 드롭다운 (5개 옵션)
   - 타입 (`type`) - **조건부 표시**:
     - `category === 'accessories'`일 때만 표시 + 필수
     - 드롭다운 (5개 옵션: 모자, 지갑, 넥타이, 목도리, 벨트)
     - 그 외 카테고리에서는 숨김 또는 disabled

3. **추가 정보**
   - 설명 (`description`)

**카테고리 옵션 (value/label 분리):**
```javascript
const CATEGORY_OPTIONS = [
  { value: 'tops', label: '상의' },
  { value: 'bottoms', label: '하의' },
  { value: 'outer', label: '아우터' },
  { value: 'bags', label: '가방' },  // 복수형
  { value: 'accessories', label: '액세서리' }
];

const ACCESSORY_TYPE_OPTIONS = [
  { value: 'cap', label: '모자' },
  { value: 'wallet', label: '지갑' },
  { value: 'tie', label: '넥타이' },
  { value: 'scarf', label: '목도리' },
  { value: 'belt', label: '벨트' }
];
```

**동적 UI 로직:**
- 카테고리 선택 변경 시:
  - `accessories` 선택 → type 필드 표시 + 필수 처리
  - 그 외 선택 → type 필드 숨김 + 값 초기화

#### 필터

**필터 옵션:**
- 컬렉션 연도 필터 (선택사항, 2026, 2027...)
- 카테고리 필터
- 액세서리 타입 필터 (카테고리가 accessories일 때만 표시, 선택사항)

#### 상품 카드 표시

**메타 정보 표시:**
- 컬렉션: "Collection 2026" (collection_year 값)
- 카테고리: "상의" (한글 라벨)
- 타입: accessories인 경우만 "모자" 등 표시

---

## 📝 수정 작업 목록

### 1. 데이터베이스 스키마 수정

**파일:** `backend/setup_admin_products_table.sql`

**변경사항:**
- `gender` 컬럼 제거 (이미 없음, 확인만)
- `collection_year INT NOT NULL DEFAULT 2026` 추가
- `type` 컬럼 NULL 허용 변경: `MODIFY COLUMN type VARCHAR(100) NULL`
- 인덱스 추가: `idx_collection_year`, `idx_collection_category`
- 카테고리 주석 업데이트 (소문자 값 명시, `bags` 복수형)

### 2. 백엔드 API 수정

**파일:** `backend/product-routes.js`

**변경사항:**
- `gender` 관련 코드 완전 제거
- `collection_year` 필드 추가 및 검증 (유효 범위: 2000~2100, 생략 시 2026 기본값)
- Category/Type 검증 로직 추가 (`bags` 복수형 사용)
- 정규화 로직 추가 (non-accessories type → NULL)
- **GET /api/products 기본 동작:** `collection_year` 미지정 시 현재 컬렉션(2026)만 반환

**검증 로직:**
```javascript
// 필수 필드: id, name, price, category
// collection_year: 생략 가능, 생략 시 2026 기본값 적용
// category가 'accessories'면 type 필수, 그 외는 NULL로 정규화
```

### 3. 프론트엔드 수정

**파일:** `admin-qhf25za8/admin-products.js`

**변경사항:**
- `gender` 필드 제거
- `collection_year` 필드 추가 (기본값 2026)
- 카테고리 옵션: 한글 값 → 소문자 값 + 한글 라벨 (`bags` 복수형)
- Type 필드 조건부 표시/처리
- 카테고리 변경 시 type 필드 동적 처리

**파일:** `admin-qhf25za8/products.html`

**변경사항:**
- 카테고리 필터 옵션 업데이트 (소문자 값)
- 컬렉션 연도 필터 추가 (선택사항)

### 4. 마이그레이션 (필요 시)

**파일:** `backend/migrations/009_add_collection_year_and_type_nullable.sql`

**내용:**
```sql
-- 1. collection_year 컬럼 추가
ALTER TABLE admin_products
ADD COLUMN collection_year INT NOT NULL DEFAULT 2026 AFTER image;

-- 2. type 컬럼 NULL 허용 변경 (non-accessories는 NULL 저장 정책)
ALTER TABLE admin_products
MODIFY COLUMN type VARCHAR(100) NULL;

-- 3. 인덱스 추가
CREATE INDEX idx_collection_year ON admin_products(collection_year);
CREATE INDEX idx_collection_category ON admin_products(collection_year, category);

-- 4. 기존 데이터 처리
-- collection_year는 기본값으로 자동 설정됨
-- type은 이미 데이터가 있으면 그대로 유지 (추후 정규화 필요 시 별도 작업)
```

**기존 데이터 처리:**
- 기존 데이터는 모두 `collection_year = 2026`으로 자동 설정 (DEFAULT 값)
- `type` 컬럼은 NULL 허용으로 변경 (기존 NOT NULL 제약 해제)

### 5. 문서 업데이트

**파일:** `ADMIN_PRODUCT_MANAGEMENT.md`

**변경사항:**
- 스키마에 `collection_year` 추가
- 카테고리 체계 업데이트 (소문자 통일)
- Gender 제거 명시
- Type 조건부 처리 설명

---

## 🔄 실행 순서

1. **마이그레이션 SQL 작성** (테이블 수정)
2. **백엔드 코드 수정** (gender 제거, collection_year 추가, 검증 로직)
3. **프론트엔드 코드 수정** (UI 업데이트, 조건부 처리)
4. **테스트** (추가/수정/조회/필터)
5. **문서 업데이트**

---

## 📌 핵심 원칙

1. **값과 라벨 분리**
   - DB/API: 소문자 코드값 (`tops`, `bags`, `accessories`) - **`bags`는 복수형**
   - 프론트 표시: 한글 라벨 (`상의`, `가방`, `액세서리`)

2. **정규화 우선**
   - 서버가 잘못된 데이터를 정규화 (관대한 방식)
   - Type 필드는 non-accessories면 NULL 강제

3. **확장성 고려**
   - Collection Year로 연도별 분리 가능
   - 2027 컬렉션 추가 시 필터만 추가하면 됨

4. **단일 진실 원천 (SSOT)**
   - 이 문서가 DB-API-프론트 모두의 기준
   - 변경 시 이 문서부터 업데이트

