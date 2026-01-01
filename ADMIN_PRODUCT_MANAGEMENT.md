# 관리자 페이지 - 상품 관리 시스템 정리

## 📋 개요

관리자 페이지에서 상품을 관리하는 시스템의 현재 구현 상태와 구조를 정리한 문서입니다.

---

## 🗂️ 파일 구조

### 프론트엔드 (관리자 페이지)

```
admin-qhf25za8/
├── products.html           # 상품 관리 페이지 HTML
├── admin-products.js       # 상품 관리 페이지 JavaScript 로직
├── admin-layout.js         # 공통 레이아웃 (헤더, 네비게이션)
└── admin.css              # 관리자 페이지 스타일
```

### 백엔드 (API)

```
backend/
├── product-routes.js       # 상품 관리 API 라우트
└── auth-middleware.js      # 인증 미들웨어 (관리자 권한 체크)
```

### 데이터베이스

- **테이블명:** `admin_products`
- **위치:** MySQL (`prepmood` 데이터베이스)

---

## 🗄️ 데이터베이스 스키마

### `admin_products` 테이블

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | VARCHAR(50) | 상품 ID (예: `m-sh-001`) | PRIMARY KEY |
| `name` | VARCHAR(255) | 상품명 | NOT NULL |
| `price` | INT | 가격 (원) | NOT NULL |
| `image` | VARCHAR(500) | 이미지 URL | NULL 허용 |
| `gender` | VARCHAR(20) | 성별 (`men`, `women`) | NOT NULL |
| `category` | VARCHAR(100) | 카테고리 (`tops`, `bottoms`, `outer`, `bags`, `accessories`) | NOT NULL |
| `type` | VARCHAR(100) | 타입 (예: `shirts`, `pants`) | NOT NULL |
| `description` | TEXT | 상품 설명 | NULL 허용 |
| `created_at` | DATETIME | 생성일시 | DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | 수정일시 | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

**인덱스:**
- `idx_gender` (gender)
- `idx_category` (category)
- `idx_gender_category` (gender, category)
- `idx_gender_category_type` (gender, category, type)

---

## 🔌 API 엔드포인트

### 공개 API (인증 불필요)

#### 1. 전체 상품 목록 조회
```
GET /api/products
```

**응답 예시:**
```json
{
  "success": true,
  "products": [
    {
      "id": "m-sh-001",
      "name": "클래식 옥스포드 셔츠",
      "price": 129000,
      "image": "/uploads/products/product-1234567890.jpg",
      "gender": "men",
      "category": "tops",
      "type": "shirts",
      "description": "클래식한 스타일의 옥스포드 셔츠",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

#### 2. 특정 상품 조회
```
GET /api/products/:id
```

**응답 예시:**
```json
{
  "success": true,
  "product": {
    "id": "m-sh-001",
    "name": "클래식 옥스포드 셔츠",
    ...
  }
}
```

---

### 관리자 API (인증 필요)

모든 관리자 API는 다음 미들웨어를 거칩니다:
- `authenticateToken`: JWT 토큰 인증
- `requireAdmin`: 관리자 권한 확인

#### 1. 이미지 업로드
```
POST /api/admin/upload-image
Content-Type: multipart/form-data
Body: { image: File }
```

**응답 예시:**
```json
{
  "success": true,
  "imageUrl": "/uploads/products/product-1234567890.jpg",
  "filename": "product-1234567890.jpg"
}
```

**이미지 저장 위치:**
- `backend/uploads/products/`
- 파일명 형식: `product-{timestamp}-{random}.{ext}`

#### 2. 상품 추가
```
POST /api/admin/products
Content-Type: application/json
Body: {
  "id": "m-sh-001",
  "name": "클래식 옥스포드 셔츠",
  "price": 129000,
  "image": "/uploads/products/product-1234567890.jpg",
  "gender": "men",
  "category": "tops",
  "type": "shirts",
  "description": "클래식한 스타일의 옥스포드 셔츠"
}
```

**필수 필드:**
- `id`, `name`, `price`, `gender`, `category`, `type`

**응답 예시:**
```json
{
  "success": true,
  "message": "상품이 추가되었습니다.",
  "productId": "m-sh-001"
}
```

**에러 응답:**
- `400`: 필수 필드 누락 또는 중복 ID
- `401`: 인증 실패
- `403`: 관리자 권한 없음
- `500`: 서버 오류

#### 3. 상품 수정
```
PUT /api/admin/products/:id
Content-Type: application/json
Body: {
  "name": "수정된 상품명",
  "price": 139000,
  ...
}
```

**응답 예시:**
```json
{
  "success": true,
  "message": "상품이 수정되었습니다."
}
```

**에러 응답:**
- `404`: 상품을 찾을 수 없음
- `401`: 인증 실패
- `403`: 관리자 권한 없음
- `500`: 서버 오류

#### 4. 상품 삭제
```
DELETE /api/admin/products/:id
```

**응답 예시:**
```json
{
  "success": true,
  "message": "상품이 삭제되었습니다."
}
```

**동작:**
1. 상품 존재 확인
2. DB에서 상품 삭제
3. 이미지 파일 삭제 (선택적, `/uploads/products/` 경로인 경우만)

**에러 응답:**
- `404`: 상품을 찾을 수 없음
- `401`: 인증 실패
- `403`: 관리자 권한 없음
- `500`: 서버 오류

---

## 🎨 프론트엔드 기능

### 1. 상품 목록 조회

**파일:** `admin-products.js`

**함수:** `loadProducts()`

**동작:**
1. `/api/products` 호출
2. 응답 데이터를 `products` 배열에 저장
3. `renderProducts()` 호출하여 UI 렌더링

### 2. 상품 목록 렌더링

**함수:** `renderProducts(productsToRender)`

**표시 내용:**
- 상품 이미지 (기본 이미지: `/image/shirt.jpg`)
- 상품명
- 가격 (한국 원화 포맷)
- 메타 정보 (성별 • 카테고리 • 타입)
- 수정/삭제 버튼

**이미지 경로 처리:**
- 절대 경로 (`/` 또는 `http`로 시작): 그대로 사용
- 상대 경로: `/image/` 접두사 추가

### 3. 검색 및 필터링

**함수:** `filterProducts()`

**검색 기준:**
- 상품명 (`name`)
- 상품 ID (`id`)

**필터:**
- 카테고리 (`category`)
  - `tops` (상의)
  - `bottoms` (하의)
  - `outer` (아우터)
  - `bags` (가방)
  - `accessories` (액세서리)

### 4. 상품 추가/수정 모달

**HTML 구조:**
- `products.html`에 모달 구조가 정의되어 있지만, 현재는 JavaScript에서 동적으로 생성됨 (`createProductModal()`)

**폼 필드:**
- 상품 ID (`id`) - 수정 시 readonly
- 상품명 (`name`) - 필수
- 가격 (`price`) - 필수, 숫자
- 성별 (`gender`) - 필수, `men` 또는 `women`
- 카테고리 (`category`) - 필수
- 타입 (`type`) - 필수
- 설명 (`description`) - 선택사항
- 이미지 (`image`) - 파일 업로드

**이미지 업로드:**
- `uploadImage()` 함수로 별도 업로드
- 업로드된 이미지 URL을 상품 데이터에 포함

### 5. 상품 저장

**함수:** `saveProduct()`

**동작:**
1. 폼 데이터 수집
2. 이미지 파일이 있으면 먼저 업로드
3. 수정/추가 여부에 따라 PUT/POST 요청
4. 성공 시 모달 닫기 및 목록 새로고침

### 6. 상품 삭제

**함수:** `deleteProduct(productId)`

**동작:**
1. 확인 다이얼로그 표시
2. `/api/admin/products/:id` DELETE 요청
3. 성공 시 목록 새로고침

---

## 🔐 인증 및 권한

### 관리자 권한 확인

**미들웨어:** `requireAdmin` (`backend/auth-middleware.js`)

**확인 사항:**
1. JWT 토큰 유효성
2. 토큰의 `isAdmin` 플래그 또는 이메일이 `ADMIN_EMAILS`에 포함

**프론트엔드:**
- `admin-layout.js`의 `checkAdminAccess()` 함수
- 페이지 로드 시 자동 실행
- 권한 없으면 `login.html`로 리다이렉트

---

## ⚠️ 중요: 현재 작동하지 않는 문제

### 1. admin_products 테이블이 존재하지 않음 (치명적)

**문제:**
- 코드는 `admin_products` 테이블을 사용
- 하지만 `admin_products` 테이블 생성 스크립트가 없음
- `setup_products_table.sql`은 `products` 테이블만 생성

**영향:**
- 상품 목록 조회 실패 (테이블 없음)
- 상품 추가/수정/삭제 실패 (테이블 없음)
- **현재 모든 상품 관리 기능이 작동하지 않음**

**해결 방법:**
```sql
-- backend/setup_admin_products_table.sql 실행 필요
mysql -u prepmood_user -p prepmood < backend/setup_admin_products_table.sql
```

---

## 🚨 알려진 이슈 및 개선 필요 사항

### 2. HTML과 JavaScript 불일치

**문제:**
- `products.html`에 모달 HTML이 정의되어 있지만 사용되지 않음
- JavaScript에서 `createProductModal()`로 동적으로 생성

**현재 상태:**
- JavaScript에서 동적 생성 방식 사용 중
- HTML의 모달 구조는 미사용

### 3. 카테고리/타입 옵션 불일치

**문제:**
- HTML에서 정의된 카테고리 옵션 (`tops`, `bottoms`, `outer`, `bags`, `accessories`)
- JavaScript에서 사용하는 카테고리 (`상의`, `하의`, `신발`, `가방`, `모자`, `스카프`, `액세서리`)

**영향:**
- 데이터베이스에는 영어 값 저장 (예: `tops`)
- 프론트엔드에서 한글 값으로 표시 시도할 수 있음

### 4. 성별 값 불일치

**문제:**
- JavaScript 모달: `남성`, `여성` (한글)
- 데이터베이스: `men`, `women` (영어)

**영향:**
- 저장 시 값 불일치 가능성

### 5. 타입 필드

**문제:**
- 현재 `type` 필드는 텍스트 입력
- 카테고리에 따라 타입 옵션이 달라져야 함 (예: `tops` → `shirts`, `t-shirts`, `knits`)

**개선 필요:**
- 카테고리 선택에 따라 타입 옵션 동적 변경

### 6. 이미지 미리보기

**현재 상태:**
- 파일 선택 시 미리보기 기능 있음
- 수정 시 기존 이미지 표시 기능 있음

---

## 📝 사용 방법

### 1. 관리자 로그인

```
/admin-qhf25za8/login.html
```

### 2. 상품 관리 페이지 접근

```
/admin-qhf25za8/products.html
```

### 3. 상품 추가

1. "+ 새 상품 추가" 버튼 클릭
2. 모달에서 상품 정보 입력
3. 이미지 업로드 (선택사항)
4. "저장" 버튼 클릭

### 4. 상품 수정

1. 상품 카드의 "수정" 버튼 클릭
2. 모달에서 정보 수정
3. "저장" 버튼 클릭

### 5. 상품 삭제

1. 상품 카드의 "삭제" 버튼 클릭
2. 확인 다이얼로그에서 "확인" 클릭

### 6. 검색 및 필터

1. 상단 검색창에 상품명 또는 ID 입력
2. 카테고리 드롭다운에서 카테고리 선택

---

## 🔄 데이터 흐름

### 상품 추가 플로우

```
1. 사용자: "+ 새 상품 추가" 클릭
   ↓
2. JavaScript: openAddProductModal() → createProductModal()
   ↓
3. 사용자: 폼 입력 및 이미지 선택
   ↓
4. 사용자: "저장" 클릭
   ↓
5. JavaScript: saveProduct()
   ↓
6. 이미지 있으면: uploadImage() → POST /api/admin/upload-image
   ↓
7. POST /api/admin/products (상품 데이터)
   ↓
8. 백엔드: DB에 INSERT
   ↓
9. JavaScript: loadProducts() → GET /api/products
   ↓
10. UI 업데이트
```

### 상품 수정 플로우

```
1. 사용자: "수정" 버튼 클릭
   ↓
2. JavaScript: openEditProductModal(productId)
   ↓
3. JavaScript: createProductModal() (기존 데이터로 채움)
   ↓
4. 사용자: 정보 수정
   ↓
5. 사용자: "저장" 클릭
   ↓
6. JavaScript: saveProduct()
   ↓
7. 새 이미지 있으면: uploadImage()
   ↓
8. PUT /api/admin/products/:id
   ↓
9. 백엔드: DB UPDATE
   ↓
10. JavaScript: loadProducts()
   ↓
11. UI 업데이트
```

---

## 📌 향후 개선 사항

### 필수 개선

1. **카테고리/타입 옵션 표준화**
   - 영어 값 사용 통일 또는 한글 값으로 통일
   - 카테고리별 타입 옵션 동적 변경

2. **HTML과 JavaScript 통합**
   - HTML 모달 사용 또는 JavaScript 동적 생성 완전화

3. **에러 처리 개선**
   - 사용자 친화적인 에러 메시지
   - 네트워크 오류 시 재시도 기능

### 선택적 개선

1. **페이지네이션**
   - 상품이 많을 때 페이지 분할

2. **대량 업로드**
   - CSV/Excel 파일로 상품 일괄 등록

3. **상품 복제**
   - 기존 상품을 복사하여 새 상품 생성

4. **상품 통계**
   - 카테고리별 상품 수
   - 가격 분포

---

## 🔗 관련 파일

### 프론트엔드
- `admin-qhf25za8/products.html`
- `admin-qhf25za8/admin-products.js`
- `admin-qhf25za8/admin-layout.js`
- `admin-qhf25za8/admin.css`

### 백엔드
- `backend/product-routes.js`
- `backend/auth-middleware.js`

### 데이터베이스
- `admin_products` 테이블

