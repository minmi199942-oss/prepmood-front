# paid-event-creator 시니어(Gemini) 최종 수정 권장 리스트 — 코드·문서 검증 보고서

**작성 목적**: Gemini가 정리한 "명품 쇼핑몰 수준 안정성" 4가지 수정 권장 사항을, **문서와 실제 코드를 직접 읽어** 검증하고, 우리 환경에서의 정확한 원인·수정 방향을 문서화한다. 추측 없이 코드·공식 동작 기준으로만 기술한다.

**검증 기준**: 15년차 시니어 관점, 토큰 절약 없이 해당 파일·호출 경로 전부 read/grep으로 확인.

---

## 0.1 초기 문서(PAYMENT_CONFIRM_OPTIMIZATION_GEMINI_REVIEW.md)와의 관계

**질문**: 이 수정 방향이 “초기 문서대로 구현한 것”과 같은가? 왜 문서/코드 작성 시 “문제 없냐”고 했을 때 답이 없었고 뒤늦게 고치려 하는가?

**결론**  
- **다른 문서·다른 범위**이다. 초기 문서를 “다르게 구현한” 것이 아니라, **초기 문서가 다루지 않은 레이어**를 후속 검토에서 다룬 것이다.
- 그래서 “초기 문서대로 구현했다”와 “지금 고치는 버그”는 **같은 계약이 아니다**. 초기 문서대로라도, paid-event-creator/getSafeConnection 내부 버그는 그때 검토 대상이 아니었다.

| 구분 | PAYMENT_CONFIRM_OPTIMIZATION_GEMINI_REVIEW.md (초기) | PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION.md (본 문서) |
|------|------------------------------------------------------|--------------------------------------------------------|
| **검토 대상** | confirm **라우트** 설계·계약·이메일 | confirm이 **의존하는 유틸** (paid-event-creator, payment-wrapper) **내부 구현** |
| **커넥션 릭** | “**선 응답 후**” 백그라운드에서 getConnection 쓸 때 try-finally로 release (미래 가이드). 현재는 응답 전 createConnection 사용이라 해당 패턴 미적용. | **풀 획득 자체**에서의 누수: Promise.race·getSafeConnection 타임아웃 시 “나중에 도착한 커넥션”이 release 안 됨 (고아 커넥션). |
| **언급 여부** | paid-event-creator, getSafeConnection, Promise.race, alreadyExists, ODKU **언급 없음** (grep 기준). | 위 유틸 전용 검증. |

- **왜 뒤늦게 드러났는가**  
  - 초기 문서·검토는 “confirm 3단계, cartCleared, 이메일 2회 SELECT”에 맞춰져 있었고, **paid-event-creator / getSafeConnection 내부**(race로 풀 획득, 타임아웃 시 reject 후 커넥션 도착)는 **검토 범위에 포함되지 않았다**.  
  - “문제 없냐”고 물었을 때 확인한 것은 그 초기 3가지와 confirm 플로우일 가능성이 크고, “getConnection()에 race 걸었을 때 나중에 resolve되는 커넥션은 누가 release하나?” 같은 **제어 흐름 단위 검증**은 별도로 이루어지지 않았을 수 있다.  
  - 따라서 **다른 레이어(유틸 내부)**를 나중에 Gemini 2차·Cursor 검증에서 짚으면서 새로 발견된 것으로 보는 것이 맞다. “초기 문서를 어겼다”가 아니라 “초기 문서가 그 레이어를 다루지 않았다”이다.

**정리**  
- **문서대로 수정하는 건 맞다.** 단, 그 “문서”는 **본 검증 문서(PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION.md)**의 수정 권장이며, 초기 문서(PAYMENT_CONFIRM_OPTIMIZATION_GEMINI_REVIEW.md)의 3가지( Fire-and-Forget 대비, cartCleared, 이메일)와는 **별개 레이어**이다.  
- 초기 문서 권장(이메일용 orderInfo 확장, cartCleared 정리, 선 응답 후 처리 시 try-finally)은 **그대로 적용 대상**이고, 본 문서의 수정(race 제거, alreadyExists, silent failure, rawPayload, getSafeConnection 고아 회수)은 **추가로 적용할 유틸 레벨 버그 수정**이다.

---

## 0. 검증에 사용한 소스

  | 구분 | 경로 / 내용 |
  |------|-------------|
  | paid_events 생성·상태 | `backend/utils/paid-event-creator.js` 전편 |
  | 풀 설정 | `backend/db.js` (createPool 옵션) |
  | 테이블 DDL | `backend/migrations/024_create_paid_events_table.sql` |
  | createPaidEvent 호출 | `backend/payments-routes.js` (426, 1005, 1633행), `payment-wrapper.js` 연동 (processOrderFn 내부) |
  | updateProcessingStatus/recordStockIssue 호출 | `backend/utils/paid-order-processor.js` (174, 251, 306, 703, 802~809행) |
  | 안전 커넥션 획득 | `backend/utils/payment-wrapper.js` getSafeConnection (71~101행) |
  | MySQL ODKU 동작 | MySQL 8.4 Reference Manual, C API mysql_affected_rows() |
  | mysql2 풀 옵션 | 공식 문서·웹 검색 (createPool 옵션) |

  ---

  ## 1. [치명적] 커넥션 누수 — Promise.race 제거

  ### 1.1 Gemini 요지

  - `Promise.race`로 타임아웃을 걸면, 앱만 먼저 reject하고 `pool.getConnection()`은 나중에 resolve할 수 있음.
  - 그때 받은 커넥션을 아무도 참조하지 않으므로 `release()`가 호출되지 않아 **풀 누수(좀비 커넥션)** 발생 → 서버가 서서히 고갈.

  ### 1.2 실제 코드 확인

  **paid-event-creator.js 46~50행:**

  ```javascript
  connection = await Promise.race([
      pool.getConnection(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('POOL_ACQUIRE_TIMEOUT')), POOL_ACQUIRE_TIMEOUT_MS))
  ]);
  ```

  - 3초 안에 커넥션이 오지 않으면 `POOL_ACQUIRE_TIMEOUT`으로 reject.
  - 이때 `pool.getConnection()`은 **취소되지 않고** 대기열에 남아 있다가, 나중에 커넥션이 할당되면 그 Promise만 resolve됨.
  - 호출부는 이미 reject된 상태이므로 그 커넥션을 받을 곳이 없고, **release()가 호출되지 않음** → 검증 결과 **지적 타당**.

  ### 1.3 우리 환경에서의 정정 사항

  - Gemini 제안: "mysql2의 waitForConnections, connectionLimit, queueLimit 또는 **acquireTimeout** 활용."
  - **실제**: mysql2 공식 `createPool` 옵션에는 **acquireTimeout이 없음**. (서드파티 래퍼 `mysql2-timeout`에서는 지원.)
  - **db.js 현재 설정**: `waitForConnections: true`, `connectionLimit`, `queueLimit` 이미 사용 중 (15~24행).

  ### 1.4 수정 방향 (원인·해결)

  | 항목 | 내용 |
  |------|------|
  | 원인 | 타임아웃 구현을 Promise.race로 해서, reject 후에도 getConnection()이 나중에 성공하면 해당 커넥션을 반환받을 주체가 없음. |
  | 해결 | **Promise.race 제거.** `connection = await pool.getConnection();` 만 사용. 풀 고갈 시에는 `queueLimit` 초과로 즉시 에러가 나도록 이미 설정되어 있음. |
  | 대안 | 정말 “획득 시간 제한”이 필요하면: (1) mysql2-timeout 같은 래퍼 사용, 또는 (2) 타임아웃 시 “나중에 getConnection()이 resolve되면 그 conn을 받아서 release()만 호출”하는 패턴으로 누수만 제거 (구현 복잡도 증가). |

  ---

  ## 2. [버그] alreadyExists 로직 수정

  ### 2.1 Gemini 요지

  - ON DUPLICATE KEY UPDATE가 실행되어 `confirmed_at`이 바뀌면 **affectedRows는 2**.
  - 현재는 `affectedRows === 0`만 이미 존재로 보고 있어, 대부분의 중복 케이스에서 `alreadyExists`가 false로 나감.

  ### 2.2 MySQL 공식 동작 (검증 근거)

  - INSERT ... ON DUPLICATE KEY UPDATE 시 **affected-rows 의미**:
    - **1**: 새 행 삽입
    - **2**: 기존 행이 UPDATE로 변경됨
    - **0**: 기존 행이 있으나 UPDATE 결과 값이 동일해 실제 변경 없음 (no-op)

  (MySQL 8.4 Reference Manual, C API mysql_affected_rows() 및 INSERT ... ON DUPLICATE KEY UPDATE 문서.)

  ### 2.3 실제 코드 확인

  **paid-event-creator.js 79~82행:**

  - ODKU에서 `event_id = LAST_INSERT_ID(event_id)`, `confirmed_at = NOW()` 로 업데이트하므로, 중복 시 **실제로 값이 바뀌는 경우가 대부분** → affectedRows는 보통 **2**.

  **paid-event-creator.js 116~118행:**

  ```javascript
  return {
      eventId,
      alreadyExists: paidEventResult.affectedRows === 0 // ON DUPLICATE KEY UPDATE 시 affectedRows는 0
  };
  ```

  - 주석 "ON DUPLICATE KEY UPDATE 시 affectedRows는 0"은 **일반적인 경우에 틀림**. 0은 “변경 없음”일 때만 해당.
  - 따라서 **대부분의 중복에서는 alreadyExists가 false**가 됨 → 버그 확인.

  **호출부 (payments-routes.js 1020, 1644행 등):**

  - `if (paidEventResult.alreadyExists)` 로 로그 등 멱등 처리에 사용. alreadyExists가 잘못 false면 중복 요청을 “신규”처럼 취급할 수 있음.

  ### 2.4 수정 방향 (원인·해결)

  | 항목 | 내용 |
  |------|------|
  | 원인 | ODKU 시 affectedRows는 보통 2(또는 0)인데, 0만 “이미 존재”로 판단함. |
  | 최소 수정 | `alreadyExists: paidEventResult.affectedRows !== 1` (1이면 신규 삽입, 2 또는 0이면 “이미 존재” 또는 “업데이트만 됨”). |
  | 대안 (증거 불변성) | ODKU 제거 후 **INSERT만** 수행하고, `ER_DUP_ENTRY`면 SELECT로 기존 `event_id` 조회 후 `{ eventId, alreadyExists: true }` 반환. 이렇게 하면 “증거 덮어쓰기” 없이 동일 (order_id, payment_key) 재요청 시 기존 행만 참조. |

  ---

  ## 3. [정합성] Silent Failure 제거 — 에러 전파

  ### 3.1 Gemini 요지

  - "상태 업데이트 실패는 치명적이지 않다"고 보고 catch에서 throw를 하지 않으면, **상태 기록 실패(DB 연결 이상 등)를 무시한 채** 다음 로직(주문 완료 등)이 진행될 수 있음.
  - 그 결과 **paid_event_processing은 pending/processing인데 주문은 성공**인 “유령 주문” 형태의 정합성 깨짐가 발생할 수 있음.

  ### 3.2 실제 코드 확인

  **paid-event-creator.js updateProcessingStatus (221~255행):**

  ```javascript
  } catch (error) {
      Logger.error('[PAID_EVENT_CREATOR] 처리 상태 업데이트 실패', { ... });
      // 상태 업데이트 실패는 치명적이지 않으므로 에러를 던지지 않음
  } finally {
      if (connection) connection.release();
  }
  ```

  - 실패 시 **throw 없음** → 호출부는 성공으로 인식.

  **paid-event-creator.js recordStockIssue (264~295행):**

  - 동일하게 catch에서 로그만 하고 **throw 없음**.

  **호출부 paid-order-processor.js:**

  - 174행: `await updateProcessingStatus(paidEventId, 'processing');` — 실패해도 예외 없이 다음 단계 진행.
  - 703행: `await updateProcessingStatus(paidEventId, 'success');` — 실패해도 반환값으로 성공 반환.
  - 802~809행: catch에서 `updateProcessingStatus(paidEventId, 'failed', ...)` 호출 후, 그게 실패하면 "무시하고 계속 진행" 로그만 하고 **원래 에러만 rethrow**.

  따라서:

  - 703에서 상태를 'success'로 바꾸는 데 실패해도, 주문 처리 자체는 성공으로 끝나고 응답이 나감.
  - 이때 DB/네트워크 이상으로 상태 업데이트만 실패했다면, **processing 상태는 그대로인데 주문은 완료**되는 정합성 오류 가능 → 검증 결과 **지적 타당**.

  ### 3.3 수정 방향 (원인·해결)

  | 항목 | 내용 |
  |------|------|
  | 원인 | updateProcessingStatus(및 recordStockIssue)가 실패 시 에러를 삼키고, 호출부가 실패를 인지하지 못함. |
  | 해결 | updateProcessingStatus, recordStockIssue에서 catch 시 **Logger 호출 후 `throw error`** 로 전파. |
  | 호출부 | paid-order-processor.js는 이미 703 직후가 try 블록 안이고, catch에서 롤백·재고 해제·failed 상태 기록 후 rethrow하고 있음. 따라서 두 함수가 throw하도록 바꿔도, 703에서 상태 업데이트 실패 시 catch로 들어가 롤백·실패 처리·rethrow 되므로 **데이터 정합성 측면에서 올바른 동작**으로 정렬됨. 802~809의 “updateProcessingStatus 실패 시 무시”는, 실패 시 throw로 바꾸면 “실패 시 예외 전파”로 통일 가능. |

  ---

  ## 4. [성능/보안] rawPayload 사전 처리

  ### 4.1 Gemini 요지

  - 재시도 루프 안에서 매번 `JSON.stringify(rawPayload)` 호출 → 자원 낭비.
  - 크기 제한이 없으면 과대 payload로 DB/네트워크 부하 또는 악용 가능.

  ### 4.2 실제 코드 확인

  **paid-event-creator.js 44~84행:**

  - `for (let attempt = 1; attempt <= maxRetries; attempt++)` 루프 안, 75~83행에서:
    - `rawPayload ? JSON.stringify(rawPayload) : null` 을 **매 시도마다** execute 인자로 전달.
  - 루프 밖에서는 한 번도 stringify하지 않음.

  **024_create_paid_events_table.sql:**

  - `raw_payload_json JSON` — MySQL JSON 타입. 실질적으로 행/패킷 크기 제한은 있으나, 애플리케이션 단에서 상한을 두지 않음.

  ### 4.3 수정 방향 (원인·해결)

  | 항목 | 내용 |
  |------|------|
  | 원인 | (1) JSON.stringify를 재시도마다 수행, (2) payload 크기 상한 미설정. |
  | 해결 | (1) **루프 밖에서 한 번만** `const payloadString = rawPayload ? JSON.stringify(rawPayload) : null;` (또는 크기 제한 적용 후 변수) 계산하여 루프 안에서는 그 변수만 사용. (2) 크기 제한: 예) 64KB 초과 시 substring(0, 65535) 또는 에러 처리로 방어. |

  ---

  ## 5. 추가 발견: payment-wrapper.js getSafeConnection의 동일한 누수 패턴

  ### 5.1 코드 확인

  **payment-wrapper.js getSafeConnection (71~101행):**

  - `setTimeout(() => reject(new Error('CONN_TIMEOUT')), timeoutMs)` 와 `pool.getConnection()` 을 **동시에** 사용.
  - 타이머가 먼저 만료되면 `reject('CONN_TIMEOUT')`으로 Promise가 끝남.
  - 이때 **pool.getConnection()은 취소되지 않음**. 나중에 커넥션이 할당되면 `.then((conn) => { ... resolve(conn); })` 가 실행되지만, 이미 상위 Promise는 reject로 settle 된 상태이므로 `resolve(conn)`은 효과가 없음.
  - 그 **conn은 아무도 받지 않고**, release()도 호출되지 않음 → **paid-event-creator와 동일한 “타임아웃 시 좀비 커넥션”** 발생.

  **abort 시:**  
  `signal.aborted`일 때는 `conn.release()` 후 reject 하므로 누수 없음. **타임아웃(CONN_TIMEOUT) 경로에서만 누수.**

  ### 5.2 수정 방향

  - 타임아웃 시에도 **나중에 getConnection()이 성공하면 그 conn을 받아서 release()만 호출**하는 식으로 처리하거나, 타임아웃을 쓰지 않고 `queueLimit` 등으로 “대기 초과 시 즉시 실패”만 사용하는 설계로 통일하는 것이 안전함.
  - 이 부분은 paid-event-creator의 Promise.race 제거와 함께 “풀 획득 + 타임아웃” 패턴 전반을 정리할 때 함께 다루는 것을 권장.

  ---

  ## 6. 요약 표 (검증 결과·원인·수정 방향)

  | # | 항목 | Gemini/시니어 지적 | 코드·문서 검증 | 우리 환경 정정 | 수정 방향 |
  |---|------|-------------------|----------------|----------------|------------|
  | 1 | 커넥션 누수 | Promise.race 제거 | **타당** — race로 reject 후 getConnection()이 나중에 성공하면 해당 conn 미반환 → release 없음 | mysql2에는 **acquireTimeout 없음** (queueLimit 등만 사용 가능) | race 제거, `await pool.getConnection()` 만 사용. 필요 시 래퍼 또는 “타임아웃 시 나중에 conn 받아서 release” 패턴 |
  | 2 | alreadyExists | affectedRows !== 1 또는 INSERT + ER_DUP_ENTRY | **타당** — ODKU 시 affectedRows는 보통 2(또는 0), 현재는 0만 봄 → 대부분 중복에서 false | - | `alreadyExists: affectedRows !== 1` 또는 INSERT 전용 + ER_DUP_ENTRY 시 SELECT 반환 |
  | 3 | Silent failure | 상태 업데이트 실패 시 throw | **타당** — updateProcessingStatus/recordStockIssue가 catch 후 throw 안 함 → 유령 주문 가능성 | processor는 이미 try/catch로 롤백·rethrow 구조 | 두 함수에서 catch 후 `throw error` 추가; processor는 변경 최소화 |
  | 4 | rawPayload | 루프 밖 1회 stringify, 크기 제한 | **타당** — 루프 안에서 매번 stringify, 크기 제한 없음 | - | 루프 밖에서 1회 stringify, 64KB 등 상한 적용 |

  **추가 발견:** payment-wrapper.js `getSafeConnection`에서 타임아웃(CONN_TIMEOUT) 시 동일한 풀 누수 가능. race/타임아웃 패턴 전반 점검 권장.

  ---

  ## 7. 참고 — 확인한 파일·라인

  - `backend/utils/paid-event-creator.js`: 46~50(race), 75~83(ODKU·rawPayload), 116~118(alreadyExists), 221~255(updateProcessingStatus), 264~295(recordStockIssue)
  - `backend/db.js`: 14~28(pool 설정)
  - `backend/migrations/024_create_paid_events_table.sql`: raw_payload_json JSON
  - `backend/utils/paid-order-processor.js`: 174, 703, 802~809
  - `backend/utils/payment-wrapper.js`: 71~101(getSafeConnection)
  - `backend/payments-routes.js`: 426, 1005, 1633(createPaidEvent), 1020, 1644(alreadyExists 사용)

---

## 8. Gemini "Prepmood 기술 부채 청산 가이드" 검토 (2차)

**대상**: Gemini가 제시한 1) 좀비 커넥션 박멸, 2) 불변성 기반 결제 증거(INSERT+ER_DUP_ENTRY), 3) paid-event-creator.js 개선안 코드, 4) payment-wrapper.js 고아 프로미스 핸들링 아이디어.  
**방법**: 제안된 코드·전략을 **우리 실제 스키마·코드와 대조**하여 타당 여부와 **제안 코드 내 버그·누락**을 문서화.

---

### 8.1 [Infrastructure] 좀비 커넥션 박멸 전략

**Gemini 요지**: queueLimit 활용 + (타임아웃이 꼭 필요하면) “늦게 온 커넥션을 받아서 즉시 release” 패턴.

**검증 결과**  
- **타당.** 기존 검증 보고서 §1, §5와 일치.
- **우리 db.js**: 이미 `queueLimit: 200`, `waitForConnections: true` 사용 중. 타임아웃 없이 `pool.getConnection()`만 쓰면 queue 초과 시 즉시 에러로 fail-fast 가능.

---

### 8.2 [Data] 불변성 기반 결제 증거 — INSERT + ER_DUP_ENTRY

**Gemini 요지**: ODKU 제거, INSERT만 시도 후 `ER_DUP_ENTRY` 시 SELECT로 기존 event_id 반환 (Try-Insert-Then-Select).

**검증 결과**  
- **타당.** 기존 §2 “대안”과 동일. 증거 행을 수정하지 않아 불변성 확보.

**주의**  
- 현재 코드는 ODKU 사용으로 **ER_DUP_ENTRY가 발생하지 않음**. ODKU 제거 후 INSERT만 하면 중복 시 ER_DUP_ENTRY가 발생하므로, 해당 분기만 그때부터 실제 사용됨.

---

### 8.3 [Refactoring] paid-event-creator.js 개선안 코드 검토

Gemini가 제시한 `createPaidEvent` / `updateProcessingStatus` 구조를 **우리 DDL·기존 동작과 비교**한 결과.

#### 8.3.1 createPaidEvent 제안 코드에서의 문제점

| 항목 | 내용 |
|------|------|
| **1. 이중 release** | 제안 구조: 외부 `try { connection = await pool.getConnection(); try { ... } catch (dbError) { ... throw dbError; } } catch (error) { if (connection) connection.release(); ... } finally { if (connection) connection.release(); }`. inner catch에서 `throw dbError` 시 **외부 catch에서 한 번, finally에서 한 번** release 호출 → **이중 release**. mysql2 풀에서 이중 release는 정의되지 않은 동작·경고 유발 가능. **수정**: release는 **finally 한 곳에서만** 수행. catch 블록에서는 release 제거. |
| **2. paid_event_processing INSERT** | 제안: `INSERT IGNORE INTO paid_event_processing (event_id, status) VALUES (?, 'pending')`. **우리 DDL (033)**: `created_at`, `updated_at`에 DEFAULT 있음 → 컬럼 생략 가능. 다만 기존 코드는 `(event_id, status, created_at, updated_at) VALUES (?, 'pending', NOW(), NOW())` 사용. 제안대로 (event_id, status)만 넣어도 스키마상 문제 없음. |
| **3. autocommit** | 현재 구현은 `connection.config.autocommit = true` 설정. 제안 코드에는 없음. **유지 필요**: paid_events는 별도 커넥션으로 “먼저 커밋”하는 설계이므로 autocommit 설정 추가할 것. |
| **4. Logger 호출** | 제안 코드에는 Logger 호출이 생략됨. 운영 추적을 위해 기존처럼 INSERT 시도/성공/ER_DUP_ENTRY 등 로그는 유지 권장. |

#### 8.3.2 updateProcessingStatus 제안 코드에서의 누락

**현재 코드 (paid-event-creator.js 228~236행):**

```sql
UPDATE paid_event_processing
SET status = ?, last_error = ?, processed_at = NOW(), updated_at = NOW()
WHERE event_id = ?
```

**Gemini 제안:**

```sql
UPDATE paid_event_processing SET status = ?, last_error = ?, updated_at = NOW() WHERE event_id = ?
```

- **processed_at 누락.** 우리 DDL(033)에는 `processed_at DATETIME NULL`이 있으며, 기존 코드는 success/failed 시 `processed_at = NOW()`로 “처리 완료 시각”을 기록함. **제안대로 적용 시 processed_at이 갱신되지 않음** → 모니터링·진단 스크립트(예: check_order_processing_pipeline.sql)에서 processed_at에 의존하면 동작이 달라짐. **수정**: UPDATE에 `processed_at = NOW()` 유지.

---

### 8.4 [Next Step] payment-wrapper.js 고아 프로미스 핸들링

**Gemini 제안 (요지):**

```javascript
let connectionPromise = pool.getConnection();
let timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 3000));
try {
    const conn = await Promise.race([connectionPromise, timeoutPromise]);
    return conn;
} catch (err) {
    if (err.message === 'TIMEOUT') {
        connectionPromise.then(conn => conn.release()).catch(() => {});
    }
    throw err;
}
```

**검증 결과**  
- **방향 타당.** 타임아웃으로 reject 된 뒤 나중에 getConnection()이 resolve되면 그 conn을 받아 release하는 “고아 커넥션 회수” 패턴이 맞음.

**우리 getSafeConnection(71~101행)과의 차이·보완 사항**  
- 현재 구현은 **AbortSignal(signal)** 도 사용: `signal.aborted` 시 `CLIENT_ABORTED`로 reject. 이때도 **아직 커넥션을 받기 전**이면 pool.getConnection()은 여전히 pending이라, 나중에 conn이 오면 아무도 받지 않아 **동일한 좀비 누수** 발생.
- 따라서 **reject가 나는 모든 경로**(TIMEOUT뿐 아니라 **CLIENT_ABORTED**)에서 “나중에 connectionPromise가 resolve되면 conn.release()”를 붙여야 함.
- 구현 시: `connectionPromise`를 변수로 두고, **reject하는 모든 분기**(timer 만료, abort 핸들러)에서 `connectionPromise.then(conn => conn.release()).catch(() => {})` 호출. 단, **이미 conn을 받아 resolve한 뒤**에 abort가 나온 경우는 기존처럼 `conn.release()` 후 reject하므로, “아직 conn이 없을 때만” 고아 핸들러 부착이 필요함.

**정리**  
- Gemini의 TIMEOUT 시 `.then(conn => conn.release()).catch(() => {})` 부착은 **올바른 해결**.
- 우리 코드는 **CLIENT_ABORTED 경로**에도 동일한 회수 로직을 적용해야 하며, getSafeConnection 전체를 `connectionPromise` 변수 + reject 시 공통 회수 로직으로 재구성하는 것이 안전함.

---

### 8.5 요약 — 가이드 수용 시 반영할 사항

| 구분 | Gemini 제안 | 검증 결과 | 반영 시 조치 |
|------|-------------|----------|--------------|
| 인프라 | queueLimit + 필요 시 “늦게 온 conn release” | 타당 | paid-event-creator는 race 제거; wrapper는 아래 패턴 적용 |
| 데이터 | INSERT + ER_DUP_ENTRY → SELECT | 타당 | ODKU 제거 후 해당 분기 사용 |
| createPaidEvent 구조 | 제안 코드 | **이중 release 버그** | release는 **finally 한 곳만**; autocommit·Logger 유지; paid_event_processing INSERT는 (event_id, status) 가능 |
| updateProcessingStatus | 제안 UPDATE문 | **processed_at 누락** | `processed_at = NOW()` 유지 |
| getSafeConnection | TIMEOUT 시 connectionPromise.then(conn=>release) | 타당 | **CLIENT_ABORTED 시에도** 동일 회수 부착; connectionPromise 변수로 두고 reject 모든 경로에서 회수 |

---

## 9. "타임아웃으로 결제 실패"와 본 수정의 관계

**질문**: 이 방향으로 수정하면 타임아웃으로 인한 결제 실패의 **근본 원인**이 해결되는가, 아니면 별개 문제인가?

**결론 요약**  
- **풀 누수(좀비 커넥션)** 가 원인이었던 타임아웃성 실패 → 이 수정으로 **근본 원인 제거**에 기여한다.  
- **“N초 안에 커넥션 못 받으면 포기”** 로 인한 실패 → 수정 후 **그 종류의 실패는 사라지거나 형태가 바뀐다** (더 기다리거나, queue full로 즉시 실패).  
- **토스 API·워치독 등 다른 타임아웃** → 본 수정과 **별개**이다. DB 커넥션 관리만으로는 해결되지 않는다.

---

### 9.1 결제 경로에서 발생할 수 있는 타임아웃 (코드 기준)

| 구분 | 위치 | 조건 | 사용자 관점 |
|------|------|------|-------------|
| **POOL_ACQUIRE_TIMEOUT** | paid-event-creator.js | 풀에서 3초 안에 커넥션 못 받음 (재시도 3회 후) | 결제 처리 실패 |
| **CONN_TIMEOUT** | payment-wrapper.js getSafeConnection | Conn A 3초 / Conn B 5초 안에 커넥션 못 받음 | 결제 실패, fallback `TIMEOUT_WAITING` (316~317행) |
| **WATCHDOG_TIMEOUT** | payment-wrapper.js | 전체 시도 40초 초과 | 결제 실패, `TIMEOUT_WAITING` |
| **TOSS_FETCH_TIMEOUT** | payments-routes.js | 토스 Confirm API 10초 초과 | 결제 실패, `TIMEOUT_WAITING` |

---

### 9.2 본 수정이 다루는 것 (근본 원인·실패 형태)

1. **풀 누수 제거**  
   - race/타임아웃으로 “포기”할 때마다 나중에 도착한 커넥션이 release되지 않아 **풀이 서서히 고갈**됨.  
   - 고갈된 풀에서는 새 요청이 커넥션을 받기까지 오래 걸리거나 받지 못함 → **CONN_TIMEOUT / POOL_ACQUIRE_TIMEOUT 발생 가능성 증가**.  
   - **수정**: race 제거 또는 “늦게 온 커넥션 즉시 release” 적용 시, **누수가 사라져 풀 고갈이 완화**됨.  
   - 따라서 **“풀 고갈이 원인이었던 타임아웃성 결제 실패”** 는 본 수정으로 **근본 원인이 제거**된다고 볼 수 있다.

2. **“N초 초과 시 포기” 제거 (paid-event-creator)**  
   - 현재: 3초 안에 커넥션 못 받으면 `POOL_ACQUIRE_TIMEOUT` → 재시도 후 최종 실패.  
   - 수정(race 제거): “3초에서 포기”하지 않고, 풀의 대기열(queueLimit) 범위 안에서 **커넥션이 나올 때까지 대기**하거나, queue 초과 시 **즉시 에러**.  
   - 결과: **POOL_ACQUIRE_TIMEOUT으로 인한 결제 실패는 사라짐**. 대신 “조금 더 기다려서 성공”하거나, “queue full로 빠른 실패”가 됨.

3. **getSafeConnection 고아 커넥션 회수**  
   - CONN_TIMEOUT 시에도 나중에 도착한 커넥션을 release하므로, **같은 누수 제거 효과** → 풀 고갈 완화 → CONN_TIMEOUT 발생 가능성 감소.

---

### 9.3 본 수정으로 해결되지 않는 타임아웃 (별개 문제)

| 원인 | 설명 |
|------|------|
| **토스 API 지연/타임아웃** | Confirm 호출이 10초를 넘기면 TOSS_FETCH_TIMEOUT. 네트워크·PG 측 이슈. DB 풀/커넥션 수정과 무관. |
| **전체 처리 시간 40초 초과** | WATCHDOG_TIMEOUT. processOrderFn(createPaidEvent + processPaidOrder 등) 전체가 40초 넘으면 발생. DB만 빠르게 해도 다른 구간(토스, CPU 등)에서 지연되면 별도 조치 필요. |
| **순수 부하** | 동시 결제가 매우 많아서 queueLimit·connectionLimit에 계속 걸리는 경우. “누수”가 아니라 용량 설계·스케일 이슈. |

---

### 9.4 정리

- **타임아웃으로 결제가 실패하는 현상**이  
  - **풀 누수로 풀이 말라서** 커넥션을 못 받는 경우라면 → 이번 수정이 **근본 원인 제거**에 해당한다.  
  - **“3초/5초 안에 못 받으면 포기”** 때문이라면 → 수정 후 그 **포기 조건이 제거**되므로, 그 종류의 실패는 없어지거나(queue 대기·queue full 등으로 형태만 바뀜) 줄어든다.  
- **토스 10초 타임아웃, 40초 워치독, 순수 부하** 등은 **별도 원인**이므로, 본 문서의 DB·커넥션 수정만으로는 해결되지 않는다. 원인별로 로그/메트릭으로 구분해 추가 대응이 필요하다.

---

## 10. 구현 반영 (2025-03 적용)

아래 수정이 코드에 반영됨.

| 항목 | 반영 파일 | 반영 내용 |
|------|-----------|-----------|
| Promise.race 제거 | paid-event-creator.js | `pool.getConnection()` 만 사용. queueLimit으로 fail-fast. |
| INSERT + ER_DUP_ENTRY | paid-event-creator.js | ODKU 제거. INSERT만 수행, ER_DUP_ENTRY 시 동일 conn으로 SELECT 후 `{ eventId, alreadyExists: true }` 반환. |
| rawPayload 1회·64KB | paid-event-creator.js | 루프 밖 `payloadString = rawPayload ? JSON.stringify(...).substring(0, 65535) : null` 사용. |
| updateProcessingStatus throw | paid-event-creator.js | catch 시 Logger 호출 후 `throw error`. UPDATE에 `processed_at = NOW()` 유지. |
| recordStockIssue throw | paid-event-creator.js | catch 시 Logger 호출 후 `throw error`. |
| getSafeConnection 고아 회수 | payment-wrapper.js | `connectionPromise` 변수로 두고, 타임아웃·abort 핸들러에서 `releaseOrphanConnection(connectionPromise)` 호출 후 reject. |

호출부(payments-routes.js, paid-order-processor.js)는 기존 시그니처(`{ eventId, alreadyExists }`, updateProcessingStatus/recordStockIssue throw)에 맞춰 동작하므로 변경 없음.

---

*§0~§9는 검증·원인·수정 방향 문서이며, §10은 위 방향에 따른 실제 구현 반영 요약이다.*
