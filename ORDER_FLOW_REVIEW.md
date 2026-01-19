# 주문 흐름 전체 점검 결과

## 📋 점검 일시
2026-01-XX

## ✅ 정상 작동하는 부분

### 1. 주문 생성 흐름
- ✅ **프론트엔드**: `checkout-script.js`, `checkout-payment.js`에서 주문 생성 API 호출
- ✅ **백엔드**: `POST /api/orders` (order-routes.js)
- ✅ **Idempotency**: 중복 주문 방지 구현됨
- ✅ **회원/비회원 구분**: `user_id` / `guest_id` 처리

### 2. 결제 확인 흐름
- ✅ **결제 확인**: `POST /api/payments/confirm` (payments-routes.js)
- ✅ **토스페이먼츠 연동**: 결제 확인 API 호출
- ✅ **결제 상태 관리**: `payments` 테이블에 저장

### 3. Paid 처리 흐름
- ✅ **paid_events 생성**: 별도 커넥션으로 생성 (autocommit)
- ✅ **processPaidOrder 호출**: 재고 배정, 주문 단위, 보증서, 인보이스 생성
- ✅ **락 순서 준수**: stock_units → orders → warranties → invoices
- ✅ **트랜잭션 관리**: 실패 시 롤백 처리

### 4. 인보이스 생성
- ✅ **createInvoiceFromOrder**: processPaidOrder 내부에서 호출
- ✅ **스냅샷 저장**: payload_json에 주문 정보 고정
- ✅ **인보이스 번호 생성**: PM-INV-YYMMDD-HHmm-{랜덤} 형식

### 5. 인보이스 조회 (회원)
- ✅ **GET /api/invoices/me**: 회원 인보이스 목록 조회
- ✅ **GET /api/invoices/:invoiceId**: 회원 인보이스 상세 조회
- ✅ **membership_id 조인**: users 테이블과 조인하여 membership_id 가져오기
- ✅ **결제 방법 조인**: payments 테이블과 조인하여 payment_method 가져오기

## ⚠️ 발견된 문제점

### 1. 비회원 주문 인보이스 조회 불가능

**문제 위치**: `backend/invoice-routes.js` - `GET /api/invoices/:invoiceId`

**문제 코드**:
```javascript
WHERE ${whereClause}
  AND o.user_id = ?  // ⚠️ 비회원 주문은 user_id가 NULL이므로 조회 불가
  AND i.status = 'issued'
```

**영향**:
- 비회원 주문의 경우 `orders.user_id`가 NULL이므로 인보이스를 조회할 수 없음
- 비회원은 `guest_order_access_token`을 통해 주문을 조회하지만, 인보이스 조회는 불가능

**해결 방안**:
1. 비회원 인보이스 조회 API 추가 (`GET /api/guest/invoices/:invoiceId`)
2. 또는 기존 API를 `optionalAuth`로 변경하고 `guest_order_access_token` 검증 추가

### 2. 인보이스 목록 조회 (비회원)

**문제 위치**: `backend/invoice-routes.js` - `GET /api/invoices/me`

**문제**:
- 현재는 `authenticateToken` 미들웨어로 회원만 조회 가능
- 비회원은 인보이스 목록을 조회할 수 없음

**해결 방안**:
- 비회원 인보이스 목록 조회 API 추가 (`GET /api/guest/invoices`)

## 🔍 추가 확인 필요 사항

### 1. 이메일 발송
- ✅ 주문 확인 이메일: `sendOrderConfirmationEmail` 호출 확인됨
- ❓ 인보이스 이메일: 인보이스 생성 후 이메일 발송 로직 확인 필요

### 2. 비회원 주문 처리
- ✅ `guest_order_access_tokens` 생성: processPaidOrder에서 처리
- ✅ `guest_order_sessions` 생성: 세션 토큰 교환 방식 구현됨
- ❓ 비회원 인보이스 조회: 미구현

### 3. 에러 처리
- ✅ processPaidOrder 실패 시 롤백 처리
- ✅ paid_events는 별도 커넥션으로 생성되어 보존됨
- ✅ 에러 로깅 상세하게 구현됨

## 📝 권장 수정 사항

### 우선순위 1: 비회원 인보이스 조회 API 추가

```javascript
// backend/invoice-routes.js에 추가
router.get('/guest/invoices/:invoiceId', async (req, res) => {
    const invoiceId = req.params.invoiceId;
    const { token } = req.query; // guest_order_access_token
    
    // 1. token으로 order_id 조회
    // 2. invoice 조회 (order_id로)
    // 3. 비회원 주문인지 확인 (orders.user_id IS NULL)
    // 4. 인보이스 반환
});
```

### 우선순위 2: 비회원 인보이스 목록 조회 API 추가

```javascript
// backend/invoice-routes.js에 추가
router.get('/guest/invoices', async (req, res) => {
    const { token } = req.query; // guest_order_access_token
    
    // 1. token으로 order_id 목록 조회
    // 2. 해당 주문들의 인보이스 목록 반환
});
```

## ✅ 전체 평가

**정상 작동**: 90%
- 주문 생성, 결제, Paid 처리, 인보이스 생성까지는 정상 작동
- 회원 인보이스 조회도 정상 작동

**개선 필요**: 10%
- 비회원 인보이스 조회 기능 추가 필요

---

## 📋 인보이스 및 보증서 기능 구현 현황

### ✅ 구현 완료된 기능

#### 인보이스 관련
1. ✅ **인보이스 생성**: `processPaidOrder()` → `createInvoiceFromOrder()` 호출
2. ✅ **회원 인보이스 목록 조회**: `GET /api/invoices/me` + `digital-invoice.html/js`
3. ✅ **회원 인보이스 상세 조회**: `GET /api/invoices/:invoiceId` + `invoice-detail.html/js`
4. ✅ **인보이스 UI**: 편지 디자인 카드, 상세 페이지 (Figma 디자인 기반)
5. ✅ **인보이스에서 보증서 링크**: `invoice-detail.js`에서 `warranty-detail.html`로 이동

#### 보증서 관련
1. ✅ **보증서 생성**: `processPaidOrder()`에서 자동 생성
2. ✅ **보증서 목록 조회**: `GET /api/warranties/me` + `my-warranties.html/js`, `digital-warranty.html/js`
3. ✅ **보증서 상세 조회**: `warranty-detail.html/js`
4. ✅ **보증서 API**: `GET /api/warranties/:publicId` (warranty-event-routes.js)

### ❌ 미구현 기능

#### 인보이스 관련
1. ❌ **인보이스 이메일 발송**: 
   - `invoices.emailed_at` 컬럼은 있지만 발송 로직 없음
   - `mailer.js`에 `sendInvoiceEmail` 함수 없음
   - 주문 확인 이메일(`sendOrderConfirmationEmail`)만 있음

2. ❌ **인보이스 다운로드 (PDF)**: 
   - `invoice-detail.js`에 TODO 주석만 있음
   - "결제 영수증 다운로드" 버튼 기능 미구현

3. ❌ **보증서 일괄 다운로드**: 
   - `invoice-detail.js`에 TODO 주석만 있음
   - "보증서 일괄 다운로드" 버튼 기능 미구현

4. ❌ **비회원 인보이스 조회**: 
   - 회원 전용 (`authenticateToken` 필수)
   - 비회원은 `guest_order_access_token`으로 주문은 조회 가능하나 인보이스는 불가

#### 보증서 관련
- ✅ 모든 주요 기능 구현 완료 (목록, 상세, 생성)

## 📝 요약

**구현 완료**: 85%
- 인보이스 생성, 조회 (회원), UI 모두 구현 완료
- 보증서 생성, 조회, UI 모두 구현 완료

**미구현**: 15%
- 인보이스 이메일 발송
- 인보이스/보증서 다운로드 기능
- 비회원 인보이스 조회
