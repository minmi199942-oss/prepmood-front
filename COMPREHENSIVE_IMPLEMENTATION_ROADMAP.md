# 종합 구현 로드맵: QR/디지털 보증서/인보이스 완전 구현 가이드

## ⚠️ SSOT 선언 (단일 진실 원천) - 필수 고정

**이 문서는 QR 코드, 디지털 보증서, 인보이스 관련 모든 구현의 단일 진실 원천(SSOT)입니다.**

**🚀 작업 시작**: 작업할 때는 **`START_HERE.md`**를 먼저 보세요. 이 문서는 작업 목록과 상세 내용을 담고 있습니다.

**⚠️ 중요**: 데이터베이스 스키마 구조는 `SCHEMA_SSOT.md`가 최종 기준입니다. 이 문서의 Phase 2 스펙은 "이상적 목표"이며, 실제 구조와 다를 수 있습니다.

**📋 문서 일관성**: 이 문서는 `FINAL_EXECUTION_SPEC_REVIEW.md`와 `SYSTEM_FLOW_DETAILED.md`를 기준으로 작성되었습니다. 핵심 정책(SSOT 규칙, 상태 전이표, 집계 규칙, 환불/양도/활성화 정책, 멱등성 계층표)은 완전 일치합니다. 테이블 구조 차이는 "이상적 목표" vs "실제 구조"로, 실제 구조는 `SCHEMA_SSOT.md`를 기준으로 합니다.

**기준 문서**:
- `START_HERE.md`: **작업 시작 가이드 (이 문서 하나만 보세요)**
- `SCHEMA_SSOT.md`: **데이터베이스 스키마 실제 구조 (최종 기준)**
- `SYSTEM_FLOW_DETAILED.md`: 시스템 전체 흐름 상세 가이드
- `FINAL_EXECUTION_SPEC_REVIEW.md`: 최종 실행 스펙 검토 보고서
- `ADMIN_QR_WARRANTY_INVOICE_CONSISTENCY_CHECK.md`: 관리자 페이지 기능 일관성 검토

### 핵심 SSOT 규칙 (FINAL_EXECUTION_SPEC_REVIEW.md 기준)

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
   - 활성화 가능 여부 판정은 `warranties.status`를 1차 기준으로 하되, **주문 귀속 검증(`orders.user_id`)**과 **Refunded 여부**를 함께 확인한다.

5. **`invoices`는 문서(스냅샷)이며, "권리 판단 기준"이 아니라 "증빙/조회" 역할이다.**
   - 활성화/환불 판정에 `invoices`를 사용하지 않는다.
   - `invoices`는 발급 시점의 주문 정보를 고정 저장하는 스냅샷일 뿐이다.

### 전역 정합성 규칙

1. **전역 락 순서(필수):** `stock_units`(물리) → `orders`(결제) → `warranties`(권리) → `invoices`(문서)

2. **전역 원자성 규칙(필수):** 상태 전이는 `UPDATE ... WHERE 조건`으로만 수행하며 `affectedRows=1` 검증 필수.

3. **전역 유니크 제약(필수 - DB 레벨 강제):**
   - `order_idempotency`: `UNIQUE(owner_key, idem_key)`
   - `paid_events`: `UNIQUE(order_id, payment_key)`
   - **`order_item_units` (이중 판매 방지 - MySQL 패턴):**
     - **`UNIQUE(stock_unit_id, active_lock)`**
     - **`active_lock` 정의:** `CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END`
   - `warranties`: `UNIQUE(token_pk)` (토큰당 레코드 1개 강제)
   - `invoices`: `UNIQUE(invoice_number)`, `UNIQUE(invoice_group_id, invoice_part_no)`

4. **토큰 체계(필수):** 비회원 조회는 `guest_order_access_token`(90일), Claim은 `claim_token`(단기)으로 철저히 분리.

5. **양도 요청 단일화(필수):** `warranty_id`당 `requested` 상태는 1개만 유지 (취소 후 재생성).

---

## 📊 현재 구현 상태 (2026-01-16 기준)

### ✅ 완료된 부분

#### 1. 데이터베이스 스키마
- ✅ `orders` 테이블 (guest_id 포함)
- ✅ `orders.status` 체크 제약 수정 (079_fix_orders_status_check_constraint.sql)
  - `paid`, `partial_shipped`, `partial_delivered` 상태 추가 완료
- ✅ `order_items` 테이블
- ✅ `warranties` 테이블 (기본 구조)
- ✅ `token_master` 테이블 (token이 PK, token_pk 마이그레이션 필요)
- ✅ `invoices` 테이블 (021_create_invoices_table.sql)
- ✅ `order_idempotency` 테이블 (owner_key 방식)
- ✅ `stock_units` 테이블 (size, color 포함)
- ✅ `order_item_units` 테이블 (027_create_order_item_units_table.sql)
- ✅ `paid_events` 테이블 (024_create_paid_events_table.sql)
- ✅ `product_options` 테이블 (Phase 15-1 완료)

#### 2. 백엔드 로직
- ✅ `processPaidOrder()` 함수 구현 (`backend/utils/paid-order-processor.js`)
  - Paid 시점에 재고 예약 (reserved)
  - `order_item_units` 생성
  - `warranties` 생성 (회원: issued, 비회원: issued_unassigned)
  - 재판매 처리 (revoked → issued 전이)
  - 인보이스 생성
- ✅ `orders.status` 집계 함수 구현 (`backend/utils/order-status-aggregator.js`)
  - `paid_events` 기반 집계
  - `partial_shipped`, `partial_delivered` 지원
- ✅ 옵션 API (`GET /api/products/options?product_id=...`)
  - querystring 방식 (슬래시 안전)
  - product_options 기반 (Phase 15-2 완료)
  - 재고 상태 포함 (available: true/false)
- ✅ QR 코드 다운로드 API (`backend/qrcode-download-routes.js`)
- ✅ 인보이스 생성 로직 (`backend/utils/invoice-creator.js`)
- ✅ 보증서 활성화 API (`POST /api/warranties/:warrantyId/activate`) (Phase 5 완료)
  - 인보이스 연동 확인 (환불 후 QR 코드 악용 방지)
  - warranty_events 이벤트 기록
- ✅ Claim API (`POST /api/orders/:orderId/claim-token`, `POST /api/orders/:orderId/claim`) (Phase 6 완료)
  - 3-Factor Atomic Check
  - warranties 상태 전이 (issued_unassigned → issued)
  - guest_order_access_token 회수

#### 3. 프론트엔드
- ✅ 상품 상세 페이지 (`buy.html`, `buy-script.js`)
  - 옵션 API 호출
  - 사이즈/색상 선택 UI
  - 재고 없는 옵션 "(품절)" 표시

### ❌ 미완성 부분

#### 1. 데이터베이스 스키마
- ❌ `token_pk` 마이그레이션 (token_master PK 교체) - **⚠️ 복잡, 신중하게 진행 필요**
- ✅ `warranties.status` 컬럼 (issued/active/revoked 등) - Phase 2 완료
- ✅ `warranties.owner_user_id` 컬럼 - Phase 2 완료
- ✅ `warranties.source_order_item_unit_id` 컬럼 - Phase 2 완료
- ✅ `warranties.activated_at`, `warranties.revoked_at` 컬럼 - Phase 2 완료
- ✅ `shipments` 테이블 - Phase 2 완료
- ❌ `shipment_units` 테이블
- ❌ `warranty_events` 테이블
- ❌ `warranty_transfers` 테이블
- ❌ `guest_order_access_tokens` 테이블
- ❌ `claim_tokens` 테이블
- ✅ `product_options` 테이블 (Phase 15-1 완료)

#### 2. 백엔드 로직
- ⚠️ **`orders.status` 직접 업데이트 위반** (즉시 수정 필요)
  - `backend/payments-routes.js` 1434-1438줄: webhook에서 직접 업데이트
  - `backend/index.js` 1675-1715줄: 관리자 API로 직접 수정 가능
- ❌ 선예약형 재고 관리 (주문 생성 시 재고 예약)
- ✅ 옵션 API 개선 (product_options 기반, 재고 없는 옵션도 표시 - Phase 15-2 완료)
- ✅ 색상 데이터 소스 개선 (product_options 기반 SSOT - Phase 15-2 완료)
- ✅ 보증서 활성화 API (`POST /api/warranties/:warrantyId/activate`) - Phase 5 완료
- ✅ Claim API (`POST /api/orders/:orderId/claim-token`, `POST /api/orders/:orderId/claim`) - Phase 6 완료
- ✅ QR 스캔 로직 수정 (warranty 생성 제거, 조회만) - Phase 7 완료
- ✅ 양도 요청/수락 API - Phase 8-1, 8-2 완료
- ✅ 환불 처리 API (관리자 전용) - Phase 9 완료
- ✅ 배송/송장 관리 API - Phase 12 완료
- ❌ 비회원 주문 조회 API

#### 3. 프론트엔드
- ❌ 보증서 활성화 페이지
- ❌ 보증서 상세 페이지 (활성화, 양도 기능)
- ❌ 비회원 주문 조회 페이지
- ❌ Claim 페이지
- ❌ 관리자 페이지 개선 (주문 상세 3단 구조, 보증서 상세)
- ❌ 관리자 페이지 옵션 관리 기능 (Phase 15-3)

---

## 🎯 구현 우선순위 및 단계별 계획

### 🔴 Phase -1: orders.status 직접 업데이트 제거 (즉시 수정 필요)

**목적**: 설계 원칙 위반 수정 (SSOT 준수)

**⚠️ 심각도**: 🔴 **최우선** - 설계 원칙 위반으로 시스템 일관성 해침

**작업**:

#### -1-1. payments-routes.js 수정
**파일**: `backend/payments-routes.js`

**위치**: `handlePaymentStatusChange()` 함수 (1434-1438줄)

**현재 코드** (위반):
```javascript
// ❌ 위반: orders.status 직접 업데이트
const [updateResult] = await connection.execute(
    `UPDATE orders 
     SET status = ?, updated_at = NOW() 
     WHERE order_id = ?`,
    [orderStatus, orderIdForPaidProcess]
);
```

**수정 후**:
```javascript
// ✅ 올바른 구현: 집계 함수 호출
const { updateOrderStatus } = require('./utils/order-status-aggregator');
await updateOrderStatus(connection, orderIdForPaidProcess);
```

**예상 작업 시간**: 1시간

**의존성**: 없음 (이미 구현된 `updateOrderStatus` 함수 사용)

**완료 조건**:
- `orderStatus` 변수 제거
- `updateOrderStatus()` 호출로 대체
- webhook 처리 후 `orders.status`가 올바르게 집계됨

#### -1-2. 관리자 API 수정 또는 제거
**파일**: `backend/index.js`

**위치**: `PUT /api/admin/orders/:orderId/status` (1675-1715줄)

**옵션 A (권장)**: API 제거
- 관리자는 `orders.status`를 직접 수정할 수 없음
- 상태 변경은 `order_item_units.unit_status`나 `paid_events` 변경으로만 가능

**옵션 B**: API를 집계 함수 호출로 변경
- 요청된 `status` 값이 집계 결과와 일치하는지 검증
- 일치하지 않으면 에러 반환

**예상 작업 시간**: 1-2시간

**의존성**: 없음

**완료 조건**:
- 옵션 A: API 제거 완료
- 옵션 B: 집계 함수 호출로 변경 완료, 검증 로직 추가

---

### Phase 0: 옵션 API 개선 (완료)

**목적**: GPT 제안 반영, UX 개선

**작업**:
1. **옵션 API 응답 구조 개선** (`backend/product-routes.js`)
   - `in_stock_qty` 추가 (각 사이즈/색상별 재고 수량)
   - `availability_map` 추가 (색상-사이즈 조합별 재고)
   - `default_color` 추가 (기본 색상)

2. **프론트엔드 개선** (`buy-script.js`)
   - `availability_map` 기반 동적 옵션 활성화
   - 색상 선택 시 해당 색상의 가능한 사이즈만 활성화
   - 사이즈 선택 시 재고 수량 표시

**예상 작업 시간**: 2-3시간

**의존성**: 없음 (기존 API와 호환)

**완료 조건**:
- 옵션 API 응답에 `in_stock_qty`, `availability_map`, `default_color` 포함
- 프론트엔드에서 색상 선택 시 사이즈 동적 활성화
- 재고 수량 표시

---

### Phase 1: 색상 데이터 소스 개선 (완료)

**목적**: product_id 파싱 의존 제거, stock_units 기반 SSOT

**작업**:
1. **옵션 API 수정** (`backend/product-routes.js`)
   - `stock_units`에서 DISTINCT color 조회 (재고 상태 무관)
   - `product_id` 추출은 fallback으로만 사용
   - 재고가 없어도 상품이 지원하는 색상 표시

2. **프론트엔드 수정** (`buy-script.js`)
   - API 응답 구조 변경 대응
   - fallback 로직 제거 (API가 항상 색상 반환)

**예상 작업 시간**: 1-2시간

**의존성**: Phase 0 완료 권장 (같은 파일 수정)

**완료 조건**:
- `stock_units`에서 모든 색상 조회 (재고 상태 무관)
- 재고가 0인 상품도 색상 표시
- `product_id` 추출은 fallback으로만 사용

---

### Phase 2: 핵심 인프라 테이블 생성 (최우선, 모든 기능의 기반)

**목적**: 보증서/인보이스 기능의 기반 테이블 완성

**작업 순서** (의존성 고려):

#### 2-1. `warranties` 컬럼 추가
**파일**: `backend/migrations/050_add_warranties_status_columns.sql`

**⚠️ 중요**: `warranties.status`는 권리/정책 상태의 SSOT입니다. 모든 환불/양도/활성화 판정은 이 컬럼만 사용합니다.

```sql
-- status 컬럼 추가
ALTER TABLE warranties
ADD COLUMN status ENUM('issued_unassigned', 'issued', 'active', 'suspended', 'revoked') 
NOT NULL DEFAULT 'issued_unassigned'
COMMENT '보증서 상태 (SSOT - 권리/정책 상태의 진실 원천)' 
AFTER warranty_id;

-- owner_user_id 컬럼 추가
ALTER TABLE warranties
ADD COLUMN owner_user_id INT NULL
COMMENT '보증서 소유자 (NULL이면 issued_unassigned, issued/active/suspended는 NOT NULL 필수)'
AFTER status;

-- source_order_item_unit_id 컬럼 추가
ALTER TABLE warranties
ADD COLUMN source_order_item_unit_id BIGINT NULL
COMMENT '주문 항목 단위 연결'
AFTER owner_user_id;

-- activated_at 컬럼 추가
ALTER TABLE warranties
ADD COLUMN activated_at DATETIME NULL
COMMENT '활성화 시점'
AFTER source_order_item_unit_id;

-- revoked_at 컬럼 추가 (A안 확정: 재판매 시에도 유지, 이력)
ALTER TABLE warranties
ADD COLUMN revoked_at DATETIME NULL
COMMENT '환불 시점 (재판매 시에도 유지, 이력 - A안 확정)'
AFTER activated_at;

-- 인덱스 추가
CREATE INDEX idx_warranties_status ON warranties(status);
CREATE INDEX idx_warranties_owner_user_id ON warranties(owner_user_id);
CREATE INDEX idx_warranties_source_order_item_unit_id ON warranties(source_order_item_unit_id);

-- FK 추가 (order_item_units 테이블 생성 후)
ALTER TABLE warranties
ADD CONSTRAINT fk_warranties_source_order_item_unit
FOREIGN KEY (source_order_item_unit_id) REFERENCES order_item_units(order_item_unit_id) ON DELETE RESTRICT;

-- ⚠️ UNIQUE 제약 추가 (토큰당 레코드 1개 강제)
-- active_key 패턴 사용 권장 (유효 보증서만 UNIQUE)
ALTER TABLE warranties
ADD COLUMN active_key VARCHAR(50) GENERATED ALWAYS AS (
    CASE WHEN status IN ('issued', 'issued_unassigned', 'active', 'suspended') 
         THEN CONCAT('token_', token_pk) 
         ELSE NULL 
    END
) VIRTUAL COMMENT '유효 보증서 키 (active_key 패턴)';

CREATE UNIQUE INDEX uk_warranties_active_key ON warranties(active_key);
```

**기존 데이터 마이그레이션**:
```sql
-- 기존 warranties 데이터에 status 설정
UPDATE warranties 
SET status = 'issued_unassigned' 
WHERE status IS NULL OR status = '';

-- ⚠️ owner_user_id 검증 (issued/active/suspended는 NOT NULL 필수)
-- 애플리케이션 레벨 가드로 강제 (DB CHECK는 MySQL 버전에 따라)
```

**완료 조건**: 
- 모든 컬럼 추가 완료
- 기존 데이터 마이그레이션 완료
- FK 제약 추가 완료

#### 2-2. `warranty_events` 테이블 생성
**파일**: `backend/migrations/051_create_warranty_events_table.sql`

**⚠️ 중요**: Outbox 패턴 사용 - 트랜잭션 내 최소 이벤트 기록, 상세/확장은 비동기

```sql
CREATE TABLE warranty_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    event_type VARCHAR(50) NOT NULL COMMENT '이벤트 타입 (status_changed, ownership_transferred 등)',
    target_type VARCHAR(50) NOT NULL DEFAULT 'warranty' COMMENT '대상 타입',
    target_id INT NOT NULL COMMENT 'warranty_id',
    actor_type ENUM('system', 'admin', 'user') NOT NULL COMMENT '행위자 타입',
    actor_id INT NULL COMMENT '행위자 ID (user_id 또는 admin_user_id)',
    metadata JSON COMMENT '추가 정보 (from/to 상태, 이전/새 소유자 등)',
    processed_at DATETIME NULL COMMENT '비동기 처리 완료 시각 (Outbox 패턴)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_target (target_type, target_id),
    INDEX idx_created_at (created_at),
    INDEX idx_unprocessed (processed_at),
    INDEX idx_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**⚠️ Outbox 패턴 규칙**:
- **트랜잭션 내 최소 이벤트 기록 필수**: 상태 전이와 동일 트랜잭션에서 이벤트 INSERT
- **이벤트 INSERT 실패 시 전이도 롤백**: 증거성 보장
- **상세 로그/외부 전송은 비동기로**: 트랜잭션 외부에서 처리

**기록 대상 전이** (모두 필수):
- `issued_unassigned` → `issued` (claim) - `event_type: 'status_changed'`
- `issued` → `active` (활성화) - `event_type: 'status_changed'`
- `active` → `revoked` (환불) - `event_type: 'status_changed'`
- `revoked` → `issued` (재판매) ⚠️ **중요** - `event_type: 'status_changed'`
- `active` → `suspended` (제재) - `event_type: 'status_changed'`
- `suspended` → `issued` (제재 해제) - `event_type: 'status_changed'`
- `active` → `active` (양도, 소유자만 변경) - `event_type: 'ownership_transferred'` ⚠️ **타입 분리**

**완료 조건**: 테이블 생성 완료

#### 2-3. `warranty_transfers` 테이블 생성
**파일**: `backend/migrations/052_create_warranty_transfers_table.sql`

```sql
CREATE TABLE warranty_transfers (
    transfer_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    warranty_id INT NOT NULL COMMENT '양도 대상 보증서',
    from_user_id INT NOT NULL COMMENT '양도 요청자 (현재 소유자)',
    to_email VARCHAR(255) NOT NULL COMMENT '수령자 이메일',
    to_user_id INT NULL COMMENT '수령자 user_id (수락 시점에 설정)',
    transfer_code VARCHAR(7) NOT NULL UNIQUE COMMENT '랜덤 7자 코드',
    status ENUM('requested', 'accepted', 'completed', 'cancelled', 'expired') DEFAULT 'requested',
    expires_at DATETIME NOT NULL COMMENT '72시간 후 만료 시각',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    accepted_at DATETIME NULL,
    completed_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    cancelled_by_user_id INT NULL COMMENT '취소한 사용자 (요청자 또는 수령자)',
    FOREIGN KEY (warranty_id) REFERENCES warranties(warranty_id) ON DELETE RESTRICT,
    FOREIGN KEY (from_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (to_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_warranty_id (warranty_id),
    INDEX idx_from_user_id (from_user_id),
    INDEX idx_to_email (to_email),
    INDEX idx_transfer_code (transfer_code),
    INDEX idx_status (status),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**완료 조건**: 테이블 생성 완료

#### 2-4. `guest_order_access_tokens` 테이블 생성
**파일**: `backend/migrations/053_create_guest_order_access_tokens_table.sql`

```sql
CREATE TABLE guest_order_access_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT '주문 ID',
    token VARCHAR(100) NOT NULL UNIQUE COMMENT '접근 토큰 (90일 유효)',
    expires_at DATETIME NOT NULL COMMENT '만료 시각 (90일 후)',
    revoked_at DATETIME NULL COMMENT '회수 시각 (claim 시 회수)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    INDEX idx_order_id (order_id),
    INDEX idx_token (token),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**완료 조건**: 테이블 생성 완료

#### 2-5. `claim_tokens` 테이블 생성
**파일**: `backend/migrations/054_create_claim_tokens_table.sql`

```sql
CREATE TABLE claim_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT '주문 ID',
    token VARCHAR(100) NOT NULL UNIQUE COMMENT 'claim 토큰 (15분 유효)',
    expires_at DATETIME NOT NULL COMMENT '만료 시각 (15분 후)',
    used_at DATETIME NULL COMMENT '사용 시각 (1회성)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    INDEX idx_order_id (order_id),
    INDEX idx_token (token),
    INDEX idx_expires_at (expires_at),
    INDEX idx_used_at (used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**완료 조건**: 테이블 생성 완료

#### 2-6. `shipments` 테이블 생성 (active_key 패턴)
**파일**: `backend/migrations/055_create_shipments_table.sql`

```sql
CREATE TABLE shipments (
    shipment_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT '주문 ID',
    carrier_code VARCHAR(20) NOT NULL COMMENT '택배사 코드',
    tracking_number VARCHAR(100) NOT NULL COMMENT '송장번호',
    active_key VARCHAR(150) GENERATED ALWAYS AS (
        CASE WHEN voided_at IS NULL THEN CONCAT(carrier_code, ':', tracking_number) ELSE NULL END
    ) VIRTUAL COMMENT '유효 송장 키',
    shipped_at DATETIME NULL COMMENT '발송 시각',
    created_by_admin_id INT NULL COMMENT '생성한 관리자 ID',
    voided_at DATETIME NULL COMMENT '무효화 시각',
    void_reason VARCHAR(500) NULL COMMENT '무효화 사유',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    FOREIGN KEY (carrier_code) REFERENCES carriers(code) ON DELETE RESTRICT,
    UNIQUE KEY uk_shipments_active_key (active_key),
    INDEX idx_order_id (order_id),
    INDEX idx_carrier_code (carrier_code),
    INDEX idx_tracking_number (tracking_number),
    INDEX idx_voided_at (voided_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**완료 조건**: 테이블 생성 완료

#### 2-7. `shipment_units` 테이블 생성
**파일**: `backend/migrations/056_create_shipment_units_table.sql`

**⚠️ 중요**: B안 확정 (운영형) - 이력 허용, 복합키 사용

```sql
CREATE TABLE shipment_units (
    shipment_id BIGINT NOT NULL COMMENT '송장 ID',
    order_item_unit_id BIGINT NOT NULL COMMENT '주문 항목 단위 ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (shipment_id, order_item_unit_id),
    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id) ON DELETE RESTRICT,
    FOREIGN KEY (order_item_unit_id) REFERENCES order_item_units(order_item_unit_id) ON DELETE RESTRICT,
    INDEX idx_shipment_id (shipment_id),
    INDEX idx_order_item_unit_id (order_item_unit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**B안 확정 규칙**:
1. **송장 유니크 정책**: 유효 shipment(`voided_at IS NULL`)에 대해서만 `(carrier_code, tracking_number)` 중복 금지
2. **구현**: generated column `active_key` + `UNIQUE(active_key)`
3. **shipments는 삭제 금지. void만 허용**
4. **replace(교체)는 void + 신규 shipment 생성 + shipment_units 재매핑 + current_shipment_id 갱신을 한 트랜잭션으로 수행**
5. **current_shipment_id가 NULL이 아니면, shipment_units에 `(current_shipment_id, order_item_unit_id)` 행이 반드시 존재해야 함**
6. **current_shipment_id는 유효 shipment(`voided_at IS NULL`)만 참조 가능**
7. **delivered 이후 replace 금지. delivered 이후 resend는 "추가 shipment 생성"만 허용**

**완료 조건**: 테이블 생성 완료

#### 2-8. `order_item_units.current_shipment_id` 컬럼 추가
**파일**: `backend/migrations/057_add_order_item_units_current_shipment_id.sql`

```sql
ALTER TABLE order_item_units
ADD COLUMN current_shipment_id BIGINT NULL
COMMENT '현재 유효 송장 (shipments 테이블 생성 후 FK 추가)'
AFTER unit_status;

ALTER TABLE order_item_units
ADD CONSTRAINT fk_order_item_units_current_shipment
FOREIGN KEY (current_shipment_id) REFERENCES shipments(shipment_id) ON DELETE RESTRICT;

CREATE INDEX idx_current_shipment_id ON order_item_units(current_shipment_id);
```

**완료 조건**: 컬럼 및 FK 추가 완료

#### 2-9. `order_item_units.active_lock` 컬럼 추가 (이중 판매 방지)
**파일**: `backend/migrations/058_add_order_item_units_active_lock.sql`

**⚠️ 중요**: MySQL 패턴으로 이중 판매 방지

```sql
-- active_lock generated column 추가
ALTER TABLE order_item_units
ADD COLUMN active_lock INT GENERATED ALWAYS AS (
    CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END
) VIRTUAL COMMENT '활성 락 (이중 판매 방지)';

-- UNIQUE 제약 추가 (이중 판매 방지)
CREATE UNIQUE INDEX uk_order_item_units_stock_active_lock 
ON order_item_units(stock_unit_id, active_lock);
```

**⚠️ 운영 규칙**: 위 상태 집합은 실제 `order_item_units` 테이블의 ENUM과 일치해야 하며, 신규 상태 추가 시 `active_lock` 정의를 갱신해야 한다.

**완료 조건**: 컬럼 및 UNIQUE 제약 추가 완료

#### 2-10. `orders.paid_at` 컬럼 추가
**파일**: `backend/migrations/059_add_orders_paid_at.sql`

**⚠️ 중요**: `paid_at`은 캐시/파생 필드이며, `paid_events` 존재가 SSOT입니다.

```sql
ALTER TABLE orders
ADD COLUMN paid_at DATETIME NULL 
COMMENT '결제 완료 시점 (paid_events 기반, 캐시/파생 필드)' 
AFTER status;

CREATE INDEX idx_paid_at ON orders(paid_at);
```

**동기화 규칙**: `paid_events` 생성 시 `paid_at`도 함께 업데이트 (동일 트랜잭션)
- **⚠️ 금지**: `paid_events` 존재하지만 `paid_at`이 NULL인 상태는 금지(동기화 필수)

**완료 조건**: 컬럼 및 인덱스 추가 완료

**예상 작업 시간**: 6-8시간 (마이그레이션 작성 + 실행 + 검증)

**의존성**: 
- `order_item_units` 테이블 존재 필수 (2-7)
- `carriers` 테이블 존재 필수 (2-6)
- `token_pk` 마이그레이션 완료 권장 (warranties FK 전환 시 필요)

**완료 조건**:
- 모든 테이블 생성 완료
- FK 제약 추가 완료
- UNIQUE 제약 추가 완료 (active_lock 패턴)
- 기존 데이터 마이그레이션 완료

---

### Phase 3: processPaidOrder() 함수 업데이트 (warranties 컬럼 반영)

**목적**: Phase 2에서 추가한 warranties 컬럼을 processPaidOrder()에 반영

**⚠️ 핵심 원칙**:
1. **락 순서 준수**: `stock_units`(물리) → `orders`(결제) → `warranties`(권리) → `invoices`(문서)
2. **멱등성 보장**: `paid_events` UNIQUE 제약으로 재처리 방지
3. **재고 배정 규칙**: 오직 `stock_units.status = 'in_stock'`만 배정
4. **보증서 생성 규칙**: 회원/비회원 구분, `UNIQUE(token_pk)` 제약
5. **재판매 처리**: `revoked` 상태 warranties 업데이트 (새 레코드 생성 안 함)

**작업**:
1. **`backend/utils/paid-order-processor.js` 수정**
   - `warranties` 생성 시 `status`, `owner_user_id`, `source_order_item_unit_id` 설정
   - 회원 주문: `status = 'issued'`, `owner_user_id = orders.user_id`
   - 비회원 주문: `status = 'issued_unassigned'`, `owner_user_id = NULL`
   - **재판매 처리**: `revoked` 상태 warranties 업데이트 (새 레코드 생성 안 함)
     - `warranties.status` = `'issued'` 또는 `'issued_unassigned'` (주문이 회원/비회원에 따라)
     - `warranties.source_order_item_unit_id` = 새로운 주문의 `order_item_unit_id`
     - `warranties.owner_user_id` = 새로운 주문의 `user_id` (또는 NULL)
     - **⚠️ 원자적 조건**: `WHERE token_pk = ? AND status = 'revoked'` + `affectedRows=1` 검증
     - **⚠️ revoked_at 유지**: 재판매 시에도 `revoked_at`은 그대로 유지 (A안 확정, 이력)

2. **금액 검증 추가** (FINAL_EXECUTION_SPEC_REVIEW.md 2088-2125줄 참조)
   - 서버에서 확정한 주문 금액과 결제 금액 일치 확인
   - 불일치 시 `paid_events`는 기록하되 주문 처리는 중단

3. **멱등성 체크 강화**
   - `paid_events` INSERT 시 `ER_DUP_ENTRY` 에러 처리
   - 이미 처리된 경우 즉시 종료

**예상 작업 시간**: 2-3시간

**의존성**: Phase 2-1 완료 필수

**완료 조건**:
- `processPaidOrder()`에서 warranties 생성 시 모든 컬럼 설정
- 회원/비회원 구분 정상 동작
- 재판매 처리 정상 동작 (revoked → issued 전이)
- 금액 검증 정상 동작
- 멱등성 체크 정상 동작

---

### Phase 4: 선예약형 재고 관리 구현 (GPT 제안 반영)

**목적**: 결제 진행 중 재고 예약 (더 안전한 방식)

**현재 방식 (Paid 시점 예약)**:
```
1. 주문 생성 (orders 테이블에 pending 상태로 저장)
2. 결제 진행 (재고 예약 없음)
3. Paid 처리 시 → 재고 예약 (reserved)
```

**선예약형 (결제 진행 중 예약)**:
```
1. 주문 생성 (orders 테이블에 pending 상태로 저장)
2. "결제 진행" 클릭 시 → 재고 예약 (reserved)
3. 결제 승인 성공 → reserved 유지 (또는 sold로 전환)
4. 결제 실패/취소/타임아웃 → reserved → in_stock (예약 해제)
```

**작업**:

#### 4-1. 주문 생성 시 재고 예약 로직 추가
**파일**: `backend/order-routes.js`

**수정 위치**: `POST /api/orders` 라우트

**추가 로직**:
```javascript
// 주문 생성 후, 재고 예약 (선예약형)
async function reserveStockForOrder(connection, orderId, orderItems) {
    await connection.beginTransaction();
    try {
        // 주문 잠금
        await connection.execute(
            'SELECT * FROM orders WHERE order_id = ? FOR UPDATE',
            [orderId]
        );
        
        // 각 order_item별로 재고 예약
        for (const item of orderItems) {
            const { product_id, size, color, quantity } = item;
            
            // 재고 선택 및 예약 (FOR UPDATE SKIP LOCKED)
            const [stockUnits] = await connection.execute(
                `SELECT stock_unit_id, token_pk
                 FROM stock_units
                 WHERE product_id = ?
                   AND status = 'in_stock'
                   AND (size = ? OR size IS NULL)
                   AND (color = ? OR color IS NULL)
                 ORDER BY stock_unit_id
                 LIMIT ?
                 FOR UPDATE SKIP LOCKED`,
                [product_id, size, color, quantity]
            );
            
            if (stockUnits.length < quantity) {
                throw new Error(`재고 부족: 상품 ${product_id}, 필요: ${quantity}, 가용: ${stockUnits.length}`);
            }
            
            // 재고 상태 업데이트 (reserved로 변경)
            for (const stockUnit of stockUnits) {
                const [updateResult] = await connection.execute(
                    `UPDATE stock_units
                     SET status = 'reserved',
                         reserved_at = NOW(),
                         reserved_by_order_id = ?
                     WHERE stock_unit_id = ?`,
                    [orderId, stockUnit.stock_unit_id]
                );
                
                if (updateResult.affectedRows !== 1) {
                    throw new Error(`재고 상태 업데이트 실패: stock_unit_id=${stockUnit.stock_unit_id}`);
                }
            }
        }
        
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}
```

**예상 작업 시간**: 3-4시간

**의존성**: Phase 2 완료 필수

**완료 조건**:
- 주문 생성 시 재고 예약 정상 동작
- 재고 부족 시 주문 생성 실패
- 동시성 테스트 통과

#### 4-2. 예약 해제 로직 구현
**파일**: `backend/order-routes.js` 또는 `backend/utils/stock-reservation-manager.js`

**⚠️ 중요**: SSOT 원칙 준수 - `orders.status`가 아닌 `paid_events`/`paid_at` 기준으로 판정

**시나리오**:
1. 결제 실패 시 예약 해제
2. 결제 취소 시 예약 해제
3. 결제 타임아웃 시 예약 해제 (배치 작업)

**구현** (이벤트 기반 해제 - 권장):
```javascript
// 결제 실패/취소 이벤트 수신 시 즉시 해제
router.post('/payments/cancel', async (req, res) => {
  const { order_id } = req.body;
  
  await connection.execute(
    `UPDATE stock_units 
     SET status = 'in_stock', 
         reserved_at = NULL, 
         reserved_by_order_id = NULL
     WHERE reserved_by_order_id = ? AND status = 'reserved'`,
    [order_id]
  );
});
```

**구현** (배치 작업 - 백업, SSOT 원칙 준수):
```javascript
// cron job 또는 scheduled task
async function releaseExpiredReservations() {
  const expiredTime = new Date(Date.now() - 30 * 60 * 1000); // 30분 전
  
  // ⚠️ SSOT 원칙: orders.status가 아닌 paid_events/paid_at 기준으로 판정
  await connection.execute(
    `UPDATE stock_units su
     LEFT JOIN orders o ON su.reserved_by_order_id = o.order_id
     LEFT JOIN paid_events pe ON o.order_id = pe.order_id
     SET su.status = 'in_stock',
         su.reserved_at = NULL,
         su.reserved_by_order_id = NULL
     WHERE su.status = 'reserved'
       AND su.reserved_at < ?
       AND (pe.order_id IS NULL OR o.paid_at IS NULL)`,  -- ✅ paid_events/paid_at 기준
    [expiredTime]
  );
}
```

**권장**: 옵션 A + 옵션 B 병행
- 이벤트 기반 해제가 주 방식
- 배치 작업은 백업/안전망
- **반드시 `paid_events` 존재 여부 또는 `paid_at` 기준으로 판정** (orders.status 사용 금지)

**예상 작업 시간**: 2-3시간

**의존성**: Phase 4-1 완료 필수

**완료 조건**:
- 결제 실패 시 예약 해제 정상 동작
- 배치 작업으로 만료된 예약 해제
- SSOT 원칙 준수 확인

#### 4-3. processPaidOrder() 수정 (선예약형 대응)
**파일**: `backend/utils/paid-order-processor.js`

**수정 내용**:
- 이미 예약된 재고를 사용 (새로 예약하지 않음)
- `reserved_by_order_id = orderId`인 재고만 사용
- 예약되지 않은 재고가 있으면 에러 (이론적으로 발생하지 않아야 함)

**예상 작업 시간**: 1-2시간

**의존성**: Phase 4-1 완료 필수

**완료 조건**:
- 예약된 재고만 사용
- 예약되지 않은 재고 감지 시 에러 처리

---

### Phase 5: 보증서 활성화 API 구현

**목적**: 첫 활성화 시 인보이스 연동 확인 (핵심 방어 메커니즘)

**작업**:

#### 5-1. 활성화 API 구현
**파일**: `backend/warranty-routes.js` (신규 생성 또는 기존 파일 수정)

**API 엔드포인트**: `POST /api/warranties/:warrantyId/activate`

**요청 본문**:
```json
{
  "agree": true
}
```

**처리 흐름** (SYSTEM_FLOW_DETAILED.md 4-1절 참조):
1. **FOR UPDATE로 warranties 잠금**
   ```sql
   SELECT * FROM warranties WHERE warranty_id = ? FOR UPDATE
   ```

2. `warranties.owner_user_id = 현재 로그인한 user_id` 확인
3. `warranties.status = 'issued'` 확인 (다른 상태에서 활성화 불가)
4. **핵심 검증: 인보이스 연동 확인** (첫 활성화 시에만 적용)
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
   - **⚠️ 이것이 환불 후 QR 코드 악용 방지의 핵심 방어 메커니즘**

5. 동의 체크 확인 (`agree: true`)
6. **원자적 조건으로 상태 전이**:
   ```sql
   UPDATE warranties 
   SET status = 'active', activated_at = NOW()
   WHERE warranty_id = ? AND status = 'issued' AND owner_user_id = ?
   ```
   - **⚠️ affectedRows=1 검증 필수**
7. `warranty_events`에 활성화 이벤트 기록 (`event_type: 'status_changed'`)
   - **⚠️ 이벤트 INSERT 실패 시 전이도 롤백 (Outbox 패턴)**

**예상 작업 시간**: 3-4시간

**의존성**: Phase 2-1, Phase 2-2 완료 필수

**완료 조건**:
- 활성화 API 정상 동작
- 인보이스 연동 확인 정상 동작
- 환불된 주문의 보증서 활성화 차단
- 이벤트 로깅 정상

---

### Phase 6: Claim API 구현 (비회원 → 회원 전환)

**목적**: 비회원 주문을 회원 계정에 연동

**작업**:

#### 6-1. Claim Token 발급 API
**파일**: `backend/order-routes.js`

**API 엔드포인트**: `POST /api/orders/:orderId/claim-token`

**처리 흐름**:
1. `guest_order_access_token` 검증 (쿠키 또는 세션)
2. 로그인 상태 확인
3. `claim_token` 생성 (15분 유효)
4. `claim_tokens` 테이블에 저장
5. 토큰 반환

**예상 작업 시간**: 2시간

**의존성**: Phase 2-5 완료 필수

**완료 조건**:
- Claim token 발급 정상 동작
- 만료 시간 설정 정상

#### 6-2. Claim API 구현
**파일**: `backend/order-routes.js`

**API 엔드포인트**: `POST /api/orders/:orderId/claim`

**요청 본문**:
```json
{
  "claim_token": "abc123..."
}
```

**처리 흐름** (SYSTEM_FLOW_DETAILED.md 3-2절 참조):
1. **3-Factor Atomic Check**:
   ```sql
   UPDATE claim_tokens
   SET used_at = NOW()
   WHERE token = ?
     AND order_id = ?        -- 바인딩 확인
     AND used_at IS NULL     -- 1회성 확인
     AND expires_at > NOW(); -- 만료 확인
   ```
   - 반드시 **`affectedRows=1`** 확인 후 로직 진행
2. `orders.user_id` = 현재 로그인한 `user_id`로 업데이트
3. `orders.guest_id` = **유지** (감사 로그)
4. 해당 주문의 모든 `warranties.status` = `'issued_unassigned'` → `'issued'`로 업데이트
5. `warranties.owner_user_id` = 현재 로그인한 `user_id`로 업데이트
6. `guest_order_access_token` 회수 (revoked_at 설정)

**예상 작업 시간**: 3-4시간

**의존성**: Phase 6-1 완료 필수

**완료 조건**:
- Claim API 정상 동작
- 3-Factor Atomic Check 정상 동작
- warranties 상태 전이 정상
- guest_order_access_token 회수 정상

---

### Phase 7: QR 스캔 로직 수정

**목적**: QR 스캔 시 warranty 생성 제거, 조회만 수행

**작업**:

#### 7-1. QR 스캔 로직 수정
**파일**: `backend/auth-routes.js`

**현재 구현** (COMPREHENSIVE_SPEC_ANALYSIS.md 참조):
- QR 스캔 시 warranty 생성 (첫 스캔 시)

**수정 후**:
- QR 스캔 시 warranty 조회만 수행
- warranty가 없으면 에러 (paid 처리 시 생성되어야 함)
- warranty 상태 확인 (`status = 'revoked'`면 접근 거부)

**예상 작업 시간**: 2-3시간

**의존성**: Phase 2-1 완료 필수

**완료 조건**:
- QR 스캔 시 warranty 생성 제거
- warranty 조회만 수행
- revoked 상태 보증서 접근 거부

---

### Phase 8: 양도 시스템 구현

**목적**: 활성화된 보증서 양도 (사용자 간)

**작업**:

#### 8-1. 양도 요청 API
**파일**: `backend/warranty-routes.js`

**API 엔드포인트**: `POST /api/warranties/:warrantyId/transfer`

**요청 본문**:
```json
{
  "to_email": "recipient@example.com"
}
```

**처리 흐름** (SYSTEM_FLOW_DETAILED.md 5-1절 참조):
1. `warranties.owner_user_id = 현재 로그인한 user_id` 확인
2. `warranties.status = 'active'` 확인
3. 랜덤 7자 코드 생성 (72시간 유효)
4. `warranty_transfers` 테이블에 양도 요청 기록
5. 양도 링크를 이메일로 수령자에게 전송

**예상 작업 시간**: 4-5시간

**의존성**: Phase 2-3 완료 필수

**완료 조건**:
- 양도 요청 API 정상 동작
- 이메일 발송 정상
- 만료 시간 설정 정상

#### 8-2. 양도 수락 API
**파일**: `backend/warranty-routes.js`

**API 엔드포인트**: `POST /api/warranties/transfer/accept`

**요청 본문**:
```json
{
  "transfer_id": 1,
  "transfer_code": "ABC1234"
}
```

**처리 흐름** (SYSTEM_FLOW_DETAILED.md 5-1절 참조):
1. **트랜잭션 시작**
2. **원자적 조건 검증**:
   - `warranty_transfers.status = 'requested'` AND `expires_at > NOW()` (FOR UPDATE로 잠금)
   - 코드 검증 (`transfer_code` 일치 확인)
   - 이메일 일치 검증 (`to_email` = 로그인한 계정 이메일)
   - 현재 소유자 일치 확인 (요청 생성 시점과 수락 시점 일치 검증)
3. **warranties 소유자 변경 (원자적 조건)**:
   ```sql
   UPDATE warranties
   SET owner_user_id = ?
   WHERE warranty_id = ? 
   AND owner_user_id = ?
   AND status = 'active'
   ```
   - **⚠️ affectedRows=1 검증 필수**
4. **transfer 상태 변경 (원자적 조건)**:
   ```sql
   UPDATE warranty_transfers
   SET status = 'completed',
       to_user_id = ?,
       completed_at = NOW()
   WHERE transfer_id = ?
   AND status = 'requested'
   ```
   - **⚠️ affectedRows=1 검증 필수**
5. **`warranties.status`는 `'active'` 상태로 유지** (재활성화 불필요)
6. `warranty_events`에 양도 이벤트 기록 (`event_type: 'ownership_transferred'`) ⚠️ **이벤트 타입 분리**
   - **⚠️ 이벤트 INSERT 실패 시 전이도 롤백 (Outbox 패턴)**
7. **COMMIT**

**⚠️ 양도 후 소유권 정책**:
- **1토큰 = 1소유자 필수 조건**: 한 토큰은 동시에 한 명의 소유자만 가질 수 있음
- **양도 후 원래 소유자는 더 이상 그 보증서에 접근할 수 없음**
- **새 소유자는 즉시 보증서 사용 가능** (`active` 상태 유지, 재활성화 불필요)
- **인보이스 연동 확인 불필요**: 양도 받은 보증서는 이미 `active` 상태이므로 인보이스 연동 확인 없이 바로 사용 가능

**예상 작업 시간**: 4-5시간

**의존성**: Phase 8-1 완료 필수

**완료 조건**:
- 양도 수락 API 정상 동작
- 원자적 조건 검증 정상
- 이벤트 로깅 정상

#### 8-3. 양도 만료 배치 작업
**파일**: `backend/utils/warranty-transfer-cleanup.js`

**작업**: 72시간 초과 양도 요청 자동 만료

**예상 작업 시간**: 1-2시간

**의존성**: Phase 8-1 완료 필수

**완료 조건**:
- 배치 작업 정상 동작
- 만료된 요청 자동 처리

---

### Phase 9: 환불 처리 API 구현 (관리자 전용)

**목적**: 관리자가 환불 처리 (고객 직접 요청 불가)

**작업**:

#### 9-1. 환불 처리 API
**파일**: `backend/admin-routes.js` 또는 `backend/refund-routes.js`

**API 엔드포인트**: `POST /api/admin/refunds/process`

**요청 본문**:
```json
{
  "warranty_id": 1,
  "reason": "고객 요청"
}
```

**처리 흐름** (SYSTEM_FLOW_DETAILED.md 6-2절 참조):
1. **환불 접수 방식 (확정)**:
   - ❌ **고객 직접 환불 요청 불가**: 고객이 버튼이나 API로 직접 환불 요청할 수 없음
   - ✅ **문의 시스템으로만 접수**: 고객 문의(`inquiries`)에 환불 요청이 들어오면 관리자가 확인
   - ✅ **관리자 수동 처리**: 관리자 페이지에서 확인 후 수동으로 환불 처리

2. **환불 가능 판정**: `warranties.status`만 본다 (SSOT)
   - `revoked` → 거부 (이미 환불 완료)
   - `active` → 거부 (활성화된 보증서는 환불 불가)
   - `issued` / `issued_unassigned` → 허용 (정책 범위 내)
   - ❌ `orders.status`로 판단 금지
   - ❌ `unit_status`로 판단 금지

3. **원자적 조건으로 상태 전이**:
   ```sql
   UPDATE warranties 
   SET status = 'revoked', revoked_at = NOW()
   WHERE warranty_id = ? AND status IN ('issued', 'issued_unassigned')
   ```
   - **⚠️ affectedRows=1 검증 필수**

4. `order_item_units.unit_status` = `'refunded'` 업데이트
5. 재고 상태: `stock_units.status` → `'in_stock'` (재판매 가능)
6. **credit_note 생성** (`invoices` 테이블, `type='credit_note'`)
   - `related_invoice_id`: 원본 invoice_id
   - `invoice_number`: `PM-CN-YYMMDD-HHmmss-{랜덤}` 형식 (credit note 번호)
   - `payload_json`: 환불 대상 unit 식별자(`order_item_unit_id` 리스트), 환불 금액/세금/통화, 환불 사유, 환불 트랜잭션 키(`payment_key`) 포함
   - `order_snapshot_hash`: `payload_json` 해시 (위변조/동일문서 판별)
   - `version`: 인보이스 템플릿 버전 (PDF 양식 변경 대비)
   - **부분 환불 지원**: 원본 1장에 여러 credit_note 가능 (`related_invoice_id`는 1:N 허용)
   - **UNIQUE(invoice_number) 충돌 시**: 재시도 1~2회로 새 번호 재발급, 실패 시 장애 보고
7. `warranty_events`에 환불 이벤트 기록 (`event_type: 'status_changed'`)
   - **⚠️ 이벤트 INSERT 실패 시 전이도 롤백 (Outbox 패턴)**

8. `orders.status` 집계 함수로 자동 업데이트
   - **⚠️ 부분 환불 정책**: 일부 unit만 `refunded` → 배송 상태 유지 (`partial_shipped`/`partial_delivered`), 별도 refund 상태/금액 표시

**예상 작업 시간**: 4-5시간

**의존성**: Phase 2-1, Phase 2-2 완료 필수

**완료 조건**:
- 환불 처리 API 정상 동작
- 환불 가능 판정 정상
- credit_note 생성 정상
- 이벤트 로깅 정상

---

### Phase 10: 비회원 주문 조회 API 구현 (완료)

**목적**: 비회원이 주문 조회 (옵션 B: 세션 토큰 교환 방식)

**작업**:

#### 10-1. guest_order_sessions 테이블 생성
**파일**: `backend/migrations/080_create_guest_order_sessions_table.sql`

**구조**:
- `session_id`: 세션 ID (PK)
- `order_id`: 주문 ID (FK)
- `session_token`: 세션 토큰 (UNIQUE, 24시간 유효)
- `access_token_id`: 원본 접근 토큰 ID (FK)
- `expires_at`: 만료 시각 (24시간 후)
- `last_access_at`: 마지막 접근 시각

#### 10-2. 세션 발급 엔드포인트
**파일**: `backend/order-routes.js`

**API 엔드포인트**: `GET /api/guest/orders/session?token=...`

**처리 흐름**:
1. `guest_order_access_token` 검증 (`expires_at`, `revoked_at`, `orders.user_id IS NULL`)
2. 세션 토큰 발급 (24시간 TTL)
3. `guest_order_sessions` 테이블에 저장
4. httpOnly Cookie로 세션 토큰 설정 (`Secure`, `SameSite=Lax`)
5. 302 Redirect (`/guest/orders.html?order=ORD-...`)

**에러 처리**:
- 토큰 없음: 400
- 토큰 만료/회수/Claim 완료: 410

#### 10-3. 주문 조회 엔드포인트
**파일**: `backend/order-routes.js`

**API 엔드포인트**: `GET /api/guest/orders/:orderNumber`

**인증**: httpOnly Cookie (`guest_session_token`)

**처리 흐름**:
1. 세션 토큰 검증 (`guest_order_sessions`)
2. 세션 만료 확인
3. 수평 권한상승 방지 (세션 `order_number` == 요청 `order_number`)
4. Claim 완료 확인 (`orders.user_id IS NOT NULL`)
5. `last_access_at` 업데이트
6. 주문 정보 조회 (배송지 정보 포함)
7. 주문 항목 조회
8. 배송 정보 조회 (`shipments` 기반)

**응답 데이터** (배송지 정보 포함):
- `order`: 주문번호, 주문일시, 총액, 상태, 결제일시
- `shipping`: 배송지 정보 (이름, 이메일, 전화, 주소, 도시, 우편번호, 국가)
- `items`: 상품명, 상품코드, 수량, 가격, 사이즈, 색상
- `shipments`: 택배사 코드/이름, 송장번호, 발송일시, 배송완료일시

**에러 처리**:
- 세션 없음: 401
- 세션 만료/Claim 완료/토큰 회수: 410
- 주문번호 불일치: 403
- 주문 없음: 404

**예상 작업 시간**: 3-4시간

**의존성**: Phase 2-4 완료 필수

**완료 조건**:
- ✅ `guest_order_sessions` 테이블 생성 완료
- ✅ 세션 발급 엔드포인트 구현 완료
- ✅ 주문 조회 엔드포인트 구현 완료
- ✅ 세션 검증 로직 구현 완료
- ✅ 배송지 정보 포함 응답 구현 완료

---

### Phase 11: orders.status 집계 함수 구현 (✅ 완료)

**목적**: `orders.status`를 `order_item_units.unit_status` 기반으로 자동 집계

**⚠️ 중요**: `orders.status`는 집계 결과(뷰/표시용)이며, 직접 정책 판단 기준으로 사용하지 않습니다.

**구현 상태**: ✅ **완료** (`backend/utils/order-status-aggregator.js`)

**확인 사항**:
- ✅ `paid_events` 존재 여부 확인
- ✅ `order_item_units.unit_status` 집계
- ✅ `partial_shipped`, `partial_delivered` 상태 지원
- ✅ `refunded` 상태 집계
- ✅ `affectedRows=1` 검증

**작업** (참고용 - 이미 구현됨):
1. **집계 함수 구현** (`backend/utils/order-status-aggregator.js`)
   ```javascript
   async function updateOrderStatus(orderId) {
     const [units] = await connection.execute(
       `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN unit_status IN ('shipped', 'delivered') THEN 1 ELSE 0 END) as shipped_count,
          SUM(CASE WHEN unit_status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
          SUM(CASE WHEN unit_status LIKE 'refunded%' THEN 1 ELSE 0 END) as refunded_count
        FROM order_item_units oiu
        JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
        WHERE oi.order_id = ?`,
       [orderId]
     );
     
     const stats = units[0];
     let newStatus;
     
     // paid_events 존재 여부 확인
     const [paidEvents] = await connection.execute(
       'SELECT * FROM paid_events WHERE order_id = ?',
       [orderId]
     );
     
     if (paidEvents.length === 0) {
       newStatus = 'pending';
     } else if (stats.refunded_count === stats.total) {
       newStatus = 'refunded';
     } else if (stats.delivered_count === stats.total) {
       newStatus = 'delivered';
     } else if (stats.delivered_count > 0) {
       newStatus = 'partial_delivered';
     } else if (stats.shipped_count === stats.total) {
       newStatus = 'shipped';
     } else if (stats.shipped_count > 0) {
       newStatus = 'partial_shipped';
     } else {
       newStatus = 'paid';
     }
     
     await connection.execute(
       'UPDATE orders SET status = ? WHERE order_id = ?',
       [newStatus, orderId]
     );
   }
   ```

2. **트리거 또는 애플리케이션 레벨 호출**
   - `order_item_units.unit_status` 변경 시 호출
   - `paid_events` 생성 시 호출
   - 배송 처리 API에서 호출
   - 환불 처리 API에서 호출

**예상 작업 시간**: 2-3시간

**의존성**: Phase 2 완료 필수

**완료 조건**:
- 집계 함수 정상 동작
- 부분배송 상태 정상 처리
- `paid_events` 기준 정상 처리

---

### Phase 12: 배송/송장 관리 API 구현

**목적**: 관리자가 송장 생성 및 배송 상태 관리

**작업**:

#### 12-1. 송장 생성 API
**파일**: `backend/admin-routes.js` 또는 `backend/shipment-routes.js`

**API 엔드포인트**: `POST /api/admin/orders/:orderId/shipments`

**요청 본문**:
```json
{
  "order_item_unit_ids": [1001, 1002],
  "carrier_code": "CJ",
  "tracking_number": "1234567890"
}
```

**처리 흐름** (SYSTEM_FLOW_DETAILED.md 8-4절 참조):
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

**⚠️ 송장 교체 정책 (B안 확정)**:
- **교체 흐름**: 기존 shipment를 `voided_at` + `void_reason`으로 무효화 → 새 shipment 생성 → `shipment_units`에 동일 unit 재매핑 → `order_item_units.current_shipment_id`를 새 shipment로 교체
- **핵심 금지**: "shipment 없이 `shipped`로 바꾸기"는 그대로 금지 유지
- **delivered 이후 replace 금지**: delivered 이후 resend는 "추가 shipment 생성"만 허용

**예상 작업 시간**: 4-5시간

**의존성**: Phase 2-6, Phase 2-7, Phase 2-8 완료 필수

**완료 조건**:
- 송장 생성 API 정상 동작
- 송장 교체 정상 동작 (void + 신규 생성)
- 재발송 정상 동작

#### 12-2. 배송 완료 처리 API
**파일**: `backend/admin-routes.js` 또는 `backend/shipment-routes.js`

**API 엔드포인트**: `POST /api/admin/orders/:orderId/deliver`

**요청 본문**:
```json
{
  "order_item_unit_ids": [1001, 1002]
}
```

**처리 흐름**:
1. 관리자가 주문 상세 페이지에서 배송 완료 처리할 제품 확인
2. 각 `order_item_unit`의 시리얼 넘버와 토큰 확인
3. `order_item_units.unit_status` = `'delivered'` 업데이트
4. `orders.status` 집계 함수로 자동 업데이트
   - **부분배송 지원**: 일부 `delivered` 이상, 일부 `shipped` → `partial_delivered`
   - 모든 `delivered` 이상 → `delivered`

**예상 작업 시간**: 2시간

**의존성**: Phase 12-1 완료 권장

**완료 조건**:
- 배송 완료 처리 API 정상 동작
- orders.status 집계 정상

---

### Phase 13: 관리자 페이지 개선

**목적**: 주문 상세 3단 구조, 보증서 상세 화면 구현

**작업**:

#### 13-1. 주문 상세 API 개선 (3단 구조)
**파일**: `backend/admin-routes.js`

**API 엔드포인트**: `GET /api/admin/orders/:orderId`

**응답 구조** (SYSTEM_FLOW_DETAILED.md 8-3절 참조):
```json
{
  "order": {
    "order_id": 1,
    "order_number": "ORD-20250101-001",
    "user_id": 123,
    "guest_id": null,
    "status": "paid",
    "paid_at": "2025-01-01 10:05:00",
    "total_amount": 100000,
    "customer_info": {
      "email": "user@example.com",
      "name": "홍길동",
      "phone": "010-1234-5678"
    }
  },
  "invoice": {
    "invoice_number": "PM-INV-20250101-100500-ABC",
    "issued_at": "2025-01-01 10:05:00",
    "total_amount": 100000
  },
  "order_items": [
    {
      "order_item_id": 1,
      "product_name": "테뉴 솔리드 셔츠",
      "quantity": 2,
      "price": 50000,
      "units": [
        {
          "order_item_unit_id": 1001,
          "unit_seq": 1,
          "serial_number": "SN-001",
          "token": "ABC12345678901234567",
          "token_masked": "ABC1...5678",
          "unit_status": "reserved",
          "warranty_status": "issued",
          "current_shipment": {
            "shipment_id": 1,
            "carrier_code": "CJ",
            "tracking_number": "1234567890"
          }
        }
      ]
    }
  ]
}
```

**⚠️ 토큰 노출 범위 정책 (보안 필수)**:
- **목록 화면**: 토큰 마스킹 (예: 앞 4자/뒤 4자만 표시) - `ABC1...5678`
- **상세 화면**: 전체 토큰 표시 (배송/환불 처리 시 필요)
- **접근권한 분리**: "전체 토큰 보기" 권한을 별도로 관리 (가능하면 베스트)

**⚠️ 시리얼 넘버 출처 명확화**:
- **실제 제품 시리얼 넘버**: `token_master.serial_number` (또는 `stock_units`를 통해 조회)
- **DB 내부 ID**: `order_item_unit_id` (참조용, 표시는 선택)

**예상 작업 시간**: 4-5시간

**의존성**: Phase 2 완료 필수

**완료 조건**:
- 주문 상세 API 3단 구조 정상 동작
- 인보이스 정보 포함
- 시리얼 넘버, 토큰 정보 포함

#### 13-2. 주문 상세 프론트엔드 개선
**파일**: `admin-qhf25za8/orders.html`, `admin-qhf25za8/admin-orders.js`

**작업**:
1. 1단: 주문 정보 카드 (인보이스 정보 포함)
2. 2단: 주문 항목 리스트
3. 3단: 주문 항목 단위 테이블 (시리얼 넘버, 토큰, 배송 상태, 보증서 상태)
4. 출고/배송 버튼 (체크박스 선택 기반)

**예상 작업 시간**: 6-8시간

**의존성**: Phase 13-1 완료 필수

**완료 조건**:
- 주문 상세 화면 3단 구조 정상 표시
- 출고/배송 버튼 정상 동작

#### 13-3. 보증서 상세 화면 구현
**파일**: `admin-qhf25za8/warranties.html` (신규), `admin-qhf25za8/admin-warranties.js` (신규)

**작업**:
1. 보증서 검색 화면
   - **검색 키 (SSOT 기준)**:
     - 토큰 (20자): `token_master.token` → `token_master.token_pk` → `warranties.token_pk`
     - 내부 코드 (UUID): `warranties.public_id`
     - 시리얼 넘버: `token_master.serial_number` → `token_master.token_pk` → `warranties.token_pk`
     - ROT 코드: `token_master.rot_code` → `token_master.token_pk` → `warranties.token_pk`
     - 보증서 하단 코드: `token_master.warranty_bottom_code` → `token_master.token_pk` → `warranties.token_pk`
   - **검색 결과 UX**: 단건이면 상세 바로 이동, 다건이면 리스트 표시
2. 보증서 상세 화면:
   - **보증서 상태 카드**:
     - 상태: `warranties.status` (issued_unassigned, issued, active, suspended, revoked)
     - 활성화 일시: `warranties.activated_at`
     - 환불 일시: `warranties.revoked_at` (재판매 시에도 유지, 이력 보존)
     - **재판매 여부 표시**: `revoked_at IS NOT NULL AND status != 'revoked'` → "재판매됨" 배지
     - **정책 경고 배지**:
       - `active`: "양도 가능 / 환불 불가(정책)"
       - `issued`: "활성화 전 / 환불 가능"
       - `revoked`: "QR 접근 차단 대상"
   - **소유자 정보 카드**:
     - 현재 소유자: `warranties.owner_user_id` → `users.email`, `users.name`
     - 소유자 변경 이력: `warranty_events`에서 `event_type IN ('owner_change', 'ownership_transferred')` 조회
   - **연결 정보 카드** (단위 기준 체인 표시):
     - 연결 주문: `warranties.source_order_item_unit_id` → `order_item_units.order_item_id` → `order_items.order_id` → `orders.order_number`, `orders.order_id`
     - 연결 재고: `order_item_units.stock_unit_id` → `stock_units` (시리얼 넘버, ROT 코드, 보증서 하단 코드)
     - 인보이스 정보:
       - 원본 invoice: `invoices.type = 'invoice'` AND `invoices.order_id = orders.order_id`
       - Credit note 리스트: `invoices.type = 'credit_note'` AND `invoices.related_invoice_id = 원본_invoice_id`
       - 시간 필드: `invoices.issued_at` 사용
   - **보증서 이력 타임라인**:
     - `warranty_events` 테이블 조회 (최신순)
     - 이벤트 타입: `status_change`, `owner_change`, `ownership_transferred`, `suspend`, `unsuspend`, `revoke`
     - 변경 전/후 값, 변경자, 변경 사유, 변경 시각 표시
   - **QR 코드 다운로드 버튼**:
     - 기존 QR 코드 다운로드 API 활용 (`/api/admin/qrcode/download`)
     - **감사 로그**: 누가 언제 어떤 warranty의 QR을 다운로드했는지 기록 (권장)

**예상 작업 시간**: 8-10시간

**의존성**: Phase 2 완료 필수, 마이그레이션 081 완료 필수

**완료 조건**:
- 보증서 검색 화면 정상 동작 (SSOT 기준 검색 경로)
- 보증서 상세 화면 정상 표시 (모든 카드 포함)
- 소유자 변경 이력 정상 표시 (`owner_change`, `ownership_transferred` 모두 포함)
- 인보이스 정보 구분 표시 (원본 invoice / credit_note)
- 재판매 여부 표시
- QR 코드 다운로드 정상

---

### Phase 14: 프론트엔드 사용자 페이지 구현

**목적**: 사용자가 보증서 활성화, 양도, 조회 가능

**작업**:

#### 14-1. 보증서 활성화 페이지
**파일**: `my-warranties.html`, `my-warranties.js`

**작업**:
1. 보증서 목록 표시 (`status = 'issued'`인 보증서에 "활성화" 버튼)
2. 활성화 버튼 클릭 시 동의 문구 확인
3. 활성화 API 호출
4. 성공/실패 메시지 표시

**예상 작업 시간**: 4-5시간

**의존성**: Phase 5 완료 필수

**완료 조건**:
- 보증서 활성화 페이지 정상 동작
- 동의 체크 정상
- 에러 처리 정상

#### 14-2. 보증서 양도 페이지
**파일**: `my-warranties.html`, `my-warranties.js`

**작업**:
1. 보증서 상세에서 "양도하기" 버튼 (`status = 'active'`인 경우만)
2. 수령자 이메일 입력 모달
3. 양도 요청 API 호출
4. 양도 링크 이메일 발송 확인

**예상 작업 시간**: 3-4시간

**의존성**: Phase 8-1 완료 필수

**완료 조건**:
- 양도 요청 페이지 정상 동작
- 이메일 입력 정상

#### 14-3. 양도 수락 페이지
**파일**: `warranty-transfer-accept.html` (신규), `warranty-transfer-accept.js` (신규)

**작업**:
1. 양도 링크 접근 (토큰 검증)
2. 로그인 요구
3. 랜덤 7자 코드 입력
4. 양도 수락 API 호출
5. 성공 메시지 표시

**예상 작업 시간**: 4-5시간

**의존성**: Phase 8-2 완료 필수

**완료 조건**:
- 양도 수락 페이지 정상 동작
- 코드 입력 정상
- 에러 처리 정상

#### 14-4. 비회원 주문 조회 페이지
**파일**: `guest-order-detail.html` (신규), `guest-order-detail.js` (신규)

**작업**:
1. 인보이스 링크 접근 (토큰 검증)
2. Cookie 설정 및 Redirect
3. 주문 상세 정보 표시:
   - 인보이스 정보
   - 배송 상태
   - 주문 정보
   - 보증서 정보 (`issued_unassigned` 상태)
4. "내 계정에 연동하기" 버튼 (비회원인 경우)

**예상 작업 시간**: 5-6시간

**의존성**: Phase 10-1 완료 필수

**완료 조건**:
- 비회원 주문 조회 페이지 정상 동작
- 토큰 검증 정상
- Claim 버튼 정상

---

### Phase 15: 중기 개선 (product_options 테이블)

**목적**: 재고와 분리된 옵션 라인업 관리

**작업**:

#### 15-1. `product_options` 테이블 생성
**파일**: `backend/migrations/058_create_product_options_table.sql`

```sql
CREATE TABLE product_options (
    option_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id VARCHAR(50) NOT NULL COMMENT '상품 ID',
    color_code VARCHAR(50) NULL COMMENT '색상 코드 (color_standards 참조)',
    size VARCHAR(10) NULL COMMENT '사이즈 (S, M, L, XL, XXL, F)',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '활성 여부',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE CASCADE,
    FOREIGN KEY (color_code) REFERENCES color_standards(color_code) ON DELETE RESTRICT,
    INDEX idx_product_id (product_id),
    INDEX idx_color_code (color_code),
    INDEX idx_is_active (is_active),
    UNIQUE KEY uk_product_color_size (product_id, color_code, size)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**완료 조건**: 테이블 생성 완료

#### 15-2. 옵션 API 수정 (product_options 기반)
**파일**: `backend/product-routes.js`

**수정 내용**:
- `product_options` 테이블에서 옵션 라인업 조회
- `stock_units`에서 재고 상태만 조회
- 두 정보를 결합하여 응답

**예상 작업 시간**: 2-3시간

**의존성**: Phase 15-1 완료 필수

**완료 조건**:
- 옵션 API가 product_options 기반으로 동작
- 재고가 0인 상품도 옵션 표시

#### 15-3. 관리자 페이지 옵션 관리 기능
**파일**: `admin-qhf25za8/admin-products.js`, `backend/admin-routes.js`

**작업**:
1. **옵션 조회 API** (`GET /api/admin/products/:productId/options`)
   - `product_options` 테이블에서 해당 상품의 모든 옵션 조회
   - 재고 상태 포함 (각 옵션별 `in_stock` 수량)

2. **옵션 추가 API** (`POST /api/admin/products/:productId/options`)
   - 새로운 옵션 추가 (사이즈/색상 조합)
   - `sort_order` 자동 계산 또는 수동 설정
   - 중복 체크 (UNIQUE 제약)

3. **옵션 수정 API** (`PUT /api/admin/products/:productId/options/:optionId`)
   - `is_active` 토글
   - `sort_order` 수정

4. **옵션 삭제 API** (`DELETE /api/admin/products/:productId/options/:optionId`)
   - 옵션 삭제 (또는 `is_active = 0`으로 비활성화)

5. **관리자 페이지 UI** (`admin-qhf25za8/admin-products.js`)
   - 상품 상세 페이지에 "옵션 관리" 섹션 추가
   - 옵션 목록 표시 (사이즈, 색상, 재고 상태, 정렬 순서)
   - 옵션 추가/수정/삭제 UI

**예상 작업 시간**: 4-6시간

**의존성**: Phase 15-1, Phase 15-2 완료 필수

**완료 조건**:
- 관리자 페이지에서 옵션 조회/추가/수정/삭제 가능
- 재고 상태 확인 가능
- `sort_order` 수정 가능

---

### Phase 16: Product ID 구조 개선 (사이즈/색상 코드 제거)

**목적**: 근본적인 설계 개선 - product_id에서 사이즈/색상 코드 제거

**⚠️ 중요**: 
- 상세 계획은 `PRODUCT_ID_REFACTORING_PLAN.md` 참조
- **GPT 제안 반영**: PK 직접 UPDATE 위험 회피, 옵션 B (병행 운영) 방식 채택

**현재 문제점**:
1. **URL 라우팅 문제**: `PM-25-SH-Teneu-Solid-LB-S/M/L` 형식에 슬래시(`/`) 포함
   - ✅ **해결됨**: 옵션 API를 query 방식으로 변경 (완료)
2. **옵션 추출 의존성**: `extractSizesFromProductId()`, `extractColorFromProductId()` 함수로 product_id 파싱
   - ⚠️ **문제**: product_id 구조 변경 시 파싱 로직 실패 가능
3. **유연성 부족**: 사이즈/색상이 product_id에 하드코딩되어 있어 옵션 추가/변경 시 product_id 변경 필요
4. **SSOT 원칙 위배**: 사이즈/색상 정보가 `stock_units`와 `admin_products.id`에 중복 저장

**목표 구조**:
```
현재: PM-25-SH-Teneu-Solid-LB-S/M/L
Phase 1: PM-25-SH-Teneu-Solid-LB  (사이즈 제거)
Phase 2: PM-25-SH-Teneu-Solid  (색상도 제거, product_options 활용)
```

**작업**:

#### 16-1. 신규 상품 규칙 적용 (즉시 시작 가능)
**파일**: `PRODUCT_ID_STANDARD.md` (신규), `admin-qhf25za8/admin-products.js`

**작업**:
1. 새 product_id 규칙 정의 문서화
2. 관리자 페이지에 규칙 안내 추가
3. 상품 추가 시 유효성 검증 (슬래시 포함 시 경고)
4. 신규 상품부터 사이즈 제거된 ID 사용

**예상 작업 시간**: 2-3시간

**의존성**: 없음

**완료 조건**:
- 신규 상품 추가 시 사이즈 제거된 ID 사용
- 규칙 문서화 완료

#### 16-2. 기존 상품 마이그레이션 준비
**파일**: `backend/scripts/analyze_product_ids.sql`, `backend/migrations/062_migrate_product_id_remove_sizes.sql`

**작업**:
1. 기존 product_id 패턴 분석
2. 참조 무결성 확인 (`stock_units`, `order_items`, `token_master`)
3. 마이그레이션 스크립트 작성
4. 테스트 환경에서 마이그레이션 테스트
5. 롤백 계획 수립

**예상 작업 시간**: 4-6시간

**의존성**: Phase 16-1 완료 권장

**완료 조건**:
- 기존 데이터 분석 완료
- 마이그레이션 스크립트 작성 완료
- 테스트 환경 검증 완료

#### 16-3. 기존 상품 마이그레이션 실행 (신중하게)
**파일**: `backend/migrations/062_migrate_product_id_remove_sizes.sql`

**⚠️ 중요**: 운영 환경에서 실행 전 충분한 테스트 필요

**작업 순서**:
1. **백업**: 전체 데이터베이스 백업 필수
2. **매핑 테이블 생성**: `product_id_mapping` 테이블 생성
3. **중복 확인**: 새 ID 중복 확인 및 해결
4. **단계별 마이그레이션**:
   - `admin_products` 테이블 업데이트
   - `stock_units` 테이블 업데이트
   - `order_items` 테이블 업데이트
   - `token_master` 테이블 업데이트
5. **참조 무결성 확인**: 각 단계별 확인
6. **코드 수정**: `extractSizesFromProductId()`, `extractColorFromProductId()` 함수 제거

**예상 작업 시간**: 6-8시간 (백업 + 마이그레이션 + 검증)

**의존성**: Phase 16-2 완료 필수

**완료 조건**:
- 모든 테이블 product_id 업데이트 완료
- 참조 무결성 확인 완료
- 파싱 로직 제거 완료

#### 16-4. 색상 코드 제거 (선택적, Phase 15 완료 후)
**목적**: product_id에서 색상 코드도 제거, `product_options` 테이블 활용

**작업**:
1. `product_options` 테이블 생성 (Phase 15 참조)
2. 색상 코드 제거 마이그레이션 (Phase 16-3와 동일한 방식)

**예상 작업 시간**: 4-6시간

**의존성**: Phase 16-3 완료 필수, Phase 15 완료 필수

**완료 조건**:
- product_id에서 색상 코드 제거 완료
- product_options 테이블 기반 옵션 관리 완료

**⚠️ 리스크 관리**:
- **데이터 손실**: 모든 단계 전 백업 필수
- **중복 ID**: 마이그레이션 전 중복 확인 필수
- **참조 무결성**: 각 단계별 확인 필수
- **코드 호환성**: 파싱 로직 제거 전 대체 로직 구현

**상세 계획**: `PRODUCT_ID_REFACTORING_PLAN.md` 참조

---

## 📅 실행 순서 및 의존성 그래프 (2026-01-16 업데이트)

### 🔴 즉시 실행 필요 (심각한 위반 수정)
1. **Phase -1**: `orders.status` 직접 업데이트 제거 (1-2시간)
   - `backend/payments-routes.js` 수정
   - `backend/index.js` 수정 (API 제거 또는 집계 함수로 변경)

### ✅ 완료된 작업
2. **Phase 0**: 옵션 API 개선 (완료)
3. **Phase 1**: 색상 데이터 소스 개선 (완료)
4. **Phase 11**: `orders.status` 집계 함수 (완료)
5. **Phase 15-1**: `product_options` 테이블 생성 (완료)
6. **Phase 15-2**: 옵션 API 수정 (완료)
7. **DB 마이그레이션**: `orders.status` 체크 제약 수정 (079_fix_orders_status_check_constraint.sql 완료)

### Phase 2 완료 후 가능
8. **Phase 3**: processPaidOrder() 업데이트 (warranties 컬럼 반영)
9. **Phase 5**: 보증서 활성화 API (🔴 높은 우선순위)
10. **Phase 7**: QR 스캔 로직 수정
11. **Phase 12**: 관리자 페이지 개선

### Phase 2 + Phase 3 완료 후 가능
12. **Phase 4**: 선예약형 재고 관리 (선택적, 현재 방식도 동작)

### Phase 2 + Phase 5 완료 후 가능
13. **Phase 6**: Claim API (🔴 높은 우선순위)
14. **Phase 8**: 양도 시스템 (🟡 중간 우선순위)
15. **Phase 9**: 환불 처리 API (🟡 중간 우선순위)

### Phase 2 + Phase 6 완료 후 가능
16. **Phase 10**: 비회원 주문 조회 API (완료)
17. **Phase 14**: 프론트엔드 사용자 페이지

### Phase 2 + Phase 12 완료 후 가능
18. **Phase 12**: 배송/송장 관리 API

### 중기 개선 (선택적)
19. **Phase 15-3**: 관리자 페이지 옵션 관리 기능

### 장기 리팩토링 (선택적)
20. **Phase 16**: product_id 슬래시 제거

---

## 🔄 전체 흐름 검증 체크리스트

### QR 코드 흐름
- [x] Paid 처리 시 warranties 생성 (`status = 'issued'` 또는 `'issued_unassigned'`) - Phase 3 완료
- [x] QR 스캔 시 warranty 조회만 수행 (생성 제거) - Phase 7 완료
- [x] QR 스캔 시 revoked 상태 보증서 접근 거부 - Phase 7 완료
- [x] 관리자 페이지에서 QR 코드 다운로드 가능 - Phase 0 완료

### 디지털 보증서 흐름
- [x] 보증서 활성화 API 정상 동작 (인보이스 연동 확인 포함) - Phase 5 완료
- [x] 활성화된 보증서만 양도 가능 - Phase 8 완료
- [x] 양도 시 소유자만 변경, 상태는 active 유지 - Phase 8 완료
- [x] 환불 시 warranties.status → revoked 전이 - Phase 9 완료
- [ ] 재판매 시 기존 revoked warranties 업데이트
- [ ] 관리자 페이지에서 보증서 상세 조회 가능

### 인보이스 흐름
- [ ] Paid 처리 시 인보이스 생성
- [ ] 인보이스 이메일 발송 (회원/비회원 구분)
- [ ] 비회원 주문 조회 시 인보이스 정보 표시
- [ ] Claim 시 인보이스 연동 확인
- [ ] 관리자 페이지에서 인보이스 정보 표시

---

## ⚠️ 주의사항 및 리스크 관리

### 1. 데이터 마이그레이션 리스크
- **리스크**: 기존 데이터 손실
- **대응**: 모든 마이그레이션 전 백업 필수
- **검증**: 마이그레이션 후 데이터 정합성 확인
- **특별 주의**: `token_pk` 마이그레이션은 PK 교체이므로 옵션 A(테이블 재생성 스왑) 권장

### 2. 동시성 문제
- **리스크**: 재고 경합, 이중 판매
- **대응**: 
  - `FOR UPDATE SKIP LOCKED` 사용 (MySQL 8.0+)
  - **락 순서 고정**: `stock_units`(물리) → `orders`(결제) → `warranties`(권리) → `invoices`(문서)
  - `order_item_units.active_lock` 패턴으로 이중 판매 방지
- **검증**: 동시성 테스트 필수

### 3. 상태 전이 오류
- **리스크**: 잘못된 상태 전이
- **대응**: 
  - 원자적 조건 검증 (`affectedRows=1`), 상태 전이표 준수
  - **DB 레벨 제약**: ENUM 또는 CHECK 제약으로 정의되지 않은 상태값 차단
  - **애플리케이션 가드**: `owner_user_id` 조건부 NOT NULL 규칙 강제
- **검증**: 각 상태 전이 API 테스트

### 4. 멱등성 문제
- **리스크**: 중복 처리, 재시도/중복 웹훅
- **대응**: 
  - UNIQUE 제약 (`paid_events`, `order_idempotency`, `warranties.active_key` 등)
  - 멱등성 체크 (각 단계별)
  - **멱등성 계층표 준수** (FINAL_EXECUTION_SPEC_REVIEW.md 2067-2173줄 참조)
- **검증**: 재시도 테스트, 중복 웹훅 테스트

### 5. 재고 해제 규칙 (SSOT 원칙 준수)
- **리스크**: `orders.status`로 판정하면 SSOT 원칙 위배
- **대응**: 
  - **반드시 `paid_events` 존재 여부 또는 `paid_at` 기준으로 판정**
  - `orders.status` 사용 금지 (집계 결과일 뿐)
- **검증**: 배치 작업 테스트

### 6. 재판매 시 동시성 문제
- **리스크**: 동시에 두 주문이 같은 재고를 잡는 경우
- **대응**: 
  - 재판매 로직은 반드시 `stock_units 락 → order_item_units 생성 → warranties 업데이트`가 하나의 트랜잭션
  - `revoked` → `issued` 전이는 **새로운 `paid_events`가 생성된 경우만 허용**
  - 관리자 수동 변경 금지
- **검증**: 재판매 동시성 테스트

### 7. warranty_events 감사 로그 증거성
- **리스크**: 상태 전이와 로그가 분리되면 증거가 끊김
- **대응**: 
  - **Outbox 패턴**: 트랜잭션 내 최소 이벤트 기록 필수
  - **이벤트 INSERT 실패 시 전이도 롤백** (증거성 보장)
  - 상세 로그/외부 전송은 비동기로 확장
- **검증**: 이벤트 로깅 테스트

### 8. orders.status 집계 복잡성
- **리스크**: 부분배송 시 집계 로직 복잡
- **대응**: 
  - 애플리케이션 레벨 집계 함수 구현
  - `partial_shipped`, `partial_delivered` 상태 지원
  - 관리자 수동 수정 금지
- **검증**: 집계 함수 테스트

---

## 📊 orders.status 집계 규칙 표

**⚠️ 중요**: `orders.status`는 집계 결과(뷰/표시용)이며, 직접 정책 판단 기준으로 사용하지 않습니다.

| 집계 상태 | 조건 | 비고 |
|----------|------|------|
| `pending` | `paid_events` 없음 (또는 `paid_at` NULL) | 결제 전 |
| `paid` | `paid_events` 존재 (또는 `paid_at` NOT NULL) AND `unit`이 1개 이상 `reserved` 이상 존재 | 결제 완료 |
| `partial_shipped` | 일부 `unit` `shipped` 이상, 일부는 `reserved` | 부분 배송 (확정) |
| `shipped` | 모든 `unit` `shipped` 이상 | 전체 배송 |
| `partial_delivered` | 일부 `delivered` 이상, 일부 `shipped` | 부분 배송 완료 (확정) |
| `delivered` | 모든 `unit` `delivered` 이상 | 전체 배송 완료 |
| `refunded` | 모든 `unit`이 환불 최종 상태 도달 | 환불 완료 |

**규칙 고정 문장**:
- `orders.status`는 계산 결과다 (집계 함수로만 갱신)
- 판정에 사용 금지 (환불/양도/제재 판단은 `warranties.status`)
- 관리자 수동 수정 금지
- `partial_*` 사용 확정 (선택이 아님)
- **결제 SSOT 고정**: `paid_events` 존재가 SSOT이며, `paid_at`은 캐시/파생 필드

## 📋 상태 전이표 (warranties.status)

**⚠️ 운영 정책 고정**: 아래 전이표는 "누가 어떤 상태에서 뭘 눌러도 되는지"를 한 눈에 보여주는 단일 진실(SSOT)입니다.

| 현재 상태 | 전이 가능 상태 | 전이 API/조건 | 비고 |
|----------|--------------|------------|------|
| `issued_unassigned` | `issued` | `claim` | 계정 연동만 |
| | `revoked` | `admin refund` | 환불 승인 (관리자 수동) |
| `issued` | `active` | `activate` | 활성화 (동의 필수, 인보이스 연동 확인) |
| | `revoked` | `admin refund` | 환불 승인 (관리자 수동) |
| | `suspended` | `admin suspend` | 제재 |
| `active` | `revoked` | `admin refund` | 환불 승인 (관리자 수동) |
| | `suspended` | `admin suspend` | 제재 |
| | `active` (유지) | `transfer` | 양도 완료 (소유자만 변경, 상태는 `active` 유지, `ownership_transferred` 이벤트) |
| `revoked` | `issued` / `issued_unassigned` | `paid (재판매)` | ⚠️ **paid_events 생성된 경우만 허용, 관리자 수동 변경 금지, affectedRows=1 검증 필수** |
| `suspended` | `issued` | `admin resume` | 제재 해제 (활성화는 별도 절차) |

**전이 불가능한 상태**:
- `revoked` → `active` (직접 전이 불가, 재판매 후 활성화 필요)
- `revoked` → `suspended` (의미 없음)
- `active` → `issued` (되돌리기 불가)
- `issued` → `issued_unassigned` (되돌리기 불가)

**모든 상태 변경 UPDATE는 다음 원칙을 따라야 함**:
```sql
-- ✅ 올바른 패턴
UPDATE warranties 
SET status = ?, ...
WHERE warranty_id = ? AND status IN (?, ?, ...)  -- 현재 상태 조건 포함
-- affectedRows=1 검증 필수
```

## 🔄 멱등성 계층표 (재시도/중복 웹훅 대응)

**문제**: 운영에서 제일 자주 터지는 게 "재시도"다. 각 단계가 중복 호출돼도 결과가 1번만 반영되어야 함

| 단계 | 멱등성 메커니즘 | 검증 방법 | 실패 시 처리 |
|------|---------------|----------|------------|
| **주문 Paid 처리** | `paid_events` UNIQUE(`order_id`, `payment_key`) | INSERT 시 중복 체크, 이미 있으면 즉시 종료 | 이미 처리됨 응답 반환 |
| **재고 배정** | `stock_units.status` 기반 + `FOR UPDATE SKIP LOCKED` | `status = 'in_stock'`인 것만 선택, 락으로 동시성 제어 | 재고 부족 에러 |
| **unit 생성** | `order_item_units`에 UNIQUE(`order_item_id`, `unit_seq`) 또는 `stock_unit_id` UNIQUE | INSERT 시 중복 체크 | 중복 에러 (이미 생성됨) |
| **보증서 revive** | `UPDATE ... WHERE status='revoked'` + `affectedRows=1` | 조건부 UPDATE, affectedRows 검증 | affectedRows !== 1이면 실패 |
| **양도 수락** | `UPDATE transfers WHERE status='requested' ...` + `affectedRows=1` | 조건부 UPDATE, affectedRows 검증 | affectedRows !== 1이면 실패 |
| **보증서 활성화** | `UPDATE ... WHERE status='issued'` + `affectedRows=1` | 조건부 UPDATE, affectedRows 검증 | affectedRows !== 1이면 실패 |
| **환불 처리** | `UPDATE ... WHERE status IN ('issued', 'issued_unassigned')` + `affectedRows=1` | 조건부 UPDATE, affectedRows 검증 | affectedRows !== 1이면 실패 |

**핵심 원칙**: **"각 단계가 중복 호출돼도 결과가 1번만 반영"되는 계층을 문서에 박아두는 것**

## 📝 다음 단계 (2026-01-16 업데이트)

### ✅ 완료된 작업
1. **Phase -1**: `orders.status` 직접 업데이트 제거 (완료)
2. **Phase 2**: 핵심 인프라 테이블 생성 (완료)
3. **Phase 5**: 보증서 활성화 API (완료)
4. **Phase 6**: Claim API (완료)
5. **Phase 7**: QR 스캔 로직 수정 (완료)
   - warranty 생성 제거, 조회만 수행
   - revoked 상태 보증서 접근 거부
6. **Phase 8**: 양도 시스템 (완료)
   - Phase 8-1: 양도 요청 API
   - Phase 8-2: 양도 수락 API
   - Phase 8-3: 양도 만료 배치 작업
   - 원자적 조건 검증
   - warranty_events 이벤트 기록
7. **Phase 9**: 환불 처리 API (완료)
   - warranties.status만 본다 (SSOT)
   - credit_note 생성
   - warranty_events 이벤트 기록

### ✅ 완료된 작업 (계속)
8. **Phase 8-3**: 양도 만료 배치 작업 (완료)
   - 72시간 초과 양도 요청 자동 만료
   - 1시간마다 자동 실행
9. **Phase 12**: 배송/송장 관리 API (완료)
   - Phase 12-1: 송장 생성 API (shipments/shipment_units 사용)
   - Phase 12-2: 배송 완료 처리 API
   - 기존 `/shipped` API 수정 완료 (SSOT 원칙 준수)
   - orders.status 집계 함수 자동 호출
10. **Phase 10**: 비회원 주문 조회 API (완료)
   - guest_order_sessions 테이블 생성 (옵션 B: 세션 토큰 교환)
   - 세션 발급 엔드포인트 (`GET /api/guest/orders/session`)
   - 주문 조회 엔드포인트 (`GET /api/guest/orders/:orderNumber`)
   - order_number 기반 조회 (일관성 유지)
   - 배송지 정보 포함 응답 (원래 계획대로)

### 🔴 높은 우선순위 (핵심 기능 미구현)

### 🟡 중간 우선순위 (운영 기능)

**이 문서만 보면 앞으로의 모든 구현이 가능합니다.**

---

## 🔑 핵심 정리

### 1. SSOT 원칙
- **`orders.status`**: 집계 결과(뷰/표시용), 판정에 사용 금지
- **`order_item_units.unit_status`**: 물류 단위 상태의 SSOT
- **`stock_units.status`**: 실물 재고 상태의 SSOT (`in_stock`이 재판매 가능 여부의 최종 게이트)
- **`warranties.status`**: 권리/정책 상태의 SSOT (환불/양도/활성화 판정 기준)
- **`invoices`**: 문서(스냅샷), 증빙/조회 역할, 판정에 사용 금지

### 2. 락 순서 (필수)
**전역 락 순서**: `stock_units`(물리) → `orders`(결제) → `warranties`(권리) → `invoices`(문서)

### 3. 멱등성 보장
- `paid_events`: UNIQUE(`order_id`, `payment_key`)
- `order_item_units`: UNIQUE(`stock_unit_id`, `active_lock`)
- `warranties`: UNIQUE(`token_pk`) 또는 `active_key` 패턴
- 모든 상태 전이: `UPDATE ... WHERE 조건` + `affectedRows=1` 검증

### 4. 재판매 정책
- **같은 token 사용**: 토큰 재발급 없음
- **기존 warranties 업데이트**: 새로운 레코드 생성하지 않음
- **revoked → issued 전이**: `paid_events` 생성된 경우만 허용, 관리자 수동 변경 금지
- **revoked_at 유지**: 재판매 시에도 `revoked_at`은 그대로 유지 (A안 확정, 이력)

### 5. 환불 정책
- **고객 직접 요청 불가**: 문의 시스템으로만 접수
- **관리자 수동 처리**: 시리얼 넘버와 토큰 확인 후 환불 처리
- **판정 기준**: `warranties.status`만 본다 (SSOT)
- **토큰 재발급 없음**: 실물 보증서에 이미 QR 인쇄되어 있음

### 6. 활성화 정책
- **첫 활성화 시 인보이스 연동 확인**: 핵심 방어 메커니즘 (환불 후 QR 코드 악용 방지)
- **양도 시 인보이스 연동 확인 불필요**: `active` 상태 유지, 소유자만 변경

### 7. 양도 정책
- **활성화된 보증서만 양도 가능**: `status = 'active'`
- **소유자만 변경**: `status = 'active'` 유지
- **원자적 조건 검증**: `affectedRows=1` 검증 필수
- **1토큰 = 1소유자**: 양도 후 원래 소유자는 접근 불가

---

**문서 버전**: 2.2  
**작성일**: 2026-01-11  
**최종 수정일**: 2026-01-16  
**기준 문서**: `SYSTEM_FLOW_DETAILED.md`, `FINAL_EXECUTION_SPEC_REVIEW.md`, `ADMIN_QR_WARRANTY_INVOICE_CONSISTENCY_CHECK.md`, `IMPLEMENTATION_DESIGN_COMPARISON.md`

**주요 변경사항 (v2.2)**:
- Phase -1 완료: `orders.status` 직접 업데이트 제거
- Phase 5 완료: 보증서 활성화 API 구현
- Phase 6 완료: Claim API 구현 (claim token 유효 시간 30분으로 변경)
- Phase 7 완료: QR 스캔 로직 수정 (warranty 생성 제거, 조회만 수행)
- Phase 8 완료: 양도 시스템 구현 (양도 요청/수락 API, 만료 배치 작업)
- Phase 9 완료: 환불 처리 API 구현 (관리자 전용, credit_note 생성 포함)
- Phase 12 완료: 배송/송장 관리 API 구현 (shipments/shipment_units 사용)
- 현재 구현 상태 섹션 업데이트

**주요 변경사항 (v2.1)**:
- Phase -1 추가: `orders.status` 직접 업데이트 제거 (즉시 수정 필요)
- 완료된 작업 반영: Phase 0, 1, 11, 15-1, 15-2, DB 마이그레이션
- 우선순위 재정립: 심각한 위반 → 높은 우선순위 → 중간 우선순위
- 실행 순서 업데이트: 의존성 그래프 재구성
