# 다음 단계 구현 가이드

**작성일**: 2026-01-16  
**목적**: 옵션 1과 옵션 2 작업을 바로 진행할 수 있도록 구체적인 가이드 제공

---

## 📋 작업 옵션 개요

### 옵션 1: 보증서 관리 페이지 개선 (2단계) - 미완성 부분 완성
**성격**: 이미 시작한 기능의 남은 부분 구현  
**상태**: 1단계 완료, 2단계 미완성  
**예상 소요 시간**: 2-3시간

### 옵션 2: 새로운 기능 구현 (IMPLEMENTATION_ROADMAP.md) - 새로운 기능 개발
**성격**: 계획된 새로운 기능 구현  
**상태**: Phase별로 진행 상태 다름  
**예상 소요 시간**: Phase별 상이

---

## 🎯 옵션 1: 보증서 관리 페이지 개선 (2단계)

### 현재 상태
- ✅ 1단계 필수 기능 완료 (2026-01-16)
  - 정지/정지 해제 버튼 구현
  - Reason 입력 모달 구현
  - 상태별 버튼 표시 로직 구현
- ❌ 2단계 개선 사항 미완성

### 구현 항목

#### 1. 환불 처리 버튼 추가

**백엔드 API**: ✅ 존재
- `POST /api/admin/refunds/process`
- Body: `{ warranty_id: number, reason: string }`
- Response: `{ success: boolean, message: string, data: { warranty_id, order_id, credit_note_number, ... } }`

**구현 필요 사항**:
1. `admin-warranties.js`의 `renderAdminActions()` 함수에 환불 버튼 추가
   - 조건: `warrantyStatus === 'issued' || warrantyStatus === 'issued_unassigned'`
   - ⚠️ `active` 상태는 표시하지 않음 (정책 고정)
2. `executeWarrantyAction()` 함수에 `refund` 타입 처리 추가
   - API 호출: `POST /api/admin/refunds/process`
   - Body: `{ warranty_id: currentWarrantyId, reason: reason }`
3. 성공 시 상세 정보 자동 새로고침

**참고 파일**:
- `backend/refund-routes.js` (117-480줄): API 구현
- `admin-qhf25za8/admin-warranties.js`: 프론트엔드 구현 위치

**구현 예시**:
```javascript
// renderAdminActions() 함수에 추가
if (warrantyStatus === 'issued' || warrantyStatus === 'issued_unassigned') {
  actions.push({
    type: 'refund',
    label: '환불 처리',
    color: 'danger',
    icon: '💰'
  });
}

// executeWarrantyAction() 함수에 추가
if (actionType === 'refund') {
  response = await fetch(`${API_BASE}/admin/refunds/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      warranty_id: warrantyId,
      reason: reason
    })
  });
}
```

---

#### 2. 동시성 충돌 피드백 개선

**현재 상태**: ⚠️ 기본 에러 처리만 있음

**구현 필요 사항**:
1. `executeWarrantyAction()` 함수의 에러 처리 개선
   - `affectedRows !== 1` 에러 감지
   - 사용자 친화적 메시지 표시
   - 페이지 새로고침 안내

**구현 예시**:
```javascript
catch (error) {
  console.error('보증서 액션 실행 실패:', error);
  
  // 동시성 충돌 감지
  if (error.message.includes('상태') || error.message.includes('변경') || 
      error.message.includes('affectedRows') || error.message.includes('ALREADY_REFUNDED')) {
    alert('보증서 상태가 변경되어 이 작업을 수행할 수 없습니다.\n\n페이지를 새로고침 후 다시 시도해주세요.');
    // 자동 새로고침 옵션
    if (confirm('지금 새로고침하시겠습니까?')) {
      location.reload();
    }
  } else {
    alert(`처리 중 오류가 발생했습니다: ${error.message}`);
  }
}
```

---

#### 3. 인보이스 총액 표시 확인 및 추가

**현재 상태**: ⚠️ 확인 필요

**확인 사항**:
1. `backend/warranty-event-routes.js`의 보증서 상세 조회 API 확인
   - `invoices.original.total_amount` 반환 여부 확인
2. `admin-warranties.js`의 `renderWarrantyDetail()` 함수 확인
   - 인보이스 총액 표시 여부 확인

**구현 필요 사항** (확인 후):
- 인보이스 총액이 API에서 반환되지만 UI에 표시되지 않는 경우
  - `renderWarrantyDetail()` 함수의 인보이스 정보 섹션에 총액 추가
- 인보이스 총액이 API에서 반환되지 않는 경우
  - 백엔드 API 수정 필요 (별도 작업)

**참고 파일**:
- `backend/warranty-event-routes.js`: 보증서 상세 조회 API
- `admin-qhf25za8/admin-warranties.js`: 프론트엔드 렌더링

---

### 구현 순서

1. **환불 처리 버튼 추가** (우선순위 높음)
   - 백엔드 API 존재, 프론트엔드 UI만 추가
   - 예상 소요: 30분

2. **동시성 충돌 피드백 개선** (우선순위 중간)
   - 에러 처리 개선
   - 예상 소요: 20분

3. **인보이스 총액 표시 확인 및 추가** (우선순위 낮음)
   - 현재 상태 확인 후 필요 시 추가
   - 예상 소요: 20분

---

## 🚀 옵션 2: 새로운 기능 구현 (IMPLEMENTATION_ROADMAP.md)

### Phase별 상태 요약

#### Phase 1: 비회원 주문 기반 구축
**상태**: ❌ 미완성 (백엔드/프론트엔드 모두 미완성)  
**작업 내용**:
- DB 스키마 변경 (`orders.guest_id`, `guest_orders` 테이블)
- 백엔드: 비회원 주문 생성/조회/Claim API
- 프론트엔드: 비회원 주문 지원 (체크아웃, 주문 상세)

**참고 문서**: `IMPLEMENTATION_ROADMAP.md` 33-96줄

---

#### Phase 2: 재고 관리 시스템
**상태**: ⚠️ 부분 완료 (DB 완료, 백엔드 로직 미완성)  
**작업 내용**:
- ✅ DB 스키마 완료 (`stock_units`, `order_item_units` 등)
- ❌ 재고 등록 API (`/api/admin/stock/import`)
- ❌ 재고 배정 로직 (결제 성공 시)
- ❌ 재고 상태 관리 API

**참고 문서**: `IMPLEMENTATION_ROADMAP.md` 99-141줄

---

#### Phase 3: 디지털 인보이스 시스템
**상태**: ⚠️ 부분 완료 (DB 완료, 백엔드 로직 일부 완료)  
**작업 내용**:
- ✅ DB 스키마 완료 (`invoices` 테이블)
- ✅ 인보이스 생성 로직 완료 (`processPaidOrder()`)
- ❌ 이메일 발송 로직 (MailerSend 연동)
- ❌ PDF 생성 또는 링크 생성

**참고 문서**: `IMPLEMENTATION_ROADMAP.md` 143-214줄

---

#### Phase 4: 보증서 상태 관리 개선
**상태**: ⚠️ 부분 완료 (DB 완료, 백엔드 로직 일부 완료)  
**작업 내용**:
- ✅ DB 스키마 완료 (`warranties.status`, `warranty_events` 등)
- ✅ 보증서 생성 로직 완료 (`processPaidOrder()`)
- ✅ 보증서 정지/정지 해제 API 완료
- ❌ 보증서 활성화 API (`POST /api/warranties/:id/activate`)
- ❌ QR 스캔 로직 수정 (warranty 생성 제거, 조회만)

**참고 문서**: `IMPLEMENTATION_ROADMAP.md` 216-260줄, `WORK_STATUS_SUMMARY.md` 167-183줄

---

#### Phase 5: 양도 시스템
**상태**: ❌ 미완성  
**작업 내용**:
- ✅ DB 스키마 완료 (`warranty_transfers` 테이블)
- ❌ 양도 요청 API (`POST /api/warranties/:id/transfer`)
- ❌ 양도 수락 API (`POST /api/warranty/transfer/accept`)
- ❌ 양도 UI (프론트엔드)

**참고 문서**: `IMPLEMENTATION_ROADMAP.md` 262-293줄

---

#### Phase 6: 환불 시스템
**상태**: ⚠️ 부분 완료 (백엔드 API 완료, 프론트엔드 UI 미완성)  
**작업 내용**:
- ✅ 환불 처리 로직 완료 (`POST /api/admin/refunds/process`)
- ✅ credit_note 발급 로직 완료
- ❌ 환불 처리 UI (보증서/주문 상세 화면) - 옵션 1에서 처리 예정

**참고 문서**: `IMPLEMENTATION_ROADMAP.md` 295-320줄

---

#### Phase 7: 관리자 페이지 개선
**상태**: ⚠️ 진행 중  
**작업 내용**:
- ✅ 보증서 관리 페이지 기본 기능 완료
- ✅ 보증서 관리 페이지 1단계 필수 기능 완료
- ❌ 보증서 관리 페이지 2단계 개선 사항 - 옵션 1에서 처리 예정
- ❌ 주문 관리 페이지 환불 처리 버튼 추가

**참고 문서**: `WARRANTY_MANAGEMENT_MISSING_FEATURES.md`

---

### Phase별 우선순위 추천

1. **Phase 4 (보증서 활성화 API, QR 스캔 로직 수정)** - 높음
   - 보증서 시스템의 핵심 기능
   - DB 스키마 완료, 백엔드 로직만 추가

2. **Phase 1 (비회원 주문)** - 높음
   - 전체 시스템의 기반 기능
   - DB 스키마부터 프론트엔드까지 전반적 구현 필요

3. **Phase 2 (재고 관리)** - 중간
   - DB 완료, 백엔드 로직만 추가

4. **Phase 5 (양도 시스템)** - 중간
   - DB 완료, 백엔드/프론트엔드 구현 필요

5. **Phase 3 (디지털 인보이스 이메일/PDF)** - 낮음
   - 기본 기능 완료, 부가 기능만 추가

---

## 📝 구현 체크리스트

### 옵션 1 (우선 진행)
- [ ] 환불 처리 버튼 추가
- [ ] 동시성 충돌 피드백 개선
- [ ] 인보이스 총액 표시 확인 및 추가

### 옵션 2 (향후 진행)
- [ ] Phase 4: 보증서 활성화 API 구현
- [ ] Phase 4: QR 스캔 로직 수정
- [ ] Phase 1: 비회원 주문 기반 구축
- [ ] Phase 2: 재고 관리 시스템 완성
- [ ] Phase 5: 양도 시스템 구현
- [ ] Phase 3: 인보이스 이메일/PDF 기능 추가

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
