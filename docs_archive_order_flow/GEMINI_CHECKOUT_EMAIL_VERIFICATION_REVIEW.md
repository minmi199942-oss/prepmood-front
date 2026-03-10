## Gemini 피드백 검토 — 이메일 인증·체크아웃 설계 (코드 대조)

### 1. 개요

- **대상**: 체크아웃 이메일 인증 UI·설계에 대한 Gemini 최종 피드백 (멀티탭, 자원 고갈, `resetEmailVerificationUI`, 에러 코드, 포커스, 중복 요청 등).
- **방법**: `checkout-script.js`, `backend/order-routes.js`, `backend/db.js` 등을 직접 확인해, 맞는 말·과장·오해를 구분하고, 우리가 받아들일/버릴/보완할 부분만 정리함.
- **원칙**: **받아들일 부분은 받아들이고, 코드와 안 맞는 부분은 버리고, 우리 환경에 맞게 보완할 부분만 남긴다.** (이 문서는 설계/리뷰용으로만 작성하며, 이 단계에서는 실제 코드 변경을 포함하지 않는다.)

---

### 2. Gemini 지적 항목별 검토 (코드 대조)

#### 2-1. 멀티탭/멀티 디바이스 정합성 (Race Condition)

- **Gemini 요지**  
  - `sessionStorage` 는 탭 단위라, 한 탭에서 인증해도 다른 탭은 여전히 “인증 전”이거나, 한쪽이 만료·리셋돼도 다른 탭 UI는 그대로 남는다.

- **실제 코드·구조**  
  - `checkout-script.js` 에서 이메일 인증 상태는 아래 두 함수로만 관리된다.
    - `getCheckoutEmailVerified()` / `setCheckoutEmailVerified()` 는 `sessionStorage.getItem/setItem('checkoutEmailVerified', ...)` 만 사용.
  - `sessionStorage` 는 **브라우저 탭·창 단위로 격리**되므로, 서로 다른 탭 간 인증 상태 공유는 애초에 없다.

- **평가**  
  - **원칙적으로 맞는 말**: 멀티탭에서는 탭 간 상태 불일치 가능성이 있다.
  - **현재 스코프**: 우리가 지금 해결하려는 문제는 **“한 탭 안에서 30분 만료 후 UI가 풀리지 않는 버그”** 이고, 멀티탭 상태 동기화는 별도 이슈다.
  - **Heartbeat / Pre-check API 제안**:  
    - 설계 옵션으로 가치는 있으나, 이번 버그 수정 범위에는 포함하지 않는다.

- **정리 (문서 결론)**  
  - 멀티탭 환경에서의 인증 상태 동기화는 **향후 필요 시** 서버 상태(Heartbeat/Pre-check API 등)와 동기화하는 방향을 별도 검토한다.  
  - 이번 문서에서는 “단일 탭 내 TTL 만료 후 UI/상태 불일치” 문제에 집중한다.

---

#### 2-2. “UX 필터” 정의와 서버 자원 고갈 (Resource Exhaustion)

- **Gemini 요지**  
  - 이메일 인증을 “보안 게이트”가 아닌 단순 “UX 레이어”로 두고 `/api/orders` 에서 인증 검증을 생략하면, 공격자가 인증을 우회해 수만 건의 주문 요청을 보내 자원 고갈(커넥션 부족)로 서비스가 다운될 수 있다.
  - Prepmood는 커넥션 풀을 사용하지 않는다고 가정하고, `/api/orders` 최상단에서 **서버 측 이메일 인증 여부를 먼저 검사**해, 미인증 요청은 DB 조회 없이 403으로 Early Return 할 것을 요구한다.

- **실제 코드·구조**  
  - **커넥션 풀 사용 여부**
    - `backend/db.js` 에서 `mysql.createPool` 로 `pool` 을 생성하고, `payments-routes.js` 의 `confirm` 경로 등에서 `pool.getConnection()` 을 사용하고 있다.
    - 반면 `backend/order-routes.js` 의 주문 생성 라우트는 `mysql.createConnection(dbConfig)` 를 직접 호출한다.
    - 즉, “프로젝트 전반에 커넥션 풀이 없다”는 전제는 틀리고, **“주문 생성(/api/orders)은 여전히 요청당 createConnection 패턴을 쓴다”** 가 정확하다.
  - **주문 생성 흐름** (`order-routes.js`)  
    - 주문 생성 핸들러 초반부:
      - `connection = await mysql.createConnection(dbConfig);` 호출 후,  
      - 비회원이면 `generateUniqueGuestId(connection, ...)` (DB 접근),  
      - idempotency 키 조회(`orders_idempotency` 테이블 조회) 등 **여러 DB 작업**이 수행된다.
      - 그 뒤에야 `validateOrderRequest(req)` 로 요청 body 스키마를 검증한다.
    - `validateOrderRequest()` 함수는 **DB 작업 없이**, `items`, `shipping` 구조·이메일 형식·주소 길이 등만 검증한다.
  - **이메일 인증 여부**  
    - 현재 `/api/orders` 에서는 “이메일 인증 여부(email_verified)”를 필수 조건으로 검사하지 않는다.
    - 이메일은 형식·길이·도메인 패턴만 서버 측에서 검증된다.

- **평가**  
  - **자원 고갈 우려** 자체는 타당하다. 주문 생성 경로가 여전히 `createConnection` 기반인 이상, 대량 요청에 취약할 수 있다.
  - 다만 **“이메일 인증을 주문 생성의 필수 보안 게이트로 둘지”는 비즈니스·보안 정책**이다.
    - 비회원 주문 중심, 이메일 인증을 “연락 가능한 주소 확보 + 오입력 방지 + UX 필터”로만 사용할 수도 있다.
  - “UX 필터라서 공격자에게는 무의미하다”는 지적은 **원칙적으로 맞지만**,  
    - 우리 시스템은 이미 결제/주문 보안을 `paid_events`, `paid_event_processing`, `orders`, `warranties`, `stock_units` 등의 서버 로직·테이블에서 별도로 관리한다.
    - 이메일 인증을 **금액·소유권의 최종 보안 판정**으로 쓰지 않는 것은 “보안 위반”이라기보다는 현재 비즈니스 선택이다.

- **정리 (문서 결론)**  
  - 현재 `/api/orders` 는 이메일 인증 여부를 필수로 요구하지 않으며, 이메일은 **형식·길이·국가 규칙 기반으로만 서버 검증**한다.
  - **정책적으로 “이메일 인증을 주문 생성의 필수 보안 게이트로 격상”하기로 한다면**,  
    - 주문 생성 라우트 초반에 `mysql.createConnection` 호출 **이전 단계에서**:
      - 요청 body 존재 여부 및 기본 스키마만 가볍게 확인하고,
      - 세션/DB를 통해 이메일 인증 여부를 조회한 뒤,
      - 미인증이면 **DB 커넥션 없이 403/401 + 정형화된 에러 코드로 Early Return** 하는 설계를 채택하는 것이 바람직하다.
  - “Prepmood는 커넥션 풀을 사용하지 않는다”는 Gemini의 전제는 **부분적으로만 맞으며**,  
    - 실제로는 결제 confirm 경로는 풀을 사용하고, 주문 생성 등 일부 경로만 여전히 `createConnection` 을 사용한다.

---

#### 2-3. `resetEmailVerificationUI` 원자성 및 타이머 관련 우려

- **Gemini 요지**  
  - DOM 요소를 개별적으로 조작하다가 특정 요소가 없거나 JS 에러가 발생하면 “반쯤 리셋된” 상태가 될 수 있다.
  - 타이머(`setTimeout`, `setInterval`)가 작동 중일 때 리셋을 호출하면, 리셋 후에도 예전 타이머 콜백이 실행되어 UI를 다시 오염시킬 수 있다.
  - 모든 타이머 변수는 리셋 시점에 clear + null 처리하고, 콜백 안에서도 변수가 유효한지 확인하는 방어 코딩이 필요하다.

- **실제 코드** (`checkout-script.js`)  
  - `resetEmailVerificationUI()`:
    - `clearCheckoutEmailVerified()` 로 sessionStorage 플래그만 제거.
    - `clearCheckoutError('checkout-emailError')`, `clearCheckoutError('checkout-codeError')` 로 에러 메시지·에러 클래스 제거.
    - `checkoutResendTimerId`, `checkoutResendTimeoutId`:
      - 각각 `clearInterval`/`clearTimeout` 호출 후 **즉시 `= null`** 로 초기화.
    - DOM 요소 접근은 모두 `getElementById` 후 `if (element)` 조건 안에서만 수행:
      - `sentHint`, `verifyBlock`, `codeInput`, `codeCheck`, `codeSpinner`, `requestBtn`, `modal` 등.
    - 이메일 입력란(`email`)은 **이 함수에서 전혀 건드리지 않는다.**
  - 재발송 타이머:
    - `checkoutResendTimerId` 가 유효할 때만 `setInterval` 이 살아 있으며,  
    - 남은 시간이 0 이하일 때 `clearInterval` + `checkoutResendTimerId = null` 수행.

- **평가**  
  - DOM 조작은 모두 “존재할 때만” 수행하고 있고, 타이머 변수는 **이미 clear + null** 패턴을 사용하고 있다.
  - `clearInterval`/`clearTimeout` 은 **아직 실행되지 않은 콜백의 스케줄을 취소**하므로, “리셋 후 예전 타이머 콜백이 다시 UI를 덮어쓴다”는 시나리오는 현재 코드 구조상 발생하지 않는다.
  - 다만, 방어적 설계 관점에서 `updateResendLabel` 내부에서 `checkoutResendTimerId` 를 한 번 더 체크하는 것은 장기 유지보수를 위한 “여분의 안전 장치”가 될 수 있다.

- **정리 (문서 결론)**  
  - `resetEmailVerificationUI` 는 **이미 꽤 원자적으로 동작**하고 있다:
    - sessionStorage·에러·타이머·UI 요소를 한 함수 안에서 일괄 초기화.
  - 타이머는 clear 후 null 로 초기화하는 패턴을 유지하며, 필요하다면:
    - `updateResendLabel` 초반에  
      `if (!checkoutResendTimerId) return;` 같은 방어 코드를 추가하는 것을 “선택적 강화”로 고려할 수 있다.

---

#### 2-4. 백엔드 에러 코드 규격화 (API Contract 일관성)

- **Gemini 요지**  
  - `EXPIRED_VERIFICATION` 같은 문자열 코드를 프론트만 알고 있으면, 백엔드 개발자가 `VERIFICATION_EXPIRED` 등으로 이름을 바꿀 때 프론트가 이를 인지하지 못해 기본 에러 처리만 하게 된다.
  - 공통 `error-codes.js` (또는 JSON)를 만들어 프론트와 백엔드가 **같은 상수**를 참조하도록 해야 한다.

- **실제 구조**  
  - 현재는 백엔드에서 에러를 내려줄 때,  
    - `code: 'VALIDATION_ERROR'`,  
    - 혹은 `details.message` 기반의 메시지,  
    - 상태 코드(400, 401, 409, 500 등)를 조합해 프론트가 대응하고 있다.
  - 이메일 인증 관련해서는 **아직 `EXPIRED_VERIFICATION` 같은 전용 코드가 정의·사용되고 있지 않다.**

- **평가**  
  - 에러 코드 규격화 및 공통 상수 파일 사용은 **장기적으로 바람직한 방향**이다.
  - 순수 HTML/JS + Node 구조에서는, 공통 상수를 어떻게 공유할지(예: 공통 JS 파일, JSON 스키마, 빌드/배포 단계에서 동기화 등)를 추가 설계해야 한다.
  - 현재 단계에서 이 부분은 “바로 구현”보다는 “**향후 개선 아이디어**”에 가깝다.

- **정리 (문서 결론)**  
  - 에러 코드 규격화는 향후 `/api/orders`, `/verify-code`, `/send-verification` 등을 포함한 API 계약 정리에 유용하다.
  - 프론트와 백엔드가 참조하는 공통 `error-codes.*` 파일(또는 JSON)을 두는 방안은 **권장 개선**으로 기록하되,  
    - 이번 이메일 TTL/UX 버그 수정 범위에는 포함하지 않는다.

---

#### 2-5. `resetEmailVerificationUI` 호출 시 이메일 값 초기화 위험

- **Gemini 요지**  
  - `handleRequestVerify()` 시작에서 `resetEmailVerificationUI()` 를 호출하면, 그 함수 안에서 `email.value = ''` 같은 로직이 있을 경우 사용자가 입력한 이메일까지 지워질 수 있다.

- **실제 코드**  
  - `resetEmailVerificationUI()` 는 이메일 입력란(`email`)을 **전혀 조작하지 않는다.**
    - `getElementById('email')` 호출 자체가 없음.
    - value 대입·초기화는 오직 `verify-code` 입력란에만 적용된다.

- **평가**  
  - 현재 구현 기준으로는, `resetEmailVerificationUI()` 를 호출해도 **이메일 값은 그대로 유지된다.**
  - 따라서 “이메일 값이 지워진다”는 위험은 **지금 코드에서는 해당되지 않는 오해**다.

- **정리 (문서 결론)**  
  - `resetEmailVerificationUI` 는 “인증 UI 상태(코드 입력, 체크 표시, 힌트, 타이머, 모달 등)”만 초기화하며, 이메일 입력값은 건드리지 않는다.
  - 다만, 이 함수를 사용하는 위치에 따라 “코드 발송 버튼의 disabled 상태”가 영향을 받을 수 있으므로, **`handleRequestVerify` 에서의 사용 순서**는 별도로 신중히 설계해야 한다.

---

#### 2-6. 타이머 메모리 누수 및 UI 충돌 (Race Condition)

- **Gemini 요지**  
  - `clearInterval` 후 `checkoutResendTimerId` 를 null 로 만들지 않으면, 중복 실행으로 버튼 텍스트가 “코드 보내기”와 “재발송(00:59)” 사이에서 요동칠 수 있다.
  - 리셋 함수 최상단에서 모든 타이머 변수에 대해 `clearInterval` + null 할당을 강제하라고 제안.

- **실제 코드**  
  - `resetEmailVerificationUI` 는 다음과 같이 이미 구현되어 있다.
    - `if (checkoutResendTimerId) { clearInterval(checkoutResendTimerId); checkoutResendTimerId = null; }`
    - `if (checkoutResendTimeoutId) { clearTimeout(checkoutResendTimeoutId); checkoutResendTimeoutId = null; }`
  - 재발송 타이머 콜백에서도, remaining이 0 이하가 되면:
    - `clearInterval(checkoutResendTimerId);`
    - `checkoutResendTimerId = null;`

- **평가**  
  - Gemini가 권장한 “clear 후 null” 패턴은 이미 구현되어 있다.

- **정리 (문서 결론)**  
  - 타이머 관련 메모리 누수·UI 충돌 방지는 현재 코드에서 어느 정도 충족되고 있으며, 이 패턴을 계속 유지하면 된다.

---

#### 2-7. 포커스(Focus) 정책

- **Gemini 요지**  
  - 인증이 만료(또는 불일치)했을 때 무조건 `verify-code` 에 포커스를 주는 것은 위험한 가정이다.
  - `sessionStorage` 에 저장된 이메일과 현재 input 값이 다를 수 있으므로:
    - 이메일이 다르면 email input 에 focus,
    - 이메일은 같고 TTL 만료만 발생했다면 verify-code 또는 “코드 보내기” 버튼에 focus 하는 방식을 제안.

- **실제 코드**  
  - `handleCompleteOrder()` 에서 비회원 + 이메일 존재 조건 하에:
    - `verified = getCheckoutEmailVerified();`
    - `if (verified !== email) { showCheckoutError(...); block.scrollIntoView(...); return; }`
  - 현재는 **scrollIntoView만 수행하고 focus는 주지 않는다.**
  - `verified !== email` 은:
    - (1) TTL 만료 (sessionStorage 값 제거)  
    - (2) 사용자가 이메일을 바꾼 경우  
    모두 포함한다.

- **평가**  
  - 사용자가 “이메일을 잘못 입력했거나 바꿨을 가능성”을 고려하면, 이메일에 focus 하는 전략도 일리 있다.
  - 반대로, “이메일은 맞고 TTL만 만료된 경우”에는 바로 다시 인증 플로우로 안내하기 위해 `verify-code` 또는 “코드 보내기” 버튼에 focus 하는 편이 자연스러울 수 있다.
  - 현재 구조에서는 “TTL 만료 vs 이메일 변경”을 완벽히 구분하지는 않으므로, 단순화한 정책을 택할 수 있다.

- **정리 (문서 결론)**  
  - 만료/불일치 시 기본 정책(초기 버전):  
    - `checkout-email-verify-block` 으로 `scrollIntoView` 하고,  
    - **“코드 보내기” 버튼 또는 `verify-code` 필드 중 하나에 focus** 를 주어 “다시 인증” 플로우로 바로 진입하게 한다.
  - 이후 필요하다면, `getCheckoutEmailVerified()` 가 email을 반환하던 시점의 이메일과 현재 input 이메일을 비교해:
    - 이메일 값이 아예 다르면 email input 에 focus,  
    - 값은 같았는데 TTL 만료라면 verify-code 쪽에 focus 하는 세분화 정책을 도입할 수 있다.

---

#### 2-8. 네트워크 지연 중 중복 요청 (Double Submission) — `handleRequestVerify`

- **Gemini 요지**  
  - `handleRequestVerify()` 가 실행되는 동안 사용자가 “코드 보내기” 버튼을 연타하면, 중복 요청 → rate-limit 에 부딪히거나 서버에 불필요한 부하가 생긴다.
  - 진입 즉시 버튼을 disabled 로 만들고, 서버 응답이 올 때까지(또는 오류 처리 완료 전까지) 이 상태를 해제하지 말라고 제안.

- **실제 코드** (`checkout-script.js`)  
  - 현재 구현 순서:
    1. 이메일 element·값 읽기
    2. `clearCheckoutError('checkout-emailError');`
    3. 이메일 공백/형식 검사 → 실패 시 에러 표시 후 return
    4. `const btn = document.getElementById('checkout-request-verify-btn');`
    5. `if (btn) btn.disabled = true;`
    6. 이후 `/auth/check-email`, `/send-verification` 호출
    7. `finally` 에서 `if (!sendSuccess && btn) btn.disabled = false;`
  - “초기 resetEmailVerificationUI를 호출”하는 아이디어를 도입하면:
    - reset 함수 말미에 `requestBtn.disabled = false;` 가 있기 때문에,  
      reset 이후 **반드시 다시 `btn.disabled = true`** 를 호출해 줘야 한다.

- **평가**  
  - 버튼 disabled 처리의 순서와 타이밍에 대한 **지적은 유효**하다.
  - `handleRequestVerify` 진입 직후 `resetEmailVerificationUI()` 를 쓰려면:
    - reset 직후 → `btn.disabled = true` 처리,  
    - 이후 네트워크 요청/에러 처리 완료 전에는 disabled 상태를 풀지 않아야 한다(현 구조에서처럼 `finally` 블록에서 `!sendSuccess` 조건으로만 풀기).

- **정리 (문서 결론)**  
  - `handleRequestVerify` 에 `resetEmailVerificationUI()` 를 도입할 경우의 권장 순서:
    1. `const btn = document.getElementById('checkout-request-verify-btn');`
    2. `if (btn && btn.disabled) return;` (이미 진행 중이면 Guard)
    3. `resetEmailVerificationUI();` (이메일 값은 유지)
    4. `if (btn) btn.disabled = true;`
    5. 이메일 유효성 검사 및 서버 요청 수행
    6. `finally` 에서 `!sendSuccess` 인 경우에만 disabled 해제

---

### 3. 종합 요약 (받아들이는 것 / 보류하는 것)

- **바로 받아들이는 설계 원칙**
  - `resetEmailVerificationUI` 는 “이메일 값은 보존하되, 인증 UI 전체를 원자적으로 초기화하는 단일 진입점”으로 사용한다.
  - 만료/불일치 시에는:
    - UI를 리셋하고,
    - 이메일 오류 메시지를 명확히 보여주고,
    - 인증 영역으로 스크롤 + 다시 인증 흐름으로 유도하는 포커스 정책을 적용한다.
  - `handleRequestVerify` 에서 reset을 사용할 경우:
    - reset 직후 **반드시 버튼을 disabled** 로 만들고,
    - 서버 응답/에러 처리 전에는 해제하지 않는다.
  - 에러 코드 규격화, 백엔드 이메일 인증 강제, 멀티탭 Heartbeat 등은 **장기적인 아키텍처 개선 아이디어**로 별도 관리한다.

- **현재 단계에서 보류/축소하는 부분**
  - 멀티탭/멀티 디바이스 상태 동기화 (Heartbeat/Pre-check API) 도입은,  
    **이번 “단일 탭 TTL 만료 버그” 범위 밖**으로 두고, 추후 필요 시 별도 설계.
  - `/api/orders` 에서 이메일 인증을 “무조건 보안 게이트”로 삼는 것은,  
    현재 비즈니스·보안 요구사항을 재정의해야 하는 문제이므로 정책 결정 후 적용한다.
  - 공통 `error-codes` 파일 도입 역시 향후 API 계약 정리 단계에서 함께 추진한다.

이 문서는 위와 같은 판단을 **코드와 실제 설계를 직접 대조한 결과**로 남기며,  
실제 코드 수정 시에는 이 원칙을 기준으로 세부 구현을 진행한다.

