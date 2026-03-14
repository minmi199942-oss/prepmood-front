# 이미 결제된 주문 재진입 차단 — 수정 계획서 (GPT 구조 기준)

결제 완료 여부는 **서버가 결정**한다. 클라이언트는 결제 페이지 재진입 시 **서버에 다시 묻고**, 이미 끝난 주문이면 화면을 보여주지 않고 **이동만** 한다.  
이 문서는 GPT 제안 구조를 우리 코드·DB로 검증한 뒤, 받아들일 부분·보완·1차 구현 범위를 반영한 **단일 계획**이다.

---

## 0. 검증 요약 (코드·DB 기준, 추측 없음)

| GPT 피드백 | 우리 환경 검증 결과 | 반영 |
|------------|---------------------|------|
| 403 전부 = order-complete 금지 | payments-routes.js Status API: 403은 SESSION_REQUIRED / INVALID_SESSION / SESSION_CONSUMED 세 종류. 전부 order-complete로 보내면 “접근 거부”와 “완료”가 섞임. | **수용** — 완료로 해석 가능한 경우만 order-complete. |
| SESSION_CONSUMED → order-complete 시 서버가 같은 소유자 검증 | Status API(982–1006): session_key + order_number로 **같은 주문**은 검증함. **같은 소유자**는 403 반환 경로에서 미검증(optionalAuth만 사용). | **보완** — 403 SESSION_CONSUMED 반환 전에 회원은 order.user_id === req.user?.userId, 비회원은 세션 소유만으로 간주하고, 불일치 시 403 FORBIDDEN 반환. |
| 재결제 금지 = paid_events만 / 완전 처리 완료 = 별도 | confirm 쪽은 현재 paid_events+pep.success 사용(355–361). order-routes idem 분기는 paid_events 미사용. | **수용** — 재결제 금지는 hasPaidEventForOrder(paid_events만). 완전 처리 완료는 isOrderFullyProcessedPaid(pep.success) 별도(필요 시 추후). |
| idem hit 시 기존 OPEN 세션 재사용 | order-routes 528–559: idem hit + rows.length 시 **항상 새 UUID + INSERT**. DB: checkout_sessions.status = PENDING\|IN_PROGRESS\|CONSUMED(091). | **수용** — hasPaid면 409. 아니면 해당 order_id에 대해 status IN ('PENDING','IN_PROGRESS')인 기존 세션 있으면 그 session_key로 200, 없을 때만 새 세션 생성. |
| 결제 완료 후 같은 주문의 다른 OPEN 세션 무효화 | payment-wrapper.js 367, payments-routes 1043: **현재 세션만** CONSUMED. 같은 order_id의 다른 세션 갱신 없음. | **수용** — confirm 성공(paid_events 반영·현재 세션 CONSUMED) 후, 같은 order_id의 나머지 checkout_sessions를 CONSUMED로 일괄 업데이트. |
| buildAlreadyConfirmedResponse는 release 전 호출 | existingSuccessRows 블록(363–421): 인라인 조회 후 rollback, release, res.json. helper 도입 시 connection 사용하므로 **release 전**에 helper 호출 필수. | **보완** — helper는 connection으로 조회만 수행해 객체 반환. 호출부는 helper 호출 → rollback → release → res.json(반환값). |
| 1차는 checkoutFlow 전체가 아닌 idemKey+lastOrderNumber+lastCheckoutSessionKey | 현재 sessionStorage에 checkoutIdemKey, checkoutLastOrderNumber, checkoutSessionKey_<n> 분리 저장. | **수용** — 1차는 기존 키만 유지. flowId/cartFingerprint/shippingFingerprint는 추후 확장. 진짜 새 주문 시작은 기존대로 장바구니→체크아웃 진입 시 플래그(checkoutFromCart)로 제거. |
| paid_events 전제 / OPEN 재사용 순서 / 무효화 SSOT | GPT 보완 4건. | **보완** — §3 전제·§4.2 재사용 순서(IN_PROGRESS > 최신 PENDING)·§4.3 무효화는 confirm 성공 트랜잭션 한 군데·§4.6 진입점 점검. |

---

## 1. 최종 원칙 (서버 불변식)

| # | 원칙 |
|---|------|
| 1 | **hasPaidEventForOrder(orderId) === true** 이면 새 checkout session 발급 금지 (409 ORDER_ALREADY_PAID). |
| 2 | **hasPaidEventForOrder(orderId) === true** 이면 confirm 재처리 금지, **200 멱등** (alreadyConfirmed). |
| 3 | 결제 완료 후 같은 order_id에 남은 **다른 OPEN(PENDING/IN_PROGRESS) 세션은 모두 CONSUMED로 무효화**. |
| 4 | 결제 페이지 진입 가능 여부는 **서버 상태로만** 판단. sessionStorage는 같은 탭 체크아웃 흐름 보조용. |
| 5 | **같은 소유자**의 완료 주문만 order-complete로 보냄. 그 외 접근 거부는 index / 로그인 / 비회원 조회. |

---

## 2. 버릴 것 (설계에서 제거)

- sessionStorage 값만 보고 “이미 결제됨”이라고 판단하는 방식  
- **403이면 전부 order-complete로 보내는 방식**  
- paid_events + paid_event_processing.success를 “재결제 금지”와 “완전 처리 완료”에 같이 쓰는 방식  
- 결제 완료 직후 checkoutIdemKey를 지우는 방식  
- idem hit 때마다 **무조건 새 checkout session 생성**하는 방식  

---

## 3. 함수 분리 (order-paid-check.js)

| 함수 | 목적 | SQL |
|------|------|-----|
| **hasPaidEventForOrder(connection, orderId)** | 재결제 금지·새 세션 발급 금지 | `SELECT 1 FROM paid_events WHERE order_id = ? LIMIT 1` |
| **isOrderFullyProcessedPaid(connection, orderId)** (선택, 추후) | “주문 후처리까지 완전 성공” 표시 | paid_events + paid_event_processing.status = 'success' |

이번 작업에서는 **재결제 차단에는 hasPaidEventForOrder만** 사용. 두 함수를 섞어 쓰지 않음.

**전제 (구현 시 점검)**  
- **paid_events**는 “검증 완료된 결제”만 기록되는 테이블이어야 한다. (우리 코드: paid-event-creator.js·payments-routes에서 createPaidEvent는 PG 검증 후에만 호출됨. 중간/임시 이벤트가 paid_events에 들어가면 hasPaidEventForOrder가 정상 흐름까지 막을 수 있음.)

---

## 4. 수정 계획 (Before → After)

### 4.1 `backend/utils/order-paid-check.js` (신규)

- **hasPaidEventForOrder(connection, orderId)** 하나만 export.  
- SQL: `SELECT 1 FROM paid_events WHERE order_id = ? LIMIT 1`.  
- 반환: `rows.length > 0`.  
- 주석: 재결제·새 세션 발급 금지 판정용.

---

### 4.2 `backend/order-routes.js` — POST /api/orders (idempotency)

| 단계 | Before | After |
|------|--------|-------|
| require | - | `const { hasPaidEventForOrder } = require('./utils/order-paid-check');` |
| idem hit + rows.length | 항상 새 checkoutSessionKey 생성 후 INSERT → 200 | 1) **hasPaidEventForOrder(connection, rows[0].order_id)** 호출. **true**면 새 세션 생성 없이 `connection.end()` 후 **409** ORDER_ALREADY_PAID + order_number. 2) **false**면: 해당 **order_id**에 대해 기존 OPEN 세션 조회. **재사용 우선순위**: IN_PROGRESS 1개 우선, 없으면 가장 최근 PENDING 1개. `SELECT session_key FROM checkout_sessions WHERE order_id = ? AND status IN ('PENDING','IN_PROGRESS') ORDER BY CASE WHEN status = 'IN_PROGRESS' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`. **있으면** 그 session_key로 200 (기존 세션 재사용). **없으면** 기존처럼 새 UUID 생성·INSERT 후 200. |

---

### 4.3 `backend/payments-routes.js` — confirm

| 항목 | 내용 |
|------|------|
| require | `const { hasPaidEventForOrder } = require('./utils/order-paid-check');` |
| **buildAlreadyConfirmedResponse(connection, order, orderNumber, serverAmount, currency, userId)** | confirm 라우트 바깥에 정의. **connection으로만** payments·guest·cartCleared 조회 후 **객체만 반환**. rollback/release 하지 않음. **반드시 connection.release() 전에** 호출(helper 내부에서 connection 사용). |
| 주문 조회 직후 | `const order = orderRows[0];` 다음에 **hasPaidEventForOrder(connection, order.order_id)**. true면 serverAmount·currency 계산 후 **responseObj = buildAlreadyConfirmedResponse(connection, ...)** 호출 → **이후** `await connection.rollback(); connection.release(); return res.json(responseObj);`. |
| existingSuccessRows 블록 | 동일 조건에서 **responseObj = buildAlreadyConfirmedResponse(connection, ...)** 호출(connection 사용) → **이후** `await connection.rollback(); connection.release(); return res.json(responseObj);`. (인라인 조회·응답 객체를 helper로 대체.) |
| **결제 완료 후 다른 세션 무효화** | **한 군데만 책임**: confirm 성공이 커밋되는 **그 트랜잭션 소유자**가 현재 세션 CONSUMED + 같은 order_id 나머지 CONSUMED를 함께 수행. **토스 confirm**: payment-wrapper.js Conn B가 트랜잭션을 가지므로 Conn B에서 `UPDATE checkout_sessions SET status = 'CONSUMED', updated_at = NOW() WHERE order_id = (SELECT order_id FROM checkout_sessions WHERE session_key = ?) AND session_key != ?` 및 현재 session_key CONSUMED. **이니시스 리다이렉트** 등 wrapper를 쓰지 않는 성공 경로가 있으면, 해당 경로 commit 직전에 order_id 기준 동일 UPDATE. (두 곳에서 하지 말고, 경로당 한 군데만.) |

---

### 4.4 Status API — SESSION_CONSUMED와 소유자 검증

| 항목 | 내용 |
|------|------|
| 현재 | 403 SESSION_CONSUMED 반환 시 session_key + order_number로 “같은 주문”만 검증. 소유자 검증 없음. |
| After | **403 SESSION_CONSUMED를 반환하기 직전**에: 회원이면 `order.user_id === req.user?.userId` 확인. 비회원이면 세션은 해당 주문 전용이므로 403 SESSION_CONSUMED 유지. **소유자 불일치**면 403 **FORBIDDEN** (또는 OWNERSHIP_MISMATCH), code로 구분. 그러면 클라이언트는 “완료로 해석 가능한 403”은 **code === 'SESSION_CONSUMED'** 일 때만 order-complete로 보냄. |

---

### 4.5 `checkout-payment.js` — 클라이언트

| 항목 | 내용 |
|------|------|
| idemKey | `let idemKey = sessionStorage.getItem('checkoutIdemKey'); if (!idemKey) { idemKey = uuidv4(); sessionStorage.setItem('checkoutIdemKey', idemKey); }` (토스·이니시스 공통). |
| POST /orders 200 | orderNumber·checkoutSessionKey 저장 + **checkoutLastOrderNumber** 저장. |
| POST /orders 409 ORDER_ALREADY_PAID | order-complete.html?orderId=<order_number> 로 replace 후 return. |
| **load / pageshow 재검사** | DOMContentLoaded **맨 앞** + pageshow(event.persisted === true)에서, checkoutLastOrderNumber·checkoutSessionKey_<그 번호> 있으면 **GET .../status** 호출. **비동기 완료 후** 아래 분기. |
| **리다이렉트 분기 (403 분리)** | **200 + data.status === 'paid'** → order-complete. **403 + data.code === 'SESSION_CONSUMED'** → order-complete (서버가 이미 같은 소유자 검증한 경우만 이 코드 반환). **403** 그 외(SESSION_REQUIRED, INVALID_SESSION, FORBIDDEN 등) → **index.html 또는 로그인/비회원 조회**. **404** → index 또는 체크아웃 시작. **200 + status !== 'paid'** → 결제 UI 유지. |
| 실행 순서 | 재검사 **완료 후**에만 다음 단계. 리다이렉트하지 않을 때만 배송 데이터 로드·결제 UI 렌더. (await 등으로 순서 보장.) |

---

### 4.6 진짜 새 주문 시작 (1차: 기존 플래그 방식 유지)

- **유지**: order-complete 도착 시 checkoutIdemKey 제거하지 않음. 배송→결제 전환 시 제거하지 않음.  
- **새 키/제거**: **장바구니→체크아웃(배송)** 진입 시에만. cart-script.js / mini-cart.js에서 checkout.html로 보낼 직전 `sessionStorage.setItem('checkoutFromCart', '1')`. checkout-script.js 로드 시 `checkoutFromCart === '1'`이면 removeItem('checkoutFromCart'), removeItem('checkoutIdemKey'), removeItem('checkoutLastOrderNumber').  
- 1차 구현에서는 **idemKey + lastOrderNumber + lastCheckoutSessionKey**만 사용. flowId/cartFingerprint/shippingFingerprint는 추후 확장.  
- **진입점 점검**: “새 주문 시작” 시 새 idemKey가 나와야 하는 진입점을 1차에서는 **장바구니·미니카트 → checkout**만 플래그로 처리. 바로구매, 로그인 후 복원(returnTo=checkout), 기타 CTA가 있으면 해당 경로에서도 새 idemKey 발급 조건(플래그 또는 동일 로직) 적용 필요.

---

### 4.7 order-complete-script.js / checkout-script.js (배송→결제)

- **order-complete-script.js**: checkoutIdemKey 제거 로직 **추가하지 않음**.  
- **checkout-script.js**: 배송→결제 시 removeItem('checkoutIdemKey') 추가하지 않음. 로드 시 checkoutFromCart 플래그 처리만 위 4.6대로.

---

## 5. 구현 체크리스트

| # | 파일 | 내용 |
|---|------|------|
| 1 | backend/utils/order-paid-check.js | 신규. hasPaidEventForOrder(connection, orderId). |
| 2 | backend/order-routes.js | require. idem hit 시 hasPaid → 409. else 기존 OPEN 세션 재사용(우선순위: IN_PROGRESS > 최신 PENDING), 없을 때만 새 세션 생성. |
| 3 | backend/payments-routes.js | require. buildAlreadyConfirmedResponse (connection 사용, release 전 호출). |
| 4 | backend/payments-routes.js | confirm: 주문 조회 직후 hasPaidEventForOrder → true면 200 멱등. existingSuccessRows 블록도 helper 사용. |
| 5 | payment-wrapper.js (토스) / 해당 경로(이니시스 등) | confirm 성공 시 세션 무효화(현재+같은 order_id)는 **그 성공을 커밋하는 트랜잭션 한 군데**에서만 수행. 토스: wrapper Conn B. 이니시스 등: 해당 경로 commit 직전. |
| 6 | backend/payments-routes.js | Status API: 403 SESSION_CONSUMED 반환 전 회원 소유자 검증; 불일치 시 403 FORBIDDEN. |
| 7 | checkout-payment.js | idemKey 유지, 200 시 checkoutLastOrderNumber 저장, 409 ORDER_ALREADY_PAID 시 order-complete. |
| 8 | checkout-payment.js | DOMContentLoaded + pageshow 재검사. **200+paid** 또는 **403+code SESSION_CONSUMED** → order-complete. 그 외 403/404 → index 또는 로그인/비회원. |
| 9 | checkout-script.js | 로드 시 checkoutFromCart === '1'이면 키·LastOrderNumber 제거. 배송→결제 시 removeItem 추가 안 함. |
| 10 | cart-script.js / mini-cart.js | checkout.html 이동 직전 checkoutFromCart = '1' 설정. |
| 11 | order-complete-script.js | 변경 없음. checkoutIdemKey 제거 안 함. |

---

## 6. 절대 하지 말 것

- order-complete 도착 시 checkoutIdemKey 삭제  
- 배송→결제 전환 시 checkoutIdemKey 삭제  
- **403 전부 = order-complete**  
- paid_event_processing.success만 보고 재결제 금지 판단  
- idem hit 때마다 무조건 새 checkout session 생성  
- buildAlreadyConfirmedResponse를 **connection.release() 이후**에 호출  

---

## 7. 완료 기준

- 뒤로가기 해도 같은 주문이 다시 결제되지 않음.  
- 다른 탭/브라우저/계정으로 접근해도 완료 주문이 다시 열리지 않음.  
- 같은 소유자는 완료 화면(order-complete)으로 복귀.  
- confirm 재진입은 에러가 아니라 200 멱등.  
- 새 주문을 시작할 때만 새 idemKey 발급(장바구니→체크아웃 진입 시 플래그로 정리).  

한 줄 요약: **paid_events가 한 건이라도 있으면 서버가 새 결제 흐름을 열지 않고, checkout-payment.js는 재진입 시마다 서버에 다시 물어본 뒤 같은 소유자만 order-complete, 나머지는 index/login으로 보낸다.**

**구현 시 점검 한 줄**: paid_events는 검증 완료된 결제만 기록된다는 전제하에, OPEN 세션 재사용 우선순위는 IN_PROGRESS > 최신 PENDING, 최종 세션 무효화는 confirm 성공 트랜잭션 한 곳에서만 수행한다.
