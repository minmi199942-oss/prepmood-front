# 결제 confirm 504 근본 해결 및 결제 엔진 표준

**문서명 제안 (참고용)**  
- 영문: `PAYMENT_CONFIRM_504_RESOLUTION_AND_ENGINE_STANDARD.md`  
- 한글: `결제_confirm_504_해결_및_엔진_표준.md`  
→ 결제·타임아웃·표준 규격을 한 문서에서 참고할 때 검색·유지보수에 유리합니다.

---

## 개요

아래는 실제 코드·DDL·설계 문서(GEMINI_FEEDBACK_ORDER_COMPLETE_BACK_NAVIGATION_REVIEW.md, PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION.md, 090/091 마이그레이션, payments-routes.js, payment-wrapper.js, paid-event-creator.js, paid-order-processor.js, db.js, nginx-prepmood.conf)를 기준으로,
Gemini 피드백을 수용 / 부분 수용 / 기각하고, 이를 반영한 최종 근본 해결안을 정리한 것입니다.

1. Gemini 피드백별 판단 (수용 / 보완 / 기각)
1) 커넥션 풀 자가 포식(Starvation) 차단 – 취지 수용, 수치만 튜닝
Gemini 주장 요약

confirm 진입 시 첫 pool.getConnection() 대기가 길어지면 뒤 요청까지 줄줄이 지연.
첫 getConnection 타임아웃은 3초 이내로 잡고, 넘으면 503으로 즉시 끊어야 한다.
코드 근거

payments-routes.js 162행:

payments-routes.js
Lines 12-18
connection = await pool.getConnection();
await connection.beginTransaction();
여기에는 현재 타임아웃이 전혀 없음.
payment-wrapper.js의 Conn A/B는 이미 getSafeConnection(signal, 3000/5000)으로 타임아웃을 갖고 있으므로, 무한 대기의 핵심은 이 첫 번째 getConnection입니다.
풀 설정(db.js):

db.js
Lines 13-25
const poolConfig = {
    ...
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '100', 10),
    queueLimit: parseInt(process.env.DB_POOL_QUEUE_LIMIT || '200', 10),
    ...
};
→ 동시 결제 + 다른 라우트까지 합쳐 100 커넥션 + 200 큐에서 대기하면, 여기서 충분히 60초를 채울 수 있음.

판단

취지(“첫 getConnection에 짧은 타임아웃을 건다”)는 100% 수용해야 함.
이 부분이 실제 504의 가장 현실적인 근본 원인이다.
"3초"라는 숫자는 운영/UX 정책의 문제라 고정 정답은 아님.
예: 3초 vs 5초는 “우리 트래픽·DB 응답 특성·재시도 전략”에 따라 조정 가능.
따라서:
수용: “confirm 첫 getConnection에 짧은 타임아웃을 걸고, 초과 시 503으로 빠르게 종료한다”는 원칙
보완: 구체 값은 3초~5초 사이에서, 운영 모니터링(실제 응답 분포)을 기반으로 결정

2) updateProcessingStatus 커넥션 주입 – “processing 분리는 유지, success는 선택적”
Gemini 주장 요약

processing 상태를 Conn B에 묶으면, Conn B 롤백 시 processing 상태도 사라져 혼선.
따라서 processing은 지금처럼 별도 커넥션 유지 + 매우 짧은 타임아웃(2초).
다만 success 업데이트는 Conn B 커밋 직전에 포함시켜 원자성 확보.
실제 코드

paid-event-creator.js:

paid-event-creator.js
Lines 191-214
async function updateProcessingStatus(eventId, status, lastError = null) {
    let connection = null;
    try {
        connection = await pool.getConnection();
        connection.config.autocommit = true;
        await connection.execute(
            `UPDATE paid_event_processing 
             SET status = ?, 
                 last_error = ?, 
                 processed_at = NOW(), 
                 updated_at = NOW()
             WHERE event_id = ?`,
            [status, lastError, eventId]
        );
        ...
paid-order-processor.js:

paid-order-processor.js
Lines 315-318
// 처리 상태를 'success'로 업데이트 (별도 커넥션, 트랜잭션과 분리)
await updateProcessingStatus(paidEventId, 'success');
→ 현재는 processing, success 둘 다 별도 커넥션(autocommit) 으로 처리.

설계 문서 / 주석

PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION.md 요약(주석):

paid-event-creator.js
Lines 4-11
 * - paid_events는 "결제 증거"로 항상 남겨야 함 (불변: INSERT만, 중복 시 기존 행 참조)
 * - 별도 커넥션(autocommit)으로 먼저 커밋
 * - 이후 주문 처리 트랜잭션과 분리
 * ...
 * - updateProcessingStatus/recordStockIssue: 실패 시 throw (유령 주문 방지)
여기는 paid_events(증거) 의 별도 커넥션만 강하게 규정하고 있고,
paid_event_processing는 “상태 로그” 성격이라 Conn B에 묶을 여지도 있음.
정합성 관점

processing: “지금 이 event를 누가 처리 중이다”라는 상태를
별도 커넥션에서 autocommit으로 남겨 두면, Conn B가 롤백되더라도 “처리 시도 흔적”은 남음.
→ Gemini가 말한 대로 processing을 Conn B에 묶으면 흔적이 사라질 수 있으므로, 별도 커넥션 유지가 더 안전.
success:
Conn B 트랜잭션이 성공(commit)했다면, paid_events + processPaidOrder + orders/invoices 등 실제 비즈니스 상태는 이미 일관된 “성공” 상태.
success 마킹을 Conn B 안에 넣어도, 설계 상 paid_events(증거)는 이미 별도 커넥션에서 커밋된 상태라, Conn B 롤백이 paid_events를 날리지는 않음.
다만 현재 코드에서도 success 업데이트 실패 시 throw를 하고 있고, 이때 Conn B는 이미 끝난 상태이므로 “상태만 실패로 남는” 케이스를 운영자가 리콘으로 처리할 수 있게 설계되어 있음.
판단

processing을 Conn B로 옮기는 것은 더 위험 → Gemini 의견 수용: 별도 커넥션 유지 + getConnection 타임아웃 짧게.
success를 Conn B 커밋 직전에 포함하는 제안은:
이론상 “성공 상태와 비즈니스 상태의 원자성을 높이는” 이득이 있으나,
현재 설계는 success 업데이트 실패 시에도 paid_events + 주문 상태는 진실로 남기고, 리콘/운영자가 다시 상태를 맞추는 방향이라,
굳이 Conn B에 넣지 않아도 정합성은 깨지지 않음.
오히려 “성공 상태 업데이트 실패를 재시도하거나, 별도 모니터링으로 잡아내기” 정의가 필요.
최종

수용:
updateProcessingStatus('processing')는 지금처럼 별도 커넥션 + 짧은 getConnection 타임아웃 유지.
부분 수용:
success를 Conn B에 넣을지는 “운영 정책/모니터링”에 따라 선택. 반드시 그럴 필요는 없고, 현재 설계(별도 커넥션 + 실패 시 throw + 리콘/운영介입)도 논리적으로 일관됨.
3) innodb_lock_wait_timeout 하향 – “per-session만, 그리고 선택적”
Gemini 주장 요약

글로벌 타임아웃 변경은 위험.
SET SESSION innodb_lock_wait_timeout = 10; 으로 결제 세션에서만 타임아웃 10초로 낮추라고 제안.
코드/설정 현실

repo 안에서는 MySQL 서버 설정(my.cnf 등)에 접근할 수 없음.
현재 JS 코드에서도 SET SESSION innodb_lock_wait_timeout를 직접 실행하는 부분은 없음(검색 결과).
즉, 지금은 기본값(보통 50초)일 가능성이 높지만, 이건 코드에서 확인할 수 있는 정보는 아님.
정합성/운영 관점

Gemini 말대로, 전역 설정을 낮추는 건 위험 → 인정.
(결제 외의 관리자 배치/마이그레이션 등에 영향을 줄 수 있음.)
per-session으로 낮추는 것은 이론상 깔끔한 전략이지만:
이 repo 안에서는 현재 아무데도 적용되어 있지 않음.
실제 적용은 “결제 전용 커넥션을 잡자마자 SET SESSION ...을 실행”하는 코드 추가가 필요하고,
그 영향/검증은 운영 환경에서 신중히 해야 함.
최종

수용: “전역 타임아웃 변경은 금지, 필요하면 세션 단위로만 조정”이라는 원칙.
선택적 개선: 현재 코드에는 없으므로, 향후 결제 전용 커넥션 규모/락 분포를 모니터링한 뒤,
정말 필요할 때만 SET SESSION innodb_lock_wait_timeout = 10 같은 옵션을 Conn B 전용 경로에 추가하는 것을 검토.
4) Nginx proxy_read_timeout – “순서” 지적은 100% 수용
Gemini 주장 요약

앱 문제(풀/락)를 그대로 두고 Nginx 타임아웃만 늘리는 건 의미 없음.
먼저 앱 레벨에서 5초 이내 응답 구조를 만들고, 그 다음 예상치 못한 네트워크 지연 대비용으로 90s를 적용하라.
현재 설정

location /api는 proxy_read_timeout 없음 → 60초 기본.
/api/deploy/webhook에서만 proxy_read_timeout 30s; 설정 존재.
판단

우리가 이미 정리한 대로, 우선순위는:
confirm 경로의 모든 풀 획득에 타임아웃 걸기
updateProcessingStatus 등에서 불필요한 풀 사용 줄이기
락 순서·재시도 정책 정리
그 다음에 /api/payments/confirm에만 proxy_read_timeout 90s를 두는 것이 맞음.
따라서 순서에 대한 Gemini 지적은 완전히 수용.
최종

수용: Nginx 타임아웃은 앱 변경(풀/락/타임아웃) 이후에,
“네트워크 지연 대비용 안전망으로만” 조정한다.
5) 체크리스트 항목들
모든 pool.getConnection에 Promise.race 기반 타임아웃
confirm 경로(payments-routes.js, payment-wrapper.js, paid-event-creator.js 등)에서는 그래야 한다 → 수용.
백엔드 전체(관리자 스크립트 포함)의 모든 getConnection을 일괄 래핑할 필요는 없음 → 범위는 "결제 경로"로 한정하는 게 현실적.
paid_events 생성 로직은 Conn B와 물리적으로 분리
이미 그렇고, 이 설계는 절대 유지해야 한다 → 강력 수용.
process.hrtime.bigint() 로그에 pool.freeConnections 포함
payments-routes.js 678–679행에서 이미 내부 필드 _allConnections, _freeConnections를 로그에 찍고 있음.
다만 mysql2의 private 필드이므로, 로깅 용도로만 최소 사용하고,
로직 제어는 connectionLimit / queueLimit / activePaymentCount로 하는 편이 안전.
→ “모니터링용으로만 사용”은 수용, “동작 제어에 의존하라”는 해석은 기각.
stock_units (product_id, status, size, color) 복합 인덱스
재고 조회/락 처리 시간을 줄여서 5초 이내에 도움 되는 건 맞음.
다만 현재 마이그레이션에는 (product_id, status) 수준 인덱스만 있고,
size/color까지 포함하는 인덱스 추가는 별도 DB 마이그레이션 작업이 필요.
→ “도움이 되는 튜닝”으로 수용(선택), 다만 504 근본 원인(풀 대기) 보다는 2순위.
2. 최종 근본 해결 방안 (정제 버전)
A. 풀 획득 타임아웃 (필수)
confirm 라우트 첫 getConnection에 타임아웃 추가

위치: payments-routes.js 162행.
원칙: 3~5초 내에 풀에서 커넥션 못 받으면 즉시 503.
구현 방향:
payment-wrapper.js의 getSafeConnection 패턴과 유사한 래퍼를 하나 만들고,
여기서만 pool.getConnection()에 타임아웃을 적용한 후, 실패 시 503 + “잠시 후 재시도” 메시지.
paid-event-creator의 모든 getConnection에 타임아웃 추가

createPaidEvent / updateProcessingStatus / recordStockIssue
paid_events는 별도 커넥션 유지, 단 획득에만 2~3초 타임아웃.
타임아웃 발생 시에는 상위에서 503/500으로 처리하고, Nginx 60초를 채우지 않게 함.
기타 confirm 경로에서 pool.getConnection 사용하는 곳 정리

§C 재시도, 장바구니 비우기, 이메일용 조회 등
결제 핵심 흐름과 직접 관계 있는 곳은 모두 타임아웃 래퍼를 사용.
B. 상태 업데이트 처리 (설계 보존 + 개선 가능 지점)
paid_events 생성은 그대로 “별도 커넥션 + autocommit” 유지 (설계 고정)

PG에서 돈이 나갔으면, paid_events는 어떤 경우에도 남게 해야 함.
Conn B 실패/rollback과 무관하게, 별도 커넥션에서 가장 먼저 커밋하는 현재 설계는 옳음.
updateProcessingStatus

processing:
지금처럼 별도 커넥션 + 짧은 getConnection 타임아웃 유지.
Conn B 롤백과 분리된 상태 추적을 보장.
success:
현재처럼 별도 커넥션에서 autocommit으로 기록하되,
실패 시 throw → 상위에서 로그 + 리콘/운영介입으로 “상태 불일치”를 복구.
필요하다면, 장기적으로 Conn B 안으로 넣는 것도 고려 가능하지만,
paid_events SSOT는 이미 별도 커넥션에서 보존되므로 필수는 아님.
C. 락/인덱스/DB 레벨
전역 락 계층 준수 및 코드 검증

결제(processPaidOrder): 이미 stock_units → orders → ... 순서.
환불/배송/배달 라우트에서 동일한 락 순서로 잠그는지 코드로 재검증.
데드락/장시간 lock wait를 줄여 confirm 응답을 5초 이내로 유지하는 데 기여.
stock_units 인덱스 추가 (선택)

product_id, status, size, color 복합 인덱스 도입 검토.
대량 트래픽 시 재고 조회·락 시간을 줄여 confirm 전체 시간을 다듬는 역할.
innodb_lock_wait_timeout per-session (선택)

정말 필요할 때만, Conn B 획득 직후 SET SESSION innodb_lock_wait_timeout = 10; 같은 식으로 적용.
전역 설정은 건드리지 않음.
D. 인프라(Nginx)
/api/payments/confirm에만 proxy_read_timeout 확장 (마지막 단계)
앱에서 1~8까지 변경 후, 실제 로그/모니터링으로 confirm 응답이 대부분 5초 이내, worst case도 수십 초 이하인 것을 확인한 뒤:
location /api/payments/confirm에서만 proxy_read_timeout 90s 또는 120s 설정.
다른 /api는 60초 유지 → confirm만 네트워크 구간 지연에 대해 여유를 조금 더 주는 안전망.

---

## 3. Gemini "최종 감별" 피드백 (수용 / 보완 / 기각)

Gemini 결론: "주요 동맥(Confirm Flow)의 혈전 제거됨. 60초 멈춤 없음. 정상 환경에서 5초 이내 결제 달성 가능."

### 3.1 수용할 것

**1) 풀 자가 포식(Pool Starvation) 진압**

- 코드 기준: confirm 진입부·§C 재시도·장바구니·이메일 조회는 모두 `getConfirmConnection()`(5초 타임아웃). paid-event-creator는 `getEventCreatorConnection(2000/3000)`.
- **수용**: 타임아웃 없이 무한정 기다리는 `pool.getConnection()`은 confirm 경로에 없음. 3~5초 내 미획득 시 503으로 종료.

**2) 결제 증거(paid_events) 별도 커넥션 유지**

- payment-wrapper.js·paid-event-creator.js 주석과 동일.
- **수용**: Zero-Trust·증거 우선 설계 유지.

**3) 토스 Fetch 10초 타임아웃**

- payments-routes.js: `TOSS_FETCH_TIMEOUT_MS = 10000`, AbortController로 타임아웃 후 `TOSS_FETCH_TIMEOUT` throw.
- **수용**: PG 지연 시 10초 후 실패·리콘 위임.

**4) 이론적 리스크 대응 상태**

| 리스크 요인 | 내용 | 대응 상태 (코드 기준) |
|-------------|------|------------------------|
| InnoDB 락 대기 | orders/stock_units 경합 시 50초 대기 가능 | 전역 락 순서 준수·hrtime 로그로 추적 가능 |
| DB 물리 한계 | 인덱스 미비·풀스캔·디스크 I/O | stock_units 복합 인덱스 2순위 검토 |
| 네트워크 레이턴시 | 토스 PG 무응답 | 10초 Fetch 타임아웃 적용됨 |

**5) 추가 리팩터링 시점**

- **수용**: 이니시스 등 부차 흐름은 당장 전면 리팩터링 불필요. 운영에서 confirm 응답 시간을 관측한 뒤, 로그 기반으로 인덱스·per-session lock_wait 등 정밀 대응.

**6) 결제 엔진 표준 규격 (선포)**

- **수용**: 아래 §4 "결제 엔진 표준 규격"으로 문서화.

### 3.2 보완·정정할 것

**"부가 작업의 비동기화: 이메일·장바구니가 응답(Response) 이후로 밀려났다"**

- **코드 사실**: payments-routes.js 682~694행 장바구니 비우기는 **res.json() 전**에 동기적으로 실행됨. 다만 실패 시 try/catch로 로그만 남기고 200 유지. 745~756행 이메일은 `sendOrderConfirmationEmail(...).catch(...)` 로 **Fire-and-Forget**이라 **응답을 블로킹하지 않음**.
- **정정**: "응답 이후로 밀려났다"가 아니라, "이메일은 응답을 블로킹하지 않고, 장바구니/이메일 커넥션 실패는 200을 유지한다"가 정확함.

### 3.3 기각할 것

- 없음. 이번 Gemini 최종 감별 내용은 수용·보완 범위 내.

---

## 4. 결제 엔진 표준 규격 (앞으로 추가/변경 시 준수)

- **커넥션 획득**: 결제 관련 라우트(confirm, 취소, 정기결제 등)에서는 **직접 `pool.getConnection()` 호출 금지**. 반드시 `getConfirmConnection()` 또는 `getSafeConnection(signal, timeoutMs)` 등 **표준 타임아웃 헬퍼** 사용.
- **Fast-Fail**: 결제 관련 DB 작업은 **5초 이상 대기하지 않는다**. 대기보다 빠르게 에러(503 등) 후 재시도 유도.
- **로그 기반 의사결정**: `process.hrtime.bigint()` 기반 `duration_ms`(wrapperMs, cartMs, totalMs) 로그를 활용해, 5초 초과 케이스가 관측될 때만 인덱스 튜닝·per-session lock_wait 등 정밀 대응.
- **부가 작업 실패**: 장바구니 비우기·이메일 발송 등 결제 확정 **이후** 부가 작업의 커넥션/API 실패는 사용자에게 503으로 노출하지 않고, 로그·재시도 큐로 처리하고 **200(성공)** 유지.

**로그 모니터링 참고**

- `duration_ms.totalMs` 가 5초를 넘는 케이스가 자주 보이면: DB 락 대기·인덱스·디스크 I/O 점검.
- 503(결제 서버 혼잡) 스파이크: 풀 포화 또는 토스 타임아웃 가능성 → 풀 설정·외부 API 상태 확인.
- 위험 신호가 관측될 때만 서버 스펙 상향·쿼리/인덱스 튜닝을 진행하는 것을 권장.

---

## 정리
수용한 것:

confirm 경로의 모든 getConnection에 짧은 타임아웃을 두어, 풀 스스로를 잠식하는 상황 제거.
paid_events는 반드시 별도 커넥션에서 먼저 커밋(SSOT) – 기존 설계 유지.
Nginx 타임아웃은 앱 수정 후, 안전망으로만 조절.
innodb_lock_wait_timeout은 전역이 아닌 per-session만 고려.
선택/부분 수용:

updateProcessingStatus의 success를 Conn B 안으로 옮길지는 정책/모니터링에 따라 결정 가능.
stock_units 복합 인덱스, per-session lock_wait_timeout 등은 2차 최적화.
버린 것(명확히 선 긋기):

paid_events를 Conn B에 묶어 “결과 반영 단일 트랜잭션”으로 만들자는 흐름은,
결제 증거가 롤백될 수 있어 이 프로젝트의 설계(및 주석)와 정면 충돌 → 채택하지 않음.
이 라인으로 구현하면, 현재 구조(증거 보존, 리콘 가능성)를 그대로 유지하면서, 풀/락으로 인해 60초까지 끌려가는 문제를 제거할 수 있고,
명품 사이트에 요구되는 “5초 이내 결제 완료 또는 즉시 503로 단호하게 실패”라는 UX/아키텍처 목표에도 맞게 정리됩니다.

