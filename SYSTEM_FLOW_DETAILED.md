# 시스템 전체 흐름 상세 가이드

## ⚠️ SSOT 선언 (단일 진실 원천) - 필수 고정

**이 문서는 시스템의 단일 진실 원천(SSOT)입니다. 모든 구현은 이 규칙을 따라야 합니다.**

### 핵심 SSOT 규칙

1. **`orders.status`는 집계 결과(뷰/표시용)이며, 직접 정책 판단 기준으로 사용하지 않는다.**
   - 환불/양도/제재 판단은 `warranties.status`를 기준으로 한다.
   - `orders.status`는 집계 함수로만 갱신되며, 관리자 수동 수정 금지.

2. **`order_item_units.unit_status`는 물류 단위 상태(배송/재고 흐름)의 진실 원천이다.**
   - 배송 상태 판단은 `unit_status`를 기준으로 한다.
   - `orders.status`는 `unit_status` 집계 결과일 뿐이다.

3. **`stock_units.status`는 실물 재고 상태의 진실 원천이다.**
   - **책임 경계:** 재판매 가능 여부의 최종 게이트는 **`stock_units.status = 'in_stock'`** 이다. (Paid 트랜잭션은 오직 이 조건만 본다).

4. **`warranties.status`는 권리/정책 상태(활성화/양도/환불 가능 여부)의 진실 원천이다.**
   - 환불 가능 여부 판정은 `warranties.status`만 본다.
   - 활성화 가능 여부 판정은 `warranties.status`를 1차 기준으로 하되, **주문 귀속 검증(`orders.user_id`)**과 **Refunded 여부**(`order_item_units.unit_status` + `warranties.status`. **`orders.status` 미사용**)를 함께 확인한다.

5. **`invoices`는 문서(스냅샷)이며, "권리 판단 기준"이 아니라 "증빙/조회" 역할이다.**
   - 활성화/환불 판정에 `invoices`를 사용하지 않는다.
   - `invoices`는 발급 시점의 주문 정보를 고정 저장하는 스냅샷일 뿐이다.

### 전역 정합성 규칙

1. **전역 락 순서(필수):** `orders`(결제) → `stock_units`(물리) → `order_item_units`(물류) → `warranties`(권리) → `invoices`(문서)  
   - **FOR UPDATE로 잠그는 첫 테이블은 항상 `orders`이다.**  
   - **`orders`를 잠그기 위해 필요한 `order_id` 식별 조회는 예외적으로 락 없이 허용한다.** (refund: warranty_id→order_id, shipment: 요청의 orderId 사용 후, 반드시 `orders FOR UPDATE` 먼저 → 이후 순서 유지)

2. **전역 원자성 규칙(필수):** 상태 전이는 `UPDATE ... WHERE 조건`으로만 수행하며 `affectedRows=1` 검증 필수.

3. **전역 유니크 제약(필수 - DB 레벨 강제):**
   - `order_idempotency`: `UNIQUE(owner_key, idem_key)`
   - `paid_events`: `UNIQUE(order_id, payment_key)`
   - **`order_item_units` (이중 판매 방지 - MySQL 패턴):**
     - **`UNIQUE(stock_unit_id, active_lock)`**
     - **`active_lock` 정의:** `CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END`
     - **운영 규칙:** 위 상태 집합은 실제 `order_item_units` 테이블의 ENUM과 일치해야 하며, 신규 상태 추가 시 `active_lock` 정의를 갱신해야 한다.
   - `warranties`: `UNIQUE(token_pk)` (토큰당 레코드 1개 강제)
   - `invoices`: `UNIQUE(invoice_number)`, `UNIQUE(invoice_order_id)` (A안: invoice만 주문당 1장. `invoice_order_id` = generated `IF(type='invoice', order_id, NULL)`. credit_note는 1:N 유지. **void는 상태(enum)로 존재하지만, 중복 정리 방법으로는 사용 금지** → DELETE만 사용)

4. **토큰 체계(필수):** 비회원 조회는 `guest_order_access_token`(90일), Claim은 `claim_token`(단기)으로 철저히 분리.

5. **양도 요청 단일화(필수):** `warranty_id`당 `requested` 상태는 1개만 유지 (취소 후 재생성).

---

## 📋 목차
1. [주문 생성 (회원/비회원)](#1-주문-생성-회원비회원)
2. [Paid 처리 및 보증서 생성](#2-paid-처리-및-보증서-생성)
3. [Claim (비회원 → 회원 전환)](#3-claim-비회원--회원-전환)
4. [보증서 활성화 (첫 활성화)](#4-보증서-활성화-첫-활성화)
5. [양도](#5-양도)
6. [환불](#6-환불)
7. [재판매](#7-재판매)
8. [관리자 페이지](#8-관리자-페이지)

---

## 1. 주문 생성 (회원/비회원)

### 1-1. 회원 주문

**흐름**:
1. 사용자가 로그인 상태에서 주문 페이지 접근
2. 상품 선택 및 주문 정보 입력
3. 주문 생성 API 호출 (`POST /api/orders`)
4. 시스템 처리:
   - `orders.user_id` = 현재 로그인한 `user_id`
   - `orders.guest_id` = NULL
   - `owner_key` = `u:{user_id}` 형식으로 `order_idempotency` 테이블에 저장
   - 주문번호 생성 및 저장
5. 결제 페이지로 이동

**데이터베이스 상태**:
```sql
-- orders 테이블
order_id: 1
user_id: 123  -- 회원 ID
guest_id: NULL
order_number: 'ORD-20250101-001'
status: 'pending'
created_at: '2025-01-01 10:00:00'

-- order_idempotency 테이블
owner_key: 'u:123'
idem_key: 'order_abc123'
order_id: 1
```

### 1-2. 비회원 주문

**흐름**:
1. 사용자가 비로그인 상태에서 주문 페이지 접근
2. 상품 선택 및 주문 정보 입력 (이메일, 전화번호 등 필수)
3. 주문 생성 API 호출 (`POST /api/orders`)
4. 시스템 처리:
   - `guest_session_id` 쿠키 생성 (또는 기존 쿠키 사용)
   - `orders.user_id` = NULL
   - `orders.guest_id` = `guest_session_id` (또는 해시)
   - `owner_key` = `g:{guest_session_id}` 형식으로 `order_idempotency` 테이블에 저장
   - 주문번호 생성 및 저장
5. 결제 페이지로 이동

**데이터베이스 상태**:
```sql
-- orders 테이블
order_id: 2
user_id: NULL  -- 비회원
guest_id: 'guest_abc123'
order_number: 'ORD-20250101-002'
status: 'pending'
created_at: '2025-01-01 11:00:00'

-- order_idempotency 테이블
owner_key: 'g:guest_abc123'
idem_key: 'order_def456'
order_id: 2
```

**비회원 주문 조회**:
- 비회원은 `guest_order_access_token`을 통해 주문 조회
- 주문 완료 시 `guest_order_access_token` 발급 (90일 유효)
- 토큰으로 주문 상세 조회 가능

---

## 2. Paid 처리 및 보증서 생성

### 2-1. Paid 처리 트랜잭션

**흐름** (`processPaidOrder()` 함수):
1. **paid_events 멱등 INSERT** (이미 처리된 주문이면 즉시 종료)
   ```sql
   INSERT INTO paid_events (order_id, payment_key, event_source, created_at)
   VALUES (?, ?, ?, NOW())
   -- UNIQUE(order_id, payment_key) 제약으로 중복 방지
   ```

2. **주문 잠금** (FOR UPDATE)
   ```sql
   SELECT * FROM orders WHERE order_id = ? FOR UPDATE
   ```

3. **재고 배정** (각 order_item별로)
   - `stock_units`에서 `status = 'in_stock'`인 재고 선택
   - `status = 'reserved'`, `reserved_at = NOW()`, `reserved_by_order_id = order_id`로 업데이트
   - SKIP LOCKED 사용 (MySQL 8.0+) 또는 product_id 순서로 락 획득

4. **order_item_units 생성** (각 재고 단위별로)
   ```sql
   INSERT INTO order_item_units 
   (order_item_id, unit_seq, stock_unit_id, token_pk, unit_status, created_at)
   VALUES (?, ?, ?, ?, 'reserved', NOW())
   ```

5. **warranties 생성** (각 order_item_unit별로) - ⚠️ 락 순서 3단계: warranties(권리)
   - 회원 주문: `status = 'issued'`, `owner_user_id = orders.user_id`
   - 비회원 주문: `status = 'issued_unassigned'`, `owner_user_id = NULL`
   ```sql
   INSERT INTO warranties 
   (source_order_item_unit_id, token_pk, owner_user_id, status, created_at)
   VALUES (?, ?, ?, ?, NOW())
   -- UNIQUE(token_pk) 제약으로 토큰당 레코드 1개 강제
   ```

6. **인보이스 생성** (`invoices` 테이블) - ⚠️ 락 순서 4단계: invoices(문서)
   ```sql
   INSERT INTO invoices (
     order_id, invoice_number, type, status,
     currency, total_amount, tax_amount, net_amount,
     billing_name, billing_email, billing_phone, billing_address_json,
     shipping_name, shipping_email, shipping_phone, shipping_address_json,
     payload_json, order_snapshot_hash, version,
     issued_at
   )
   VALUES (?, ?, 'invoice', 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
   ```
   - **스냅샷 필드**: 발급 시점의 주문 정보를 고정 (금액/주소/라인 아이템)
   - **invoice_number**: `PM-INV-YYMMDD-HHmmss-{랜덤}` 형식 (초 단위 + 랜덤으로 충돌 방지)
   - **order_snapshot_hash**: `payload_json` 해시 (위변조/동일문서 판별)
   - **version**: 인보이스 템플릿 버전 (PDF 양식 변경 대비)
   - **UNIQUE(invoice_number) 충돌 시**: 재시도 1~2회로 새 번호 재발급, 실패 시 장애 보고

7. **orders 업데이트**
   ```sql
   UPDATE orders 
   SET paid_at = NOW()  -- ⚠️ status는 집계 함수로만 갱신 (직접 업데이트 금지)
   WHERE order_id = ?
   ```
   - **주의**: `orders.status`는 `order_item_units.unit_status`와 `paid_events` 기반으로 집계 함수로만 갱신
   - 집계 함수는 트랜잭션 외부에서 호출하거나 별도 배치 작업으로 처리
   - 집계 규칙: `paid_events` 존재 + `unit_status` 기반으로 `pending`, `paid`, `partial_shipped`, `shipped`, `partial_delivered`, `delivered`, `refunded` 계산

8. **COMMIT**

9. **이메일 발송 (트랜잭션 외부)**
   - 인보이스 링크 생성 (조회 전용 토큰 포함)
   - 회원 주문: 회원 이메일로 인보이스 발송
   - 비회원 주문: 주문 시 입력한 이메일로 인보이스 발송
   - 이메일 내용: 주문번호, 주문 상세 정보, 인보이스 링크, 배송 상태 등

**데이터베이스 상태 (회원 주문 예시)**:
```sql
-- paid_events 테이블
order_id: 1
payment_key: 'payment_abc123'
event_source: 'webhook'
created_at: '2025-01-01 10:05:00'

-- stock_units 테이블
stock_unit_id: 101
product_id: 10
token_pk: 1001
status: 'reserved'
reserved_at: '2025-01-01 10:05:00'
reserved_by_order_id: 1

-- order_item_units 테이블
order_item_unit_id: 1001
order_item_id: 1
unit_seq: 1
stock_unit_id: 101
token_pk: 1001
unit_status: 'reserved'
created_at: '2025-01-01 10:05:00'

-- warranties 테이블
warranty_id: 1
source_order_item_unit_id: 1001
token_pk: 1001
owner_user_id: 123  -- 회원 ID
status: 'issued'
created_at: '2025-01-01 10:05:00'
```

**데이터베이스 상태 (비회원 주문 예시)**:
```sql
-- warranties 테이블
warranty_id: 2
source_order_item_unit_id: 1002
token_pk: 1002
owner_user_id: NULL  -- 비회원
status: 'issued_unassigned'
created_at: '2025-01-01 11:05:00'
```

### 2-2. 실물 보증서 및 인보이스 발송

**실물 보증서 발송**:
- Paid 처리 완료 후 실물 보증서 발송 (배송 시 함께 발송)
- 실물 보증서에는 QR 코드가 인쇄되어 있음 (토큰 정보 포함)
- QR 코드는 `token_master.token` (난수 20자)
- **보증서 상태**:
  - 회원 주문: `warranties.status = 'issued'`, `owner_user_id = user_id` (주인 있음)
  - 비회원 주문: `warranties.status = 'issued_unassigned'`, `owner_user_id = NULL` (주인 없음)

**인보이스 이메일 발송**:
- Paid 처리 완료 후 인보이스 생성 및 이메일 발송
- 이메일에는 인보이스 링크 포함 (주문 상세 페이지로 이동)
- 인보이스 링크에는 조회 전용 토큰 포함 (`guest_order_access_token` 또는 `claim_token`)
- 이메일 내용:
  - 주문번호
  - 주문 상세 정보
  - 인보이스 링크
  - 배송 상태 (있는 경우)

---

## 3. Claim (비회원 → 회원 전환)

### 3-1. Paid 처리 시 인보이스 발송

**상황**: 비회원 주문 완료 후 Paid 처리 시 인보이스 생성 및 이메일 발송

**흐름**:
1. Paid 처리 완료 후 인보이스 생성 (`invoices` 테이블)
2. 인보이스 링크 생성 (조회 전용 토큰 포함, `guest_order_access_token`만 사용)
3. 이메일로 인보이스 발송 (MailerSend 등)
   - 인보이스 링크 포함 (URL Query에 `token` 파라미터 포함)
   - 주문 정보, 배송 상태, 주문 상세 정보 확인 가능
4. 사용자가 이메일의 인보이스 링크 클릭

**이메일 내용**:
- 주문번호
- 주문 상세 정보
- 인보이스 링크 (주문 상세 페이지로 이동)
- 배송 상태 (있는 경우)

### 3-2. 주문 상세 페이지 및 Claim 흐름

**상황**: 비회원이 인보이스 링크를 클릭하여 주문 상세 페이지 접근

**흐름** (옵션 B: 세션 토큰 교환 방식):
1. 사용자가 이메일의 인보이스 링크 클릭 (URL: `/api/guest/orders/session?token=xxx`)
2. 서버 처리 (세션 발급):
   - 토큰 검증 (`guest_order_access_token`: `expires_at`, `revoked_at`, `orders.user_id IS NULL`)
   - 세션 토큰 발급 (24시간 TTL)
   - `guest_order_sessions` 테이블에 저장
   - **httpOnly Cookie**로 세션 토큰 설정 (`Secure`, `SameSite=Lax`)
   - **토큰이 제거된 깨끗한 URL로 302 Redirect** (`/guest/orders.html?order=ORD-...`)
3. 주문 상세 페이지 표시 (Cookie 기반 인증):
   - `GET /api/guest/orders/:orderNumber` 호출
   - 세션 토큰 검증 (`guest_order_sessions`)
   - 수평 권한상승 방지 (세션 `order_number` == 요청 `order_number`)
   - **인보이스 정보**: 
     - 주문번호
     - 주문일시
     - 결제 정보 (결제일시, 결제 금액, 결제 방법)
     - 배송지 정보
   - **배송 상태**: 
     - 각 제품의 배송 상태 (`reserved`, `shipped`, `delivered` 등)
     - 송장번호 (있는 경우)
     - 택배사 정보 (있는 경우)
   - **주문 정보**: 
     - 주문 항목 목록
     - 각 항목의 수량, 가격
     - 총 주문 금액
   - **보증서 정보**: 
     - 보증서 상태 (`issued_unassigned` - 주인이 없는 상태)
     - 보증서는 실물로 발송되었지만 아직 계정에 연동되지 않음
4. 비회원이면 "내 계정에 연동하기" 버튼 표시
5. 사용자가 "내 계정에 연동하기" 버튼 클릭
6. 로그인/회원가입 요구 (로그인 안 돼 있으면 로그인 페이지로 redirect)
   - 이때 `guest_order_access_token`은 서버 세션/임시 저장/또는 return_url에 안전하게 전달
7. 로그인 성공 후, 서버가 `claim_token` 발급 (`POST /api/orders/:orderId/claim-token`)
   - 클라이언트는 세션과 guest_token 검증 후 `claim_token` 발급
8. 클라이언트가 `claim_token`으로 Claim API 호출 (`POST /api/orders/:orderId/claim`)
   - **3-Factor Atomic Check:**
     ```sql
     UPDATE claim_tokens
     SET used_at = NOW()
     WHERE token = ?
       AND order_id = ?        -- 바인딩 확인
       AND used_at IS NULL     -- 1회성 확인
       AND expires_at > NOW(); -- 만료 확인
     ```
     - 반드시 **`affectedRows=1`** 확인 후 로직 진행
9. 시스템 처리:
   - `orders.user_id` = 현재 로그인한 `user_id`로 업데이트
   - `orders.guest_id` = **유지** (감사 로그 및 CS 분쟁 대비)
   - 해당 주문의 모든 `warranties.status` = `'issued_unassigned'` → `'issued'`로 업데이트
   - `warranties.owner_user_id` = 현재 로그인한 `user_id`로 업데이트
   - `guest_order_access_token` 회수 (revoked_at 설정)
   
**핵심 정책**: `guest_id`는 유지하여 "어떤 경로로 생성된 주문인지" 추적 가능하도록 함

**데이터베이스 상태 (Claim 전)**:
```sql
-- orders 테이블
order_id: 2
user_id: NULL
guest_id: 'guest_abc123'
status: 'paid'

-- warranties 테이블
warranty_id: 2
owner_user_id: NULL
status: 'issued_unassigned'
```

**데이터베이스 상태 (Claim 후)**:
```sql
-- orders 테이블
order_id: 2
user_id: 456  -- 새로 로그인한 회원 ID
guest_id: 'guest_abc123'  -- 유지 (감사 로그 및 CS 분쟁 대비)
status: 'paid'

-- warranties 테이블
warranty_id: 2
owner_user_id: 456  -- 새로 로그인한 회원 ID
status: 'issued'  -- issued_unassigned → issued
```

---

## 4. 보증서 활성화 (첫 활성화)

### 4-1. 활성화 흐름

**상황**: 사용자가 마이페이지에서 보증서를 확인하고 활성화

**흐름**:
1. 사용자가 마이페이지에서 보증서 목록 확인
2. `status = 'issued'`인 보증서에 "활성화" 버튼 표시
3. "활성화" 버튼 클릭
4. 동의 문구 확인: "이 보증서를 활성화하면 환불이 제한됩니다"
5. 동의 체크 후 활성화 요청 (`POST /api/warranties/:warrantyId/activate`)

**서버 검증 (핵심 방어 메커니즘)**:
1. `warranties.owner_user_id = 현재 로그인한 user_id` 확인
2. `warranties.status = 'issued'` 확인
3. **핵심 검증: 인보이스 연동 확인**
   ```sql
   SELECT o.user_id, o.status, oiu.unit_status
   FROM warranties w
   JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
   JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
   JOIN orders o ON oi.order_id = o.order_id
   WHERE w.warranty_id = ?
   ```
   - `orders.user_id = 현재 로그인한 user_id` 확인 (인보이스가 계정에 연동되어 있는지)
   - `orders.status != 'refunded'` 확인 (환불된 주문이 아닌지)
   - `order_item_units.unit_status != 'refunded'` 확인

4. 동의 체크 확인 (`agree: true`)

**활성화 처리**:
- `warranties.status` → `'active'` 전이
- `warranties.activated_at` = NOW()
- `warranty_events`에 활성화 이벤트 기록 (`event_type: 'status_changed'`)

**데이터베이스 상태 (활성화 전)**:
```sql
-- warranties 테이블
warranty_id: 1
owner_user_id: 123
status: 'issued'
activated_at: NULL
```

**데이터베이스 상태 (활성화 후)**:
```sql
-- warranties 테이블
warranty_id: 1
owner_user_id: 123
status: 'active'
activated_at: '2025-01-01 12:00:00'

-- warranty_events 테이블
event_id: 1
event_type: 'status_changed'
target_type: 'warranty'
target_id: 1
actor_type: 'user'
actor_id: 123
metadata: '{"from": "issued", "to": "active"}'
created_at: '2025-01-01 12:00:00'
```

### 4-2. 활성화 실패 사례

**실패 사례 1: 인보이스가 계정에 연동되지 않음**
- 환불 전에 QR 코드를 사진으로 저장한 경우
- 환불 후 활성화 시도 시 `orders.user_id != 현재 user_id` 또는 `orders.status = 'refunded'`
- **결과**: 활성화 불가 (핵심 방어 메커니즘)

**실패 사례 2: 보증서 상태가 issued가 아님**
- `status = 'revoked'` (환불된 보증서)
- `status = 'active'` (이미 활성화된 보증서)
- `status = 'suspended'` (제재된 보증서)

**실패 사례 3: 소유자 불일치**
- `warranties.owner_user_id != 현재 user_id`

---

## 5. 양도

### 5-1. 양도 흐름

**상황**: 활성화된 보증서(`status = 'active'`)를 다른 사용자에게 양도

**흐름**:
1. 현재 소유자가 보증서에서 "양도하기" 버튼 클릭
2. 수령자 이메일 입력
3. 시스템이 랜덤 7자 코드 생성 (72시간 유효)
4. `warranty_transfers` 테이블에 양도 요청 기록
   ```sql
   -- ⚠️ 요청 생성 시점에 from_user_id = warranties.owner_user_id 일치 확인 필수
   INSERT INTO warranty_transfers 
   (warranty_id, from_user_id, to_email, transfer_code, status, expires_at, requested_at)
   VALUES (?, ?, ?, ?, 'requested', DATE_ADD(NOW(), INTERVAL 72 HOUR), NOW())
   ```
   - **요청 생성 시 검증**: `warranties.owner_user_id = from_user_id` 확인 (요청자와 현재 소유자 일치)
   - **요청 생성 시 검증**: `warranties.status = 'active'` 확인 (활성화된 보증서만 양도 가능)

5. 시스템이 양도 링크를 이메일로 수령자에게 전송 (랜덤 7자 코드 포함)
6. 수령자가 링크 클릭 → 로그인 요구
7. 수령자가 로그인 후 랜덤 7자 코드 입력
8. 수령자가 "수락" 버튼 클릭 (`POST /api/warranties/transfer/accept`)
9. 시스템 처리 (원자적 조건 필수):
   - **트랜잭션 시작**
   - `warranty_transfers.status` 확인: `status = 'requested'` AND `expires_at > NOW()`
   - `warranties.owner_user_id` 변경 (기존 소유자 → 새 소유자) - **affectedRows=1 검증 필수**
   - `warranty_transfers.status` → `'completed'` - **affectedRows=1 검증 필수**
   - **`warranties.status`는 `'active'` 상태로 유지** (재활성화 불필요)
   - `warranty_events`에 양도 이벤트 기록 (`event_type: 'ownership_transferred'`) ⚠️ **이벤트 타입 분리**
   - **COMMIT**
   
**⚠️ 원자적 조건 검증 (필수)**:
```javascript
await connection.beginTransaction();
try {
  // 1. transfer 상태 확인 및 락
  const [transfers] = await connection.execute(
    `SELECT * FROM warranty_transfers 
     WHERE transfer_id = ? 
     AND status = 'requested' 
     AND expires_at > NOW()
     FOR UPDATE`,
    [transferId]
  );
  
  if (transfers.length === 0) {
    throw new Error('유효하지 않은 양도 요청입니다.');
  }
  
  const transfer = transfers[0];
  
  // ✅ 1-1. 코드 검증
  if (transfer.transfer_code !== transferCode) {
    throw new Error('양도 코드가 일치하지 않습니다.');
  }
  
  // ✅ 1-2. 이메일 일치 검증 (보안 필수)
  const [users] = await connection.execute(
    'SELECT email FROM users WHERE user_id = ?',
    [toUserId]
  );
  
  if (users.length === 0 || users[0].email !== transfer.to_email) {
    throw new Error('양도 요청의 수령자 이메일과 로그인한 계정 이메일이 일치하지 않습니다.');
  }
  
  // ✅ 1-3. 현재 소유자 일치 확인 (요청 생성 시점과 수락 시점 일치 검증)
  const [warranties] = await connection.execute(
    'SELECT owner_user_id, status FROM warranties WHERE warranty_id = ? FOR UPDATE',
    [transfer.warranty_id]
  );
  
  if (warranties.length === 0) {
    throw new Error('보증서를 찾을 수 없습니다.');
  }
  
  if (warranties[0].owner_user_id !== transfer.from_user_id) {
    throw new Error('양도 요청 생성 후 보증서 소유자가 변경되었습니다.');
  }
  
  if (warranties[0].status !== 'active') {
    throw new Error('보증서 상태가 활성화되지 않았습니다.');
  }
  
  // 2. warranties 소유자 변경 (원자적 조건)
  const [warrantyUpdate] = await connection.execute(
    `UPDATE warranties
     SET owner_user_id = ?
     WHERE warranty_id = ? 
     AND owner_user_id = ?
     AND status = 'active'`,
    [toUserId, transfer.warranty_id, transfer.from_user_id]
  );
  
  if (warrantyUpdate.affectedRows !== 1) {
    await connection.rollback();
    throw new Error('보증서 소유자 변경 실패: 이미 양도되었거나 상태가 변경되었습니다.');
  }
  
  // 3. transfer 상태 변경 (원자적 조건)
  const [transferUpdate] = await connection.execute(
    `UPDATE warranty_transfers
     SET status = 'completed',
         to_user_id = ?,
         completed_at = NOW()
     WHERE transfer_id = ?
     AND status = 'requested'`,
    [toUserId, transferId]
  );
  
  if (transferUpdate.affectedRows !== 1) {
    await connection.rollback();
    throw new Error('양도 상태 변경 실패: 이미 처리되었습니다.');
  }
  
  // 4. 이벤트 기록
  await recordOwnershipTransfer(
    transfer.warranty_id,
    transfer.from_user_id,
    toUserId,
    transferId,
    'user',
    toUserId
  );
  
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
}
```

**원자적 조건의 이점**:
- 동일 코드로 중복 수락 방지
- 만료/취소 후 수락 시도를 DB에서 차단
- 동시성 경합에서 "누가 먼저 수락했는지" DB 결과로 확정

**데이터베이스 상태 (양도 전)**:
```sql
-- warranties 테이블
warranty_id: 1
owner_user_id: 123  -- 기존 소유자
status: 'active'

-- warranty_transfers 테이블
transfer_id: 1
warranty_id: 1
from_user_id: 123
to_email: 'recipient@example.com'
to_user_id: NULL
transfer_code: 'ABC1234'
status: 'requested'
expires_at: '2025-01-04 12:00:00'
```

**데이터베이스 상태 (양도 후)**:
```sql
-- warranties 테이블
warranty_id: 1
owner_user_id: 789  -- 새 소유자
status: 'active'  -- active 상태 유지

-- warranty_transfers 테이블
transfer_id: 1
warranty_id: 1
from_user_id: 123
to_email: 'recipient@example.com'
to_user_id: 789  -- 새 소유자 ID
transfer_code: 'ABC1234'
status: 'completed'
completed_at: '2025-01-01 14:00:00'
```

### 5-2. 양도 후 소유권 정책

**핵심 규칙**:
- **1토큰 = 1소유자 필수 조건**: 한 토큰은 동시에 한 명의 소유자만 가질 수 있음
- **양도 후 원래 소유자는 더 이상 그 보증서에 접근할 수 없음**:
  - 원래 소유자의 마이페이지에서 보증서 제거
  - QR 스캔 시도 시 소유자 불일치로 접근 거부
- **새 소유자는 즉시 보증서 사용 가능** (`active` 상태 유지, 재활성화 불필요)
- **인보이스 연동 확인 불필요**: 양도 받은 보증서는 이미 `active` 상태이므로 인보이스 연동 확인 없이 바로 사용 가능

### 5-3. 양도 요청 만료/취소

**만료**:
- 랜덤 7자 코드는 72시간 유효
- 만료 시 `warranty_transfers.status` → `'expired'`
- 배치 작업으로 자동 만료 처리

**취소**:
- 양도 요청자는 `requested` 상태에서 취소 가능
- 취소 시 `warranty_transfers.status` → `'cancelled'`

---

## 6. 환불

### 6-1. 환불 접수

**핵심 정책**:
- ❌ **고객 직접 환불 요청 불가**: 고객이 버튼이나 API로 직접 환불 요청할 수 없음
- ✅ **문의 시스템으로만 접수**: 고객 문의(`inquiries`)에 환불 요청이 들어오면 관리자가 확인
- ✅ **관리자 수동 처리**: 관리자 페이지에서 확인 후 수동으로 환불 처리

**흐름**:
1. 고객이 문의 시스템(`/contact.html` 또는 `/api/inquiries`)을 통해 환불 요청
2. 관리자가 문의 목록에서 환불 요청 확인
3. 관리자가 주문 상세 페이지에서 시리얼 넘버 확인 (`order_item_units`)
4. 관리자가 `warranties.status` 확인 후 환불 처리 (`POST /api/admin/refunds/process`)

### 6-2. 환불 처리

**환불 가능 판정 기준**:
- 판정 기준: `warranties.status`만 본다
- 판정 로직:
  - `revoked` → 거부 (이미 환불 완료)
  - `active` → 거부 (활성화된 보증서는 환불 불가)
  - `issued` / `issued_unassigned` → 허용 (정책 범위 내)
- ❌ `orders.status`로 판단 금지
- ❌ `unit_status`로 판단 금지

**환불 처리 시**:
1. `warranties.status` → `'revoked'` 전이 (원자적 조건: `WHERE status IN ('issued', 'issued_unassigned')` + `affectedRows=1` 검증)
2. `warranties.revoked_at` = NOW()
3. `order_item_units.unit_status` = `'refunded'` 업데이트
4. 재고 상태: `stock_units.status` → `'in_stock'` (재판매 가능)
5. **토큰 재발급 없음**: 실물 보증서에 이미 QR이 인쇄되어 있어 비용 부담으로 인해 토큰 재발급하지 않음
6. **credit_note 생성** (`invoices` 테이블, `type='credit_note'`):
   - `related_invoice_id`: 원본 invoice_id
   - `payload_json`: 환불 대상 unit 식별자(`order_item_unit_id` 리스트), 환불 금액/세금/통화, 환불 사유, 환불 트랜잭션 키(`payment_key`) 포함
   - **정책**: **credit_note 1:N** — 환불 1회당 1장. 부분 환불은 credit_note 여러 장으로 누적.
7. `orders.status` 집계 함수로 자동 업데이트

**⚠️ 부분 환불 정책**:
- **전량 환불**: 모든 unit이 `refunded` → `orders.status`는 집계 함수로 `'refunded'`로 **표시됨** (표시용, 정책 판단 기준 아님)
- **일부 환불**: 일부 unit만 `refunded` → 배송 상태 유지 (`partial_shipped`/`partial_delivered`), 별도 refund 상태/금액 표시. **credit_note는 환불 1회당 1장으로 여러 장 누적 가능.**
- `orders.status`는 집계 결과일 뿐이며, 정책 판단 기준으로 사용하지 않음.

**데이터베이스 상태 (환불 전)**:
```sql
-- warranties 테이블
warranty_id: 1
owner_user_id: 123
status: 'issued'
revoked_at: NULL

-- order_item_units 테이블
order_item_unit_id: 1001
unit_status: 'reserved'

-- stock_units 테이블
stock_unit_id: 101
status: 'reserved'
reserved_by_order_id: 1
```

**데이터베이스 상태 (환불 후)**:
```sql
-- warranties 테이블
warranty_id: 1
owner_user_id: 123
status: 'revoked'
revoked_at: '2025-01-01 15:00:00'

-- order_item_units 테이블
order_item_unit_id: 1001
unit_status: 'refunded'

-- stock_units 테이블
stock_unit_id: 101
status: 'in_stock'
reserved_by_order_id: NULL
reserved_at: NULL
```

### 6-3. 환불 후 보안 정책

**핵심 방어 메커니즘**:
- **첫 활성화 시점 인보이스 연동 확인**: 환불 전에 찍어둔 QR 코드로 활성화 시도 시, 환불된 주문이면 활성화 불가
- **보증서 상태 검증**: QR 스캔 시 `warranties.status = 'revoked'`면 접근 거부
- **활성화 상태 검증**: `revoked` 상태에서는 활성화 불가능 (`issued` → `active`만 가능)

**시나리오**:
1. 고객이 상품 주문 → QR 코드가 담긴 실물 보증서 수령
2. QR 코드를 사진으로 저장
3. 환불 처리 → `warranties.status` → `'revoked'`
4. 저장한 QR 코드로 보증서 활성화 시도
5. **결과**: 활성화 불가 (환불된 주문이므로 인보이스 연동 확인 실패)

---

## 7. 재판매

### 7-1. 재판매 흐름

**상황**: 환불된 상품을 재판매

**핵심 정책**:
- **재판매 시 같은 token 사용 (토큰 재발급 없음)**: 실물 보증서에 이미 QR이 인쇄되어 있어 비용 부담으로 인해 토큰 재발급하지 않음
- **같은 token에 대해 warranties 레코드는 하나만 유지**: 같은 `token_pk`에 대해 warranties 레코드는 하나(또는 최소한 유효 1개)만 유지함
- **재판매 전까지 revoked 상태 유지**: 환불 처리 후 재판매되기 전까지는 `warranties.status = 'revoked'` 상태로 유지
- **paid 처리 시 기존 revoked warranties 업데이트**: 재판매된 상품이 paid 처리되면, 기존 `revoked` 상태 warranties를 업데이트함 (새로운 warranties 레코드를 생성하지 않음)

**흐름**:
1. 환불된 상품이 재고에 복귀 (`stock_units.status = 'in_stock'`)
2. 새로운 고객이 해당 상품 주문
3. Paid 처리 시 (동시성 문제 방지 필수):
   - **재고 락 획득** (`FOR UPDATE SKIP LOCKED`):
     ```sql
     SELECT stock_unit_id, token_pk
     FROM stock_units
     WHERE status = 'in_stock' AND product_id = ?
     FOR UPDATE SKIP LOCKED
     LIMIT 1
     ```
   - **order_item_units 생성** (같은 트랜잭션 내)
   - **기존 `revoked` 상태 warranties 업데이트** (같은 트랜잭션 내):
     - `warranties.status` = `'issued'` 또는 `'issued_unassigned'` (주문이 회원/비회원에 따라)
     - `warranties.source_order_item_unit_id` = 새로운 주문의 `order_item_unit_id`
     - `warranties.owner_user_id` = 새로운 주문의 `user_id` (또는 NULL)
   - **COMMIT** (3개 작업이 모두 하나의 트랜잭션)
   
**⚠️ 핵심 정책**: 재판매 로직은 반드시 `stock_units 락 → order_item_units 생성 → warranties 업데이트`가 하나의 트랜잭션이어야 함. 동시에 두 주문이 같은 재고를 잡는 것을 방지

**⚠️ 락 획득 순서 고정 (데드락 방지)**:
> **"락 획득 순서: `stock_units`(물리) → `orders`(결제) → `warranties`(권리) 순으로 고정"**

이 순서를 문서에 고정하면, 나중에 기능이 늘어도 데드락 위험이 크게 줄어든다.

**데이터베이스 상태 (재판매 전)**:
```sql
-- warranties 테이블
warranty_id: 1
source_order_item_unit_id: 1001  -- 이전 주문
token_pk: 1001
owner_user_id: 123
status: 'revoked'
revoked_at: '2025-01-01 15:00:00'

-- stock_units 테이블
stock_unit_id: 101
token_pk: 1001
status: 'in_stock'
```

**데이터베이스 상태 (재판매 후)**:
```sql
-- warranties 테이블
warranty_id: 1  -- 같은 레코드 업데이트
source_order_item_unit_id: 2001  -- 새로운 주문
token_pk: 1001  -- 같은 token
owner_user_id: 456  -- 새로운 소유자
status: 'issued'  -- revoked → issued
revoked_at: '2025-01-01 15:00:00'  -- 유지 (이력, A안 정책)

-- order_item_units 테이블
order_item_unit_id: 2001
stock_unit_id: 101
token_pk: 1001
unit_status: 'reserved'
```

### 7-2. 재판매 후 활성화

- 재판매된 상품의 warranties는 `status = 'issued'`이므로 활성화 가능
- 첫 활성화 시 인보이스 연동 확인 수행
- 새로운 주문이 정상 상태이면 활성화 가능

### 7-3. revoked → issued 전이 조건 (보안 정책)

**⚠️ revoked_at 이력 필드 처리 정책 (A안 확정)**:

**A안 (권장)**: `revoked_at`은 "마지막 revoked 시점"만 유지하고, revive 시에는 그대로 둔다 (역사 증거)
- **이유**: 
  - "현재는 issued인데 revoked_at이 있는 이유"를 바로 알 수 있음 (재판매된 보증서임을 명확히 함)
  - 이력은 `warranty_events`에 상세히 기록되므로 중복 관리 불필요
- **구현**: revive 시 `revoked_at`은 그대로 유지, `warranty_events`에 revive 이벤트 기록

**B안 (미채택)**: revive 시 `revoked_at`을 NULL로 되돌리고, 이력은 전부 events로만 관리
- **이유**: 현재 상태만 warranties에, 이력은 events에만
- **단점**: "왜 revoked_at이 NULL인데 이전에 revoked였다는 걸 알 수 있나?"를 events 조회 없이는 알 수 없음

**결론**: A안 채택 (현재 흐름과 일치, 운영 편의성 높음)

**⚠️ 핵심 정책**: `revoked` → `issued` 전이는 **새로운 `paid_events`가 생성된 경우만 허용**

**전이 조건**:
- ✅ **허용**: 새로운 주문의 paid 처리 시 (`paid_events` 생성됨)
- ❌ **금지**: 관리자 수동 변경 (관리자 실수로 권리 부활 사고 방지)

**⚠️ 상태 전이 규칙 (DB 업데이트 조건으로 강제)**:
- **활성화**: `issued` → `active` 만 허용 (다른 상태에서 활성화 불가)
- **정지/해제**: `active` ↔ `suspended` 만 허용
- **환불/회수**: `active`/`suspended`/`issued` → `revoked` 허용
- **재판매**: `revoked` → `issued`(또는 `issued_unassigned`)만 허용

**구현 예시 (원자적 조건 포함)**:
```javascript
// 재판매 시 warranties 업데이트 (paid 처리 트랜잭션 내에서만)
// ⚠️ 락 순서: orders(결제) → stock_units(물리) → ... → warranties(권리) (전역 순서 준수)

// 1. stock_units 락 획득
const [stockUnits] = await connection.execute(
  `SELECT stock_unit_id, token_pk
   FROM stock_units
   WHERE status = 'in_stock' AND product_id = ?
   FOR UPDATE SKIP LOCKED
   LIMIT 1`,
  [productId]
);

// 2. orders 락 획득
await connection.execute(
  'SELECT * FROM orders WHERE order_id = ? FOR UPDATE',
  [orderId]
);

// 3. paid_events 존재 확인
const [paidEvents] = await connection.execute(
  'SELECT * FROM paid_events WHERE order_id = ?',
  [orderId]
);

if (paidEvents.length === 0) {
  throw new Error('paid_events가 없으면 revoked → issued 전이 불가');
}

// 4. warranties 업데이트 (원자적 조건 검증 + 상태 전이 규칙 강제)
const [updateResult] = await connection.execute(
  `UPDATE warranties
   SET status = ?,
       source_order_item_unit_id = ?,
       owner_user_id = ?
   WHERE token_pk = ? AND status = 'revoked'`,  -- ✅ 상태 전이 규칙: revoked만 허용
  [newStatus, orderItemUnitId, ownerUserId, tokenPk]
);

// ⚠️ 원자적 조건 검증: affected rows가 정확히 1이어야 함
if (updateResult.affectedRows !== 1) {
  await connection.rollback();
  throw new Error(
    `warranties 업데이트 실패: affectedRows=${updateResult.affectedRows}. ` +
    `이미 issued/active인 토큰이거나 동시성 경합이 발생했을 수 있습니다.`
  );
}
```

**⚠️ 재판매 시 stock_units 일관성**:
- 재판매는 "보증서만 바꾸면 끝"이 아니라, `stock_units`가 `in_stock`으로 돌아와 있어야 하고
- 새 주문에서 다시 `reserved` → `sold`로 흐름이 맞아야 함
- 이 일관성이 깨지면 "재판매했는데 원래 주문의 흔적이 남음" 같은 혼선이 생김

**보안 검증**:
- 관리자 API에서 `revoked` → `issued` 직접 전이 금지
- `paid_events` 존재 여부 확인 필수
- **원자적 조건**: `affectedRows === 1` 검증 필수 (이미 `issued`/`active`인 토큰 덮어쓰기 방지)

**⚠️ revoked_at 이력 필드 처리 정책 (A안 확정)**:

**A안 (권장)**: `revoked_at`은 "마지막 revoked 시점"만 유지하고, revive 시에는 그대로 둔다 (역사 증거)
- **이유**: 
  - "현재는 issued인데 revoked_at이 있는 이유"를 바로 알 수 있음 (재판매된 보증서임을 명확히 함)
  - 이력은 `warranty_events`에 상세히 기록되므로 중복 관리 불필요
- **구현**: revive 시 `revoked_at`은 그대로 유지, `warranty_events`에 revive 이벤트 기록

**B안 (미채택)**: revive 시 `revoked_at`을 NULL로 되돌리고, 이력은 전부 events로만 관리
- **이유**: 현재 상태만 warranties에, 이력은 events에만
- **단점**: "왜 revoked_at이 NULL인데 이전에 revoked였다는 걸 알 수 있나?"를 events 조회 없이는 알 수 없음

**결론**: A안 채택 (현재 흐름과 일치, 운영 편의성 높음)

---

## 8. 관리자 페이지

### 8-1. 관리자 페이지 구조

**관리자가 필요한 정보 (배송/환불 처리 필수)**:
- **주문 정보** (`orders`): 주문번호, 고객 정보, 주문 상태, 결제 정보 등
- **주문 항목** (`order_items`): 제품명, 수량, 가격 등
- **주문 항목 단위** (`order_item_units`): 시리얼 넘버, 토큰 정보 (`token_master.token` - 난수 20자), 배송 상태, 보증서 상태 등
- **배송 정보** (`shipments`, `shipment_units`): 송장번호, 택배사, 배송 상태 등

**핵심**: 관리자는 각 제품의 시리얼 넘버와 토큰(난수 20자)을 확인하여 현실에서 해당 제품을 찾아 배송/환불 처리할 수 있어야 함

### 8-2. 주문 목록

**기능**:
- 주문 검색/필터
- 주문 상태 확인
- 주문번호, 고객 정보, 주문일시, 주문 상태 표시

**표시 정보**:
- 주문번호
- 고객 정보 (회원: 이메일/이름(`users.name`)/`membership_id`, 비회원: 게스트 ID)
- 주문일시
- 주문 상태 (`pending`, `paid`, `shipped`, `delivered`, `refunded` 등)
- 결제 금액

### 8-3. 주문 상세 (3단 구조)

**1단: 주문 정보** (`orders`)
- 주문번호
- 고객 정보:
  - 회원: `user_id`, `membership_id` (외부 노출용, `PM.{년도}.{랜덤6자}`), 이메일, 이름(`users.name`), 전화번호
  - 비회원: `guest_id`, 이메일, 전화번호
- 주문 상태
- 결제 정보: 결제일시, 결제 금액, 결제 방법
- 배송지 정보: `shipping_name` (단일 필드), 이메일, 전화번호, 주소 등

**2단: 주문 항목** (`order_items`)
- 제품명
- 수량
- 가격
- 각 주문 항목별로 3단 정보 표시

**3단: 주문 항목 단위** (`order_item_units`)
- **시리얼 넘버**: `order_item_unit_id` 또는 별도 시리얼 넘버
- **토큰 정보**: `token_master.token` (난수 20자) - **현실에서 제품을 찾기 위한 핵심 정보**
- 배송 상태: `unit_status` (`reserved`, `shipped`, `delivered`, `refunded` 등)
- 보증서 상태: `warranties.status` (`issued`, `issued_unassigned`, `active`, `revoked` 등)
- 현재 송장: `current_shipment_id` → `shipments.tracking_number`

**표시 예시**:
```
주문 #ORD-20250101-001
├─ 고객: user@example.com (회원)
├─ 상태: paid
└─ 주문 항목
   ├─ 제품 A (수량: 2)
   │  ├─ Unit 1
   │  │  ├─ 시리얼: 1001
   │  │  ├─ 토큰: ABC12345678901234567 (20자)
   │  │  ├─ 배송 상태: reserved
   │  │  └─ 보증서 상태: issued
   │  └─ Unit 2
   │     ├─ 시리얼: 1002
   │     ├─ 토큰: DEF23456789012345678 (20자)
   │     ├─ 배송 상태: shipped
   │     └─ 보증서 상태: active
   └─ 제품 B (수량: 1)
      └─ Unit 1
         ├─ 시리얼: 1003
         ├─ 토큰: GHI34567890123456789 (20자)
         ├─ 배송 상태: delivered
         └─ 보증서 상태: active
```

### 8-4. 배송 처리

**흐름**:
1. 관리자가 주문 상세 페이지에서 배송할 제품 확인
2. 각 `order_item_unit`의 시리얼 넘버와 토큰 확인
3. 현실에서 해당 제품 찾기 (시리얼 넘버 또는 토큰으로)
4. 송장 생성:
   - 택배사 코드 입력
   - 송장번호 입력
   - `shipments` 테이블에 기록
   - `shipment_units` 테이블에 `order_item_unit_id`와 연결
   - `order_item_units.current_shipment_id` 업데이트
   - `order_item_units.unit_status` = `'shipped'` 업데이트
5. `orders.status` 집계 함수로 자동 업데이트

**데이터베이스 상태 (배송 전)**:
```sql
-- order_item_units 테이블
order_item_unit_id: 1001
unit_status: 'reserved'
current_shipment_id: NULL
```

**데이터베이스 상태 (배송 후)**:
```sql
-- shipments 테이블
shipment_id: 1
order_id: 1
carrier_code: 'CJ'
tracking_number: '1234567890'
voided_at: NULL
shipped_at: '2025-01-01 16:00:00'

-- shipment_units 테이블
shipment_id: 1
order_item_unit_id: 1001

-- order_item_units 테이블
order_item_unit_id: 1001
unit_status: 'shipped'
current_shipment_id: 1
```

### 8-5. 환불 처리

**흐름**:
1. 관리자가 문의 목록에서 환불 요청 확인
2. 관리자가 주문 상세 페이지에서 해당 주문 확인
3. 각 `order_item_unit`의 시리얼 넘버와 토큰 확인
4. 현실에서 해당 제품 찾기 (시리얼 넘버 또는 토큰으로)
5. `warranties.status` 확인:
   - `revoked` → 거부 (이미 환불 완료)
   - `active` → 거부 (활성화된 보증서는 환불 불가)
   - `issued` / `issued_unassigned` → 허용
6. 환불 처리 (`POST /api/admin/refunds/process`):
   - `warranties.status` → `'revoked'`
   - `warranties.revoked_at` = NOW()
   - `order_item_units.unit_status` = `'refunded'`
   - `stock_units.status` = `'in_stock'`
7. `orders.status` 집계 함수로 자동 업데이트

**관리자 페이지 표시**:
- 환불 요청 문의 목록
- 각 환불 요청에 대한 주문 정보
- 주문 상세에서 환불 가능 여부 표시
- 환불 처리 버튼 (환불 가능한 경우만 활성화)

### 8-6. 관리자 액션

**제재 기능**:
- 보증서 정지 (`warranties.status` → `'suspended'`)
- 보증서 정지 해제 (`warranties.status` → `'issued'`)
- 보증서 상태 확인 및 변경 이력 조회

**타임라인 조회**:
- `warranty_events` 테이블에서 보증서 상태 변경 이력 조회
- 누가, 언제, 왜 상태를 변경했는지 확인

---

## 📊 전체 흐름 다이어그램

### 회원 주문 흐름
```
1. 주문 생성 (user_id 설정)
   ↓
2. Paid 처리 → warranties 생성 (status: 'issued')
   ↓
3. 실물 보증서 발송
   ↓
4. 첫 활성화 (인보이스 연동 확인) → status: 'active'
   ↓
5-1. 양도 (소유자만 변경, status: 'active' 유지)
   또는
5-2. 환불 (status: 'revoked')
   ↓
6. 재판매 (기존 warranties 업데이트, status: 'issued')
```

### 비회원 주문 흐름
```
1. 주문 생성 (guest_id 설정)
   ↓
2. Paid 처리 → warranties 생성 (status: 'issued_unassigned')
   ↓
3. 실물 보증서 발송
   ↓
4. Claim (계정 연동) → status: 'issued', owner_user_id 설정
   ↓
5. 첫 활성화 (인보이스 연동 확인) → status: 'active'
   ↓
6-1. 양도 (소유자만 변경, status: 'active' 유지)
   또는
6-2. 환불 (status: 'revoked')
   ↓
7. 재판매 (기존 warranties 업데이트, status: 'issued' 또는 'issued_unassigned')
```

---

## 🔑 핵심 정리

### 1. 회원 vs 비회원
- **회원**: `orders.user_id` 설정, `warranties.status = 'issued'`
- **비회원**: `orders.guest_id` 설정, `warranties.status = 'issued_unassigned'`, Claim으로 계정 연동

### 2. 인보이스와 보증서 연동
- **첫 활성화 시에만 인보이스 연동 확인**: `warranties.source_order_item_unit_id` → `order_item_units` → `order_items` → `orders.user_id` 확인
- **환불된 주문이면 활성화 불가**: 핵심 방어 메커니즘
- **양도 시 인보이스 연동 확인 불필요**: `active` 상태 유지, 소유자만 변경

### 3. 환불
- **고객 직접 요청 불가**: 문의 시스템으로만 접수
- **관리자 수동 처리**: 시리얼 넘버와 토큰 확인 후 환불 처리
- **토큰 재발급 없음**: 실물 보증서에 이미 QR 인쇄되어 있음

### 4. 양도
- **활성화된 보증서만 양도 가능**: `status = 'active'`
- **소유자만 변경**: `status = 'active'` 유지
- **인보이스 연동 확인 불필요**: 양도 받은 소유자는 바로 사용 가능
- **요청 생성 시 검증**: `warranties.owner_user_id = from_user_id` 확인 (요청자와 현재 소유자 일치)
- **수락 시 검증**: 이메일 일치 확인 (`to_email` = 로그인한 계정 이메일), 현재 소유자 일치 재확인

### 5. 재판매
- **같은 token 사용**: 토큰 재발급 없음
- **기존 warranties 업데이트**: 새로운 레코드 생성하지 않음
- **같은 token에 대해 warranties 레코드는 하나만 유지**
- **stock_units 일관성**: 재판매 시 `stock_units`가 `in_stock`으로 돌아와 있어야 하고, 새 주문에서 `reserved` → `sold` 흐름 유지

### 6. 관리자 페이지
- **3단 구조**: 주문 정보 → 주문 항목 → 주문 항목 단위
- **시리얼 넘버와 토큰 확인 필수**: 현실에서 제품을 찾기 위한 핵심 정보
- **배송/환불 처리**: 시리얼 넘버와 토큰으로 제품 확인 후 처리

### 7. 정합성 규칙 (핵심 원칙)
**위 보완안들은 기능 추가가 아니라, 동시성/재시도/부분처리(부분환불·부분배송·재판매·양도)에서 시스템 SSOT를 깨지 않기 위한 정합성 규칙이다.**

