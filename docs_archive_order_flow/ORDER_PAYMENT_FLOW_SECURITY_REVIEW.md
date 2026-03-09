# 결제·주문 흐름 총정리 — 보안·문서일치·오류·다차원 점검

**목적**: 결제/주문 흐름 전반을 명품 홈페이지 시니어 관점에서 점검한 결과를 한 문서에 정리.  
**기준**: 코드·문서 직접 확인. 추측 없이 항목별로 상태(✅/⚠️/❌)와 위치를 명시.

---

## 1. 흐름 요약 (현재 구현 기준)

| 경로 | 진입 | 성공 판정 | 실패/재시도 |
|------|------|-----------|-------------|
| **confirm (토스)** | POST /api/payments/confirm, checkoutSessionKey·orderNumber·paymentKey·amount | JOIN pep.status='success' → 200 alreadyConfirmed. 그 외 pep → processing(409), failed(§C CAS+재시도), pending(409) | 금액 불일치 400, 세션 없음 400, CONSUMED 200, INSUFFICIENT_STOCK 시 Path C·§C 환불 |
| **이니시스** | POST (리다이렉트), tid·amount·orderNumber 등 | createPaidEvent + processPaidOrder, 200 리다이렉트 | 금액 불일치 리다이렉트 fail, processPaidOrder 실패 시 500 |
| **웹훅** | POST /api/payments/webhook, HMAC 검증 | createPaidEvent + processPaidOrder, commit | 검증 실패 401, processPaidOrder 실패 시 rollback·알림 |

---

## 2. 보안 점검

| 항목 | 상태 | 근거 |
|------|------|------|
| **금액 Zero-Trust (confirm)** | ✅ | serverAmount = order.total_price, clientAmount = req.body.amount. `Math.abs(serverAmount - clientAmount) > 0.01` 시 400. PG Fetch 후에도 pgOrderId·amountStr 대조 (payment-wrapper). |
| **주문 소유권** | ✅ | 회원: `WHERE order_number = ? AND user_id = ?`. 비회원: `AND user_id IS NULL`. 타인 주문 confirm 불가. |
| **세션 검증 (토스)** | ✅ | checkout_sessions 존재·만료·order_id 일치·CONSUMED 시 멱등 200. FOR UPDATE로 선점. |
| **결제 증거 불변** | ✅ | paid_events INSERT만(ODKU 제거). ER_DUP_ENTRY 시 alreadyExists 반환. |
| **유령 주문 방지** | ✅ | "이미 완료" = JOIN paid_events + paid_event_processing WHERE pep.status = 'success'. paid_events만 있고 success 없으면 409 또는 §C. |
| **멱등·이중 처리 방지** | ✅ | processPaidOrder: 0차 Early Return(status='success') + 락 직후 Double-Check. §C: CAS(UPDATE pep SET status='processing' WHERE event_id=? AND status='failed'). |
| **재고 TOCTOU** | ✅ | 재고 검증·차감을 processPaidOrder 내부 트랜잭션(FOR UPDATE SKIP LOCKED)에만 위임. §C에서 사전 SELECT 재고 검사 없음. |
| **CSRF** | ✅ | confirm 라우트 verifyCSRF 적용. |
| **환불 실패 복구** | ✅ | §C에서 환불 API 실패 시 updateProcessingStatus(..., 'REFUND_API_FAILED'), 500 REFUND_PENDING. 수동 대사 가능. |

---

## 2-1. 우리가 구축한 보안 항목 (문서·코드 기준)

아래는 **설계 문서**(CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK.md, ORDER_PAYMENT_FLOW_SECURITY_REVIEW.md §2)와 **실제 코드**를 대조해 정리한 보안 항목 목록이다. 추측 없이 파일·라인을 명시한다.

1. **confirm 요청 body 검증 (필수 필드·금액 양수)**  
   - **문서**: ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "금액 Zero-Trust", CONFIRM_FLOW §4.1 인근.  
   - **코드**: `backend/payments-routes.js`  
     - checkoutSessionKey 없음/빈 문자열 → 400 (130~139행).  
     - orderNumber, paymentKey, amount 중 하나라도 없음 → 400 (139~147행).  
     - amount가 숫자가 아니거나 0 이하 → 400 (149~158행).

2. **주문 소유권 (타인 주문 confirm 불가)**  
   - **문서**: ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "주문 소유권".  
   - **코드**: `backend/payments-routes.js` 164~188행.  
     - 회원: `WHERE order_number = ? AND user_id = ?` (166~170행).  
     - 비회원: `WHERE order_number = ? AND user_id IS NULL` (171~176행).  
     - 조회 결과 0건이면 404 NOT_FOUND (178~187행).

3. **checkout 세션 검증 (존재·만료·주문 일치)**  
   - **문서**: CONFIRM_FLOW §1.2 "세션", ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "세션 검증".  
   - **코드**: `backend/payments-routes.js` 193~224행.  
     - session_key로 조회, 0건이면 400 "유효한 결제 세션을 찾을 수 없습니다" (197~206행).  
     - expires_at ≤ NOW()면 400 "결제 세션이 만료되었습니다" (210~219행).  
     - sessionRow.order_id !== order.order_id면 400 "세션이 해당 주문과 일치하지 않습니다" (221~224행).

4. **세션 CONSUMED 시 멱등 200 (이미 결제된 세션 재요청)**  
   - **문서**: CONFIRM_FLOW §1.2 "CONSUMED 시 동일 세션 재진입 시 200".  
   - **코드**: `backend/payments-routes.js` 232~278행. sessionRow.status === 'CONSUMED'이면 payments·guest_access_token·cartCleared 조회 후 200 + alreadyConfirmed 반환.

5. **"이미 완료" = pep.status = 'success' JOIN (유령 주문 방지)**  
   - **문서**: CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK §4.1, §6.1, §7 "중복 확인".  
   - **코드**: `backend/payments-routes.js` 312~361행.  
     - `SELECT pe.event_id FROM paid_events pe INNER JOIN paid_event_processing pep ON pe.event_id = pep.event_id WHERE pe.order_id = ? AND pep.status = 'success' LIMIT 1` (313~317행).  
     - 1건 이상이면 200 alreadyConfirmed (315~361행). paid_events만 있고 success 없으면 이 블록을 타지 않음.

6. **pep processing / failed / pending 분기 (409, §C 재시도, CAS)**  
   - **문서**: CONFIRM_FLOW §6.5, §7 "복구", ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "유령 주문 방지", "멱등·이중 처리".  
   - **코드**: `backend/payments-routes.js` 378~525행.  
     - pepRows 중 status === 'processing'이 있으면 409 ORDER_PROCESSING_INCOMPLETE + retry_after_seconds, retry_once_recommended (388~401행).  
     - status === 'failed'인 행이 있으면 CAS: `UPDATE paid_event_processing SET status = 'processing' WHERE event_id = ? AND status = 'failed'` (408~409행). affectedRows === 0이면 409 CONCURRENT_RETRY_DETECTED (410~417행).  
     - CAS 성공 시 별도 conn으로 processPaidOrder 재호출 (424~442행). INSUFFICIENT_STOCK이면 executeRefundFn + updateProcessingStatus('failed','AUTO_REFUNDED_OUT_OF_STOCK') 후 400 AUTO_REFUNDED (477~486행). 환불 API 실패 시 updateProcessingStatus('failed','REFUND_API_FAILED') 후 500 REFUND_PENDING (493~518행).  
     - paid_events는 있으나 success/processing/failed가 아니면 409 (517~525행).

7. **confirm 서버 금액 vs 클라이언트 금액 불일치 시 400 (Zero-Trust)**  
   - **문서**: CONFIRM_FLOW §1.2 "금액·PG 응답", ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "금액 Zero-Trust".  
   - **코드**: `backend/payments-routes.js` 284~286행 serverAmount = order.total_price, clientAmount = req.body.amount. 534~550행 `Math.abs(serverAmount - clientAmount) > 0.01`이면 400 "주문 금액과 결제 금액이 일치하지 않습니다".

8. **PG Fetch 응답 orderId·amount 대조 (ZERO_TRUST_VIOLATION)**  
   - **문서**: CONFIRM_FLOW §1.2 "PG 응답 orderId·amountStr 대조", payment-wrapper.js 주석.  
   - **코드**: `backend/utils/payment-wrapper.js` 239~243행.  
     - respOrderId = pgResponse.orderId, respAmount = pgResponse.totalAmount 또는 amount.  
     - respOrderId !== pgOrderId 또는 respAmount !== amountStr이면 throw new Error('ZERO_TRUST_VIOLATION').  
   - confirm 라우트에서 ZERO_TRUST_VIOLATION 시 409 + 환불 경로 (payments-routes.js 779~787행).

9. **processPaidOrder Early Return (status = 'success'면 이미 처리됨 반환)**  
   - **문서**: CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK §4.2, §6.2, §7 "멱등성".  
   - **코드**: `backend/utils/paid-order-processor.js` 94~166행.  
     - 진입 직후 `SELECT status FROM paid_event_processing WHERE event_id = ?` (94~97행).  
     - pepRows[0].status === 'success'이면 order·order_items·guest_access_token·invoice 조회 후 동일 data 스키마로 `{ success: true, alreadyProcessed: true, ... }` 반환 (98~165행).

10. **processPaidOrder Double-Check (orders FOR UPDATE 직후 status 재조회)**  
    - **문서**: CONFIRM_FLOW §6.2 "락 획득 후", ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "멱등·이중 처리 방지".  
    - **코드**: `backend/utils/paid-order-processor.js` 179~197행 orders FOR UPDATE, 250~256행 "Double-Check" 주석과 pepRows2 조회. status === 'success'이면 동일 data 스키마로 반환. **순서**: FOR UPDATE(195행)가 Double-Check(250행)보다 앞에 있음.

11. **processPaidOrder 재고 부족 시 INSUFFICIENT_STOCK throw**  
    - **문서**: ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "재고 TOCTOU", CONFIRM_FLOW §9.3.  
    - **코드**: `backend/utils/paid-order-processor.js` 395~396행, 450~451행. err.code = 'INSUFFICIENT_STOCK'; throw err. confirm·§C에서 이 코드를 잡아 환불 또는 409/400 처리.

12. **processPaidOrder 실패 시 예약 재고 명시적 해제 + pep 'failed'**  
    - **문서**: CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK §12.3 "failed 시 재고 해제".  
    - **코드**: `backend/utils/paid-order-processor.js` 904~941행.  
      - reserved_by_order_id = orderId AND status = 'reserved'인 stock_units 조회 후 UPDATE로 status = 'in_stock', reserved_at = NULL, reserved_by_order_id = NULL (921~929행).  
      - 944~946행 updateProcessingStatus(paidEventId, 'failed', error.message).

13. **결제 증거 불변 (paid_events INSERT만, ER_DUP_ENTRY 시 alreadyExists)**  
    - **문서**: CONFIRM_FLOW §1.2 "결제 증거", PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION, ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "결제 증거 불변".  
    - **코드**: `backend/utils/paid-event-creator.js` 81~86행 INSERT만 사용. 110~120행 catch에서 innerError.code === 'ER_DUP_ENTRY'이면 SELECT로 기존 event_id 조회 후 `{ eventId, alreadyExists: true }` 반환. ODKU 없음.

14. **paid-event-creator Promise.race 제거 (풀 누수 방지)**  
    - **문서**: PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION, paid-event-creator.js 파일 상단 주석.  
    - **코드**: `backend/utils/paid-event-creator.js` 56행 `connection = await pool.getConnection()`만 사용. Promise.race 미사용. queueLimit으로 풀 고갈 시 fail-fast.

15. **payment-wrapper 고아 커넥션 회수 (타임아웃/abort 시)**  
    - **문서**: payment-wrapper.js 주석 "풀 누수 방지", PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION §5·§8.4.  
    - **코드**: `backend/utils/payment-wrapper.js` 74~76행 releaseOrphanConnection(connectionPromise). 85행, 92행 타임아웃/abort 시 해당 함수 호출 후 reject.

16. **confirm 라우트 CSRF 검증**  
    - **문서**: ORDER_PAYMENT_FLOW_SECURITY_REVIEW §2 "CSRF".  
    - **코드**: `backend/payments-routes.js` 115행 router.post('/payments/confirm', optionalAuth, **verifyCSRF**, ...). `backend/csrf-middleware.js` 92~130행: POST 시 쿠키 xsrf-token과 헤더 X-XSRF-TOKEN 일치 여부 검사, 불일치/누락 시 403.

17. **동시 confirm(같은 세션) 선점 → 409 SESSION_ALREADY_IN_USE**  
    - **문서**: ORDER_PAYMENT_FLOW_SECURITY_REVIEW §4 "동시 confirm".  
    - **코드**: payment-wrapper Phase 1에서 checkout_sessions FOR UPDATE로 선점. 이미 IN_PROGRESS/CONSUMED면 wrapper가 SESSION_ALREADY_IN_USE throw. `backend/payments-routes.js` 772~778행에서 409 + "이미 진행 중인 결제가 있습니다" 반환.

18. **409 ORDER_PROCESSING_INCOMPLETE 시 retry_after_seconds·retry_once_recommended**  
    - **문서**: CONFIRM_FLOW·Gemini 409 가이드, order-complete 클라이언트 1회 재시도.  
    - **코드**: `backend/payments-routes.js` 391~400행, 518~525행 409 시 details.retry_after_seconds, details.retry_once_recommended 포함. `order-complete-script.js` 554~558행: 409 + ORDER_PROCESSING_INCOMPLETE + retry_once_recommended일 때만 retry_after_seconds 후 confirm 1회 재호출, options.retried === true로 무한 재시도 방지.

19. **웹훅 HMAC 서명 검증**  
    - **문서**: payments-routes.js 주석 "WEBHOOK_SHARED_SECRET로 HMAC 검증", ORDER_PAYMENT_FLOW_SECURITY_REVIEW §1 "웹훅 HMAC 검증".  
    - **코드**: `backend/payments-routes.js` 1499~1555행. body 원문으로 HMAC-SHA256 계산 후 x-toss-signature와 비교. 불일치 시 401. (시크릿 미설정 시 검증 스킵·로깅.)

---

## 2-2. 항목별 테스트 방법 (구체적)

각 번호는 위 §2-1의 동일 번호에 대응한다. **실제로 어떻게 해서 검증하는지**만 기술한다. 추측 없이 요청·기대값·확인 위치를 명시한다.

**1. confirm 요청 body 검증**  
- **방법**: POST /api/payments/confirm에 body를 바꿔 가며 요청.  
  - (1-a) body 비움 `{}` → **기대**: 400, code 또는 details.field가 checkoutSessionKey 또는 body 관련.  
  - (1-b) checkoutSessionKey 없이 orderNumber, paymentKey, amount만 전송 → **기대**: 400, message에 "checkoutSessionKey" 또는 "필요".  
  - (1-c) amount: 0 또는 음수 전송 → **기대**: 400, message에 "유효한 금액" 또는 "amount".  
- **실행**: 서버 기동 후 `BASE_URL=http://localhost:PORT node backend/scripts/order-flow-security-check.js` 실행 시 API 검사에서 (1-a)(1-b)(1-c)에 해당하는 항목이 통과하는지 확인. 또는 수동으로 fetch/Postman으로 동일 요청 후 status 400 및 본문 확인.

**2. 주문 소유권**  
- **방법**:  
  - (2-a) **비회원**: 로그인하지 않은 상태에서 존재하지 않는 orderNumber(예: PM-ORD-NONEXISTENT-99999)로 confirm 요청(유효한 CSRF·checkoutSessionKey 형식이라도 DB에 없는 주문). **기대**: 404 NOT_FOUND.  
  - (2-b) **회원**: A 계정 로그인 후, B 계정 소유 주문의 orderNumber로 confirm 요청. **기대**: 404 (해당 user_id로 조회되므로 B의 주문은 0건).  
- **확인**: 응답 status 404, body.code 'NOT_FOUND', details.field 'orderNumber'.  
- **스크립트**: order-flow-security-check.js API 검사 "존재하지 않는 주문번호 → 404"가 (2-a)에 해당.

**3. checkout 세션 검증**  
- **방법**:  
  - (3-a) DB에 없는 session_key(예: 00000000-0000-0000-0000-000000000000)를 checkoutSessionKey로 전송. 주문은 존재하는 주문 번호(비회원 주문으로 2번에서 404가 나오지 않게). **기대**: 2번에서 먼저 404가 나오므로, "없는 주문"이면 404. 존재하는 비회원 주문 + 없는 세션 키 조합이면 세션 조회 0건 → 400 "유효한 결제 세션을 찾을 수 없습니다".  
  - (3-b) 만료된 세션 키(expires_at < NOW())로 요청. **기대**: 400 "결제 세션이 만료되었습니다". (테스트 DB에서 해당 session의 expires_at을 과거로 수정 후 재현.)  
  - (3-c) 다른 주문용 세션 키를 이 주문 번호와 함께 전송. **기대**: 400 "세션이 해당 주문과 일치하지 않습니다".  
- **확인**: 응답 400, details.field 'checkoutSessionKey', message로 구분.

**4. 세션 CONSUMED 시 멱등 200**  
- **방법**: 정상 결제 완료 후 같은 checkoutSessionKey·orderNumber·paymentKey·amount로 confirm을 **한 번 더** POST. **기대**: 200, data.alreadyConfirmed === true.  
- **확인**: 두 번째 요청에서 200이고 body에 alreadyConfirmed: true. DB에는 paid_events·paid_event_processing·order_item_units 등이 한 번만 생성되어 있음(중복 없음).

**5. "이미 완료" = success JOIN**  
- **방법**: paid_events에는 행이 있으나 paid_event_processing.status가 'success'가 아닌 상태(예: 수동으로 pep만 'pending'으로 둔 경우)에서 confirm 재요청. **기대**: 200 alreadyConfirmed가 아니고, pep 상태에 따라 409(processing) 또는 §C(failed) 또는 409(pending). 즉 "paid_events만 있고 success가 없으면" 200 alreadyConfirmed가 나오면 안 됨.  
- **확인**: DB에서 pep.status를 success가 아니게 만든 뒤 confirm 시 200 alreadyConfirmed가 반환되지 않는지.

**6. pep processing / failed / pending 분기**  
- **방법**:  
  - (6-a) **processing**: 동시에 두 번 confirm을 보내 한쪽이 processPaidOrder 중일 때 다른 쪽이 들어오면 **기대**: 409, code ORDER_PROCESSING_INCOMPLETE, details.retry_after_seconds·retry_once_recommended 존재.  
  - (6-b) **failed**: paid_event_processing을 status='failed'로 수동 설정 후 confirm 재요청. **기대**: CAS 성공 시 processPaidOrder 재시도, 재고 부족 시 400 AUTO_REFUNDED 및 pep.last_error 'AUTO_REFUNDED_OUT_OF_STOCK'.  
  - (6-c) **CAS 실패**: 동시에 두 클라이언트가 failed 재시도. **기대**: 한쪽만 200, 다른 쪽은 409 CONCURRENT_RETRY_DETECTED.  
- **확인**: 응답 코드·body.code·DB의 pep.status·last_error.

**7. confirm 서버 금액 vs 클라이언트 금액 불일치**  
- **방법**: 실제 주문의 total_price와 다른 amount를 body.amount로 전송(예: 주문 10000원인데 amount: 5000). checkoutSessionKey·orderNumber·paymentKey는 유효한 값. **기대**: 400 "주문 금액과 결제 금액이 일치하지 않습니다".  
- **확인**: 400, details.field 'amount'. (이 검사는 세션·success 조회 **이후**, withPaymentAttempt 호출 **이전**에 수행되므로 534~550행.)

**8. PG Fetch 응답 orderId·amount 대조**  
- **방법**: 서버가 토스 Confirm API를 호출한 뒤 받은 응답을 위조할 수 없으므로, **정상적으로는** PG가 반환한 orderId/amount가 서버가 보낸 값과 다르면 wrapper가 ZERO_TRUST_VIOLATION을 throw. 테스트하려면 MOCK_GATEWAY=1 등으로 모의 응답을 주입하는 환경에서, processOrderFn 직전에 pgResponse.orderId 또는 totalAmount를 다른 값으로 바꾸는 코드를 일시적으로 넣어 요청 → **기대**: 409 ZERO_TRUST_VIOLATION 또는 동일 의미 응답.  
- **확인**: payment-wrapper.js 239~242행 로직이 실행된 뒤 throw되는지, confirm 라우트에서 409·환불 경로가 타는지.

**9. processPaidOrder Early Return**  
- **방법**: 이미 결제 처리까지 완료된 paidEventId로 processPaidOrder를 **다시** 호출하는 경로(웹훅 재전송 시뮬 또는 confirm §C 재시도가 아닌, 동일 event로 processPaidOrder 호출)를 트리거. **기대**: 200과 동일한 응답 형태에 alreadyProcessed: true, data에 order_number·invoiceNumber·orderInfo 등 기존 성공과 동일 스키마.  
- **확인**: 두 번째 호출에서 order_item_units 등이 중복 INSERT되지 않음(DB 행 수), 응답에 alreadyProcessed: true.

**10. processPaidOrder Double-Check**  
- **방법**: 동시에 같은 eventId로 processPaidOrder가 두 번 진입했다고 가정. 한쪽이 orders FOR UPDATE를 잡은 뒤 updateProcessingStatus('processing') 전에, 다른 쪽이 락 대기 후 진입하면 첫 번째가 이미 success로 업데이트한 뒤일 수 있음. 락 직후 두 번째는 pepRows2에서 status='success'를 읽고 Early Return. **기대**: 두 번째 요청은 alreadyProcessed 형태로 반환되고, order_item_units 등 중복 생성 없음.  
- **확인**: 코드 상 FOR UPDATE(195행)가 Double-Check(250행)보다 앞에 있는지 order-flow-security-check.js 정적 검사 "Double-Check 순서" 통과. 동시성은 통합 테스트 또는 부하 스크립트로 검증.

**11. processPaidOrder 재고 부족 시 INSUFFICIENT_STOCK**  
- **방법**: 재고가 0이거나 부족한 상품만 있는 주문으로 결제까지 진행(토스 테스트 모드). **기대**: confirm 응답 409(또는 400) INSUFFICIENT_STOCK, 재고 차감·order_item_units 미생성. 필요 시 §C 또는 Path C 환불 후 400 AUTO_REFUNDED.  
- **확인**: 응답 code, DB의 stock_units·order_item_units·pep.status·last_error.

**12. processPaidOrder 실패 시 예약 재고 해제 + pep 'failed'**  
- **방법**: processPaidOrder 중간에 실패하도록 유도(예: 재고 1개만 두고 2개 주문, 또는 일시적으로 updateProcessingStatus throw). **기대**: 트랜잭션 롤백 후, reserved_by_order_id가 해당 orderId인 stock_units가 없어지거나 status가 in_stock으로 복구. paid_event_processing.status = 'failed', last_error 설정.  
- **확인**: DB에서 stock_units.reserved_by_order_id, status, paid_event_processing.status·last_error.

**13. 결제 증거 불변 (alreadyExists)**  
- **방법**: 동일 orderId·paymentKey로 createPaidEvent를 두 번 호출(confirm 재요청 또는 웹훅 중복). **기대**: 두 번째는 ER_DUP_ENTRY → SELECT로 기존 event_id 반환, alreadyExists: true. paid_events 행은 1개만 유지.  
- **확인**: paid_events 테이블에서 (order_id, payment_key) 조합 중복 없음. 두 번째 호출 반환값에 eventId(기존 것), alreadyExists: true.

**14. paid-event-creator Promise.race 제거**  
- **방법**: 코드 검사. paid-event-creator.js에 Promise.race가 없고 pool.getConnection()만 사용하는지. **기대**: order-flow-security-check.js 정적 검사 "Promise.race 제거" 통과.

**15. payment-wrapper 고아 커넥션 회수**  
- **방법**: 코드 검사. payment-wrapper.js에 releaseOrphanConnection 호출이 타임아웃/abort 분기에서 있는지. **기대**: order-flow-security-check.js 정적 검사 "고아 커넥션 회수" 통과. 부하 시 풀 고갈이 발생하지 않도록 모니터링.

**16. confirm 라우트 CSRF**  
- **방법**: X-XSRF-TOKEN 헤더 없이(또는 쿠키와 다른 값으로) POST /api/payments/confirm. **기대**: 403, code CSRF_ERROR.  
- **확인**: 403, message "CSRF 토큰 검증에 실패했습니다" 또는 "필요합니다".

**17. 동시 confirm 409 SESSION_ALREADY_IN_USE**  
- **방법**: 같은 checkoutSessionKey로 두 개의 confirm 요청을 거의 동시에 전송. **기대**: 한 건은 200 또는 처리 진행, 다른 한 건은 409 SESSION_ALREADY_IN_USE.  
- **확인**: 응답 409, code SESSION_ALREADY_IN_USE.

**18. 409 retry_after_seconds·retry_once_recommended 및 클라이언트 1회 재시도**  
- **방법**:  
  - 서버: pep가 processing인 동안 confirm → 409, body에 retry_after_seconds, retry_once_recommended.  
  - 클라이언트: order-complete-script.js에서 409 + ORDER_PROCESSING_INCOMPLETE + retry_once_recommended일 때 retry_after_seconds 후 1회만 재호출, retried: true로 추가 재시도 방지. **기대**: 브라우저에서 결제 완료 직후 "처리 중"이면 한 번만 자동 재시도 후 성공 또는 동일 409.  
- **확인**: 네트워크 탭에서 confirm 2회 호출(1회 409, 1회 재시도). retried 없이 여러 번 409가 나와도 2번째 이후에는 재시도하지 않음(코드 554~558행 조건).

**19. 웹훅 HMAC 검증**  
- **방법**: POST /api/payments/webhook에 잘못된 x-toss-signature 또는 body를 변경한 뒤 서명 전송. **기대**: WEBHOOK_SHARED_SECRET이 설정된 경우 401. (시크릿 미설정 시 문서대로 검증 스킵.)  
- **확인**: 401 응답. 서명 일치 시에만 handlePaymentStatusChange 진입.

---

## 3. 문서와의 일치

| 문서 권장 | 구현 상태 | 비고 |
|-----------|-----------|------|
| "이미 완료" = pep.status='success' JOIN | ✅ | existingSuccessRows 쿼리로 적용. |
| processPaidOrder Early Return + Double-Check | ✅ | 0차 조회 + orders 락 직후 2차 조회. |
| failed 시 CAS 후 재시도, INSUFFICIENT_STOCK 시 환불 | ✅ | pepRows → failedRow → CAS → processPaidOrder, catch INSUFFICIENT_STOCK → executeRefundFn. |
| CONFIRM_FLOW §1.5 "existingPaidEvents만 200" | ✅ 수정됨 | 문서는 과거 지적. 현재는 success JOIN으로 대체됨. |
| 이니시스/웹훅 createConnection | ⚠️ 유지 | 문서: 장기적으로 풀 통일 권장. 코드: 현재 createConnection 유지. |

---

## 4. 오류·깨질 수 있는 구간

| 구간 | 위험 | 완화 |
|------|------|------|
| **토스 Fetch 타임아웃** | 10초 초과 시 TIMEOUT_WAITING, fallback 처리 | getSafeConnection 고아 회수, attempt 상태 업데이트. |
| **processPaidOrder 실패** | paid_events는 남음, pep='failed' | §C에서 재시도 또는 재고 부족 시 환불. |
| **환불 API 타임아웃** | PG 취소 실패 시 REFUND_API_FAILED 저장, 500 | 수동 대사·배치로 복구. |
| **이니시스/웹훅 커넥션** | 부하 시 커넥션 수 무제한 가능 | 단기 유지, 장기 풀 전환 권장. |
| **동시 confirm (같은 세션)** | Phase 1에서 FOR UPDATE로 IN_PROGRESS/CONSUMED 시 409 | SESSION_ALREADY_IN_USE. |
| **동시 §C 재시도** | CAS로 한 요청만 processing 선점, 나머지 409 CONCURRENT_RETRY_DETECTED | affectedRows === 0 시 409. |

---

## 5. 다차원 점검 (한 부분 수정 시 다른 부분)

| 변경 포인트 | 영향 확인 |
|-------------|-----------|
| **pep.status ENUM 값 추가** | paid-order-processor·confirm 분기(processing/success/failed) 및 updateProcessingStatus 호출부와 일치 필요. |
| **orders.total_price 타입** | serverAmount parseFloat, 금액 비교 0.01 털러런스. 정수/소수 정책 유지. |
| **checkout_sessions 스키마** | payment-wrapper Phase 1 쿼리(session_key, status, attempt_id) 및 CONSUMED 분기와 일치. |
| **executeRefundFn 시그니처** | (cancelKey, refundPaymentKey, reason). Path C와 §C에서 동일 사용. |

---

## 6. 테스트로 확인할 항목 (스크립트·통합 테스트와 연동)

- [ ] confirm: body 누락 → 400  
- [ ] confirm: 잘못된 orderNumber(타인 주문 또는 없음) → 404  
- [ ] confirm: 금액 불일치(serverAmount ≠ clientAmount) → 400  
- [ ] confirm: checkoutSessionKey 없음/만료/타 주문 → 400  
- [ ] confirm: success 이미 있음 → 200 alreadyConfirmed  
- [ ] confirm: pep processing → 409 ORDER_PROCESSING_INCOMPLETE  
- [ ] confirm: pep failed → §C 재시도 또는 409(CAS 실패 시)  
- [ ] processPaidOrder: status='success' → alreadyProcessed 반환 (Early Return·Double-Check)  
- [ ] §C: INSUFFICIENT_STOCK → 400 AUTO_REFUNDED, pep last_error AUTO_REFUNDED_OUT_OF_STOCK  

---

## 7. 보안을 "실제로" 테스트하는 방법

**우리가 만든 보안이 정말 막아주는지 확인하려면** 아래처럼 하면 된다.

1. **백엔드 서버를 로컬에서 실행** (예: `node backend/index.js` 또는 PM2로 포트 3000).
2. **다른 터미널에서** (프로젝트 루트 기준):
   ```bash
   BASE_URL=http://localhost:3000 node backend/scripts/order-flow-security-check.js
   ```
3. 출력에서 **"API 검사"** 섹션을 본다.  
   - "confirm body 없음 → 400", "checkoutSessionKey 없음 → 400", "amount 0 → 400", "존재하지 않는 주문번호 → 404" 등이 **통과(✅)** 이면,  
     **그런 잘못된 요청을 서버가 실제로 막고 있다**는 뜻이다.
4. **정적 검사**는 "코드에 필수 보안 패턴이 들어있는지"만 본다.  
   **API 검사**는 "실제로 요청을 보내서 막히는지" 확인하는 것이다.

※ BASE_URL을 꼭 **로컬/테스트용**으로만 쓸 것. 운영 서버 주소를 넣으면 테스트 데이터가 실제 DB에 들어갈 수 있다.

---

## 8. 스크립트 역할·한계 (order-flow-security-check.js)

**역할**: CI 등에서 **최소 가이드라인** — 필수 패턴·순서가 빠지지 않았는지 빠르게 점검.  
**보안 동작 테스트**: §7처럼 BASE_URL 넣고 실행하면 "잘못된 요청이 실제로 400/404로 막히는지" API 검사로 확인 가능.

**한계 (정규식·정적 검사)**  
- 문맥 무시: 주석 처리·변수명 변경·로직 분리 시 오탐/미탐 가능.  
- **상태 검증 없음**: API 400 반환만 확인할 뿐, DB에 paid_events/pep/세션 등 사후 상태는 검증하지 않음.  
- **Race/CAS 검증 불가**: Double-Check·CAS가 실제 동시 요청에서 동작하는지는 이 스크립트로 확인 불가.

**스크립트 보강 반영 사항**  
- **Fail-fast**: 필수 파일 누락·빈 파일 시 에러 삼키지 않고 즉시 throw.  
- **순서 검증**: processPaidOrder에서 `FOR UPDATE`(orders 락)가 `Double-Check`보다 **앞**에 있는지 indexOf로 검사.  
- **BASE_URL 경고**: localhost/test가 아니면 운영 URL 가능성 경고 출력. API 검사는 테스트/로컬 전용.

**실제 보안 검증 권장**  
- **통합 테스트** (Jest/Mocha + 테스트 DB): 롤백 시 paid_events 유지·재고 복구, 멱등(이미 처리됨) 시 alreadyProcessed, §C 재고 부족 시 환불 후 pep 상태 등 **DB 상태까지** 검증.  
- **ESLint 등**: 결제 관련 파일에서 금지 패턴(예: Promise.race) 검사는 정적 분석/빌드 단계에서 추가 권장.

---

## 9. 보안 테스트 따라하기 (순서대로, 처음부터)

아래는 **처음 하는 사람도 화면만 보면서 그대로 따라 할 수 있도록** 단계를 나눈 설명입니다.  
한 단계씩 하고, **보이는 결과**가 적힌 것과 같은지 확인하면 됩니다.

---

### 0. 미리 준비할 것

- **프로젝트 폴더**: 이 문서가 있는 프로젝트가 컴퓨터 어딘가에 있어야 합니다.  
  예: `C:\Users\minmi\Documents\00-html-play\project-root` (윈도우) 또는 `/Users/이름/.../project-root` (맥).
- **Node.js**: 이미 이 프로젝트를 실행해 봤다면 보통 설치되어 있습니다.  
  확인: "명령어 창"을 열고 `node -v` 라고 입력 후 Enter. `v18...` 같은 숫자가 나오면 됩니다. 나오지 않으면 Node.js를 먼저 설치해야 합니다.
- **명령어 창**:
  - **윈도우**: 시작 메뉴에서 "PowerShell" 또는 "명령 프롬프트" 검색 후 실행.
  - **맥**: "터미널" 검색 후 실행.
- **두 개의 명령어 창**이 필요합니다. 하나는 "서버용", 하나는 "테스트 명령 입력용"입니다.

---

### 1단계: 프로젝트 폴더로 이동하기

1. 명령어 창을 **하나** 연다.
2. 아래 문장 **한 줄**을 그대로 복사해서 창에 붙여 넣고 **Enter**를 누른다.
   - **윈도우 (경로가 C 드라이브일 때)**  
     `cd C:\Users\minmi\Documents\00-html-play\project-root`
   - **맥 또는 다른 경로**  
     프로젝트가 있는 폴더 경로로 바꿔서: `cd /경로/프로젝트폴더이름`
3. **성공했을 때**: 다음 줄에 경로가 보이거나, 아무 에러 없이 커서만 나온다.  
   **실패했을 때**: "경로를 찾을 수 없습니다" 같은 메시지가 나오면, 경로를 다시 확인한다 (폴더 주소창에서 복사).

---

### 2단계: 서버 켜기 (첫 번째 창)

1. **같은 창**에서 아래를 **한 줄씩** 입력하고 Enter를 누른다.
   ```text
   node backend/index.js
   ```
2. **성공했을 때**:  
   - "서버가 3000 포트에서 실행 중" 비슷한 문구가 나오거나,  
   - 마지막 줄에 에러 없이 커서만 있고, 프로그램이 끝나지 않은 것처럼 보인다.  
   → 이 창은 **그대로 두고** 건드리지 않는다.
3. **실패했을 때**:  
   - "Cannot find module" 같은 빨간 에러가 나오면, 1단계에서 `cd` 한 폴더가 프로젝트 루트가 맞는지 확인한다.  
   - "포트가 이미 사용 중"이면, 이미 서버가 켜져 있는 것이므로 3단계로 넘어가도 된다.

---

### 3단계: 두 번째 명령어 창 열기

1. **새 명령어 창**을 하나 더 연다 (PowerShell 또는 터미널 하나 더).
2. 이 새 창에서도 **1단계와 똑같이** `cd ...` 로 프로젝트 폴더로 이동한다.  
   예: `cd C:\Users\minmi\Documents\00-html-play\project-root`  
3. **성공했을 때**: 이 창의 현재 위치가 프로젝트 폴더로 바뀐다.

---

### 4단계: 정적 검사만 먼저 해 보기 (서버 없이)

1. **두 번째 창**에서 아래를 **한 줄** 입력하고 Enter를 누른다.
   - **윈도우 PowerShell**  
     `node backend/scripts/order-flow-security-check.js`
   - **맥/리눅스**  
     `node backend/scripts/order-flow-security-check.js` (같음)
2. **성공했을 때**:
   - "=== 주문·결제 흐름 보안 검증 ===" 라는 제목이 나온다.
   - "정적 검사" 아래에 초록색 체크(✅)가 여러 개 있고, 맨 아래에 "정적 검사: 13/13 통과" 라고 나온다.
   - "API 검사 생략 (BASE_URL 미설정)" 이라고 나오고, "서버 기동 후 BASE_URL=..." 안내가 나온다.
3. **실패했을 때**:
   - "필수 검증 파일 누락" 이 나오면: 1단계에서 `cd` 한 폴더가 프로젝트 루트가 맞는지 다시 확인한다.
   - "정적 검사: 12/13 통과" 처럼 13이 아니면: 코드가 수정되었을 수 있으므로, 문서 §2-1과 코드를 비교해 본다.

이 단계까지 되면 **1번( body 검증 ), 2번( 주문 소유권 ), 14번( Promise.race 제거 ), 15번( 고아 커넥션 회수 )** 같은 항목이 **코드에 들어 있는지** 자동으로 확인된 것이다.

---

### 5단계: 서버 주소 알기 (포트 번호)

1. **첫 번째 창**에서 서버를 켰을 때 "3000 포트" 또는 "PORT 3000" 같은 말이 있었는지 확인한다.
2. **보통** 이 프로젝트는 **3000** 번 포트를 쓴다.  
   다른 숫자(예: 4000)로 바꿔서 켰다면 그 숫자를 기억한다.
3. 아래에서 **3000** 이라고 적힌 곳은, 실제로 쓰는 포트 번호로 바꿔서 진행하면 된다.

---

### 6단계: API 검사까지 하기 (서버 켠 상태에서)

1. **첫 번째 창**에서 서버가 **아직 켜져 있는지** 확인한다. (2단계에서 켠 그대로여야 한다.)
2. **두 번째 창**에서 아래를 **한 줄** 입력한다.  
   **3000을 실제 포트 번호로 바꿀 것.**
   - **윈도우 PowerShell**  
     `$env:BASE_URL="http://localhost:3000"; node backend/scripts/order-flow-security-check.js`
   - **맥/리눅스**  
     `BASE_URL=http://localhost:3000 node backend/scripts/order-flow-security-check.js`
3. **성공했을 때**:
   - "정적 검사: 13/13 통과" 가 나온다.
   - 그 다음 "--- API 검사 (BASE_URL 설정됨) ---" 가 나온다.
   - "(사전) CSRF 토큰 발급" 이 ✅ 이고,
   - "confirm body 없음 → 400", "confirm checkoutSessionKey 없음 → 400", "confirm amount 0 → 400", "confirm 존재하지 않는 주문번호 → 404" 가 **모두 ✅** 이다.
   - 맨 아래 "API 검사: 4/4 통과" 또는 "5/5 통과" 비슷하게 **전부 통과**로 나온다.
4. **실패했을 때**:
   - "API 검사" 에 ❌ 가 하나라도 있으면:
     - **"(사전) CSRF 토큰 발급" 이 ❌**  
       → 서버가 안 켜져 있거나, 주소/포트가 틀렸다. 2단계·5단계를 다시 확인한다.
     - **"confirm body 없음 → 400" 이 ❌**  
       → 서버가 400이 아니라 다른 번호(예: 403)를 주고 있다. 서버 코드가 최신인지, 문서 §2-1의 1번과 비교한다.
     - **"존재하지 않는 주문번호 → 404" 이 ❌**  
       → 서버가 404가 아니라 다른 번호를 준다. 문서 §2-1의 2번(주문 소유권)과 코드를 확인한다.
   - "연결할 수 없습니다" / "ECONNREFUSED"  
     → 서버가 꺼져 있거나 포트가 다르다. 첫 번째 창에서 서버를 다시 켠 뒤, 5단계 포트를 맞춘다.

이 단계까지 전부 ✅ 이면 **1번( body·checkoutSessionKey·amount 검증 )** 과 **2번( 없는 주문 → 404 )** 를 **실제로 요청을 보내서** 확인한 것이다.

---

### 7단계: 결과 정리 (무엇을 확인했는지)

- **4단계**까지 했으면:  
  "코드에 필수 보안 규칙이 들어 있는지(정적 검사)" 를 확인한 것이다.
- **6단계**까지 했으면:  
  "잘못된 요청( body 없음, 세션 키 없음, 금액 0, 없는 주문 번호 )을 보냈을 때 서버가 **실제로 400·404로 막는지**" 를 확인한 것이다.

**체크리스트** (출력 화면을 보면서 표시해 보기):

- [ ] "정적 검사: 13/13 통과" 가 나왔다.
- [ ] 서버를 켠 뒤 "API 검사" 를 실행했고, "confirm body 없음 → 400" 등 **모두 ✅** 이다.
- [ ] "API 검사: 4/4 통과" (또는 5/5) 가 나왔다.

위 세 개가 모두 되면, **1번·2번·14번·15번** 보안이 **동작하는 것**을 확인한 것이다.

---

### 8단계: 나머지 번호(3~19)를 할 때 필요한 것

- **3번(세션 검증), 4번(CONSUMED 멱등), 5번(success JOIN), 6번(processing/failed/CAS), 7번(금액 불일치)** 등은  
  **실제 주문·결제·DB**가 있어야 해서, "스크립트 한 번"으로는 안 하고 **손으로 시나리오**를 따라 해야 한다.
- **자세한 방법**은 이 문서 **§2-2 "항목별 테스트 방법"** 에, 번호마다 "방법", "기대", "확인" 이 적혀 있다.
- **순서**는:
  1. **먼저** 위 **1~7단계**를 끝내서 스크립트 정적+API 검사가 전부 통과하는지 확인한다.
  2. **그 다음** §2-2에서 "3번", "4번", "7번" 처럼 필요한 번호를 골라서, 적힌 대로 요청을 보내거나 DB를 확인한다.

**예시 – 7번(금액 불일치)만 해 보려면:**

1. 테스트용 주문 하나를 만든다 (총액 예: 10000원).
2. 결제 창까지 간 다음, **개발자 도구**나 **Postman**으로  
   `POST /api/payments/confirm` 에  
   `amount: 5000` 처럼 **주문 금액과 다른 값**을 넣어서 보낸다.  
   (checkoutSessionKey, orderNumber, paymentKey는 그 주문에 맞는 값으로.)
3. **기대**: 서버가 **400** 을 주고, 메시지에 "주문 금액과 결제 금액이 일치하지 않습니다" 가 포함된다.
4. **확인**: 응답 코드가 400인지, 본문에 위 문구가 있는지 본다.

이렇게 **§2-2에 적힌 대로** "방법 → 기대 → 확인" 순서로 하면 된다.

---

### 9단계: 자주 하는 실수와 해결

| 하는 일 | 잘못된 것 | 올바른 것 |
|--------|-----------|-----------|
| 폴더 이동 | `cd backend` 만 입력 | 프로젝트 **루트** 로 이동: `cd .../project-root` |
| 서버 안 켬 | 두 번째 창에서만 스크립트 실행 | **먼저 첫 번째 창**에서 `node backend/index.js` 로 서버 실행 |
| 포트 틀림 | `BASE_URL=http://localhost:3000` 인데 서버는 4000 포트 | 서버가 4000이면 `http://localhost:4000` 으로 맞춤 |
| 윈도우에서 BASE_URL | `BASE_URL=http://localhost:3000 node ...` (맥 방식) | PowerShell: `$env:BASE_URL="http://localhost:3000"; node backend/scripts/order-flow-security-check.js` |
| 운영 서버로 테스트 | BASE_URL에 실제 쇼핑몰 주소 입력 | **절대 금지**. 반드시 **localhost** 또는 테스트용 주소만 사용 |

---

### 10단계: 한 줄 요약

1. **명령어 창 2개** 연다.  
2. **첫 번째 창**: `cd 프로젝트폴더` → `node backend/index.js` (서버 켬, 그대로 둠).  
3. **두 번째 창**: `cd 프로젝트폴더` → `node backend/scripts/order-flow-security-check.js` (정적만) → 전부 ✅ 인지 확인.  
4. **같은 두 번째 창**: `$env:BASE_URL="http://localhost:3000"; node backend/scripts/order-flow-security-check.js` (윈도우) 또는 `BASE_URL=http://localhost:3000 node backend/scripts/order-flow-security-check.js` (맥) → API 검사까지 전부 ✅ 인지 확인.  
5. **더 하고 싶으면** §2-2에서 3번, 4번, 7번 등 원하는 번호를 골라서 "방법 → 기대 → 확인" 순서로 따라 한다.

---

*이 문서는 코드·문서 대조만 수행. 신규 .md 생성 규칙에 따라 필요 시 기존 문서에 병합하거나 삭제 가능.*
