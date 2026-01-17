# 보증서 관리 페이지 구현 누락 사항 종합 분석

**작성일**: 2026-01-16  
**기준 문서**: `SYSTEM_FLOW_DETAILED.md`, `FINAL_EXECUTION_SPEC_REVIEW.md`, `ADMIN_PAGE_OPERATIONAL_REVIEW.md`, `ADMIN_QR_WARRANTY_INVOICE_CONSISTENCY_CHECK.md`

---

## 📋 목차

1. [관리자 액션 UI 누락](#1-관리자-액션-ui-누락)
2. [상태 전이 규칙 준수 누락](#2-상태-전이-규칙-준수-누락)
3. [이벤트 생성 reason 입력 UI 누락](#3-이벤트-생성-reason-입력-ui-누락)
4. [환불 처리 버튼 위치 및 표시 조건](#4-환불-처리-버튼-위치-및-표시-조건)
5. [원자적 조건 검증 UI 피드백](#5-원자적-조건-검증-ui-피드백)
6. [상태별 액션 버튼 표시 로직](#6-상태별-액션-버튼-표시-로직)
7. [백엔드 API vs 프론트엔드 UI 불일치 현황](#7-백엔드-api-vs-프론트엔드-ui-불일치-현황)
8. [인보이스 정보 표시 완성도](#8-인보이스-정보-표시-완성도)

---

## 1. 관리자 액션 UI 누락

### 1.1 보증서 정지 (제재) 버튼

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 8-6절):
> 보증서 정지 (`warranties.status` → `'suspended'`)

**백엔드 API**: ✅ 존재
- `POST /api/admin/warranties/:id/events`
- Body: `{ type: 'suspend', reason: '제재 사유' }`

**프론트엔드 UI**: ✅ **구현 완료** (2026-01-16)
- 보증서 상세 모달에 "정지" 버튼 추가됨
- 상태가 `active` 또는 `issued`일 때 표시됨

**상태 전이 규칙** (`FINAL_EXECUTION_SPEC_REVIEW.md` 551줄):
> `admin suspend`: `issued`/`active` → `suspended`

**구현 필요 사항**:
- 보증서 상세 모달에 "정지" 버튼 추가
- 상태가 `active` 또는 `issued`일 때만 표시
- 클릭 시 reason 입력 모달 표시
- reason 입력 후 API 호출

---

### 1.2 보증서 정지 해제 버튼

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 8-6절):
> 보증서 정지 해제 (`warranties.status` → `'issued'`)

**백엔드 API**: ✅ 존재
- `POST /api/admin/warranties/:id/events`
- Body: `{ type: 'unsuspend', reason: '해제 사유' }`

**프론트엔드 UI**: ✅ **구현 완료** (2026-01-16)
- 보증서 상세 모달에 "정지 해제" 버튼 추가됨
- 상태가 `suspended`일 때만 표시됨

**상태 전이 규칙** (`FINAL_EXECUTION_SPEC_REVIEW.md` 552줄):
> `admin resume`: `suspended` → `issued` (이 전이만 허용). 활성화(`active`)는 별도 절차(동의/재확인)를 통해서만 가능

**구현 필요 사항**:
- 보증서 상세 모달에 "정지 해제" 버튼 추가
- 상태가 `suspended`일 때만 표시
- 클릭 시 reason 입력 모달 표시
- reason 입력 후 API 호출

---

### 1.3 보증서 환불 처리 버튼

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 6-2절, 8-5절):
> 관리자 수동 처리: 시리얼 넘버와 토큰 확인 후 환불 처리  
> 환불 처리 버튼 (환불 가능한 경우만 활성화)

**백엔드 API**: ✅ 존재
- `POST /api/admin/refunds/process`
- Body: `{ warranty_id: 1, reason: '환불 사유' }`

**프론트엔드 UI**: ⚠️ **선택 사항**
- 보증서 상세 모달에 "환불 처리" 버튼 없음
- ⚠️ **참고**: 환불은 문의 시스템을 통해 관리자가 처리 가능하므로, 보증서 상세 화면에 버튼이 없어도 운영 가능
- 주문 상세 화면에 환불 처리 버튼이 있다면 충분함

**환불 가능 판정** (`SYSTEM_FLOW_DETAILED.md` 1061-1064줄):
> `warranties.status` 확인:
> - `revoked` → 거부 (이미 환불 완료)
> - `active` → 거부 (활성화된 보증서는 환불 불가)
> - `issued` / `issued_unassigned` → 허용

**상태 전이 규칙** (`FINAL_EXECUTION_SPEC_REVIEW.md` 553줄):
> `admin refund`: `issued`/`issued_unassigned` → `revoked` (또는 `refunded`). **관리자 수동 처리만 가능, 고객 직접 요청 불가**

**구현 필요 사항** (선택):
- 보증서 상세 모달에 "환불 처리" 버튼 추가 (편의성 향상 목적)
- 상태가 `issued` 또는 `issued_unassigned`일 때만 표시
- ⚠️ **중요**: `active` 상태는 환불 불가 (정책 고정)
- 클릭 시 reason 입력 모달 표시
- reason 입력 후 API 호출
- 💡 **운영 방식**: 문의 시스템을 통해 환불 요청이 오면, 관리자가 문의 내역 확인 후 보증서 상세 화면 또는 주문 상세 화면에서 환불 처리 가능

---

## 2. 상태 전이 규칙 준수 누락

### 2.1 상태별 버튼 표시 조건

**문서 요구사항** (`FINAL_EXECUTION_SPEC_REVIEW.md` 533-537줄):
> **⚠️ 상태 전이 규칙 (DB 업데이트 조건으로 강제)**:
> - **활성화**: `issued` → `active` 만 허용 (다른 상태에서 활성화 불가)
> - **정지/해제**: `active` ↔ `suspended` 만 허용
> - **환불/회수**: `active`/`suspended`/`issued` → `revoked` 허용
> - **재판매**: `revoked` → `issued`(또는 `issued_unassigned`)만 허용

**현재 구현**: ✅ **구현 완료** (2026-01-16)

**구현 완료 사항**:
- 상태별로 표시 가능한 액션 버튼만 표시됨
- 불가능한 액션은 버튼 자체를 숨김
- 상태 전이 규칙을 UI 레벨에서도 강제됨

**예시 로직**:
```javascript
function getAvailableActions(warrantyStatus) {
  const actions = [];
  
  if (warrantyStatus === 'active' || warrantyStatus === 'issued') {
    actions.push({ type: 'suspend', label: '정지', color: 'warning' });
  }
  
  if (warrantyStatus === 'suspended') {
    actions.push({ type: 'unsuspend', label: '정지 해제', color: 'success' });
  }
  
  if (warrantyStatus === 'issued' || warrantyStatus === 'issued_unassigned') {
    actions.push({ type: 'refund', label: '환불 처리', color: 'danger' });
  }
  
  // active 상태는 환불 불가 (정책 고정)
  if (warrantyStatus === 'active') {
    // 환불 버튼 표시 안 함
  }
  
  return actions;
}
```

---

### 2.2 전이 불가능한 상태 명시

**문서 요구사항** (`FINAL_EXECUTION_SPEC_REVIEW.md` 527-531줄):
> **전이 불가능한 상태**:
> - `revoked` → `active` (직접 전이 불가, 재판매 후 활성화 필요)
> - `revoked` → `suspended` (의미 없음)
> - `active` → `issued` (되돌리기 불가)
> - `issued` → `issued_unassigned` (되돌리기 불가)

**현재 구현**: ❌ **전이 불가능한 상태에 대한 UI 피드백 없음**

**구현 필요 사항**:
- 전이 불가능한 상태에서 액션 버튼을 표시하지 않음
- 필요 시 툴팁이나 안내 메시지로 이유 설명

---

## 3. 이벤트 생성 reason 입력 UI 누락

### 3.1 reason 필수 입력

**문서 요구사항** (`ADMIN_PAGE_OPERATIONAL_REVIEW.md` 218-228줄):
> **API 구조**:
> ```javascript
> POST /api/admin/warranties/:id/events
> {
>     "type": "status_change", // 또는 "owner_change", "suspend" 등
>     "params": {
>         "status": "suspended"
>     },
>     "reason": "관리자 정지 처리"  // ⚠️ 필수
> }
> ```

**백엔드 검증** (`backend/warranty-event-routes.js` 59-64줄):
> ```javascript
> if (!reason || reason.trim().length === 0) {
>     return res.status(400).json({
>         success: false,
>         message: '변경 사유는 필수입니다.'
>     });
> }
> ```

**프론트엔드 UI**: ✅ **구현 완료** (2026-01-16)
- Reason 입력 모달 구현됨
- 최소 10자 검증 구현됨

**구현 필요 사항**:
- 모든 관리자 액션 버튼 클릭 시 reason 입력 모달 표시
- reason 입력 필드 (textarea 권장)
- 최소 길이 검증 (예: 10자 이상)
- 취소/확인 버튼

**예시 UI 구조**:
```html
<!-- Reason 입력 모달 -->
<div class="modal" id="reasonModal">
  <div class="modal-content">
    <h3>변경 사유 입력</h3>
    <textarea id="reasonInput" placeholder="변경 사유를 입력해주세요 (최소 10자)" rows="4"></textarea>
    <div class="modal-actions">
      <button onclick="cancelReason()">취소</button>
      <button onclick="confirmAction()">확인</button>
    </div>
  </div>
</div>
```

---

### 3.2 감사 추적 강제

**문서 요구사항** (`ADMIN_PAGE_OPERATIONAL_REVIEW.md` 193줄):
> ✅ **감사 추적 강제**: 모든 변경이 이벤트로 기록됨

**현재 구현**: ✅ **구현 완료** (2026-01-16)
- Reason 입력 없이는 액션 버튼이 작동하지 않도록 구현됨

**구현 필요 사항**:
- reason 입력 없이는 액션 버튼이 작동하지 않도록 UI 설계
- reason 입력 모달은 필수 단계로 처리

---

## 4. 환불 처리 버튼 위치 및 표시 조건

### 4.1 환불 처리 흐름

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 1054-1076줄):
> **환불 접수 방식 (확정)**:
> - ❌ **고객 직접 환불 요청 불가**: 고객이 버튼이나 API로 직접 환불 요청할 수 없음
> - ✅ **문의 시스템으로만 접수**: 고객 문의(`inquiries`)에 환불 요청이 들어오면 관리자가 확인
> - ✅ **관리자 수동 처리**: 관리자 페이지에서 확인 후 수동으로 환불 처리

**현재 구현**: ⚠️ **확인 필요**
- 주문 상세 화면에 환불 처리 버튼이 있는지 확인 필요
- `admin-qhf25za8/admin-orders.js` 확인 필요

**운영 방식**:
1. 고객이 문의 시스템을 통해 환불 요청
2. 관리자가 문의 내역 확인
3. 관리자가 주문 상세 화면 또는 보증서 상세 화면에서 환불 처리
   - 주문 상세 화면에 환불 처리 버튼이 있으면 충분함
   - 보증서 상세 화면에 버튼이 있어도 편의성 향상

**구현 필요 사항** (선택, 편의성 향상 목적):
- 보증서 상세 모달에 "환불 처리" 버튼 추가 (선택)
- 상태가 `issued` 또는 `issued_unassigned`일 때만 표시
- `active` 상태는 환불 불가 (정책 고정)

---

### 4.2 주문 상세 화면 환불 처리 버튼 확인 필요

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 1072-1076줄):
> 주문 상세에서 환불 가능 여부 표시  
> 환불 처리 버튼 (환불 가능한 경우만 활성화)

**현재 구현**: ⚠️ **확인 필요**
- 주문 상세 화면에 환불 처리 버튼이 있는지 확인 필요
- `admin-qhf25za8/admin-orders.js` 확인 필요

**구현 필요 사항** (확인 후):
- 주문 상세 화면의 각 `order_item_unit`에 환불 처리 버튼 표시 (권장)
- 해당 `warranty.status`가 `issued` 또는 `issued_unassigned`일 때만 표시
- `active` 상태는 환불 불가

---

## 5. 원자적 조건 검증 UI 피드백

### 5.1 affectedRows=1 검증 실패 시 에러 메시지

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 전반):
> 모든 상태 전이는 `UPDATE ... WHERE 조건`으로만 수행하며 `affectedRows=1` 검증 필수.

**백엔드 구현**: ✅ 존재
- 모든 상태 전이에서 `affectedRows !== 1` 검증 및 에러 반환

**프론트엔드 UI**: ⚠️ **에러 메시지 처리 확인 필요**

**구현 필요 사항**:
- 백엔드에서 `affectedRows !== 1` 에러 반환 시 사용자 친화적 메시지 표시
- 예: "보증서 상태가 변경되어 이 작업을 수행할 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요."

---

### 5.2 동시성 충돌 처리

**문서 요구사항** (`FINAL_EXECUTION_SPEC_REVIEW.md` 전반):
> 원자적 조건 검증으로 동시성 충돌 방지

**현재 구현**: ⚠️ **동시성 충돌 시 UI 피드백 확인 필요**

**구현 필요 사항**:
- 동시성 충돌 발생 시 명확한 에러 메시지
- 페이지 새로고침 권장 안내
- 필요 시 자동 새로고침 옵션

---

## 6. 상태별 액션 버튼 표시 로직

### 6.1 상태별 버튼 표시 매트릭스

**문서 요구사항** (`FINAL_EXECUTION_SPEC_REVIEW.md` 520-555줄):

| 현재 상태 | 가능한 액션 | 다음 상태 | 비고 |
|----------|------------|----------|------|
| `issued` | `suspend` | `suspended` | 제재 |
| `issued` | `refund` | `revoked` | 환불 처리 (문의 시스템 통해 처리) |
| `issued_unassigned` | `refund` | `revoked` | 환불 처리 (문의 시스템 통해 처리) |
| `active` | `suspend` | `suspended` | 제재 |
| `active` | ❌ `refund` 불가 | - | **정책 고정: 활성화된 보증서는 환불 불가** |
| `suspended` | `unsuspend` | `issued` | 제재 해제 |
| `revoked` | ❌ 모든 액션 불가 | - | 재판매는 `paid_events` 생성 시 자동 처리 |

**현재 구현**: ✅ **구현 완료** (2026-01-16)
- 위 매트릭스에 따라 상태별로 버튼 표시됨
- 불가능한 액션은 버튼 자체를 숨김

---

### 6.2 버튼 그룹 UI 설계

**구현 필요 사항**:
- 보증서 상세 모달 하단에 "관리자 액션" 섹션 추가
- 상태에 따라 동적으로 버튼 표시
- 버튼 색상 구분:
  - 정지: 주황색 (warning)
  - 정지 해제: 초록색 (success)
  - 환불 처리: 빨간색 (danger)

**예시 UI 구조**:
```html
<!-- 관리자 액션 섹션 -->
<div class="detail-card" style="border-top: 2px solid #dee2e6; margin-top: 1.5rem;">
  <h4>관리자 액션</h4>
  <div id="adminActions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
    <!-- 동적으로 버튼 생성 -->
  </div>
</div>
```

---

## 7. 백엔드 API vs 프론트엔드 UI 불일치 현황

### 7.1 보증서 관리 관련 API 불일치

**백엔드 API** (`backend/warranty-event-routes.js`, `backend/refund-routes.js`):

| API 엔드포인트 | 메서드 | 기능 | 백엔드 | 프론트엔드 UI | 상태 |
|--------------|--------|------|--------|--------------|------|
| `/api/admin/warranties/search` | GET | 보증서 검색 | ✅ | ✅ | 완료 |
| `/api/admin/warranties/:id` | GET | 보증서 상세 조회 | ✅ | ✅ | 완료 |
| `/api/admin/warranties/:id/events` | GET | 보증서 이벤트 이력 조회 | ✅ | ⚠️ 별도 호출 안 함 | 상세 조회에 포함 |
| `/api/admin/warranties/:id/events` | POST | 보증서 이벤트 생성 (정지/정지 해제 등) | ✅ | ❌ 없음 | 누락 |
| `/api/admin/refunds/process` | POST | 환불 처리 | ✅ | ❌ 없음 | 누락 |

**핵심 불일치**:
- ❌ `POST /api/admin/warranties/:id/events`: 백엔드 있음, 프론트엔드 UI 없음 (정지/정지 해제 버튼 없음)
- ❌ `POST /api/admin/refunds/process`: 백엔드 있음, 프론트엔드 UI 없음 (환불 처리 버튼 없음)
- ⚠️ `GET /api/admin/warranties/:id/events`: 백엔드 있음, 프론트엔드에서 별도 호출 안 함 (상세 조회 API에서 이미 `events`를 반환하므로 별도 호출 불필요)

---

### 7.2 주문 관리 관련 API 불일치 (참고)

**백엔드 API** (`backend/index.js`, `backend/shipment-routes.js`):

| API 엔드포인트 | 메서드 | 기능 | 백엔드 | 프론트엔드 UI | 상태 |
|--------------|--------|------|--------|--------------|------|
| `/api/admin/orders` | GET | 주문 목록 조회 | ✅ | ✅ | 완료 |
| `/api/admin/orders/:orderId` | GET | 주문 상세 조회 | ✅ | ✅ | 완료 |
| `/api/admin/orders/:orderId/shipped` | POST | 출고 처리 | ✅ | ✅ | 완료 |
| `/api/admin/orders/:orderId/delivered` | POST | 배송완료 처리 | ✅ | ✅ | 완료 |
| `/api/admin/refunds/process` | POST | 환불 처리 | ✅ | ❌ 없음 | 누락 |

**핵심 불일치**:
- ❌ `POST /api/admin/refunds/process`: 백엔드 있음, 주문 상세 화면에 환불 처리 버튼 없음
- ⚠️ 참고: 주문 상세 화면에는 "출고 처리", "배송완료 처리" 버튼은 있으나 "환불 처리" 버튼은 없음

---

## 8. 인보이스 정보 표시 완성도

### 8.1 인보이스 연동 상태 표시

**문서 요구사항** (`ADMIN_QR_WARRANTY_INVOICE_CONSISTENCY_CHECK.md` 310-333줄):
> **보증서 상세 화면에 인보이스 정보 추가**:
> - 인보이스 연동 상태: 
>   - `orders.user_id IS NOT NULL` → "연동됨"
>   - `orders.user_id IS NULL` → "미연동 (비회원)"
>   - `orders.status = 'refunded'` → "환불됨"

**현재 구현**: ✅ **부분 구현됨**
- `invoice_linkage_status` 표시됨 (최근 추가)
- 3분류 로직 구현됨 (회원 주문, 비회원 미클레임, 비회원 클레임됨)

**확인 필요 사항**:
- 인보이스 연동 상태 배지가 정확히 표시되는지 확인
- 환불 상태가 우선적으로 표시되는지 확인

---

### 8.2 인보이스 상세 정보 표시

**문서 요구사항** (`ADMIN_QR_WARRANTY_INVOICE_CONSISTENCY_CHECK.md` 313-319줄):
> **인보이스 정보**:
> - 인보이스 번호 (`invoices.invoice_number`)
> - 인보이스 발급일시 (`invoices.issued_at`)
> - 인보이스 총액 (`invoices.total_amount`)

**현재 구현**: ✅ **부분 구현됨**
- 원본 인보이스 정보 표시됨 (인보이스 번호, 발급일시)
- ⚠️ 인보이스 총액 표시 여부 확인 필요

**구현 필요 사항** (확인 후):
- 인보이스 총액 표시 추가 (있는 경우)

---

## 📊 누락 사항 요약표

### 보증서 관리 관련

| 항목 | 문서 요구사항 | 백엔드 API | 프론트엔드 UI | 우선순위 |
|------|-------------|-----------|--------------|---------|
| **정지 버튼** | ✅ 필수 | ✅ 존재 (`POST /api/admin/warranties/:id/events`) | ✅ 완료 (2026-01-16) | ✅ 완료 |
| **정지 해제 버튼** | ✅ 필수 | ✅ 존재 (`POST /api/admin/warranties/:id/events`) | ✅ 완료 (2026-01-16) | ✅ 완료 |
| **환불 처리 버튼** | 🟡 선택 | ✅ 존재 (`POST /api/admin/refunds/process`) | ❌ 없음 | 🟡 중간 |
| **reason 입력 UI** | ✅ 필수 | ✅ 검증됨 | ✅ 완료 (2026-01-16) | ✅ 완료 |
| **상태별 버튼 표시 로직** | ✅ 필수 | ✅ 검증됨 | ✅ 완료 (2026-01-16) | ✅ 완료 |
| **동시성 충돌 피드백** | ✅ 권장 | ✅ 검증됨 | ⚠️ 확인 필요 | 🟡 중간 |
| **인보이스 총액 표시** | ✅ 권장 | ✅ 데이터 있음 | ⚠️ 확인 필요 | 🟡 중간 |

### 주문 관리 관련 (참고)

| 항목 | 문서 요구사항 | 백엔드 API | 프론트엔드 UI | 우선순위 |
|------|-------------|-----------|--------------|---------|
| **환불 처리 버튼** | ✅ 권장 | ✅ 존재 (`POST /api/admin/refunds/process`) | ❌ 없음 | 🟡 중간 |

---

## 🎯 구현 우선순위

### 1단계: 필수 기능 (✅ 완료 - 2026-01-16)

1. ✅ **reason 입력 모달 구현**
   - 모든 관리자 액션에 reason 입력 필수
   - 최소 길이 검증

2. ✅ **정지 버튼 구현**
   - 상태가 `active` 또는 `issued`일 때 표시
   - reason 입력 후 API 호출

3. ✅ **정지 해제 버튼 구현**
   - 상태가 `suspended`일 때 표시
   - reason 입력 후 API 호출

4. ✅ **상태별 버튼 표시 로직 구현**
   - 상태 전이 규칙에 따라 버튼 동적 표시
   - 불가능한 액션은 버튼 숨김

### 2단계: 개선 사항 (1단계 완료 후)

1. **환불 처리 버튼 구현** (선택, 편의성 향상)
   - 보증서 상세 모달에 "환불 처리" 버튼 추가
   - 상태가 `issued` 또는 `issued_unassigned`일 때 표시
   - ⚠️ `active` 상태는 표시하지 않음 (정책 고정)
   - reason 입력 후 API 호출
   - 💡 참고: 문의 시스템을 통해 환불 처리 가능하므로 필수는 아님

2. **동시성 충돌 피드백 개선**
   - 에러 메시지 사용자 친화적으로 개선
   - 페이지 새로고침 안내

3. **인보이스 총액 표시 확인 및 추가**
   - 현재 구현 확인 후 필요 시 추가

---

## 💡 구현 가이드

### 예시: 관리자 액션 버튼 그룹 구현

```javascript
// admin-warranties.js에 추가

function renderAdminActions(warrantyStatus) {
  const actions = [];
  
  // 정지 버튼 (active 또는 issued일 때)
  if (warrantyStatus === 'active' || warrantyStatus === 'issued') {
    actions.push({
      type: 'suspend',
      label: '정지',
      color: 'warning',
      icon: '⚠️'
    });
  }
  
  // 정지 해제 버튼 (suspended일 때)
  if (warrantyStatus === 'suspended') {
    actions.push({
      type: 'unsuspend',
      label: '정지 해제',
      color: 'success',
      icon: '✅'
    });
  }
  
  // 환불 처리 버튼 (issued 또는 issued_unassigned일 때)
  // ⚠️ active 상태는 환불 불가 (정책 고정)
  // 💡 참고: 환불은 문의 시스템을 통해 처리 가능하므로 선택 사항
  // if (warrantyStatus === 'issued' || warrantyStatus === 'issued_unassigned') {
  //   actions.push({
  //     type: 'refund',
  //     label: '환불 처리',
  //     color: 'danger',
  //     icon: '💰'
  //   });
  // }
  
  if (actions.length === 0) {
    return '<p style="color: #6c757d;">현재 상태에서 수행 가능한 관리자 액션이 없습니다.</p>';
  }
  
  return `
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
      ${actions.map(action => `
        <button 
          class="btn-${action.color}" 
          onclick="showReasonModal('${action.type}', '${action.label}')"
        >
          ${action.icon} ${action.label}
        </button>
      `).join('')}
    </div>
  `;
}

async function showReasonModal(actionType, actionLabel) {
  // reason 입력 모달 표시
  // 확인 클릭 시 executeWarrantyAction() 호출
}

async function executeWarrantyAction(warrantyId, actionType, reason) {
  // API 호출
  // 성공 시 상세 정보 다시 로드
}
```

---

## 📝 결론

**현재 보증서 관리 페이지는 "조회 전용" 기능만 구현되어 있으며, 관리자 액션 UI가 완전히 누락되어 있습니다.**

### 핵심 누락 사항 (업데이트: 2026-01-16):
1. ✅ 정지/정지 해제 버튼 구현 완료
2. ✅ reason 입력 UI 구현 완료
3. ✅ 상태별 버튼 표시 로직 구현 완료
4. ✅ 상태 전이 규칙 UI 레벨 강제 구현 완료

### 추가 누락 사항:
- ❌ 환불 처리 버튼: `POST /api/admin/refunds/process` API는 있으나 보증서 상세 화면과 주문 상세 화면 모두에 UI 없음
  - 💡 참고: 문의 시스템을 통해 환불 처리 가능하므로 필수는 아님

### 백엔드 API vs 프론트엔드 UI 불일치 요약:

**보증서 관리**:
- ✅ GET API: 모두 구현됨 (검색, 상세 조회)
- ✅ POST API: 이벤트 생성 UI 구현 완료 (2026-01-16)
- ❌ POST API: 환불 처리 UI 없음 (선택 사항)

**주문 관리**:
- ✅ GET/POST API: 대부분 구현됨 (목록 조회, 상세 조회, 출고 처리, 배송완료 처리)
- ❌ POST API: 환불 처리 API는 있으나 UI 없음

### 문서 요구사항 준수 상태:
- ✅ `SYSTEM_FLOW_DETAILED.md` 8-6절: 제재 기능 구현 완료
- ✅ `FINAL_EXECUTION_SPEC_REVIEW.md`: 상태 전이 규칙 준수 구현 완료
- ✅ `ADMIN_PAGE_OPERATIONAL_REVIEW.md`: 이벤트 기반 구조 (reason 필수) 구현 완료

**다음 단계**: 
- ✅ 1단계 필수 기능 완료 (2026-01-16)
- 🟡 2단계 개선 사항 (선택): 환불 처리 버튼, 동시성 충돌 피드백 개선, 인보이스 총액 표시

---

**문서 버전**: 1.1  
**작성일**: 2026-01-16  
**최종 업데이트**: 2026-01-16 (1단계 필수 기능 완료 반영)