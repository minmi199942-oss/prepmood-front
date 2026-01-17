# product_options 테이블 설명

**작성일**: 2026-01-16  
**목적**: `product_options` 테이블의 용도와 `stock_units`와의 차이점 설명

---

## 📋 product_options란?

`product_options`는 **상품이 지원하는 모든 사이즈/색상 옵션을 관리하는 마스터 테이블**입니다.

### 핵심 개념

**"재고가 없어도 상품이 지원하는 모든 옵션을 표시"**

- 재고 상태와 **무관하게** 상품의 옵션 라인업을 정의
- 재고가 0인 옵션도 표시 가능 (품절 표시)
- 관리자가 옵션을 직접 추가/수정/삭제 가능

---

## 🔄 stock_units vs product_options

### stock_units (재고 단위)
**목적**: 물리적 재고 관리 (물류 관점)

- **1 stock_unit = 1 물리적 상품**
- 실제로 창고에 있는 상품을 나타냄
- 재고 상태 관리: `in_stock`, `reserved`, `sold`, `returned`
- 재고가 있으면 옵션이 표시되고, 재고가 없으면 옵션이 표시되지 않음

**예시**:
```
stock_units:
- product_id: PM-26-SH-Teneu-Solid-LB, size: M, color: Light Blue, status: in_stock
- product_id: PM-26-SH-Teneu-Solid-LB, size: L, color: Light Blue, status: sold
→ M 사이즈만 표시됨 (L은 재고 없음)
```

---

### product_options (옵션 마스터)
**목적**: 옵션 라인업 관리 (상품 정보 관점)

- **상품이 지원하는 모든 옵션 조합**을 정의
- 재고 상태와 무관하게 옵션 표시
- 재고가 0이어도 옵션 표시 가능 (품절 표시)

**예시**:
```
product_options:
- product_id: PM-26-SH-Teneu-Solid-LB, size: S, color: Light Blue
- product_id: PM-26-SH-Teneu-Solid-LB, size: M, color: Light Blue
- product_id: PM-26-SH-Teneu-Solid-LB, size: L, color: Light Blue
→ S, M, L 모두 표시됨 (재고 상태와 무관)
```

---

## 🎯 사용 목적

### 1. 재고가 0인 옵션도 표시

**문제 상황**:
- `stock_units`만 사용하면 재고가 0인 옵션은 표시되지 않음
- 사용자가 "이 상품에 L 사이즈가 있는지" 알 수 없음

**해결**:
- `product_options`에 옵션을 정의하면 재고가 0이어도 표시 가능
- "L 사이즈 (품절)" 형태로 표시

---

### 2. 옵션 관리의 SSOT (Single Source of Truth)

**문제 상황**:
- `stock_units`에서 옵션을 추출하면 재고 상태에 따라 옵션이 달라짐
- 옵션 정보가 일관되지 않음

**해결**:
- `product_options`가 옵션 정보의 SSOT
- 재고 상태와 무관하게 일관된 옵션 표시

---

### 3. 관리자 페이지에서 옵션 관리

**기능**:
- 관리자가 옵션을 직접 추가/수정/삭제 가능
- 재고를 추가하지 않아도 옵션을 미리 정의 가능
- 옵션의 정렬 순서(`sort_order`) 관리 가능

---

## 📍 실제 사용처

### 1. 옵션 API (`/api/products/options`)

**동작 방식**:
1. `product_options`에서 옵션 라인업 조회 (SSOT)
2. `stock_units`에서 재고 상태 조회
3. 두 정보를 결합하여 응답

**응답 예시**:
```json
{
  "success": true,
  "options": {
    "colors": [
      { "color": "Light Blue", "available": true },
      { "color": "Black", "available": false }  // 재고 0이지만 표시됨
    ],
    "sizes": [
      { "size": "S", "available": true },
      { "size": "M", "available": true },
      { "size": "L", "available": false }  // 재고 0이지만 표시됨
    ]
  }
}
```

---

### 2. Fallback 로직

**현재 동작**:
- `product_options`가 있으면 → `product_options` 사용
- `product_options`가 없으면 → `stock_units`에서 fallback 조회

**Fallback의 한계**:
- 재고가 0인 옵션은 표시되지 않음
- 옵션 관리가 어려움

---

### 3. 관리자 페이지 옵션 관리

**API**:
- `GET /api/admin/products/:productId/options` - 옵션 조회
- `POST /api/admin/products/:productId/options` - 옵션 추가
- `PUT /api/admin/products/:productId/options/:optionId` - 옵션 수정
- `DELETE /api/admin/products/:productId/options/:optionId` - 옵션 삭제

**UI**:
- 상품 수정 모달에 옵션 관리 섹션
- 옵션 추가/수정/삭제 가능
- 재고 상태와 무관하게 옵션 관리

---

## ⚠️ 현재 문제점

### 1. product_options 데이터 부족

**현황**:
- 10개 상품 중 7개(70%)가 `product_options` 없음
- Fallback으로 동작하지만, 재고가 0인 옵션은 표시되지 않음

**해결 방안**:
- 모든 상품에 `product_options` 데이터 생성
- 재고 추가 시 자동으로 `product_options` 생성 (구현 필요)

---

### 2. 재고 추가 시 자동 생성 안 됨

**현재 상태**:
- 재고 추가 API(`POST /api/admin/stock`)는 `stock_units`에만 INSERT
- `product_options` 자동 생성 로직 없음

**해결 방안**:
- 재고 추가 시 해당 (product_id, size, color) 조합이 `product_options`에 없으면 자동 추가
- `INSERT IGNORE` 사용하여 중복 방지

---

## 📝 요약

### product_options의 역할

1. **옵션 라인업의 SSOT**: 상품이 지원하는 모든 옵션 정의
2. **재고 상태와 무관한 옵션 표시**: 재고가 0이어도 옵션 표시 가능
3. **관리자 옵션 관리**: 옵션을 직접 추가/수정/삭제 가능

### stock_units와의 차이

| 구분 | stock_units | product_options |
|------|------------|-----------------|
| **목적** | 물리적 재고 관리 | 옵션 라인업 관리 |
| **단위** | 1 stock_unit = 1 물리적 상품 | 1 option = 1 옵션 조합 |
| **재고 상태** | 관리함 (in_stock, sold 등) | 관리 안 함 |
| **옵션 표시** | 재고가 있으면 표시 | 재고 상태와 무관하게 표시 |
| **관리** | 재고 추가/수정 시 변경 | 관리자가 직접 관리 |

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
