# 상품 스키마 설계 검토 결과

## GPT 제안 검토 (코드베이스 확인 완료)

### ✅ 1. category 값: bag vs bags

**코드베이스 확인 결과:**

**실제 사용 중인 값: `bags` (복수형)**

확인된 위치:
- `header.partial`: `value="bags"`
- `search.html`: `value="bags"`
- `admin-qhf25za8/products.html`: `value="bags"` (2곳)
- `catalog-data.js`: `bags: { ... }`
- `product-data.js`: `bags: { ... }`
- `backend/setup_admin_products_table.sql` 주석: `'bags'`
- `backend/replace_products.sql` 주석: `'bags'`

**결론:**
- ❌ 문서에서 `bag`(단수)로 작성한 것은 **잘못됨**
- ✅ 실제 코드베이스는 `bags`(복수)를 사용 중
- ✅ **문서를 `bags`로 수정해야 함**
- ✅ 마이그레이션 불필요 (현재 이미 `bags` 사용 중)

---

### ✅ 2. type 컬럼 NULL 허용

**코드베이스 확인 결과:**

**현재 DB 스키마:**
```sql
type VARCHAR(100) NOT NULL
```

**설계 정책:**
- non-accessories는 `type = NULL`

**결론:**
- ✅ GPT 제안 맞음
- ✅ 마이그레이션에 `ALTER TABLE ... MODIFY type ... NULL` 포함 필요
- ✅ 현재 설계 문서에 빠져 있음 → **추가 필요**

---

### ✅ 3. GET /api/products 기본 동작

**현재 코드 확인:**
```javascript
// backend/product-routes.js
const [products] = await connection.execute(
    'SELECT * FROM admin_products ORDER BY created_at DESC'
);
// 필터 없음 - 모든 상품 반환
```

**GPT 제안:**
- collection_year 미지정 시 기본값으로 현재 컬렉션(2026)만 반환
- 2027 추가 시 2026+2027이 섞여 보이는 사고 방지

**결론:**
- ✅ GPT 제안 타당
- ✅ 공개 API는 기본적으로 현재 컬렉션만 반환하는 것이 안전
- ✅ 관리자 목록은 전체 조회 필요 (별도 처리 또는 쿼리 파라미터)

**권장 방식:**
```javascript
// 공개 API: 기본값으로 현재 컬렉션만
const collectionYear = req.query.collection_year || CURRENT_COLLECTION_YEAR; // 2026

// 관리자 API: 전체 조회 (필터 옵션 제공)
```

---

### ✅ 4. admin_products 테이블 명칭 역할 명시

**현재 상황:**
- 테이블명: `admin_products`
- 사용처:
  - 공개 API: `GET /api/products` (인증 불필요)
  - 관리자 API: `GET /api/admin/products` (인증 필요)

**결론:**
- ✅ GPT 제안 맞음
- ✅ 테이블 이름이 `admin_` 접두사를 가지고 있지만, 실제로는 공개/관리자 공통 사용
- ✅ 문서에 역할 명시 필요 → **혼란 방지**

---

### ✅ 5. collection_year 검증 정책

**현재 설계:**
- "collection_year는 숫자, 기본값 2026"만 명시
- 범위 제한 없음

**GPT 제안:**
- 정책 B (관대): 숫자면 받되, 유효 범위 명시 (0, -1, 9999 등 방지)

**결론:**
- ✅ GPT 제안 타당
- ✅ 최소한의 범위 검증 추가 권장 (예: 2000 ~ 2100)
- ✅ 문서에 유효 범위 명시 필요

---

### ✅ 6. 정규화 규칙 예시

**GPT 제안:**
- 실제 입력/출력 예시 추가로 오해 방지

**결론:**
- ✅ 제안 타당
- ✅ SSOT 문서로서 가치 향상
- ✅ 예시 추가 권장

---

## 📝 수정이 필요한 항목 요약

### 1. category 값: `bag` → `bags` 수정
- 문서 전체에서 `bag` → `bags`로 변경
- 마이그레이션 불필요 (이미 `bags` 사용 중)

### 2. type NULL 허용 마이그레이션 추가
```sql
ALTER TABLE admin_products 
MODIFY COLUMN type VARCHAR(100) NULL;
```

### 3. GET /api/products 기본 동작 명시
- 기본값: 현재 컬렉션(2026)만 반환
- 또는 관리자/공개 API 분리 명시

### 4. admin_products 테이블 역할 명시
- 공개/관리자 공통 마스터 테이블임을 명시

### 5. collection_year 유효 범위 명시
- 예: 2000 ~ 2100 (또는 적절한 범위)

### 6. 정규화 규칙 예시 추가
- 실제 입력/출력 케이스 예시

---

## 최종 검토 결과

**GPT의 제안은 모두 타당하며, 코드베이스 확인 결과 실제로 필요한 수정사항입니다.**

특히 중요한 3가지:
1. ✅ **bag → bags 수정** (실제 코드와 일치)
2. ✅ **type NULL 허용 마이그레이션 추가** (현재 NOT NULL, 설계는 NULL)
3. ✅ **GET /api/products 기본 동작 명시** (운영 안정성)

이 3가지를 반영하면 SSOT 문서가 완성도 높아집니다.

