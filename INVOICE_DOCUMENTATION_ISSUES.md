# 인보이스 관련 문서 일관성 검토 보고서

## 📋 검토 목적

인보이스 관련 마크다운 문서들과 실제 구현 코드 간의 일관성을 검토하고, 잘못된 부분을 식별합니다.

---

## ⚠️ 발견된 문제점

### 0. `SYSTEM_FLOW_DETAILED.md`와 실제 구현 불일치 ❌

#### 0-1. invoice_number 형식 불일치

**문서 명시** (`SYSTEM_FLOW_DETAILED.md` 184줄):
- `PM-INV-YYMMDD-HHmmss-{랜덤}` 형식 (초 단위 포함)

**실제 구현** (`backend/utils/invoice-number-generator.js` 4줄, 37줄):
- `PM-INV-YYMMDD-HHmm-{랜덤4자}` 형식 (초 제외, 분까지만)

**문제점**:
- 문서와 실제 구현이 다름
- 문서는 "초 단위 + 랜덤으로 충돌 방지"라고 하지만, 실제로는 분 단위만 사용

**권장 해결책**:
- 옵션 A: 문서 수정 (실제 구현에 맞춤) - 권장
- 옵션 B: 코드 수정 (문서에 맞춤) - 초 단위 추가

#### 0-2. 인보이스 INSERT 필드 차이

**문서 명시** (`SYSTEM_FLOW_DETAILED.md` 173-181줄):
```sql
INSERT INTO invoices (
  order_id, invoice_number, type, status,
  currency, total_amount, tax_amount, net_amount,
  billing_name, billing_email, billing_phone, billing_address_json,
  shipping_name, shipping_email, shipping_phone, shipping_address_json,
  payload_json, order_snapshot_hash, version,
  issued_at
)
VALUES (?, ?, 'invoice', 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
```

**실제 구현** (`backend/utils/invoice-creator.js` 193-200줄):
```sql
INSERT INTO invoices (
  order_id, invoice_number, type, status,
  currency, total_amount, tax_amount, net_amount,
  billing_name, billing_email, billing_phone, billing_address_json,
  shipping_name, shipping_email, shipping_phone, shipping_address_json,
  payload_json, order_snapshot_hash, version,
  issued_by, issued_at
)
VALUES (?, ?, 'invoice', 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'system', NOW())
```

**차이점**:
- 실제 구현에 `issued_by` 필드가 추가로 포함됨 (문서에는 없음)
- 실제 구현: `issued_by = 'system'` (기본값)

**문제점**:
- 문서에 `issued_by` 필드가 누락되어 있음
- 문서를 기준으로 구현하면 `issued_by` 필드가 빠질 수 있음

**권장 해결책**:
- `SYSTEM_FLOW_DETAILED.md`에 `issued_by` 필드 추가

#### 0-3. 비회원 주문 상세 조회 API에 인보이스 정보 누락

**문서 명시** (`SYSTEM_FLOW_DETAILED.md` 310-314줄):
- 비회원 주문 상세 페이지에 **인보이스 정보** 표시 필요:
  - 주문번호
  - 주문일시
  - 결제 정보 (결제일시, 결제 금액, 결제 방법)
  - 배송지 정보

**실제 구현** (`backend/order-routes.js` 1831-1834줄):
- `GET /api/guest/orders/:orderNumber` 응답에 `invoices` 정보 없음

**문제점**:
- 문서에서 명시한 "인보이스 정보"가 API 응답에 포함되지 않음
- 비회원이 주문 상세 페이지에서 인보이스 정보를 확인할 수 없음

**권장 해결책**:
- `GET /api/guest/orders/:orderNumber` 응답에 `invoices` 배열 추가
- 각 인보이스 정보: `invoiceId`, `invoiceNumber`, `type`, `status`, `issuedAt` 등

---

### 1. `backend/invoice-routes.js` 주석 불일치 ❌

**문제**:
- 파일 상단 주석(5줄)에 `GET /api/invoices/:invoiceId` 엔드포인트가 누락되어 있음
- 실제로는 198줄에 구현되어 있음

**현재 상태**:
```javascript
/**
 * 디지털 인보이스 API 라우트
 * 
 * 엔드포인트:
 * - GET /api/invoices/me - 사용자 인보이스 목록 조회
 */
```

**수정 필요**:
```javascript
/**
 * 디지털 인보이스 API 라우트
 * 
 * 엔드포인트:
 * - GET /api/invoices/me - 사용자 인보이스 목록 조회
 * - GET /api/invoices/:invoiceId - 인보이스 상세 정보 조회
 */
```

---

### 2. 비회원 인보이스 접근 API 미구현 ❌

**문서 명시** (`GUEST_INVOICE_ACCESS_DESIGN.md` 134-141줄):
- `GET /api/guest/invoices/:invoiceId` 또는
- `GET /api/guest/orders/:orderNumber/invoice`
- **상태**: ❌ 구현되지 않음

**현재 구현 상태**:
- ✅ `GET /api/guest/orders/:orderNumber` - 비회원 주문 상세 조회 (구현됨)
- ❌ 비회원 인보이스 상세 조회 API 없음

**문제점**:
1. 비회원이 인보이스 상세를 조회할 수 있는 방법이 없음
2. 문서에 명시된 기능이 구현되지 않음

**권장 해결책**:
- `backend/invoice-routes.js` 또는 `backend/order-routes.js`에 비회원 인보이스 조회 API 추가
- 옵션 A: `GET /api/guest/invoices/:invoiceId` (인보이스 ID 사용)
- 옵션 B: `GET /api/guest/orders/:orderNumber/invoice` (주문 번호 사용, 권장)

---

### 3. 비회원 주문 상세 조회 API 응답에 invoices 정보 누락 ❌

**문서 명시**:
- `SYSTEM_FLOW_DETAILED.md` 310-314줄: 비회원 주문 상세 페이지에 **인보이스 정보** 표시 필요
- `GUEST_INVOICE_ACCESS_DESIGN.md` 127-132줄: `GET /api/guest/orders/:orderNumber` 응답에 `invoices` 배열 추가 필요
- **상태**: ❌ 구현되지 않음

**현재 구현 상태** (`backend/order-routes.js` 1831-1834줄):
```javascript
res.json({
    success: true,
    data: responseData  // invoices 정보 없음
});
```

**문제점**:
- 응답에 `invoices` 배열이 포함되어 있지 않음
- 비회원이 주문 상세 페이지에서 인보이스 정보를 확인할 수 없음
- 두 문서 모두에서 명시한 요구사항이 구현되지 않음

**권장 해결책**:
- 비회원 주문 상세 조회 API 응답에 `invoices` 배열 추가
- 각 인보이스 정보: `invoiceId`, `invoiceNumber`, `type`, `status`, `issuedAt` 등
- `backend/order-routes.js` 1773-1820줄 사이에 invoices 조회 로직 추가

---

### 4. `INVOICE_PAGINATION_DESIGN.md` - 구현 상태 불명확 ⚠️

**문서 내용**:
- 인보이스 페이지네이션 설계 문서
- 프론트엔드 페이지 분할 로직에 대한 상세 설계

**문제점**:
- 실제 구현 상태와 일치하는지 확인 불가
- `invoice-detail.html`에 페이지네이션 기능이 구현되어 있는지 불명확

**확인 필요**:
- `invoice-detail.html`에 페이지네이션 기능 구현 여부
- 문서의 설계와 실제 구현이 일치하는지 검증

---

### 5. `ADMIN_QR_WARRANTY_INVOICE_CONSISTENCY_CHECK.md` - 인보이스 조회 기능 누락 ⚠️

**문서 내용** (81-124줄):
- 관리자 페이지에서 인보이스 조회 기능이 누락되어 있음
- 주문 상세 화면에 인보이스 정보 추가 권장

**현재 상태**:
- 관리자 페이지에서 인보이스 조회 기능 구현 여부 불명확
- 주문 상세 화면에 인보이스 정보 표시 여부 확인 필요

**확인 필요**:
- `admin-qhf25za8/orders.html`에 인보이스 정보 표시 여부
- 관리자용 인보이스 조회 API 존재 여부

---

## 📝 수정 권장 사항

### 즉시 수정 필요

1. **`SYSTEM_FLOW_DETAILED.md` 문서 수정**
   - `invoice_number` 형식: `PM-INV-YYMMDD-HHmmss-{랜덤}` → `PM-INV-YYMMDD-HHmm-{랜덤4자}` (실제 구현에 맞춤)
   - 인보이스 INSERT 문에 `issued_by` 필드 추가

2. **`backend/invoice-routes.js` 주석 수정**
   - 파일 상단 주석에 `GET /api/invoices/:invoiceId` 엔드포인트 추가

3. **비회원 인보이스 접근 API 구현**
   - `GET /api/guest/orders/:orderNumber/invoice` 구현 (권장)
   - 또는 `GET /api/guest/invoices/:invoiceId` 구현
   - 세션 토큰 검증 포함

4. **비회원 주문 상세 조회 API 응답 수정**
   - `GET /api/guest/orders/:orderNumber` 응답에 `invoices` 배열 추가
   - `SYSTEM_FLOW_DETAILED.md`와 `GUEST_INVOICE_ACCESS_DESIGN.md` 모두에서 요구한 사항

### 향후 확인 필요

1. **인보이스 페이지네이션 구현 상태 확인**
   - `invoice-detail.html`에 페이지네이션 기능 구현 여부 확인
   - `INVOICE_PAGINATION_DESIGN.md`와 실제 구현 일치 여부 검증

2. **관리자 페이지 인보이스 조회 기능 확인**
   - 관리자 주문 상세 화면에 인보이스 정보 표시 여부 확인
   - 관리자용 인보이스 조회 API 존재 여부 확인

---

## 🔍 추가 확인 사항

### API 엔드포인트 일관성

**회원용 인보이스 API**:
- ✅ `GET /api/invoices/me` - 인보이스 목록 조회 (구현됨)
- ✅ `GET /api/invoices/:invoiceId` - 인보이스 상세 조회 (구현됨)

**비회원용 인보이스 API**:
- ❌ `GET /api/guest/invoices/:invoiceId` - 미구현
- ❌ `GET /api/guest/orders/:orderNumber/invoice` - 미구현

**비회원 주문 API**:
- ✅ `GET /api/guest/orders/:orderNumber` - 주문 상세 조회 (구현됨)
- ⚠️ 응답에 `invoices` 정보 포함 여부 확인 필요

---

## 📌 다음 단계

1. ✅ **문서 검토 완료** (현재 단계)
2. ⏭️ **코드 수정** (주석 수정, 비회원 API 구현)
3. ⏭️ **테스트 및 검증**

---

**검토일**: 2026-01-25  
**검토 기준**: `SYSTEM_FLOW_DETAILED.md`, `INVOICE_PAGINATION_DESIGN.md`, `GUEST_INVOICE_ACCESS_DESIGN.md`, `ADMIN_QR_WARRANTY_INVOICE_CONSISTENCY_CHECK.md`, 실제 구현 코드
