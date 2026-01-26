# 주문 흐름 구현 현황 점검 (환불/양도 제외)

## 📋 점검 기준: 사용자가 정리한 흐름

### 비회원 주문 흐름

#### 1. guest_id가 주문별로 생성
- ✅ **구현 완료**: `processPaidOrder()`에서 `guest_id` 생성 및 `guest_order_access_tokens` 생성
- ✅ **위치**: `backend/utils/paid-order-processor.js` (600-636줄)
- ✅ **테이블**: `guest_order_access_tokens` 테이블 생성됨

#### 2. 이메일로 주문서 발송 (Secure 링크 포함)
- ✅ **구현 완료**: `sendOrderConfirmationEmail` 호출
- ✅ **위치**: `backend/payments-routes.js` (692-714줄)
- ⚠️ **이메일 내용**: 
  - ✅ 주문번호, 주문 상세 정보, Secure 링크 포함
  - ✅ 비회원/회원 구분 없이 동일한 이메일 내용 발송
- ❌ **Secure 링크 대상 페이지 미구현**: 
  - Secure 링크 클릭 시 표시할 통합 주문 상세 페이지 없음
  - 현재는 `guest/orders.html` 또는 회원 전용 페이지로 분리되어 있음
  - **필요**: 비회원/회원 구분 없이 동일한 페이지 (`order-detail.html` 또는 유사) 생성 필요
- 📝 **필요 작업**: 
  - Secure 링크 대상 통합 주문 상세 페이지 생성 (로그인 필수 아님)
  - 페이지 내용 (7개 섹션):
    1. 주문 요약 (Order Summary) - 주문번호, 주문일, 구매자명, 상품명/옵션, 결제금액, 결제수단 (일부 마스킹)
    2. 디지털 인보이스 (PDF) - 다운로드 버튼
    3. 디지털 정품 인증서 - 등록하기 버튼
       - 비회원: Claim token으로 연동 → 마이페이지 디지털 인보이스에 추가 → 보증서 활성화 가능
       - 회원: "이미 등록된 디지털 인보이스입니다" 표시
    4. 디지털 워런티 (Warranty) - AS 관련사항 링크, 케어 가이드라인 링크 (별도 HTML)
    5. 소유 기록 (Ownership Record) - 최초 구매자 기록, 소유일, 보관 안내
    6. 배송 상태 트래킹 - 준비중/발송완료/배송중, 송장번호, 배송사
    7. 브랜드 메시지 - "This digital record represents your ownership..."

#### 3. Secure 링크 클릭 시 통합 주문 상세 페이지 표시
- ❌ **미구현**: 통합 주문 상세 페이지 없음
- ⚠️ **현재 상태**: 
  - `guest/orders.html` (비회원 전용) 존재
  - 회원 전용 주문 상세 페이지 분리되어 있음
  - 비회원/회원 구분 없이 동일한 페이지 없음
- 📝 **필요 작업**: 
  - 통합 주문 상세 페이지 생성 (`order-detail.html` 또는 유사)
  - 로그인 필수 아님 (토큰 기반 접근)
  - 7개 섹션 구현:
    1. **주문 요약 (Order Summary)**
       - 주문번호, 주문일, 구매자명
       - 상품명 / 옵션 (색상, 사이즈)
       - 결제금액, 결제수단 (일부 마스킹 처리 - 별도 지시 예정)
    2. **디지털 인보이스 (PDF)**
       - 다운로드 버튼 (PDF 생성 API 필요)
    3. **디지털 정품 인증서 - 등록하기**
       - 비회원: Claim token으로 연동 → 마이페이지 디지털 인보이스에 추가 → 보증서 활성화 가능
       - 회원: "이미 등록된 디지털 인보이스입니다" 표시
    4. **디지털 워런티 (Warranty)**
       - AS 관련사항 링크 (별도 HTML)
       - 케어 가이드라인 링크 (별도 HTML)
    5. **소유 기록 (Ownership Record)**
       - 최초 구매자 기록
       - 소유일
       - "이 기록은 Pre.pMood 서버에 안전하게 보관됩니다"
    6. **배송 상태 트래킹**
       - 준비중 / 발송완료 / 배송중
       - 송장번호, 배송사
    7. **브랜드 메시지**
       - "This digital record represents your ownership of a genuine Pre.pMood product."
       - "Timeless design, securely recorded."

#### 4. QR 스캔 (로그인 필수) → 디지털 보증서 활성화
- ✅ **QR 스캔**: `GET /api/warranties/:publicId` (warranty-event-routes.js)
- ✅ **활성화 API**: `POST /api/warranties/:warrantyId/activate` (warranty-routes.js)
- ✅ **서버 검증**: 인보이스 연동 확인 구현됨 (`orders.user_id` 확인, `orders.status != 'refunded'` 확인)
- ⚠️ **경고 문구**: 
  - ❌ **미활성 상태 경고 문구 없음**: "보증서 미활성 상태에서만 전자상거래법에 따른 청약철회가 가능합니다."
  - ❌ **활성화 시 경고 문구 없음**: "보증서를 활성화하면 해당 상품은 사용 개시로 간주되어 새 상품으로 재판매가 불가능합니다. 이에 따라 교환 및 환불이 제한됩니다."
  - ⚠️ **현재**: `my-warranties.js`에 간단한 `confirm()` 메시지만 있음
    ```javascript
    const agreeText = `보증서를 활성화하시겠습니까?\n\n활성화된 보증서는 양도 및 환불 정책이 적용됩니다.`;
    ```
- 📋 **참고**: `SYSTEM_FLOW_DETAILED.md` 4-1 섹션 (인보이스 연동 확인 메커니즘)

#### 5. 디지털 인보이스는 이메일에서 별도 연동 기능
- ✅ **구현 완료**: Claim API 구현됨
- ✅ **API 엔드포인트**:
  - `POST /api/orders/:orderId/claim-token` - Claim token 발급
  - `POST /api/orders/:orderId/claim` - Claim 실행
- ✅ **프론트엔드**: `guest/orders.html`에 "내 계정에 연동하기" 버튼 있음
- ✅ **처리 흐름**: 
  - 비회원 주문 조회 → 로그인 → Claim token 발급 → Claim 실행
  - `warranties.status`: `issued_unassigned` → `issued`
  - `warranties.owner_user_id`: NULL → `user_id`

---

### 회원 주문 흐름

#### 1. user_id와 함께 주문 데이터 저장
- ✅ **구현 완료**: `POST /api/orders`에서 `user_id` 저장
- ✅ **위치**: `backend/order-routes.js`

#### 2. 이메일로 주문서 발송 (비회원과 동일 정보)
- ✅ **구현 완료**: `sendOrderConfirmationEmail` 호출
- ✅ **위치**: `backend/payments-routes.js` (692-714줄)
- ✅ **이메일 내용**: 주문번호, 주문 상세 정보, Secure 링크 포함
- ✅ **비회원/회원 구분 없이 동일한 이메일 내용 발송**
- ⚠️ **Secure 링크 대상 페이지**: 통합 주문 상세 페이지 미구현 (비회원 주문 흐름 섹션 참조)

#### 3. 자동으로 디지털 인보이스와 디지털 보증서가 계정에 귀속
- ✅ **인보이스**: `processPaidOrder()` → `createInvoiceFromOrder()` 자동 생성
- ✅ **보증서**: `processPaidOrder()`에서 자동 생성 (`warranties.status = 'issued'`, `owner_user_id = user_id`)
- ✅ **마이페이지 표시**:
  - ✅ 디지털 인보이스: `digital-invoice.html` + `GET /api/invoices/me`
  - ✅ 디지털 보증서: `my-warranties.html` + `GET /api/warranties/me`

#### 4. 디지털 보증서 활성화 전 경고 문구
- ❌ **미구현**: "보증서 미활성 상태에서만 전자상거래법에 따른 청약철회가 가능합니다." 문구 없음
- ⚠️ **현재**: `my-warranties.js`에 간단한 `confirm()` 메시지만 있음
- 📝 **필요 작업**: 
  - `my-warranties.html`에 경고 문구 추가
  - 활성화 버튼 클릭 시 모달/경고 표시

#### 5. 활성화 시 경고 문구
- ❌ **미구현**: "보증서를 활성화하면 해당 상품은 사용 개시로 간주되어 새 상품으로 재판매가 불가능합니다. 이에 따라 교환 및 환불이 제한됩니다." 문구 없음
- ⚠️ **현재**: `my-warranties.js`에 간단한 `confirm()` 메시지만 있음
- 📝 **필요 작업**: 
  - 활성화 확인 모달에 상세 경고 문구 추가
  - 동의 체크박스 추가

---

## 📊 구현 현황 요약

### ✅ 구현 완료 (80%)

1. ✅ **비회원 주문**: guest_id 생성, guest_order_access_tokens 생성
2. ✅ **비회원 주문 조회**: `guest/orders.html/js` - 주문정보, 주문 상태, 상품정보, 결제 정보, 배송정보, 정책 링크 모두 표시
3. ✅ **Claim 기능**: 비회원 주문 → 회원 계정 연동 API 구현 완료
4. ✅ **회원 주문**: user_id 저장, 이메일 발송, 인보이스/보증서 자동 귀속
5. ✅ **보증서 활성화 API**: `POST /api/warranties/:warrantyId/activate` 구현 완료
6. ✅ **QR 스캔**: 보증서 조회 API 구현 완료

### ❌ 미구현 (20%)

1. ❌ **통합 주문 상세 페이지 (Secure 링크 대상)**: 
   - Secure 링크 클릭 시 표시할 통합 페이지 없음
   - 비회원/회원 구분 없이 동일한 페이지 필요
   - 7개 섹션 구현 필요 (주문 요약, 디지털 인보이스 PDF, 디지털 정품 인증서 등록, 디지털 워런티, 소유 기록, 배송 상태 트래킹, 브랜드 메시지)
   - 로그인 필수 아님 (토큰 기반 접근)
   - PDF 다운로드 기능 필요
   - AS 관련사항, 케어 가이드라인 별도 HTML 필요

2. ❌ **보증서 활성화 경고 문구**:
   - 미활성 상태 경고: "보증서 미활성 상태에서만 전자상거래법에 따른 청약철회가 가능합니다."
   - 활성화 시 경고: "보증서를 활성화하면 해당 상품은 사용 개시로 간주되어 새 상품으로 재판매가 불가능합니다. 이에 따라 교환 및 환불이 제한됩니다."
   - 현재는 간단한 `confirm()` 메시지만 있음
   - 모달 UI 및 동의 체크박스 추가 필요

3. ❌ **비회원 인보이스 조회**: 
   - 비회원은 인보이스를 조회할 수 없음 (회원 전용)
   - `GET /api/guest/invoices/:invoiceId` API 없음
   - `GET /api/guest/invoices` API 없음 (목록 조회)
   - 프론트엔드 `guest/invoice-detail.html` 없음
   - `GET /api/guest/invoices/:invoiceId` API 없음
   - `GET /api/guest/invoices` API 없음 (목록 조회)
   - 비회원 주문 조회(`guest/orders.html`)는 있지만 인보이스 조회는 불가
   - **참고**: `SYSTEM_FLOW_DETAILED.md`에는 비회원 인보이스 조회 명시되어 있으나 구현 안 됨

---

## 📝 우선순위별 개선 사항

### 우선순위 1: 보증서 활성화 경고 문구 추가
**위치**: `my-warranties.html`, `my-warranties.js`

**필요 작업**:
1. 활성화 버튼 클릭 시 모달 표시
2. 모달에 경고 문구 추가:
   - 미활성 상태: "보증서 미활성 상태에서만 전자상거래법에 따른 청약철회가 가능합니다."
   - 활성화 시: "보증서를 활성화하면 해당 상품은 사용 개시로 간주되어 새 상품으로 재판매가 불가능합니다. 이에 따라 교환 및 환불이 제한됩니다."
3. 동의 체크박스 추가

### 우선순위 2: 통합 주문 상세 페이지 (Secure 링크 대상)
**위치**: `order-detail.html` (새 파일), `order-detail.js` (새 파일), `backend/order-routes.js` 또는 `backend/invoice-routes.js`

**필요 작업**:
1. **프론트엔드 페이지 생성** (`order-detail.html`, `order-detail.js`)
   - 로그인 필수 아님 (토큰 기반 접근)
   - 7개 섹션 구현:
     - 주문 요약 (Order Summary)
     - 디지털 인보이스 (PDF) 다운로드 버튼
     - 디지털 정품 인증서 - 등록하기 (비회원: Claim, 회원: 이미 등록됨 표시)
     - 디지털 워런티 (AS 관련사항, 케어 가이드라인 링크)
     - 소유 기록 (Ownership Record)
     - 배송 상태 트래킹
     - 브랜드 메시지

2. **백엔드 API 추가**
   - `GET /api/orders/:orderId/detail` 또는 `GET /api/guest/orders/:orderNumber/detail`
   - 토큰 검증 (`guest_order_access_token` 또는 회원 인증)
   - 주문 상세 정보 반환 (주문 요약, 결제 정보, 배송 정보 등)
   - 결제수단 마스킹 처리 (별도 지시 예정)

3. **PDF 다운로드 기능**
   - `GET /api/invoices/:invoiceId/download` API 추가
   - PDF 생성 (puppeteer 또는 유사 라이브러리)

4. **별도 HTML 페이지**
   - AS 관련사항 페이지 (`warranty-as.html`)
   - 케어 가이드라인 페이지 (`care-guideline.html`)

5. **Secure 링크 업데이트**
   - `sendOrderConfirmationEmail`의 Secure 링크를 통합 페이지로 변경
   - 토큰 기반 접근 처리

### 우선순위 3: 비회원 인보이스 조회
**위치**: `backend/invoice-routes.js`

**필요 작업**:
1. `GET /api/guest/invoices/:invoiceId` API 추가
   - `guest_order_access_token` 검증 (또는 `guest_order_sessions` 쿠키 검증)
   - 비회원 주문 확인 (`orders.user_id IS NULL`)
   - 인보이스 상세 정보 반환 (회원 API와 동일한 형식)
2. `GET /api/guest/invoices` API 추가 (목록 조회)
   - `guest_order_access_token`으로 여러 주문의 인보이스 목록 조회
   - 또는 세션 기반으로 현재 세션의 주문 인보이스 목록 조회
3. 프론트엔드: `guest/invoice-detail.html` 추가 (비회원 전용 인보이스 상세 페이지)
4. **참고**: `SYSTEM_FLOW_DETAILED.md`에는 비회원 인보이스 조회 명시되어 있으나 구현 안 됨

---

## ✅ 전체 평가

**구현 완료**: 80%
- 핵심 흐름 (주문 생성, 결제, 인보이스/보증서 생성, 조회) 모두 구현 완료
- 비회원 주문 조회 페이지 완성
- Claim 기능 구현 완료

**미구현**: 20%
- 통합 주문 상세 페이지 (Secure 링크 대상) - 7개 섹션 구현 필요
- 보증서 활성화 경고 문구 (상세 문구)
- 비회원 인보이스 조회
