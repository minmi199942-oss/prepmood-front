# product_options 통합 계획: 모든 상품 동일 동작 보장

**작성일**: 2026-01-16  
**목적**: 모든 상품이 동일하게 동작하도록 `product_options` 통합

---

## 🎯 목표

**모든 상품이 재고가 0인 옵션도 표시하도록 보장**

- 현재: 3개 상품만 `product_options` 있음 → 재고 0인 옵션 표시됨
- 목표: 10개 상품 모두 `product_options` 있음 → 재고 0인 옵션 표시됨

---

## 📋 구현 계획

### 1단계: 기존 데이터 마이그레이션 ✅

**파일**: `backend/migrations/083_backfill_product_options_from_stock_units.sql`

**작업 내용**:
- `product_options`가 없는 상품의 `stock_units` 데이터에서 옵션 추출
- 색상 정규화 적용 (072 마이그레이션과 동일한 로직)
- `product_options`에 INSERT IGNORE로 생성

**실행 방법**:
```bash
mysql -u prepmood_user -p prepmood < backend/migrations/083_backfill_product_options_from_stock_units.sql
```

**예상 결과**:
- 7개 상품에 `product_options` 자동 생성
- 모든 상품이 `product_options`를 가지게 됨

---

### 2단계: 재고 추가 시 자동 생성 ✅

**파일**: `backend/stock-routes.js` (POST /api/admin/stock)

**작업 내용**:
- 재고 추가 후 해당 (product_id, size, color) 조합이 `product_options`에 없으면 자동 추가
- 색상 정규화 및 sort_order 계산
- `INSERT IGNORE`로 중복 방지

**코드 위치**: `backend/stock-routes.js` 533-580줄

**동작 방식**:
1. `stock_units`에 재고 INSERT (기존 동작)
2. 추가된 재고의 고유한 (size, color) 조합 추출
3. 각 조합에 대해 `product_options`에 INSERT IGNORE
4. 색상 정규화 및 sort_order 자동 계산

---

## 🔍 구현 상세

### 색상 정규화 로직

**정규화 규칙** (072 마이그레이션과 동일):
- `LB`, `LightBlue`, `Light-Blue` → `Light Blue`
- `LG`, `LGY`, `LightGrey`, `Light-Grey` → `Light Grey`
- `BK` → `Black`
- `NV` → `Navy`
- `WH`, `WT` → `White`
- `GY`, `Gray` → `Grey`

### sort_order 계산

**규칙**:
- `S` → 1
- `M` → 2
- `L` → 3
- `XL` → 4
- `XXL` → 5
- `F` → 6
- 기타 → 99

---

## ✅ 검증 방법

### 1. 마이그레이션 실행 후 확인

```sql
-- 모든 상품이 product_options를 가지는지 확인
SELECT 
    ap.id AS product_id,
    ap.name,
    COUNT(po.option_id) as option_count
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
GROUP BY ap.id, ap.name
HAVING COUNT(po.option_id) = 0;
-- 결과가 0개여야 함
```

### 2. 재고 추가 후 확인

1. 관리자 페이지에서 재고 추가
2. 해당 상품의 `product_options` 확인
3. 추가한 (size, color) 조합이 `product_options`에 있는지 확인

---

## 📊 예상 효과

### Before (현재)

| 상품 수 | product_options | 재고 0인 옵션 표시 |
|---------|----------------|-------------------|
| 3개 | 있음 | ✅ 표시됨 |
| 7개 | 없음 | ❌ 표시 안 됨 |

### After (구현 후)

| 상품 수 | product_options | 재고 0인 옵션 표시 |
|---------|----------------|-------------------|
| 10개 | 있음 | ✅ 표시됨 |

---

## 🚀 실행 순서

1. **기존 데이터 마이그레이션 실행**
   ```bash
   mysql -u prepmood_user -p prepmood < backend/migrations/083_backfill_product_options_from_stock_units.sql
   ```

2. **코드 배포**
   - `backend/stock-routes.js` 변경사항 커밋 및 푸시
   - 자동 배포 또는 수동 배포

3. **검증**
   - 모든 상품이 `product_options`를 가지는지 확인
   - 재고 추가 시 `product_options` 자동 생성 확인

---

## ⚠️ 주의사항

### 1. 색상 정규화 일관성

- 마이그레이션 스크립트와 재고 추가 로직의 색상 정규화 규칙이 동일해야 함
- 072 마이그레이션과 동일한 로직 사용

### 2. 중복 방지

- `INSERT IGNORE` 사용으로 중복 생성 방지
- UNIQUE KEY `uk_product_color_size` 제약 활용

### 3. 트랜잭션

- 재고 추가와 `product_options` 생성이 같은 트랜잭션 내에서 수행
- 실패 시 롤백 보장

---

## 📝 요약

### 구현 내용

1. ✅ **기존 데이터 마이그레이션**: `083_backfill_product_options_from_stock_units.sql`
2. ✅ **재고 추가 시 자동 생성**: `backend/stock-routes.js` 수정

### 효과

- 모든 상품이 `product_options`를 가지게 됨
- 재고가 0인 옵션도 일관되게 표시됨
- 향후 재고 추가 시 자동으로 `product_options` 생성

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
