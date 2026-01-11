# 상품 ID 라우팅 문제 검토 및 해결 방안

## 📋 GPT 제안 검토 결과

### ✅ **GPT 제안은 현재 환경에 적합하며 즉시 실행 가능**

---

## 🔍 현재 환경 분석

### 1. **라우트 구조 (문제 확인됨)**

**현재 라우트 순서:**
```javascript
router.get('/products', ...)           // 라인 56
router.get('/products/:id', ...)       // 라인 98  ← 일반 라우트가 먼저!
router.get('/products/:id/options', ...) // 라인 134 ← 특정 라우트가 나중
```

**문제:**
- Express는 라우트를 위에서 아래로 순차 매칭
- `/products/:id`가 먼저 정의되어 있어서, `/products/PM-25-SH-Teneu-Solid-LB-S/M/L/options` 요청 시
- `:id` 파라미터에 `PM-25-SH-Teneu-Solid-LB-S/M/L/options` 전체가 매칭됨
- 결과: 404 에러 (해당 ID의 상품이 없음)

### 2. **현재 상품 ID 형식**

```sql
-- 실제 사용 중인 상품 ID 예시
PM-25-SH-Teneu-Solid-LB-S/M/L  ← 슬래시(/) 포함!
PM-25-SH-Oxford-Stripe-GY-S/M/L
PM-25-Outer-LeStripe-Suit-NV-S/L
```

**특징:**
- 사이즈 구분자로 `/` 사용 (`S/M/L`, `S/L`)
- URL path parameter로 사용 시 문제 발생

### 3. **프론트엔드 사용 현황**

**buy-script.js:**
```javascript
// 라인 76: 옵션 조회 API 호출
const response = await fetch(`${API_BASE_URL}/products/${product.id}/options`);
// ❌ product.id에 '/' 포함 시 URL 파싱 실패

// 상품 상세는 API 호출 안 함
// → CATALOG_DATA (product-data.js에서 로드) 사용
```

**product-data.js:**
```javascript
// 라인 24: 상품 목록만 API로 로드
const response = await fetch('/api/products');
// ✅ Query parameter 사용 (문제 없음)
```

---

## ✅ GPT 제안 검토

### **목표 A: 즉시 해결 (오늘)**

#### **제안 1: 옵션 API를 Query 방식으로 변경**

**현재 문제:**
```
GET /api/products/:id/options
id = "PM-25-SH-Teneu-Solid-LB-S/M/L"
→ URL: /api/products/PM-25-SH-Teneu-Solid-LB-S/M/L/options
→ Express 라우팅 실패 (404)
```

**변경 후:**
```
GET /api/products/options?product_id=PM-25-SH-Teneu-Solid-LB-S/M/L
→ encodeURIComponent로 안전하게 전달
→ Express 라우팅 정상 작동
```

**✅ 장점:**
1. **마이그레이션 불필요** (DB 구조 변경 없음)
2. **라우트 순서 의존성 제거** (구현 디테일에 덜 의존)
3. **URL-safe 문제 해결** (쿼리 파라미터는 자동 인코딩)
4. **Cloudflare/Nginx WAF 이슈 회피** (encoded slash 문제 없음)
5. **즉시 구현 가능** (코드 변경만 필요)

**검토 결과: 적합 ✅**

#### **제안 2: 상품 상세도 Query 방식으로 변경**

**현재 상황:**
- `buy-script.js`는 상품 상세를 API로 호출하지 않음
- `CATALOG_DATA` (product-data.js)에서 로드한 데이터 사용
- 하지만 향후 API 기반으로 변경 시 동일한 문제 발생 가능

**변경 제안:**
```
GET /api/products/detail?product_id=...
```

**✅ 장점:**
- 일관된 API 설계
- 향후 확장성 확보
- 동일한 문제 예방

**검토 결과: 적합하나 우선순위 낮음 ⚠️**
- 현재는 상품 상세를 API로 호출하지 않으므로 **즉시 필요하지 않음**
- 옵션 API 수정 후 필요 시 추가 가능

#### **제안 3: 하드코딩 옵션은 Fallback으로만**

**현재 코드 (buy-script.js 74-95줄):**
```javascript
// API 호출 시도
try {
  const response = await fetch(`${API_BASE_URL}/products/${product.id}/options`);
  if (response.ok) {
    // DB 기반 옵션 생성
    return;
  }
} catch (error) {
  // 하드코딩 옵션으로 폴백
}

// API 실패 시 하드코딩 옵션 사용
generateSizeOptions(product);
generateColorOptions();
```

**GPT 제안:**
- API 성공 시: DB 기반만 사용
- API 실패 시: 하드코딩 옵션 표시 + **구매 버튼 비활성화** (재고 불일치 방지)

**✅ 장점:**
- 재고 불일치로 인한 주문 오류 방지
- 사용자 혼란 최소화

**검토 결과: 적합하나 즉시 필수는 아님 ⚠️**
- 옵션 API 수정 후 정상 작동하면 자동으로 해결됨
- 추가 안전장치로 구현 권장

---

### **목표 B: 중장기 정상화**

#### **제안 1: admin_products.id에서 사이즈 제거**

**현재:**
```
PM-25-SH-Teneu-Solid-LB-S/M/L
```

**이상:**
```
PM-25-SH-Teneu-Solid-LB
```

**✅ 검토 결과: 올바른 방향**
- 사이즈는 `stock_units.size`에서 관리 (이미 구현됨)
- 상품 ID는 불변 식별자 역할만 수행
- URL-safe 보장

**⚠️ 주의사항:**
- **마이그레이션 필요** (모든 FK 테이블 업데이트)
- **기존 주문/재고 데이터 영향** (충분한 계획 필요)
- **단계적 접근 권장** (GPT의 "현실적인 이상" 제안이 적합)

#### **제안 2: URL은 slug 사용**

**이상:**
```
/buy.html?handle=teneusolid-lightblue
→ 서버에서 handle → product_id 매핑
```

**✅ 검토 결과: 좋은 아이디어지만 선택사항**
- SEO 친화적
- URL 가독성 향상
- 하지만 현재 환경에서는 **즉시 필요하지 않음**

---

## 🎯 실행 계획

### **Phase 1: 즉시 수정 (오늘, 1시간 내)**

1. **옵션 API를 Query 방식으로 변경**
   - `backend/product-routes.js`: 라인 134 라우트 변경
   - `buy-script.js`: 라인 76 API 호출 변경
   - 테스트: 실제 상품 페이지에서 옵션 로드 확인

2. **라우트 순서는 자동 해결**
   - Query 방식으로 변경하면 라우트 순서 문제 자동 해결

### **Phase 2: 안전장치 추가 (선택사항)**

3. **Fallback 시 구매 버튼 비활성화**
   - `buy-script.js`에 안전장치 추가
   - API 실패 시 사용자 경고 표시

### **Phase 3: 중장기 (추후)**

4. **상품 ID 리팩토링**
   - 새 상품부터 슬래시 없는 ID 사용
   - 기존 상품은 마이그레이션 계획 수립

---

## 📝 최종 평가

### **GPT 제안 평가:**

| 제안 | 적합성 | 우선순위 | 즉시 실행 가능 |
|------|--------|----------|----------------|
| 옵션 API Query 변경 | ✅ 매우 적합 | 🔴 최우선 | ✅ 가능 |
| 상품 상세 Query 변경 | ✅ 적합 | 🟡 중간 | ⚠️ 불필요 (현재 미사용) |
| Fallback 안전장치 | ✅ 적합 | 🟡 중간 | ⚠️ 선택사항 |
| 상품 ID 리팩토링 | ✅ 올바른 방향 | 🟢 낮음 | ❌ 마이그레이션 필요 |

### **결론:**

**GPT의 "목표 A" 해결책은 현재 환경에 완벽히 맞으며, 즉시 실행을 권장합니다.**

**특히:**
- ✅ 라우트 순서 문제 해결
- ✅ URL-safe 문제 해결
- ✅ 마이그레이션 없이 즉시 적용 가능
- ✅ 우리의 stock_units 기반 SSOT 정책과 일치

**실행 순서:**
1. **지금 바로**: 옵션 API Query 방식으로 변경
2. **테스트**: 실제 환경에서 확인
3. **추가 안전장치**: Fallback 시 구매 버튼 비활성화 (선택사항)
4. **중장기**: 상품 ID 리팩토링 (별도 작업으로 진행)
