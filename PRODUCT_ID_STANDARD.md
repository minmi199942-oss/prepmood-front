# Product ID 표준 규칙

## 📋 개요

상품 ID(`admin_products.id`)의 표준 규칙을 정의합니다. 이 규칙은 신규 상품부터 적용됩니다.

---

## 🎯 규칙

### 기본 원칙

1. **URL-safe**: 슬래시(`/`) 포함 금지
2. **사이즈 제거**: 사이즈 정보는 `stock_units.size`에서 관리
3. **색상 코드**: 현재는 유지, 향후 `product_options` 테이블로 분리 예정

### 형식

```
기존: PM-25-SH-Teneu-Solid-LB-S/M/L
신규: PM-25-SH-Teneu-Solid-LB  (사이즈 제거)

최종 목표: PM-25-SH-Teneu-Solid  (색상도 제거, Phase 4에서)
```

### 구성 요소

- `PM-25`: 컬렉션 코드 (예: PM-25 = 2025년 컬렉션)
- `SH`: 카테고리 코드 (예: SH = Shirts)
- `Teneu-Solid`: 상품명 (하이픈으로 구분)
- `LB`: 색상 코드 (예: LB = Light Blue)
- ~~`S/M/L`~~: **제거됨** (사이즈는 `stock_units.size`에서 관리)

### 색상 코드 매핑

| 코드 | 색상명 |
|------|--------|
| LB | Light Blue |
| GY | Grey |
| LGY | Light Grey |
| BK | Black |
| NV | Navy |
| WH | White |
| WT | White |

---

## ✅ 유효성 검증

### 필수 검증

1. **슬래시(`/`) 포함 금지**
   - ❌ `PM-25-SH-Teneu-Solid-LB-S/M/L`
   - ✅ `PM-25-SH-Teneu-Solid-LB`

2. **길이 제한**
   - 최대 128자 (VARCHAR(128))

3. **형식 검증**
   - 하이픈(`-`)으로 구분
   - 영문 대문자, 숫자, 하이픈만 허용

### 자동 변환 (선택사항)

관리자 페이지에서 입력 시:
- 슬래시(`/`) 포함 시 자동 제거 또는 경고
- 사이즈 코드(`S/M/L`, `S/M`, `M/L` 등) 자동 제거

---

## 📝 예시

### 올바른 형식

```
PM-25-SH-Teneu-Solid-LB
PM-25-SH-Oxford-Stripe-GY
PM-25-BT-Chino-BK
PM-26-SH-New-Product-NV
```

### 잘못된 형식

```
PM-25-SH-Teneu-Solid-LB-S/M/L  ❌ (슬래시 포함)
PM-25-SH-Teneu Solid LB        ❌ (공백 포함)
pm-25-sh-teneu-solid-lb        ❌ (소문자)
```

---

## 🔄 마이그레이션

### 기존 상품

기존 상품은 Phase 3에서 `canonical_id` 컬럼을 통해 점진적으로 마이그레이션됩니다.

- 기존 `id`: 유지 (legacy 식별자)
- 새 `canonical_id`: 사이즈 제거된 형식

### 신규 상품

신규 상품부터는 이 규칙을 따라야 합니다.

---

## 📚 관련 문서

- `PRODUCT_ID_REFACTORING_PLAN.md`: 전체 마이그레이션 계획
- `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`: Phase 16 참조

---

**문서 버전**: 1.0  
**작성일**: 2026-01-11  
**적용 시작**: Phase 1부터
