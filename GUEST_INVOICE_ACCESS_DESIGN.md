# 비회원 인보이스 접근 방식 설계

**작성일**: 2026-01-16  
**상태**: 설계 완료 (구현 미완성)

---

## 📋 개요

비회원 주문 완료 후 발급되는 디지털 인보이스에 대한 접근 방식을 정의합니다.

---

## 🎯 결정된 방식: 옵션 3 (간단한 인보이스 카드)

### 선택 이유

1. **비회원 특성**: 주문당 인보이스 1개 (목록 페이지 불필요)
2. **자연스러운 UX**: 주문 상세 페이지에 인보이스 정보 포함
3. **구현 단순성**: 복잡한 구조 불필요
4. **편지지 디자인 활용**: 상세 페이지에서만 사용 가능

---

## 🔄 비회원 인보이스 접근 흐름

### 시나리오 1: 이메일 링크 클릭 (주문 상세)

```
1. 결제 완료 → 인보이스 생성 (processPaidOrder)
2. 이메일 발송 (주문 확인 이메일)
   └── 링크: /api/guest/orders/session?token={guest_order_access_token}
3. 세션 토큰 발급 → /guest/orders.html?order={orderNumber} (302 Redirect)
4. 주문 상세 페이지 표시
   ├── 주문 정보
   ├── 결제 정보
   ├── 배송 정보
   └── [신규] 디지털 인보이스 섹션
       ├── 인보이스 번호
       ├── 발급일
       └── "인보이스 상세 보기" 버튼
           ↓ 클릭
       /guest/invoice-detail.html?order={orderNumber}
```

### 시나리오 2: 직접 접근 (인보이스만 확인)

```
/guest/invoice-detail.html?order={orderNumber}&token={guest_order_access_token}
→ 세션 교환 후 인보이스 상세 페이지 표시
```

---

## 📐 UI/UX 구조

### 1. 주문 상세 페이지 (`guest/orders.html`)

**신규 섹션 추가: "디지털 인보이스"**

```html
<!-- 기존 섹션들... -->

<!-- [신규] 디지털 인보이스 섹션 -->
<div class="order-info-card" id="invoice-card">
    <h2>디지털 인보이스</h2>
    <dl id="invoice-info-list">
        <dt>인보이스 번호</dt>
        <dd id="invoice-number">-</dd>
        
        <dt>발급일</dt>
        <dd id="invoice-issued-date">-</dd>
        
        <dt>상태</dt>
        <dd id="invoice-status">-</dd>
    </dl>
    
    <!-- 인보이스 상세 보기 버튼 -->
    <div class="invoice-action">
        <a href="/guest/invoice-detail.html?order={orderNumber}" 
           class="btn-primary" 
           id="view-invoice-btn">
            인보이스 상세 보기
        </a>
    </div>
</div>
```

**특징:**
- 기존 `order-info-card` 스타일과 동일한 카드 형태
- 인보이스 기본 정보만 표시 (번호, 발급일, 상태)
- "인보이스 상세 보기" 버튼으로 상세 페이지 이동

---

### 2. 인보이스 상세 페이지 (`/guest/invoice-detail.html`)

**구조:**

```
/guest/invoice-detail.html
├── 헤더 (공통)
├── 로고 섹션
└── 메인 컨텐츠
    └── 인보이스 상세 영역
        ├── 뒤로가기 버튼 (주문 상세로)
        ├── 페이지 제목
        └── 인보이스 상세 정보
            ├── 인보이스 기본 정보 (번호, 발급일, 상태)
            ├── 청구 정보 (Billing)
            ├── 배송 정보 (Shipping)
            ├── 주문 항목 테이블
            └── 금액 정보 (소계, 세금, 총액)
```

**디자인 특징:**
- 회원용 인보이스 상세와 동일한 레이아웃
- 편지지 디자인은 **상세 페이지에서만** 사용 (목록 불필요)
- 비회원 특성상 사이드바 없음 (단순 레이아웃)

---

## 🔌 API 엔드포인트

### 필요 API

#### 1. 주문 상세 조회 API (기존)
```
GET /api/guest/orders/:orderNumber
```
- **현재 상태**: ✅ 구현됨
- **수정 필요**: 응답에 `invoices` 정보 추가 필요

#### 2. 인보이스 상세 조회 API (신규 필요)
```
GET /api/guest/invoices/:invoiceId
또는
GET /api/guest/orders/:orderNumber/invoice
```
- **역할**: 주문 번호로 인보이스 정보 조회
- **응답**: 인보이스 전체 정보 (payload_json 포함)

---

## 📝 구현 체크리스트

### Phase 1: API 수정 (백엔드)

- [ ] `GET /api/guest/orders/:orderNumber` 응답에 `invoices` 배열 추가
  ```json
  {
    "success": true,
    "data": { ... },
    "order": { ... },
    "invoices": [
      {
        "invoiceId": 123,
        "invoiceNumber": "PM-INV-...",
        "type": "invoice",
        "status": "issued",
        "issuedAt": "2026-01-16T...",
        ...
      }
    ]
  }
  ```

- [ ] 인보이스 상세 조회 API 구현
  - 옵션 A: `GET /api/guest/invoices/:invoiceId` (인보이스 ID)
  - 옵션 B: `GET /api/guest/orders/:orderNumber/invoice` (주문 번호)

### Phase 2: 프론트엔드 수정

- [ ] `guest/orders.html`에 인보이스 섹션 추가
- [ ] `guest/orders.js`에서 인보이스 정보 렌더링
- [ ] 인보이스 상세 페이지 생성 (`guest/invoice-detail.html`)
- [ ] 인보이스 상세 JavaScript 생성 (`guest/invoice-detail.js`)
- [ ] 회원용 인보이스 상세 페이지 생성 (`invoice-detail.html`)
- [ ] 회원용 인보이스 상세 JavaScript 생성 (`invoice-detail.js`)

### Phase 3: 링크 연결

- [ ] `digital-invoice.js`: 편지지 카드 클릭 시 상세 페이지 이동
- [ ] `guest/orders.html`: "인보이스 상세 보기" 버튼 링크 연결

---

## 🔍 참고 사항

### 회원 vs 비회원 차이

| 구분 | 회원 | 비회원 |
|------|------|--------|
| **인보이스 목록** | ✅ 필요 (마이페이지) | ❌ 불필요 (주문당 1개) |
| **인보이스 상세** | ✅ 필요 | ✅ 필요 |
| **접근 경로** | 마이페이지 → 디지털 인보이스 → 상세 | 주문 상세 → 인보이스 상세 |
| **편지지 디자인** | 목록 + 상세 모두 | 상세만 |

### 세션 관리

- 비회원 인보이스 상세 페이지는 `guest_order_access_token` → `guest_session_token` 세션 교환 필요
- URL 파라미터 `?token=xxx` 또는 쿠키 기반 (`guest_session_token`)

---

## 📌 다음 단계

1. ✅ **문서 작성 완료** (현재 단계)
2. ⏭️ **인보이스 상세 페이지 프론트엔드 구현** (다음 단계)
3. ⏭️ **API 수정 및 연동**
4. ⏭️ **링크 연결 및 테스트**

---

## 💡 향후 고려 사항

- 비회원이 여러 주문을 한 경우: 각 주문별로 개별 접근 (이메일 링크)
- Claim 후: 회원 인보이스 목록에 포함되어야 함
- Credit Note: 환불 시 credit_note도 동일한 방식으로 접근
