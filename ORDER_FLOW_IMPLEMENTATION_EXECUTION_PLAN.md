# 주문 흐름 미구현 항목 실행 계획

## 📋 개요

`ORDER_FLOW_IMPLEMENTATION_STATUS.md`와 `SYSTEM_FLOW_DETAILED.md`를 비교 분석하여 확인된 미구현 항목 3가지를 순차적으로 구현합니다.

---

## 🎯 우선순위별 구현 계획

### Phase 1: 보증서 활성화 경고 문구 추가 (우선순위 1)

**목표**: 보증서 활성화 시 사용자에게 명확한 경고 문구 표시

**작업 내용**:
1. **프론트엔드 모달 UI 추가** (`my-warranties.html`)
   - 활성화 버튼 클릭 시 모달 표시
   - 모달에 경고 문구 2가지 표시:
     - 미활성 상태 경고: "보증서 미활성 상태에서만 전자상거래법에 따른 청약철회가 가능합니다."
     - 활성화 시 경고: "보증서를 활성화하면 해당 상품은 사용 개시로 간주되어 새 상품으로 재판매가 불가능합니다. 이에 따라 교환 및 환불이 제한됩니다."
   - 동의 체크박스 추가
   - "취소" / "동의하고 활성화" 버튼

2. **프론트엔드 로직 수정** (`my-warranties.js`)
   - 기존 `confirm()` 대신 모달 표시
   - 체크박스 동의 확인 후 활성화 API 호출
   - 모달 닫기/취소 처리

**예상 소요 시간**: 2-3시간

**파일 수정**:
- `my-warranties.html` (모달 HTML 추가)
- `my-warranties.js` (모달 로직 추가)

---

### Phase 2: 인보이스 이메일 발송 (우선순위 2)

**목표**: Paid 처리 완료 후 인보이스 이메일 자동 발송

**작업 내용**:
1. **이메일 함수 추가** (`backend/mailer.js`)
   - `sendInvoiceEmail` 함수 구현
   - 이메일 내용:
     - 주문번호
     - 주문 상세 정보 (상품명, 수량, 가격 등)
     - 인보이스 링크 (조회 전용 토큰 포함)
     - 배송 상태 (있는 경우)
   - 회원/비회원 구분하여 링크 생성:
     - 회원: `/invoice-detail.html?invoiceId=xxx`
     - 비회원: `/api/guest/orders/session?token=xxx` (guest_order_access_token 포함)

2. **이메일 발송 호출** (`backend/payments-routes.js` 또는 `backend/utils/paid-order-processor.js`)
   - `processPaidOrder()` 트랜잭션 외부에서 이메일 발송 호출
   - 회원 주문: 회원 이메일로 발송
   - 비회원 주문: 주문 시 입력한 이메일로 발송
   - `invoices.emailed_at` 업데이트 (이메일 발송 성공 시)

3. **에러 처리**
   - 이메일 발송 실패 시에도 주문 처리는 완료 (트랜잭션 외부)
   - 로깅 및 에러 처리

**예상 소요 시간**: 4-5시간

**파일 수정**:
- `backend/mailer.js` (sendInvoiceEmail 함수 추가)
- `backend/payments-routes.js` (이메일 발송 호출 추가)
- 또는 `backend/utils/paid-order-processor.js` (이메일 발송 호출 추가)

**참고 문서**: `SYSTEM_FLOW_DETAILED.md` 2-2, 3-1 섹션

---

### Phase 3: 비회원 인보이스 조회 (우선순위 3)

**목표**: 비회원이 인보이스를 조회할 수 있는 API 및 프론트엔드 구현

**작업 내용**:
1. **백엔드 API 추가** (`backend/invoice-routes.js`)
   - `GET /api/guest/invoices/:invoiceId` API 추가
     - `guest_order_access_token` 검증 (또는 `guest_order_sessions` 쿠키 검증)
     - 비회원 주문 확인 (`orders.user_id IS NULL`)
     - 인보이스 상세 정보 반환 (회원 API와 동일한 형식)
   - `GET /api/guest/invoices` API 추가 (목록 조회)
     - `guest_order_access_token`으로 여러 주문의 인보이스 목록 조회
     - 또는 세션 기반으로 현재 세션의 주문 인보이스 목록 조회

2. **프론트엔드 추가** (`guest/invoice-detail.html`, `guest/invoice-detail.js`)
   - 비회원 전용 인보이스 상세 페이지
   - 회원 인보이스 상세 페이지와 동일한 디자인
   - 세션 토큰 또는 `guest_order_access_token`으로 인증

**예상 소요 시간**: 5-6시간

**파일 수정/추가**:
- `backend/invoice-routes.js` (비회원 인보이스 조회 API 추가)
- `guest/invoice-detail.html` (새 파일)
- `guest/invoice-detail.js` (새 파일)

**참고 문서**: `SYSTEM_FLOW_DETAILED.md` (비회원 인보이스 조회 명시되어 있으나 구현 안 됨)

---

## 📊 전체 일정

| Phase | 작업 내용 | 예상 소요 시간 | 우선순위 |
|-------|----------|--------------|---------|
| Phase 1 | 보증서 활성화 경고 문구 추가 | 2-3시간 | 1 |
| Phase 2 | 인보이스 이메일 발송 | 4-5시간 | 2 |
| Phase 3 | 비회원 인보이스 조회 | 5-6시간 | 3 |
| **총계** | | **11-14시간** | |

---

## ✅ 검증 체크리스트

### Phase 1 검증
- [ ] 활성화 버튼 클릭 시 모달 표시 확인
- [ ] 경고 문구 2가지 모두 표시 확인
- [ ] 동의 체크박스 없으면 활성화 불가 확인
- [ ] 동의 체크박스 체크 후 활성화 API 호출 확인
- [ ] 모달 취소 시 활성화 안 됨 확인

### Phase 2 검증
- [ ] 회원 주문 완료 시 인보이스 이메일 발송 확인
- [ ] 비회원 주문 완료 시 인보이스 이메일 발송 확인
- [ ] 이메일 내용 (주문번호, 상세 정보, 링크) 확인
- [ ] 회원 인보이스 링크 정상 작동 확인
- [ ] 비회원 인보이스 링크 정상 작동 확인
- [ ] `invoices.emailed_at` 업데이트 확인
- [ ] 이메일 발송 실패 시에도 주문 처리 완료 확인

### Phase 3 검증
- [ ] `GET /api/guest/invoices/:invoiceId` API 정상 작동 확인
- [ ] `GET /api/guest/invoices` API 정상 작동 확인
- [ ] `guest_order_access_token` 검증 확인
- [ ] 비회원 주문만 조회 가능 확인 (회원 주문 조회 불가)
- [ ] 프론트엔드 인보이스 상세 페이지 정상 표시 확인

---

## 🚀 시작 순서

1. **Phase 1부터 시작**: 사용자 경험 개선이 가장 중요
2. **Phase 2 진행**: 핵심 기능 완성
3. **Phase 3 진행**: 편의 기능 추가

각 Phase 완료 후 테스트 및 검증을 진행한 후 다음 Phase로 진행합니다.
