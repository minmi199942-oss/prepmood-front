  # GPT 결제·재고 피드백 검토 (Prepmood 코드 기준)

  > GPT는 우리 환경/코드/DB를 직접 보지 못하고 “Cursor가 정리한 설명문”만 보고 피드백했습니다.  
  > 아래는 **실제 코드·마이그레이션·동작**을 직접 확인한 뒤, 그 피드백을 분류·정리한 문서입니다.  
  > 코드 수정은 하지 않았습니다.

  ---

  ## 1. 검증 방법

  - **backend**: `payments-routes.js`, `paid-order-processor.js`, `paid-event-creator.js`, `refund-routes.js`, `index.js`(delivered), `cart-routes.js`
  - **migrations**: `024_create_paid_events_table.sql`, `027_order_item_units`, `028_warranties`, `032_stock_units_token_pk`, `018_orders_idempotency`, `084_invoices`, `090_payment_attempts_stock_holds`, `091_checkout_sessions`
  - **scripts**: `ORDER_RECOVERY_GUIDE.md`, `payment-recovery-service.js`

  ---

  ## 2. 받아들일 부분 (GPT 맞음, 코드와 일치)

  | GPT 피드백 | 우리 코드/DB 검증 결과 |
  |------------|------------------------|
  | 재고 실제 차감 지점이 주문 생성이 아니라 **결제 확정(processPaidOrder)** | ✅ `processPaidOrder` 내부에서만 `stock_units`를 `in_stock` → `reserved` 전이. 주문 생성(orders/order_items) 시 재고 미사용. |
  | **stock_units** 단위로 exact row 잡아서 reserved 처리 | ✅ `FOR UPDATE SKIP LOCKED` + `affectedRows === 1` 검증. |
  | **서버 금액** 기준 결제 확정 | ✅ confirm 시 서버가 보는 주문 금액으로 PG confirm 호출. |
  | **paid_events**를 별도 증거로 먼저 남김 | ✅ `createPaidEvent`는 별도 커넥션·autocommit. processPaidOrder 실패해도 paid_events는 유지. |
  | **checkoutSessionKey**와 멱등성 필요 | ✅ checkout_sessions로 세션 소비·선점, withPaymentAttempt로 중복 confirm 방지. |
  | 회원/비회원 장바구니 분리 **이유** (인증 구조) | ✅ 회원: 서버 cart API(authenticateToken). 비회원: localStorage. |
  | **결제 후 재고 부족** 가능성 (동시에 두 명이 마지막 1개 결제) | ✅ 설계상 가능. confirm 시점에 재고를 잡기 때문에, 한 명은 결제 성공 후 processPaidOrder에서 INSUFFICIENT_STOCK 실패 가능. |
  | **paid_event_processing failed** 시 자동 재처리 워커 없음 | ✅ confirm 라우트에서 “§C failed” 재시도(클라이언트 재요청 시)만 있음. 백그라운드 워커·스케줄러 없음. 복구는 스크립트/가이드(ORDER_RECOVERY_GUIDE.md) 기반. |
  | **환불 시 재고를 바로 in_stock**으로 되돌림 | ✅ `refund-routes.js`에서 `UPDATE stock_units SET status = 'in_stock'` 직접 수행. 검수/검품 등 중간 상태 없음. |
  | **장바구니 제한 수량**은 UX·사전 검증이지 재고 보호의 최종 방어선이 아님 | ✅ 최종 방어선은 processPaidOrder의 재고 배정. |
  | **명품몰**은 객단가·희소성 때문에 “결제 후 재고 부족”이 고객 경험상 더 위험 | ✅ 판단으로 받아들임. |
  | **재고 조회 공개 API**(exact count) 정보 노출·스크래핑 리스크 | ✅ `GET /api/products/stock-count`는 정확한 개수 반환. rate limit은 /api 공통에만 의존. |
  | **상태 머신이 여러 개**라 SSOT 드리프트 가능성 | ✅ stock_units.status, order_item_units.unit_status, orders.status(집계), paid_event_processing.status, warranties.status 등. 정기 리컨실 배치는 코드에서 확인 안 됨. |
  | **delivered / refund**에 멱등 설계 필요 | ✅ **delivered**: 이미 `delivered_at !== null`이면 400으로 거부(이중 처리 방지). **refund**: warranty.status === 'revoked'면 "이미 환불 처리된 보증서" 400. 둘 다 “한 번만 처리”는 보장. 다만 refund는 Idempotency-Key로 refund_event_id 사용 중. |

  ---

  ## 3. GPT 일반론과 다른 부분 (우리 구조 기준 재정리)

  | GPT 피드백 | 실제 우리 구조 | 비고 |
  |------------|-----------------|------|
  | **paid_events.payment_key UNIQUE** 필요 | 우리는 **UNIQUE(order_id, payment_key)** (`uk_paid_events_order_payment`). payment_key 단독 UNIQUE는 없음. 이 조합으로 “같은 주문·같은 paymentKey” 중복 INSERT는 막고 있음. | 단독 payment_key UNIQUE는 **추가 방어선**으로 고려할 만하다. 현재 구조도 기본 중복 방지는 되지만, “잘못된 order_id에 같은 paymentKey가 연결되는 비정상 상황까지 DB가 막아주진 않는다”는 점은 별도로 인지해야 함. |
  | **webhook과 confirm이 같은 멱등 경로인지 불명확** | 두 경로 모두 **createPaidEvent(orderId, paymentKey, ...)** → **processPaidOrder(connection, paidEventId, ...)** 호출. createPaidEvent는 (order_id, payment_key) UNIQUE + ER_DUP_ENTRY → SELECT로 event_id 재사용. processPaidOrder는 **이미 pep.status='success'인 event**는 맨 앞에서 즉시 반환(alreadyProcessed). | “같은 paid_event를 여러 번 완전히 처리하는 것”은 막혀 있지만, **success로 바뀌기 전 pending/processing 구간에서의 동시 진입 경쟁**은 별도로 점검할 필요가 있다. 이 문서는 그 부분까지 완전히 증명하지는 않았다. |
  | **stock hold가 없다** | **stock_holds 테이블은 존재함**(migration 090). 다만 **결제창 진입/주문 생성 시점에 hold를 거는 로직은 없음**. confirm → processPaidOrder에서만 in_stock → reserved 전이. 즉 “hold → reserved” 플로우는 미사용. | 테이블은 있으나, “재고 선점”은 여전히 결제 확정 시점에만 이루어짐. |

  ---

  ## 4. 보완이 필요한 부분 (GPT 지적 타당, 개선 여지)

  | 항목 | GPT 요지 | 우리 현황 | 보완 방향 |
  |------|----------|-----------|-----------|
  | **결제 전 재고 선점(hold)** | 주문/결제창 진입 시 TTL 있는 hold → 결제 성공 시 reserved, 포기/만료 시 해제 | stock_holds 테이블은 있으나 미사용. 재고는 confirm 시점에만 reserved | 명품몰 운영 정책에 맞추려면, 결제창 진입(또는 주문 생성) 시 stock_holds에 hold 걸고, confirm 시 hold → reserved 전이, 실패/만료 시 hold 해제하는 설계 검토 |
  | **paid_event_processing 자동 재처리** | pending/failed에 대한 워커, backoff, 최대 재시도, 최종 실패 시 알림·환불 정책 | confirm §C에서 “failed”일 때 클라이언트 재요청 시 한 번 재시도. 백그라운드 워커 없음 | failed/pending 건에 대한 주기적 재시도 워커 또는 스케줄러 도입 검토. 관리자 복구는 보조 수단으로 유지 |
  | **환불 재고 중간 상태** | 환불 = 즉시 재판매 가능이 아님. 검수 대기(returned_pending_inspection 등) 필요 | 환불 처리 시 곧바로 stock_units.status = 'in_stock' | 검수/검품 정책 도입 시 returned_pending_inspection 등 중간 상태 추가 후, 검수 완료 시에만 in_stock 전이 검토 |
  | **재고 조회 API 완화** | exact count 대신 bucket(0/1/2–5/6+) 또는 “low stock” 텍스트만 | 현재 정확한 available_count 반환 | 운영·경쟁사 리스크를 줄이려면 bucket 또는 low_stock 여부만 반환하도록 변경 검토 |
  | **상태 리컨실** | reserved인데 order_item_units 없음, success인데 invoice 없음 등 비정상 조합 정기 검사 | 별도 리컨실 배치 미확인 | 주기적 검사 SQL/배치로 비정상 조합 탐지 및 알림/복구 검토 (stock_units, order_item_units, warranties, invoices, orders.status를 함께 보는 쿼리 필요) |
  | **guest cart 서버 통합** | 비회원도 서버 guest cart 사용 시 재고 검증 등 로직 일원화 | 비회원은 localStorage, 회원은 서버. 재고 한도는 회원=서버, 비회원=stock-count API + 프론트 캡 | 장기적으로 guest용 세션/토큰 기반 서버 cart 도입 시, 재고 검증·수량 제한·오류 메시지를 한 경로로 통일 가능 |

  ---

  ## 5. 부족한 점 (우리 측 추가 정리)

  - **DB UNIQUE/제약 정리**  
    - 이미 있는 것: paid_events(order_id, payment_key), order_item_units(order_item_id, unit_seq), order_item_units(stock_unit_id, active_lock), warranties(token_pk), stock_units(token_pk), orders_idempotency(owner_key, idem_key), checkout_sessions(session_key), invoices 관련 UNIQUE 등.  
    - GPT가 말한 “payment_key UNIQUE”는 우리는 (order_id, payment_key)로 대체되어 있음.
  - **트랜잭션·락 순서**  
    - paid-order-processor 주석: stock_units → orders → warranties → invoices. 코드가 이 순서 준수하는지는 흐름별로 재확인하는 것이 좋음.
  - **감사 로그**  
    - refund는 Idempotency-Key·refund_event_id 사용. delivered는 “이미 배송완료” 400으로 이중 처리 방지. 관리자 API 감사 로그 범위는 별도 정리 필요.

  ---

## 6. 한 줄 요약 (코드 검증 반영)

- **이중 차감 방지**: FOR UPDATE SKIP LOCKED + affectedRows 검증 + 실패 시 reserved 해제로 잘 되어 있음.
- **진입점**: 재고가 실제로 줄어드는 시점은 “결제 확정(processPaidOrder)” 한 곳임. 주문 생성·장바구니는 재고를 줄이지 않음.
- **남는 리스크**: (1) 결제는 됐는데 재고 부족으로 processPaidOrder 실패(고객 경험·운영 리스크), (2) failed paid_event_processing 자동 재처리 부재, (3) 환불 시 즉시 in_stock 복귀(검수 정책 없음), (4) confirm과 webhook은 다른 진입점이지만 paid_events UNIQUE + pep success로 **“처리를 한 번만 하려는 구조적 의도”만 보일 뿐, pending/processing 경쟁 구간의 완전 단일 처리 보장은 별도 테스트·상태 전이 검증이 필요함**.
- **stock_holds**: 테이블은 있으나, 현재 플로우에서는 “결제 전 hold”를 쓰지 않음. “결제 후에만 reserved”인 구조는 그대로임.

---

## 5. 구현 방향 정리 (GPT 권장 구조 기반)

  > 아래는 “최종 권장 구조”를, 현재 Prepmood 코드/DB 구조를 기준으로 정리한 **구현 계획 메모**입니다.  \n> 실제 코드/DDL 변경은 별도 작업이며, 여기서는 **단계·역할·주의점만** 정리합니다.

  ### 5.1 최종적으로 지향하는 상태 흐름 (요약)

  - **cart / order 단계**  
    - stock_units 상태 변화 없음 (`in_stock` 유지).  
    - 장바구니/주문은 “사고 싶다 / 결제 준비”를 나타내는 단계.
  - **payment start (결제 진입)**  
    - `stock_holds`에만 임시 선점(hold) 기록 (`active`, TTL 포함).  
    - stock_units.status는 여전히 `in_stock`.
  - **payment success 확정**  
    - `stock_units: in_stock → reserved` (해당 주문에 귀속).  
    - order_item_units / warranties / invoices 생성.  
    - paid_event_processing.status = 'success'.
  - **delivery 완료**  
    - `stock_units: reserved → sold`.
  - **refund / return**  
    - 장기 목표: `sold → returned_pending_inspection → in_stock` 또는 `damaged/retired`.  
    - 현재는 `sold → in_stock`으로 바로 복귀하는 구조이므로, 검수 대기 상태 도입이 개선 포인트.

### 5.2 1단계 – stock_holds 실제 사용 (최소 변경 버전)

**목표**: 지금 구조(결제 확정 시 reserved)에는 손대지 않고, 그 앞 단계에 “조용한 hold”만 추가.

- **어디에 붙일지 (위치 고정)**  
  - `/api/payments/confirm` 안에서 `withPaymentAttempt` 진입 후,  
    **checkout_session / payment_attempt 소유권을 먼저 선점한 직후, PG Confirm 호출 전에** 수행한다.  
  - 이 시점에서:
    - order_items로 필요한 수량 산정.  
    - stock_units에서 `status='in_stock'`이고 상품/사이즈/색상이 맞는 행들을 `FOR UPDATE SKIP LOCKED`로 선택하되,  
      **이미 stock_holds에 active 상태로 잡혀 있는 stock_unit_id는 제외**하고 선택.  
    - 선택된 stock_unit_id들을 `stock_holds`에 `active` 상태로 INSERT (TTL = hold TTL; 초기 12분, 최대 15분).  
    - 각 hold 레코드는 최소한 다음을 가져야 한다:  
      `stock_unit_id`, `order_id`, `order_item_id`, `checkout_session_id`, `payment_attempt_id`, `status`, `expires_at`.  
    - **DB 차원에서 같은 stock_unit_id에 active hold는 하나만** 허용되도록 UNIQUE 제약 또는 동등한 보호장치가 필요하다.
- **무엇을 바꾸지 않는지**  
  - 이 단계에서는 **stock_units.status를 바꾸지 않는다** → `in_stock` 그대로.  
  - 재고의 “진짜 차감”은 여전히 processPaidOrder에서만 수행.
- **fallback 정책 (Phase 1 한정)**  
  - 완전히 legacy 경로(hold 도입 전 주문) 또는 **hold 비활성화 플래그가 명시된 주문**에 한해서만, hold 없이 기존 `in_stock` 조회 로직으로 fallback을 허용한다.  
  - **hold-enabled payment_attempt**에서는 “유효한 hold가 없다”는 것은 곧 **구조적 오류**이므로, 이 경우에는 기존 fallback 없이 실패로 처리하는 방향이 안전하다. (Phase 1 구현 시점에는 “어디까지를 hold-enabled로 볼지”를 명시적으로 구분해야 함.)
- **주의점 (추후 설계 필요)**  
  - 한 사용자/세션당 hold 개수 제한 (봇/악성 사용 방지).  
  - 이미 active hold가 있는 주문/세션에 대한 중복 hold 방지 (checkout_session_id / payment_attempt_id 기준).  
  - 만료된 hold를 정리하는 워커/cron 설계.  
  - PG가 **명시적으로 실패**를 돌려준 경우(거절, 금액 불일치, 세션 불일치 등)에는 TTL을 기다리지 않고, 해당 hold를 **즉시 release/expired 처리**하는 것이 바람직하다.  
    (반대로 네트워크 timeout/결과 불명확 케이스는 TTL + 재시도 정책에 맡길 수 있음.)

#### 5.2.1 hold 재사용 조건 (엄격 기준)

기존 hold를 “재사용”하려면, 단순히 `order_id`만 같다고 해서 재사용하면 안 되고, 아래 조건을 **모두** 만족해야 한다.

- 같은 `order_id`  
- 같은 `checkout_session_id` **또는** 같은 `payment_attempt_id`  
  - (즉, 같은 결제 흐름 내에서 만들어진 hold여야 함)
- 같은 `order_item_id` 구성  
  - hold에 기록된 order_item_id 집합과, 현재 주문의 order_items 구조가 동일해야 함
- 같은 필요 수량  
  - hold에 붙어 있는 stock_unit_id 개수와, 현재 order_items가 요구하는 총 수량이 정확히 일치해야 함
- hold 집합에 속한 모든 레코드가  
  - `status = 'active'` 이고  
  - `expires_at > NOW()` 이며  
  - 일부라도 이미 `consumed`/`released`/`expired` 상태가 아닌 것

위 조건 중 하나라도 어긋나면, 기존 hold를 재사용하지 말고 **현재 주문/결제 시도에 맞게 새 hold를 잡는 것**이 안전하다.

  ### 5.3 2단계 – confirm/webhook/recovery 공통 finalize 처리기 + 상태 원자 전이

  **목표**: 결제 완료 처리를 담당하는 **단일 finalize 함수**를 두고, confirm·webhook·recovery가 모두 이 경로를 타도록 정리.

  - **개념 흐름 (pseudo)**  
    - finalizePayment(orderId, paymentKey, …) 내부에서:
      1. payment_attempt 또는 paid_event_processing 행을 **잠금**.  
        - 이미 succeeded → 기존 성공 결과 반환.  
        - 이미 processing → “다른 요청이 처리 중” 응답.  
        - created/hold_acquired/pg_pending → **한 요청만** processing으로 전이 (`UPDATE … WHERE status IN (...)` CAS 또는 FOR UPDATE).  
      2. PG 응답·금액 검증.  
      3. paid_events upsert/get (`order_id, payment_key` UNIQUE 기반).  
      4. 유효한 stock_holds가 있는지, 주문/세션과 매칭되는지, TTL 안인지 검증.  
      5. `stock_units: in_stock → reserved` + order_item_units / warranties / invoices 생성.  
      6. payment_attempt = succeeded, stock_holds = consumed, checkout_session = consumed.
  - **현재 코드와의 연결 포인트**  
    - `payments-routes.js`의 confirm 핸들러, webhook 내부 `handlePaymentStatusChange`, `payment-recovery-service.js`에서 이 finalize 함수로 수렴시키는 방향.  
    - 이미 존재하는 `createPaidEvent`, `processPaidOrder`, `updateOrderStatus`를 이 finalize 안에서 호출하는 형태로 재구성 가능.

  ### 5.4 3단계 – 자동 워커 (만료 hold 정리 + failed/pending 재처리)

  **목표**: 사람이 스크립트로 복구하기 전에, 시스템이 “청소기”처럼 먼저 자동 처리.

  - **만료 hold 정리**  
    - `stock_holds.status='active'`이고 `expires_at < NOW()` 인 행들을 주기적으로 찾아:  
      - status를 `expired` 또는 `released`로 변경.  
      - 필요 시 로그/알림 남김.
  - **failed/pending 재처리**  
    - `paid_event_processing.status IN ('pending','processing','failed')` 중, 일정 시간 이상 정체된 행들에 대해:  
      - 재시도 가능 조건이면 finalizePayment 재호출.  
      - 더 이상 재시도하면 안 되는 경우 status를 failed로 확정하고 관리자 알림.  
    - ORDER_RECOVERY_GUIDE.md에서 설명하는 수동 스크립트는 “보조 수단”으로 유지.

  ### 5.5 4단계 – 환불/반품 검수 상태 도입

  **목표**: 환불 시 곧바로 `in_stock`으로 돌리지 않고, 반드시 “검수 대기”를 거치게 만들기.

  - **상태 제안 (초기 버전)**  
    - stock_units.status: 최소 `in_stock`, `reserved`, `sold`, `returned_pending_inspection`, `damaged`를 우선 도입.  
    - (필요해지면 `retired` 등 영구 폐기 상태를 후속 단계에서 추가 검토)  
    - refund-routes에서는 지금의 `sold → in_stock`을  
      `sold → returned_pending_inspection`으로만 바꾸고,  
      별도 관리자 플로우에서만 `in_stock` 또는 `damaged`로 전이.
  - **운영 설계 필요 포인트**  
    - 누가(어떤 권한) 언제 “검수 완료/불량”을 누르는지.  
    - 기준(오염, 구성품 누락, 사용 흔적 등)을 어디에 기록할지.  
    - warranty/보증서 이력과 연계 방식.

  ### 5.6 초기 운영 파라미터 제안 (정책 기본값)

  > 초기값을 먼저 정하고, 실제 트래픽/운영 데이터를 보면서 조정하는 것을 전제로 한 기본 설정입니다.

- **hold TTL (stock_holds.expires_at)**  
  - 초기 **운영 범위**: **12~15분**  
  - 기본값 제안: **12분으로 시작**하고, 실제 결제 이탈 패턴·CS를 보면서 **최대 15분까지** 조정 가능하게 둔다.  
  - (만약 Prepmood 정책상 15분으로 시작한다면, 그때는 **동일 세션 중복 hold 금지, 사용자/세션당 active hold 수 제한, 만료 hold 즉시 정리, 재결제 시 재검증 강제**를 전제로 운영하는 것이 안전하다.)  
  - 동작 원칙:  
      - TTL이 지나면 **hold 메모만 무효**로 처리한다 (`stock_units`는 여전히 `in_stock`).  
      - 고객의 checkout 입력값/주문서는 유지.  
      - 다시 결제를 시도할 때는 항상 **실제 재고를 다시 보고** 새 hold를 만들거나 “재고 변동 안내”를 보여준다.

  - **반품 상태 (환불 후)**  
    - 최소 상태 집합:  
      - `returned_pending_inspection` – 반품 도착, 검수 대기.  
      - `in_stock` – 검수 통과, 다시 판매 가능.  
      - `damaged` – 검수 실패, 재판매 불가(또는 별도 처리).  
    - 이후 필요 시: `retired` 등 영구 폐기/샘플 전환 상태를 추가 검토.

  - **워커 주기 (자동 청소기)**  
  - hold 만료 정리 워커: **1분마다**  
    - 이유: hold는 짧은 시간성 데이터라, 유령 hold가 오래 남지 않도록 자주 치우는 편이 안전.  
    - 전제: 이 워커는 `status='active' AND expires_at < NOW()` 인 **만료 hold만 소량 배치로 정리하는 경량 작업**이어야 하며, 전체 재고/주문/결제를 매분 전체 스캔하는 식으로 구현하면 안 된다.  
    - payment recovery 워커: **3분마다**  
      - 이유: 너무 자주 돌면 같은 건을 과도하게 건드릴 수 있어, 약간의 여유를 둔다.  
    - 리컨실(상태 일관성 점검) 배치: **하루 1회 (새벽)**  
      - 목적: 실시간보다는 “조용히 누적된 비정상 조합 찾기”에 가깝기 때문에 일일 주기로도 충분.

  - **알림 기본 정책**  
    - 모든 이벤트를 알림으로 쏘지 않고, “사람이 꼭 봐야 하는 것” 위주로 알림:  
      - hold 만료: 알림 불필요 (정상 동작, 워커가 정리).  
      - payment recovery 자동 복구 성공: 로그만 남김.  
      - payment recovery 최종 실패: 관리자 알림.  
      - paid_event 존재 + reserved 미생성 장기 정체: 관리자 알림.  
      - refund 후 상태 불일치(예: 환불됐는데 여전히 sold): 관리자 알림.

  ---

  ## 6. 한 줄 요약 (코드 검증 + 구현 방향)

  - **현재**: 재고 이중 차감(같은 재고를 두 번 파는 것)을 막는 장치는 잘 깔려 있고, 재고는 결제 확정 시점에만 `in_stock → reserved`로 줄어든다.  
  - **추가로 지향할 구조**: 장바구니/주문 단계는 비선점 유지, 결제 진입 시 `stock_holds`로 짧은 임시 선점, 결제 확정 시 `stock_units` reserved 전환, 배송 완료 시 sold, 환불/반품 시 검수 대기 후 재입고 여부 결정.  
  - **우선순위**: (1) stock_holds를 실제 플로우에 붙이는 1단계, (2) confirm/webhook 공통 finalize 처리기 설계, (3) 만료 hold·failed/pending 자동 재처리 워커, (4) 환불 검수 상태 도입 순으로 점진 도입하는 것이 현실적인 경로.

  ---

  ## 7. Phase 1 구현 직전 최종 체크포인트 (요약)

  Phase 1 코드를 쓰기 전에, 아래 5가지는 **구현 기준**으로 확정해야 한다.

  1. **active hold 중복 금지 방식 (DB 레벨)**  
     - 같은 `stock_unit_id`에 대해 동시에 두 개의 active hold가 생기지 않도록, MySQL에서 하나를 선택해야 한다.  
       - 예: `stock_holds`에 `UNIQUE (stock_unit_id, active_flag)` 또는 generated column을 활용한 UNIQUE 제약.  
     - “UNIQUE 또는 동등한 보호장치”가 아니라, 실제로 어떤 제약을 쓸지 구현 전에 결정 필요.

  2. **hold 생성 트랜잭션 경계**  
     - “어떤 재고를 hold로 쓸지 **선택하는 SELECT**”와  
       “실제 `stock_holds`에 **INSERT해서 이름표를 붙이는 작업**”은 **반드시 같은 트랜잭션** 안에서 이어져야 한다.  
     - 그래야 A요청이 재고를 고르고 있는 사이에 B요청이 같은 재고를 또 고르는 경쟁 상태를 줄일 수 있다.

  3. **hold-enabled 판정 위치**  
     - 어떤 결제 시도가 “hold를 반드시 써야 하는 새 경로인지”,  
       아니면 “옛날/legacy 경로(hold 없이 fallback 허용)인지”를 어디에 기록할지 결정해야 한다.  
     - 추천: `payment_attempts`에 플래그(예: `use_hold`/`mode`)를 두고, `processPaidOrder`/finalizePayment가 이 값을 보고  
       - hold-enabled면 **hold 없을 때 실패**,  
       - legacy면 기존 fallback 허용  
       을 구분하도록 한다.

  4. **실패 유형별 hold 해제 정책 (즉시 vs TTL)**  
     - PG/네트워크 실패를 아래 두 부류로 나눠 표로 고정해야 한다.  
       - **즉시 release 대상**: 카드 거절, 금액 불일치, order/session 불일치, 유효성 검증 실패 등 “결제가 확실히 안 된” 경우.  
       - **TTL 보류 대상**: PG timeout, 네트워크 단절, 결과 미확정, webhook 대기 등 “성공/실패가 아직 애매한” 경우.  
     - 이 기준에 따라, 어떤 실패는 hold를 바로 풀고(이름표를 떼고), 어떤 실패는 TTL/재시도 경로에 맡길지 결정한다.

  5. **최소 감사 로그 항목**  
     - 나중에 “이 재고가 왜/언제/누구 때문에 묶였고 풀렸는지”를 추적할 수 있도록, hold 관련 액션에는 최소한 다음이 로그/테이블에 쌓여야 한다.  
       - `hold_id`, `stock_unit_id`, `order_id`, `payment_attempt_id`, `checkout_session_id`,  
         `action`(예: acquired / reused / released / expired / consumed), `reason`, `timestamp`.  
     - 이 정도만 있어도 주문/재고 꼬임을 사후 분석하기 쉬워진다.

  ---

  ### 7.1 Phase 1 구현 후 현재 한계와 후속 과제 (정리)

  - **webhook/recovery 경로 정렬 (경로 일관성 이슈)**  
    - 현재 confirm 경로는 `payment_attempts.use_hold` + `attemptId` 기반으로 hold-enabled 여부를 판단하고,  
      hold-enabled인 경우 **ACTIVE hold 세트 없이는 결제를 확정할 수 없도록** 강제한다.  
    - webhook·recovery 경로는 점진적으로 `attemptId` + `use_hold`를 넘기는 형태로 맞춰가고 있으나,  
      모든 진입점이 완전히 동일한 finalize 처리기를 타는 구조(§5.3의 목표)까지는 아직 도달하지 않았다.  
    - **배포 판단 시점에는** confirm/webhook/recovery가 같은 attempt/use_hold 규칙을 공유하는지 재점검이 필요하다.

  - **stock_holds.order_item_id 부재에 따른 한계**  
    - Phase 1 DDL 기준: `stock_holds`에는 `stock_unit_id, order_id, status, expires_at` 등만 있고,  
      `order_item_id`는 존재하지 않는다.  
    - 구현 상 hold 소비 검증은  
      - product_id + size + color + 총 수량 + “남는 ACTIVE hold 없음” 수준까지는 엄격히 맞추지만,  
      - **동일 SKU가 한 주문 안에 여러 줄 존재하는 극단 케이스까지 완전한 order_item 단위 매칭은 보장하지 못한다.**  
    - 따라서 Phase 1은 “SKU 레벨까지는 충분히 강한 매칭”이고,  
      **Phase 2에서 `stock_holds.order_item_id` 컬럼 추가 + order_item 단위 매칭 강화**를 후속 과제로 삼는다.

  - **RELEASED vs EXPIRED + 워커 구현 상태**  
    - 명시적 실패(카드 거절, 금액 불일치, 구조적 hold 오류 등)에 대해  
      ACTIVE hold를 **즉시 `RELEASED` + `released_at` 기록**으로 바꾸는 경로는 구현되어 있다.  
    - 반면 timeout·결과 미확정·웹훅 지연 등은 여전히  
      “`status='ACTIVE' AND expires_at < NOW()` 인 hold를 주기적으로 찾아 `EXPIRED` 전이 + 재고 복구하는 워커/배치” 설계가 필요하며,  
      현재 문서는 워커 주기·쿼리 방향(§5.4, §5.6)을 정의하는 수준에 머물러 있다.  
    - 운영 배포 전에는 최소한  
      - 만료 hold/고아 hold를 점검할 수 있는 수동 SQL  
      - 향후 워커 도입 시 사용할 인덱스·쿼리 패턴  
      을 함께 정리해 두어야 한다.

  - **요약**  
    - Phase 1 구현으로 confirm 경로는 “hold가 실제 결제 확정을 강제하는 구조”에 가까워졌고,  
      fail-open(legacy fallback)·명시적 실패 시 ACTIVE hold 방치 문제는 상당 부분 해소되었다.  
    - 다만 전 경로(webhook/recovery) 완전 정렬, order_item 단위 hold 매칭,  
      EXPIRED/워커 자동화는 **다음 단계에서 마무리해야 할 과제**로 남아 있으며,  
      이 문서에서는 이를 “Phase 1의 의도적 한계”로 명시한다.

  ---

  ### 7.2 Phase 2 이후 구현 시 추가로 고정해야 할 설계 원칙 (추가 피드백 반영)

  아래 항목들은 Phase 2 이후(hold 확장·워커·리컨실·환불 검수 등)를 구현할 때뿐만 아니라,  
  **이미 존재하는 Phase 1 코드가 가진 현재 리스크를 정확히 인지하고, 우선순위를 매기기 위한 가드레일**이다.  
  특히 몇몇 항목은 “미래 설계 원칙”이 아니라 **지금 코드 기준으로도 운영 사고 가능성이 있는 지점**이므로,  
  단순 개선이 아니라 **우선순위 높은 리팩터/보완 과제**로 봐야 한다.

  - **(1) stock_holds FOR UPDATE SKIP LOCKED + 락 순서 고정**  
    - 단순히 `FOR UPDATE SKIP LOCKED`를 붙이는 것만으로는 충분하지 않다.  
    - **전역 원칙**:  
      - `stock_units`를 잡을 때는 항상 같은 정렬 기준으로 잡는다. (예: `ORDER BY stock_unit_id ASC`)  
      - hold acquire(SELECT…SKIP LOCKED)와 hold consume(hold 기반 `stock_units` UPDATE)에서 **같은 순서로 잠근다**.  
      - 이렇게 하지 않으면 서로 다른 코드 경로가 같은 재고를 다른 순서로 잠가서 데드락 위험이 커진다.  
    - 따라서 Phase 2에서 `FOR UPDATE SKIP LOCKED`를 도입할 때는,  
      **acquire·consume 양쪽 모두가 “stock_units → (필요 시) orders → …” 순서 + 동일 ORDER BY 규칙을 공유**해야 한다.

  - **(2) USE_HOLD_RESOLUTION_FAILED 후 hold 해제 범위 (order_id 전부 X)**  
    - 현재 Phase 1 구현에서는 일부 명시적 실패에 대해 **`order_id` 단위로 ACTIVE hold를 RELEASED** 하는 패턴이 있다.  
      이 방식은 “임시 방편” 수준이 아니라, 이미 **같은 주문에서 재시도 attempt가 겹칠 때 새 attempt의 유효한 hold까지 풀어버릴 수 있는 현재 리스크**이다.  
    - `USE_HOLD_RESOLUTION_FAILED` 등 구조적 오류에 대해 “즉시 해제” 자체는 옳지만,  
      **해제 범위를 무조건 `order_id` 전체로 잡는 것은 지금도 위험한 설계**다.  
      - 같은 주문에서 사용자가 재시도하여 새 attempt가 이미 유효한 hold를 잡은 뒤,  
        이전 attempt에서 에러가 터졌다고 `order_id` 전체 ACTIVE hold를 RELEASED 해버리면,  
        **새 시도의 유효한 hold까지 같이 풀려 버릴 수 있다.**  
    - 해제 범위 우선순위:  
      1. 가능하면 **`payment_attempt_id`** 기준  
      2. 차선으로 **`checkout_session_id`** 기준  
   3. 정말 마지막 예외로만 **`order_id`** 기준  
    - 문서/코드 모두에서 “order_id 전체 RELEASE”는 **현재 코드 기준으로도 위험한 지점**임을 명시하고,  
      **attempt 또는 session 단위로 축소하는 리팩터를 “Phase 2 과제”가 아니라 우선순위 높은 보완 과제**로 둔다.

  - **(3) webhook_events에 추가할 식별자: provider + payment_key 1차, order_id 보조**  
    - webhook과 주문·결제를 매핑하려면, `webhook_events`에 뭔가 식별자를 추가해야 한다.  
    - 이때 단순히 “`order_id` 또는 `payment_key` 중 하나”라고 쓰면, 구현자가 대충 하나만 넣고 끝낼 위험이 있다.  
    - 결제 이벤트에서는 **단일 `payment_key`가 아니라 `provider + payment_key` 조합이 1차 SSOT**이고, `order_id`는 보조다.  
      - Phase 2 DDL 원칙:  
        - 최소한 `provider_name`(또는 gateway) + `payment_key` 조합을 **결제 이벤트의 1차 식별자**로 쓸 수 있도록 저장.  
        - `order_id`는 있을 경우 복구/운영에 도움이 되는 보조 키.  
        - 이들 컬럼은 검색용 인덱스를 갖고, 최소한 (`processing_status`,`updated_at`)와 함께 사용할 수 있어야 한다.

  - **(4) 만료 hold 워커: 시간만 보고 EXPIRED로 바꾸면 안 됨**  
    - Phase 2B에서 제안된 “`status='ACTIVE' AND expires_at < NOW()` → EXPIRED 워커”는 방향은 맞지만,  
      **그대로 구현하면 경계 조건에서 실행 중인 결제와 충돌할 수 있다.**  
    - 워커 설계 시 추가로 고정할 것:  
      - **단일 실행 보장**: 같은 워커가 동시에 두 번 돌지 않게 한다. (락/플래그/분산락 등)  
      - **작은 배치 처리**: `ORDER BY expires_at ASC LIMIT N` 식으로 잘라서 처리.  
      - **idempotent UPDATE**: 같은 hold가 경계에서 두 번 EXPIRED 전이 시도되어도 문제가 없도록,  
        `WHERE status='ACTIVE' AND expires_at < NOW()` 조건 안에서만 전이하고,  
        이미 RELEASED/CONSUMED/EXPIRED 된 행은 건드리지 않는다.  
      - **payment_attempt 상태와의 관계를 반드시 고려**: 이미 CONFIRMED/성공 확정된 attempt에 연결된 hold를,  
        단순 시간 경과만으로 EXPIRED로 전이하지 않도록 워커 쿼리/조건을 설계해야 한다.  
        (예: 아직 PROCESSING/PENDING 상태인 attempt에 연결된 hold만 EXPIRED 후보로 본다.)

  - **(5) 복구에서 attemptId를 넘길 때의 전제 (임의 최신 attempt 금지)**  
    - Phase 2C 계획에서는 `recover_pipeline_batch.js` 등에서 attemptId를 구해 넘기는 아이디어가 있었지만,  
      **“해당 주문의 최신 attempt를 그냥 넘기면 안 된다”**는 제약을 더 명확히 해야 한다.  
    - 안전한 규칙:  
      - **paymentKey 또는 paid_event와 “결정적으로” 매핑되는 attempt**일 때만 attemptId를 전달한다.  
      - 이 매핑을 할 수 없으면, **“명시적으로 legacy임이 확인된 주문”에 한해서만** 현재처럼 attemptId 없이 legacy(in_stock) 경로로 복구를 허용한다.  
      - `use_hold = 1` 인 주문에서 attempt를 결정적으로 찾지 못했는데,  
        무조건 legacy로 돌려버리는 것은 새 hold 규칙을 우회하는 것이므로 금지한다. 이 경우에는 **manual-review 또는 UNRESOLVED 상태로 남겨야 한다.**  
    - 그렇지 않으면 recovery가 **엉뚱한 attempt의 hold를 소비하거나, hold-enabled 주문을 legacy 규칙으로 처리하는 위험**이 있다.

  - **(6) UNRESOLVED_ATTEMPT 수집과 기존 구조 기반 복구의 중복 실행 방지**  
    - Phase 2C-2에서 “UNRESOLVED_ATTEMPT를 복구 스크립트가 직접 수집”하는 건 좋은 방향이지만,  
      기존 `recover_pipeline_batch.js`가 이미 구조 기반으로 복구를 시도하고 있으므로,  
      **같은 주문을 두 복구 루틴이 동시에 건드리는 상황을 피해야 한다.**  
    - 이를 위해서는 최소한:  
      - claim/lock 규칙 (예: payment_attempts.recovery_status, 또는 별도 플래그)를 통한 **선점 후 처리**,  
      - 또는 “UNRESOLVED_ATTEMPT 전용 스크립트”와 “기존 구조 기반 스크립트”의 **책임 분리**  
      중 하나를 명시적으로 선택해야 한다.

  - **(7) finalizePayment는 “큰 함수”가 아니라 “공통 상태 머신”이어야 한다**  
    - Phase 3A에서 제안된 finalizePayment는, 단순히 createPaidEvent + processPaidOrder + updateOrderStatus를  
      한 함수 안에 넣는 리팩터가 아니라, **결제 완료 상태 머신의 SSOT를 어디에 둘지부터** 정해야 한다.  
    - 먼저 고정할 것:  
      - payment_attempts와 paid_event_processing **둘 다를 상태머신 SSOT로 키우지 말 것** —  
        둘 중 **하나만 “실제 처리 상태”의 SSOT**로 두고, 다른 하나는 증거·진단·추적 계층으로 낮춘다.  
      - 누가(어느 테이블/컬럼이) `PROCESSING → SUCCESS/FAILED`를 원자적으로 전이하는 기준점인지,  
      - 락을 어디서부터 잡고 어떤 순서로 풀지.  
    - 이 원칙 없이 finalizePayment만 만들면, 단지 “기존 로직을 한 함수로 모은 것”에 그칠 수 있고,  
      구조적 안정성은 크게 좋아지지 않는다.

  - **(8) 자동 재처리 워커: 상태값만 보고 재시도하면 위험**  
    - Phase 3B 계획처럼 `status IN ('pending','processing','failed')` + 시간 기준만으로 재호출하면,  
      **이미 terminal failure인 건까지 반복 실행**해서 더 꼬일 수 있다.  
    - 자동 재처리에서는 최소한 에러를 세 등급으로 나눠야 한다:  
      - **retryable**: 네트워크/타임아웃/락 경합 등 재시도로 해결 가능성이 있는 것.  
      - **terminal**: HOLD_REUSE_INVALID 등 “데이터/정책 위반”으로, 재시도해도 안 고쳐지는 것.  
      - **manual-review-required**: 운영자가 원인·데이터를 보고 판단해야 하는 것.  
    - 워커는 **retryable에만 자동 재시도**, terminal은 바로 failed 확정 + 알림,  
      manual-review는 상태만 표시하고 사람이 개입하는 구조로 설계해야 한다.  
    - 추가로, 자동 재처리 워커에는 최소한 다음이 필수적으로 들어가야 한다.  
      - **최대 재시도 횟수** 및 **backoff 전략** (같은 건을 무한 재시도 금지)  
      - 동일 건 중복 재처리 방지를 위한 **claim/lock 규칙**  
      - 특정 에러(HOLD_REUSE_INVALID, HOLD_STOCK_MISMATCH 등)를 **retryable이 아닌 terminal/수동 검토 대상으로 분류**하는 명시적 테이블  
      - “poison case”(여러 번 실패하는 건)를 자동 격리하는 정책

  - **(9) 리컨실 배치는 1차는 “읽기 전용”이어야 함**  
    - Phase 3C의 리컨실 배치는 방향 자체는 맞지만,  
      **첫 버전부터 자동 수정까지 섞는 것은 위험**하다. false positive가 하나만 있어도 더 큰 사고를 낼 수 있다.  
    - 안전한 단계:  
      1. **탐지**: 비정상 조합만 SQL/스크립트로 찾아서 출력 (읽기 전용).  
      2. **알림**: 결과를 로그/알림으로 전달.  
      3. **수동 검토**: 운영자가 하나씩 원인 분석.  
      4. 그 다음 단계로, 패턴이 명확한 일부 케이스에 한해 **자동 복구 로직을 별도로 설계**.

  - **(10) stock_holds.order_item_id 추가는 “단순 컬럼 추가”가 아님**  
    - Phase 4A에서 제안된 `stock_holds.order_item_id` 추가는,  
      겉으로는 컬럼 하나지만, 실제로는 **배정 알고리즘 전체를 건드리는 작업**이다.  
      - hold acquire 시 단위 배정 규칙,  
      - hold 재사용 검증,  
      - hold 소비(consume) 검증,  
      - 나중 order_item_units 생성까지 모두 연관된다.  
    - 즉 “중간~큼” 정도의 작업이 아니라,  
      **“재고 단위 배정 알고리즘 재설계”에 가까운 높은 위험도 작업**임을 명시하고,  
      충분한 테스트·마이그레이션 전략을 갖춘 뒤 착수해야 한다.  
    - 마이그레이션 관점에서도, 다음과 같은 **mixed-mode 과도기 전략**이 필요하다.  
      - 기존 행은 `order_item_id = NULL` 상태로 유지하고, **신규 hold부터만 order_item_id를 강제**한다.  
      - 검증 로직에서는 “order_item_id가 있는 hold”와 “없는 hold”를 구분해 처리(예: 우선순위 부여).  
      - 과도기 동안 두 유형이 섞여 운용될 수 있음을 전제로, backfill 전략을 신중하게 설계해야 한다.

  - **(11) 환불 검수 상태는 비즈니스 정책과 함께 설계해야 함**  
    - `sold → returned_pending_inspection → in_stock/damaged` 플로우는  
      “물건이 먼저 회수되고, 그 다음에 환불/검수”가 기본 정책일 때는 적절하다.  
    - 하지만 **“먼저 환불 승인, 물건은 나중 회수”**도 허용하는 정책이라면,  
      `refund_requested`, `return_in_transit` 같은 중간 상태가 추가로 필요할 수 있다.  
    - 따라서 환불 상태 머신은 **실제 운영 정책(회수 타이밍·승인 방식)**과 함께 설계해야 하며,  
      단순히 상태 이름만 추가해서는 안 된다.  
    - 또한, 결제 환불 상태와 재고 회수/검수 상태를 **한 컬럼에 섞지 말고, 가능하면 별도 축으로 관리**하는 것이 좋다.  
      - 예: 결제 측면의 `refund_status`(NONE/PENDING/SUCCESS/FAILED…)와,  
        재고 측면의 `return_status`(not_requested/requested/in_transit/returned_pending_inspection/inspected_ok/inspected_failed…)를 분리.  
      - 이렇게 해야 “환불은 이미 완료되었지만 물건은 아직 도착 안 함” 같은 상태를 명확하게 표현할 수 있다.

  - **(12) 재고 API 완화: 외부 응답만 완화, 내부 검증은 여전히 정확한 수**  
    - Phase 4C의 “재고 조회 API를 bucket/low_stock로 완화”는 **외부 노출 응답** 기준이다.  
    - 장바구니 수량 제한·서버 측 재고 검증은 여전히 **정확한 in_stock 개수**를 알고 있어야 한다.  
    - 즉, public API 응답은 bucket으로 줄이되,  
      내부 로직(`cart-routes.js`, processPaidOrder, hold acquire 등)은 **현재처럼 정확한 카운트 기반 검증**을 유지해야 한다.

  - **(13) guest cart 서버 통합의 우선순위**  
    - guest cart를 서버로 옮기는 것은 구조적으로 옳은 방향이지만,  
      인증/세션/프론트까지 범위가 크고, 현재 Phase 1·2 안정화보다 우선순위가 높지는 않다.  
    - 이 문서는 guest cart 서버 통합을 **장기 과제(Phase 4 이후)**로 두고,  
      먼저 hold/결제/복구/리컨실 쪽 안전성을 충분히 확보하는 것이 낫다고 본다.

  - **(14) recovery 이슈 조회·관리 구조 (recovery_issues + action_logs)**  
    - 운영·관리자를 위한 이슈 조회/관리용으로, 결제/재고 SSOT 위에 **관측용 투영본**을 두는 것이 안전하다.  
    - 이때 `recovery_issues`는 **주문 상태의 진실 원천이 아니라 “최근 진단 결과 요약”** 역할만 하도록 설계해야 한다.  
      - 예: `order_id`, `payment_key`, `issue_code`(reasonCode), `first_seen_at`, `last_seen_at`, `last_retry_result` 등의 필드.  
      - **open/resolved 같은 강한 상태를 SSOT처럼 쓰지 말고**, 항상 orders/payment_attempts/paid_events/stock_holds/order_item_units 등의 원본 상태와 함께 봐야 한다.  
    - 액션 이력은 `recovery_action_logs` 같이 **별도 로그 테이블**로 분리하는 편이 좋다.  
      - 최소 필드: `actor`, `action`, `target_order_id`/`issue_id`, `pre_state_snapshot`, `result`, `error_code`, `started_at`, `finished_at`.  
    - 관리자 UI는 이 두 계층(issues + action_logs)을 읽어서 “미해결 주문 리스트 + 타임라인”을 보여주되,  
      **버튼은 항상 기존 recovery 서비스 계층(processPaidEvent 등)만 호출**하고 raw SQL·shell·우회 로직은 사용하지 않도록 한다.  
    - 복구 재시도 API는 `issueId`나 `(orderId, issueCode)`를 입력으로 받더라도,  
      - issue row만 믿지 말고 **매번 live state를 다시 조회 + resolveRecoveryAttempt 재실행**한 뒤,  
      - 그 시점에도 `HOLD_SINGLE_ATTEMPT` 등 안전 조건이 만족될 때만 실제 복구를 수행해야 한다.  
    - claim/lock는 선택이 아니라 필수이며, 워커·관리자 UI·스크립트가 **공통 claim 모델(lease + recovery_status 등)**을 공유해야 한다.  
      - 한 주문/이슈당 동시에 하나의 복구만 허용, `claimed_by/claimed_at/claim_expires_at/retry_count/last_error_code` 등을 관리.  
      - 프론트의 버튼 disable 여부와 무관하게, **백엔드에서 중복 실행을 강제로 막는 구조**가 필요하다.
    - 추천 액션 함수는 **후보용과 최종용을 분리**하는 것이 안전하다.  
      - `computeRecommendedActionCandidate(issueCode, reasonCode, useHold)`는 리스트용으로만 사용하며, 저장된 이슈 스냅샷만 보고 “후보 액션”을 계산한다.  
      - `computeRecommendedAction(issueCode, reasonCode, liveState)`는 상세/재시도 직전 전용으로, liveState(현재 payments/paid_events/order_item_units/claim 등)를 다시 읽고 최종 액션·허용 여부를 판단한다.  
      - 리스트 API는 `recommendedActionCandidate` + `candidateOnly=true` 정도만 내려주고,  
        상세 API/재시도 시점에만 liveState 재진단 결과(`recommendedAction`, `actionAllowed`, `actionAllowedReason`, `currentReasonCode`)를 보고 실제 실행 가능 여부를 결정한다.

  ---

  *문서 작성: 코드·마이그레이션·문서(ORDER_RECOVERY_GUIDE, db_structure_actual 등)를 직접 읽고 정리한 결과입니다.  \n정적 검토를 기반으로 한 메모이며, 동시성/장애 상황에 대한 실제 런타임 증명은 포함하지 않습니다.*
