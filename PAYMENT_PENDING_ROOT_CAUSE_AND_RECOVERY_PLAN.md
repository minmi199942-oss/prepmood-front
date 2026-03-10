## 개요

이 문서는 **"돈은 나갔는데 주문은 `결제 대기(pending)`에 갇히는 문제"**를 대상로,
기존 정리(`PAYMENT_CONFIRM_504_RESOLUTION_AND_ENGINE_STANDARD.md`)와 최근 Gemini 피드백을 모두 반영해:

- **수용할 것 / 보완할 것 / 버릴 것**을 명확히 구분하고,
- **근본 원인**을 코드·DB 기준으로 정리하며,
- 실제 구현에 사용할 **단계별 실행 계획(순서도)** 를 정의한다.

대상 코드·문서:

- `payments-routes.js` (`confirm`, `webhook`, `handlePaymentStatusChange`)
- `paid-event-creator.js` (`createPaidEvent`, `updateProcessingStatus`, `recordStockIssue`)
- `paid-order-processor.js`
- `order-status-aggregator.js`
- `PAYMENT_CONFIRM_504_RESOLUTION_AND_ENGINE_STANDARD.md`
- `CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK.md`

---

## 1. 현상 요약 (ORD-20260309-909047-KDWBNP 사례)

- **PG(토스)**: `status = DONE`, 웹훅까지 정상 발송.
- **서버 로그**:
  - `paid-event-creator.js` / `order-status-aggregator.js` 에서 반복되는  
    **`ER_LOCK_WAIT_TIMEOUT` (Lock wait timeout exceeded; try restarting transaction)`**.
  - `handlePaymentStatusChange` 내부에서  
    `ReferenceError: paidResultForEmail is not defined` 예외.
- **브라우저 confirm 응답**:
  - 최초 시도: 504 타임아웃.
  - 이후 재시도: `409 SESSION_ALREADY_IN_USE` (이미 진행 중인 결제가 있습니다).
- **주문 상태 (`orders.status`)**:
  - 여전히 `pending` (결제 대기) 상태에 머무름.

즉, **PG는 이미 돈을 받았는데**:

- 웹훅은 **락 대기 + 코드 버그**로 쓰러지고,
- confirm은 **세션 중복(409)** 으로 더 이상 처리에 참여하지 못해,
- 최종적으로 **`pending` 상태에서 탈출하지 못하는 주문**이 발생하고 있다.

---

## 2. Gemini 추가 피드백 요약

Gemini의 최신 피드백 핵심 포인트:

- **락 타임아웃 10초 → 5초로 더 줄여라.**
  - 목표가 5초 결제 완료라면, DB 락 대기 10초 자체가 이미 실패 상황이다.
- **웹훅을 1차 책임자(Primary), redirect(confirm)를 2차 검증자(Secondary)로 두라.**
  - 현대 결제 아키텍처에서 최종 정합성은 보통 웹훅이 담당한다.
  - redirect는 **409를 에러로 보지 말고, “다른 프로세스가 처리 중” 신호로 보고 1~2초 뒤 상태 재조회 후 성공 화면을 보여라.**
- **`payment_investigate` 같은 상태를 도입해 "낀 주문"을 분리하라.**
  - 단순히 `pending`/`paid` 이분법이 아니라, 문제 있는 주문을 따로 구분해 운영자가 즉시 리콘할 수 있게 하라.
- **사후 정합성 체크 스크립트(배치)** 로 누락 주문을 자동 구제하라.
  - `paid_events`·PG 응답은 있는데 `orders.status` 가 `pending` 인 주문을 찾아 자동 복구.

---

## 3. Gemini 피드백에 대한 판단 (수용 / 보완 / 기각)

### 3.1 락 타임아웃 10초 vs 5초

- **우리 코드 현황**
  - `payments-routes.js`:
    - confirm / webhook에서 `SET SESSION innodb_lock_wait_timeout = 10` 을 설정 (per-session).
  - `paid-event-creator.js`:
    - 커넥션 획득에만 3초 타임아웃 (`getEventCreatorConnection(3000)`),  
      DB 락 대기 시간은 아직 세션 기본값(보통 50초).
- **Gemini 주장**: 목표가 5초면 DB 락 대기 10초도 과하니, **5초로 줄여라.**

- **판단**
  - **취지 수용**: “락 대기로 10초 이상 끌고 가는 것은 결제 UX/가용성 측면에서 실패”라는 점은 동의.
  - **수치 보완**:
    - confirm / webhook 트랜잭션 내에서 **5~10초 타임아웃** 사이의 선택은,
      - 현재 DB 락 분포,
      - 재시도 정책,
      - 운영자가 감당 가능한 재시도율
      에 따라 조정하는 것이 합리적이다.
    - 초기값으로 **10초**를 사용하고,  
      실제 모니터링(락 대기 분포, 503 빈도)을 본 뒤 5초로 조정하는 방식을 채택한다.
  - **추가 보완점**:
    - `paid-event-creator.js` / `updateOrderStatus` 경로에도  
      `SET SESSION innodb_lock_wait_timeout = 10` (또는 5) 을 주입해,  
      **웹훅 경로의 50초 대기**를 제거해야 한다. (현재 이 부분이 실제 문제를 유발 중)

→ **결론**: **락 타임아웃 축소는 수용, “무조건 5초”는 운영 데이터 보고 조정**으로 보완 수용.

### 3.2 웹훅 Primary / Redirect Secondary + 409 Polling

- **우리 설계·코드 현황**
  - `CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK.md` 기준,
    - redirect(confirm)가 **주 흐름**으로 상당 부분 설계되어 있고,
    - 웹훅은 정합성 보조·추가 시그널 역할에 가까운 구조.
  - 현재 코드:
    - redirect(confirm): `withPaymentAttempt` + `processPaidOrder` 를 직접 호출해 주문을 처리.
    - 웹훅: `handlePaymentStatusChange` 에서 `createPaidEvent` + `processPaidOrder` 를 다시 수행.
- **Gemini 주장**
  - 현대 아키텍처에서는 **웹훅이 Primary, redirect는 Secondary** 가 되는 것이 자연스럽다.
  - redirect가 `409 SESSION_ALREADY_IN_USE` 를 받으면:
    - 에러로 처리하지 말고,
    - 1~2초 후 DB에서 상태를 재조회해,  
      웹훅이 이미 처리했다면 바로 성공 화면을 띄워야 한다.

- **판단**
  - **단기(현 구조 유지)**
    - 설계·코드가 이미 redirect 중심으로 얽혀 있어서,  
      웹훅을 Primary로 완전히 전환하는 것은 **작지 않은 리팩터링**이다.
    - 당장 해야 할 것은:
      - `409 SESSION_ALREADY_IN_USE` 를 **에러가 아니라 “다른 프로세스(웹훅)가 처리 중” 신호**로 인식하고,
      - 프론트엔드에서 1~2초 후 주문 상태를 재조회하는 **자가 치유 UX**를 도입하는 것.
    - 이 부분은 로직 변경 영향이 작고, Gemini 제안과도 일치하므로 **강하게 수용**.
  - **중장기(아키텍처 리팩터링)**
    - “모든 최종 상태는 웹훅에서만 확정, redirect는 상태 조회 + UX” 구조로 옮겨 가는 것은,  
      토스 외 다른 PG(이니시스 등)와의 정합성, 장애 상황 처리 등까지 고려해야 하는 범위다.
    - **중장기 개선 방향으로 문서에 남기되, 이번 스코프에서는 설계·플랜 수준에 머무른다.**

→ **결론**:  
  - **409를 신호로 보고, redirect에서 짧은 polling 후 상태 조회하는 부분은 수용.**  
  - 웹훅 완전 Primary 전환은 **중장기 리팩터링 주제**로 별도 관리.

### 3.3 `payment_investigate` 상태 및 에러 메타데이터

- **우리 설계·구현 현황**
  - `orders.status` 현재 상태 집계는 `order-status-aggregator.js` 에서  
    `order_item_units.unit_status`, `paid_events`, `paid_at` 등으로 계산.
  - “낀 주문” 상태를 위한 별도 값(`payment_error`/`payment_investigate`)은 아직 없음.
  - `orders` 테이블에 에러 코드/메시지를 저장하는 컬럼도 없음 (DDL 기준).
- **Gemini 주장**
  - `pending` 에서 탈출하지 못하는 주문을 **명시적으로 격리**할 상태가 필요하다.
  - 에러 코드 (`ER_LOCK_WAIT_TIMEOUT` 등)를 orders 메타필드에 남겨야,  
    배치 스크립트가 "무엇을 어떻게 복구해야 할지"를 알 수 있다.

- **판단**
  - **취지 100% 수용**:
    - “`pending`은 ‘아직 시도조차 안 한 상태’만 의미해야 한다”는 원칙은 맞고,
    - 시도했으나 실패한 주문은 별도 상태(예: `payment_error` / `payment_investigate`)로 분리하는 것이 명품 사이트 기준에서도 자연스럽다.
  - **구현 시 주의점(우리 규칙)**
    - 주문 상태 값 추가, 에러 메타 컬럼 추가는 **DB 스키마 변경**이 필요하며,  
      이는 `db_structure_actual.txt` 및 관련 SSOT 문서를 함께 업데이트해야 한다.
    - 이번 문서는 **계획·설계**까지만 담고, 실제 마이그레이션은 별도 태스크에서 진행하는 것으로 한다.

→ **결론**: 상태 추가 + 에러 메타 기록은 **근본 해결에 꼭 필요한 방향**으로 수용하되,  
   구체 컬럼 설계·마이그레이션은 후속 태스크로 분리.

---

## 4. 근본 원인 정리 (코드·DB 레벨)

- **원인 1: 웹훅 경로의 장시간 락 대기**
  - `paid-event-creator.js / createPaidEvent`:
    - 커넥션 획득에는 3초 타임아웃이 있지만,  
      **실제 INSERT 시 InnoDB 락 대기 시간은 기본(≈50초)**.
  - `order-status-aggregator.js / updateOrderStatus`:
    - 락이 걸린 `orders` 행에 대해 집계를 시도하다가  
      **`ER_LOCK_WAIT_TIMEOUT` 반복**.
  - 결과: 웹훅이 이 주문에 대해 수십 초씩 시도하다 실패하고,  
    상태를 `pending` 에서 바꾸지 못함.

- **원인 2: 웹훅 처리 중 JS 스코프 버그**
  - `handlePaymentStatusChange` 내부의 `paidResultForEmail` / `orderIdForPaidProcess` 스코프가 꼬여  
    `ReferenceError` 가 발생.
  - DB 작업이 어느 정도 성공했더라도,  
    마지막 부분에서 예외가 터지면서 전체 트랜잭션이 롤백될 수 있음.

- **원인 3: 상태 전이 실패 시 `pending` 그대로 방치**
  - confirm / 웹훅 모두 실패하면:
    - `orders.status` 를 `pending` → `failed`/`payment_error` 로 바꾸는 로직이 없음.
    - 결과적으로 **“시도하다 망한 주문”도 `pending`으로 보이는 상태**가 됨.

- **원인 4: redirect와 웹훅의 이중 처리 경합 + 409 UX 부족**
  - 같은 주문/세션에 대해:
    - 웹훅이 먼저/동시에 들어와 처리하다가 망가지고,
    - redirect(confirm)는 세션 중복으로 409를 받고 더 이상 진행하지 못함.
  - 프론트는 409 내용을 해석하지 못해 “결제 실패”만 보여주고,  
    실제 주문은 `pending` 에서 멈춤.

---

## 5. 최종 계획표 (단계별 실행 계획)

### 5.1 요약 테이블

| 단계 | 범위 | 목표 | 비고 |
|------|------|------|------|
| 1 | 웹훅 · paid_events · confirm | 당장 보이는 버그(ReferenceError, 락 50초)를 제거하고 fail-fast 확보 | 코드 수정 (Node) |
| 2 | 상태 전이 설계 | `pending` → `paid/failed` 단일 책임자 정의, 실패 시 `pending` 탈출 보장 | 설계 + 일부 코드 |
| 3 | 프론트 UX / 409 처리 | `SESSION_ALREADY_IN_USE` 를 자가 치유 시그널로 활용 | 프론트 JS |
| 4 | 사후 정합성 배치 | 이미 꼬인 주문 자동/반자동 정리 | 스크립트/배치 |
| 5 | 중장기 아키텍처 | 웹훅 Primary 전환, 상태 메타데이터/에러 코드 컬럼 도입 | 별도 태스크 |

아래는 각 단계별 **구체적인 순서**이다.

---

### 5.2 1단계 — 웹훅/confirm 즉시 버그 제거 (P0)

- **1-1. `handlePaymentStatusChange` 스코프 정리 (`payments-routes.js`)**
  - 함수 상단에:
    - `let orderIdForPaidProcess = null;`
    - `let paidResultForEmail = null;`
    를 선언.
  - try 블록 내에서 **재선언하지 않고**, 이 변수들에만 할당.
  - 마지막 반환부:

    ```js
    if (paymentStatus === 'captured' && orderIdForPaidProcess && paidResultForEmail?.data?.orderInfo) {
      return { shouldSendEmail: true, ... };
    }
    return { shouldSendEmail: false };
    ```

  - 이렇게 해서 `ReferenceError` 제거.

- **1-2. paid-event-creator 재시도 로직 보완 (Gemini 3차·4차)**
  - 현재: `ER_LOCK_WAIT_TIMEOUT` 시 1초·2초 후 최대 3회 재시도 → 전체 15~20초 워커 점유.
  - 변경: **Exponential Backoff** (예: 2초, 4초) 또는 재시도 횟수 축소(3→1) 검토.
  - **Total Request Budget 8초 (Gemini 4차)**: `createPaidEvent` 에 `requestStartedAt` 전달. `Date.now() - requestStartedAt > 8000` 이면 재시도 없이 즉시 throw → 클라이언트 503/409 → Polling 유도.

- **1-3. 웹훅/paid_events 경로에 `innodb_lock_wait_timeout` 주입 (Gemini 2차: 5초)**
  - `createPaidEvent` 에서 커넥션 획득 직후:

    ```js
    await connection.execute('SET SESSION innodb_lock_wait_timeout = 5').catch(() => {});
    ```

  - (선택) `updateProcessingStatus`, `recordStockIssue` 에도 동일한 패턴 적용.
  - `POST /payments/webhook` 라우트에서도:
    - `mysql.createConnection(dbConfig)` 후, `beginTransaction()` 전에 같은 구문 추가.
  - confirm 경로도 5초로 통일. (모니터링 후 503 과다 시 10초로 완화 검토)

- **1-4. confirm 경로의 `ER_LOCK_WAIT_TIMEOUT` → 503 변환 유지**
  - 이미 추가한 로직:
    - confirm에서 `wrapperError.code === 'ER_LOCK_WAIT_TIMEOUT'` 인 경우:
      - `503 SERVICE_UNAVAILABLE` + “결제 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.”
  - 이는 **락 경합 시 빠르게 재시도 유도**하는 설계로 유지.

---

### 5.3 2단계 — 상태 전이 책임 정리 + `pending` 탈출 보장

- **2-1. “상태를 바꾸는 머리”를 하나로 정하기 (단기: redirect 중심 유지)**
  - 단기 전략:
    - redirect(confirm) 경로에서:
      - `createPaidEvent` + `processPaidOrder` + `updateOrderStatus` 를 수행.
    - 웹훅:
      - 동일 작업을 반복하기보다는:
        - `payments` 테이블 상태 동기화,
        - `orders.status` 집계 업데이트,  
        - `createPaidEvent`·`processPaidOrder`는 **가능한 한 중복 호출을 피하는 방향**으로 조정.
  - 이를 위해:
    - `handlePaymentStatusChange` 내에서:
      - 이미 `paid_event_processing.status = 'success'` 인 event가 있는 주문은  
        **추가 처리 없이 상태 집계만 수행**하도록 Early Return 도입.

- **2-2. CAS 기반 Status Update (Gemini 3차·4차·5차)**
  - `order-status-aggregator.js` 의 `UPDATE orders SET status = ? WHERE order_id = ?` 에서:
    - `newStatus` 가 `paid` 이상일 때 `WHERE status IN ('pending', 'payment_error', 'payment_investigate')` 조건 추가.
    - `affectedRows = 0` 이면 이미 상위 상태로 전이됨 → **throw 없이 정상 return** (에러 아님).
    - **affectedRows = 0 시 (4차·5차)**: `Logger.info` (ERROR 아님) 로 `[CAS] State already transitioned, skipping update` 기록. 웹훅 경로에서 CAS 실패 시에도 이미 200 반환됨 → 토스 재전송 중단.
  - 이로써 웹훅·Redirect 동시 업데이트 시 레이스 컨디션·덮어쓰기 방지.

- **2-3. 실패 시 상태를 `pending` → `payment_error` 로 전환 (설계)**
  - `processPaidOrder` / `handlePaymentStatusChange` / confirm 진입부에서:
    - 더 이상 유의미한 재시도가 어려운 에러 (`ER_LOCK_WAIT_TIMEOUT` 3회 실패 등) 발생 시:
      - `orders.status` 를 `payment_error` (또는 `payment_investigate`) 로 업데이트.
      - 이때 에러 코드(`ER_LOCK_WAIT_TIMEOUT`)와 간단한 메시지를  
        **별도 메타 컬럼**(향후 도입) 또는 로깅으로 남긴다.
  - 이 단계에서 실제 컬럼 추가는 하지 않고,  
    **상태 이름 및 전이 규칙을 문서로 먼저 고정**한다.

---

### 5.4 3단계 — 프론트 UX: 409 / 503 자가 치유

- **3-1. `SESSION_ALREADY_IN_USE` 처리 개선 (`order-complete-script.js`)**
  - 현재:
    - 409 응답도 **전부 “결제 확인 실패”** 로 보여 줌.
  - 변경 계획 (Gemini 2차·3차 반영):
    - `response.status === 409 && errorData.code === 'SESSION_ALREADY_IN_USE'` 인 경우:
      - **최대 3회** 재조회 (2초 간격). 무한 Polling 방지.
      - `GET /api/orders/{orderNumber}` 또는 **경량 Status API**로 주문 상태 재조회.
      - **경량 Status API 사용 시 (Gemini 3차·4차)**: 반드시 `checkoutSessionKey` 를 함께 전달해 Enumeration Attack·토큰 탈취를 방지. `checkout_sessions.status = 'CONSUMED'` 이면 403 반환(토큰 재노출 차단). 비회원 주문이면 `guest_access_token` 을 응답에 포함해 성공 화면 리다이렉트를 안전하게 수행.
      - 상태가 `paid`/`processing` 이면 → **성공 화면**으로 안내.
      - 여전히 `pending` 이고, 백엔드에서 `payment_error` 로 바뀌었다면 →  
        “결제는 되었으나 주문 처리 중 오류가 발생했습니다. 고객센터로 문의해 주세요.”  
        같은 **정확한 안내 메시지** 표시.
      - **3회 초과 시**에도 `pending` 이면 →  
        "결제가 진행 중일 수 있습니다. 주문 내역에서 상태를 확인해 주세요."  
        + 주문 조회 링크/버튼 제공 (수동 확인 요청 UI).

- **3-2. 503 처리 UX 보완**
  - `SERVICE_UNAVAILABLE` (503) 응답 시:
    - “결제 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.”  
      + 주문 내역에서 상태를 확인하라는 안내를 함께 제공.

---

### 5.5 4단계 — 사후 정합성 배치/스크립트

- **4-1. 대상 정의**
  - 조건 예시:
    - `orders.created_at < NOW() - INTERVAL 10 MINUTE`
    - `orders.status IN ('pending', 'payment_error', 'payment_investigate')`
    - `paid_events` 혹은 PG(토스) 조회 결과 `status = DONE` 인 기록이 존재.

- **4-2. 처리 로직**
  - 해당 주문들에 대해:
    - `processPaidOrder` 를 다시 시도해 완전 처리 가능하면 그대로 성공 처리.
    - 여전히 실패하면:
      - `orders.status = 'payment_investigate'` 로 고정,
      - 운영 로그/알림(Webhook/Slack 등)으로 사람에게 전달.

- **4-3. 실행 방식**
  - 초기에는 **수동 스크립트**로 운영자가 필요할 때 실행.
  - 충분히 안정적이면 cron/PM2 등으로 주기 실행 고려.

---

### 5.6 5단계 — 중장기 아키텍처 (웹훅 Primary, 상태 메타데이터)

- **5-1. 웹훅 Primary 전환 설계**
  - 장기 목표:
    - 모든 주문에 대해:
      - **웹훅이 유일한 “성공/실패 확정자”** 가 되고,
      - redirect(confirm)는 단순 조회 + UX 레이어로만 동작.
  - 요구 작업:
    - `CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK.md` 와 실제 코드  
      (`payments-routes.js`, `paid-order-processor.js`) 를 재정렬.
    - 이니시스 등 다른 PG까지 포함한 통합 상태 전이 표 작성.

- **5-2. 상태/에러 메타데이터 컬럼 도입**
  - `orders` 테이블에:
    - `payment_status_detail` (예: `LOCK_TIMEOUT`, `PG_TIMEOUT`, `INTERNAL_ERROR` 등),
    - `payment_error_message` (짧은 메시지),
    - 또는 별도 `order_payment_errors` 테이블 도입을 검토.
  - `db_structure_actual.txt` 및 SSOT 문서 업데이트가 필수이므로,  
    별도 마이그레이션 태스크로 관리.

---

## 6. 요약 (우리 환경 기준 채택 결론)

- **즉시 반영 (코드 수준 P0)**
  - `handlePaymentStatusChange` 스코프 버그 정리 (`paidResultForEmail` 함수 상단 선언).
  - 웹훅/paid_events/confirm 경로에 `innodb_lock_wait_timeout = 5` per-session 주입. (모니터링 후 503 과다 시 10초로 완화 검토)
  - confirm 경로의 `ER_LOCK_WAIT_TIMEOUT` → 503 변환 유지.
- **단기 구조 개선**
  - redirect를 현재대로 Primary로 유지하되,
  - 409 `SESSION_ALREADY_IN_USE` 를 “처리 중 신호”로 보고 프론트에서 **최대 3회** 상태 재조회 UX 도입. (무한 Polling 방지)
  - 실패 시 `pending` 에 남지 않고, `payment_error`/`payment_investigate` 로 전이. (웹훅 재시도 시 복구 핸들러 경유)
- **중장기**
  - 웹훅 Primary 전환, 상태·에러 메타데이터 컬럼 도입,  
    사후 정합성 배치 도입을 통해 “돈이 나갔는데 설명할 수 없는 상태”를 없애는 방향으로 단계적 리팩터링.

이 문서는 위 단계들을 구현할 때의 **참고 SSOT(근본 원인 및 복구 계획서)** 로 사용한다.

---

## 7. Gemini 시니어 아키텍트 2차 피드백 (수용 / 보완 / 기각)

Gemini 2차 피드백 핵심:
- 409 Polling의 **무한 루프·상태 교착** 위험 → 최대 횟수 제한 필수
- `payment_error` 는 **최종 상태가 아닌 조사 필요 상태** → 웹훅 재시도 시 복구 핸들러 경유
- 락 타임아웃 **10초 → 5초**로 단축
- `stock_units` 복합 인덱스 점검
- Lightweight Status API, `last_error_code` 컬럼 등 체크리스트

### 7.1 수용할 것

**1) 409 Polling 최대 횟수 제한**

- **Gemini 주장**: 웹훅이 ReferenceError 등으로 checkout_sessions를 IN_PROGRESS로 둔 채 죽으면, 프론트가 평생 재조회만 하다 타임아웃에 빠진다. Polling은 **유효 기간(TTL)** 이 있어야 한다.
- **판단**: **수용**. 무한 polling은 클라이언트·서버 모두 리스크.
- **대안 채택**: Polling **최대 3회**(예: 2초 간격). 3회 초과 시에도 `pending` 이면 **"수동 확인 요청"** UI 노출.

**2) 락 타임아웃 5초**

- **Gemini 주장**: 10초 대기는 504의 1/6을 점유하는 긴 시간. 락 경합은 대기로 해결할 문제가 아니다.
- **판단**: **수용**. 목표가 5초 결제 완료라면, 락 대기 5초로 단축하고 초과 시 즉시 503으로 회수하는 것이 합리적.
- **계획 반영**: 1단계에서 `innodb_lock_wait_timeout = 5` 로 적용. 모니터링 후 503 과다 시 10초로 완화 검토.

**3) `payment_error` / `payment_investigate` 는 최종 상태 아님**

- **Gemini 주장**: `payment_error` 로 닫아버리면 토스 웹훅 재전송(Retry)과 충돌한다. 웹훅이 200 받을 때까지 계속 들어오는데, 우리가 닫으면 재시도가 차단된다.
- **판단**: **수용**. `payment_error` / `payment_investigate` 는 **"조사 필요"** 상태로 두고, 웹훅이 다시 들어왔을 때 **기존 실패 원인을 로그로 남기고 재처리 시도**하는 복구 핸들러를 경유하게 설계.

**4) Lightweight Status API**

- **Gemini 주장**: 재조회 시 전체 주문 조회 API를 쓰면 부하가 가중된다.
- **판단**: **수용**. 409 Polling 시 **주문 상태만 조회하는 경량 API** 사용. 기존 `GET /api/orders/:orderNumber` 가 무거우면, `GET /api/orders/:orderNumber/status` 같은 경량 엔드포인트 추가 검토.

**5) `last_error_code` 컬럼**

- **판단**: **수용**. 4단계 배치가 "무엇을 복구해야 할지" 알 수 있도록 `orders.last_error_code` (또는 유사 메타 컬럼) 도입. 마이그레이션 별도 태스크.

**6) 락 실패 시 로그에 SQL_STATE·THREAD_ID**

- **판단**: **수용**. `ER_LOCK_WAIT_TIMEOUT` 발생 시 `err.sqlState`, `err.sqlMessage` 외에 가능하면 **락을 잡고 있는 THREAD_ID**를 로그에 남기면, 운영·리콘 시 원인 추적에 유리. MySQL `SHOW ENGINE INNODB STATUS` 등 활용 검토.

### 7.2 보완·부분 수용할 것

**1) 세션 가드(30초 경과 시 강제 해제)**

- **Gemini 주장**: 3회 Polling 초과 시에도 `pending` 이면, `checkout_sessions.updated_at` 이 30초 이상 경과했을 때 **서버에서 세션을 강제 해제**하거나 `payment_error` 로 밀어내는 '세션 가드' 로직이 필요하다.
- **판단**: **보완 수용**. 설계상 타당하나, 구현 시 다음을 확인해야 함:
  - `checkout_sessions` 에 `updated_at` (또는 유사) 컬럼 존재 여부
  - "강제 해제" 시 `status` 를 어떤 값으로 바꿀지 (예: `EXPIRED` vs `CONSUMED` vs 별도 값)
  - confirm 진입 시 이 세션을 어떻게 처리할지 (재진입 허용 vs 409 유지)
- **계획**: 2~3단계 설계 시 **세션 가드 규칙**을 문서로 먼저 정의하고, 이후 코드 반영.

**2) handlePaymentStatusChange 내 비동기 호출 개별 try-catch**

- **Gemini 체크리스트**: "운명 공동체" 로직 제거 — 모든 비동기 호출을 개별 try-catch로 감싸라.
- **판단**: **부분 수용**. 전부 개별 try-catch로 바꾸면 코드 복잡도가 크게 증가하고, 일부는 롤백 정책과 맞지 않을 수 있다. **핵심 실패 지점**(createPaidEvent, processPaidOrder, updateOrderStatus)만 명시적으로 catch하고, 실패 시 `payment_error` 전이·로그를 남기는 방향으로 제한 적용.

### 7.3 기각할 것 (코드·DDL 근거)

**1) `stock_units` 복합 인덱스 (product_id, status, size, color) 누락**

- **Gemini 주장**: 인덱스가 없으면 락 범위가 넓어져 경합이 필연적이다. 즉시 DB 실행 계획을 점검하라.
- **코드·DDL 근거**:
  - `backend/migrations/048_add_stock_units_size_color.sql` 173행:
    ```sql
    ALTER TABLE stock_units ADD INDEX idx_stock_units_product_status_size_color_stockid (product_id, status, size, color, stock_unit_id)
    ```
  - `verify_migration_048_049.sql` 에서 해당 인덱스 존재 여부 검증.
- **판단**: **기각**. 이미 `(product_id, status, size, color, stock_unit_id)` 복합 인덱스가 마이그레이션으로 추가되어 있다. "누락" 주장은 우리 환경과 맞지 않음. 다만 **실제 DB에 적용되었는지** `SHOW INDEX FROM stock_units` 로 점검하는 것은 권장.

---

## 8. 수정된 단계별 실행 가이드 (2차 반영)

| 단계 | 핵심 조치 | 기술적 목적 | 복구 전략 |
|------|-----------|-------------|-----------|
| Step 1 | Scope 버그 & **5초** 락 타임아웃 | JS 엔진 크래시 방지, 리소스 회수 | 에러 시 해당 세션 즉시 cleanup |
| Step 2 | 409 Polling (**최대 3회**, 2초 간격) | 웹훅-Redirect 레이스 컨디션 해결 | Polling 실패 시 "수동 확인 요청" UI 노출 |
| Step 3 | `payment_investigate` 도입 | "낀 주문" 명시적 격리 | 운영자 대시보드 알림 연동 |
| Step 4 | Reconciliation 배치 | 시스템 오류로 누락된 주문 구제 | PG 상태와 DB 상태 교차 검증 |

### 8.1 3단계(409 Polling) 구체 명세 (2차 반영)

- **최대 3회** 재조회 (2초 간격).
- 3회 모두 `pending` 이면:
  - "결제가 진행 중일 수 있습니다. 주문 내역에서 상태를 확인해 주세요."  
    + 주문 조회 링크/버튼 제공.
- 재조회 API:
  - 기존 `GET /api/orders/:orderNumber` 가 무거우면 **경량 Status API** (`GET /api/orders/:orderNumber/status`) 추가 검토.
- (선택) 세션 가드:
  - `checkout_sessions.updated_at` 30초 초과 시 서버에서 세션 강제 해제/만료 처리. 별도 설계 후 구현.

### 8.2 `payment_error` / `payment_investigate` 처리 원칙 (2차 반영)

- **최종 상태 아님**: 웹훅 재시도 시 `payment_error` / `payment_investigate` 인 주문도 **재처리 시도** 가능하게 설계.
- **복구 핸들러**: 웹훅이 해당 주문을 다시 처리할 때:
  - 기존 실패 원인(`last_error_code` 등)을 로그에 남기고,
  - `createPaidEvent` + `processPaidOrder` 를 **처음부터 다시** 시도.
- 토스 웹훅 재전송 정책과 충돌하지 않도록, **200 응답**을 주는 조건을 명확히 정의.

### 8.3 결제 엔진 보완 체크리스트 (2차 반영)

- [ ] `handlePaymentStatusChange` 내 `paidResultForEmail` 스코프: try 밖에서 선언해 ReferenceError 제거
- [ ] `SET SESSION innodb_lock_wait_timeout = 5` 적용 후, 실패 시 로그에 `SQL_STATE`·가능하면 `THREAD_ID` 기록
- [ ] 409 Polling 시 **경량 Status API** 사용 (전체 주문 조회 API 부하 회피)
- [ ] `orders.last_error_code` 컬럼 추가 준비 (4단계 배치용)
- [ ] `stock_units` 인덱스: `idx_stock_units_product_status_size_color_stockid` 실제 DB 적용 여부 `SHOW INDEX` 로 점검

---

## 9. Gemini 시니어 아키텍트 3차 피드백 (수용 / 보완 / 기각)

Gemini 3차 피드백 핵심:
- **Polling API 보안**: orderNumber만으로 조회 시 Enumeration Attack·토큰 탈취 위험 → checkoutSessionKey 검증 필수
- **CAS 기반 Status Update**: `WHERE status = 'pending'` 조건으로 중복·레이스 방지
- **락 타임아웃과 재시도 충돌**: 5초 타임아웃 + 3회 재시도 시 15~20초 워커 점유 → Exponential Backoff 또는 락 시 즉시 Polling 유도

### 9.1 수용할 것

**1) Polling API 세션 검증 (P0)**

- **Gemini 주장**: orderNumber만으로 주문 상태 조회 시, 악의적 사용자가 주문번호를 무작위 대입(Enumeration Attack)해 타인의 결제 성공 여부·비회원 접근 권한(guest_access_token)을 탈취할 위험이 있다.
- **코드 근거**:
  - `order-routes.js` 1008행: `GET /api/orders/:orderId` 는 `authenticateToken` + `user_id` 검증으로 **회원만** 본인 주문 조회 가능.
  - `order-routes.js` 1817행: `GET /api/guest/orders/:orderNumber` 는 `guest_session_token` 쿠키 + `session.order_number === orderNumber` 검증. **비회원은 세션 없이 orderNumber만으로 조회 불가.**
  - 409 Polling 시 사용할 **경량 Status API**는 아직 없음. 신규 추가 시 **orderNumber 단독 조회**로 설계하면 위 취약점 발생.
- **판단**: **수용**. 경량 Status API 설계 시:
  - **checkoutSessionKey** 를 헤더 또는 파라미터로 필수 전달받고,
  - `checkout_sessions` 에서 `session_key = ? AND order_id = (SELECT order_id FROM orders WHERE order_number = ?)` 검증 후,
  - 비회원 주문이면 `guest_access_token` 을 함께 반환해 프론트가 성공 화면으로 안전하게 리다이렉트할 수 있게 한다.

**2) CAS 기반 Status Update (P0)**

- **Gemini 주장**: 웹훅과 Redirect가 동시에 success로 업데이트하려 할 때 충돌. `WHERE status = 'pending'` 조건을 명시해 CAS(Compare-And-Swap) 방식으로 수행해야 한다.
- **코드 근거**:
  - `order-status-aggregator.js` 110행: `UPDATE orders SET status = ? WHERE order_id = ?` — **조건 없이 무조건 덮어쓰기**.
  - 이미 `paid`/`shipped` 등으로 변경된 행을 다른 프로세스가 `pending` 등으로 덮어쓸 수 있는 이론적 레이스 존재.
- **판단**: **수용**. `pending` → `paid` (또는 상위 상태) 전이 시:
  - `UPDATE orders SET status = ? WHERE order_id = ? AND status IN ('pending', 'payment_error', 'payment_investigate')` 형태로 **하위 상태에서만 업데이트** 허용.
  - `affectedRows = 0` 이면 이미 상위 상태로 전이됨 → 중복 처리로 간주하고 정상 종료.

**3) last_error_code 상세화 (P1)**

- **Gemini 주장**: `LOCK_TIMEOUT` vs `REF_ERROR` 구분하여 기록하면 복구 시 원인 파악에 유리.
- **판단**: **수용**. `last_error_code` (또는 유사 컬럼)에 `ER_LOCK_WAIT_TIMEOUT`, `ReferenceError` 등 구체 코드 저장.

### 9.2 보완·부분 수용할 것

**1) 락 타임아웃과 재시도 충돌**

- **Gemini 주장**: DB 락 타임아웃 5초인데, 앱에서 3회 연속 재시도하면 전체 15~20초. Nginx 워커를 계속 점유한다.
- **코드 근거**:
  - `paid-event-creator.js` 69행: `retryDelay = 1000`, 155행: `delay = retryDelay * attempt` (1초, 2초).
  - 3회 시도 시: 5초(1차) + 1초 대기 + 5초(2차) + 2초 대기 + 5초(3차) ≈ 18초.
- **판단**: **보완 수용**.
  - **Exponential Backoff**: 재시도 간격을 1s, 2s → 2s, 4s 등으로 늘려 DB 부하 분산. (권장 P1)
  - **락 타임아웃 시 즉시 Polling 유도**: 1회 실패 후 무조건 재시도하지 않고, `CONN_TIMEOUT`/`ER_LOCK_WAIT_TIMEOUT` 이면 **즉시 상위로 전파**해 클라이언트가 503/409를 받고 Polling으로 전환하도록 하는 옵션 검토.
  - "다른 프로세스가 락 점유 중인지 세션 유효성(updated_at) 체크"는 구현 복잡도가 있어, 1차적으로 **재시도 횟수 축소(3→1)** 또는 **Exponential Backoff** 적용을 우선한다.

### 9.3 기각할 것

- 이번 3차 피드백에서 **코드·환경과 명확히 맞지 않는 주장**은 없음.  
  (2차에서 `stock_units` 인덱스 누락은 이미 기각됨.)

---

## 10. 수정된 최종 아키텍처 체크리스트 (3차 반영)

| 구분 | 체크 항목 | 기술적 목적 | 비고 |
|------|-----------|-------------|------|
| **보안** | Polling API 세션 검증 (checkoutSessionKey) | 주문번호 무작위 대입 방지, guest_access_token 탈취 차단 | **필수 (P0)** |
| **정합성** | CAS 기반 Status Update (`WHERE status IN ('pending', ...)`) | pending→paid 전이 시 중복·덮어쓰기 방지 | **필수 (P0)** |
| **가용성** | 재시도 간격 Exponential Backoff | DB 부하 분산, 락 경합 해소 | **권장 (P1)** |
| **운영** | last_error_code 상세화 (LOCK_TIMEOUT vs REF_ERROR) | 복구 시 원인 구분 | **복구용 (P1)** |

### 10.1 경량 Status API 설계 원칙 (3차 반영)

- **엔드포인트**: `GET /api/payments/orders/:orderNumber/status` (또는 유사)
- **필수 파라미터**:
  - `orderNumber` (path)
  - `checkoutSessionKey` (query 또는 header `X-Checkout-Session-Key`)
- **검증**:
  - `checkout_sessions` 에서 `session_key = checkoutSessionKey AND order_id = (SELECT order_id FROM orders WHERE order_number = orderNumber)` 확인.
  - 불일치 시 403.
- **응답** (성공 시):
  - `status`, `order_id`, `user_id`
  - 비회원 주문이면 `guest_access_token` 포함 (성공 화면 리다이렉트용).

---

## 11. Gemini 시니어 아키텍트 4차 피드백 (수용 / 보완 / 기각)

Gemini 4차 피드백 핵심:
- **토큰 탈취 방어**: guest_access_token 응답 바디 노출 → checkoutSessionKey 탈취 시 권한 상승 통로
- **CAS 침묵하는 실패**: affectedRows = 0 시 로그 없음 → Race Density 측정 불가
- **워커 점유 Hard Deadline**: Exponential Backoff 적용해도 총 대기 10초 초과 가능 → 8초 Budget 제한

### 11.1 수용할 것

**1) CAS affectedRows = 0 로깅 (P0)**

- **Gemini 주장**: affectedRows = 0을 정상 종료로 간주하는 것은 타당하나, 로그를 남기지 않으면 웹훅·Redirect 충돌 빈도(Race Density)를 측정할 수 없다.
- **코드 근거**: `order-status-aggregator.js` 에서 CAS 적용 시 `affectedRows = 0` 이면 에러 없이 return. 모니터링 불가.
- **판단**: **수용**. `affectedRows === 0` 일 때 `Logger.info('[CAS] State already transitioned, skipping update', { orderId, newStatus })` 를 남겨 경합 빈도를 기록. 과다 발생 시 아키텍처 튜닝 근거로 활용.

**2) checkout_sessions CONSUMED 이후 Status API 차단 (P0)**

- **Gemini 주장**: checkoutSessionKey가 탈취되면 비회원 주문 전체 접근 권한이 넘어가는 권한 상승 통로. CONSUMED 이후에는 접근을 즉시 차단해야 한다.
- **코드 근거**:
  - `payments-routes.js` 255행: `sessionRow.status === 'CONSUMED'` 이면 confirm이 이미 완료된 세션으로 200 + alreadyConfirmed 반환.
  - Status API는 409 Polling용. confirm이 완료되면(CONSUMED) 사용자는 이미 성공 응답을 받았으므로 Status API 호출이 불필요.
- **판단**: **수용**. 경량 Status API에서 `checkout_sessions.status = 'CONSUMED'` 이면 **403 "이미 완료된 세션입니다"** 반환. 토큰 재노출·반복 조회 차단.

**3) Total Request Budget 8초 (P1)**

- **Gemini 주장**: 5초 DB 타임아웃 + 재시도 대기가 Nginx 워커를 위험하게 만든다. 첫 진입 시점부터 8초 초과 시 즉시 중단하고 클라이언트에 제어권(Polling 유도)을 넘겨야 한다.
- **코드 근거**:
  - `paid-event-creator.js` 77~206행: 3회 시도, 5초 락 + 1초·2초 대기 → 최악 18초.
  - `createPaidEvent` 는 `handlePaymentStatusChange`(웹훅) 또는 confirm 경로에서 호출.
- **판단**: **수용**. `createPaidEvent` 에 `requestStartedAt` (또는 호출 시점 `Date.now()`) 전달. `Date.now() - requestStartedAt > 8000` 이면 재시도 없이 즉시 throw. 클라이언트가 503/409를 받고 Polling으로 전환.

### 11.2 보완·부분 수용할 것

**1) guest_access_token 응답 방식 (10.1 보완)**

- **Gemini 주장**: guest_access_token을 응답 바디에 넣지 말고, HTTP Only 쿠키로 설정하거나 일회용 티켓(One-time Ticket) 구조로 반환해야 한다.
- **코드 근거**:
  - `payments-routes.js` 300행, 396행: confirm 응답에 `guest_access_token` 바디 포함.
  - `order-complete-script.js` 589행: `result.data?.guest_access_token` 으로 수신 후 `loadGuestOrderDetails` 호출.
  - `loadGuestOrderDetails` 는 `POST /api/guest/orders/session` 에 token을 body로 전송 → 세션 쿠키 발급.
  - 이메일 링크: `guest-order-access.html?token=xxx` — 이미 URL에 토큰 노출 (ORDER_AND_SYSTEM_FLOW.md 9.2절 "보안 개선 백로그").
- **판단**: **보완 수용**.
  - **현재**: confirm·Status API 모두 응답 바디에 `guest_access_token` 반환. 이메일은 URL 쿼리.
  - **권장 방향**: Status API에서 비회원 paid 반환 시, 토큰을 바디 대신 **Set-Cookie** 로 `guest_session_token` (또는 일회용 교환용 쿠키) 설정. 프론트는 쿠키를 받아 리다이렉트만 수행.
  - **일회용 티켓**: 60초 TTL·1회 교환만 허용하는 토큰 발급 — 신규 플로우 설계 필요. 중장기 개선으로 별도 태스크.
  - **단기**: checkoutSessionKey 검증 + CONSUMED 차단으로 권한 상승 창을 최소화. 토큰 전달 방식(쿠키/일회용)은 **설계 방향**으로 문서에 남기고, 구현은 후속 태스크.

### 11.3 기각할 것

- 이번 4차 피드백에서 **코드·환경과 명확히 맞지 않는 주장**은 없음.

---

## 12. 수정된 최종 아키텍처 체크리스트 (4차 반영)

| 구분 | 체크 항목 | 기술적 목적 | 비고 |
|------|-----------|-------------|------|
| **보안** | Polling API 세션 검증 (checkoutSessionKey) | 주문번호 무작위 대입 방지 | **필수 (P0)** |
| **보안** | CONSUMED 이후 Status API 403 | 토큰 재노출·반복 조회 차단 | **필수 (P0)** |
| **보안** | guest_access_token → 쿠키/일회용 (설계) | 권한 상승 통로 축소 | **중장기 (P2)** |
| **정합성** | CAS 기반 Status Update | pending→paid 전이 시 중복 방지 | **필수 (P0)** |
| **정합성** | CAS affectedRows=0 로깅 | Race Density 모니터링 | **필수 (P0)** |
| **가용성** | Total Request Budget 8초 | 워커 점유 시간 상한 | **권장 (P1)** |
| **가용성** | Exponential Backoff | DB 부하 분산 | **권장 (P1)** |
| **운영** | last_error_code 상세화 | 복구 시 원인 구분 | **복구용 (P1)** |
| **운영** | payment_investigate 전이 시 알림 | 관리자 즉시 리콘 | **복구용 (P1)** |

### 12.1 경량 Status API 설계 원칙 (4차·5차 반영)

- **엔드포인트**: `GET /api/payments/orders/:orderNumber/status` (또는 유사)
- **필수 파라미터**: `orderNumber`, `checkoutSessionKey`
- **검증**:
  - `checkout_sessions` 에서 `session_key = ? AND order_id = (SELECT ...)` 확인.
  - **`status = 'CONSUMED'` 이면 403 "이미 완료된 세션입니다"** 반환.
  - 불일치 시 403.
- **응답** (성공 시):
  - `status`, `order_id`, `user_id`
  - 비회원 주문이면 `guest_access_token` 포함. **(5차) paid 전환 최초 1회만 포함**: 토큰 반환 직후 `UPDATE checkout_sessions SET status='CONSUMED'` 수행 → 이후 호출 403. (향후: Set-Cookie로 전달 검토)

### 12.2 paid-event-creator Total Budget (4차·5차 반영)

- **파라미터**: `createPaidEvent({ ..., requestStartedAt })` — 호출부(웹훅/confirm)에서 `Date.now()` 전달.
- **로직 (Gemini 5차 정밀화)**:
  - 루프 끝에서만 체크하면 5초×2 = 10초 경과 후에야 중단. **getConnection() 직전**과 **execute() 직전**에도 체크해야 워커를 보호할 수 있다.
  - 체크 지점: (1) for 루프 **시작 시**, (2) **getEventCreatorConnection() 호출 직전**, (3) **connection.execute() 호출 직전**.
  - `if (requestStartedAt && (Date.now() - requestStartedAt > 8000)) throw new Error('REQUEST_BUDGET_EXCEEDED')`.
  - 예산 초과 시 DB 쿼리 없이 즉시 throw.
- **효과**: 8초 초과 시 즉시 실패 → 클라이언트 503/409 → Polling 유도.

---

## 13. Gemini 시니어 아키텍트 5차 피드백 (수용 / 보완 / 기각)

Gemini 5차 피드백 핵심:
- **8초 Budget 체크 배치**: 루프 끝에서만 체크하면 10초 경과 후 중단 → getConnection/execute 직전에도 체크
- **guest_access_token 1회만 반환**: Polling 응답마다 토큰 노출 시 공격자 골든 타임 증가 → paid 전환 최초 1회만 포함
- **CAS 로그 레벨·웹훅 200**: affectedRows=0은 정상 경합 → INFO 레벨, 웹훅 경로에서는 200 반환해 재전송 중단

### 13.1 수용할 것

**1) 8초 Budget 체크 정밀 배치 (P1 → P0 격상)**

- **Gemini 주장**: 루프 직후에만 체크하면 5초 락×2 = 10초 경과 후에야 중단. getConnection/execute 직전에 체크해야 DB 추가 쿼리 없이 즉시 BUDGET_EXCEEDED를 던져 서버 자원을 보호할 수 있다.
- **코드 근거**: `paid-event-creator.js` 80행 `getEventCreatorConnection(3000)`, 104행 `connection.execute(...)` — 이 호출들이 5초 락 대기를 유발.
- **판단**: **수용**. 체크 지점 3곳: (1) for 루프 시작, (2) getEventCreatorConnection 직전, (3) connection.execute 직전.

**2) guest_access_token 최초 1회만 반환 (P0)**

- **Gemini 주장**: checkoutSessionKey 탈취 시 Polling API가 토큰을 계속 반환하면 공격자 골든 타임이 늘어난다. status='paid'로 전환되는 **최초 1회**에만 응답에 포함.
- **코드 근거**: 4차에서 "CONSUMED 이후 403" 설계. 토큰 반환 직후 `checkout_sessions.status = 'CONSUMED'` 로 설정하면, 다음 Status API 호출 시 403 → 토큰 재노출 차단.
- **판단**: **수용**. Status API에서 status=paid + guest_access_token 반환 시, **동일 트랜잭션/직후에** `UPDATE checkout_sessions SET status='CONSUMED' WHERE session_key=?` 수행. 이후 호출 = 403. 별도 컬럼 없이 기존 CONSUMED로 "1회만" 달성.

**3) CAS 로그 레벨 INFO + 웹훅 200 (P0)**

- **Gemini 주장**: affectedRows=0은 장애가 아닌 '정상적인 경합'. 로그는 반드시 INFO로. 웹훅 경로에서 CAS 실패 시 토스에 200 OK를 반환해 불필요한 재전송을 중단해야 한다.
- **코드 근거**:
  - `payments-routes.js` 2108행: `res.status(200).json({ received: true })` — 웹훅은 **항상 200 반환** (2095 catch 블록에서도 200). 토스 재전송 방지가 이미 설계에 반영됨.
  - CAS 적용 시 affectedRows=0이면 throw 없이 정상 return → handlePaymentStatusChange 성공 → commit → 200.
- **판단**: **수용**. (1) CAS skip 로그는 `Logger.info` 사용 (ERROR 아님). (2) 웹훅은 이미 항상 200 반환하므로 추가 조치 불필요. 다만 **updateOrderStatus가 throw하지 않음**을 명시적으로 보장.

### 13.2 기각할 것

- 이번 5차 피드백에서 **코드·환경과 맞지 않는 주장**은 없음.

---

## 14. 최종 확정 아키텍처 체크리스트 (5차 반영)

| 구분 | 체크 항목 | 기술적 목적 | 비고 |
|------|-----------|-------------|------|
| **보안** | Status API CONSUMED 체크 | 이미 완료된 결제 정보 무작위 접근 차단 | **필수 (P0)** |
| **보안** | guest_access_token 최초 1회만 반환 | 토큰 노출 골든 타임 최소화 | **필수 (P0)** |
| **정합성** | CAS 기반 WHERE status 조건 | 웹훅·Redirect 데이터 덮어쓰기 원천 봉쇄 | **필수 (P0)** |
| **정합성** | CAS affectedRows=0 → INFO 로그, throw 없음 | 웹훅 200 유지, 재전송 중단 | **필수 (P0)** |
| **성능** | 8초 Global Budget (3곳 체크) | 락 경합 시 워커 고사 방지 | **필수 (P0)** |
| **운영** | last_error_code 상세 기록 | LOCK_TIMEOUT vs REF_ERROR 구분, 자동 복구 근거 | **권장 (P1)** |

