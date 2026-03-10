# confirm·결제 흐름 시니어 점검 및 Gemini 피드백 정리

**작성 목적**: 주문·결제 과정 전체를 코드 기준으로 점검하고, Gemini가 제시한 피드백을 우리 환경(090/091 마이그레이션 적용 가정)에 맞게 검증·정리한다. 보안·효율·타임아웃·오류 구간과 “유령 주문·멱등성” 리스크를 한 문서에 모은다.

**전제**: 090(payment_attempts 등), 091(checkout_sessions·payment_attempts 컬럼) 마이그레이션은 적용된 상태로 가정.

**검증 기준**: 추측 없이 해당 라우트·유틸 코드 직접 확인.

---

## 1. 시니어 관점 전체 점검 (코드 근거)

### 1.1 흐름 요약

| 구간 | 진입 조건 | 사용 리소스 | 완료/실패 판단 |
|------|-----------|-------------|----------------|
| **confirm (토스)** | POST /api/payments/confirm, checkoutSessionKey·orderNumber·amount·paymentKey | 풀(검증용 1회) → Conn A(3s) → Fetch(10s) → Conn B(5s) | Phase 3 commit 후 checkout_sessions CONSUMED, payment_attempts CONFIRMED |
| **confirm (이니시스)** | POST (이니시스 리다이렉트) | createConnection 1개, 트랜잭션 내 createPaidEvent(풀) + processPaidOrder(같은 conn) | 트랜잭션 commit / rollback |
| **confirm (웹훅)** | POST /api/payments/webhook (토스) | createConnection 1개, 동일 | 위와 동일 |

### 1.2 보안

- **금액·PG 응답**: confirm 진입 시 `serverAmount`(orders.total_price) vs `clientAmount` 검사. withPaymentAttempt 내부에서 PG 응답 `orderId`·`amount`와 `pgOrderId`·`amountStr` 대조(ZERO_TRUST_VIOLATION).  
- **세션**: checkout_sessions로 session_key·order_id·만료·CONSUMED 검사. CONSUMED 시 동일 세션 재진입 시 200 + alreadyConfirmed(232~279행).  
- **결제 증거**: paid_events는 INSERT만(ODKU 제거 반영), 증거 덮어쓰기 없음.  
- **주의**: 이니시스/웹훅은 payment_attempts·checkout_sessions를 쓰지 않아, 토스와 선점·멱등 모델이 다름. createPaidEvent(alreadyExists) + processPaidOrder 호출로만 중복 대응.

### 1.3 효율

- **confirm (토스)**: 검증용 풀 커넥션 1회 사용 후 rollback·release(373~375). 이후 withPaymentAttempt에서 Conn A → release → Fetch(커넥션 없음) → Conn B.  
- **이메일**: paidResult.data.orderInfo.items·customerName 있으면 추가 SELECT 없이 사용(548행 근처). 없으면 emailConnection으로 order_items + orders+users 2회 조회.  
- **장바구니**: 성공 후 풀 커넥션으로 DELETE, try/finally release(507~519).

### 1.4 타임아웃·오류 가능 구간

| 구간 | 값 | 동작 |
|------|-----|------|
| 토스 Confirm API | 10초 | AbortController, 초과 시 TOSS_FETCH_TIMEOUT → fallback TIMEOUT_WAITING |
| Conn A | 3초 | getSafeConnection. 타임아웃/abort 시 고아 커넥션 회수 적용됨 |
| Conn B | 5초 | 동일 |
| 전체 시도 | 40초 | watchdog → WATCHDOG_TIMEOUT |
| createPaidEvent | - | Promise.race 제거됨. pool.getConnection()만 사용, queueLimit으로 fail-fast |
| updateProcessingStatus / recordStockIssue | - | 실패 시 throw. 유령 주문 방지용 |

### 1.5 오류·설계상 리스크 (코드 기준)

- **existingPaidEvents만으로 200 alreadyConfirmed**: 289~354행. `paid_events`에 행이 있으면 곧바로 200 + alreadyConfirmed 반환.  
  - **문제**: paid_events는 createPaidEvent 성공 시점에 생성됨. 그 직후 processPaidOrder가 실패(재고 부족, updateProcessingStatus throw 등)하면 Conn B 롤백으로 order_item_units·warranties·invoices는 없고 paid_events만 남음.  
  - 다음 요청에서 existingPaidEvents.length > 0 이면 “이미 완료”로 응답하지만, 실제로는 **주문 처리 미완료(유령 주문)** 일 수 있음.  
- **processPaidOrder**: 진입 시 paid_event_processing.status 조회 없음. 동일 paidEventId로 재진입 시 updateProcessingStatus('processing') 후 order_item_units INSERT에서 uk_order_item_unit_seq 등으로 중복 키 가능.  
- **이니시스/웹훅**: createConnection 사용. 풀과 이원화되어 있어, 부하 시 커넥션 수·제어 방식이 토스 confirm과 다름.

---

## 2. Gemini 피드백 요약 및 우리 코드 검증

### 2.1 Risk 1 — “유령 주문” 확정 리스크 (이미 완료 판단)

**Gemini 요지**: existingPaidEvents.length > 0만으로 200을 주면, “영수증(paid_events)은 있는데 주문 처리(processPaidOrder)는 실패한 상태”에서 고객에게 성공으로 보여줄 수 있다.

**우리 코드 검증**  
- **payments-routes.js 289~354행**: `SELECT event_id FROM paid_events WHERE order_id = ?` 후 `existingPaidEvents.length > 0`이면 payments·guest_access_token·cartCleared 조회 후 `res.json({ success: true, data: { ..., alreadyConfirmed: true } })` 반환.  
- **paid_event_processing.status는 조회하지 않음.**  
- createPaidEvent는 별도 커넥션(autocommit)에서 수행되므로, processPaidOrder 실패 시 paid_events 행은 남고 order_item_units 등은 롤백됨.  
→ **Gemini 지적과 일치. “이미 완료” 판단을 paid_events 존재만으로 하는 것은 유령 주문을 성공으로 노출할 수 있는 설계 결함.**

### 2.2 Risk 2 — processPaidOrder 멱등성 부재

**Gemini 요지**: 같은 eventId로 재진입 시 order_item_units 삽입에서 PK/UNIQUE 위반으로 크래시 가능. “이미 처리됨”을 인지하고 기존 결과를 반환하는 Early Return 필요.

**우리 코드 검증**  
- **paid-order-processor.js**: 진입 시 주문·금액·통화 검증 후 곧바로 `updateProcessingStatus(paidEventId, 'processing')`(174행). paid_event_processing.status를 먼저 조회하지 않음.  
- **027_create_order_item_units_table.sql**: `uk_order_item_unit_seq (order_item_id, unit_seq)` 존재. 동일 주문·동일 eventId로 두 번 처리 시 같은 (order_item_id, unit_seq) 삽입 시도 → 중복 키.  
→ **Gemini 지적과 일치. processPaidOrder 진입 시 status = 'success'면 이미 처리된 것으로 보고 Early Return 필요.**

### 2.3 Risk 3 — 커넥션 이원화

**Gemini 요지**: 이니시스/웹훅이 createConnection이면 풀과 정책이 달라, 부하 시 커넥션 고갈·제어 불일치 가능.

**우리 코드 검증**  
- **payments-routes.js**: confirm(토스)은 풀 + getSafeConnection. 이니시스(700행 근처), 웹훅(1778행 근처) 등은 `mysql.createConnection(dbConfig)` 사용.  
→ **지적 타당. 정책상 “confirm 경로만 풀”이지만, 장기적으로 PG 경로 풀 통일은 효율·제어 측면에서 권장.**

### 2.4 Gemini 제안 쿼리와 우리 스키마

- **confirm 쪽 “완료” 판단**: Gemini 제안은 “paid_event_processing의 status가 success인지” 확인.  
  - 우리 스키마: paid_events(order_id, payment_key, …), paid_event_processing(event_id, status, …).  
  - 한 order_id에 여러 paid_events(다른 payment_key)가 있을 수 있으므로, “이 주문이 실제로 처리 완료되었는가”는 **paid_event_processing.status = 'success'인 event가 해당 order_id에 연결된 경우**로 보는 것이 맞음.  
  - 예:  
    `SELECT pep.event_id FROM paid_event_processing pep INNER JOIN paid_events pe ON pep.event_id = pe.event_id WHERE pe.order_id = ? AND pep.status = 'success' LIMIT 1`  
  - 결과가 1건 이상이면 “진짜 완료”로 200 alreadyConfirmed 가능.  
- **processPaidOrder Early Return**: event_id 단위로 `SELECT status FROM paid_event_processing WHERE event_id = ?`. status = 'success'이면 `return { success: true, alreadyProcessed: true, message: '이미 처리됨', data: ... }` 형태로 반환.  
  - 이미 주문·order_items를 조회한 뒤라면, alreadyProcessed 시에도 orderInfo 등 필요한 최소 data를 채워 반환하는 편이 호출부(confirm 응답)에 유리.  
  - SELECT는 트랜잭션 내에서 하되, FOR UPDATE는 필요 시에만(이미 orders FOR UPDATE 후이므로, paid_event_processing은 단순 조회로도 가능).

---

## 3. 우리 환경에서의 정정·보완 사항

| Gemini 제안 | 우리 환경 반영 |
|-------------|----------------|
| “status = 'success'인 경우에만 성공 응답” | confirm 라우트에서 **paid_events 존재** 대신 **paid_events + paid_event_processing.status = 'success'** 조인 조회로 “실제 완료” 여부 판단. |
| “processPaidOrder 시작 시 상태 체크 후 already_processed 반환” | paid_event_processing을 event_id로 조회, status = 'success'이면 기존 반환 형태(success, alreadyProcessed: true, data)로 Early Return. |
| “failed면 재시도 허용 또는 대응” | status = 'failed'인 경우: confirm에서는 “이미 완료”로 보지 않음(200 alreadyConfirmed 주지 않음). processPaidOrder에서는 이미 success 체크로 Early Return만 넣고, failed 재시도 정책은 별도(수동/리콘 등)로 두는 편이 안전. |
| 커넥션 풀 통일 | 단기에는 기존 설계 유지(confirm만 풀). 장기 개선 항목으로 “이니시스/웹훅도 풀” 검토. |

---

## 4. 권장 수정 방향 (구현 시 참고)

### 4.1 confirm 라우트 — “이미 완료” 판단 강화 (payments-routes.js)

- **현재**: 289~292행 `SELECT event_id FROM paid_events WHERE order_id = ?` → length > 0이면 200 alreadyConfirmed.  
- **권장**:  
  - “실제 처리 완료”만 200 alreadyConfirmed로 보려면, **paid_event_processing.status = 'success'** 인 event가 해당 order_id에 있는지 조회.  
  - 예시(의사):  
    `SELECT pep.event_id, pe.event_id FROM paid_event_processing pep INNER JOIN paid_events pe ON pep.event_id = pe.event_id WHERE pe.order_id = ? AND pep.status = 'success' LIMIT 1`  
  - 결과가 1건 이상일 때만 기존과 동일한 블록(payments·guest_access_token·cartCleared 등)으로 200 + alreadyConfirmed 반환.  
  - **status = 'success'인 건이 없고** paid_events만 있는 경우(pending/processing/failed):  
    - 200 alreadyConfirmed를 주지 말고,  
    - “이전 시도에서 처리 미완료”로 간주해 409 + 안내 메시지 또는, (정책에 따라) withPaymentAttempt 재진입 허용 중 하나로 통일.  
- **CONSUMED 경로(232~279)**: 세션 CONSUMED는 Phase 3 commit 이후에만 설정되므로, “실제 완료”와 동일. 변경 불필요.

### 4.2 processPaidOrder — 멱등 Early Return (paid-order-processor.js)

- **위치**: 주문·금액·통화 검증 직후, `updateProcessingStatus(paidEventId, 'processing')` 호출 전(또는 직후가 아니라 “진입 직후”에 상태만 조회).  
- **로직**:  
  - `SELECT status FROM paid_event_processing WHERE event_id = ?` (트랜잭션 내, 기존 connection 사용).  
  - `status === 'success'`이면:  
    - (선택) 이미 조회한 order·orderItems가 있으면 orderInfo 형태로 data 구성. 없으면 최소한 paidEventId·orderId·message만 반환.  
    - `return { success: true, alreadyProcessed: true, message: '이미 처리됨', data: { ... } }`.  
  - 그 외(pending, processing, failed): 기존대로 진행.  
- **주의**: alreadyProcessed 반환 시 호출부(processOrderFn, 이니시스/웹훅 라우트)가 200과 동일한 응답 형태를 기대하므로, data에 order_number·invoiceNumber 등 필수 필드는 채워주는 편이 안전.

---

## 5. 요약 표

| 구분 | 내용 |
|------|------|
| **환경** | 090/091 마이그레이션 적용 가정. 토스 confirm은 checkout_sessions·payment_attempts 사용. |
| **시니어 점검** | 보안(금액·PG·세션·증거) 적절. 효율·타임아웃 구간 정리됨. 리스크: existingPaidEvents만으로 200, processPaidOrder 비멱등, 커넥션 이원화. |
| **Gemini Risk 1** | 타당. paid_events 존재만으로 “이미 완료” 응답 시 유령 주문을 성공으로 노출할 수 있음. |
| **Gemini Risk 2** | 타당. processPaidOrder에 status = 'success' Early Return 없으면 동일 eventId 재진입 시 중복 키 등 오류 가능. |
| **Gemini Risk 3** | 타당. 이니시스/웹훅 createConnection은 풀과 이원화. 장기적으로 풀 통일 권장. |
| **권장 조치** | (1) confirm에서 “이미 완료”는 paid_event_processing.status = 'success' 기준으로 변경. (2) processPaidOrder 진입 시 status = 'success'면 alreadyProcessed 반환. |

---

## 6. Gemini 2차 피드백 (설계적 죄악·Best Practice) 검증

Gemini가 “명품 쇼핑몰에 걸맞지 않은 치명적 데이터 정합성 결함”으로 정리한 3가지와 복구 전략 질의를, 우리 코드와 대조해 검증·보완한다.

### 6.1 [치명적] 유령 성공 응답 (False Success Response)

**Gemini 요지**: existingPaidEvents.length > 0만으로 alreadyConfirmed를 주는 것은 “결제 기록만 있고 주문 확정은 안 된 상태”를 성공으로 보여주는 것과 같다.

**검증**: §2.1·§4.1과 동일. **타당.**  
- **Best Practice 반영**: confirm 라우트에서 “이미 완료”는 **paid_events와 paid_event_processing을 조인**해 `pep.status = 'success'`인 건이 해당 order_id에 있을 때만 200 alreadyConfirmed.  
- Gemini 제안 쿼리와 우리 스키마 정합:  
  `SELECT pe.event_id FROM paid_events pe JOIN paid_event_processing pep ON pe.event_id = pep.event_id WHERE pe.order_id = ? AND pep.status = 'success' LIMIT 1`  
  - pending/failed인 경우 성공 응답 금지. 재시도 유도 또는 409 등 명시적 처리.

### 6.2 [위험] 멱등성 파괴 및 DB 크래시 (Non-Idempotent Fulfillment)

**Gemini 요지**: processPaidOrder 진입 시 상태 체크 없이 order_item_units 삽입 시도 시, 웹훅 재전송 등으로 동일 요청이 여러 번 오면 UK 위반·500 발생.

**검증**: §2.2·§4.2와 동일. **타당.**  
- **Best Practice 반영**: 진입 직후 `paid_event_processing` 조회 후 status = 'success'면 비즈니스 로직 생략·기존 성공 데이터 반환(Early Return).  
- **FOR UPDATE 여부**:  
  - **단순 SELECT**: “이미 success면 return”만 목적이면 읽기만으로 충분.  
  - **FOR UPDATE**: 동일 eventId에 대해 두 processPaidOrder가 동시에 들어올 때, 한쪽이 먼저 행을 잠그면 다른 쪽은 대기 후 success를 읽고 Early Return할 수 있어, 중복 삽입을 완전히 막고 싶을 때 유리.  
  - 우리 락 순서: processPaidOrder 내부는 이미 **orders FOR UPDATE** 선행(102행). 그 다음 **paid_event_processing WHERE event_id = ? FOR UPDATE**를 두면 순서는 orders → paid_event_processing → (이후 stock_units 등). 전역 락 계층(stock_units → orders)과 다른 경로(환불 등)와의 데드락 가능성은 별도 검토 필요. **권장**: 우선 단순 SELECT로 Early Return만 적용해도 멱등성 확보에 도움 되며, 동시성 이슈가 실제로 관찰되면 FOR UPDATE 도입 검토.

### 6.3 [비효율] 커넥션 이원화 (Legacy vs. Modern)

**Gemini 요지**: 이니시스/웹훅의 createConnection은 풀 없이 커넥션을 늘려 DB 다운 위험이 있으므로, 모든 결제 경로를 pool로 통일해야 한다.

**검증**: §2.3과 동일. **방향 타당.**  
- 우리 코드: 토스 confirm만 풀 + getSafeConnection. 이니시스(700행)·웹훅(1778행)은 createConnection.  
- **우리 환경 반영**: “Confirm 경로만 풀”은 현재 설계·문서 정책. 단기 유지, **장기**에는 이니시스/웹훅도 pool.getConnection() + try/finally release(및 필요 시 getSafeConnection)로 통일하는 것을 권장. 일괄 교체 시 트랜잭션 범위·에러 시 rollback·release 보장을 반드시 검증할 것.

### 6.4 응답 구조 (alreadyProcessed 시 필수 데이터)

**Gemini 요지**: alreadyProcessed: true와 함께 invoice_number 등 필수 데이터를 포함해 응답해야 한다.

**검증**: **타당.**  
- processPaidOrder가 alreadyProcessed로 Early Return할 때, 호출부(confirm·이니시스·웹훅)는 200과 동일한 형태(order_number, invoiceNumber, orderInfo 등)를 기대할 수 있음.  
- **권장**: alreadyProcessed 반환 시 기존 성공 시 반환과 동일한 data 구조를 채우되, order_item_units·invoices 등은 이미 존재하므로 DB에서 최소한으로 조회해 넣거나, 이미 조회한 order·orderItems로 orderInfo만 구성해 반환.

### 6.5 복구 전략 (failed 상태·재시도)

**Gemini 질의**: “결제는 성공했으나 주문 처리가 실패한(failed) 건”에 대한 자동 복구(Retry) 전략이 보이는가? 수동 처리인가, 배치인가?

**우리 코드·스크립트 검증**  
- **paid-order-processor.js 802~804행**: processPaidOrder 실패 시 `updateProcessingStatus(paidEventId, 'failed', error.message)` 호출.  
- **payment_attempts**: payment-wrapper에서 TIMEOUT_WAITING·ABORTED_CHECK_REQUIRED 등 fallback 상태 전이 후, 리콘(On-demand Recon 등) 문서화는 GEMINI_FEEDBACK_ORDER_COMPLETE_BACK_NAVIGATION_REVIEW.md 등에 있음.  
- **paid_event_processing.status = 'failed'** 건에 대한 **전용 자동 배치**는 코드·스크립트에서 확인되지 않음.  
  - **recover_pipeline_batch.js**, **PIPELINE_RECOVERY_GUIDE.md**, **ORDER_RECOVERY_GUIDE.md** 등은 수동/반자동 복구 가이드·스크립트 수준.  
  - 즉, **failed로 남은 건은 현재 설계상 수동·스크립트 복구**에 가깝고, “confirm 재진입 시 failed면 processPaidOrder 재시도” 경로는 **구현되어 있지 않음**.

**Gemini 대안**: confirm 재진입 시 status = 'failed'이면 processPaidOrder를 다시 호출할 수 있는 안전한 재시도 경로를 열고, 재고 소진 시 환불 유도 로직을 둔다.

**권장**  
- **단기**: failed 건은 모니터링(paid_event_processing.status = 'failed') + 수동/스크립트 복구 유지.  
- **중기**: confirm 라우트에서 “이미 완료” 판단을 success 기준으로 바꾼 뒤, **paid_events는 있으나 status = 'failed'인 경우**만 별도 분기하여 “재시도 허용” 경로(동일 session/order로 processPaidOrder 재호출)를 열 수 있음. 이때 재고 부족 등으로 실패 시 Path C(환불)와 동일한 환불 유도·로깅이 필요함.

---

## 7. 시니어 수정 권고 리스트 (Gemini 2차 반영)

| 항목 | 문제 부분 | 개선 방향 (Best Practice) | 비고 |
|------|-----------|---------------------------|------|
| **중복 확인** | `SELECT event_id FROM paid_events WHERE order_id = ?` 만 사용 | `paid_events pe JOIN paid_event_processing pep ON pe.event_id = pep.event_id WHERE pe.order_id = ? AND pep.status = 'success'` 조회. 1건 이상일 때만 200 alreadyConfirmed | §4.1, §6.1 |
| **멱등성** | processPaidOrder 진입 직후 상태 미조회 | `SELECT status FROM paid_event_processing WHERE event_id = ?` (필요 시 FOR UPDATE). status = 'success'면 즉시 `{ success: true, alreadyProcessed: true, data: ... }` 반환 | §4.2, §6.2 |
| **응답 구조** | alreadyProcessed 시 data 생략 가능 | invoice_number·order_number·orderInfo 등 호출부가 쓰는 필수 데이터 포함 | §6.4 |
| **커넥션** | 이니시스/웹훅 createConnection | 장기: pool.getConnection() + try/finally release(및 필요 시 getSafeConnection)로 통일. 단기 유지 가능 | §6.3 |
| **복구** | failed 건 자동 재시도 없음 | failed 건 모니터링·수동/스크립트. 선택: confirm 재진입 시 failed만 processPaidOrder 재호출 경로 + 재고 부족 시 환불 유도 | §6.5 |

---

## 8. 참고 — 확인한 파일·라인

- **payments-routes.js**: 162(pool.getConnection), 193~279(세션·CONSUMED), 289~354(existingPaidEvents·alreadyConfirmed), 373~375(Conn 해제), 425~452(processOrderFn), 507~519(장바구니), 548(이메일 orderInfo), 700(이니시스 createConnection), 1778(웹훅 createConnection)
- **paid-order-processor.js**: 102~119(주문 FOR UPDATE), 144~147(paid_events currency), 172~174(updateProcessingStatus 'processing'), 702~738(반환값·updateProcessingStatus 'success'), 802~804(실패 시 'failed' 전이)
- **payment-wrapper.js**: Conn A/B, getSafeConnection, Phase 3 attempt CONFIRMED 체크
- **migrations**: 027(order_item_units uk_order_item_unit_seq), 033(paid_event_processing status ENUM), 024(paid_events uk_order_payment), 090/091
- **scripts**: recover_pipeline_batch.js, PIPELINE_RECOVERY_GUIDE.md, ORDER_RECOVERY_GUIDE.md (수동/반자동 복구)

---

## 9. Gemini 3차 피드백 — 시니어 관점 비판적 검증

Gemini가 “운영 안정성”을 위해 제시한 추가 관전 포인트를 **코드로 직접 확인한 뒤** 받아들일 것과, 우리 환경에서는 과장되었거나 거부할 것을 구분해 정리한다. **무조건 수용하지 않고, 좋은 것은 받아들이고 이상·과장된 부분은 사용자에게 명시한다.**

### 9.1 락(Lock) 계층과 데드락 방어 (§6.2 관련)

**Gemini 요지**: 관리자 페이지에서 주문 상태 수동 변경이나 recover_pipeline_batch.js 실행 시, **paid_event_processing을 먼저 잠그고 orders를 수정하면** 데드락이 발생할 수 있으므로, 모든 경로에서 **orders → paid_event_processing** 순서를 강제하는 가이드라인이 필요하다.

**코드 검증 결과**  
- **paid-order-processor.js**: 102~119행에서 **orders FOR UPDATE** 선행. 이후 `updateProcessingStatus(paidEventId, 'processing')`는 **UPDATE** 호출이지 **FOR UPDATE 조회가 아님**. 즉, 우리 코드는 **어디에서도 paid_event_processing을 orders보다 먼저 FOR UPDATE하지 않음**.  
- **recover_pipeline_batch.js**: 89행부터 `beginTransaction()` 후 `SELECT event_id FROM paid_events`(락 없음), 필요 시 createPaidEvent(별도 커넥션), 그 다음 **processPaidOrder(connection)** 호출. processPaidOrder 내부에서 **orders FOR UPDATE**가 먼저 수행되므로, 배치도 **pep 먼저 잠그는 경로가 아님**.  
- **관리자 API** (index.js shipped/delivered, shipment-routes, refund-routes): **orders FOR UPDATE** 선행 후 order_item_units·stock_units 등 접근. **paid_event_processing을 잠그는 로직 없음**.

**결론**  
- **받아들일 것**: “모든 경로에서 테이블 접근 순서를 **orders → paid_event_processing**으로 통일”하는 **원칙/가이드라인**은 유효하다. 향후 processPaidOrder에 Early Return용 **paid_event_processing FOR UPDATE**를 넣을 경우, **반드시 orders FOR UPDATE 이후**에 수행해야 데드락을 피할 수 있음.  
- **거부/보정할 것**: “recover_pipeline_batch가 순서를 뒤집으면 데드락”이라는 **구체적 시나리오는 현재 우리 코드에는 해당하지 않음**. 배치와 관리자 경로 모두 pep를 먼저 잠그지 않는다. 따라서 **가이드라인은 받아들이되, “이미 우리가 위반하고 있다”는 식의 해석은 받아들이지 말 것.**

### 9.2 '이미 처리됨' 응답의 UX — method, easyPay (§6.4 관련)

**Gemini 요지**: alreadyProcessed 반환 시 invoice_number뿐 아니라 **결제 수단 정보(method, easyPay)**를 함께 넘기면, 사용자가 뒤로 가기 후 다시 confirm 페이지에 들어왔을 때 주문 완료 페이지로 리다이렉트할 때 UX가 매끄러워진다.

**검증**  
- **paid-order-processor.js** 성공 반환 data(705~736행): orderInfo(order_id, order_number, items, guest_access_token 등)와 invoiceNumber 포함. **payment method / easyPay 필드는 없음**.  
- **order-complete 쪽**: order_number, orderInfo 기반 표시. 결제 수단 표시 여부는 클라이언트 구현에 따라 다름.

**결론**  
- **받아들일 것**: “이미 완료” 응답에 **order_number, invoiceNumber, orderInfo**를 포함하자는 기존 권장은 유지.  
- **선택 수용**: **method, easyPay** 등 결제 수단 정보를 추가하면, 결제 완료/주문 완료 화면에서 결제 수단을 보여줄 때 **추가 조회 없이** 채울 수 있어 UX 개선에 도움 됨. **다만 필수는 아님** — 클라이언트가 해당 필드를 쓰지 않으면 구현하지 않아도 됨.  
- **이상하다고 볼 부분 없음.** 원하면 권장 사항으로만 문서에 남기면 됨.

### 9.3 'Failed' 건 자동 재시도 시 재고 재검증 (§6.5 관련)

**Gemini 요지**: confirm 재진입 시 failed 상태를 processPaidOrder로 자동 재유도할 계획이라면, **재시도 전에 재고를 반드시 재검증**해야 한다. 재고가 없으면 무조건 재시도하면 마이너스 재고가 발생하므로, **재고 없음 → 즉시 환불(Path C)** 트리거하는 “자동 낙하산” 로직이 동반되어야 한다.

**검증**  
- **paid-order-processor.js**: 재고 조회·차감은 트랜잭션 내 **FOR UPDATE SKIP LOCKED** 등으로 수행. 재시도 시에도 동일 로직이 돌면 “재고 부족”이면 실패하고, 이미 §6.5에서 “재고 부족 시 Path C(환불) 유도”를 권장한 바 있음.

**결론**  
- **완전 수용.** failed 재시도 경로를 열 경우, **재고 재검증 선행 + 재고 없으면 환불 유도**는 반드시 필요하다. Gemini 제안과 §6.5 권장은 일치하므로 **받아들이고, 구현 시 “재시도 진입 시 재고 체크 → 없으면 processPaidOrder 호출하지 말고 환불(Path C) 유도”**로 명시할 것.

---

## 10. Gemini 3차 — 최종 수정 권고 요약 (Action Items) 및 비수용 사항

| 항목 | 핵심 액션 | 비고 |
|------|-----------|------|
| **성공 판정** | pep.status = 'success' 확인 필수 (JOIN 조회) | 유령 주문 0% 목표 — 기존 §4.1·§7과 동일 |
| **멱등성** | processPaidOrder 진입 시 status = 'success'면 Early Return | §4.2·§7과 동일 |
| **락 순서** | **모든 경로**에서 **orders → paid_event_processing** 순서 준수 (가이드라인) | 현재 코드는 이미 orders 먼저. pep FOR UPDATE 추가 시 orders 다음에만 사용할 것. **“배치/관리자가 이미 순서 뒤집고 있다”는 주장은 코드상 거짓 — 받아들이지 말 것.** |
| **응답 구조** | alreadyProcessed 시 order_number, invoiceNumber, orderInfo 필수; **선택** method/easyPay | §6.4·§9.2 |
| **복구 로직** | failed 재시도 시 **재고 체크 강제**, 재고 없으면 환불(Path C) 유도 | §6.5·§9.3 — 완전 수용 |

**사용자에게 전달 — 받아들이지 말 것**  
- “recover_pipeline_batch나 관리자가 paid_event_processing을 먼저 잠그고 있어서 데드락 위험이 있다”는 **구체적 주장**: 우리 코드에서는 **해당 없음**. 원칙(orders → pep)만 팀 가이드로 삼고, “이미 위반 중”이라는 해석은 **받아들이지 말 것.**

---

## 11. 참고 — 확인한 파일·라인 (3차 반영)

- **recover_pipeline_batch.js**: 89~174(트랜잭션, SELECT paid_events 무락, createPaidEvent 별도 커넥션, processPaidOrder 호출). **paid_event_processing FOR UPDATE 없음.**
- **paid-order-processor.js**: 102~119(orders FOR UPDATE), 172~174(updateProcessingStatus — UPDATE만), 705~736(성공 반환 data 구조).
- **index.js**: 2017(orders FOR UPDATE), 2318(orders FOR UPDATE) — 관리자 shipped/delivered.

---

## 12. Gemini 4차 — 구현 조언 요약 및 비판적 검증

Gemini가 “설계 확정 후 코드로 옮길 때 주의할 엣지 케이스”와 “복구 전략 순서”를 제시했다. **우리 스키마·기존 코드와 대조해** 받아들일 것과 **그대로 쓰면 오류 나는 부분**을 구분한다.

### 12.1 [수용] 3대 원칙 정리

| 원칙 | 메커니즘 | 비고 |
|------|----------|------|
| 성공 판정 SSOT | pep.status = 'success' JOIN 조회 | §4.1·§7과 동일 |
| 비즈니스 멱등성 | processPaidOrder 진입 시 Early Return | §4.2·§7과 동일 |
| 안전한 재시도 | failed 재시도 시 재고 재검증 필수, 없으면 환불 | §6.5·§9.3과 동일 |

→ **그대로 수용.** 문서와 일치.

### 12.2 [수용] Early Return 시 데이터 정합성 (Section 9.2 관련)

**Gemini 요지**: alreadyProcessed: true일 때도 **기존 성공 시와 동일한 Schema의 data**를 반환해야 한다. 부족하면 최소한 order_number, customer_name 정도는 SELECT로 채우라.

**검증**  
- processPaidOrder Early Return 시 호출부(confirm·이니시스·웹훅)는 **order_number, invoiceNumber, orderInfo**(items, guest_access_token 등)를 기대함(548행 등).  
- Early Return을 **진입 직후**(orders FOR UPDATE 전)에 넣으면, 그 시점에는 아직 order·order_items를 조회하지 않았을 수 있음. 따라서 **이미 처리됨일 때만** order + order_items(또는 최소 order_number, orderInfo용) **SELECT 한 번**으로 data를 채워 반환하는 것이 맞음.

**결론**  
- **수용.** alreadyProcessed 반환 시 **성공 시와 동일한 data 구조**(order_number, invoiceNumber, orderInfo 등)를 채워 반환. 필요 시 최소 SELECT 사용.

### 12.3 [수용 + 현황 반영] failed 시 재고 점유 해제 확인

**Gemini 요지**: processPaidOrder가 failed로 기록될 때, **트랜잭션 롤백과 함께 재고 점유가 풀렸는지** 확인하라. 그래야 confirm 재진입 시 재고 재검증이 정확히 동작한다.

**우리 코드 검증**  
- **paid-order-processor.js 763~800행**: catch 블록에서 **이미** “예약된 재고가 있으면 명시적으로 해제” 로직이 있음.  
  - `SELECT ... FROM stock_units WHERE reserved_by_order_id = ? AND status = 'reserved'`  
  - 있으면 `UPDATE stock_units SET status = 'in_stock', reserved_at = NULL, reserved_by_order_id = NULL WHERE ...`  
- 즉, **failed 시 재고 해제는 이미 구현되어 있음.** 롤백만 믿지 않고 명시적 해제를 하고 있음.

**결론**  
- **원칙은 수용**(failed 시 재고 해제 필수).  
- **현황**: **이미 구현됨.** 별도 “다시 한번 점검” 코드를 반드시 넣을 필요는 없고, 필요 시 **해제 후 reserved_by_order_id = orderId 건이 0건인지 검증 SELECT**를 로깅/모니터링용으로만 넣을 수 있음(선택).

### 12.4 [비수용 — 스키마 오류] 재검증 SQL 예시 (Gemini 제안)

**Gemini 제안**:  
재검증: `SELECT COUNT(*) FROM stock_units WHERE status = 'available' ...`

**문제점**  
- 우리 스키마에서는 **stock_units.status** 값이 **'in_stock'**, **'reserved'**, **'sold'**, **'returned'** 등이다. **'available'**이라는 값은 **없음**.  
- 또한 재고 가용성은 **전역 COUNT 한 번**이 아니라, **주문 라인별(product_id, size, color, quantity)**로 “해당 옵션의 in_stock 개수 ≥ 필요 수량”인지 확인해야 한다. paid-order-processor.js 224~265행이 이미 그 방식(상품·사이즈·컬러별 in_stock COUNT)으로 검증하고 있음.

**결론**  
- **Gemini의 재검증 SQL은 그대로 쓰면 안 됨.**  
  - **받아들이지 말 것**: `status = 'available'` 사용.  
  - **우리 환경**: **status = 'in_stock'** 기준이며, **주문의 order_items별로** 해당 product_id·size·color에 대한 in_stock 개수를 확인하는 기존 검증 로직을 재시도 진입 전에도 사용할 것(또는 processPaidOrder 내부 재고 검증에 맡김).

### 12.5 [수용] failed 재시도 분기 순서

**Gemini 요지**:  
1) 재검증(가용 재고 확인) → 2) 재고 있음: processPaidOrder 재호출 / 재고 없음: 즉시 환불(Path C) + 안내.

**결론**  
- **수용.** 순서는 그대로. 단, “가용 재고 확인”은 위 12.4대로 **우리 스키마·로직**(in_stock, 라인별 검증)으로 구현할 것.

---

## 13. 구현 시 주의사항 요약 (Gemini 4차 반영)

| 항목 | 수용 여부 | 구현 시 참고 |
|------|-----------|--------------|
| 3대 원칙(성공=JOIN, 멱등=Early Return, 재시도=재고 재검증) | ✅ 수용 | §4.1·§4.2·§6.5와 동일 |
| Early Return 시 동일 data 스키마 | ✅ 수용 | order_number, invoiceNumber, orderInfo 등 최소 SELECT로 채워 반환 |
| failed 시 재고 해제 확인 | ✅ 원칙 수용 / 이미 구현됨 | 763~800행에 이미 명시적 해제 있음. 선택: 해제 후 0건 검증 로깅 |
| 재검증 SQL | ❌ 비수용 | **status = 'available'** 사용 금지. 우리는 **status = 'in_stock'** + **라인별(product_id/size/color)** 검증 사용 |
| 재시도 분기 순서 | ✅ 수용 | 재고 재검증 → 있으면 processPaidOrder / 없으면 Path C(환불) |

**사용자에게 전달 — 받아들이지 말 것**  
- Gemini가 제시한 **“SELECT COUNT(*) FROM stock_units WHERE status = 'available'”** 같은 재검증 쿼리는 **우리 DB에 맞지 않음**. 값은 **'in_stock'**을 쓰고, 재고 확인은 **주문 라인별 필요 수량 vs in_stock 개수**로 해야 함.

---

## 14. 구현 순서 제안 (A → B → C)

설계가 확정되었으므로, **안전하게 배포**하려면 아래 순서를 권장한다.

| 순서 | 작업 | 목적 |
|------|------|------|
| **A** | **payments-routes.js confirm 라우트** — “이미 완료” 판단을 **paid_events + paid_event_processing JOIN, pep.status = 'success'** 기준으로 변경 | 유령 주문(False Success) 방지. 기존 existingPaidEvents만 보는 로직 제거·대체. |
| **B** | **paid-order-processor.js** — 진입 직후 **paid_event_processing.status = 'success'** 조회, success면 **동일 data 스키마**로 Early Return | 웹훅·재시도로 인한 중복 처리·UK 위반 방지. |
| **C** | **(선택) failed 복구** — confirm 재진입 시 status = 'failed'인 경우만 “재시도 허용” 분기 추가, **재고는 in_stock·라인별 검증** 후 있으면 processPaidOrder / 없으면 환불(Path C) | 복구 시 초과 판매 방지. |

**권장**: **A → B**까지 먼저 구현·배포하고, 동작 검증 후 **C**를 별도 단계로 진행. C는 “confirm 재진입 시 failed 재시도” 경로를 열 때만 필요하다.

---

*이 문서는 코드 검증 및 Gemini 피드백(1차·2차·3차·4차) 대조만 수행했으며, 실제 코드 수정은 포함하지 않습니다. 적용 시 규칙에 따라 계획서 승인 후 구현할 것.*
