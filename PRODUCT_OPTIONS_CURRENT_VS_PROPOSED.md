# product_options: 현재 상황 vs 제안 사항 비교

**작성일**: 2026-01-16  
**목적**: 현재 시스템과 제안 사항의 차이점 명확화

---

## 🔍 현재 시스템 동작 방식

### 1. product_options가 있는 경우 ✅

**동작**:
1. `product_options`에서 모든 옵션 조회 (재고 상태와 무관)
2. `stock_units`에서 재고 상태만 조회 (`status = 'in_stock'`)
3. 두 정보를 결합하여 `available: true/false`로 응답

**결과**:
- ✅ 재고가 0인 옵션도 표시됨 (`available: false`)
- ✅ "L 사이즈 (품절)" 형태로 표시됨
- ✅ 재고를 등록했다가 모두 판매되어도 옵션은 계속 표시됨

**예시**:
```json
{
  "sizes": [
    { "size": "S", "available": true },
    { "size": "M", "available": true },
    { "size": "L", "available": false }  // 재고 0이지만 표시됨
  ]
}
```

---

### 2. product_options가 없는 경우 (Fallback) ⚠️

**동작**:
1. `stock_units`에서 DISTINCT (size, color) 조회
2. **재고가 있는 옵션만** 조회됨

**결과**:
- ❌ 재고가 0인 옵션은 표시되지 않음
- ❌ 재고를 등록했다가 모두 판매되면 옵션이 사라짐

**예시**:
```
stock_units:
- size: S, color: Light Blue, status: in_stock  → 표시됨
- size: M, color: Light Blue, status: sold        → 표시 안 됨
- size: L, color: Light Blue, status: sold        → 표시 안 됨

결과: S 사이즈만 표시됨
```

---

## 🎯 제안 사항: 재고 추가 시 product_options 자동 생성

### 목적

**문제**: 
- 현재 10개 상품 중 7개(70%)가 `product_options` 없음
- Fallback으로 동작하지만, 재고가 0인 옵션은 표시되지 않음

**해결**:
- 재고 추가 시 자동으로 `product_options` 생성
- 모든 상품이 `product_options`를 가지도록 보장

---

### 구현 내용

**재고 추가 API 수정** (`POST /api/admin/stock`):
1. `stock_units`에 재고 INSERT (기존 동작)
2. **추가**: 해당 (product_id, size, color) 조합이 `product_options`에 없으면 자동 추가
3. `INSERT IGNORE` 사용하여 중복 방지

**코드 예시**:
```javascript
// 재고 추가 후
await connection.query(
    `INSERT INTO stock_units ...`
);

// product_options 자동 생성
await connection.execute(
    `INSERT IGNORE INTO product_options (product_id, color, size, sort_order, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    [productId, normalizedColor, normalizedSize, sortOrder]
);
```

---

## 🔄 차이점 비교

### 현재 상황

| 상황 | product_options 있음 | product_options 없음 (Fallback) |
|------|---------------------|--------------------------------|
| **재고 0인 옵션 표시** | ✅ 표시됨 (`available: false`) | ❌ 표시 안 됨 |
| **재고 등록 후 모두 판매** | ✅ 옵션 계속 표시 | ❌ 옵션 사라짐 |
| **옵션 관리** | ✅ 관리자 페이지에서 관리 가능 | ❌ 재고 추가/삭제에 따라 변경 |

---

### 제안 사항 적용 후

| 상황 | 모든 상품 |
|------|----------|
| **재고 0인 옵션 표시** | ✅ 표시됨 (`available: false`) |
| **재고 등록 후 모두 판매** | ✅ 옵션 계속 표시 |
| **옵션 관리** | ✅ 관리자 페이지에서 관리 가능 |
| **자동 생성** | ✅ 재고 추가 시 자동 생성 |

---

## ✅ 결론

### 현재 시스템과의 충돌 여부

**충돌 없음** ✅

**이유**:
1. 현재 시스템은 이미 `product_options`가 있으면 재고가 0인 옵션도 표시함
2. 제안 사항은 `product_options`가 없는 상품에 대해서만 적용됨
3. 기존 동작 방식은 그대로 유지됨

---

### 제안 사항의 효과

**Before (현재)**:
- 3개 상품: `product_options` 있음 → 재고 0인 옵션 표시됨 ✅
- 7개 상품: `product_options` 없음 → 재고 0인 옵션 표시 안 됨 ❌

**After (제안 적용 후)**:
- 10개 상품: 모두 `product_options` 있음 → 재고 0인 옵션 표시됨 ✅

---

### 실제 차이점

**현재**:
- `product_options`가 있는 상품만 재고가 0인 옵션 표시 가능
- `product_options`가 없는 상품은 재고가 0이면 옵션이 사라짐

**제안 적용 후**:
- 모든 상품이 재고가 0인 옵션도 표시 가능
- 재고 추가 시 자동으로 `product_options` 생성되어 일관성 유지

---

## 📝 요약

### 현재 시스템
- ✅ `product_options`가 있으면 재고가 0인 옵션도 표시됨 (품절 표시)
- ⚠️ `product_options`가 없으면 재고가 0인 옵션은 표시 안 됨

### 제안 사항
- ✅ 재고 추가 시 `product_options` 자동 생성
- ✅ 모든 상품이 일관된 동작 (재고가 0인 옵션도 표시)

### 충돌 여부
- ✅ **충돌 없음**: 기존 동작 방식 유지, 단지 적용 범위 확대

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
