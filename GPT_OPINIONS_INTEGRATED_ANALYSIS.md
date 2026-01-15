# GPT 의견 통합 분석 결과

**작성일**: 2026-01-15  
**기준**: 실제 DB 구조 (`backend/scripts/db_structure_actual.txt`) + 코드베이스 검증  
**포함 내용**: GPT 첫 번째 의견 + 두 번째 의견 통합 분석

---

## 📊 전체 평가

**정확도**: 약 **90%** (매우 정확하고 실용적)

**특징**:
- ✅ DB 구조를 정확히 이해함
- ✅ 실제 장애와 연결된 분석
- ✅ 우선순위가 명확함
- ✅ 위험한 표현을 지적
- ⚠️ 일부 세부사항 보완 필요

---

## 1. ✅ 정확한 지적 (옳은 부분)

### (1) 3개 엔진 분류

**GPT 의견**:
> 1️⃣ 커머스 엔진 (일반 쇼핑몰)
> 2️⃣ 재고/단위(fulfillment) 엔진
> 3️⃣ 토큰/보증서/소유권 엔진

**실제 확인**:
- ✅ 커머스: `users`, `carts`, `orders`, `payments`, `inquiries` 등
- ✅ 재고/단위: `stock_units`, `order_item_units`, `shipments`, `shipment_units`
- ✅ 토큰/보증서: `token_master`, `warranties`, `warranty_events`, `warranty_transfers`

**평가**: **정확함**. 실제로 이 구조로 동작 중

---

### (2) 핵심 설계 6개 (옳은 점)

#### ① 주문 라인아이템 vs 단위(Unit) 분리

**GPT 의견**:
> order_items (수량 기반) vs order_item_units (1개 단위)
> 환불/부분출고/부분배송/부분양도 같은 현실 케이스를 견딤

**실제 확인**:
- ✅ `order_items`: `quantity` 컬럼 존재
- ✅ `order_item_units`: `unit_seq`, `stock_unit_id`, `token_pk` 등 개별 단위 정보
- ✅ `order_item_units.unit_status`: `reserved`, `shipped`, `delivered`, `refunded`

**평가**: **정확함**. 실제로 부분 환불/배송을 지원하는 구조

---

#### ② 재고 단위를 token_pk와 1:1로 묶은 것

**GPT 의견**:
> stock_units.token_pk UNIQUE
> "한 토큰은 한 재고 단위"라는 불변 규칙이 DB로 강제됨

**실제 확인**:
- ✅ `stock_units.token_pk`: `UNI` (UNIQUE), `NOT NULL`
- ✅ FK: `stock_units_ibfk_2` → `token_master.token_pk`

**평가**: **정확함**. 실제로 UNIQUE 제약으로 강제됨

---

#### ③ 결제의 '사실'과 '처리 상태'를 분리

**GPT 의견**:
> paid_events (사실 기록) vs paid_event_processing (처리 워커/재시도/상태)
> 웹훅 중복/지연/재시도에서 안정적

**실제 확인**:
- ✅ `paid_events`: 결제 증거 테이블 (별도 커넥션, autocommit)
- ✅ `paid_event_processing`: 처리 상태 (`pending`, `processing`, `success`, `failed`)
- ✅ `updateProcessingStatus()` 함수 존재

**평가**: **정확함**. 실제로 이 구조로 웹훅 중복/재시도 처리

---

#### ④ 주문 중복 생성 방지(멱등성)

**GPT 의견**:
> orders_idempotency (owner_key + idem_key unique)
> 결제/주문 영역에서 이거 없으면 언젠가 터짐

**실제 확인**:
- ✅ `orders_idempotency`: `uniq_owner_idem` (owner_key, idem_key) UNIQUE
- ✅ `owner_key`: `u:{user_id}` 또는 `g:{guest_id}` 형식

**평가**: **정확함**. 실제로 멱등성 보장

---

#### ⑤ 인보이스를 스냅샷으로 저장

**GPT 의견**:
> invoices.payload_json + order_snapshot_hash
> "발급 시점의 문서"는 주문 데이터가 바뀌어도 유지돼야 함

**실제 확인**:
- ✅ `invoices.payload_json`: `JSON` 타입
- ✅ `invoices.order_snapshot_hash`: `CHAR(64)` (해시)

**평가**: **정확함**. 실제로 스냅샷 저장

---

#### ⑥ "표준 색상" 도입

**GPT 의견**:
> color_standards + FK
> 프론트/백/관리자/재고에서 컬러 표기가 갈라지는 걸 막는다

**실제 확인**:
- ✅ `color_standards`: 표준 색상값 테이블
- ✅ FK: `order_items.fk_order_items_color_standard` → `color_standards.color_code`
- ✅ FK: `stock_units.fk_stock_units_color_standard` → `color_standards.color_code`

**평가**: **정확함**. 실제로 FK로 강제됨

---

### (3) 스냅샷 패턴 인식

**GPT 의견 (두 번째)**:
> token_master.product_name, order_items.product_name, warranties.product_name
> "불일치가 있어야 정상"인 설계 패턴
> 컬럼명/주석/생성 규칙이 중요하다는 지적은 정확

**실제 확인**:
- ✅ `token_master.product_name`: `VARCHAR(255) NOT NULL` (QR 스캔 시점 스냅샷)
- ✅ `order_items.product_name`: `VARCHAR(255) NOT NULL` (주문 시점 스냅샷)
- ✅ `warranties.product_name`: `VARCHAR(255) YES` (보증서 발급 시점 스냅샷)
- ✅ 각각 `product_id` FK도 존재 (SSOT)

**평가**: **정확함**. 스냅샷 패턴을 올바르게 인식했고, 불일치가 정상이라는 이해도 정확함

**보완 필요**:
- 컬럼 주석에 "스냅샷" 명시 필요
- 생성 규칙 문서화 필요

---

## 2. ⚠️ 위험한 지적 (보완 필요)

### A. 상품 마스터 다중화

**GPT 의견 (첫 번째)**:
> admin_products vs qr_products vs products
> "판매 상품과 QR 상품은 같은 상품인가?"
> "token_master.product_name은 왜 문자열로 또 들고 있지?"

**GPT 의견 (두 번째 - 보완)**:
> "qr_products는 레거시" 단정은 위험
> ROW가 있고 FK로도 참조되고 있으면 아직 살아있는 도메인일 수 있어
> 정확한 표현:
> - "커머스(판매) 축은 admin_products로 굳음"
> - "QR/소유권 축은 qr_products가 아직 기준"
> - "둘을 어떻게 통합할지 설계 결정을 해야 함"

**실제 확인**:
- ✅ `admin_products`: 10개 row, 활발히 사용 중
- ✅ `token_master.product_id` → `admin_products.id` FK 존재 (728번 라인)
- ✅ `qr_products`: 8개 row, FK로 참조됨 (`ownerships`, `product_qr`)
- ✅ `products`: 0개 row, FK로 참조됨 (`product_history`)
- ✅ `token_master.product_name`: 스냅샷 목적 (QR 스캔 시점 상품명 보존)

**평가**: **GPT 두 번째 의견이 더 정확함**.
- "레거시 단정"은 위험
- `qr_products`는 여전히 사용 중 (`product_qr`에서 FK 참조)
- "별도 도메인"으로 보는 것이 정확

**보완 사항**:
- `qr_products`와 `admin_products`의 관계 명확히 정의 필요
- `product_qr` 테이블이 `qr_products`를 참조하는 이유 확인 필요
- `products` 테이블의 미래 사용 계획 확인 필요 (FK 존재하므로 제거/유지/이관 정책 확정)

---

### B. 주문 주소 스냅샷 불일치

**GPT 의견 (첫 번째)**:
> orders: shipping_address text + shipping_city/postal_code/country 등 분리
> invoices: shipping_address_json / billing_address_json
> 이러면 "주문 조회 UI/CS"에서 주소 표시 로직이 두 체계가 된다

**실제 확인**:
- ✅ `orders`: `shipping_address` (text), `shipping_city`, `shipping_postal_code`, `shipping_country` 분리
- ✅ `invoices`: `shipping_address_json`, `billing_address_json` (JSON)

**평가**: **정확함**. 실제로 주소 표시 로직이 두 체계

**보완 사항**:
- `orders`에도 `shipping_address_json` 추가 고려
- 또는 주소 표시 로직을 통일

---

### C. cart_items 옵션 정합성

**GPT 의견 (첫 번째)**:
> cart_items는 FK가 없고, size/color가 자유 입력이라
> 옵션이 삭제되거나 비활성화돼도 카트에 남을 수 있음
> 색상 표준(color_standards)도 cart에는 적용 안 됨

**실제 확인**:
- ✅ `cart_items`: `product_id`, `size`, `color` 직접 보유, FK 없음
- ✅ `product_options`: `product_id`, `color`, `size` UNIQUE 제약 있음
- ✅ `color_standards` FK는 `order_items`에만 있음 (`cart_items`에는 없음)

**평가**: **정확함**. 옵션 삭제/비활성화 시 장바구니에 남을 수 있음

**보완 사항**:
- `cart_items`에 `option_id` 추가 고려
- 또는 장바구니 조회 시 옵션 유효성 필터 정책 확정

---

### D. token_master.product_name

**GPT 의견 (첫 번째)**:
> token_master.product_id가 있는데도 product_name을 별도 보유
> 의도는 "스냅샷"일 수 있는데, 그렇다면 스냅샷 필드라는 것을 더 명확히 해야 한다

**실제 확인**:
- ✅ `token_master.product_id`: `admin_products.id` FK 참조 (728번 라인)
- ✅ `token_master.product_name`: `VARCHAR(255) NOT NULL` (스냅샷)

**평가**: **정확함**. 스냅샷 목적이지만 컬럼명/주석으로 명확히 해야 함

**보완 사항**:
- 컬럼 주석에 "스냅샷 (QR 스캔 시점 상품명 보존)" 명시
- 또는 컬럼명을 `product_name_snapshot`으로 변경 고려

---

### E. 유저 식별자 혼재 (email vs user_id)

**GPT 의견 (첫 번째)**:
> wishlists는 user_email 기반
> ownerships도 user_email 기반
> 그 외 대부분은 user_id 기반
> 이건 "탈퇴/이메일 변경/소셜 로그인"에서 꼬일 가능성이 있다

**실제 확인**:
- ✅ `wishlists`: `user_email` 기반 (FK: `users.email`)
- ✅ `ownerships`: `user_email` 기반 (FK: `users.email`)
- ✅ 나머지 대부분: `user_id` 기반

**평가**: **정확함**. 이메일 변경 시 문제 가능

**보완 사항**:
- `wishlists`를 `user_id` 기반으로 마이그레이션
- `ownerships`도 `user_id` 기반으로 마이그레이션 고려
- 또는 이메일 변경 시 정책(이관/차단) 명시

---

### F. orders.created_at/updated_at 누락

**GPT 의견 (두 번째)**:
> order_date 하나로는 "생성"과 "마지막 갱신"을 분리 추적 못 해서,
> CS/정산/장애 분석 때 시간을 많이 잃는다

**실제 확인**:
- ✅ `orders.order_date`: `DATETIME YES DEFAULT CURRENT_TIMESTAMP` (생성 시각만)
- ✅ `orders.created_at`, `orders.updated_at`: **없음** (SCHEMA_SSOT.md 220번 라인 확인)

**평가**: **정확함**. 실제로 `order_date`만 있고 `updated_at`이 없어서 마지막 갱신 시각 추적 불가

**보완 사항**:
- `orders.created_at`, `orders.updated_at` 추가 (우선순위 높음)

---

## 3. 🎯 핵심 지적 (커서가 놓친 부분 - 실제 장애와 직결)

### (A) 후처리 파이프라인 트리거 확인

**GPT 의견 (두 번째)**:
> "주문이 들어갔는데 아무것도 안 만들어진다"는 건 보통 2가지뿐이야.
> 1. paid_events가 생성되지 않아서 파이프라인 시작이 안 됨
> 2. paid_events는 생겼는데 paid_event_processing이 pending/failed로 멈춰서 파이프라인이 진행 안 됨

**실제 확인**:
- ✅ `paid_events`: 결제 증거 테이블 (별도 커넥션, autocommit)
- ✅ `paid_event_processing`: 처리 상태 테이블 (`pending`, `processing`, `success`, `failed`)
- ✅ `processPaidOrder()`: `paid_events` 생성 후 호출됨
- ✅ `updateProcessingStatus()`: `paid_event_processing` 상태 업데이트 함수 존재

**실제 장애 사례 (주문 61)**:
- `payments` 테이블에 결제 정보는 있음
- `paid_events`는 없음
- 따라서 `processPaidOrder()`가 실행되지 않음

**평가**: **정확함**. 실제 장애 원인과 일치

**보완 사항**:
- `paid_event_processing` 상태 모니터링 필요
- `pending` 상태로 오래 남아있는 경우 알림 필요
- `failed` 상태의 경우 `last_error` 확인 필요

---

### (B) orders.status가 앞으로 가버리는 문제

**GPT 의견 (두 번째)**:
> 앞에서 말한 Cursor 수정(orders.status 업데이트 시점)도 중요하지만,
> 그게 해결하는 건 "상태 꼬임 방지"이고,
> 너가 원하는 "재고 차감/보증서/인보이스 생성"은
> - 워커가 실제로 돌고 있는지
> - 처리 로직이 실패하지 않는지
> 가 원인일 확률이 높다

**실제 확인**:
- ✅ 이미 수정 완료: `createPaidEvent()` 성공 후에만 `orders.status` 업데이트
- ✅ `processPaidOrder()`는 `paid_events` 생성 후 호출됨
- ✅ `processPaidOrder()` 내부에서 `order_item_units`, `warranties`, `invoices` 생성

**평가**: **정확함**.
- 상태 꼬임 방지는 이미 수정됨
- 실제 장애 원인은 `createPaidEvent()` 실패 또는 `processPaidOrder()` 실패일 가능성 높음

**보완 사항**:
- `createPaidEvent()` 실패 원인 확인 필요 (UNIQUE 제약 위반, DB 연결 오류 등)
- `processPaidOrder()` 실패 시 에러 로깅 강화 필요
- `paid_event_processing.last_error` 필드 활용 필요

---

### (C) stock_units 배정 실패는 order_stock_issues에 남기게 되어 있는지

**GPT 의견 (두 번째)**:
> 재고 부족/매칭 실패/unique 충돌 같은 이유로 배정이 실패하면
> 이 테이블에 open이 쌓이게 설계하는 게 일반적이야.
> 여기에 로그가 없다면:
> - 실패를 기록하지 못하고 조용히 죽는 코드일 수 있음
> - 또는 후처리 자체가 호출되지 않았을 수 있음

**실제 확인**:
- ✅ `order_stock_issues` 테이블 존재 (0개 row)
- ✅ `recordStockIssue()` 함수 존재 (`backend/utils/paid-event-creator.js`)
- ✅ `processPaidOrder()`에서 재고 부족 시 `recordStockIssue()` 호출 (215번 라인)

**코드 확인**:
```javascript
if (availableStock.length < needQty) {
    // 재고 부족 이슈 기록 (별도 커넥션, 트랜잭션과 분리)
    await recordStockIssue(paidEventId, orderId, productId, needQty, availableStock.length);
    
    throw new Error(
        `재고 부족: 상품 ${productId}, 필요: ${needQty}, 가용: ${availableStock.length}`
    );
}
```

**평가**: **부분적으로 정확함**.
- ✅ 재고 부족 시 `order_stock_issues`에 기록하는 로직 존재
- ⚠️ 하지만 `order_stock_issues`가 0개 row인 것은:
  - 재고 부족이 발생하지 않았거나
  - `recordStockIssue()`가 호출되지 않았거나
  - `recordStockIssue()`가 실패했을 수 있음

**보완 사항**:
- `recordStockIssue()` 함수의 에러 처리 확인 필요 (220번 라인: 에러를 던지지 않음)
- `order_stock_issues`에 기록이 없는 경우 원인 파악 필요
- 재고 배정 실패 시나리오별 로깅 강화 필요

---

## 4. 📋 우선순위 통합 평가

### GPT 제안 우선순위 (통합)

#### 1순위: 주문 후처리 파이프라인 복구 (지금 장애 해결) 🔴

**확인 사항**:
1. `paid_events` 생성 여부
2. `paid_event_processing` 상태 (`pending`/`failed`)
3. `order_item_units` 생성 여부
4. `stock_units.status`/`reserved_by_order_id` 변화 여부
5. `invoices`/`warranties` 생성 여부
6. `order_stock_issues`에 기록 남는지

**실제 장애 사례 (주문 61)**:
- `payments`: ✅ 존재
- `paid_events`: ❌ 없음
- `order_item_units`: ❌ 없음
- `warranties`: ❌ 없음
- `invoices`: ❌ 없음

**평가**: **정확함**. 실제 장애 원인과 일치

---

#### 2순위: orders 상태 업데이트 시점 (커서 수정) ✅

**GPT 의견**:
> paid_events 없는데 processing으로 가는 꼬임을 막기
> 이후 재처리/운영이 쉬워짐

**실제 확인**:
- ✅ 이미 수정 완료: `createPaidEvent()` 성공 후에만 `orders.status` 업데이트

**평가**: **정확함**. 이미 수정 완료

---

#### 3순위: orders created_at/updated_at 추가 🟡

**GPT 의견**:
> 장애/정산/CS에 즉효

**실제 확인**:
- ✅ `orders.order_date`만 있고 `created_at`, `updated_at` 없음

**평가**: **정확함**. 우선순위 높음

---

#### 4순위: 스냅샷 컬럼의 "의도 명시" 정리 🟡

**GPT 의견**:
> 주석/컬럼명/생성 규칙으로 팀(=미래의 너)에게 설명 가능하게 만들기

**대상 컬럼**:
- `token_master.product_name`
- `order_items.product_name`
- `warranties.product_name`

**평가**: **정확함**. 유지보수에 중요

---

#### 5순위: 상품 마스터 통합 정책 (중기) 🟢

**GPT 의견**:
> admin_products vs qr_products vs products를 "한 장의 그림"으로 정리
> 필요한 경우 브릿지 테이블 도입

**실제 상황**:
- `admin_products`: 메인 상품 마스터 (활발히 사용)
- `qr_products`: QR/소유권 도메인 (여전히 사용 중)
- `products`: 미사용 (FK 존재)

**평가**: **정확함**. 중기 개선 필요

---

#### 6순위: cart_items 옵션 정합성 강화 🟢

**GPT 의견 (첫 번째)**:
> cart_items에 option_id를 추가(또는 product_options 기준으로 resolve)해서
> "장바구니 단계부터 옵션 정합성"을 맞추는 게 좋다

**평가**: **정확함**. 중기 개선 필요

---

#### 7순위: email 기반 → user_id 기반 이동 🟢

**GPT 의견 (첫 번째)**:
> wishlists는 user_id 기반으로 옮기는 게 가장 깔끔
> 어쩔 수 없이 email 기반을 유지해야 하면, email 변경 시 정책(이관/차단)을 DB/로직으로 명시

**대상 테이블**:
- `wishlists` (user_email)
- `ownerships` (user_email)

**평가**: **정확함**. 중기 개선 필요

---

#### 8순위: orders 주소 스냅샷 통일 🟢

**GPT 의견 (첫 번째)**:
> orders에도 shipping_address_json을 추가하고(현재 컬럼 유지하더라도),
> 스냅샷은 json을 기준으로 잡는 게 안정적

**평가**: **정확함**. 중기 개선 필요

---

## 5. 🎯 최종 평가

### GPT 의견의 강점

1. **DB 구조 정확히 이해**: 3개 엔진 분류, 핵심 설계 6개 모두 정확
2. **실제 장애와 연결**: 후처리 파이프라인 분석이 정확
3. **우선순위 명확**: 장애 해결 → 구조 개선 순서가 합리적
4. **위험한 표현 지적**: "레거시 단정" 같은 과한 표현을 지적
5. **스냅샷 패턴 인식**: 불일치가 정상이라는 이해가 정확

### 보완 필요 사항

1. **`order_stock_issues` 기록 확인**: 코드는 있지만 실제 기록 여부 확인 필요
2. **`recordStockIssue()` 에러 처리**: 실패 시 조용히 죽는지 확인 필요 (220번 라인: 에러를 던지지 않음)
3. **`paid_event_processing` 모니터링**: `pending`/`failed` 상태 모니터링 필요
4. **`qr_products`는 레거시 아님**: 여전히 사용 중이므로 "별도 도메인"으로 보는 것이 정확

### 결론

**GPT 의견은 매우 정확하고 실용적입니다.**

특히:
- ✅ 실제 장애 원인 파악에 도움
- ✅ 우선순위가 명확함
- ✅ 위험한 표현을 지적
- ✅ 후처리 파이프라인 분석이 정확

**권장 사항**:
1. **즉시**: GPT가 제안한 1순위 항목부터 확인 (주문 후처리 파이프라인)
2. **단기**: `orders.created_at`, `orders.updated_at` 추가
3. **단기**: 스냅샷 컬럼 주석 명확화
4. **중기**: 상품 마스터 통합 정책, `cart_items` 옵션 정합성, email → user_id 마이그레이션

---

## 6. 📝 추가 확인 사항

### (1) `recordStockIssue()` 함수 확인 필요

**확인 사항**:
- 함수가 실제로 호출되는지
- 에러 발생 시 조용히 실패하는지 (220번 라인: 에러를 던지지 않음)
- `order_stock_issues`에 기록이 남는지

**코드 위치**: `backend/utils/paid-event-creator.js` (185-222번 라인)

**주의사항**:
- `recordStockIssue()` 실패 시 에러를 던지지 않음 (220번 라인)
- 따라서 실패해도 조용히 넘어갈 수 있음
- 로그 확인 필요

---

### (2) `paid_event_processing` 상태 모니터링

**확인 사항**:
- `pending` 상태로 오래 남아있는 경우
- `failed` 상태의 경우 `last_error` 확인
- 재시도 로직 존재 여부

**테이블**: `paid_event_processing`
- `status`: `enum('pending','processing','success','failed')`
- `last_error`: `text` (에러 메시지)
- `retry_count`: `int` (재시도 횟수)

**주의사항**:
- `pending` 상태로 오래 남아있으면 파이프라인이 시작되지 않았을 수 있음
- `failed` 상태면 `last_error` 확인 필요

---

### (3) `qr_products`와 `admin_products` 관계

**확인 사항**:
- `qr_products`의 실제 사용 목적
- `product_qr` 테이블이 `qr_products`를 참조하는 이유
- `admin_products`와의 통합 계획

**테이블**:
- `qr_products`: 8개 row, FK로 참조됨 (`ownerships`, `product_qr`)
- `admin_products`: 10개 row, 메인 상품 마스터
- `product_qr`: 12개 row, `qr_products` 참조

**주의사항**:
- `qr_products`는 레거시가 아니라 "별도 도메인"으로 보는 것이 정확
- 통합 정책 확정 필요

---

### (4) `products` 테이블 정책 확정

**확인 사항**:
- `products` 테이블의 미래 사용 계획
- `product_history` 테이블의 사용 계획
- 제거/유지/이관 정책 확정

**테이블**:
- `products`: 0개 row, FK로 참조됨 (`product_history`)
- `product_history`: 0개 row

**주의사항**:
- FK가 존재하면 데이터가 들어올 때 문제 발생 가능
- "무시 가능"보다는 "정책 확정 필요"

---

## 7. 🔍 실제 장애 원인 분석 (주문 61 사례)

### 증상
- `payments`: ✅ `captured` 상태로 결제 정보 존재
- `paid_events`: ❌ 없음
- `order_item_units`: ❌ 없음
- `warranties`: ❌ 없음
- `invoices`: ❌ 없음
- `orders.status`: `processing` (이미 업데이트됨)

### 원인 분석

**가능한 시나리오**:
1. `createPaidEvent()` 호출 실패
   - UNIQUE 제약 위반
   - DB 연결 오류
   - 트랜잭션 롤백
2. `createPaidEvent()` 호출 전에 주문 상태가 `processing`으로 업데이트됨
   - ✅ 이미 수정 완료: `createPaidEvent()` 성공 후에만 주문 상태 업데이트

### 해결 방법

**즉시 확인**:
1. 백엔드 로그에서 `createPaidEvent()` 호출 여부 확인
2. `paid_event_processing` 상태 확인
3. `order_stock_issues` 기록 확인

**예방**:
1. `createPaidEvent()` 실패 시 더 명확한 에러 처리
2. `paid_event_processing` 상태 모니터링
3. `order_stock_issues` 기록 확인

---

## 8. 📊 우선순위 최종 정리

### 🔴 즉시 (장애 해결)

1. **주문 후처리 파이프라인 복구**
   - `paid_events` 생성 여부 확인
   - `paid_event_processing` 상태 확인
   - `order_item_units`, `warranties`, `invoices` 생성 여부 확인
   - `order_stock_issues` 기록 확인

### 🟡 단기 (1-2주)

2. **orders.created_at/updated_at 추가**
   - 장애/정산/CS에 즉효

3. **스냅샷 컬럼 주석 명확화**
   - `token_master.product_name`
   - `order_items.product_name`
   - `warranties.product_name`

### 🟢 중기 (1-3개월)

4. **상품 마스터 통합 정책**
   - `admin_products` vs `qr_products` vs `products` 관계 명확화

5. **cart_items 옵션 정합성 강화**
   - `option_id` 추가 또는 유효성 검증

6. **email 기반 → user_id 기반 마이그레이션**
   - `wishlists`, `ownerships`

7. **orders 주소 스냅샷 통일**
   - `shipping_address_json` 추가

---

**이 문서는 GPT 첫 번째 + 두 번째 의견을 실제 DB 구조와 비교하여 통합 분석한 결과입니다.**
