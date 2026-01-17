# product_options 현재 상태

**확인일**: 2026-01-16  
**스크립트**: `check_product_options_status.sql`, `check_stock_units_for_missing_options.sql`

---

## 📊 현재 상태 요약

### 전체 통계
- **총 옵션 수**: 5개
- **옵션이 있는 상품**: 3개
- **옵션이 없는 상품**: 7개
- **고유 색상 수**: 3개
- **고유 사이즈 수**: 4개

---

## ✅ 옵션이 있는 상품 (3개)

1. **PM-26-ACC-Fabric-Tie-Skinny**
   - 옵션 수: 1개
   - 옵션: size: (없음), color: Black
   - 재고: 2개 (in_stock: 1개)

2. **PM-26-SH-Teneu-Solid-LB**
   - 옵션 수: 1개
   - 옵션: size: S, color: Light Blue
   - 재고: 1개 (in_stock: 0개, 품절)

3. **PM-26-SH-Oxford-Stripe-LG**
   - 옵션 수: 3개
   - 옵션: 
     - size: S, color: Light Grey (품절)
     - size: M, color: Light Grey (품절)
     - size: L, color: Light Grey (품절)
   - 재고: 1개 (모두 품절)

---

## ⚠️ 옵션이 없는 상품 (7개)

**공통 특징**: 모두 `stock_count = 0` (재고 없음)

1. PM-26-ACC-Fabric-Tie-Solid
2. PM-26-Outer-LeStripe-Suit-NV
3. PM-26-Outer-London-Liberty-Toile-BK
4. PM-26-SH-Teneu-Solid-Pintuck-WH
5. PM-26-SK-Suit-Balloon-BK
6. PM-26-TOP-Heavyweight-Vest-GY
7. PM-26-TOP-Solid-Suit-Bustier-BK

---

## 🔍 원인 분석

### 왜 옵션이 없는가?

**재고가 없는 상품은 `stock_units`에 데이터가 없음**
- `stock_units`에 재고 데이터가 없으면 옵션 정보를 추출할 수 없음
- 마이그레이션 스크립트는 `stock_units`에서 옵션을 추출하므로, 재고가 없으면 생성 불가

**예시**:
```
stock_units:
- PM-26-ACC-Fabric-Tie-Solid: 재고 0개 → 옵션 정보 없음
- PM-26-SH-Oxford-Stripe-LG: 재고 1개 → 옵션 정보 있음 (3개 옵션)
```

---

## ✅ 해결 방안

### 1. 재고 추가 시 자동 생성 (권장)

**이미 구현됨** ✅
- 재고 추가 API(`POST /api/admin/stock`)에서 `product_options` 자동 생성
- 재고를 추가하면 자동으로 옵션이 생성됨

**사용 방법**:
1. 관리자 페이지에서 재고 추가
2. size, color 입력
3. 재고 추가 시 자동으로 `product_options` 생성됨

---

### 2. 관리자 페이지에서 직접 추가

**이미 구현됨** ✅
- 관리자 페이지의 상품 수정 모달에서 옵션 직접 추가 가능
- 재고 없이도 옵션을 미리 정의 가능

**사용 방법**:
1. 관리자 페이지 → 상품 관리
2. 상품 수정 모달 열기
3. 옵션 관리 섹션에서 옵션 추가

---

## 📝 결론

### 현재 상태
- ✅ **재고가 있는 상품**: 모두 `product_options` 있음
- ⚠️ **재고가 없는 상품**: `product_options` 없음 (재고가 없어서 생성 불가)

### 해결 방법
- ✅ **재고 추가 시 자동 생성**: 재고를 추가하면 자동으로 옵션 생성됨
- ✅ **관리자 페이지에서 직접 추가**: 재고 없이도 옵션 미리 정의 가능

### 권장 사항
- 재고가 없는 상품은 **재고를 추가할 때** 자동으로 옵션이 생성되므로 별도 작업 불필요
- 또는 **관리자 페이지에서 옵션을 직접 추가**하여 미리 정의 가능

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
