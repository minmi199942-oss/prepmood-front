# 주문 흐름 코드 리뷰 상세 보고서

이 문서는 주문 생성 → 결제 확인 → paid_events 생성 → processPaidOrder → 집계까지의 주문 흐름 코드를 대상으로, **문제점**, **영향**, **수정 방법**, **수정 시 미칠 영향**, **무엇이 변하는지**를 정리한 것입니다.  
(참고: SSOT·프로젝트 규칙은 `start_here.md`, `db_structure_actual.txt`, 프로젝트 규칙을 따릅니다.)

**분류 범례**: Critical / Major / Minor / Invalid (코드 리뷰 분류 기준).

### GPT 피드백 검토 결과 (코드베이스 기준)

- **1번(createOrderPayload)**  
  - **옳음**: 옵션 A + checkout-payment.js try-catch 보강 필요, **서버도 정책 강제 필요** — 클라이언트만 막으면 변조/구버전으로 부분 주문 가능.  
  - **반영**: “서버 변경 불필요” 문구 제거하고, 서버에서 items 전체 검증·부분 생성 금지(및 생성 수 일치 검사) 2줄 추가함.  
  - **코드 확인**: `order-routes.js`는 이미 항목별 product_id 검사 후 무효 시 400 반환; “생성된 order_items 수 === items.length” 방어 검사는 추가 권장으로 명시.
- **2번(Logger)**  
  - **옳음**: 호출부 영향 없음. **보완**: `window.Logger` 존재 여부 확인 문장, 로그 meta에 PII 마스킹 규칙 추가 반영.  
  - **코드 확인**: `checkout-script.js`, `my-profile.js` 등에서 이미 Logger 사용 중.
- **3번(processPaidOrder failed)**  
  - **옳음**: 수정 없음. 재처리 경로(failed → 재시도 등) 정책을 문서에 한 줄 추가 반영.
- **4번(orderId/amount)**  
  - **옳음**: order_id는 서버가 order_number+user_id로만 사용.  
  - **보완**: amount는 이미 `order.total_price`(DB)와 클라이언트 amount 비교 후 불일치 시 400(`payments-routes.js` 318~322) — 문서에 “amount 검증 사실” 및 404/403 정보 노출 주의 한 줄 추가.
- **5번(orders.status)**  
  - **옳음**: SSOT·갱신 경로 단일화. **정정**: “111라인 한 곳뿐”은 전역 검색으로 확인된 범위에서만이라고 완화하고, 재발 방지(CI/체크리스트)·집계 “저장” 허용 명시 반영.  
  - **코드 확인**: 백엔드에서 `UPDATE orders SET status`는 `order-status-aggregator.js` 한 곳, `PUT /api/admin/orders/:orderId/status`는 제거됨(주석만 존재).
- **6번(sessionStorage)**  
  - **옳음**: 완료 후 삭제·형식 변경 시 연쇄 수정. **반영**: 1순위(완료 시 removeItem), 2순위(TTL), 3순위(최소 저장) 우선순위 및 draft PII 리스크 한 줄 추가.
- **7번(SKIP LOCKED)**  
  - **옳음**: 락 유지·메시지/재시도 UX. **반영**: 결제 확정 후 재고 부족 시 자동 환불/취소 경로·CS 정책 연결 한 줄 추가.  
  - **코드 확인**: processPaidOrder 실패 시 롤백 후 에러 응답, paid_events는 별도 커넥션으로 남음 — 자동 환불 경로는 별도 정책/운영 확인 권장.

---

## 1. createOrderPayload: 유효하지 않은 아이템을 filter로 제거하는 동작

**분류**: Major (서버가 “부분 주문 금지”를 강제하지 않으면 Critical 권장)

### 1.1 문제점

- **위치**: `utils/checkout-utils.js` — `createOrderPayload(items, shipping)`
- **현상**: `items`를 `map`으로 검증할 때, `product_id`/`quantity` 등이 유효하지 않은 항목은 `null`을 반환하고, 이후 `.filter(item => item !== null && ...)`로 **제거만** 한 뒤 나머지만으로 주문 payload를 만듭니다.
- **문제**: 사용자가 3개 상품을 선택했는데, 1개가 잘못된 데이터(예: 삭제된 상품, 잘못된 id)라면 **2개만 주문**되는 동작이 됩니다. 사용자 입장에서는 “일부만 주문됐다”는 인지가 없을 수 있고, 비즈니스 정책상 “전부 유효할 때만 주문 허용”이어야 한다면 현재 동작은 정책 위반입니다.

### 1.2 영향

- **기능/정책**: “일부만 유효해도 주문 생성”이 허용됨 → 의도치 않은 부분 주문, 클레임·환불 이슈 가능.
- **데이터**: `order_items`에는 유효한 것만 들어가므로 DB 정합성은 유지되나, “장바구니/선택 상품 수 ≠ 주문 상품 수” 불일치가 발생할 수 있음.
- **UX**: 사용자는 3개 결제했다고 생각하는데 실제 주문은 2개일 수 있어 혼란과 불만으로 이어질 수 있음.

### 1.3 수정 방법

**옵션 A — “전부 유효할 때만 주문” (권장)**

- `map` 단계에서 유효하지 않은 항목이 하나라도 있으면, **filter로 걸러내지 말고** 즉시 예외를 던지도록 변경합니다.
- 예시:

```javascript
const validatedItems = items.map((item, index) => {
  // ... 기존 검증 로직 ...
  if (!productId || productId === 'undefined' || productId === 'null') {
    throw new Error(`주문할 수 없습니다: ${index + 1}번째 상품 정보가 올바르지 않습니다.`);
  }
  if (isNaN(quantity) || quantity <= 0) {
    throw new Error(`주문할 수 없습니다: ${index + 1}번째 상품 수량이 올바르지 않습니다.`);
  }
  // ...
});
// filter 제거 또는, validatedItems.length !== items.length 이면 throw
if (validatedItems.length !== items.length) {
  throw new Error('일부 상품 정보가 유효하지 않아 주문할 수 없습니다.');
}
```

- 클라이언트: 이 에러를 받으면 “일부 상품 정보가 만료되었거나 올바르지 않습니다. 장바구니를 확인해 주세요.” 같은 메시지로 표시하고, 주문 생성 API 호출을 중단합니다.

**옵션 B — “유효한 것만 주문”을 공식 정책으로 유지**

- 현재처럼 filter로 유효한 것만 두고, **정책과 UX를 명확히** 합니다.
- 예: 주문 전 확인 단계에서 “유효하지 않은 상품 N건은 제외됩니다” 문구 표시, 또는 주문 완료 화면에서 “실제 주문된 상품”만 노출하고 “제외된 상품” 안내.

### 1.4 수정 시 미칠 영향

- **옵션 A 적용 시**
  - **변하는 것**: 유효하지 않은 아이템이 하나라도 있으면 주문 생성 요청 자체가 실패합니다. 결제 창 진입 전(또는 주문 생성 API 단계)에서 막히게 됩니다.
  - **해결되는 것**: “일부만 주문되는” 상황이 사라지고, “전부 유효할 때만 주문”이 보장됩니다. 클레임·정책 불일치가 줄어듭니다.
  - **부수 효과**: 장바구니/캐시 오염(삭제된 상품, 옵션 변경 등)이 있으면 사용자가 “주문할 수 없음”을 자주 보게 될 수 있으므로, 장바구니 갱신·유효성 검사 UX를 함께 보강하는 것이 좋습니다.

- **옵션 B 유지 시**
  - 문서/주석에 “유효한 아이템만 주문하며, 일부 제외 가능함”을 명시하고, 프론트에서 제외 건수/내용 안내를 넣으면 혼란과 정책 오해가 줄어듭니다.

### 1.4.1 코드 관점의 영향 (수정 시 다른 코드에 미치는 영향)

- **createOrderPayload를 참조하는 코드**
  - **checkout-script.js**  
    - `processPayment(orderData)` 내부(약 949라인): `const requestPayload = window.createOrderPayload(orderData.items, orderData.shipping);` 호출 후 `requestPayload`를 `POST /orders` 요청 body로 사용합니다.  
    - **현재**: `createOrderPayload`가 예외를 던지는 경우는 “배송 정보 없음” 등 일부뿐이며, 아이템 검증 실패 시에는 `null`을 반환해 filter로 제거합니다.  
    - **옵션 A 적용 시**: 유효하지 않은 아이템이 있으면 `createOrderPayload`가 **동기적으로** `throw new Error(...)` 합니다. 이 throw는 `processPayment`의 `try { ... } catch (error) { ... }`(약 941~1105라인)에 의해 잡힙니다.  
    - **필요한 수정**: catch 블록(1076~1097라인)은 이미 `error.message`를 사용자 메시지로 쓰고 있으므로, `createOrderPayload`에서 던진 메시지가 그대로 노출됩니다. **추가로** “일부 상품 정보가 만료되었습니다” 등 사용자 친화 문구로 매핑하거나, `error.message`가 해당 패턴일 때만 메시지를 덮어쓰면 됩니다. **동작**: API 호출(`secureFetch`)은 실행되지 않고, 버튼은 `finally`에서 복구되므로 **다른 코드 수정 없이** 옵션 A만 적용해도 동작합니다. 다만 의도한 메시지를 보이려면 catch 안 메시지 매핑을 추가하는 것이 좋습니다.
  - **checkout-payment.js**  
    - **proceedWithTossPayment** (약 257라인): `const requestPayload = window.createOrderPayload(data.items, data.shipping);` 호출 후 바로 `POST /orders` 호출.  
    - **이니시스 결제 진행 경로** (약 451라인): 동일하게 `createOrderPayload` 호출 후 `POST /orders` 호출.  
    - **현재**: 두 곳 모두 `createOrderPayload` 호출을 **try로 감싸지 않음**. 옵션 A 적용 시 여기서 throw가 나면 상위 호출자(이벤트 핸들러 등)의 catch로 전파되거나, 잡히지 않으면 미처리 예외로 콘솔에만 찍힐 수 있습니다.  
    - **필요한 수정**:  
      - 257라인 부근: `createOrderPayload` 호출을 try-catch로 감싸고, catch 시 사용자에게 “일부 상품 정보가 올바르지 않습니다. 장바구니를 확인해 주세요.” 등 메시지를 표시한 뒤 **return**하여 `secureFetch('/orders', ...)`가 실행되지 않도록 합니다.  
      - 451라인 부근: 동일하게 try-catch 추가, 에러 시 메시지 표시 후 return.  
    - **수정하지 않을 경우**: `createOrderPayload`가 throw하면 주문 생성 요청이 나가지 않는데, 사용자에게는 “처리 중…” 상태로 멈추거나, 상위에서 에러가 잡혀도 결제 창이 열리지 않는 등 애매한 UX가 됩니다. 반드시 **두 곳 모두**에서 throw를 잡아서 메시지와 버튼 복구를 해 주어야 합니다.
- **정리**
  - **변경하는 파일**: `utils/checkout-utils.js` (createOrderPayload 내부 로직).  
  - **함께 수정해야 하는 파일**: `checkout-payment.js` (257라인, 451라인 부근에 try-catch 추가 및 에러 메시지/return 처리).  
  - **선택적 개선**: `checkout-script.js` catch 블록에서 createOrderPayload 유형 에러 메시지 매핑.  
  - **서버 측 정책 강제 (SSOT)**: 클라이언트는 신뢰할 수 없으므로, “전부 유효할 때만 주문” 정책은 **서버에서도** 강제해야 합니다.  
    - **서버 /orders 생성 시**: items 배열 **전체**를 검증하고, 하나라도 무효(product_id 미존재, 수량 무효 등)면 **400으로 거부**한다. (현재 `backend/order-routes.js`는 이미 항목별 product_id 존재 검사 후 없으면 400 반환함. 유지·명시 권장.)  
    - **서버는** 요청 items 수와 실제 생성된 order_items 수가 달라지는 것(부분 생성)을 **금지**한다. (현재 구현은 “무효 항목 있으면 400”이라 부분 생성 자체는 없음. 방어 차원에서 “생성 후 inserted order_items 수 === items.length” 검사 추가 권장.)

### 1.5 요약

| 구분 | 내용 |
|------|------|
| **무엇이 문제인가** | 유효하지 않은 아이템을 조용히 제거한 뒤 나머지로만 주문이 생성되어, 사용자 의도(전부 주문)와 다르게 “일부만 주문”될 수 있음. |
| **무엇을 어떻게 고치는가** | (옵션 A) 유효하지 않은 항목이 있으면 예외를 던져 주문 생성을 막고, 클라이언트에서 안내 메시지 표시. (옵션 B) 현재 동작을 정책으로 인정하고, 제외 건수/안내를 명확히 함. |
| **고치면 무엇이 해결되는가** | (옵션 A) 부분 주문으로 인한 정책·클레임·UX 문제가 사라지고, “전부 유효할 때만 주문”이 보장됨. |

---

## 2. checkout-utils.js에서 console.error 사용

**분류**: Minor

### 2.1 문제점

- **위치**: `utils/checkout-utils.js` — `createOrderPayload` 내부
- **현상**: `product_id`/`quantity` 검증 실패 시 `console.error(...)`로만 로그를 남깁니다.
- **문제**: 프로젝트 규칙에서 “console.log 대신 Logger 사용”을 요구하고 있어, 규칙 위반이며 로깅 방식이 불일치합니다. (클라이언트 환경이므로 `Logger`가 `window.Logger` 등으로 제공되는지 여부에 따라 조치가 달라짐.)

### 2.2 영향

- **운영/디버깅**: 프로덕션에서 로그 수집·필터링 시 `console`만 사용하면 일관성이 떨어지고, Logger 레벨/포맷 정책을 적용하기 어렵습니다.
- **코드 일관성**: 다른 모듈은 Logger를 쓰는데 이 파일만 console을 쓰면 유지보수 시 혼란을 줍니다.

### 2.3 수정 방법

- **클라이언트용 Logger가 있는 경우**  
  - `console.error` 호출을 `Logger.error` 또는 `Logger.warn`으로 교체합니다.  
  - 전달하는 인자 형태(메시지, 메타 객체 등)는 프로젝트의 Logger 사용 패턴에 맞춥니다.

- **클라이언트용 Logger가 없는 경우**  
  - 단기: 이 파일 상단에 “클라이언트 체크아웃 유틸, console 사용 예외” 주석을 두고, 규칙 문서에 예외로 명시합니다.  
  - 중기: `utils/logger.js`(또는 동일한 역할)에서 브라우저 환경이면 `console`을 래핑한 Logger를 노출하고, 여기서는 그 Logger를 사용하도록 변경합니다.  
- **적용 전 확인**: 현재 프로젝트에서 클라이언트 쪽 `window.Logger`(또는 전역 Logger) 존재 여부를 확인한 뒤 적용합니다. (참고: `checkout-script.js`, `my-profile.js` 등에서 이미 Logger 사용 중이면 동일 객체 사용.)  
- **로그 시 PII 주의**: Logger에 넘기는 meta 객체에 shipping/items 등 개인정보를 그대로 넣지 않고, 마스킹하거나 식별 불가 수준으로만 넣는 규칙을 적용합니다.

### 2.4 수정 시 미칠 영향

- **변하는 것**: 동일한 오류 상황에서도 출력 채널이 `console` → `Logger`로 바뀌고, 메시지 형식이 Logger 규칙에 맞게 통일됩니다.
- **해결되는 것**: 프로젝트 로깅 규칙 준수, 운영 시 로그 수집/분석 일관성 확보.
- **부수 효과**: 없음. 동작(주문 payload 생성 실패/에러 throw)은 그대로입니다.

### 2.4.1 코드 관점의 영향 (수정 시 다른 코드에 미치는 영향)

- **checkout-utils.js의 의존 관계**
  - **참조하는 쪽**: `createOrderPayload`는 `checkout-utils.js`에서 정의되고 `window.createOrderPayload`로 노출됩니다. 이를 **호출**하는 코드는 `checkout-script.js`(processPayment), `checkout-payment.js`(proceedWithTossPayment, 이니시스 결제 경로)뿐입니다.
  - **의존 내용**: 호출부는 `createOrderPayload(items, shipping)`의 **반환값**(`{ items, shipping }`)과 **예외**(throw 시 에러 메시지)만 사용합니다. 내부에서 `console.error`를 쓰는지 `Logger.error`를 쓰는지는 호출부와 무관합니다.
- **수정 시 필요한 변경**
  - **변경하는 파일**: `utils/checkout-utils.js` 한 곳. `console.error` 호출부(약 33, 42라인)를 `Logger.error` 또는 `Logger.warn`으로 교체.  
  - **다른 파일 수정**: **불필요**. checkout-script.js, checkout-payment.js, 백엔드 등은 수정할 필요 없습니다.
- **동작 차이**
  - **정상 케이스**: createOrderPayload가 정상 반환하는 경우는 기존과 동일. 호출부 로직 변경 없음.
  - **에러 케이스**: 유효하지 않은 아이템이 있을 때, 기존에는 `console.error`로만 로그가 남고 filter로 제거된 payload가 반환됩니다. Logger로 바꿔도 **반환/throw 동작은 바꾸지 않으면** 동일하므로, 호출부는 그대로 동작합니다. (단, 나중에 createOrderPayload에서 throw하도록 바꾸는 경우는 1번 항목의 코드 영향과 같이 checkout-payment.js에 try-catch 추가가 필요합니다.)

### 2.5 요약

| 구분 | 내용 |
|------|------|
| **무엇이 문제인가** | 프로젝트 규칙상 Logger를 써야 하는데, 클라이언트 체크아웃 유틸에서만 console.error를 사용하고 있음. |
| **무엇을 어떻게 고치는가** | Logger가 있으면 console.error → Logger.error/warn으로 교체; 없으면 예외 문서화 후, 가능하면 클라이언트용 Logger 도입 후 교체. |
| **고치면 무엇이 해결되는가** | 로깅 규칙 준수 및 전역 로그 정책 적용 가능. |

---

## 3. processPaidOrder 실패 시 paid_event_processing 상태 (검증 결과)

**분류**: Invalid (현재 코멘트는 구현과 불일치)

### 3.1 문제점

- **가능한 리뷰 코멘트**: “processPaidOrder 실패 시 paid_event_processing을 'failed'로 되돌리지 않으면 재처리/모니터링에서 혼란스럽다.”

### 3.2 검증 결과

- **위치**: `backend/utils/paid-order-processor.js` — catch 블록
- **현재 구현**: `processPaidOrder` 내부에서 예외가 나면 catch에서 `updateProcessingStatus(paidEventId, 'failed', error.message)`를 호출하고 있습니다.  
  즉, **이미 실패 시 상태를 'failed'로 되돌리고 있음.**

### 3.3 결론

- **분류**: 리뷰 코멘트는 **현재 코드 기준으로는 부적절(Invalid)** 입니다.
- **조치**: 추가 수정 없음. 리뷰어에게 “이미 catch에서 'failed'로 업데이트하고 있음”을 코드 위치와 함께 전달하면 됩니다.

### 3.3.1 코드 관점의 영향 (수정 없음)

- **processPaidOrder**는 `payments-routes.js`(결제 확인 콜백) 등에서 호출됩니다. 실패 시 `paid-order-processor.js`의 catch에서 이미 `updateProcessingStatus(paidEventId, 'failed', ...)`를 호출하므로, **코드 변경을 가정할 필요가 없습니다.** 다른 모듈은 이 동작에 의존할 필요 없이, paid_events 테이블의 `paid_event_processing` 값만 읽으면 됩니다.  
- **운영/정책 보완**: 재처리 경로(수동 재시도·배치)에서 `failed`를 어떻게 다루는지 정책을 문서에 두면 좋습니다. 예: `failed` → 재시도 시 `processing`으로 전이, `succeeded`는 불변, 동일 paid_event_id는 멱등 처리.

### 3.4 요약

| 구분 | 내용 |
|------|------|
| **무엇이 문제인가** | (없음 — 기존 우려가 현재 구현과 불일치) |
| **무엇을 어떻게 고치는가** | 수정 불필요. 구현 사실만 공유. |
| **고치면 무엇이 해결되는가** | 해당 코멘트에 대한 오해 해소. |

---

## 4. 결제 확인 API에서 orderId 사용 방식 (검증 결과)

**분류**: Invalid (취약점 없음) / Minor (문서화 권장)

### 4.1 가능한 우려

- “결제 확인 API에서 orderId를 클라이언트에서 그대로 받아서 사용하면, 타인 주문을 조작할 수 있지 않나?”

### 4.2 현재 구현 검증

- **위치**: `backend/payments-routes.js` — `POST /payments/confirm`
- **흐름**:
  1. 요청 바디에서 **order_number**, **paymentKey**, **amount**만 받습니다. **order_id는 받지 않습니다.**
  2. `WHERE order_number = ? AND user_id = ?`로 주문을 조회합니다. (본인 주문만 조회)
  3. 조회된 행의 **order.order_id**를 서버에서만 사용해 `createPaidEvent`, `processPaidOrder`, `updateOrderStatus` 등에 넘깁니다.

따라서 **order_id는 클라이언트가 보낸 값이 아니라, 서버가 order_number + user_id로 조회한 결과**로만 사용됩니다. 타인 주문을 지정할 수 있는 경로가 없습니다.

### 4.3 결론

- **분류**: 현재 구현은 안전함. 해당 우려에 대한 “직접적인” 문제는 없음.
- **권장**: 신규 결제/주문 관련 API를 추가할 때에도 **order_id를 요청 파라미터로 받지 말고**, order_number(또는 동등한 식별자) + 인증 정보로 주문을 조회한 뒤, 서버가 결정한 order_id만 사용하는 패턴을 유지하는 것이 좋습니다. 이 점을 API 설계 가이드나 주석에 명시해 두면, 향후 리뷰 시 혼란을 줄일 수 있습니다.

### 4.3.1 코드 관점의 영향 (수정 없음)

- 결제 확인 API(`payments-routes.js`)는 **order_id를 요청에서 받지 않고**, `order_number` + `user_id`로 주문을 조회한 뒤 `order.order_id`만 사용합니다. 이 패턴을 유지하는 한, **기존 호출부(프론트/다른 라우트)나 processPaidOrder·updateOrderStatus 등에 코드 변경은 필요 없습니다.** 주석/문서 추가만 하면 됩니다.  
- **보안 리뷰 보완**: (1) **amount 검증** — 현재 구현은 `order.total_price`(DB)를 `serverAmount`로 두고, 클라이언트가 보낸 `amount`와 `Math.abs(serverAmount - clientAmount) > 0.01`이면 400 반환하므로, **서버가 amount를 신뢰하지 않고 DB 주문 합계와 일치 검증**하고 있음. (2) **정보 노출** — 404/403 응답 시 “주문 존재 여부”가 유추되지 않도록 메시지·코드 설계를 유지할 것(현재 404 시 “주문을 찾을 수 없습니다” 등).

### 4.4 요약

| 구분 | 내용 |
|------|------|
| **무엇이 문제인가** | (현재 코드는 문제 없음. 다만 “order_id를 클라이언트에서 받지 말 것”을 명시해 두는 것이 좋음.) |
| **무엇을 어떻게 고치는가** | 코드 변경 없이, “결제 확인 시 order_id는 항상 서버가 order_number + user_id로 조회한 값만 사용함”을 주석/문서에 추가. |
| **고치면 무엇이 해결되는가** | 향후 신규 API에서 order_id를 요청에서 받는 실수를 방지하고, 보안 정책이 명확해짐. |

---

## 5. orders.status 직접 업데이트와 SSOT

**분류**: Major ~ Critical (orders.status가 배송/환불/재고/알림 트리거로 쓰이면 Critical, 단순 표시용이면 Major)

### 5.1 문제점

- **원칙**: 프로젝트 SSOT에 따르면 `orders.status`는 **집계 결과**입니다. 즉, `order_item_units.unit_status`, `paid_events` 등 다른 테이블의 상태를 기준으로 **계산**된 값이어야 하며, 비즈니스 로직에서 “orders.status를 직접 UPDATE해서 상태를 바꾼다”는 금지에 가깝습니다.
- **위험**: 다른 경로(스크립트, 관리자 기능, 예외 처리 등)에서 `UPDATE orders SET status = ?`를 호출하면, 집계 결과와 불일치가 생기고 취소/환불/재처리 로직이 잘못 동작할 수 있습니다.

### 5.2 영향

- **데이터 정합성**: orders.status와 실제 unit_status/paid_events가 어긋나면 “이미 취소된 주문이 paid로 보인다”, “실제로는 paid인데 pending으로 보인다” 등이 발생할 수 있습니다.
- **비즈니스 로직**: 주문 상태에 의존하는 배치, 알림, 재고 해제 등이 잘못된 판단을 할 수 있습니다.
- **디버깅**: 상태가 “어디서 바뀌었는지” 추적이 어렵고, SSOT 원칙이 깨져 유지보수 비용이 커집니다.

### 5.3 수정 방법

- **1단계 — 전역 검색**  
  - 코드베이스에서 `UPDATE orders SET status` 또는 `orders.status =` 를 검색합니다.  
  - **허용되는 유일한 위치**: `backend/utils/order-status-aggregator.js`처럼 “집계 결과를 orders.status에 반영하는 단일 모듈”만 두고, 그곳에서만 `UPDATE orders SET status = ?` 를 수행하도록 합니다.

- **2단계 — 금지 위치 제거**  
  - 그 외 라우트, 스크립트, 관리자 코드에서 `orders.status`를 직접 UPDATE하는 코드가 있으면 **제거**합니다.  
  - 상태 변경이 필요하면, “단위 상태(unit_status, paid_events 등)를 변경한 뒤, 집계 함수(updateOrderStatus)를 한 번 호출해 orders.status를 갱신”하는 패턴으로 통일합니다.

- **3단계 — 문서화**  
  - `orders.status`는 “읽기 전용(집계 결과)”이며, 갱신은 `order-status-aggregator`(및 그를 호출하는 공식 경로)에서만 한다는 내용을 주석 또는 설계 문서에 적어 둡니다.  
  - SSOT상 “집계 결과”라고 해도, 그 결과를 DB 컬럼에 **저장**하는 것은 허용됩니다(캐시/조회 성능). 중요한 것은 **갱신 경로 단일화**(aggregator만 갱신)입니다.  
- **재발 방지**: CI에서 `UPDATE orders SET status` 문자열 탐지 시 fail, 또는 코드 리뷰 체크리스트에 “orders.status 직접 UPDATE 금지(aggregator만 허용)”를 고정 항목으로 두는 것을 권장합니다.

### 5.4 수정 시 미칠 영향

- **변하는 것**:
  - orders.status를 직접 바꾸던 코드 경로가 사라지고, 해당 케이스는 “단위 상태 변경 + updateOrderStatus 호출”로 대체됩니다.
  - 새로 상태를 바꾸고 싶을 때는 “집계 입력(unit_status, paid_events 등)을 수정하고, 집계만 다시 돌린다”는 한 가지 방식만 사용하게 됩니다.

- **해결되는 것**:
  - orders.status와 실제 데이터가 일치하게 되고, 취소/환불/재처리/배치가 올바른 상태를 보게 됩니다.
  - 상태 변경 경로가 한 곳(집계)으로 모여 디버깅과 변경 영향 분석이 쉬워집니다.

- **주의**:  
  - 기존에 “orders.status를 직접 업데이트하던” 스크립트나 관리자 기능이 있다면, 제거 후에는 “어떤 단위 상태를 어떻게 바꾼 다음, updateOrderStatus를 호출할지”를 명확히 설계해야 합니다. 그렇지 않으면 해당 기능이 “상태를 바꾸지 못하는” 것처럼 보일 수 있습니다.

### 5.4.1 코드 관점의 영향 (수정 시 다른 코드에 미치는 영향)

- **orders.status를 UPDATE하는 코드 위치**
  - **현재 확인된 범위**: 전역 검색(`UPDATE orders SET status`, `orders.status =`) 결과, **백엔드**에서는 `backend/utils/order-status-aggregator.js`(약 111라인)에서만 `UPDATE orders SET status = ? WHERE order_id = ?`를 수행합니다. `PUT /api/admin/orders/:orderId/status`는 제거된 상태(주석만 존재)입니다.  
  - **권장**: 배포·병합 전에 전역 검색으로 다른 직접 UPDATE가 없는지 한 번 더 확인하는 것을 권장합니다.  
  - “다른 경로에서 orders.status를 직접 UPDATE하는 코드를 제거한다”는 수정은, **추가로 그런 코드가 발견될 때만** 해당됩니다. 발견 시 그 호출부를 제거하고, 대신 “해당 비즈니스에 맞는 단위 상태 변경(예: order_item_units.unit_status, paid_events 등) + `updateOrderStatus(connection, orderId)` 호출”로 바꿔야 합니다.

- **updateOrderStatus를 호출하는 코드 (변경 불필요)**
  - **payments-routes.js**: 결제 확인 후 `updateOrderStatus(connection, orderId)` 호출.
  - **shipment-routes.js**: 배송 상태 변경 후 호출.
  - **refund-routes.js**: 환불 처리 후 호출.
  - **index.js**: (해당 라우트에서 호출하는 경우)
  - **복구/수정 스크립트**: `recover_order_by_number.js`, `recover_pipeline_batch.js`, `fix_missing_paid_events.js` 등에서 `(connection, orderId)`만 넘겨 호출.
  - 위 호출부들은 **시그니처와 동작을 바꾸지 않는 한 수정할 필요가 없습니다.** “직접 UPDATE 제거”는 “그런 직접 UPDATE를 하던 **다른** 코드를 찾아서 제거하고, 그 자리에 단위 상태 변경 + updateOrderStatus 호출을 넣는 것”이지, order-status-aggregator나 이미 updateOrderStatus를 쓰는 쪽을 건드리는 것이 아닙니다.

- **orders.status를 읽기만 하는 코드 (변경 불필요)**
  - **order-routes.js**: 905, 941, 1815라인 등에서 `SELECT ... orders.status`로 조회해 API 응답에 포함. 집계만 정확히 갱신되면 이 읽기 코드는 그대로 두면 됩니다.
  - **스크립트/배치**: 로그나 조건 분기에 `orders.status`를 사용하는 부분도, 집계 결과를 읽는 것이므로 수정 불필요.

- **정리**
  - **수정 대상이 되는 경우**: “다른 파일에서 `UPDATE orders SET status = ?`를 직접 실행하는 코드”가 **새로 발견될 때** 그 파일만 수정. 해당 구문 제거 후, 비즈니스에 맞게 단위 테이블 상태 변경 + `updateOrderStatus(connection, orderId)` 호출로 대체.
  - **수정하지 않아도 되는 코드**: `order-status-aggregator.js` 내부, `updateOrderStatus`를 이미 호출하는 모든 라우트/스크립트, `orders.status`를 SELECT만 하는 코드.

### 5.5 요약

| 구분 | 내용 |
|------|------|
| **무엇이 문제인가** | orders.status를 집계가 아닌 다른 경로에서 직접 UPDATE하면 SSOT 위반이고, 상태 불일치·로직 오동작을 일으킴. |
| **무엇을 어떻게 고치는가** | order-status-aggregator 외의 모든 “UPDATE orders SET status” 제거하고, 상태 변경은 “단위 상태 변경 + updateOrderStatus 호출”로만 수행. 문서에 “orders.status는 집계 전용” 명시. |
| **고치면 무엇이 해결되는가** | 상태 정합성 유지, 취소/환불/재처리 로직의 신뢰도 향상, 상태 변경 경로 단일화로 유지보수 용이. |

### 5.5.1 초보자용 요약

- **문제가 되는 상황**: 결제·배송·관리자 등 여러 코드가 각자 `UPDATE orders SET status = ?`를 하면, “결제는 안 됐는데 다른 모듈이 완료 처리해서 status만 완료로 보인다” 같은 **실제 데이터와 status 불일치**가 생길 수 있음.
- **계산은 어디서 하나**: 이 프로젝트에서는 **`backend/utils/order-status-aggregator.js` 한 곳**만이 `paid_events`, `order_item_units.unit_status` 등을 읽어서 “이 주문의 전체 상태”를 **계산**한 뒤, 그 결과로만 `UPDATE orders SET status = ?`를 수행함.
- **다른 코드는**: `orders.status`를 **직접 UPDATE 하지 말고**, 결제/배송 등은 **자기 테이블만 수정**한 다음 **`updateOrderStatus(connection, orderId)`** 를 호출해, aggregator가 다시 계산해서 status를 갱신하게 함.

---

## 6. sessionStorage에 배송/결제 정보 저장

**분류**: Major(정책 강하면) / Minor(단순 편의 저장이면)

### 6.1 문제점

- **위치**: `checkout-script.js` 등 — `sessionStorage.setItem('checkoutShippingData', JSON.stringify(shippingData))`
- **현상**: 이메일, 주소, 수령인 등 개인정보가 **평문**으로 같은 탭의 sessionStorage에 저장됩니다.
- **문제**: 브라우저 개발자 도구나 같은 출처의 스크립트로 접근 가능합니다. “가능한 한 개인정보를 저장하지 않는다”는 정책이나, 동일 기기에서의 노출 최소화 관점에서는 개선 여지가 있습니다.

### 6.2 영향

- **보안**: 동일 기기·동일 탭을 쓰는 경우에만 접근 가능하므로, 원격 해킹에 직접 노출되는 수준은 아닙니다. 다만 기기 분실·공용 PC·XSS 등이 겹치면 노출 위험이 커질 수 있습니다.
- **규정**: 개인정보 보호 정책에 “저장 최소화”가 있다면, sessionStorage에 장기 보관하는 것도 정책 검토 대상이 될 수 있습니다.

### 6.3 수정 방법

- **권장 우선순위**  
  1. **1순위**: 완료 페이지(order-complete 등) 로드 시점에 `sessionStorage.removeItem('checkoutShippingData')` — 구현 난이도 낮고 부작용 적음.  
  2. **2순위**: TTL 추가(저장 시각 함께 저장, N분 지나면 읽기 시 무시 또는 삭제).  
  3. **3순위**: 최소 저장(필드 축소) — 구조 변경이 커서 checkout-review.js, checkout-payment.js 등 연쇄 수정 발생.  
- **최소 저장**: 주문 생성/결제에 **필요한 필드만** 저장하고, 나머지는 저장하지 않거나 마스킹합니다.
- **생명주기**: 결제 완료(또는 주문 완료 페이지 표시) 후 `sessionStorage.removeItem('checkoutShippingData')` 등으로 즉시 삭제합니다.
- **선택**: 정책이 엄하면 “저장하지 않고, 필요한 순간만 폼/메모리에서 읽어 서버로 전달”하는 방식으로 바꾸고, 세션 토큰·결제 페이지 리다이렉트 등으로만 이어갈 수 있습니다.
- **draft(localStorage)**: `checkoutShippingDataDraft`에 shipping/items가 들어갈 수 있으므로, PII 최소화 정책을 적용할 경우 “draft에도 PII를 넣지 않도록 설계 변경 여부”를 별도로 검토하는 것이 좋습니다.

### 6.4 수정 시 미칠 영향

- **변하는 것**: sessionStorage에 들어가는 데이터 양·보관 시간이 줄어들고, 완료 후 삭제하면 같은 탭에서도 이후에는 조회되지 않습니다.
- **해결되는 것**: 개인정보 저장 최소화 및 노출 구간 축소. 정책/감사 대응이 수월해짐.
- **부수 효과**: 새로고침 시 “저장해 둔 배송 정보”가 없어질 수 있으므로, 필요하면 “임시 저장” 안내(예: 완료 전 새로고침 시 재입력 필요)를 UX에 반영하는 것이 좋습니다.

### 6.4.1 코드 관점의 영향 (수정 시 다른 코드에 미치는 영향)

- **checkoutShippingData를 쓰는 코드**
  - **저장(set)**: `checkout-script.js` — 524라인(배송 정보 제출 시), 763라인(다른 제출 경로). 두 곳 모두 `JSON.stringify(shippingData)` 형태로 저장합니다.  
  - **draft 복원**: `checkout-review.js` — 6~16라인. `sessionStorage.getItem('checkoutShippingData')`가 없으면 `localStorage.getItem('checkoutShippingDataDraft')`에서 복원한 뒤 `draft.data`를 그대로 `checkoutShippingData`에 다시 넣습니다. draft의 `data` 구조가 `{ shipping, items }`라고 가정하고 있습니다.
  - **읽기(read)**:  
    - **checkout-review.js** 6, 10, 14, 16, 27~38라인: `data.shipping`, `data.items`를 사용해 `renderShippingInfo(data.shipping)`, `renderOrderItems(data.items)`, `updateOrderSummary(data.items)` 호출.  
    - **checkout-payment.js** 56~69라인: `sessionStorage.getItem('checkoutShippingData')`로 읽어 `data`를 만든 뒤 `renderOrderItems(data.items)`, `updateOrderSummary(data.items)`, `renderShippingSummary(data.shipping)`, `bindEventListeners(data)`에 전달합니다.

- **저장 형식/필드를 바꿀 때**
  - **최소 저장(필수 필드만 저장)**으로 바꾸면, **읽는 쪽이 기대하는 필드**가 없어질 수 있습니다.  
    - `checkout-review.js`의 `renderShippingInfo(shipping)`는 `recipient_name` 또는 `recipient_first_name`/`recipient_last_name`, `email`, `phone`, `address`, `city`, `postal_code`, `country`를 사용합니다.  
    - `checkout-payment.js`의 `renderShippingSummary`, `bindEventListeners(data)`는 같은 `data.shipping` / `data.items` 구조를 사용합니다.  
  - **필요한 수정**: (1) 저장 시점(`checkout-script.js` 524, 763)에서 넣는 객체를 “API에 필요한 최소 필드만”으로 줄이거나, (2) 그대로 두고 “완료 후 삭제”만 적용. (1)을 선택하면 **checkout-review.js**, **checkout-payment.js**에서 `data.shipping`/`data.items`를 사용하는 모든 곳이, **새 구조**에서 필요한 값을 읽도록 수정되거나, 저장 시 “표시용 필드”를 별도 키로 두고 읽을 때 합쳐서 쓰도록 해야 합니다.  
  - **정리**: 저장 키 이름(`checkoutShippingData`)을 바꾸지 않고 **내용만** 바꾸면, 위 두 파일의 파싱 및 `data.shipping`/`data.items` 사용부가 새 형식에 맞게 수정되어야 하며, draft 복원 로직(`checkout-review.js`)도 새 형식과 호환되도록 해야 합니다.

- **완료 후 삭제(removeItem)를 넣을 때**
  - **삭제 호출 위치**: 주문 완료 페이지로 이동하기 직전(예: `checkout-script.js`의 `window.location.href = order-complete.html...` 직전) 또는 order-complete.html 로드 시 한 번만 실행되도록 하면 됩니다.  
  - **영향**: `checkoutShippingData`를 **이후에** 읽는 코드는 없습니다. 결제·주문 완료 후에는 결제 페이지/완료 페이지로 이동하므로, “완료 후 삭제”를 추가해도 **checkout-review.js**, **checkout-payment.js**는 “결제 전” 단계에서만 읽기 때문에 동작이 깨지지 않습니다.  
  - **주의**: “주문 완료” 전에 새로고침하거나 뒤로가기하면, 삭제를 “주문 생성 성공 직후”에 한다면 이미 삭제된 상태일 수 있어, 사용자가 결제 단계에서 새로고침 시 “배송 정보를 찾을 수 없습니다”가 나올 수 있습니다. 따라서 삭제 시점은 **order-complete.html로의 이동 직전** 또는 **order-complete.html 내부**로 두는 것이 안전합니다.

### 6.5 요약

| 구분 | 내용 |
|------|------|
| **무엇이 문제인가** | 배송/결제 정보가 sessionStorage에 평문·과다 저장되고, 완료 후에도 남을 수 있어 개인정보 최소 저장 원칙에 맞지 않을 수 있음. |
| **무엇을 어떻게 고치는가** | 필수 필드만 저장, 결제/주문 완료 후 삭제; 정책에 따라 “저장 안 함”으로 바꿀 수 있음. |
| **고치면 무엇이 해결되는가** | 개인정보 노출 구간·보관 기간 축소, 정책 준수. |

### 6.5.1 초보자용 요약

- **왜 sessionStorage에 저장하나**: 체크아웃 중에는 배송 정보(이름·주소·연락처·이메일 등)를 **결제 페이지·주문 완료 페이지로 넘기기 위해** `checkoutShippingData`라는 키로 sessionStorage에 잠시 저장합니다. 같은 탭에서만 유효하고, 새로고침 시 유지되므로 "배송 정보 입력 → 결제" 구간에서 편의를 위해 쓰는 방식입니다.
- **문제가 되는 점**: 주문이 **완료된 뒤에도** 이 키를 지우지 않으면, 이름·주소·전화번호 등 **개인정보(PII)**가 그대로 남습니다. 같은 PC를 쓰는 다른 사람이 개발자 도구로 볼 수 있고, 탭 공유·공용 PC에서는 노출 위험이 있습니다. “필요한 동안만 보관하고, 완료 후에는 바로 삭제”하는 것이 개인정보 최소 저장 원칙에 맞습니다.
- **어디서 삭제하나**: 이 프로젝트에서는 **주문 완료 페이지(order-complete.html)**를 로드한 뒤, 서버에서 주문 정보를 성공적으로 받아 화면에 표시했을 때 **`order-complete-script.js`** 안에서 `sessionStorage.removeItem('checkoutShippingData')`를 한 번 호출합니다. 체크아웃 스크립트에서 완료 페이지로 넘기는 경로와, 결제 페이지(토스 등) successUrl로 넘기는 경로 **둘 다** order-complete에 도착하므로, 이 한 곳에서 삭제하면 모든 경로에서 PII가 정리됩니다.

---

## 7. 재고 배정 시 FOR UPDATE SKIP LOCKED와 UX

**분류**: Minor (버그 아님, UX/정책 이슈)

### 7.1 문제점

- **가능한 리뷰 코멘트**: “동시에 여러 주문이 들어오면 FOR UPDATE SKIP LOCKED 때문에 일부는 재고 부족으로 실패하고, 사용자에게만 ‘재고 부족’으로 보이면 UX가 나쁘다.”

### 7.2 분석

- **현재 구현**: `paid-order-processor.js`에서 재고는 “사전 검증(COUNT)” 후 “FOR UPDATE SKIP LOCKED”로 행을 잠그고, 필요 수량만큼 잡히지 않으면 재고 부족으로 예외를 던집니다. 이는 **동시성과 재고 정합성을 위한 올바른 선택**입니다.
- **리뷰 포인트**: “코드 버그”라기보다는, 동시 주문이 몰릴 때 **실패 빈도**와 **사용자에게 보여주는 메시지/재시도**에 대한 정책·UX 이슈에 가깝습니다.

### 7.3 수정 방법 (코드보다는 정책/UX)

- **코드 변경 필수 아님**: 락 방식 자체를 바꾸면 재고 과다 판매나 데드락 위험이 생길 수 있으므로, 현재 패턴을 유지하는 것이 안전합니다.
- **개선 권장**:
  - 재고 부족 시 사용자 메시지를 명확히 합니다. 예: “선택하신 상품의 재고가 일시적으로 부족합니다. 잠시 후 다시 시도해 주세요.”
  - 결제 실패/주문 실패 화면에서 “다시 시도” 버튼이나 장바구니로 돌아가는 경로를 제공해, 동시성으로 인한 일시적 실패를 사용자가 자연스럽게 재시도할 수 있게 합니다.
  - 필요하면 “인기 상품 재고 알림” 등으로 부하를 분산시키는 정책을 검토할 수 있습니다.

### 7.4 수정 시 미칠 영향

- **변하는 것**: (코드 변경이 없으면) 동시성 처리 로직은 그대로이고, 메시지/버튼만 바뀌어 사용자가 재고 부족 상황을 더 잘 이해하고 재시도하기 쉬워집니다.
- **해결되는 것**: “갑자기 재고 부족”에 대한 불만과 이탈을 줄이는 UX 개선.

### 7.4.1 코드 관점의 영향 (수정 시 다른 코드에 미치는 영향)

- **재고 락(FOR UPDATE SKIP LOCKED)을 사용하는 코드**
  - **위치**: `backend/utils/paid-order-processor.js` — 재고 조회·잠금 시 `FOR UPDATE SKIP LOCKED` 사용(약 272~297라인). 필요 수량만큼 행이 잡히지 않으면 예외를 던져 주문 처리 중단.
  - **호출 관계**: `processPaidOrder`는 **payments-routes.js**(결제 확인 콜백) 등에서 호출됩니다. 재고 부족 시 processPaidOrder에서 throw → payments-routes의 catch에서 클라이언트에 에러 응답.

- **락 방식 자체를 바꾸지 않는 경우 (권장)**
  - **paid-order-processor.js**의 쿼리/락 로직은 수정하지 않으므로, **payments-routes.js** 및 그 상위 호출부(API 라우트)는 **코드 변경 없음**.  
  - **메시지/재시도 UX만 개선**할 때:
    - **백엔드**: 재고 부족 시 클라이언트로 내려주는 **에러 메시지**와 **코드**를 명확히 하려면, `paid-order-processor.js`에서 던지는 에러 메시지 또는 `payments-routes.js`의 catch에서 응답 body에 넣는 메시지를 수정합니다. 이때 **다른 에러(결제 실패, DB 오류 등)와 구분**할 수 있도록 `code: 'INSUFFICIENT_STOCK'` 같은 값을 함께 주면, 프론트에서 “재고 부족 전용” 문구·재시도 버튼을 보여주기 쉽습니다.
    - **프론트엔드**: 결제 실패 시 에러를 표시하는 코드(**checkout-payment.js**의 결제 콜백 처리, 또는 결제 완료/실패 리다이렉트를 받는 페이지)에서, 위 `code` 또는 메시지 내용에 따라 “선택하신 상품의 재고가 일시적으로 부족합니다. 잠시 후 다시 시도해 주세요.” 및 “다시 시도”/“장바구니로” 버튼을 노출하도록 **분기 추가**만 하면 됩니다. 기존 재고 락·processPaidOrder 호출 흐름은 그대로이므로, 다른 라우트나 스크립트는 수정할 필요 없습니다.

- **만약 락 방식을 바꿀 경우 (비권장)**
  - `FOR UPDATE SKIP LOCKED`를 제거하고 일반 `FOR UPDATE`로 바꾸면, 동시 요청 시 **대기·데드락** 가능성이 생깁니다. 반대로 SKIP LOCKED를 유지하되 “부족 시 재시도” 로직을 백엔드에 넣으면, paid-order-processor 내부와 호출부(payments-routes) 쪽에 재시도 횟수·대기 시간 등이 관여하게 되어, **paid-order-processor.js**와 **payments-routes.js** 모두 수정이 필요하고, 트랜잭션 보유 시간이 길어져 다른 주문에 영향을 줄 수 있습니다. 따라서 문서 권장대로 **락 코드는 유지**하고, **메시지와 프론트 UX만** 수정하는 것이 안전합니다.  
- **결제 확정 이후 재고 부족 시**: 현재 구현은 processPaidOrder 실패 시 트랜잭션 롤백 후 클라이언트에 에러 응답하며, paid_events는 별도 커넥션으로 이미 생성된 상태입니다. “결제 확정(paid_events 생성) 후 재고 부족으로 processPaidOrder만 실패”한 경우 **자동 환불/결제 취소** 경로가 있는지 운영·정책에서 확인해 두는 것이 좋습니다. 없으면 고객 CS(이미 결제됐는데 주문 미완료) 대응 정책을 별도로 두는 것을 권장합니다.

### 7.5 요약

| 구분 | 내용 |
|------|------|
| **무엇이 문제인가** | 재고 락 방식의 “버그”라기보다, 동시 주문 시 재고 부족 실패가 자주 나올 수 있고, 그에 대한 안내/재시도가 부족할 수 있음. |
| **무엇을 어떻게 고치는가** | 재고 락 코드는 유지하고, 재고 부족 메시지·재시도/장바구니 복귀 UX를 보강. |
| **고치면 무엇이 해결되는가** | 사용자 이해도와 재시도 가능성 향상, 일시적 재고 경합에 대한 불만 완화. |

---

## 8. 코드베이스 검증 결과 (현재 수정 여부)

아래는 문서 1~7번 이슈에 대해 **실제 코드를 읽어** 수정이 되어 있는지 여부를 정리한 결과입니다. (검증 일자: 코드 스냅샷 기준)

| # | 이슈 | 수정 여부 | 검증 근거 |
|---|------|-----------|-----------|
| **1** | createOrderPayload: 유효하지 않은 아이템 filter 제거 → 부분 주문 가능 | **서버 방어 반영됨** | 클라이언트: `utils/checkout-utils.js`에서 유효하지 않으면 throw(부분 주문 불가). 서버: `order-routes.js`에서 order_items bulk insert 후 `affectedRows !== orderItemsData.length` 시 롤백·500·`code: 'ORDER_ITEMS_MISMATCH'` 반환. |
| **2** | checkout-utils.js에서 console.error 사용 | **해당 없음(이미 Logger)** | `utils/checkout-utils.js`: 검증 실패 시 `window.Logger.warn` 사용(35, 42, 68라인). console 직접 호출 없음. |
| **3** | processPaidOrder 실패 시 paid_event_processing 상태 | **해당 없음(이미 구현)** | `backend/utils/paid-order-processor.js` 798~800: catch 블록에서 `updateProcessingStatus(paidEventId, 'failed', error.message)` 호출 확인. |
| **4** | 결제 확인 API에서 orderId 사용 방식 | **해당 없음(이미 안전)** | `backend/payments-routes.js`: 요청에서 `orderNumber`, `paymentKey`, `amount`만 수신. `WHERE order_number = ? AND user_id = ?` 로 주문 조회(110~116). `order_id`는 조회 결과만 사용. amount는 `serverAmount`(DB)와 `clientAmount` 비교 후 불일치 시 400(289~302). |
| **5** | orders.status 직접 업데이트와 SSOT | **유지(단일 경로)** | `UPDATE orders SET status` 는 `backend/utils/order-status-aggregator.js` 111라인 한 곳만. `PUT /api/admin/orders/:orderId/status` 는 `backend/index.js` 1914라인 부근 주석으로 제거 명시, 라우트 핸들러 없음. |
| **6** | sessionStorage에 배송/결제 정보 저장 및 완료 후 삭제 | **수정됨** | `order-complete-script.js`: 주문 정보 로드 성공 시 `sessionStorage.removeItem('checkoutShippingData')` 호출 추가(serverCurrencyInfo 제거와 동일 블록). 체크아웃·결제 successUrl 양쪽 경로 모두 order-complete 도착 시 삭제됨. |
| **7** | 재고 배정 FOR UPDATE SKIP LOCKED와 UX | **수정됨** | `paid-order-processor.js`: 재고 부족 시 `err.code = 'INSUFFICIENT_STOCK'` 설정 후 throw. `payments-routes.js`: TOSS confirm은 409 + `code: 'INSUFFICIENT_STOCK'` 반환, 이니시스는 `/checkout-payment.html?status=fail&code=INSUFFICIENT_STOCK` 리다이렉트. `order-complete-script.js`: 해당 코드 시 전용 문구 + "장바구니로 이동" 버튼. `checkout-payment.js`: URL `code=INSUFFICIENT_STOCK` 시 안내 후 장바구니 이동. |

---

## 9. 추가 코드 리뷰 (보안·효율·일관성·명품감·유지보수)

문서 1~7 이외에, 주문 흐름 및 연관 코드를 기준으로 **보안**, **효율**, **수정 권장**, **명품 사이트 관점 이질감**, **불필요/위험 코드**, **차후 문제 가능성**을 정리했습니다. 수정은 추후 진행 예정입니다.

### 9.1 보안

- **createOrderPayload 예외 시 checkout-payment.js 처리**
  - `checkout-payment.js` 246, 391라인: `createOrderPayload` 호출이 try 블록 안에 있으나, throw 시 사용자 메시지는 catch의 일반 메시지(`결제 처리 중 오류가 발생했습니다...`)로만 노출됨. 옵션 A(전부 유효할 때만 주문) 적용 시, "일부 상품 정보가 올바르지 않습니다. 장바구니를 확인해 주세요." 등 **전용 메시지 분기**를 두는 것이 좋음.
- **Idempotency Key 로깅**
  - `checkout-script.js` 1125: `console.log('🔑 Idempotency Key 생성:', idemKey);` — 프로덕션에서 Idempotency 키 전체 노출은 필요 시 추적용으로만 제한하고, 규칙에 따라 Logger + 마스킹(앞뒤 일부만) 권장.
- **에러 응답 시 상세 정보 노출**
  - 404/403 시 "주문을 찾을 수 없습니다" 등 메시지가 주문 존재 여부를 유추하게 할 수 있음. 현재 수준은 일반적이나, 정책상 정보 노출 최소화가 필요하면 메시지 통일 검토.

### 9.2 효율

- **주문 생성 시 상품 조회 N+1**
  - `order-routes.js` 526~562: `for (const item of items)` 내부에서 항목마다 `SELECT ... FROM admin_products WHERE id = ?` 실행. item 수만큼 쿼리 발생. 상품 ID 목록을 한 번에 조회한 뒤 맵으로 매칭하면 쿼리 1회로 축소 가능.
- **order_items INSERT 루프**
  - 624~655: `orderItemsData` 순회하며 항목당 `INSERT INTO order_items` 1회. 트랜잭션 내 bulk insert(한 번에 여러 행)로 변경 시 부하 감소에 유리.

### 9.3 수정 권장 (동작·정책)

- **주문 생성 후 order_items 수 검사**
  - 서버에서 "요청 items 수 = 실제 생성된 order_items 수" 검사가 없음. `order-routes.js` 에서 INSERT 루프 후 `SELECT COUNT(*) FROM order_items WHERE order_id = ?` 등으로 개수 확인하고, items.length와 다르면 롤백 후 500/400 반환하는 **방어 로직** 추가 권장.
- **resolveProductIdBoth 실패 시**
  - `order-routes.js` 579~585: `!productIds` 일 때 경고만 하고 `itemData.product_id` 로 INSERT 계속 진행. 상품이 없으면 400으로 거부하는 것이 정책상 안전할 수 있음(현재는 "기존 동작 유지"로 경고만).
- **checkout-script.js processPayment 성공 후**
  - 6번 반영: order-complete 로드 시 `order-complete-script.js`에서 `checkoutShippingData` 삭제 추가됨. 리다이렉트 직전 삭제는 선택 사항(현재는 완료 페이지 한 곳만 적용).

### 9.4 로깅·일관성

- **console 사용**
  - `checkout-script.js`: `console.log`/`console.error` 다수(35회 수준). 프로젝트 규칙(Logger 사용)과 맞추려면 점진적 Logger 전환 및 프로덕션에서 불필요 로그 제거 권장.
  - `checkout-payment.js`: console 사용 1회 수준. 동일하게 Logger로 통일 가능.
  - `order-complete-script.js` 264: `console.error` — Logger 또는 최소한 에러 리포팅 정책에 맞게 통일 권장.

### 9.5 명품/프리미엄 사이트 관점 이질감

- **에러 메시지 톤**
  - "주문 생성 실패", "결제에 실패했습니다" 등만으로는 사용자에게 다음 행동(장바구니 확인, 재시도, 문의)이 불명확할 수 있음. 재고 부족·일시 오류·입력 오류 등 **원인별 짧은 안내 문구**와 CTA(다시 시도, 장바구니로)가 있으면 프리미엄 경험에 부합.
- **처리 중 상태 노출**
  - "처리 중..." 텍스트만 있는 경우, 로딩 인디케이터나 스켈레톤 등 시각적 피드백을 함께 두면 체크아웃 신뢰도 향상.

### 9.6 불필요/위험 가능 코드

- **중복된 배송 수집 함수**
  - `checkout-script.js` 에 `collectShippingData()` 와 `collectOrderData()` 가 있으며, 배송 필드 구성이 거의 동일. 단일 소스로 통합하면 수정 시 실수 가능성 감소.
- **주문 완료 후에도 checkoutShippingData 유지**
  - 6번 반영: order-complete 로드·주문 정보 표시 성공 시 `checkoutShippingData` 삭제 추가됨. 완료 후 PII 보관 제거 완료.

### 9.7 차후 문제 가능성

- **createOrderPayload 정책 변경 시**
  - 옵션 A(유효하지 않으면 throw)로 바꾸면 `checkout-payment.js` 두 경로(토스/이니시스)에서 throw가 catch되지만, 메시지가 일반 메시지로만 나갈 수 있어 사용자가 "장바구니 확인"으로 유도되지 않을 수 있음. 정책 변경 시 **에러 메시지 매핑**을 함께 반영할 것.
- **비회원 주문 + guestToken**
  - order-complete 등에서 `guestToken` 파라미터로 비회원 주문 조회가 이어짐. 토큰 유출 시 해당 주문 정보 노출 가능. 토큰 만료·1회성 정책이 문서/구현에 명확히 있는지 확인 권장.
- **다국어/통화**
  - 현재 국가별 규칙(COUNTRY_RULES)과 통화 결정이 서버에 있으나, 에러 메시지나 클라이언트 문구는 한글 고정일 수 있음. 확장 시 메시지 소스 통일·다국어 대비를 미리 고려하면 유리.

### 9.8 코드베이스 검증 결과 (9절 항목별)

아래는 9.1~9.7 항목을 **실제 코드 기준**으로 확인한 결과입니다.

| 절 | 항목 | 검증 결과 | 비고 |
|----|------|-----------|------|
| **9.1** | createOrderPayload 예외 시 전용 메시지 | **반영됨** | `checkout-payment.js` 254~266, 416~427: `isValidationError` 분기로 "일부 상품 정보가 만료되었거나..." 등 전용 문구 표시 후 return. |
| **9.1** | Idempotency Key 로깅 | **반영됨** | `checkout-script.js` 1126: `Logger.log` + 키 마스킹(앞4자+…+뒤4자). |
| **9.1** | 에러 응답 상세 노출 | **정책 검토** | 코드 변경 없음. 필요 시 메시지 통일만 검토. |
| **9.2** | 주문 생성 N+1 | **반영됨** | `order-routes.js`: 상품 ID 목록 `IN (?)` 1회 조회 후 `productMap`으로 매칭. |
| **9.2** | order_items INSERT 루프 | **반영됨** | `order-routes.js`: order_items bulk insert(한 번에 여러 행) 적용. |
| **9.3** | order_items 수 검사 | **반영됨** | bulk insert 후 `affectedRows !== orderItemsData.length` 시 롤백·500·`ORDER_ITEMS_MISMATCH`. |
| **9.3** | resolveProductIdBoth 실패 시 | **반영됨** | `!productIds` 시 롤백 후 400·`VALIDATION_ERROR` 반환. |
| **9.3** | checkout processPayment 성공 후 | **반영됨** | 6번에 따라 order-complete에서 `checkoutShippingData` 삭제. |
| **9.4** | console → Logger (checkout-script 등) | **반영됨** | `checkout-script.js`, `checkout-payment.js`, `order-complete-script.js`에서 console 사용 없음, Logger 사용. |
| **9.5** | 에러 메시지 톤 / 처리 중 상태 | **권장 사항** | 재고 부족(7번)은 전용 문구·CTA 적용됨. 나머지는 원인별 문구·로딩 UI 등 점진 개선 가능. |
| **9.6** | 중복 배송 수집 함수 | **반영됨** | `collectOrderData()` 제거, 배송 수집은 `collectShippingData()` 단일 소스 사용. |
| **9.6** | 완료 후 checkoutShippingData | **반영됨** | 6번: order-complete 로드 성공 시 삭제. |
| **9.7** | createOrderPayload 정책 변경 등 | **참고** | 정책/확장 시 에러 메시지 매핑·guestToken·다국어만 참고하면 됨. |

### 9.9 미반영 항목 수정 시 영향·리스크·연쇄 수정

아래는 미반영 항목을 **실제로 수정할 때** 예상되는 영향, 문제·보안, 그리고 함께 손봐야 할 코드를 정리한 것입니다.

---

#### 1번 — 서버 방어: 요청 items 수 vs 생성된 order_items 수 검사

| 구분 | 내용 |
|------|------|
| **수정 위치** | `backend/order-routes.js` — order_items INSERT 루프(624~651) **직후**, `connection.commit()` 직전. |
| **수정 예시** | `const [countResult] = await connection.execute('SELECT COUNT(*) AS cnt FROM order_items WHERE order_id = ?', [orderId]); const inserted = countResult[0]?.cnt \|\| 0; if (inserted !== orderItemsData.length) { await connection.rollback(); await connection.end(); return res.status(500).json({ code: 'ORDER_ITEMS_MISMATCH', details: { message: '주문 항목 처리 중 오류가 발생했습니다.' } }); }` |
| **영향** | 정상 경로에는 영향 없음. INSERT 일부만 성공한 비정상 케이스에서만 롤백 후 500 반환. |
| **리스크** | COUNT와 INSERT 사이에 다른 트랜잭션이 끼어들 가능성은 없음(같은 트랜잭션 내). 롤백 시 `orders` 행도 함께 롤백되므로 정합성 유지. |
| **보안** | 사용자에게 "항목 수 불일치"를 상세히 알리지 않고 일반 오류 메시지로 처리하면 정보 노출 최소화. |
| **연쇄 수정** | 없음. 클라이언트는 기존대로 500 시 "주문 생성 실패" 등으로 처리하면 됨. 필요 시 `code: 'ORDER_ITEMS_MISMATCH'`로 재시도/장바구니 유도 가능. |

---

#### 2번 — checkout-utils.js에서 console 사용

| 구분 | 내용 |
|------|------|
| **현재 상태** | `utils/checkout-utils.js`에는 **console 직접 호출 없음**. 검증 실패 시 `window.Logger.warn` 사용(35, 42, 68라인). 주석에 "console 대신 Logger 사용" 명시. |
| **수정 필요 여부** | 문서 §8 "2번"은 과거 스냅샷 기준일 수 있음. 현재 코드 기준으로는 **추가 수정 불필요**. 신규로 console 추가하지 않도록만 유지. |
| **영향/연쇄** | 없음. |

---

#### 9.2 — 주문 생성 시 상품 조회 N+1 제거

| 구분 | 내용 |
|------|------|
| **수정 위치** | `backend/order-routes.js` 526~562: `for (const item of items)` **앞**에서 상품 ID 목록을 한 번에 조회한 뒤, 루프 안에서는 맵/배열 참조만 하도록 변경. |
| **수정 예시** | `const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];` → `SELECT id, name, price, image FROM admin_products WHERE id IN (?)` (placeholders 개수에 맞게). 조회 결과를 `Map(product_id -> row)`로 만든 뒤, 루프에서 `const product = productMap.get(item.product_id)` 등으로 사용. |
| **영향** | 동작 결과(총액, orderItemsData 구성)는 기존과 동일해야 함. **없는 product_id**는 현재는 400 반환하는데, IN 조회 시 해당 ID가 결과에 없으면 동일하게 400 처리 유지. |
| **리스크** | `IN (?)`에 빈 배열이 오면 SQL 오류 가능. `productIds.length === 0`이면 이미 상단 검사(items 길이 등)에서 걸리므로, 빈 IN은 방어 코드로 한 번 처리(예: early return 400). |
| **보안** | 없음. 조회 범위는 요청의 product_id로 한정되며, 기존과 동일. |
| **연쇄 수정** | 같은 블록 내 `orderItemsData` 구성 로직만 루프 내 SELECT 제거하고 맵 조회로 교체. 에러 응답 형식(`VALIDATION_ERROR`, details) 변경 없음. |

---

#### 9.2 — order_items INSERT 루프 → bulk insert

| 구분 | 내용 |
|------|------|
| **수정 위치** | `backend/order-routes.js` 624~651: `for (const itemData of orderItemsData)` 제거하고, 한 번의 `INSERT INTO order_items (...) VALUES (?,?,...), (?,?,...), ...` 또는 배치 실행. |
| **수정 예시** | MySQL: `INSERT INTO order_items (order_id, product_id, ...) VALUES (?, ?, ...), (?, ?, ...), ...` — 각 행 9개 컬럼, placeholders를 배열로 flatten. Node mysql2: `connection.execute(sql, flatValues)`. |
| **영향** | 트랜잭션 내에서 한 번에 여러 행 INSERT. 커밋/롤백 동작은 동일. |
| **리스크** | **placeholders 개수**와 **배열 길이** 불일치 시 SQL 오류. 단위 테스트 또는 소수 항목으로 회귀 테스트 권장. `resolveProductIdBoth` 결과(`productIds ? productIds.canonical_id : itemData.product_id`)를 그대로 bulk 배열에 넣으면 기존과 동일. |
| **보안** | 없음. |
| **연쇄 수정** | 없음. 단, **9.3 order_items 수 검사**를 같이 넣으면 "INSERT한 행 수 = orderItemsData.length"를 bulk 결과(affectedRows)로 검사할 수 있어, COUNT 쿼리 없이 방어 가능. |

---

#### 9.3 — order_items 수 검사

| 구분 | 내용 |
|------|------|
| **수정 위치** | `backend/order-routes.js` — order_items INSERT 직후(루프 또는 bulk). |
| **수정 예시** | (1) `SELECT COUNT(*) ... WHERE order_id = ?` 후 `items.length`와 비교. (2) 또는 bulk insert 시 `result.affectedRows === orderItemsData.length` 검사. 불일치 시 롤백 후 500. |
| **영향·리스크·보안** | **1번**과 동일. 1번과 9.3은 같은 방어 로직을 가리키므로, 한 번만 구현하면 됨. |

---

#### 9.3 — resolveProductIdBoth 실패 시 400 거부 (정책 선택)

| 구분 | 내용 |
|------|------|
| **수정 위치** | `backend/order-routes.js` 624~635: `if (!productIds)` 블록에서 **경고만** 하지 말고, **롤백 후 400 반환**하도록 변경. |
| **영향** | 현재는 "상품 ID를 찾을 수 없음"이어도 `itemData.product_id`로 INSERT를 시도함. 400으로 바꾸면 **그 항목이 있는 주문 생성 요청 전체가 실패**하고, 사용자에게 "일부 상품 정보가 올바르지 않습니다" 등 메시지 가능. |
| **리스크** | **이미 첫 번째 for (item of items)** 루프(528~534)에서 `productRows.length === 0`이면 400을 반환하므로, 정상적으로 들어온 items는 모두 admin_products에 존재함. **두 번째 루프**(order_items INSERT)에서만 `resolveProductIdBoth`를 쓰는데, 여기서 null이 나오는 경우는 product_id가 **문자열/타입 차이**로 조회가 안 되거나, **동시에 삭제된 상품** 등 드문 케이스. 그런 경우 400으로 거부하는 것이 정책상 더 안전함. |
| **보안** | 존재하지 않는 product_id로 order_items가 쌓이는 것을 막아, 데이터 정합성·운영 추적에 유리. |
| **연쇄 수정** | (1) **order-routes.js**: `if (!productIds)` 시 `connection.rollback()`, `connection.end()`, `return res.status(400).json({ code: 'VALIDATION_ERROR', details: { ... } })`. (2) **클라이언트**: 이미 400 시 "주문 생성 실패"·"장바구니 확인" 등으로 처리 중이면 메시지만 통일하면 됨. (3) **resolveProductIdBoth** 호출부는 order-routes.js 한 곳뿐이므로, 다른 파일 수정 없음. |

---

#### 9.6 — 중복 배송 수집 함수 통합 (collectShippingData / collectOrderData)

| 구분 | 내용 |
|------|------|
| **현재 상태** | `collectShippingData()` — 622, 946라인에서 **호출됨**. `collectOrderData()` — **정의만 있고 호출처 없음**. 두 함수 모두 배송 필드(recipient_name, email, phone, address 등)가 동일하고, `collectOrderData`만 `payment: {}`와 주석이 추가로 있음. |
| **수정 방향** | (1) `collectOrderData`를 제거하고, 필요 시 `collectShippingData()` 반환값에 `payment: {}`를 붙여 쓰는 쪽으로 통일. 또는 (2) `collectOrderData`를 `collectShippingData()`를 호출한 뒤 `payment: {}`를 넣어 반환하는 래퍼로만 두고, 배송 필드 수정은 `collectShippingData` 한 곳에서만 수행. |
| **영향** | 호출처가 `collectShippingData`뿐이므로, **collectOrderData를 삭제**해도 동작 변경 없음. 나중에 `collectOrderData()`를 쓰는 코드가 생기면, 그때는 `collectShippingData()` 기반으로 제공하면 됨. |
| **리스크** | 낮음. 배송 필드 추가/수정 시 한 곳만 수정하면 되어 실수 감소. |
| **보안** | 없음. |
| **연쇄 수정** | **checkout-script.js**만 수정. `collectOrderData` 정의부 제거(또는 래퍼로 축소). 다른 파일에서는 두 함수를 참조하지 않음. |

---

#### 요약: 수정 우선순위와 의존 관계

| 순서 | 항목 | 연쇄 | 비고 |
|------|------|------|------|
| 1 | **9.6** 중복 함수 정리 | checkout-script.js만 | 리스크 낮음, 즉시 적용 가능. |
| 2 | **2번** | 없음(이미 Logger 사용) | 검증만. |
| 3 | **9.2 N+1** | order-routes.js 내부만 | 상품 조회 1회화. |
| 4 | **9.2 bulk insert** | order-routes.js 내부만 | 9.3 수 검사와 같이 적용 시 affectedRows로 검사 가능. |
| 5 | **1번 / 9.3 order_items 수 검사** | order-routes.js, 클라이언트 500 처리 | 방어 로직 1곳 추가. |
| 6 | **9.3 resolveProductIdBoth 400** | order-routes.js, 클라이언트 400 메시지 | 정책 선택. 기존 "경고만" 유지도 가능. |

---

## 문서 정보

- **대상**: 주문 흐름(체크아웃 → 주문 생성 → 결제 확인 → paid_events → processPaidOrder → orders.status 집계).
- **SSOT 변경 여부**: 이 문서는 “코드 리뷰 정리”이며, DB 스키마나 공식 스펙 문서를 대체하지 않습니다. 수정 시 `db_structure_actual.txt`, `start_here.md` 등 기존 SSOT은 그대로 유지하고, 코드만 위 권장에 맞게 변경하면 됩니다.
- **참고**: 분류 기준은 `.cursor/skills/code-review-classifier`의 Critical/Major/Minor/Invalid 정의를 참고했으며, 프로젝트 규칙(Logger, SSOT, 트랜잭션, 보안)을 반영했습니다.
- **관측/재현**: 수정 적용 후 검증 시 사용할 **에러 코드**(예: `INSUFFICIENT_STOCK`, `VALIDATION_ERROR`), **로그 키**(예: `[payments][confirm]`, `주문 검증 실패`) 등을 체크리스트로 정리해 두면 디버깅과 회귀 테스트에 유리합니다.
- **8·9절**: 코드베이스 검증 결과(수정 여부) 및 추가 리뷰를 반영했으며, 9.2·9.3·9.6·서버 방어·ORDER_ITEMS_MISMATCH 클라이언트 처리 등 수정 완료.
