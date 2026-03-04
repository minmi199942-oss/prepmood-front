# 주문·시스템 흐름 통합 문서

**작성일**: 2026-02-18  
**목적**: 주문/결제/Paid/Claim/보증서/인보이스 흐름을 한 문서로 정리. 구현 상태는 코드 기준 이차 검증 반영.

**기준 문서**: `SYSTEM_FLOW_DETAILED.md` (상세 흐름·락 순서·정책은 동 문서 참조)

**문서 사용법 (처음 보는 개발자)**  
- **현황**: 3절(구현 완료), 4절(미구현·미해결).  
- **구현 순서(기능 단위)**: 11절 — 0(정리) → 1(비회원 confirm) → 2(보증서 경고) → 3(PDF) → 4(통합 주문 상세).  
- **비회원 confirm 상세**: 12절·**12.6 체크리스트** (실제 코드 수정 시 필수).  
- **운영 전 최종 목표**: 14절·**14.8 체크리스트**.  
- **기술적 Phase 순서**: 15.6 (Phase 1: 토큰 헬퍼 → Phase 2: confirm·webhook 리팩터 → Phase 3: POST 세션·Rate limit·알림).  
- **구현 시 반드시 지킬 규칙·보안·위험**: **16절** (SSOT, 보안, 커넥션, 비회원 confirm, 알림, Phase별 체크). 코드 수정 **전·중**에 16절 기준으로 누락 없이 적용할 것.  
- **줄 번호**: 본 문서의 파일·줄 번호는 작성 시점 기준. 코드 변경으로 위치가 바뀔 수 있으므로, 키워드/패턴으로 검색해 위치 확인할 것.

---

## 0-A. 시스템 전체 핵심 흐름 (Life Cycle)

비회원 주문부터 조회까지의 라이프사이클을 한눈에 보는 요약이다.

```
[비회원] 주문 생성 (POST /api/orders, guest_id)
    → 결제 (토스 위젯)
    → 결제 확인 (POST /api/payments/confirm, optionalAuth, order_number + user_id IS NULL)
    → paid_events 생성 (결제 증거, 별도 커넥션 autocommit)
    → processPaidOrder (재고 배정, order_item_units, warranties, invoices, guest_order_access_tokens)
    → guest_order_access_token 생성 (90일 유효)
    → 주문 확인 이메일 발송 (링크: guest-order-access.html?token=xxx)
    → [사용자] 이메일 링크 클릭 → 랜딩 페이지 → POST /api/guest/orders/session (body: token)
    → guest_session_token 쿠키 발급 (24시간)
    → GET /api/guest/orders/:orderNumber (쿠키) → 주문 조회
    → (선택) Claim → orders.user_id 설정, 비회원 세션·토큰 무효화 → 회원 주문으로 전환
```

회원은 주문 생성 시 `user_id`가 있으므로 confirm 이후 `my-orders` 등 회원 경로로 조회한다.

---

## 0-B. 권한 및 인증 모델 정의 (Trust Boundary)

각 토큰의 역할과 신뢰 경계를 명확히 한다.

| 토큰 | 역할 | 보관 위치 | 우선순위 |
|------|------|------------|----------|
| **guest_order_access_token** | 이메일 링크를 통한 **1회성 세션 교환용 티켓**. API는 GET이 아닌 **POST /api/guest/orders/session** Body로만 수신 권장. 랜딩 페이지(`guest-order-access.html?token=xxx`)에서 POST 후 세션 쿠키 발급. | URL 쿼리(랜딩만), 이메일 본문 | 세션 교환 후에는 세션 쿠키가 주 조회 수단 |
| **guest_session_token** | 브라우저에 **httpOnly·Secure·SameSite 쿠키**로 저장되며, **실제 비회원 주문 조회**를 담당. GET /api/guest/orders/:orderNumber 시 이 쿠키로 세션 검증. Claim 시 해당 주문의 모든 비회원 세션은 만료 처리됨. | httpOnly 쿠키 | JWT 없을 때만 사용 |
| **JWT** | 회원 로그인 인증. **항상 Guest 세션보다 우선**한다. 회원이 로그인한 상태에서는 주문 조회·Claim 등 회원 API만 사용. | httpOnly 쿠키 | 최우선 |

**Trust Boundary 요약**: 주문이 Claim되어 `orders.user_id`가 설정된 이후에는, guest 세션으로 해당 주문 접근 시 **무조건 403** (GET /api/guest/orders/:orderNumber 에서 `o.user_id IS NULL` 조건으로 방어). Claim 시점에 해당 주문의 `guest_order_sessions` 만료 처리로 기존 비회원 세션을 적극적으로 무효화한다.

---

## 0-C. Confirm vs Webhook 동시성(Race Condition) 방어 전략

동시성 충돌 방지를 위해 아래 전략이 코드에 적용되어 있다.

- **DB 제약**  
  `paid_events` 테이블에 **UNIQUE KEY uk_paid_events_order_payment (order_id, payment_key)** 가 걸려 있다. 동일 (order_id, payment_key)로 Confirm과 Webhook이 동시에 INSERT를 시도해도 한 건만 유지된다.

- **애플리케이션 멱등성**  
  - **confirm/webhook 경로**: paid_events를 **선조회**(`SELECT event_id FROM paid_events WHERE order_id = ?`)하여 이미 존재하면 **"이미 처리됨"**으로 간주하고, processPaidOrder 재실행 없이 응답한다.  
  - **createPaidEvent**: **INSERT ... ON DUPLICATE KEY UPDATE**를 사용하여, (order_id, payment_key) 중복 시 기존 행의 `confirmed_at`만 갱신하고 동일 `event_id`를 사용한다.  
  - 그 결과, Confirm과 Webhook이 동시에 들어와도 paid_events는 한 건만 남고, 애플리케이션은 "이미 처리됨" 또는 ON DUPLICATE KEY UPDATE로 멱등하게 동작한다.

---

## 1. SSOT 및 전역 규칙 (요약)

- **`orders.status`**: 집계 결과(표시용). 정책 판단에 사용 금지. 집계 함수로만 갱신.
- **`order_item_units.unit_status`**: 물류 단위 상태의 진실 원천.
- **`stock_units.status`**: 재고 상태의 진실 원천. 재판매 게이트는 `status = 'in_stock'`.
- **`warranties.status`**: 권리/정책(활성화·양도·환불)의 진실 원천.
- **`invoices`**: 증빙/조회용 스냅샷. 권리 판단 기준으로 사용 금지.

**락 순서**: `orders` → `stock_units` → `order_item_units` → `warranties` → `invoices`  
**원자성**: 상태 전이는 `UPDATE ... WHERE 조건` + `affectedRows=1` 검증 필수.  
**토큰**: 비회원 조회 `guest_order_access_token`(90일), Claim `claim_token`(단기) 분리.

상세 규칙·유니크 제약·데이터베이스 상태 예시는 `SYSTEM_FLOW_DETAILED.md` 참조.

---

## 2. 전체 흐름 요약

### 회원
주문 생성(user_id) → Paid 처리 → warranties(issued) → 실물 보증서 발송 → 첫 활성화(인보이스 연동 확인) → 양도 또는 환불 → 재판매 시 기존 warranty 업데이트.

### 비회원
주문 생성(guest_id) → Paid 처리 → warranties(issued_unassigned) → 실물 보증서 발송 → Claim → 활성화 → 양도/환불 → 재판매.

상세 단계·SQL·검증 조건은 `SYSTEM_FLOW_DETAILED.md` 1~8절 참조.

---

## 3. 구현 완료 현황 (코드 검증 기준)

### 3.1 백엔드·DB
- **주문 생성**: `POST /api/orders` (회원/비회원, optionalAuth), order_idempotency.
- **결제 확인**: `POST /api/payments/confirm` — **optionalAuth**(회원/비회원 모두), 주문 조회 `user_id = ?` / `user_id IS NULL` 분기, 토스 Confirm API, payments 저장, **paid_events 먼저 확인 후 처리** (SSOT 준수). 이미 처리됨 시 `user_id`·`guest_access_token`(헬퍼) 응답, 이메일·인보이스 커넥션 finally 보장.
- **paid_events**: `createPaidEvent` — INSERT 시 `order_id` 포함 (`paid-event-creator.js` 80~82). 복구 스크립트: `fix_missing_paid_events.js`, `recover_pipeline_batch.js` 등.
- **processPaidOrder**: 재고 배정, order_item_units, warranties, invoices, guest_order_access_tokens.
- **주문 확인 이메일**: `sendOrderConfirmationEmail` (confirm/inicis/webhook).
- **인보이스 이메일**: `sendInvoiceEmail` 구현 및 호출 (`mailer.js` 622줄, `payments-routes.js` confirm/inicis/webhook), `invoices.emailed_at` 업데이트.
- **비회원 주문 조회**: `GET /api/guest/orders/session`, `GET /api/guest/orders/:orderNumber` (세션 토큰). **Claim 방어**: 세션 기반 조회 시 `o.user_id IS NULL` 조건으로 Claim된 주문은 403.
- **Claim**: `POST /api/orders/:orderId/claim-token`, `POST /api/orders/:orderId/claim`.
- **보증서 활성화**: `POST /api/warranties/:warrantyId/activate` (인보이스 연동 확인).
- **관리자 보증서 상세**: 환불 상태는 `unit_status`/`warranty.status`로 판정 (`warranty-event-routes.js` 492~498, SSOT 준수).

### 3.2 프론트
- **비회원 주문 상세**: `guest/orders.html`, `guest/orders.js` (주문·결제·배송·Claim).
- **주문 완료 페이지**: confirm 성공 후 회원/비회원 모두 주문 표시 시 장바구니 정리(`clearCartIfAvailable`, 비회원은 localStorage `pm_cart_v1`).
- **회원 주문·인보이스·보증서**: my-orders, digital-invoice, my-warranties, warranty-detail 등.

---

## 4. 미구현·미해결 (코드 검증 기준)

### 4.1 비회원 결제 확인(confirm)
- **상태**: ✅ **해결됨** (코드 검증 2026-02-18)
- **구현**: `POST /api/payments/confirm` — optionalAuth, 주문 조회 회원 `user_id = ?` / 비회원 `user_id IS NULL` 분기. 이미 처리됨 시 guest_order_access_tokens에서 유효 토큰(헬퍼) 조회해 `user_id`·`guest_access_token` 응답. 데드 코드 제거, userId null 시 장바구니 쿼리 스킵, 이메일/인보이스 블록 finally. `order-complete-script.js`에서 비회원도 confirm 성공 시 주문 정보·이메일 수신·세션 교환 가능. **체크리스트**: 12.6, 16.7 Phase 2 완료.

### 4.2 비회원 인보이스 (조회 불필요, PDF만)
- **상태**: ✅ **구현 완료** (코드 검증 2026-02-18)
- **구현**: 비회원은 인보이스 조회 UI 없이 주문 상세에서 **PDF 다운로드만** 제공.  
  - **Backend**: `GET /api/guest/orders/:orderNumber/invoice/pdf` (order-routes.js 2005~2109). 세션(guest_session_token)·수평 권한 검증(`o.user_id IS NULL`), invoice 조회 후 pdfkit으로 동적 생성, 인메모리 캐시(TTL 10분), Rate limit IP당 1분 3회.
  - **Frontend**: `guest/orders.js` `downloadInvoice()` — API 호출 후 Blob 다운로드, 파일명 `Prepmood-Invoice-${orderNumber}.pdf`.

### 4.3 보증서 활성화 상세 경고 문구
- **상태**: ✅ **해결됨** (코드 검증 기준)
- **구현**: `my-warranties.html` — 활성화 경고 모달 추가. `my-warranties.js` — 활성화 버튼 클릭 시 모달 표시, 문서 요구 문구 2종 + 기존 문구 1종, 동의 체크박스 후에만 "활성화" 버튼으로 API 호출. (11절 2단계 완료.)

### 4.4 통합 주문 상세 페이지 (Secure 링크 대상)
- **상태**: ❌ **미구현**
- **사실**: `order-detail.html`(또는 동일 성격의 통합 페이지) 없음.  
  비회원은 `guest/orders.html`, 회원은 my-orders 등으로 분리. 이메일 Secure 링크는 `/api/guest/orders/session?token=...` → `guest/orders.html?order=...`로만 연결됨.
- **필요**: 비회원/회원 구분 없이 토큰 또는 로그인 기반으로 진입하는 통합 주문 상세 페이지(문서상 7개 섹션) 및 필요 시 PDF/인보이스 링크 연동.

### 4.5 인보이스 PDF 다운로드
- **상태**: ✅ **구현 완료** (4.2와 동일 경로, 코드 검증 2026-02-18)
- **구현**: guest 세션·order_number 검증 후 PDF 반환(8.4·11절 3단계). 4.2 항목 참고.

---

## 5. 과거 장애·코드 리뷰 이슈 (검증 결과)

### 5.1 paid_events 미생성 이슈
- **문서**: `ORDER_PROCESSING_ISSUE_ANALYSIS.md` — `payments.status = 'captured'`인데 `paid_events` 없음, `Field 'order_id' doesn't have a default value` 등.
- **검증**:  
  - `paid-event-creator.js` INSERT에 `order_id` 명시 (80~82줄).  
  - `payments-routes.js` confirm 경로에서 **paid_events를 먼저 확인** 후 처리(140~144줄).  
  - 복구 스크립트 다수 존재.  
- **결론**: **해결됨.** 동일 이슈는 통합 문서에서 제거해도 됨.

### 5.2 SSOT 위반 (코드 리뷰)
- **payments-routes "이미 처리됨" 판단**: `order.status` 대신 **paid_events 먼저 조회**하도록 수정됨 (140~144줄). ✅ 수정 완료.
- **warranty-event-routes 환불 배지**: **unit_status / warranty.status**로 판정 (492~498줄). ✅ 수정 완료.

---

## 6. 우선순위별 남은 작업

| 우선순위 | 항목 | 비고 |
|---------|------|------|
| 1 | 비회원 결제 확인(confirm) 허용 | ✅ 완료 (4.1) |
| 2 | 보증서 활성화 상세 경고 문구 | ✅ 완료 (4.3) |
| 3 | 인보이스 PDF 다운로드 (비회원) | ✅ 완료 (4.2·4.5) |
| 4 | 통합 주문 상세 페이지 | ❌ 미구현. Secure 링크 대상, 선택적 |

---

## 7. 참고

- **상세 흐름·락 순서·상태 전이·관리자**: `SYSTEM_FLOW_DETAILED.md`
- **DB 스키마**: `db_structure_actual.txt` (프로젝트 루트 또는 `backend/scripts/` 에 위치할 수 있음. SSOT 규칙에 따라 실제 구조 확인 후 작업.)
- **코드 리뷰 상세**: `ORDER_FLOW_CODE_REVIEW_DETAIL.md` (createOrderPayload, Logger, 보안 등)
- **비회원 인보이스 접근 설계**: `GUEST_INVOICE_ACCESS_DESIGN.md`
- **관리자 비회원 주문 표시**: `ADMIN_GUEST_ORDER_VISIBILITY_ANALYSIS.md`

---

## 8. 주문 상세·등록하기·인보이스/보증서·PDF (구현 명세)

**목적**: 이 섹션만 보면 주문 상세 링크, 같은 페이지 정책, 등록하기(Claim) 흐름, 디지털 인보이스/보증서 관계, 비회원 PDF 다운로드를 **하나도 틀리지 않고** 구현할 수 있도록 정리함.

---

### 8.1 주문 상세 링크 = 같은 페이지 (필수 정책)

- **정책**: 비회원 주문이든 회원 주문이든, **이메일로 가는 주문 상세 링크는 동일한 하나의 페이지**로 연결한다.
- **이메일**: 주문 확인 이메일에는 Secure 링크가 포함된다. (현재 구현: `/api/guest/orders/session?token=...` → 리다이렉트로 주문 상세 페이지로 이동.)
- **동작**: 링크를 클릭하면 **비회원/회원 구분 없이 같은 주문 상세 페이지**가 열린다.  
  - 비회원: 세션 토큰(또는 guest_order_access_token)으로 해당 주문만 조회 가능하게 인증.  
  - 회원: 로그인 상태면 동일한 페이지에서 “내 주문”으로 표시할 수 있음 (같은 URL/같은 페이지 사용).
- **구현 시 유의**: “통합 주문 상세 페이지”는 **이메일 Secure 링크의 유일한 목적지**이며, 회원 전용 주문 상세와 비회원 전용 주문 상세를 **따로 두지 않고 하나**로 둔다.

---

### 8.2 주문 상세 페이지에 “등록하기”가 있는 흐름 (디테일)

- **페이지 구성 (같은 페이지 내)**  
  - 주문 요약(주문번호, 주문일, 구매자, 상품/옵션, 결제금액 등)  
  - **디지털 인보이스**: PDF 다운로드 버튼 (아래 8.4 참고)  
  - **디지털 정품 인증서**: “등록하기” 버튼  
  - 기타: 배송 상태, 브랜드 메시지 등 (문서상 7개 섹션 참고)

- **“등록하기”가 의미하는 것**  
  - **디지털 정품 인증서(디지털 보증서)**를 **내 계정에 연동(Claim)** 하는 액션이다.  
  - 비회원일 때만 노출하거나, “아직 연동 안 된 보증서”일 때만 노출한다.

- **등록하기 클릭 시 동작 (순서 고정)**  
  1. 사용자가 “등록하기” 버튼 클릭.  
  2. **로그인 여부 확인**  
     - 로그인되어 있지 않으면 → 로그인/회원가입 요구 (로그인 페이지로 이동, returnUrl 등으로 현재 주문 상세 복귀 가능하게).  
     - 로그인되어 있으면 → 3으로.  
  3. 로그인(또는 회원가입 후 로그인) 완료 후, **Claim 처리**  
     - 클라이언트: `POST /api/orders/:orderId/claim-token` 호출 → `claim_token` 수신.  
     - 클라이언트: `POST /api/orders/:orderId/claim` body `{ claim_token }` 호출.  
  4. 서버 Claim 처리 (`SYSTEM_FLOW_DETAILED.md` 3-2절 및 `order-routes.js` 기준)  
     - `orders.user_id` = 로그인한 `user_id` 로 업데이트 (해당 주문이 “내 주문”이 됨).  
     - 해당 주문의 모든 `warranties`: `status` `issued_unassigned` → `issued`, `owner_user_id` = 로그인한 `user_id`.  
     - `guest_order_access_token` 회수(revoked_at 설정).  
  5. **결과**: 그 주문에 연결된 **디지털 보증서**가 모두 **내 계정에 소유(귀속)** 된다.  
     - 이후 “내 프로필” → 디지털 보증서 목록(`GET /api/warranties/me`)에서 해당 보증서가 보인다.  
     - 동시에 같은 주문의 **디지털 인보이스**도 “내 프로필” → 디지털 인보이스 목록(`GET /api/invoices/me`)에서 보이게 된다 (아래 8.3).

- **구현 시 유의**  
  - 등록하기는 **반드시** “로그인/회원가입 유도 → 로그인 성공 후 claim-token 발급 → claim API 호출” 순서를 지킨다.  
  - Claim 후에는 주문 상세 페이지에서 “등록하기” 대신 “이미 등록된 디지털 인보이스입니다” 등으로 표시해도 됨 (회원 주문과 동일한 UX).

---

### 8.3 디지털 인보이스와 디지털 보증서의 관계 (정확한 이해)

- **생성 시점 (Paid 처리)**  
  - 주문 1건당 **인보이스 1개** 생성 (`invoices` 테이블, `order_id`로 연결).  
  - 주문 항목 단위(`order_item_units`)마다 **보증서 N개** 생성 (`warranties` 테이블, `source_order_item_unit_id` 등으로 주문과 연결).  
  - 즉, **인보이스와 보증서는 둘 다 “주문(order)”에 연결**되어 있다.

- **비회원일 때**  
  - `orders.user_id = NULL`, `warranties.owner_user_id = NULL`, `warranties.status = 'issued_unassigned'`.  
  - “내 프로필”의 디지털 인보이스 목록(`GET /api/invoices/me`)과 디지털 보증서 목록(`GET /api/warranties/me`)은 **user_id 기준**이므로, 이 비회원 주문의 인보이스·보증서는 **목록에 안 나온다**.  
  - 비회원은 **이메일의 주문 상세 링크로만** 해당 주문(및 그 주문의 인보이스·보증서 정보)에 접근할 수 있다.

- **등록하기(Claim) 이후**  
  - `orders.user_id`가 설정되므로, 그 주문은 “내 주문”이 됨.  
  - 인보이스는 `order_id`로 연결되어 있으므로 `GET /api/invoices/me`(orders와 조인)에서 **내 디지털 인보이스**에 포함되어 보인다.  
  - 보증서는 `owner_user_id`가 설정되므로 `GET /api/warranties/me`에서 **내 디지털 보증서**에 포함되어 보인다.  
  - **정리**: **등록하기 한 번으로, 해당 주문의 디지털 인보이스와 디지털 보증서가 함께 “내 프로필”에 들어온다.**  
  - 구현 시 “등록하기 = 보증서만 연동”이 아니라, **주문을 계정에 귀속시키는 것**이라 인보이스·보증서가 함께 노출된다고 이해하면 됨.

---

### 8.4 비회원이 주문 상세에서 디지털 인보이스 PDF 다운로드 (구현 요건)

- **시나리오**  
  - 비회원이 **이메일로 받은 주문 상세 링크**로 들어온 **같은 주문 상세 페이지**에서,  
  - “디지털 인보이스” 섹션의 **PDF 다운로드** 버튼을 누르면, 해당 주문의 디지털 인보이스를 **PDF 파일로 다운받을 수 있어야** 한다.

- **인증**  
  - 주문 상세 페이지 진입과 동일한 방식: **guest 세션 토큰**(httpOnly 쿠키, `/api/guest/orders/session`으로 발급된 세션) 또는 `guest_order_access_token`으로 “이 주문은 이 비회원의 주문이다”를 검증한다.  
  - PDF API는 **반드시** 위와 동일한 검증을 한 뒤, 해당 주문의 인보이스 1건만 PDF로 제공한다.

- **백엔드 API (구현 시 필수)**  
  1. **`GET /api/guest/orders/:orderNumber/invoice`** (선택이지만 권장)  
     - 목적: guest 세션/토큰 검증 후, 해당 `orderNumber`의 주문에 연결된 인보이스 1건을 JSON으로 반환.  
     - 검증: `GET /api/guest/orders/:orderNumber`와 동일한 세션/토큰·수평 권한 검사(order_number 일치).  
     - 주문의 `user_id IS NULL`(비회원 주문)인 경우만 허용하거나, Claim 후에도 “같은 세션으로 본 주문”이면 허용할지 정책 결정. (일반적으로는 “비회원 세션으로 열린 주문 상세”이므로 해당 orderNumber만 검증하면 됨.)  
  2. **`GET /api/guest/orders/:orderNumber/invoice/pdf`** (필수)  
     - 목적: 위와 동일 검증 후, 해당 주문의 인보이스 1건을 **PDF 바이너리**로 생성해 응답.  
     - 응답: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Prepmood-Invoice-{orderNumber}.pdf"` (또는 invoice_number 기반 파일명).  
     - PDF 생성: `invoices` 테이블의 해당 행(payload_json, billing_*, shipping_*, invoice_number, issued_at 등)을 사용해 1장 분량 PDF 생성. (Puppeteer로 HTML 렌더 후 `page.pdf()` 또는 pdfkit 등 사용.)

- **프론트 (같은 주문 상세 페이지)**  
  - “PDF 다운로드” 버튼 클릭 시:  
    - 현재 페이지에서 사용 중인 `orderNumber`(URL 파라미터 또는 이미 로드된 주문 정보)를 사용해  
    - `GET /api/guest/orders/:orderNumber/invoice/pdf` 호출 (`credentials: 'include'`로 쿠키 전송).  
  - 응답을 `blob()`으로 받아 `URL.createObjectURL(blob)` + `<a download="...">` 클릭으로 파일 저장하거나, `window.open`으로 해당 URL을 열어 브라우저가 다운로드하게 처리.  
  - 기존 `downloadInvoice(orderId)` 형태라면, **비회원 플로우에서는 orderNumber로 위 PDF URL을 호출**하도록 변경한다.

- **정리**  
  - 비회원 주문 상세 = **같은 페이지** (8.1).  
  - 그 페이지에서 디지털 인보이스 = **PDF로 다운받기** 가능해야 함 (8.4).  
  - 등록하기 = **디지털 보증서를 내 계정에 연동** (8.2), 연동 후에는 **인보이스·보증서 모두 내 프로필에 표시** (8.3).

---

## 9. 주문 흐름 코드 검토 (비효율·보안·오류·불안정 요소)

**검토 범위**: 체크아웃 → 주문 생성 → 결제 확인 → paid_events/processPaidOrder → order-complete → 비회원 주문/Claim → 이메일/인보이스.  
**검토 일자**: 2026-02-18. 코드 기준으로 확인한 내용만 기재.  
**참고**: 아래 줄 번호는 작성 시점 기준. 수정 시 해당 패턴/키워드로 파일 내 검색할 것.

---

### 9.1 논리 오류·데드 코드

| 위치 | 내용 | 심각도 | 권장 조치 |
|------|------|--------|-----------|
| `payments-routes.js` 163줄 부근 | `if (existingPaidEvents.length > 0)` 블록 **안**에 `if (existingPaymentStatus === 'captured' && existingPaidEvents.length === 0)` 조건이 있음. 이 블록에 진입했다는 것은 이미 `existingPaidEvents.length > 0`이므로 내부 조건은 **항상 false** → **데드 코드**. | 낮음 | 내부 분기 제거 또는 상위 분기와 통합 정리. |

---

### 9.2 보안·정보 노출

| 항목 | 내용 | 심각도 | 권장 조치 |
|------|------|--------|-----------|
| **guest_order_access_token in URL** | `GET /api/guest/orders/session?token=xxx` — 토큰이 쿼리 스트링에 노출됨. 서버 액세스 로그·Referer 헤더(외부 링크 클릭 시)에 남을 수 있음. | 중간 | 가능하면 세션 교환을 POST + body로 변경하거나, 최소한 로그/모니터링에서 토큰 값 로깅 금지. |
| **404/403 메시지** | 주문/결제 관련 404·403 시 메시지가 “주문을 찾을 수 없습니다” 등으로 통일되어 있어, 존재 여부 추측(enumeration)에 악용될 여지는 제한적. | 낮음 | 현행 유지. 필요 시 메시지 통일만 유지. |
| **CSRF 미들웨어 로깅** | `csrf-middleware.js`에서 `console.log`/`console.warn` 사용, 토큰 앞부분 일부 출력. 프로젝트 규칙은 Logger 사용. | 낮음 | `console` → Logger로 변경, 프로덕션에서는 토큰/접두어 로깅 최소화. |
| **order-complete·guest 프론트** | `order-complete-script.js`, `guest/orders.js`에서 사용자/서버 데이터 출력 시 `escapeHtml` 사용 확인됨. | - | 유지. 신규 DOM 삽입 시에도 escapeHtml 적용할 것. |

---

### 9.3 비효율·확장성

| 항목 | 내용 | 심각도 | 권장 조치 |
|------|------|--------|-----------|
| **주문 목록 N+1** | `GET /api/orders`(order-routes.js)에서 주문 목록 조회 후, **각 주문마다** `order_items` SELECT를 별도 실행. 주문 수가 많으면 쿼리 수가 선형 증가. | 중간 | 주문 목록 조회 후 `order_id IN (...)`로 order_items 일괄 조회하거나, 서브쿼리/조인으로 1~2회 쿼리로 정리. |
| **이메일 발송 시 커넥션** | `payments-routes.js` confirm 처리 시, 이메일 발송용으로 별도 `emailConnection` 생성 후 사용. 예외 발생 시 `emailConnection.end()`가 호출되지 않는 경로가 있으면 커넥션 누수 가능. | 중간 | `try { ... } finally { if (emailConnection) await emailConnection.end(); }` 등으로 모든 경로에서 end() 보장. |
| **guest_session_token 무제한 시도** | `GET /api/guest/orders/session`에 토큰을 쿼리로 넘기는 구조상, 동일 IP에서 짧은 시간에 많은 시도 가능. (전역 API rate limit만 있음) | 낮음 | 토큰은 추측 불가에 가깝지만, 세션 발급 엔드포인트에 IP당 rate limit 추가 시 DoS/브루트포스 완화. |

---

### 9.4 오류 가능성·엣지 케이스

| 항목 | 내용 | 심각도 | 권장 조치 |
|------|------|--------|-----------|
| **비회원 결제 확인** | order-complete에서 비로그인도 `handleTossPaymentSuccess` 호출하지만, 백엔드 `POST /api/payments/confirm`는 `authenticateToken` + `WHERE user_id = ?`라 비회원은 401/404. 비회원 주문 완료 후 주문 정보·이메일 수신 불가. | 높음 | 4.1절 대로 confirm을 optionalAuth로 바꾸고, 비회원은 order_number + user_id IS NULL로 조회 후 `guest_access_token` 반환. |
| **orderId vs order_number** | order-complete URL의 `orderId`는 토스 successUrl 기준 **order_number** 문자열. `GET /api/orders/:orderId`는 order_number 정규식 또는 숫자 order_id 둘 다 허용하므로 현재는 호환됨. | - | 신규 연동 시 “orderId 파라미터 = order_number” 규약 유지. |
| **processPaidOrder 실패 후 재시도** | paid_events는 별도 커넥션으로 먼저 생성되므로, processPaidOrder만 실패해도 결제 증거는 남음. 복구 스크립트로 재처리 가능. 롤백 시 별도 커넥션으로 updateOrderStatus 호출하는 흐름 확인됨. | - | 유지. 재시도/복구 정책만 문서화. |

---

### 9.5 기능 추가 시 불안정·비효율 요인

| 항목 | 내용 | 권장 조치 |
|------|------|-----------|
| **통합 주문 상세 페이지** | 비회원/회원이 같은 페이지를 쓰도록 하려면, 진입 경로(이메일 링크 vs 로그인 후 내 주문)에 따라 **세션(guest_session_token) vs JWT**를 구분해 같은 API 또는 다른 API를 호출해야 함. 현재는 guest 전용 `GET /api/guest/orders/:orderNumber`와 회원 전용 `GET /api/orders/:orderId`가 분리됨. | 통합 페이지에서 “guest 세션 쿠키 있으면 guest API, 없으면 JWT로 회원 API”처럼 분기하고, 한쪽만 성공하도록 설계. |
| **PDF·인보이스 API 추가 시** | 비회원용 `GET /api/guest/orders/:orderNumber/invoice/pdf` 등을 추가할 때, **반드시** `GET /api/guest/orders/:orderNumber`와 동일한 세션/토큰 검증 및 order_number 일치 검사 적용. 검증 누락 시 타인 주문 인보이스 노출 위험. | 8.4절 구현 요건대로 동일 검증 로직 공통화(미들웨어 또는 내부 함수). |
| **Claim-token 주석** | order-routes.js claim-token 라우트에 “guest_order_access_token 검증 (쿠키 또는 세션) - TODO: 구현 필요”라고 되어 있으나, 실제로는 **guest_session_token** 쿠키와 세션의 order_id 매칭으로 검증하고 있음. | TODO 주석 제거 또는 “guest_session_token 쿠키로 검증함”으로 수정해 혼동 방지. |

---

### 9.6 정상 동작 확인된 부분 (참고)

- **주문 생성**: optionalAuth, verifyCSRF, orderCreationLimiter, Idempotency-Key, 서버 금액·상품 검증, prepared statement 사용.
- **결제 확인**: paid_events 선확인(SSOT), 서버 금액 사용, order_number + user_id로 주문 조회(회원).
- **Guest 세션**: 토큰 검증, expires_at/revoked_at 확인, 세션 발급 후 httpOnly 쿠키, order_number 일치 검사(수평 권한상승 방지).
- **Claim**: guest_session_token 검증, session order_id와 요청 orderId 일치 검사, claim_token 1회성·만료 검사, 원자적 업데이트.
- **프론트**: order-complete·guest/orders에서 사용자/서버 데이터 출력 시 escapeHtml 사용.

---

## 10. 디지털 보증서 양도 (디테일)

**목적**: 양도(transfer)가 어떻게 이루어지는지, 전제·요청·수락·검증·DB·정책을 이 문서만 보고 구현/검증할 수 있도록 정리.  
**코드 기준**: `backend/warranty-routes.js`, `my-warranties.js`, `warranty-transfer-accept.html`·`warranty-transfer-accept.js`, `mailer.js` `sendTransferRequestEmail`.

---

### 10.1 전제 조건

- **양도 가능한 보증서**: `warranties.status = 'active'` 인 경우만. (이미 활성화된 보증서만 양도 가능.)
- **요청 가능한 사람**: 현재 소유자 한 명. `warranties.owner_user_id` = 로그인한 `user_id`.
- **토큰/QR**: 양도 후에도 **동일한 토큰(public_id)** 유지. 소유자만 바뀜.

---

### 10.2 양도 요청 (현재 소유자) — 디테일

1. **진입**
   - 내 보증서 목록: `my-warranties.html` + `my-warranties.js`.
   - `status === 'active'` 인 보증서에만 **「양도하기」** 버튼 노출 (`handleTransfer(warrantyId)`).

2. **클릭 시**
   - `prompt()` 로 **수령자 이메일** 입력.
   - 확인 후 `POST /api/warranties/:warrantyId/transfer` 호출.
   - Body: `{ "to_email": "수령자이메일" }`. 인증: JWT(쿠키).

3. **백엔드 처리** (`warranty-routes.js` POST `/warranties/:warrantyId/transfer`)
   - **입력 검증**: `to_email` 필수, 이메일 형식 정규식 검사.
   - **트랜잭션 시작**, `warranties` 조회: `WHERE id = ? FOR UPDATE` (여기서 `warrantyId` = `warranties.id`).
   - **소유자 일치**: `warranty.owner_user_id === req.user.userId`. 불일치 시 403 NOT_OWNER.
   - **상태 확인**: `warranty.status === 'active'`.  
     그 외(revoked, issued, issued_unassigned, suspended)면 400 + 메시지(환불됨/미활성/제재 등).
   - **진행 중인 양도 방지**:  
     `warranty_transfers` 에서 같은 `warranty_id` 에  
     `status IN ('requested','accepted')` 이고 `expires_at > NOW()` 인 행이 있으면  
     409 TRANSFER_ALREADY_EXISTS — "이미 진행 중인 양도 요청이 있습니다".
   - **7자리 코드 생성**: `crypto.randomInt` 로 0–9, A–Z 중 7자. 72시간 유효.
   - **DB 기록**:  
     `warranty_transfers` 에 INSERT  
     `(warranty_id, from_user_id, to_email, transfer_code, status, expires_at, requested_at)`  
     = `(warrantyId, userId, to_email.trim(), transferCode, 'requested', NOW()+72h, NOW())`.
   - **양도 링크**:  
     `{FRONTEND_URL}/warranties/transfer/accept?transfer_id={transferId}&code={transferCode}`.
   - **이메일**: `sendTransferRequestEmail(to_email, { transferCode, transferLink, warrantyPublicId })` 로 수령자에게 발송.  
     실패해도 양도 요청 레코드는 유지(트랜잭션 커밋).
   - **응답**: 201 + `{ transfer_id, transfer_code, expires_at, to_email }`.

4. **프론트**
   - "양도 요청이 생성되었습니다. 수령자에게 이메일이 발송되었습니다." 알림 후 보증서 목록 새로고침.

---

### 10.3 양도 수락 (수령자) — 디테일

1. **진입**
   - 수령자가 이메일의 **양도 링크** 클릭  
     → `/warranties/transfer/accept?transfer_id=...&code=...` (또는 `transfer_id` 만 있고 코드는 이메일 본문에만 있는 경우도 가능).

2. **페이지**
   - `warranty-transfer-accept.html` + `warranty-transfer-accept.js`.
   - URL에서 `transfer_id`, `code` 추출. `transfer_id` 없으면 에러 메시지.

3. **로그인**
   - 비로그인이면 `returnTo` 에 현재 URL 넣고 로그인 페이지로 리다이렉트.  
     로그인 후 다시 이 페이지로 복귀.

4. **코드 입력**
   - 7자리 **양도 코드** 입력. (URL에 `code` 가 있어도 자동 입력하지 않고, placeholder 힌트만 줄 수 있음 — 보안.)

5. **수락 버튼**
   - 확인 다이얼로그 후  
     `POST /api/warranties/transfer/accept`  
     Body: `{ "transfer_id": 숫자, "transfer_code": "7자리문자" }`, 인증: JWT.

6. **백엔드 처리** (트랜잭션, FOR UPDATE)
   - **입력 검증**: `transfer_id` 필수, `transfer_code` 문자열 7자리.
   - **warranty_transfers 락**:  
     `WHERE transfer_id = ? AND status = 'requested' AND expires_at > NOW()`  
     `SELECT ... FOR UPDATE`.  
     없으면 400 INVALID_TRANSFER_REQUEST — "유효하지 않은 양도 요청입니다. (만료되었거나 이미 처리되었습니다)".
   - **코드 일치**: `transfer.transfer_code === transfer_code.trim()`.
   - **이메일 일치**: 로그인한 `user_id` 의 `users.email` === `transfer.to_email`.  
     다른 계정으로 수락 방지. 불일치 시 403 EMAIL_MISMATCH.
   - **보증서 재확인**:  
     `warranties` 에서 해당 `warranty_id` ( = `transfer.warranty_id`) FOR UPDATE.  
     - `owner_user_id === transfer.from_user_id` (요청 후 소유자가 바뀌지 않았는지).  
     - `status === 'active'`.  
     불일치 시 400 OWNER_CHANGED / WARRANTY_NOT_ACTIVE.
   - **소유자 변경**:  
     `UPDATE warranties SET owner_user_id = ? WHERE id = ? AND owner_user_id = ? AND status = 'active'`  
     (파라미터: toUserId, transfer.warranty_id, transfer.from_user_id).  
     **affectedRows === 1** 검증. 실패 시 500 OWNERSHIP_UPDATE_FAILED.
   - **양도 완료 처리**:  
     `UPDATE warranty_transfers SET status = 'completed', to_user_id = ?, completed_at = NOW() WHERE transfer_id = ? AND status = 'requested'`.  
     **affectedRows === 1** 검증. 실패 시 500 TRANSFER_STATUS_UPDATE_FAILED.
   - **이벤트 기록**:  
     `warranty_events` 에  
     `(warranty_id, event_type, old_value, new_value, changed_by, changed_by_id, reason)`  
     = `(transfer.warranty_id, 'ownership_transferred', JSON { owner_user_id: from }, JSON { owner_user_id: to }, 'user', toUserId, '양도 수락: from → to')`.  
     INSERT 실패 시 트랜잭션 롤백, 500 EVENT_LOG_FAILED.
   - **warranties.status** 는 그대로 **active** (재활성화 없음).

7. **응답**
   - 200 + `{ warranty_id, transfer_id, from_user_id, to_user_id, completed_at }`.  
     수령자 화면에 "양도가 완료되었습니다" 등 성공 메시지.

---

### 10.4 양도 후 정책

- **1토큰 = 1소유자**: 한 보증서(한 토큰)는 동시에 한 명만 소유자.
- **이전 소유자**: 해당 보증서는 마이페이지 목록에서 사라지고, QR/상세 접근 시 소유자 불일치로 거부.
- **새 소유자**: 즉시 "내 보증서"에 표시, QR/상세 사용 가능.  
  이미 `active` 이므로 **인보이스 연동 확인이나 재활성화는 하지 않음**.

---

### 10.5 만료·중복·취소

- **만료**: 7자리 코드는 **72시간** 유효. `expires_at > NOW()` 가 false 이면 수락 시 400.  
  (배치로 `warranty_transfers.status` 를 `expired` 로 바꾸는 로직은 설계 문서에는 있으나, 현재 코드에는 없을 수 있음.)
- **중복 요청 방지**: 같은 보증서에 `requested` / `accepted` 이면서 만료 전인 행이 있으면 새 요청 시 409.
- **취소**: 설계상 "요청자가 requested 상태에서 취소 → status = 'cancelled'" 로 되어 있으나,  
  **현재 코드에는** `POST /api/warranties/transfer/:transferId/cancel` 같은 **취소 API는 없음.**  
  (관리자 CLI 로의 양도는 별도 플로우 — `admin-cli.js` warranty:transfer.)

---

### 10.6 구현 참고 (키 값·검증 순서)

| 구분 | 내용 |
|------|------|
| 보증서 PK | `warranties.id` (라우트의 `:warrantyId` 는 이 값) |
| 양도 요청 PK | `warranty_transfers.transfer_id` |
| 코드 | 7자, 0–9·A–Z, 72시간 유효 |
| 수락 시 검증 순서 | transfer 락 → 코드 → 수령자 이메일 → 보증서 소유자/상태 → warranties UPDATE (affectedRows=1) → warranty_transfers UPDATE (affectedRows=1) → warranty_events INSERT |

상세 SQL·원자적 조건 예시는 `SYSTEM_FLOW_DETAILED.md` 5절 참조.

---

## 11. 주문 흐름 완벽 구현 — 구현 순서

**목적**: 주문·결제·비회원·인보이스·보증서까지 한 번에 완성하려면 **무엇부터 할지** 순서대로 정리.  
**선행 조건**: 각 단계는 아래 순서를 지키면 의존성 충돌 없이 진행 가능.

---

### 11.1 순서 요약 (한눈에)

| 순서 | 항목 | 선행 | 비고 |
|------|------|------|------|
| 0 | 정리 작업 (데드 코드·커넥션·주석) | 없음 | 선택, 먼저 하면 안정적 |
| 1 | **비회원 결제 확인(confirm)** | 없음 | order-complete·이메일 수신의 관문 |
| 2 | **보증서 활성화 상세 경고 문구** | 없음 | 정책·고지 의무 |
| 3 | **인보이스 PDF 다운로드** | 1 | 비회원은 조회 없이 PDF만. guest 세션·order_number로 검증 후 PDF 반환 |
| 4 | **통합 주문 상세 페이지** | 1, 3 권장 | 8.1·8.2 정책 충족, 선택적이지만 권장 |

---

### 11.2 단계별 상세

#### 0단계: 정리 작업 (선택)

- **목적**: 새 기능 넣기 전에 코드·리소스 정리.
- **내용**:
  - **9.1** `payments-routes.js` — `existingPaidEvents.length > 0` 블록 안의 데드 코드(항상 false 분기) 제거.
  - **9.3** `payments-routes.js` confirm — 이메일 발송용 `emailConnection` 을 `try/finally` 로 감싸 모든 경로에서 `end()` 보장.
  - **9.5** `order-routes.js` claim-token — "TODO: 구현 필요" 주석을 "guest_session_token 쿠키로 검증함" 등 실제 동작에 맞게 수정.
  - **(선택)** **9.2** `csrf-middleware.js` — `console.log`/`console.warn` → Logger, 프로덕션에서 토큰 접두어 로깅 최소화.
- **선행**: 없음.  
- **검증**: confirm(회원)·guest 세션·claim 기존 동작 유지.

---

#### 1단계: 비회원 결제 확인(confirm) — 최우선

- **목적**: 비회원이 order-complete 에서 결제 확인·주문 정보·주문 확인 이메일·guest_access_token 을 받을 수 있게 함. (4.1)
- **선행**: 없음.
- **작업**:
  1. **백엔드** `POST /api/payments/confirm`  
     - `authenticateToken` → **optionalAuth** 로 변경.  
     - `req.user` 없을 때: `order_number` + **`user_id IS NULL`** 인 주문만 조회.  
     - 처리 후 응답에 **`guest_access_token`** 포함 (비회원일 때만).
  2. **프론트** `order-complete-script.js`  
     - confirm 응답에 `guest_access_token` 이 있으면, 이후 주문 상세/이메일 링크용으로 사용 (예: `/api/guest/orders/session?token=...` 로 리다이렉트하거나 URL에 붙여서 guest 주문 상세로 유도).
- **산출물**: 비회원 결제 완료 → order-complete 에서 주문 정보 표시·이메일 수신·비회원 전용 링크 진입 가능.
- **검증**: 비로그인 상태로 체크아웃 → 토스 결제 → order-complete 에서 주문 번호·금액·이메일 수신 여부 확인.

---

#### 2단계: 보증서 활성화 상세 경고 문구

- **목적**: 활성화 전 고지 의무 충족. (4.3)
- **선행**: 없음 (1단계와 병렬 가능).
- **작업**:
  - **프론트** `my-warranties.js`  
    - 활성화 버튼 클릭 시 **모달** 표시.  
    - 문서 요구 문구 2종 포함:  
      - "보증서 미활성 상태에서만 전자상거래법에 따른 청약철회가 가능합니다."  
      - "보증서를 활성화하면 해당 상품은 사용 개시로 간주되어 ... 교환 및 환불이 제한됩니다."  
    - **동의 체크박스** 후에만 "활성화" 실행.  
    - 기존 "활성화된 보증서는 양도 및 환불 정책이 적용됩니다." 문구 유지·보완.
- **산출물**: 활성화 전 상세 경고 + 동의 체크 후 활성화.
- **검증**: 활성화 클릭 → 모달·체크박스 → 동의 후에만 API 호출.

---

#### 3단계: 인보이스 PDF 다운로드

- **목적**: 비회원이 주문 상세에서 **인보이스 PDF만** 다운로드. (4.5, 8.4)  
  **비회원은 인보이스 “조회”(화면 표시)는 하지 않음. PDF 다운로드만 제공.**
- **선행**: 1단계(비회원 confirm·guest 세션 흐름 확정). 별도 “인보이스 조회 API” 없이 PDF 엔드포인트만 구현하면 됨.
- **작업**:
  1. **백엔드**  
     - `GET /api/guest/orders/:orderNumber/invoice/pdf`  
     - `GET /api/guest/orders/:orderNumber` 와 **동일한** guest 세션·order_number 검증.  
     - 해당 주문의 인보이스 1건을 서버에서 조회 후 PDF로 생성해 반환 (`Content-Type: application/pdf`, `Content-Disposition: attachment`).
  2. **프론트**  
     - 주문 상세(guest/orders 또는 통합 페이지)의 "PDF 다운로드" 버튼 → 위 URL 호출 (`credentials: 'include'`) → blob 다운로드.  
     - `guest/orders.js` 의 `downloadInvoice` TODO 제거 후 위 API 연동.
- **산출물**: 비회원 주문 상세에서 인보이스 PDF 다운로드만 가능.
- **검증**: guest 세션 → 주문 상세 → PDF 다운로드 버튼 → 파일 저장.

---

#### 4단계: 통합 주문 상세 페이지 (선택이지만 권장)

- **목적**: 이메일 Secure 링크가 **비회원/회원 구분 없이 같은 하나의 페이지**로 연결되도록 함. (4.4, 8.1·8.2)
- **선행**: 1단계 필수. 3단계(PDF)까지 해두면 "같은 페이지"에 주문·PDF 다운로드·등록하기를 넣기 좋음.
- **작업**:
  - **통합 주문 상세 페이지** 1개 추가 (예: `order-detail.html`).  
  - 진입:  
    - **guest**: 이메일 링크 → `/api/guest/orders/session?token=...` → 쿠키 발급 후 이 페이지로 이동, `orderNumber` 등 파라미터로 표시.  
    - **회원**: 로그인 후 "내 주문"에서 진입 시 `GET /api/orders/:orderId` (JWT).  
  - 페이지 내 분기: guest 세션 쿠키 있으면 guest API, 없으면 JWT로 회원 API. 한 번에 한 경로만 사용.  
  - 구성: 주문 요약, 디지털 인보이스(**PDF 다운로드 버튼만**, 조회 UI 없음), 디지털 보증서·등록하기(Claim), 배송, 브랜드 메시지 등 (8.2 참고).
- **산출물**: 이메일 링크 = 통합 주문 상세 페이지 하나. 비회원/회원 동일 URL 정책 충족.
- **검증**: 이메일 링크 클릭 → 통합 페이지, guest 세션으로 주문·PDF 다운로드·등록하기 동작. 회원은 내 주문에서 같은 페이지 형태로 진입 가능.

---

### 11.3 의존 관계 (간단)

```
0(정리) ──────────────────────────────────────────► (선택)
1(비회원 confirm) ──► 3(PDF 다운로드)
       │
       └──► 4(통합 주문 상세) [1 필수, 3 있으면 PDF 버튼까지 넣기 좋음]
2(보증서 경고) ────────────────────────────────────► (독립)
```

---

### 11.4 권장 진행 순서 (한 줄)

**0(정리) → 1(비회원 confirm) → 2(보증서 경고) → 3(PDF 다운로드) → 4(통합 주문 상세).**  
2는 1과 병렬 가능. 비회원 인보이스는 **조회 API·UI 없이 PDF 다운로드만** 구현.  
**기술적 Phase**(토큰 헬퍼 → confirm·webhook 리팩터 → POST 세션·Rate limit·알림)는 **15.6절** 참고.

---

## 12. 비회원 결제 확인(confirm) — 코드 분석 및 구현 방안

**목적**: 현재 주문·결제 흐름을 코드 기준으로 꼼꼼히 확인하고, 문제점·비효율·보안·보완점을 파악한 뒤, 비회원 결제 확인을 **구체적으로** 어떻게 진행할지 정리.

---

### 12.1 현재 주문·결제 흐름 (코드 기준)

1. **체크아웃·주문 생성**  
   - `checkout-payment.js`: `sessionStorage.checkoutShippingData` 기반으로 `createOrderPayload` → `POST /api/orders` (optionalAuth, verifyCSRF, orderCreationLimiter, X-Idempotency-Key).  
   - 비회원이면 `req.user = null`, `guest_id` 생성 후 주문 INSERT (`user_id IS NULL`).

2. **결제 위젯**  
   - `checkout-payment.js`: `successUrl = origin + '/order-complete.html?orderId=' + orderNumber + '&amount=' + amount` (실제 토스 모드).  
   - **paymentKey는 토스가 리다이렉트 시 쿼리에 추가.**  
   - **guestToken은 successUrl에 없음** (MOCK 모드에서만 confirm 응답 후 redirect 시 URL에 붙임).

3. **order-complete 진입**  
   - `order-complete-script.js`: URL에서 `paymentKey`, `orderId`, `amount` 추출.  
   - `fetchAuthStatus()` (GET `/api/auth/status`) 호출 후, `paymentKey && orderId && amount` 이면 **회원/비회원 구분 없이** `handleTossPaymentSuccess(paymentKey, orderId, amount)` 호출.

4. **결제 확인 API**  
   - `handleTossPaymentSuccess` → `POST /api/payments/confirm` (Body: orderNumber, paymentKey, amount), `credentials: 'include'`, `secureFetch`(X-XSRF-TOKEN 자동 첨부).  
   - **백엔드** `payments-routes.js`:  
     - **`authenticateToken`** 필수 → **비회원은 401** (accessToken 쿠키 없음).  
     - 통과 시 주문 조회: **`WHERE order_number = ? AND user_id = ?`** → 비회원 주문(`user_id IS NULL`)은 **절대 매칭 안 됨** (404).

5. **이후 처리(회원만 도달)**  
   - paid_events 선확인, 토스 Confirm API, payments INSERT, paid_events 생성, processPaidOrder(재고·order_item_units·warranties·invoices·**guest_order_access_tokens**), 이메일, 응답에 **guest_access_token** 포함.  
   - `processPaidOrder`는 **회원/비회원 구분 없이** `guest_order_access_tokens` 에 토큰 생성하고 `orderInfo.guest_access_token` 으로 반환.

6. **프론트 수신 후**  
   - `order-complete-script.js`: `result.data.user_id` 있으면 `loadOrderDetails`, `result.data.guest_access_token` 있으면 `loadGuestOrderDetails(orderId, guestToken)`.  
   - 비회원은 현재 **confirm 자체가 401/404** 이므로 여기까지 도달하지 못함.

---

### 12.2 문제점 (비회원 결제가 되지 않는 이유)

| 구분 | 위치 | 내용 |
|------|------|------|
| **인증** | `payments-routes.js` 68줄 | `router.post('/payments/confirm', authenticateToken, ...)` → 비회원은 **401** 반환. |
| **주문 조회** | `payments-routes.js` 109~116줄 | `WHERE order_number = ? AND user_id = ?` → 비회원 주문(`user_id IS NULL`)은 **404**. |
| **결과** | - | 비회원이 order-complete에서 confirm 호출 시 **401 또는 404** → 주문 정보·이메일·guest_access_token 수신 불가. |

---

### 12.3 비효율·보완 필요

| 구분 | 위치 | 내용 | 권장 |
|------|------|------|------|
| **데드 코드** | `payments-routes.js` 163~260줄 | `if (existingPaidEvents.length > 0)` 블록 **안**에 `if (existingPaymentStatus === 'captured' && existingPaidEvents.length === 0)` → **항상 false**. | 해당 분기 제거. |
| **이미 처리됨 응답** | `payments-routes.js` 264~287줄 | "이미 처리됨" 반환 시 **user_id, guest_access_token 미포함**. 비회원이 재호출 시 주문 타입 구분 불가. | 응답에 `user_id`, `guest_access_token`(비회원 시) 포함. |
| **장바구니 조회** | 263~270줄 | `WHERE c.user_id = ?` 에 `userId = null` 바인딩 시 SQL 의미상 **매칭 없음** → cartCleared = true. 비회원은 의도대로 동작. | optionalAuth 도입 시 **userId null일 때** 이 쿼리만 별도 처리(예: cartCleared = false 또는 스킵)해도 됨. |
| **이메일 커넥션** | 666~691줄 | 이메일용 별도 connection, 예외 시 **end() 미호출** 경로 가능. | `finally { if (emailConnection) await emailConnection.end(); }` 로 보장. |

---

### 12.4 보안

| 구분 | 내용 | 비회원 confirm 시 |
|------|------|-------------------|
| **수평 권한** | 주문은 **order_number + user_id(또는 user_id IS NULL)** 로만 조회해야 함. | 비회원은 **order_number + user_id IS NULL** 한 건만 조회. 다른 회원/비회원 주문 접근 불가. |
| **결제 증거** | 토스 Confirm API는 **paymentKey + orderId + amount** 로 1회 승인. 동일 paymentKey 재사용 시 토스가 거절. | 기존과 동일. |
| **CSRF** | confirm은 **verifyCSRF** 적용. 비회원은 order-complete 로드 시 `fetchAuthStatus()`(GET)로 **xsrf-token** 쿠키 발급 가능 → secureFetch가 헤더에 포함. | optionalAuth로 바꿔도 **verifyCSRF 유지** 권장. (GET으로 먼저 들어와야 하므로 공격면 축소.) |
| **정보 노출** | 404 시 "주문을 찾을 수 없습니다" → order_number 유효성만 알 수 있음. | 동일 메시지로 유지. |

---

### 12.5 비회원 confirm 구체적 구현 방안

#### 1) 백엔드: `payments-routes.js`

- **미들웨어 변경**  
  - `authenticateToken` → **optionalAuth**.  
  - (선택) **verifyCSRF** 유지. 비회원은 order-complete에서 GET(`auth/status`) 후 POST하므로 쿠키 발급 가능.

- **주문 조회 분기**  
  - `req.user` 있음 → 기존: `WHERE order_number = ? AND user_id = ?`, `[orderNumber, userId]`.  
  - `req.user` 없음(비회원) → **`WHERE order_number = ? AND user_id IS NULL`**, `[orderNumber]`.  
  - **한 건만** 조회(LIMIT 1). 없으면 404.

- **userId 사용처**  
  - **장바구니 조회**(263~270줄): `userId`가 null이면 **쿼리 스킵**하고 `cartCleared = false`(또는 의미상 "해당 없음")로 두면 됨.  
  - **이메일·응답**의 `order.user_id`는 이미 DB 값이라 비회원이면 null.  
  - **응답** `user_id: order.user_id`, `guest_access_token: paidResult?.data?.orderInfo?.guest_access_token` 그대로 두면 됨.

- **"이미 처리됨" 분기**  
  - `existingPaidEvents.length > 0` 인 경우, **같은 order**에 대해 **guest_access_token** 조회(guest_order_access_tokens 테이블에서 해당 order_id의 유효 토큰 1개).  
  - 응답에 **user_id: order.user_id**, **guest_access_token: (비회원이면 위에서 조회한 값)** 포함.  
  - **데드 코드** `existingPaymentStatus === 'captured' && existingPaidEvents.length === 0` 블록 **삭제**.

- **에러 처리**  
  - connection/transaction 실패·롤백 시에도 **emailConnection** 있으면 **finally**에서 **end()** 호출.

#### 2) 프론트: `order-complete-script.js`

- **현재**  
  - confirm 성공 시 `result.data.user_id` / `result.data.guest_access_token` 로 회원/비회원 분기, `loadGuestOrderDetails(orderId, guestToken)` 호출.  
  - **변경 없이** 백엔드만 수정하면, 비회원은 confirm 200 + guest_access_token 수신 → `loadGuestOrderDetails(orderId, guestToken)` 호출 가능.

- **선택**  
  - confirm 401 시 메시지: "결제 확인에 실패했습니다. 주문 확인 이메일의 링크로 접속해 주세요." 등으로 **비회원 유도** 문구 보강.

#### 3) 검증 순서 (비회원 경로)

1. optionalAuth → `req.user = null`.  
2. Body: orderNumber, paymentKey, amount 검증.  
3. 주문 조회: `WHERE order_number = ? AND user_id IS NULL` → 1건.  
4. paid_events 선확인 → 있으면 "이미 처리됨" + **guest_access_token** 조회 후 응답.  
5. 없으면 토스 Confirm API, payments INSERT, paid_events 생성, processPaidOrder (guest_order_access_tokens 생성), 이메일, 응답에 **guest_access_token** 포함.  
6. 프론트: guest_access_token으로 `loadGuestOrderDetails` → 세션 교환 또는 직접 guest 주문 상세 표시.

#### 4) 주의사항

- **동일 order_number에 대한 동시 요청**: 회원/비회원이 동시에 confirm 호출하는 경우는 없음(한 주문은 한 명만 결제). 비회원 주문은 `user_id IS NULL`로만 조회하므로 **다른 회원 주문과 혼선 없음**.  
- **이미 처리됨**인데 guest_access_token을 응답에 넣으려면, **guest_order_access_tokens**에서 해당 order_id·만료·미회수 조건으로 1건 SELECT해 사용.

---

### 12.6 정리 (할 일 체크리스트)

- [ ] **payments-routes.js**: confirm 라우트 `authenticateToken` → **optionalAuth**.  
- [ ] **payments-routes.js**: 주문 조회를 **req.user 유무에 따라** `user_id = ?` vs `user_id IS NULL` 분기.  
- [ ] **payments-routes.js**: **이미 처리됨** 응답에 **user_id**, **guest_access_token**(비회원 시, guest_order_access_tokens에서 조회) 포함.  
- [ ] **payments-routes.js**: 데드 코드 **`existingPaymentStatus === 'captured' && existingPaidEvents.length === 0`** 블록 제거.  
- [ ] **payments-routes.js**: 장바구니 조회 시 **userId가 null이면** 쿼리 스킵, cartCleared 처리.  
- [ ] **payments-routes.js**: 이메일 발송용 connection **finally**에서 **end()** 보장.  
- [ ] **프론트**: order-complete는 **현재 로직 유지** (confirm 성공 시 guest_access_token으로 loadGuestOrderDetails).  
- [ ] **검증**: 비로그인 체크아웃 → 토스 결제 → order-complete에서 주문 정보 표시·이메일 수신·주문 상세 링크 동작 확인.

---

## 13. Gemini 코드 리뷰 토론 및 결론

**전제**: Gemini는 우리 코드·환경을 직접 보지 못함. 아래는 동등한 코드 리뷰어 입장에서 **실제 코드를 확인한 뒤** 받아들일지·유보·반론·추가로 챙길 점을 정리한 것.  
**실행 시**: 최종 구현 목표·체크리스트는 **14절(14.8)·15절(15.6·15.7)** 과 **11절·12절(12.6)** 을 따를 것.

---

### 13.1 보안 — 토큰 URL 노출 (GET /api/guest/orders/session?token=xxx)

| Gemini 지적 | 우리 검증 | 결론 |
|-------------|-----------|------|
| URL 파라미터 토큰은 로그·Referer로 유출 가능. POST + Body로 변경, 세션은 httpOnly 쿠키로. | 9.2절에서 이미 동일 위험 명시. `order-routes.js` 1461줄 GET, 이메일·order-complete-script.js에서 모두 이 URL 사용. | **받아들임.** 방향은 맞음. 단, **이메일 링크 UX** 변경 필요: 링크를 "랜딩 페이지(예: guest-order-access.html?token=xxx)"로 두고, 그 페이지에서 **POST**로 토큰 전달 후 302로 주문 상세 이동하는 구조로 바꿔야 함. 즉시 적용보다는 **보안 개선 백로그**로 두고, 단기에는 **로그/모니터링에서 token 값 로깅 금지**로 완화 가능. |

---

### 13.2 보안 — 양도 코드(transfer_code) 브루트포스

| Gemini 지적 | 우리 검증 | 결론 |
|-------------|-----------|------|
| 7자리 코드는 조합 수 제한. transfer/accept에 IP 또는 transfer_id 기준 Rate Limiter(예: 5회 실패 시 30분 잠금) 적용. | `warranty-routes.js` 566줄: `POST /warranties/transfer/accept`에 **별도 rate limit 없음**. 전역 API limiter만 적용. | **받아들임.** transfer/accept 전용 rate limit(예: IP당 또는 transfer_id당 N회/분, 실패 시 잠금) 추가 권장. 12절 구현과 독립이므로 **별도 작업**으로 진행. |

---

### 13.3 데이터 무결성 — DB 커넥션 누수 (emailConnection)

| Gemini 지적 | 우리 검증 | 결론 |
|-------------|-----------|------|
| emailConnection 예외 시 end() 누락 → Connection Pool Exhaustion. finally로 반환 보장. | `payments-routes.js` 666~691: try 안에서 `emailConnection.end()` 호출. **execute()에서 예외 시 end() 미호출.** 1444줄 등 다른 경로도 동일 패턴. | **받아들임.** `try { ... } finally { if (emailConnection) await emailConnection.end(); }` 적용. 9.3·12.3·12.6에 이미 반영되어 있음. **12절 구현 시 반드시 포함.** |

---

### 13.4 processPaidOrder 실패 시 알림·큐

| Gemini 지적 | 우리 검증 | 결론 |
|-------------|-----------|------|
| 복구 스크립트만으로 부족. Slack/Discord 등 Alerting, 장기적으로 메시지 큐 + 재시도 자동화. | 문서 9.4: paid_events는 별도 커넥션으로 먼저 생성, processPaidOrder 실패 시 복구 스크립트로 재처리. 프로젝트 규칙: "개발/테스트 단계". | **방향 받아들임, 우선순위는 단계적.** 현재는 개발/테스트 단계이므로 즉시 큐 도입은 과할 수 있음. **Alerting(실패 시 알림)** 은 적용 권장. 메시지 큐·자동 재시도는 **장기 개선**으로 문서에만 명시해 두고, 12절 범위에서는 제외. |

---

### 13.5 주문 목록 N+1 쿼리

| Gemini 지적 | 우리 검증 | 결론 |
|-------------|-----------|------|
| GET /api/orders에서 주문 수만큼 order_items SELECT → 즉시 수정. WHERE order_id IN (...) 1회 조회 후 매핑. | `order-routes.js` 771~806: 주문 목록 조회 후 `Promise.all(orders.map(...))` 로 **각 order마다** order_items SELECT. N+1 확인됨. | **받아들임.** 9.3에 이미 기재. 주문 ID 배열로 `WHERE order_id IN (...)` 일괄 조회 후 앱에서 매핑. 12절과 무관하므로 **별도 이슈**로 수정. |

---

### 13.6 Claim 2단계(claim-token → claim) 오버엔지니어링 여부

| Gemini 지적 | 우리 검증 | 결론 |
|-------------|-----------|------|
| 이미 JWT + guest_session_token이 있으면 claim_token 없이 POST /claim 한 번으로 처리 가능. 2단계는 불필요한 왕복. | `order-routes.js`: claim-token은 guest_session_token + order_id 일치 검증 후 **1회성·30분 만료** claim_token 발급. claim은 claim_token 소비 + JWT의 user_id로 orders.user_id 갱신. **UPDATE ... WHERE user_id IS NULL** 이므로 재전송 시 affectedRows=0 → 409. | **반론 유지.** claim_token은 **1회성 논스**로, "이 세션에서 이 주문을 이 사용자에게 연동한다"는 의도를 한 번만 실행하게 함. 단일 POST + 멱등성 키로 대체 가능하지만, 현재 구조도 보안상 문제 없고 재전송 방어에 기여함. **단일화는 선택적 개선**, 우선순위 낮음. |

---

### 13.7 12절 구현 디테일 (이미 처리된 결제 시 guest_access_token)

| Gemini 지적 | 우리 검증 | 결론 |
|-------------|-----------|------|
| "이미 처리됨" 분기에서 guest_access_token 조회 시 **만료·미회수(expires_at > NOW(), revoked_at IS NULL)** 조건 필수. 만료된 토큰 반환 시 프론트 오류·무한 루프 가능. | 12.6에 "guest_order_access_tokens에서 해당 order_id·만료·미회수 조건으로 1건 SELECT"라고만 되어 있음. `paid-order-processor.js` 616~621, 664~668에서는 **expires_at > NOW() AND revoked_at IS NULL** 사용. `payments-routes.js` 1414~1416(webhook 경로)은 **revoked_at IS NULL만** 있고 **expires_at 조건 없음** → 버그 가능성. | **받아들임.** 12절 구현 시 "이미 처리됨" 응답용 토큰 조회에 **반드시** `expires_at > NOW() AND revoked_at IS NULL` 포함. 추가로 **webhook/이메일 복구 경로(1414~1416)** 에도 `expires_at > NOW()` 조건이 빠져 있으므로, 별도로 **수정 대상**으로 기록. |

---

### 13.8 데드 코드 제거·Cart 스킵

| Gemini 지적 | 우리 검증 | 결론 |
|-------------|-----------|------|
| existingPaymentStatus === 'captured' && existingPaidEvents.length === 0 블록 삭제. 비회원 시 장바구니 조회 스킵. | 9.1·12.3·12.6에 이미 반영. | **받아들임.** 12절 구현 시 함께 반영. |

---

### 13.9 우리가 추가로 챙길 점 (놓치지 말 것)

- **이미 처리됨 분기**: guest_access_token 조회 시 **expires_at > NOW() AND revoked_at IS NULL** 명시. 만료/회수된 토큰 절대 반환 금지.
- **payments-routes.js webhook/복구 경로**: `guest_order_access_tokens` 조회 시 **expires_at > NOW()** 조건이 빠진 곳(1414~1416 등)이 있으면 동일 조건 추가.
- **emailConnection**: confirm·webhook·inicis 등 **모든** 이메일 발송 블록에 `finally { if (emailConnection) await emailConnection.end(); }` 적용.
- **비회원 confirm**: optionalAuth 도입 시 **cartCleared**용 장바구니 쿼리는 **userId가 null이면 실행하지 않고** cartCleared = false(또는 해당 없음) 처리.

---

## 14. 운영 전 목표: 이상적·효율적·보안 구조 (단기/장기 구분 없음)

**원칙**: 쇼핑몰 운영 전에 **한 번에** 완성도·효율·보안을 갖춘 구조로 만든다. 단기 타협 없이, 코드 리뷰어·개발자 입장에서 **가장 이상적이고 해킹/보안 리스크가 최소인 설계**를 목표로 한다.

---

### 14.1 현재 환경 확인 (코드 기준)

- **DB 커넥션**: 전역적으로 **mysql.createConnection(dbConfig)** 만 사용. **createPool / getConnection() 미사용.**  
  → 커넥션은 요청 단위로 생성·종료이므로 **.end()** 가 맞다.  
  → 나중에 **Connection Pool** 도입 시에는 풀에서 가져온 커넥션에 한해 **.release()** 사용(.end()는 풀 커넥션을 파괴함). 지금은 .end() 유지.

---

### 14.2 보안 — 토큰이 URL에 노출되지 않도록 (이메일 링크·봇 스캔 대비)

| 위험 | 대응 (이상적 구조) |
|------|---------------------|
| 토큰이 쿼리스트링에 있으면 서버 로그·Referer·히스토리에 남음 | **세션 교환을 GET이 아닌 POST로만 수행.** 토큰은 **Request Body**로만 전달. |
| 이메일 링크를 메일 서버/보안 봇이 먼저 GET으로 호출(Link Scanning) 가능 | 이메일 링크는 **랜딩 페이지 URL**로만 둔다. 랜딩 페이지가 로드될 때 **클라이언트에서** POST /api/guest/orders/session에 토큰을 **body**로 전송하므로, 봇이 링크를 GET만 해도(JS 미실행) 세션 API가 호출되지 않음. 랜딩 URL에 토큰을 쿼리로 넣을 수 있으나, **API는 GET으로 토큰을 받지 않음.** |
| 1회성 로직이 GET에 묶여 있으면 봇에 의해 소모됨 | 1회성은 **POST + Body**에서만 처리. GET 세션 교환은 제거. |

**구현 방향**

1. **POST /api/guest/orders/session**  
   - Body: `{ "token": "guest_order_access_token" }`  
   - 검증: `expires_at > NOW() AND revoked_at IS NULL` (아래 14.3 상수 사용).  
   - 성공 시: `guest_session_token` httpOnly·Secure·SameSite=Strict 쿠키 설정 후 200 + `{ redirectUrl: "/guest/orders.html?order=..." }` 또는 302 리다이렉트.

2. **이메일 링크**  
   - **옵션 A**: 이메일 링크 = 랜딩 페이지 URL (예: `https://도메인/guest-order-access.html?token=xxx`). **guest-order-access.html** 로드 시 클라이언트에서 **POST** /api/guest/orders/session에 token을 body로 전송 → 응답의 redirectUrl로 이동. (봇이 GET만 하면 API 미호출.)  
   - **옵션 B**: 링크를 `https://도메인/guest-order-access.html` 로만 두고, 사용자가 이메일 본문의 코드/토큰을 페이지에 입력 후 POST. (UX가 무거우면 A 권장.)

3. **하위 호환**  
   - 기존 GET `/api/guest/orders/session?token=xxx` 는 **deprecate** 후 제거. 또는 GET은 "토큰 없음"이면 400, 있으면 302 유지하되 **로그·모니터링에서 token 값 절대 로깅 금지**로 완화만 하고, 신규 코드는 POST만 사용.

---

### 14.3 데이터 무결성 — 유효 토큰 조건 단일 정의 (휴먼 에러 방지)

| 문제 | 대응 |
|------|------|
| confirm, webhook, inicis, order-routes 등에서 **guest_order_access_tokens** 조회 시 **expires_at** 누락·불일치 | **한 곳에서만** 유효 조건을 정의하고, 모든 조회가 이를 사용한다. |

**구현**

- **상수 또는 유틸** (예: `backend/utils/guest-token-helpers.js` 또는 `payments-routes.js` 상단):  
  `const GUEST_ORDER_TOKEN_VALID_CONDITION = 'expires_at > NOW() AND revoked_at IS NULL';`  
  또는  
  `function selectValidGuestTokenSql(alias = 'got') { return \`${alias}.expires_at > NOW() AND ${alias}.revoked_at IS NULL\`; }`
- **사용처**  
  - confirm "이미 처리됨" 분기에서 guest_access_token 조회  
  - webhook/복구 경로(payments-routes.js 1414~1416 등)  
  - order-routes GET /guest/orders/session (토큰 검증 시)  
  - paid-order-processor 기존 로직과 동일 조건으로 통일  
- **SQL 작성 시**  
  - `WHERE order_id = ? AND ${GUEST_ORDER_TOKEN_VALID_CONDITION}` 또는 유틸 반환 조건을 붙여서 **하드코딩 금지**.

---

### 14.4 리소스 — 커넥션 누수 방지

- **이메일 발송용 등 보조 커넥션**:  
  `try { ... } finally { if (emailConnection) await emailConnection.end(); }`  
  (현재는 풀 미사용이므로 .end(). 추후 풀 사용 시 해당 커넥션만 .release()로 변경.)
- **confirm, webhook, inicis** 등 이메일을 쓰는 **모든** 블록에 동일 패턴 적용.

---

### 14.5 보안 — Rate Limit (브루트포스·DoS 완화)

| 대상 | 목적 | 권장 |
|------|------|------|
| **POST /api/warranties/transfer/accept** | 7자리 양도 코드 무차별 대입 방지 | IP 또는 (transfer_id + IP) 기준: 분당 N회 제한, 실패 K회 시 30분 잠금 등. |
| **POST /api/guest/orders/session** (신규) | 토큰 추측·남용 방지 | IP당 분당/일당 상한. |
| **GET /api/guest/orders/session** (유지 시) | 동일 | IP당 rate limit. |

---

### 14.6 효율 — N+1 제거·데드 코드 제거

- **GET /api/orders**: 주문 목록 조회 후 **WHERE order_id IN (...)** 로 order_items 1회 조회, 앱에서 매핑. (9.3·13.5 반영.)
- **payments-routes.js**: `existingPaymentStatus === 'captured' && existingPaidEvents.length === 0` 블록 **삭제**.

---

### 14.7 안정성 — processPaidOrder 실패 시 가시화

- 결제는 승인됐는데 **processPaidOrder**에서 실패하는 경우 **즉시 알림** (Slack/Discord webhook 등) 발송.  
- 복구 스크립트만 믿지 않고, **실패가 발생했음**을 운영자가 인지할 수 있게 한다.  
- **알림 페이로드 필수 항목** (운영자가 즉시 수동 복구·고객 응대 가능하도록):  
  **[주문번호]**, **[결제금액]**, **[에러 메시지]** (또는 Stack Trace 첫 줄), **[Toss paymentKey]**.  
  → `payments-routes.js` confirm/webhook catch 블록에서 `orderNumber`, `serverAmount`, `paymentKey`, `err.message`(및 `err.stack`) 모두 스코프에 있으므로 구현 가능.  
- (선택) 장기적으로 메시지 큐 + 재시도는 동일 원칙 하에 도입.

---

### 14.8 정리 — 운영 전 체크리스트 (한 번에 달성할 목표)

- [x] **비회원 confirm**: 12절·**12.6 체크리스트** 전부 적용 (optionalAuth, user_id IS NULL, 이미 처리됨 시 유효 토큰만, cart 스킵, 이메일 finally, 데드 코드 제거).
- [x] **유효 토큰 조건**: `guest_order_access_tokens` 유효 조건을 **한 곳**(함수: `selectValidGuestTokenSql(alias)`)으로 정의. confirm·webhook·inicis·order-routes 등 **모든** 조회에서 사용.
- [x] **커넥션**: 이메일 발송용 등 보조 커넥션 **finally { if (emailConnection) await emailConnection.end(); }** 적용.
- [x] **세션 교환**: POST /api/guest/orders/session, Body에 token. 이메일 링크는 `guest-order-access.html?token=xxx` 랜딩 → 랜딩에서 POST 호출. GET 유지(deprecated), 로깅 금지 권장.
- [x] **Rate limit (guest session)**: GET/POST /api/guest/orders/session에 IP당 30회/분 적용. transfer/accept는 별도 이슈.
- [ ] **N+1**: GET /api/orders — order_items를 **WHERE order_id IN (...)** 1회 조회 후 매핑. **데드 코드**: 삭제 완료.
- [x] **processPaidOrder 실패**: PAID_ORDER_FAILURE_WEBHOOK_URL 설정 시 웹훅 발송. 페이로드에 **주문번호, 결제금액, 에러 메시지(또는 stack 첫 줄), Toss paymentKey** 포함.

이 체크리스트를 **운영 전 필수**로 두고, 단기/장기 나누지 않고 한 번에 구현하면 **이상적·효율적·보안 위험 최소** 구조에 맞춰진다.

---

## 15. Gemini 리뷰 검증 (코드 기준 — 수용·수정·보류)

Gemini는 우리 코드베이스를 직접 보지 못하므로, 아래는 **실제 코드·환경을 직접 확인한** 개발자/리뷰어 관점의 검증 결과다. 무조건 수용하지 않고, 우리 환경에 맞게 수정·보류를 명시한다.

---

### 15.1 DB 커넥션: "지금 풀로 바꾸자" (Gemini 1번)

| Gemini 주장 | 코드 검증 결과 | 결론 |
|-------------|----------------|------|
| createConnection 매 요청마다 맺고 끊는 건 안티패턴. "설정 몇 줄"로 Pool 전환하고 .end() → .release() 일괄 변경하자. | **dbConfig**는 파일마다 로컬 정의(payments-routes, order-routes, index, auth-routes, cart, warranty 등 **30개 이상 파일**). **createPool / getConnection() 은 전역 0건.** Pool 도입 시 필요한 작업: (1) DB 설정 단일 모듈화(pool 생성 및 export), (2) **모든** createConnection 사용처를 getConnection() + **finally { release() }** 로 변경. 즉 **몇 줄이 아니라 전역 리팩터링**이다. | **방향은 수용**, **시기·범위는 보류.** Pool이 성능·리소스 측면에서 이상적인 건 맞다. 다만 현재 코드베이스는 요청 단위 createConnection이 **일관되게** 쓰이고, .end()는 풀이 없으므로 **올바른 사용**이다. 운영 전 "한 번에 완벽하게"를 목표로 하더라도, **Phase 2(비회원 confirm·webhook·토큰 조건)** 가 더 급한 병목이므로, Pool 전환은 **Phase 1b(기반 공사 후)** 또는 **Phase 2 완료 후** 별도 태스크로 두는 것을 권장. "지금 당장 풀로 바꾸지 않으면 안 된다"는 수준까지는 아니다. |

---

### 15.2 토큰 노출·이메일 봇 (Gemini 2번)

| Gemini 주장 | 코드 검증 결과 | 결론 |
|-------------|----------------|------|
| 랜딩 페이지 + POST로 세션 맺는 설계 탁월. 이메일 1회성 토큰 URL은 봇이 먼저 GET해서 소모되는 문제 차단. | 14.2와 동일 설계. order-routes.js GET /guest/orders/session, 이메일/order-complete에서 URL에 token 사용 중. | **전적으로 수용.** 14.2·14.8 대로 POST + 랜딩으로 가면 된다. |

---

### 15.3 유효 토큰 조건 — 함수 형태 (Gemini 3번)

| Gemini 주장 | 코드 검증 결과 | 결론 |
|-------------|----------------|------|
| 상수보다 **함수**(alias 인자) 형태가 좋다. JOIN 시 테이블 알리아스가 달라질 수 있음. | 14.3에 이미 `selectValidGuestTokenSql(alias = 'got')` 예시 있음. payments-routes webhook 1413~1416은 `guest_order_access_tokens` 단일 테이블 조회지만, confirm·order-routes 등에서 JOIN 시 alias 필요할 수 있음. | **수용.** 구현 시 **함수 형태**로 두고, 모든 사용처에서 이 함수만 쓰도록 하자. |

---

### 15.4 Rate Limit — Redis (Gemini 4번)

| Gemini 주장 | 코드 검증 결과 | 결론 |
|-------------|----------------|------|
| 메모리 저장소는 재시작/다중 인스턴스 시 카운트 초기화·꼬임. 구조적으로 Redis 붙이기 쉬운 형태로 미들웨어 구성. | **express-rate-limit** 사용 중(index.js, order-routes, auth-routes, inquiry 등). **Redis 의존성 없음.** 기본은 메모리 저장소. PM2 cluster/다중 인스턴스 설정은 배포 스크립트에서만 언급, ecosystem instances 수는 미확인. | **수용.** 당장 Redis 필수는 아니더라도, **rate limit 미들웨어를 store를 주입하는 형태**로 두면 나중에 `rate-limit-redis` 등으로 교체 가능. 14.5 적용 시 "메모리 기본, 추후 Redis 교체 가능 구조"로 짜면 됨. |

---

### 15.5 processPaidOrder 실패 알림 — 페이로드 구체화 (Gemini 5번)

| Gemini 주장 | 코드 검증 결과 | 결론 |
|-------------|----------------|------|
| 알림에 "[주문번호], [결제금액], [에러 메시지(Stack 첫 줄)], [Toss paymentKey]" 포함해야 즉시 복구·고객 응대 가능. | **payments-routes.js** confirm catch(526~571): `orderNumber`, `serverAmount`, `paymentKey`, `order.order_id`, `paidProcessError.message`, `paidProcessError.stack` 모두 스코프 내. webhook 쪽 processPaidOrder 실패 블록(1281~, 1992~)도 동일 변수 존재. | **수용.** 14.7에 **알림 페이로드 필수 항목**으로 반영해 두었음. 구현 시 위 네 가지는 최소한 포함할 것. |

---

### 15.6 구현 순서 Battle Plan (Gemini Phase 1~3)

| Gemini 제안 | 우리 보정 | 결론 |
|-------------|------------|------|
| Phase 1: guest-token-helpers + **(선택·강력 권장) Pool 전환** | Phase 1에서 **Pool은 제외**. token helper만. Pool은 15.1대로 Phase 1b 또는 Phase 2 이후. | **Phase 1**: guest-token-helpers.js 및 유효 토큰 조건 함수화만. Pool은 별도 태스크. |
| Phase 2: confirm optionalAuth, 데드코드 제거, N+1, finally { end/release }, webhook 토큰 조건 | N+1은 **order-routes.js** GET /api/orders 쪽이므로 payments-routes와 분리. 나머지 동일. | **Phase 2**: payments-routes confirm·webhook 리팩터(optionalAuth, 데드코드 제거, 이메일 finally, webhook에 유효 토큰 조건 적용). N+1은 order-routes 별도 이슈. |
| Phase 3: POST 세션, 이메일 링크 랜딩, Rate limit, Slack/Discord 알림 | 동일. | **Phase 3**: 14.2·14.5·14.7 구현. |

---

### 15.7 정리 (우리 환경에서의 넥스트 스텝)

- **무조건 수용하지 않은 것**: "지금 당장 Pool로 전환"(범위·비용이 크고, 14절 목표와 직결된 급선무는 아님).
- **수용·반영한 것**: 토큰 POST+랜딩, 유효 토큰 **함수** 형태, Rate limit Redis 대비 구조, processPaidOrder 알림 **페이로드 4종 필수**, Phase 순서(Phase 1에서 Pool 제외).
- **다음 액션**: Phase 1(token helper) → Phase 2(payments-routes confirm·webhook·이메일 finally·토큰 조건)부터 코드로 진행. 수정된 payments-routes(또는 1차 패치)를 가져오면 같은 기준으로 한 번 더 리뷰 가능.

---

**실행 시 핵심 요약 (컨텍스트 복구용)**  
- **기능 순서**: 11절 — 0(정리) → 1(비회원 confirm) → 2(보증서 경고) → 3(PDF) → 4(통합 주문 상세).  
- **비회원 confirm**: 12절·**12.6** 체크리스트 전부 적용. 파일: `backend/payments-routes.js` (optionalAuth, user_id IS NULL, 유효 토큰 조건·webhook expires_at, 이메일 finally, 데드 코드 제거).  
- **운영 전 목표**: 14절·**14.8** 체크리스트 (유효 토큰 함수화, POST 세션, Rate limit, processPaidOrder 알림 페이로드, N+1·데드코드 제거).  
- **Phase**: 15.6 — 1) guest-token-helpers 2) payments confirm·webhook 리팩터 3) POST 세션·Rate limit·알림.  
- **DB**: 현재 createConnection + .end(). Pool은 15.1대로 Phase 2 이후 별도. **줄 번호는 참고용**, 패턴 검색으로 위치 확인.

---

## 16. 구현 시 준수 사항 (규칙·보안·위험 통합)

**목적**: Phase 1·2·3 구현 시 **단편적으로 보지 말고** Gemini·GPT와 합의한 규칙·보안·위험을 한 번에 참조할 수 있도록 통합. 코드 수정 전·중에 이 절을 기준으로 누락 없이 적용할 것.

---

### 16.1 SSOT·전역 규칙 (1절 — 절대 위반 금지)

| 항목 | 규칙 | 구현 시 |
|------|------|---------|
| **orders.status** | 집계 결과(표시용). **정책 판단에 사용 금지.** 집계 함수로만 갱신. | "이미 결제됨" 등 판단 시 **paid_events** 선조회. order.status 직접 비교로 분기 금지. |
| **order_item_units.unit_status** | 물류 단위 상태의 진실 원천. | 환불/배지 등은 unit_status·warranty.status 기준. |
| **stock_units.status** | 재고 상태의 진실 원천. 재판매 게이트는 `in_stock`. | 재고 검증·배정 시 이 테이블만 사용. |
| **warranties.status** | 권리/정책(활성화·양도·환불)의 진실 원천. | 정책 분기 시 orders.status가 아닌 warranties.status 사용. |
| **invoices** | 증빙/조회용. **권리 판단 기준으로 사용 금지.** | 권한/상태 판단에 invoices 기반 로직 넣지 말 것. |
| **락 순서** | orders → stock_units → order_item_units → warranties → invoices | 트랜잭션·락 사용 시 이 순서 준수. |
| **원자성** | 상태 전이는 `UPDATE ... WHERE 조건` + **affectedRows=1 검증** 필수. | UPDATE 후 반드시 affectedRows 검사. |
| **토큰 분리** | 비회원 조회 `guest_order_access_token`(90일), Claim `claim_token`(단기) 분리. | 두 토큰 용도·만료 혼용 금지. |

---

### 16.2 보안 (9절·12절·13절·14절 — 구현 시 필수)

| 구분 | 규칙 | 구현 시 |
|------|------|---------|
| **수평 권한** | 주문 조회는 **order_number + (user_id = ? 또는 user_id IS NULL)** 로만. | 비회원: `WHERE order_number = ? AND user_id IS NULL` 한 건만. 회원: `user_id = ?`. 다른 사람 주문 접근 불가. |
| **유효 토큰** | guest_order_access_tokens 조회 시 **expires_at > NOW() AND revoked_at IS NULL** 필수. | **한 곳(함수)** 에만 정의. confirm·webhook·inicis·order-routes·paid-order-processor 모두 동일 조건 사용. **만료/회수된 토큰 절대 반환 금지.** |
| **토큰 URL 노출** | 토큰이 쿼리스트링에 있으면 로그·Referer 유출. (13.1, 14.2) | Phase 3에서 POST + body. 당장은 **로그/모니터링에서 token 값 로깅 금지.** |
| **이메일 봇 스캔** | 링크를 봇이 GET으로 호출하면 1회성 소모 가능. (14.2) | 세션 교환은 **POST + body**. API는 GET으로 토큰 받지 않음. |
| **CSRF** | confirm 등 결제·주문 변경 API는 **verifyCSRF 유지**. | optionalAuth로 바꿔도 **verifyCSRF 제거하지 말 것.** |
| **404/403 메시지** | "주문을 찾을 수 없습니다" 등 통일. enumeration 완화. | 동일 메시지 유지. 상세 원인 노출 금지. |
| **프론트 XSS** | 사용자/서버 데이터 DOM 삽입 시 **escapeHtml** 필수. (9.2) | order-complete·guest/orders·신규 UI 모두 escapeHtml 적용. |
| **Rate limit** | transfer/accept, guest session 엔드포인트는 브루트포스·DoS 완화. (13.2, 14.5) | Phase 3에서 적용. store 주입 구조로 두어 추후 Redis 교체 용이하게. |

---

### 16.3 데이터·리소스 (9절·13절·14절 — 휴먼 에러·누수 방지)

| 구분 | 규칙 | 구현 시 |
|------|------|---------|
| **유효 토큰 조건 단일 정의** | expires_at·revoked_at 조건을 여러 곳에 하드코딩 금지. (13.7, 13.9, 14.3) | **guest-token-helpers.js** 의 **함수** (예: `selectValidGuestTokenSql(alias)`) 한 곳만 사용. SQL에 문자열 직접 붙이지 말 것. |
| **토큰 조회 정렬** | 엣지 케이스(중복 토큰) 방지. | `ORDER BY created_at DESC LIMIT 1` 사용. |
| **이메일 커넥션** | 예외 시에도 **반드시** 반환. (9.3, 13.3, 13.9, 14.4) | **모든** 이메일 발송 블록: `try { ... } finally { if (emailConnection) await emailConnection.end(); }`. confirm·webhook·inicis 전부. |
| **DB 커넥션** | 현재 createConnection만 사용. 풀 미사용. | 보조 커넥션은 **.end()**. (풀 도입 시에만 .release()) |

---

### 16.4 비회원 confirm 전용 (12절·12.6·13.9)

| 항목 | 규칙 | 구현 시 |
|------|------|---------|
| **미들웨어** | authenticateToken → **optionalAuth**. | 토큰 없으면 req.user = null, next(). |
| **주문 조회** | req.user 있음 → `user_id = ?`. req.user 없음 → **`user_id IS NULL`** only. | 한 건(LIMIT 1). 없으면 404. |
| **이미 처리됨** | existingPaidEvents.length > 0 이면 **guest_access_token** 도 조회해 응답에 포함. | guest_order_access_tokens에서 **유효 조건(16.2)** + order_id로 1건 SELECT. user_id·guest_access_token 응답에 포함. |
| **데드 코드** | `existingPaymentStatus === 'captured' && existingPaidEvents.length === 0` 블록 **삭제**. | 해당 분기 전체 제거. |
| **장바구니** | userId가 null이면 **장바구니 쿼리 스킵**. cartCleared = false 또는 "해당 없음". | optionalAuth 도입 시 반드시 분기. |
| **webhook/복구 경로** | guest_order_access_tokens 조회 시 **expires_at > NOW()** 가 빠진 곳 수정. (13.7, 13.9) | 1414~1416 등 패턴 검색으로 찾아 **동일 유효 조건(헬퍼)** 적용. |

---

### 16.5 운영·안정성 (13.4, 14.7, 15.5)

| 항목 | 규칙 | 구현 시 |
|------|------|---------|
| **processPaidOrder 실패 알림** | 결제 승인 후 processPaidOrder 실패 시 **즉시 알림** (Slack/Discord 등). | Phase 3에서 연동. |
| **알림 페이로드 필수** | **[주문번호], [결제금액], [에러 메시지 또는 stack 첫 줄], [Toss paymentKey]**. | 알림 구현 시 위 네 가지 반드시 포함. |

---

### 16.6 구현 시 적용하지 않는 것 (혼동 방지)

| 항목 | 결론 | 구현 시 |
|------|------|---------|
| **Pool 전환** | 방향 수용, **시기 보류**. (15.1) | Phase 1·2에서 Pool 도입하지 않음. .end() 유지. |
| **Claim 2단계 제거** | 반론 유지. 현재 구조 유지. (13.6) | claim-token → claim 단일화하지 않음. |
| **N+1** | order-routes.js GET /api/orders. (9.3, 13.5) | payments-routes와 별도. Phase 2 범위에 N+1 수정 필수 아님. 필요 시 별도 이슈. |

---

### 16.7 Phase별 체크 (구현 시 이 목록으로 검증)

- **Phase 1**  
  - [x] guest-token-helpers.js 생성.  
  - [x] 유효 토큰 조건 **함수** (alias 인자) 한 곳 정의.  
  - [x] Phase 2에서 confirm·webhook·paid-order-processor·order-routes에 헬퍼 적용 완료.

- **Phase 2**  
  - [x] confirm: optionalAuth, 주문 조회 user_id = ? / user_id IS NULL 분기.  
  - [x] confirm: 이미 처리됨 시 guest_access_token 조회·응답에 포함(**유효 조건 = 헬퍼 사용**).  
  - [x] confirm: 데드 코드 블록 제거.  
  - [x] confirm: userId null이면 장바구니 쿼리 스킵.  
  - [x] confirm·webhook·inicis: 이메일 발송 **모든** 블록에 finally { emailConnection.end() }.  
  - [x] webhook(및 동일 패턴): guest_order_access_tokens 조회 시 **헬퍼 사용**, expires_at > NOW() 포함.  
  - [x] SSOT 위반 없음(paid_events 선확인, orders.status 직접 정책 판단 없음).  
  - [x] 세션 기반 GET /api/guest/orders/:orderNumber 에 **o.user_id IS NULL** (Claim 방어).  
  - [x] 16.1~16.5 위반 없음.

- **Phase 3**  
  - [x] POST /api/guest/orders/session, body에 token.  
  - [x] 이메일 링크 랜딩 → `guest-order-access.html?token=xxx` 로 연결, 랜딩에서 POST 호출 후 redirect.  
  - [x] Rate limit: guest session (GET/POST) IP당 30회/분. transfer/accept는 별도 이슈.  
  - [x] processPaidOrder 실패 시 알림 (PAID_ORDER_FAILURE_WEBHOOK_URL 설정 시) + 페이로드 4종.
