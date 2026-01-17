# 새 상품 추가 가이드

**작성일**: 2026-01-16  
**목적**: 데이터베이스에 없는 새로운 상품을 웹사이트에 추가하는 전체 프로세스

---

## 📋 전체 프로세스 개요

새 상품을 추가하는 과정은 다음 4단계로 구성됩니다:

1. **토큰 생성** (필수, `token_master` 테이블에 토큰이 있어야 함)
2. **상품 정보 등록** (관리자 페이지) - `admin_products` 테이블에 자동 저장됨 ✅
3. **재고 추가** (관리자 페이지) - `product_options` 자동 생성됨
4. **옵션 확인/추가** (선택적, 관리자 페이지)

---

## 🚀 단계별 상세 가이드

### 0단계: 토큰 생성 (필수)

#### ⚠️ 중요: 재고 추가 전에 토큰이 필요함

**재고 추가 시 `token_pk`가 필요하며, 이는 `token_master` 테이블에 이미 존재해야 함**

#### 토큰 생성 방법

**⚠️ 중요: 기존 토큰 보존**

현재 데이터베이스에 42개의 토큰이 있는 경우:
- `init-token-master-from-xlsx.js`는 **기존 토큰을 모두 삭제**하고 재생성함
- 따라서 **새 상품 추가 시에는 아래 방법 2 또는 3을 사용해야 함**

---

**방법 1: xlsx 파일로 일괄 생성** (초기화 전용, 기존 토큰 삭제됨)
- ⚠️ **주의**: 기존 토큰을 모두 삭제하고 재생성함
- `products.xlsx` 파일 준비
- `backend/init-token-master-from-xlsx.js` 스크립트 실행
- **새 상품 추가 시에는 사용하지 않음** (기존 토큰 삭제됨)
- 자세한 내용: `VPS_TOKEN_MASTER_INIT_GUIDE.md` 참조

**방법 2: SQL로 직접 생성** (개별 토큰, 기존 토큰 유지) ✅ **권장**
- 기존 토큰을 유지하면서 새 토큰만 추가
- 여러 개 추가 가능 (여러 번 실행)
```sql
-- 1. 새 토큰 생성 (token_pk는 자동 생성됨)
INSERT INTO token_master 
(token, internal_code, product_name, product_id, created_at, updated_at)
VALUES 
('TOKEN001', 'INT001', '새 상품명', 'PM-26-SH-New-Product-LB', NOW(), NOW());

-- 2. 생성된 token_pk 확인
SELECT token_pk, token, product_name, product_id 
FROM token_master 
WHERE product_id = 'PM-26-SH-New-Product-LB';
```

**방법 3: 관리자 페이지에서 직접 추가** (향후 구현 예정)
- 관리자 페이지에서 토큰 추가 기능 (현재 미구현)

**주의사항**:
- `token_pk`는 AUTO_INCREMENT로 자동 생성됨
- 재고 추가 시 이 `token_pk` 값을 사용해야 함
- **기존 토큰을 유지하려면 방법 2 사용** (SQL 직접 입력)

---

### 1단계: 상품 정보 등록

#### 접근 방법
1. 관리자 페이지 접속: `/admin-qhf25za8/products.html`
2. "+ 새 상품 추가" 버튼 클릭

#### 입력 필수 정보

**상품 ID** (`id`):
- 형식: `PM-{연도}-{카테고리코드}-{상품명}-{색상코드}`
- 예시: `PM-26-SH-Teneu-Solid-LB`
- 규칙:
  - 슬래시(`/`) 포함 금지
  - 사이즈 코드 포함 금지 (재고 관리에서 별도 관리)
  - 색상 코드는 선택사항 (향후 제거 예정)

**상품명** (`name`):
- 예시: "테뉴 솔리드 셔츠 Teneu Solid SH 26 – Light Blue"
- 최대 255자

**가격** (`price`):
- 숫자만 입력
- 범위: 0원 ~ 10억원

**컬렉션 연도** (`collection_year`):
- 기본값: 2026
- 범위: 2000 ~ 2100

**카테고리** (`category`):
- 선택 옵션: `tops`, `bottoms`, `outer`, `bags`, `accessories`
- 필수 항목

**타입** (`type`):
- 카테고리가 `accessories`인 경우만 필수
- 선택 옵션: `cap`, `wallet`, `tie`, `scarf`, `belt`
- 그 외 카테고리는 자동으로 `NULL` 처리

**이미지** (`image`):
- 선택사항
- 업로드 시 자동으로 `/uploads/products/` 경로에 저장

**설명** (`description`):
- 선택사항
- 최대 5000자

#### 저장 후
- ✅ **`admin_products` 테이블에 자동으로 저장됨**
- `canonical_id`는 `id`와 동일하게 설정됨
- 관리자 페이지에서 상품 추가하면 바로 DB에 반영됨

---

### 2단계: 재고 추가

#### ⚠️ 사전 준비
- **0단계에서 토큰을 먼저 생성해야 함**
- `token_master` 테이블에 토큰이 없으면 재고 추가 불가

#### 접근 방법
1. 관리자 페이지 → 재고 관리 (`/admin-qhf25za8/stock.html`)
2. "재고 추가" 버튼 클릭

#### 입력 정보

**상품 ID**:
- 1단계에서 등록한 상품 ID 선택 또는 입력

**토큰 PK**:
- ⚠️ **`token_master` 테이블에 이미 존재하는 `token_pk` 입력 필수**
- 0단계에서 생성한 토큰의 `token_pk` 값 사용
- 여러 개 입력 가능 (배열)
- **토큰이 없으면 재고 추가 불가** (에러 발생)

**사이즈** (`size`):
- 선택사항
- 옵션: `S`, `M`, `L`, `XL`, `XXL`, `F` (Free)
- 액세서리/타이류는 `Free` 또는 빈 값 (NULL)

**색상** (`color`):
- 선택사항
- 표준값: `Black`, `Navy`, `White`, `Grey`, `Light Blue`, `Light Grey`
- 입력 시 자동 정규화됨

#### 저장 후
- `stock_units` 테이블에 재고 정보 저장됨
- **자동으로 `product_options` 생성됨** ✅
  - 해당 (product_id, size, color) 조합이 `product_options`에 없으면 자동 추가
  - 색상 정규화 및 sort_order 자동 계산

---

### 3단계: 옵션 확인/추가 (선택적)

#### 옵션이 자동 생성되었는지 확인

**방법 1: 관리자 페이지에서 확인**
1. 상품 관리 페이지에서 상품 수정 모달 열기
2. "옵션 관리" 섹션에서 옵션 목록 확인

**방법 2: SQL로 확인**
```sql
SELECT * FROM product_options WHERE product_id = 'PM-26-SH-New-Product-LB';
```

#### 옵션 추가 (필요 시)

**재고 없이 옵션만 미리 정의하고 싶은 경우**:
1. 상품 관리 페이지에서 상품 수정 모달 열기
2. "옵션 관리" 섹션에서 옵션 추가
3. size, color 입력 후 저장

**재고 추가 시 자동 생성되므로 일반적으로는 불필요**

---

## 📝 Product ID 규칙

### 형식
```
PM-{연도}-{카테고리코드}-{상품명}-{색상코드}
```

### 예시
- `PM-26-SH-Teneu-Solid-LB` (셔츠, Light Blue)
- `PM-26-TOP-Solid-Suit-Bustier-BK` (상의, Black)
- `PM-26-ACC-Fabric-Tie-Solid` (액세서리, 색상 코드 없음)

### 카테고리 코드
- `SH`: Shirts (셔츠)
- `TOP`: Tops (상의)
- `SK`: Skirts (스커트)
- `BT`: Bottoms (하의)
- `ACC`: Accessories (액세서리)
- `OUT`: Outer (아우터)

### 색상 코드 (선택사항, 향후 제거 예정)
- `LB`: Light Blue
- `BK`: Black
- `NV`: Navy
- `GY`: Grey
- `WH`: White
- `LG`: Light Grey

### 주의사항
- 슬래시(`/`) 포함 금지
- 사이즈 코드 포함 금지 (재고 관리에서 별도 관리)

---

## ✅ 체크리스트

### 토큰 생성 시 (0단계)
- [ ] `token_master` 테이블에 토큰 생성 (xlsx 또는 SQL)
- [ ] 생성된 `token_pk` 값 확인

### 상품 등록 시 (1단계)
- [ ] Product ID 형식 확인 (슬래시 없음, 사이즈 코드 없음)
- [ ] 필수 정보 입력 (id, name, price, category)
- [ ] 액세서리인 경우 type 선택
- [ ] 이미지 업로드 (선택사항)
- [ ] **`admin_products` 테이블에 자동 저장됨 확인** ✅

### 재고 추가 시 (2단계)
- [ ] 상품 ID 선택/입력
- [ ] **토큰 PK 입력** (0단계에서 생성한 `token_pk` 사용) ⚠️ 필수
- [ ] 사이즈 입력 (선택사항)
- [ ] 색상 입력 (선택사항)
- [ ] `product_options` 자동 생성 확인

### 옵션 확인 시
- [ ] 재고 추가 후 옵션이 자동 생성되었는지 확인
- [ ] 필요 시 관리자 페이지에서 옵션 추가

---

## 🔍 예시: 새 상품 추가 시나리오

### 시나리오: "PM-26-SH-New-Shirt-BK" 상품 추가

**0단계: 토큰 생성** (필수)
```
방법: SQL로 직접 생성 (기존 토큰 유지)

SQL 실행:
INSERT INTO token_master 
(token, internal_code, product_name, product_id, created_at, updated_at)
VALUES 
('aB3cD5eF7gH9iJ1kL3mN5', 'SN-001', '새 셔츠', 'PM-26-SH-New-Shirt-BK', NOW(), NOW());

생성된 token_pk 확인:
SELECT token_pk FROM token_master WHERE product_id = 'PM-26-SH-New-Shirt-BK';
→ token_pk: 123 (자동 생성)

추가 토큰이 필요하면 같은 방식으로 여러 개 생성:
INSERT INTO token_master (token, internal_code, product_name, product_id, created_at, updated_at)
VALUES ('xY9zA1bC3dE5fG7hI9jK1', 'SN-002', '새 셔츠', 'PM-26-SH-New-Shirt-BK', NOW(), NOW());
```

**1단계: 상품 정보 등록**
```
상품 ID: PM-26-SH-New-Shirt-BK
상품명: 새 셔츠 New Shirt SH 26 – Black
가격: 150000
컬렉션 연도: 2026
카테고리: tops
타입: (NULL, 자동 처리)
이미지: (선택사항)
설명: (선택사항)
```

**2단계: 재고 추가**
```
상품 ID: PM-26-SH-New-Shirt-BK
토큰 PK: [123, 124, 125] (3개) ← 0단계에서 생성한 token_pk 사용
사이즈: S
색상: Black
```

**자동 생성됨**:
- `stock_units`에 3개 재고 추가
- `product_options`에 자동 생성:
  - product_id: PM-26-SH-New-Shirt-BK
  - size: S
  - color: Black
  - sort_order: 1 (S = 1)

**3단계: 옵션 확인**
- 관리자 페이지에서 확인 또는 SQL로 확인
- 재고 추가 시 자동 생성되었으므로 별도 작업 불필요

---

## ⚠️ 주의사항

### 1. 토큰 생성 필수
- ⚠️ **재고 추가 전에 `token_master` 테이블에 토큰이 있어야 함**
- 토큰이 없으면 재고 추가 불가 (에러: "일부 토큰을 찾을 수 없습니다")
- **기존 토큰을 유지하면서 새 토큰 추가**: SQL로 직접 입력 (방법 2) ✅
- ⚠️ **xlsx 파일로 일괄 생성 (방법 1)은 기존 토큰을 모두 삭제함** - 새 상품 추가 시 사용 금지

### 2. Product ID 중복 방지
- 상품 추가 시 중복 ID 확인됨
- 중복 시 에러 메시지 표시

### 3. 색상 정규화
- 입력한 색상은 자동으로 표준값으로 정규화됨
- 예: `LB` → `Light Blue`, `BK` → `Black`

### 4. 사이즈 정규화
- `Free` → `NULL`로 변환 (액세서리/타이류)
- 빈 문자열 → `NULL`로 변환

### 5. 옵션 자동 생성
- 재고 추가 시 자동으로 `product_options` 생성됨
- 중복 방지: `INSERT IGNORE` 사용
- 이미 있는 옵션은 생성되지 않음

---

## 📊 데이터 흐름

### 상품 등록
```
사용자 입력 → POST /api/admin/products → admin_products 테이블 INSERT
```

### 재고 추가
```
사용자 입력 → POST /api/admin/stock → stock_units 테이블 INSERT
                                    → product_options 테이블 INSERT (자동)
```

### 옵션 관리
```
사용자 입력 → POST /api/admin/products/:id/options → product_options 테이블 INSERT
```

---

## 🎯 요약

### 필수 단계
0. ✅ **토큰 생성** (xlsx 또는 SQL) - 재고 추가 전 필수
1. ✅ **상품 정보 등록** (관리자 페이지) - `admin_products` 테이블에 자동 저장됨
2. ✅ **재고 추가** (관리자 페이지) - 옵션 자동 생성됨

### 선택 단계
3. ⚠️ **옵션 확인/추가** (일반적으로 불필요, 재고 추가 시 자동 생성)

### 핵심 포인트
- ✅ **관리자 페이지에서 상품 추가하면 `admin_products` 테이블에 자동 저장됨**
- ⚠️ **재고 추가 전에 `token_master` 테이블에 토큰이 있어야 함** (토큰 생성 필수)
- 재고 추가 시 `product_options`가 자동으로 생성됨
- 재고 없이도 옵션을 미리 정의할 수 있음 (관리자 페이지)
- Product ID는 슬래시(`/`) 포함 금지, 사이즈 코드 포함 금지

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
