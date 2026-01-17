# Phase 16-4: 색상 코드 제거 A안 영향도 분석 결과

**실행일**: 2026-01-16  
**스크립트**: `backend/scripts/check_color_code_removal_impact.sql`

---

## 📊 실행 결과 요약

### 1. product_options 테이블 데이터 현황

**현황**:
- ✅ **옵션이 있는 상품**: 3개 (30%)
- ⚠️ **옵션이 없는 상품**: 7개 (70%) - fallback 필요

**옵션이 있는 상품**:
1. `PM-26-ACC-Fabric-Tie-Skinny` (1개 옵션)
2. `PM-26-SH-Teneu-Solid-LB` (1개 옵션)
3. `PM-26-SH-Oxford-Stripe-LG` (3개 옵션)

**옵션이 없는 상품** (fallback 사용):
1. `PM-26-ACC-Fabric-Tie-Solid`
2. `PM-26-Outer-LeStripe-Suit-NV`
3. `PM-26-Outer-London-Liberty-Toile-BK`
4. `PM-26-SH-Teneu-Solid-Pintuck-WH`
5. `PM-26-SK-Suit-Balloon-BK`
6. `PM-26-TOP-Heavyweight-Vest-GY`
7. `PM-26-TOP-Solid-Suit-Bustier-BK`

---

### 2. stock_units Fallback 확인

**결과**: ✅ **Fallback 가능**
- 옵션이 없는 7개 상품 모두 `stock_units`에 재고 데이터 존재
- 각 상품당 1개의 unique 옵션 조합 존재
- Fallback 로직이 정상 동작 가능

**주의사항**:
- ⚠️ 재고가 0인 옵션은 표시되지 않음 (fallback의 한계)
- `product_options`가 있으면 재고가 0이어도 옵션 표시 가능

---

### 3. 주문 데이터 색상 정보 현황

**현황**:
- 총 주문 항목: **70개**
- 색상 정보 있음: **13개** (19%)
- 색상 정보 없음: **57개** (81%) ⚠️

**색상별 주문 통계**:
- Light Blue: 7개
- Black: 4개
- Light Grey: 2개

**분석**:
- ⚠️ **대부분의 주문 항목에 색상 정보가 없음**
- 이는 과거 주문 데이터이거나, 색상 정보 저장 로직이 추가되기 전의 데이터일 가능성
- 현재 주문 생성 로직에서는 색상 정보가 저장되므로 향후 문제 없음

---

### 4. 색상 코드 포함 상품 현황

**현황**:
- 색상 코드 포함 상품: **8개**
- 그 중 `product_options` 없음: **6개** (75%)
- 그 중 `product_options` 있음: **2개** (25%)

**색상 코드별 분류**:
- Navy: 1개 (옵션 없음)
- Black: 3개 (옵션 없음)
- Light Grey: 1개 (옵션 있음)
- Light Blue: 1개 (옵션 있음)
- White: 1개 (옵션 없음)
- Grey: 1개 (옵션 없음)

---

### 5. product_options와 product_id 색상 코드 일치 확인

**결과**:
- ✅ **일치하는 상품**: 2개
  - `PM-26-SH-Oxford-Stripe-LG`: Light Grey (일치)
  - `PM-26-SH-Teneu-Solid-LB`: Light Blue (일치)
- ⚠️ **옵션이 없는 상품**: 6개
  - product_id에 색상 코드가 있어도 `product_options`가 NULL
  - Fallback으로 `stock_units`에서 조회

---

## ⚠️ 발견된 문제점

### 1. product_options 데이터 부족 (중요)

**문제**:
- 10개 상품 중 7개(70%)가 `product_options` 없음
- 색상 코드가 포함된 상품 중 6개(75%)가 옵션 없음

**영향**:
- Fallback으로 동작하지만, 재고가 0인 옵션은 표시되지 않음
- 옵션 관리가 어려움 (관리자 페이지에서 옵션 추가/수정 불가)

**해결 방안**:
- 모든 상품에 `product_options` 데이터 생성 필요
- `stock_units` 데이터를 기반으로 `product_options` 자동 생성 스크립트 작성

---

### 2. 주문 데이터 색상 정보 부족 (과거 데이터)

**문제**:
- 70개 주문 항목 중 57개(81%)에 색상 정보 없음

**영향**:
- 과거 주문 데이터이므로 현재 시스템에 영향 없음
- 하지만 주문 이력 조회 시 색상 정보가 표시되지 않음

**해결 방안**:
- 선택적: 과거 주문 데이터 색상 정보 보완 (낮은 우선순위)
- 현재 주문 생성 로직에서는 색상 정보 저장되므로 문제 없음

---

## ✅ 안전성 확인

### 백엔드 API
- ✅ Fallback 로직 정상 동작 가능
- ✅ `stock_units`에서 옵션 조회 가능
- ⚠️ 재고가 0인 옵션은 표시 안 됨 (fallback의 한계)

### 프론트엔드
- ✅ API 성공 시 정상 동작
- ⚠️ API 실패 시 제한적 색상만 표시 (하지만 product_id 파싱 없음)

### 데이터베이스
- ✅ `product_options` 테이블 존재
- ✅ `stock_units` 테이블에 데이터 존재
- ⚠️ `product_options` 데이터 부족 (70% 상품)

---

## 🎯 권장 조치 사항

### 즉시 조치 필요 (높은 우선순위)

1. **product_options 데이터 생성**
   - 모든 상품에 `product_options` 데이터 생성
   - `stock_units` 데이터를 기반으로 자동 생성 스크립트 작성
   - 재고가 0인 옵션도 포함하여 생성

2. **데이터 생성 스크립트 작성**
   - `stock_units`에서 DISTINCT (product_id, size, color) 조합 추출
   - `product_options`에 INSERT (이미 있는 옵션은 제외)
   - 색상 정규화 적용

### 선택적 조치 (낮은 우선순위)

3. **과거 주문 데이터 색상 정보 보완** (선택적)
   - 과거 주문 데이터의 색상 정보 보완
   - 하지만 현재 시스템에 영향 없으므로 낮은 우선순위

4. **프론트엔드 Fallback 개선** (선택적)
   - Fallback 색상 목록 확장
   - 또는 API 실패 시 구매 버튼 비활성화

---

## 📝 결론

**전체적으로 안전하지만 개선 필요** ⚠️

**주요 확인 사항**:
- ✅ Fallback 로직 정상 동작
- ⚠️ `product_options` 데이터 부족 (70% 상품)
- ⚠️ 과거 주문 데이터 색상 정보 부족 (하지만 현재 시스템에 영향 없음)

**다음 단계**:
1. **즉시**: `product_options` 데이터 생성 스크립트 작성 및 실행
2. **선택적**: 과거 주문 데이터 색상 정보 보완
3. **선택적**: 프론트엔드 fallback 개선

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
