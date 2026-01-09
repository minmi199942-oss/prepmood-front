# 구현 준비 분석 보고서 (최종 업데이트)

## 📋 목차
1. [현재 구조 확인](#1-현재-구조-확인)
2. [필요한 변경 사항](#2-필요한-변경-사항)
3. [테이블 구조 비교](#3-테이블-구조-비교)
4. [우선순위 및 실행 계획](#4-우선순위-및-실행-계획)
5. [MAJOR_CHANGES_CHECKLIST.md와의 연계](#5-major_changes_checklistmd와의-연계)
6. [최근 변경사항 반영](#6-최근-변경사항-반영)
7. [코드베이스 충돌 분석](#7-코드베이스-충돌-분석)
8. [보안 취약점 분석](#8-보안-취약점-분석)
9. [환경 설정 확인](#9-환경-설정-확인)

---

## 1. 현재 구조 확인

### 1-1. 현재 존재하는 테이블

#### ✅ `orders` 테이블
```sql
-- 현재 구조 (backend/migrations/2025-10-28_fix_orders_constraints.sql 확인)
order_id (PK, INT AUTO_INCREMENT)
user_id (FK, INT) -- ⚠️ NULL 허용 여부 확인 필요 (마이그레이션 파일에 명시 없음)
order_number (UNIQUE, VARCHAR(32))
status (VARCHAR(50)) -- pending/confirmed/processing/shipped/delivered/cancelled/refunded
total_price (DECIMAL(10,2))
shipping_first_name, shipping_last_name
shipping_email, shipping_phone
shipping_address, shipping_city, shipping_postal_code, shipping_country
shipping_method, shipping_cost
estimated_delivery
created_at, updated_at
-- ❌ guest_id 컬럼 없음
-- ❌ paid_at 컬럼 없음 (캐시 필드)
```

#### ✅ `order_items` 테이블
```sql
-- 현재 구조
order_item_id (PK, INT AUTO_INCREMENT)
order_id (FK, INT)
product_id (VARCHAR(50))
product_name, product_image
size, color
quantity (INT) -- ⚠️ 표시용/계산용으로 유지
unit_price, subtotal
created_at
-- ❌ stock_unit_id 없음 (order_item_units로 분리 예정)
```

#### ✅ `warranties` 테이블
```sql
-- 현재 구조 (backend/migrations/001_create_warranties_table.sql)
id (PK, INT AUTO_INCREMENT)
user_id (FK, INT NOT NULL) -- ⚠️ 비회원 불가
token (UNIQUE, VARCHAR(20)) -- ⚠️ token_id가 아님
public_id (UNIQUE, CHAR(36)) -- UUID (003_add_public_id_and_product_name.sql)
product_name (VARCHAR(255)) -- (003_add_public_id_and_product_name.sql)
verified_at (DATETIME)
created_at (DATETIME)
-- ❌ status 컬럼 없음
-- ❌ owner_user_id 없음
-- ❌ source_order_item_unit_id 없음
-- ❌ activated_at, revoked_at 없음
```

#### ✅ `token_master` 테이블
```sql
-- 현재 구조 (backend/migrations/005_create_token_master_table.sql)
token (PK, VARCHAR(20)) -- ⚠️ id가 아님
internal_code (VARCHAR(100))
product_name (VARCHAR(255))
is_blocked (TINYINT(1))
owner_user_id (INT NULL) -- ⚠️ 레거시, 사용 금지
owner_warranty_public_id (CHAR(36) NULL) -- ⚠️ 레거시, 사용 금지
scan_count (INT)
first_scanned_at, last_scanned_at (DATETIME)
created_at, updated_at (DATETIME)
-- ❌ token_pk (PK autoinc) 없음
-- ❌ status 컬럼 없음
-- ❌ stock_unit_id 없음 (단방향 원칙)
```

#### ✅ `orders_idempotency` 테이블
```sql
-- 현재 구조 (backend/migrations/2025-10-29_add_orders_idempotency.sql)
id (PK, BIGINT AUTO_INCREMENT)
user_id (INT NOT NULL) -- ⚠️ 비회원 불가
idem_key (VARCHAR(64))
order_number (VARCHAR(32))
created_at (DATETIME)
UNIQUE(user_id, idem_key)
-- ❌ guest_id 컬럼 없음
-- ❌ owner_key 방식 없음
```

#### ✅ `inquiries` 테이블
```sql
-- 현재 구조 (backend/migrations/010_create_inquiries_tables.sql)
id (PK, BIGINT AUTO_INCREMENT)
user_id (INT NULL) -- ✅ NULL 허용 (비회원 지원 가능)
inquiry_number (VARCHAR(20) UNIQUE)
-- ... 기타 컬럼
-- ✅ 비회원 문의 지원 가능
```

### 1-2. 현재 존재하지 않는 테이블 (신규 생성 필요)

1. ❌ `order_item_units` - 실물 단위 추적 (핵심)
2. ❌ `stock_units` - 재고 단위 관리 (핵심)
3. ❌ `paid_events` - paid 처리 멱등성 (핵심)
4. ❌ `invoices` - 디지털 인보이스
5. ❌ `shipments` - 배송 관리
6. ❌ `shipment_units` - 배송-실물 매핑
7. ❌ `guest_order_access_tokens` - 비회원 주문 조회 토큰
8. ❌ `claim_tokens` - 계정 연동 토큰
9. ❌ `warranty_transfers` - 보증서 양도
10. ❌ `warranty_events` - 보증서 이벤트 로그

---

## 2. 필요한 변경 사항

### 2-1. MAJOR_CHANGES_CHECKLIST.md의 변경 사항

#### ✅ 1. 비회원 구매 가능 (로그인 필수 제거)
**필요한 변경**:
- `orders.user_id` NULL 허용 확인 및 변경
- `orders.guest_id` 컬럼 추가
- `orders_idempotency.user_id` NULL 허용
- `orders_idempotency` 테이블에 `owner_key` 방식 또는 `guest_id` 추가

#### ✅ 2. 회원가입 한 페이지 통합
**필요한 변경**:
- UI/UX만 변경, DB 변경 없음

#### ✅ 3. 비회원 주문 가능 + 이메일 수집 동의
**필요한 변경**:
- `orders.shipping_email` 필수 검증 (이미 존재)
- 이메일 수집 동의 여부 저장 (필요 시 `orders.email_consent` 컬럼 추가)

#### ✅ 4. checkout.html 이름 필드 통합
**필요한 변경**:
- 옵션 A: `orders.shipping_name` 단일 컬럼으로 변경 (DB 마이그레이션 필요)
- 옵션 B: 백엔드에서 `name` 필드를 받아서 `shipping_first_name`, `shipping_last_name`으로 분리 저장 (DB 변경 없음)

### 2-2. FINAL_EXECUTION_SPEC_REVIEW.md의 변경 사항

#### ✅ 1. SSOT 3중 분리 원칙
**필요한 변경**:
- `order_item_units` 테이블 생성 (실물 SSOT)
- `warranties.status` 컬럼 추가 (권리 SSOT)
- `orders.status`는 집계 함수로만 갱신 (기존 로직 수정)

#### ✅ 2. Paid 처리 시 warranty 생성
**필요한 변경**:
- `paid_events` 테이블 생성 (멱등성)
- `stock_units` 테이블 생성 (재고 배정)
- `order_item_units` 테이블 생성 (실물 단위)
- Paid 처리 트랜잭션 로직 구현

#### ✅ 3. Claim과 Active 분리
**필요한 변경**:
- `warranties.status` 컬럼 추가 (`issued_unassigned`, `issued`, `active`, `revoked`, `suspended`)
- `warranties.owner_user_id` 컬럼 추가 (NULL 허용)
- `claim_tokens` 테이블 생성
- `guest_order_access_tokens` 테이블 생성

#### ✅ 4. 인보이스 시스템
**필요한 변경**:
- `invoices` 테이블 생성
- 이메일 발송 로직 구현 (MailerSend 등)

#### ✅ 5. 배송 시스템
**필요한 변경**:
- `shipments` 테이블 생성
- `shipment_units` 테이블 생성
- `order_item_units.current_shipment_id` 컬럼 추가

#### ✅ 6. 양도 시스템
**필요한 변경**:
- `warranty_transfers` 테이블 생성

#### ✅ 7. 이벤트 로그
**필요한 변경**:
- `warranty_events` 테이블 생성

---

## 3. 테이블 구조 비교

### 3-1. 기존 테이블 수정 필요 사항

#### `users` 테이블
| 컬럼 | 현재 상태 | 필요한 변경 | 우선순위 |
|------|----------|------------|---------|
| `user_id` | INT AUTO_INCREMENT (PK) | VARCHAR(20), 형식: `PM.{년도}.{랜덤6자}` | 🔴 최우선 |
| `last_name` | VARCHAR(50) | 제거 (name으로 통합) | 🔴 높음 |
| `first_name` | VARCHAR(50) | 제거 (name으로 통합) | 🔴 높음 |
| `name` | 없음 | 추가 필요, VARCHAR(100) NOT NULL | 🔴 높음 |
| `birth` | DATE | 제거 | 🟡 중간 |
| `phone` | VARCHAR(30) NULL | NOT NULL로 변경 (필수) | 🔴 높음 |
| `privacy_consent` | 없음 | 추가 필요, TINYINT(1) NOT NULL DEFAULT 0 | 🔴 높음 |
| `marketing_consent` | 없음 | 추가 필요, TINYINT(1) NOT NULL DEFAULT 0 | 🔴 높음 |
| `terms_consent` | 없음 | 추가 필요, TINYINT(1) NOT NULL DEFAULT 0 | 🔴 높음 |
| `privacy_policy_consent` | 없음 | 추가 필요, TINYINT(1) NOT NULL DEFAULT 0 | 🔴 높음 |

#### `orders` 테이블
| 컬럼 | 현재 상태 | 필요한 변경 | 우선순위 |
|------|----------|------------|---------|
| `user_id` | INT (NULL 허용 여부 확인 필요) | VARCHAR(20), NULL 허용 | 🔴 최우선 (users 변경 후) |
| `guest_id` | 없음 | 추가 필요, 형식: `G-{YYYYMMDD}-{랜덤6자}` | 🔴 높음 |
| `paid_at` | 없음 (확인 필요) | 추가 필요 (캐시 필드) | 🟡 중간 |
| `shipping_name` | 없음 | 옵션 A 선택 시 추가 | 🟢 낮음 |

#### `warranties` 테이블
| 컬럼 | 현재 상태 | 필요한 변경 | 우선순위 |
|------|----------|------------|---------|
| `id` | PK INT AUTO_INCREMENT | `warranty_id`로 변경 (선택) | 🟢 낮음 |
| `user_id` | INT NOT NULL | `owner_user_id`로 변경, NULL 허용 | 🔴 높음 |
| `token` | VARCHAR(20) UNIQUE | `token_pk` (FK)로 변경 | 🔴 높음 |
| `status` | 없음 | 추가 필요 (`issued_unassigned`, `issued`, `active`, `revoked`, `suspended`) | 🔴 높음 |
| `source_order_item_unit_id` | 없음 | 추가 필요 (FK to order_item_units) | 🔴 높음 |
| `activated_at` | 없음 | 추가 필요 | 🟡 중간 |
| `revoked_at` | 없음 | 추가 필요 | 🟡 중간 |
| `issued_at` | 없음 | 추가 필요 (또는 `created_at` 활용) | 🟢 낮음 |

#### `token_master` 테이블
| 컬럼 | 현재 상태 | 필요한 변경 | 우선순위 |
|------|----------|------------|---------|
| `token` | PK VARCHAR(20) | UNIQUE로 변경, `token_pk` (PK autoinc) 추가 | 🔴 높음 |
| `owner_user_id` | INT NULL | 레거시로 유지, 사용 금지 | 🟢 낮음 |
| `owner_warranty_public_id` | CHAR(36) NULL | 레거시로 유지, 사용 금지 | 🟢 낮음 |

#### `orders_idempotency` 테이블
| 컬럼 | 현재 상태 | 필요한 변경 | 우선순위 |
|------|----------|------------|---------|
| `user_id` | INT NOT NULL | NULL 허용 또는 `owner_key` 방식 | 🔴 높음 |
| `guest_id` | 없음 | 추가 필요 (또는 `owner_key` 방식) | 🔴 높음 |
| `owner_key` | 없음 | 추가 필요 (`u:{user_id}` 또는 `g:{guest_id}`) | 🔴 높음 |

### 3-2. 신규 테이블 생성 필요 사항

#### 🔴 높은 우선순위 (핵심 기능)

1. **`order_item_units`** - 실물 단위 추적
   - 목적: quantity > 1인 경우 실물별 추적
   - 필수 컬럼: `order_item_unit_id`, `order_item_id`, `unit_seq`, `stock_unit_id`, `token_pk`, `unit_status`, `current_shipment_id`

2. **`stock_units`** - 재고 단위 관리
   - 목적: 재고 배정 및 시리얼/바코드 관리
   - 필수 컬럼: `stock_unit_id`, `product_id`, `token_pk`, `status`, `reserved_at`, `reserved_by_order_id`

3. **`paid_events`** - paid 처리 멱등성
   - 목적: 중복 paid 처리 방지
   - 필수 컬럼: `order_id`, `payment_key`, `event_source`, `created_at`
   - 제약: `UNIQUE(order_id, payment_key)` 또는 `idempotency_key` 기반

4. **`invoices`** - 디지털 인보이스
   - 목적: 인보이스 생성 및 이메일 발송
   - 필수 컬럼: `invoice_id`, `order_id`, `type`, `status`, `issued_at`, `emailed_at`

5. **`guest_order_access_tokens`** - 비회원 주문 조회 토큰
   - 목적: 비회원 주문 조회 (read-only)
   - 필수 컬럼: `token_id`, `order_id`, `token_hash`, `expires_at`, `revoked_at`

6. **`claim_tokens`** - 계정 연동 토큰
   - 목적: 비회원 → 회원 전환
   - 필수 컬럼: `token_id`, `order_id`, `token_hash`, `expires_at`, `used_at`

#### 🟡 중간 우선순위 (배송/양도)

7. **`shipments`** - 배송 관리
   - 목적: 송장 정보 관리
   - 필수 컬럼: `shipment_id`, `order_id`, `carrier_code`, `tracking_number`, `active_key` (generated), `voided_at`, `void_reason`

8. **`shipment_units`** - 배송-실물 매핑
   - 목적: 송장과 실물 매핑
   - 필수 컬럼: `shipment_id`, `order_item_unit_id`
   - 제약: `PRIMARY KEY (shipment_id, order_item_unit_id)` (이력 허용)

9. **`warranty_transfers`** - 보증서 양도
   - 목적: 보증서 양도 관리
   - 필수 컬럼: `transfer_id`, `warranty_id`, `from_user_id`, `to_user_id`, `to_email`, `transfer_code_hash`, `status`, `expires_at`

#### 🟢 낮은 우선순위 (로깅/감사)

10. **`warranty_events`** - 보증서 이벤트 로그
    - 목적: 보증서 상태 변경 이력
    - 필수 컬럼: `event_id`, `event_type`, `target_type`, `target_id`, `actor_type`, `actor_id`, `metadata`, `created_at`

---

## 4. 우선순위 및 실행 계획

### Phase 0: users 테이블 변경 (최우선) ⚠️

#### 0-1. users.user_id 형식 변경 (필수)
**작업 내용**:
1. `users.user_id` 타입 변경: `INT AUTO_INCREMENT` → `VARCHAR(20)`
2. `user_id` 생성 함수 구현: `PM.{년도}.{랜덤6자}` 형식
3. 기존 데이터 마이그레이션:
   - 기존 INT `user_id` 백업
   - 새 형식으로 변환 (`PM.{년도}.{랜덤6자}`)
   - 모든 FK 관계 업데이트
4. 모든 FK 제약 수정:
   - `orders.user_id` (VARCHAR(20))
   - `warranties.user_id` → `warranties.owner_user_id` (VARCHAR(20))
   - `inquiries.user_id` (VARCHAR(20))
   - `token_master.owner_user_id` (VARCHAR(20), 레거시)
   - `transfer_logs.from_user_id`, `to_user_id`, `admin_user_id` (VARCHAR(20))
   - `scan_logs.user_id` (VARCHAR(20))
   - `orders_idempotency.user_id` (VARCHAR(20))

**예상 소요 시간**: 3-5일 (데이터 마이그레이션 포함)

#### 0-2. guest_id 생성 규칙 구현 (필수)
**작업 내용**:
1. `guest_id` 생성 함수 구현: `G-{YYYYMMDD}-{랜덤6자}` 형식
2. `orders.guest_id` 컬럼 추가 (VARCHAR(20), NULL 허용)
3. 중복 체크 로직 구현

**예상 소요 시간**: 0.5-1일

### Phase 1: 기반 구축 (MAJOR_CHANGES_CHECKLIST.md 우선)

#### 1-1. 비회원 주문 지원 (필수)
**작업 내용**:
1. `orders.user_id` NULL 허용 확인 및 변경 (이미 VARCHAR로 변경됨)
2. `orders.guest_id` 컬럼 추가 및 생성 로직 구현 (Phase 0-2에서 완료)
3. `orders_idempotency` 테이블 수정:
   - 옵션 A: `owner_key` 방식으로 변경 (`u:{user_id}` 또는 `g:{guest_id}`)
   - 옵션 B: `user_id` NULL 허용 + `guest_id` 추가
4. `guest_order_access_tokens` 테이블 생성
5. `claim_tokens` 테이블 생성

**예상 소요 시간**: 2-3일

#### 1-2. 이름 필드 통합 (선택)
**작업 내용**:
- 옵션 A: `orders.shipping_name` 단일 컬럼으로 변경 (DB 마이그레이션 필요)
- 옵션 B: 백엔드에서 `name` 필드를 받아서 분리 저장 (DB 변경 없음)

**예상 소요 시간**: 0.5-1일 (옵션 B 선택 시)

### Phase 2: 핵심 테이블 생성 (FINAL_EXECUTION_SPEC_REVIEW.md)

#### 2-1. 실물 단위 추적 시스템 (필수)
**작업 내용**:
1. `stock_units` 테이블 생성
2. `order_item_units` 테이블 생성
3. `paid_events` 테이블 생성
4. Paid 처리 트랜잭션 로직 구현

**예상 소요 시간**: 3-5일

#### 2-2. 보증서 시스템 개선 (필수)
**작업 내용**:
1. `token_master` 테이블 수정:
   - `token_pk` (PK autoinc) 추가
   - `token`을 UNIQUE로 변경
2. `warranties` 테이블 마이그레이션:
   - `user_id` → `owner_user_id` (NULL 허용)
   - `token` → `token_pk` (FK)
   - `status` 컬럼 추가
   - `source_order_item_unit_id` 컬럼 추가
   - `activated_at`, `revoked_at` 컬럼 추가
3. Paid 처리 시 warranty 생성 로직 구현

**예상 소요 시간**: 3-4일

#### 2-3. 인보이스 시스템 (필수)
**작업 내용**:
1. `invoices` 테이블 생성
2. Paid 처리 시 인보이스 생성 로직 구현
3. 이메일 발송 로직 구현 (MailerSend 등)

**예상 소요 시간**: 2-3일

### Phase 3: 배송 시스템 (중간 우선순위)

#### 3-1. 배송 관리 시스템
**작업 내용**:
1. `shipments` 테이블 생성
2. `shipment_units` 테이블 생성
3. `order_item_units.current_shipment_id` 컬럼 추가
4. 배송 처리 로직 구현

**예상 소요 시간**: 2-3일

### Phase 4: 양도 시스템 (중간 우선순위)

#### 4-1. 보증서 양도
**작업 내용**:
1. `warranty_transfers` 테이블 생성
2. 양도 요청/수락 로직 구현

**예상 소요 시간**: 2-3일

### Phase 5: 로깅/감사 (낮은 우선순위)

#### 5-1. 이벤트 로그
**작업 내용**:
1. `warranty_events` 테이블 생성
2. 이벤트 로깅 로직 구현

**예상 소요 시간**: 1-2일

---

## 5. MAJOR_CHANGES_CHECKLIST.md와의 연계

### 5-1. 우선순위 조정

**⚠️ 중요 변경: `users.user_id` 형식 변경이 최우선입니다**

**MAJOR_CHANGES_CHECKLIST.md의 Phase 0** (`users.user_id` 형식 변경)이 **최우선**입니다:
- 이유: `users.user_id`는 모든 FK 관계의 기준이 되므로, 다른 모든 작업보다 먼저 완료해야 함
- 형식: `PM.{년도}.{랜덤6자}` (예: `PM.2025.ABC123`)
- 영향: 모든 FK 관계 수정 필요

**그 다음** MAJOR_CHANGES_CHECKLIST.md의 Phase 1 (비회원 구매 기반 구축)이 **최우선**입니다:
- 이유: 인보이스/보증서 시스템을 구현하기 전에 비회원 주문 지원이 먼저 필요
- 작업 순서:
  1. `orders.user_id` NULL 허용 확인 및 변경
  2. `orders.guest_id` 컬럼 추가
  3. `orders_idempotency` 테이블 수정
  4. 비회원 장바구니 지원 (로컬 스토리지)
  5. `buy-script.js`, `checkout-script.js` 로그인 체크 제거
  6. `backend/order-routes.js` `optionalAuth` 적용

**그 다음** FINAL_EXECUTION_SPEC_REVIEW.md의 Phase 2 (핵심 테이블 생성) 진행:
- `order_item_units`, `stock_units`, `paid_events` 테이블 생성
- Paid 처리 트랜잭션 로직 구현
- `warranties` 테이블 마이그레이션
- `invoices` 테이블 생성 및 이메일 발송

### 5-2. 충돌 지점 확인

#### 충돌 1: `orders.user_id` NULL 허용
- **MAJOR_CHANGES_CHECKLIST.md**: 비회원 주문 지원을 위해 NULL 허용 필요
- **FINAL_EXECUTION_SPEC_REVIEW.md**: 이미 비회원 주문 지원 전제로 설계됨
- **결론**: ✅ 충돌 없음, 동일한 방향

#### 충돌 2: `warranties.user_id` → `owner_user_id`
- **MAJOR_CHANGES_CHECKLIST.md**: 비회원 주문 지원을 위해 NULL 허용 필요
- **FINAL_EXECUTION_SPEC_REVIEW.md**: `owner_user_id`로 변경, NULL 허용
- **결론**: ✅ 충돌 없음, 동일한 방향

#### 충돌 3: 이름 필드 통합
- **MAJOR_CHANGES_CHECKLIST.md**: `firstName`/`lastName` → `name` 단일 필드
- **FINAL_EXECUTION_SPEC_REVIEW.md**: 언급 없음
- **결론**: ⚠️ 독립적인 변경 사항, 옵션 A/B 선택 필요

---

## 6. 최근 변경사항 반영

### 6-1. DB 레벨 최소 제약 (FINAL_EXECUTION_SPEC_REVIEW.md 추가)

#### ✅ 1. warranties.status CHECK 제약
**필요한 작업**:
- MySQL 8.0.16+: CHECK 제약 추가
- MySQL 5.7: ENUM 사용
- MySQL 5.6 이하: 트리거 또는 애플리케이션 가드

**마이그레이션 파일 필요**:
```sql
-- MySQL 8.0.16+
ALTER TABLE warranties
ADD CONSTRAINT chk_warranties_status 
CHECK (status IN ('issued_unassigned', 'issued', 'active', 'suspended', 'revoked'));

-- 또는 ENUM
ALTER TABLE warranties
MODIFY COLUMN status ENUM('issued_unassigned', 'issued', 'active', 'suspended', 'revoked') NOT NULL;
```

#### ✅ 2. warranties.owner_user_id 조건부 NOT NULL 규칙
**필요한 작업**:
- 애플리케이션 레벨 가드 구현
- `issued_unassigned` 상태에서만 NULL 허용
- `issued`/`active`/`suspended`에서는 NOT NULL 필수

**코드 구현 필요**:
- `validateWarrantyStatusAndOwner()` 함수 추가

### 6-2. 권리 행위 API 공통 가드 (FINAL_EXECUTION_SPEC_REVIEW.md 추가)

#### ✅ 공통 검증 함수 구현
**필요한 작업**:
- `validateWarrantyAction()` 함수 구현
- 모든 권리 행위 API에 적용 (activate, transfer, suspend/unsuspend, refund, resell)
- 에러 코드 표준화 (`ERR_STATUS_INVALID`, `ERR_OWNER_MISMATCH`, 등)

**코드 위치**:
- `backend/warranty-middleware.js` (신규 생성) 또는
- `backend/utils/warranty-validator.js` (신규 생성)

### 6-3. 멱등성 계층표 (FINAL_EXECUTION_SPEC_REVIEW.md 추가)

#### ✅ 멱등성 메커니즘 구현
**필요한 작업**:
- 각 단계별 멱등성 메커니즘 확인 및 구현
- `paid_events` UNIQUE 제약
- `stock_units` FOR UPDATE SKIP LOCKED
- `order_item_units` UNIQUE 제약
- `warranties` UPDATE affectedRows 검증
- `transfers` UPDATE affectedRows 검증

**코드 구현 필요**:
- Paid 처리 로직에 멱등성 체크 추가
- 재고 배정 로직에 FOR UPDATE SKIP LOCKED 추가
- 보증서 revive 로직에 affectedRows 검증 추가

---

## 7. 코드베이스 충돌 분석

### 7-1. 기존 코드에서 사용 중인 컬럼/테이블

#### ⚠️ `warranties.user_id` 사용 중
**위치**: `backend/admin-cli.js` 217줄, 807줄
```javascript
// 217줄: warranties.user_id 업데이트
console.log(`   1. warranties.user_id: ${fromUser.user_id} → ${toUser.user_id}`);

// 807줄: warranties.user_id와 token_master.owner_user_id 비교
const warrantyOwnerId = info.warranties.user_id;
const tokenMasterOwnerId = info.token_master.owner_user_id;
```

**충돌**:
- `warranties.user_id` → `warranties.owner_user_id`로 변경 필요
- `admin-cli.js` 수정 필요

**조치**:
- `admin-cli.js`에서 `warranties.user_id` → `warranties.owner_user_id`로 변경
- `token_master.owner_user_id`는 레거시이므로 사용 금지 (문서화만)

#### ⚠️ `token_master.owner_user_id` 사용 중
**위치**: `backend/admin-cli.js` 218줄, 804줄, 807줄
```javascript
// 218줄: token_master.owner_user_id 업데이트
console.log(`   2. token_master.owner_user_id: ${fromUser.user_id} → ${toUser.user_id}`);

// 804줄, 807줄: token_master.owner_user_id 조회 및 비교
const tokenMasterOwnerId = info.token_master.owner_user_id;
```

**충돌**:
- `token_master.owner_user_id`는 레거시로 사용 금지
- `admin-cli.js`에서 제거 또는 주석 처리 필요

**조치**:
- `admin-cli.js`에서 `token_master.owner_user_id` 사용 제거
- 레거시 컬럼은 유지하되 사용 금지 (문서화)

#### ⚠️ `warranties.token` 사용 중 (추정)
**위치**: `backend/auth-routes.js` (QR 인증 로직)
```javascript
// 추정: warranties 테이블에서 token으로 조회하는 로직
// 현재: warranties.token VARCHAR(20) UNIQUE
// 변경: warranties.token_pk FK로 변경 필요
```

**충돌**:
- `warranties.token` → `warranties.token_pk`로 변경 필요
- QR 인증 로직 수정 필요

**조치**:
- `auth-routes.js`에서 `warranties.token` → `warranties.token_pk` (JOIN token_master)로 변경
- QR 스캔 시 `token_master.token`으로 조회 후 `token_pk`로 `warranties` 조회

### 7-2. 기존 로직과의 충돌

#### ⚠️ QR 인증 시 보증서 생성 로직
**위치**: `backend/auth-routes.js` (추정, COMPREHENSIVE_SPEC_ANALYSIS.md 참고)
```javascript
// 현재: QR 스캔 시 보증서 생성
if (isFirstScan) {
  await connection.execute(
    'INSERT INTO warranties (user_id, token, public_id, product_name, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, token, publicId, productName, utcDateTime, utcDateTime]
  );
}
```

**충돌**:
- 제시된 스펙: Paid 처리 시 보증서 생성
- 현재 로직: QR 스캔 시 보증서 생성
- **충돌 발생**: QR 스캔 시 보증서 생성 로직 제거 필요

**조치**:
- `auth-routes.js`에서 보증서 생성 로직 제거
- QR 스캔 시 이미 생성된 보증서 조회만 수행
- 보증서가 없으면 "보증서를 찾을 수 없습니다" 에러 반환

#### ⚠️ `orders.status` 수동 업데이트 로직
**위치**: `backend/order-routes.js` (추정)
```javascript
// 현재: orders.status를 직접 업데이트하는 로직이 있을 수 있음
await connection.execute(
  'UPDATE orders SET status = ? WHERE order_id = ?',
  [newStatus, orderId]
);
```

**충돌**:
- 제시된 스펙: `orders.status`는 집계 함수로만 갱신
- 현재 로직: 직접 업데이트 가능
- **충돌 발생**: `orders.status` 직접 업데이트 로직 제거 필요

**조치**:
- `orders.status` 직접 업데이트 로직 제거
- 집계 함수 `calculateOrderStatus()` 구현
- 모든 `orders.status` 업데이트를 집계 함수로 대체

### 7-3. 외래 키 제약 충돌

#### ⚠️ `warranties.user_id` FK 제약
**현재**: `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT`
**변경**: `FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT`
**충돌**: FK 제약 변경 필요

**조치**:
- 기존 FK 제약 삭제
- 새로운 FK 제약 추가 (`owner_user_id`)

#### ⚠️ `token_master.owner_warranty_public_id` FK 제약
**현재**: `FOREIGN KEY (owner_warranty_public_id) REFERENCES warranties(public_id) ON DELETE SET NULL`
**변경**: 레거시로 유지, 사용 금지
**충돌**: FK 제약은 유지하되 사용 금지

**조치**:
- FK 제약 유지 (데이터 무결성 보장)
- 코드에서 사용 금지 (문서화)

---

## 8. 보안 취약점 분석

### 8-1. 현재 보안 조치 (양호)

#### ✅ 인증/인가
- **JWT 토큰 인증**: `authenticateToken` 미들웨어 사용
- **관리자 권한 확인**: `requireAdmin` 미들웨어 사용
- **이메일 기반 접근 제어**: `.env`의 `ADMIN_EMAILS`에 등록된 이메일만 접근 가능
- **로그인 시도 제한**: Brute Force 공격 방지 (5회 실패 시 15분 잠금)

#### ✅ 입력 검증
- **화이트리스트 기반 검증**: 카테고리, 액세서리 타입 등
- **필수 필드 검증**: `express-validator` 사용
- **타입 검증**: 숫자, 문자열 타입 확인

#### ✅ SQL Injection 방지
- **Prepared Statements 사용**: 모든 SQL 쿼리에 `?` 플레이스홀더 사용
- **파라미터화된 쿼리**: 사용자 입력을 직접 쿼리에 삽입하지 않음

#### ✅ XSS 방지
- **프론트엔드**: `escapeHtml()` 함수로 사용자 입력 이스케이프
- **백엔드**: 입력값을 그대로 출력하지 않음

#### ✅ CSRF 보호
- **CSRF 토큰**: `csrf-middleware.js`에서 CSRF 토큰 발급 및 검증
- **SameSite 쿠키**: 추가 보호

### 8-2. 새로운 스펙에 따른 보안 고려사항

#### ⚠️ 비회원 주문 보안
**문제**:
- 비회원 주문 조회 토큰(`guest_order_access_tokens`) 노출 시 주문 정보 유출 가능
- 토큰 해시 저장 필요

**조치**:
- `guest_order_access_tokens.token` → `token_hash`로 변경
- 토큰 원문은 클라이언트에만 전달, 서버에는 해시만 저장
- 토큰 만료 시간 설정 (90일)
- 토큰 revoke 기능 구현

#### ⚠️ Claim 토큰 보안
**문제**:
- Claim 토큰(`claim_tokens`) 노출 시 비회원 주문을 다른 계정에 연동 가능
- 토큰 해시 저장 필요

**조치**:
- `claim_tokens.token` → `token_hash`로 변경
- 토큰 원문은 클라이언트에만 전달, 서버에는 해시만 저장
- 토큰 만료 시간 설정 (72시간)
- 토큰 1회성 사용 (`used_at` 설정)

#### ⚠️ 양도 코드 보안
**문제**:
- 양도 코드(`warranty_transfers.transfer_code`) 노출 시 무단 양도 가능
- 코드 해시 저장 필요

**조치**:
- `warranty_transfers.transfer_code` → `transfer_code_hash`로 변경
- 코드 원문은 이메일로만 전달, 서버에는 해시만 저장
- 코드 만료 시간 설정 (72시간)
- 코드 1회성 사용 (수락 시 `status` 변경)

#### ⚠️ 관리자 페이지 토큰 노출
**문제**:
- 관리자 페이지에서 토큰(20자 난수) 전체 노출 시 실물 매칭 가능
- 토큰 마스킹 필요

**조치**:
- 목록 화면: 토큰 마스킹 (앞 4자/뒤 4자만 표시)
- 상세 화면: 전체 토큰 표시 (권한 확인)
- 역할 기반 접근 제어 (RBAC) 구현 고려

### 8-3. 추가 보안 권장사항

#### ⚠️ Rate Limiting
**현재**: 일부 API에만 적용 (관리자 로그인)
**권장**: 모든 API에 Rate Limiting 적용
- 주문 생성 API: IP 기반 제한
- 보증서 활성화 API: 사용자 기반 제한
- QR 스캔 API: IP 기반 제한

#### ⚠️ 입력 길이 제한
**현재**: 일부 필드만 길이 제한
**권장**: 모든 입력 필드에 길이 제한
- 주문 번호: 32자
- 이메일: 255자
- 주소: 500자
- 등

#### ⚠️ 로깅 강화
**현재**: 기본적인 로깅만 존재
**권장**: 보안 이벤트 로깅 강화
- 보증서 활성화 시도
- 양도 요청/수락
- 환불 요청
- 관리자 작업

---

## 9. 환경 설정 확인

### 9-1. 필수 환경 변수

#### ✅ 현재 설정된 환경 변수 (추정)
- `JWT_SECRET`: JWT 토큰 서명 키
- `ADMIN_EMAILS`: 관리자 이메일 목록 (쉼표 구분)
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: 데이터베이스 연결 정보
- `NODE_ENV`: 환경 (development/production)

#### ⚠️ 추가 필요한 환경 변수
- `MAILERSEND_API_KEY`: 인보이스 이메일 발송용 (MailerSend)
- `MAILERSEND_FROM_EMAIL`: 발신자 이메일
- `MAILERSEND_FROM_NAME`: 발신자 이름
- `FRONTEND_URL`: 프론트엔드 URL (이메일 링크용)
- `TOKEN_HASH_SECRET`: 토큰 해시용 시크릿 (guest_order_access_tokens, claim_tokens)

### 9-2. MySQL 버전 확인 필요

#### ⚠️ CHECK 제약 지원
**필요**: MySQL 8.0.16+ 또는 MySQL 5.7 (ENUM 사용)
**확인 방법**:
```sql
SELECT VERSION();
```

**대응**:
- MySQL 8.0.16+: CHECK 제약 사용
- MySQL 5.7: ENUM 사용
- MySQL 5.6 이하: 트리거 또는 애플리케이션 가드

#### ⚠️ FOR UPDATE SKIP LOCKED 지원
**필요**: MySQL 8.0+ (재고 배정 동시성 제어)
**확인 방법**:
```sql
SELECT VERSION();
```

**대응**:
- MySQL 8.0+: `FOR UPDATE SKIP LOCKED` 사용
- MySQL 5.7 이하: 직렬화 범위 명확화 필요

### 9-3. 데이터베이스 연결 설정

#### ⚠️ 트랜잭션 격리 수준
**권장**: `READ COMMITTED` 또는 `REPEATABLE READ`
**확인 방법**:
```sql
SELECT @@transaction_isolation;
```

**대응**:
- 트랜잭션 격리 수준 확인 및 필요 시 조정
- 동시성 제어를 위한 적절한 격리 수준 설정

---

## 10. 결정 필요 사항

### 10-1. 즉시 결정 필요

1. **`orders_idempotency` 테이블 수정 방식**
   - 옵션 A: `owner_key` 방식 (`u:{user_id}` 또는 `g:{guest_id}`)
   - 옵션 B: `user_id` NULL 허용 + `guest_id` 추가
   - **권장**: 옵션 A (단순하고 명확함)

2. **이름 필드 통합 방식**
   - 옵션 A: `orders.shipping_name` 단일 컬럼으로 변경 (DB 마이그레이션 필요)
   - 옵션 B: 백엔드에서 `name` 필드를 받아서 분리 저장 (DB 변경 없음)
   - **권장**: 옵션 B (기존 구조 유지, 마이그레이션 불필요)

3. **`token_master` PK 변경 방식**
   - 옵션 A: 테이블 재생성 스왑 (운영 안정성 최우선)
   - 옵션 B: ALTER TABLE로 PK 교체 (실무 적용 전 검증 필수)
   - **권장**: 옵션 A (운영 안정성 최우선)

4. **MySQL 버전 확인**
   - CHECK 제약 지원 여부 확인
   - FOR UPDATE SKIP LOCKED 지원 여부 확인

### 10-2. 추가 검토 필요

1. **기존 데이터 마이그레이션 전략**
   - 기존 `warranties` 데이터 마이그레이션
   - 기존 `token_master` 데이터 마이그레이션
   - 기존 주문 데이터의 `order_item_units` 생성 여부

2. **환경 변수 설정**
   - `MAILERSEND_API_KEY` 설정
   - `TOKEN_HASH_SECRET` 설정
   - `FRONTEND_URL` 설정

---

## 11. 다음 단계

### 즉시 시작 가능한 작업

1. **⚠️ 최우선: Phase 0 시작** (MAJOR_CHANGES_CHECKLIST.md)
   - `users.user_id` 형식 변경 (INT → VARCHAR, `PM.{년도}.{랜덤6자}`)
   - 기존 데이터 마이그레이션
   - 모든 FK 관계 수정
   - `guest_id` 생성 규칙 구현 (`G-{YYYYMMDD}-{랜덤6자}`)

2. **DB 스키마 확인**
   - `orders.user_id` NULL 허용 여부 확인 (이미 VARCHAR로 변경됨)
   - `orders.paid_at` 컬럼 존재 여부 확인
   - MySQL 버전 확인

3. **Phase 1 시작** (Phase 0 완료 후)
   - `orders.guest_id` 컬럼 추가 및 생성 로직 구현 (Phase 0-2에서 완료)
   - `orders_idempotency` 테이블 수정

3. **테이블 구조 설계**
   - `order_item_units` 테이블 DDL 작성
   - `stock_units` 테이블 DDL 작성
   - `paid_events` 테이블 DDL 작성

### 결정 대기 중인 작업

1. **이름 필드 통합 방식 결정** (옵션 A vs B)
2. **`orders_idempotency` 수정 방식 결정** (`owner_key` vs `guest_id`)
3. **`token_master` PK 변경 방식 결정** (재생성 vs ALTER)

---

## 📝 요약

### ✅ 정리 완료된 부분
- 인보이스, 보증서, QR 인증 전체 흐름 정리 완료 (`SYSTEM_FLOW_DETAILED.md`)
- 현재 구조와 필요한 변경 사항 파악 완료
- 우선순위 및 실행 계획 수립 완료
- 최근 변경사항 반영 완료 (DB 제약, 공통 가드, 멱등성 계층표)
- 코드베이스 충돌 분석 완료
- 보안 취약점 분석 완료
- 환경 설정 확인 완료

### ⚠️ 결정 필요 사항
1. `orders_idempotency` 수정 방식 (`owner_key` vs `guest_id`)
2. 이름 필드 통합 방식 (옵션 A vs B)
3. `token_master` PK 변경 방식 (재생성 vs ALTER)
4. MySQL 버전 확인 및 대응 방안

### 🔴 즉시 조치 필요 사항
1. **⚠️ 최우선**: `users.user_id` 형식 변경 (INT → VARCHAR, `PM.{년도}.{랜덤6자}`)
2. **⚠️ 최우선**: 모든 FK 관계 수정 (VARCHAR(20)로 변경)
3. **⚠️ 최우선**: 기존 데이터 마이그레이션
4. `guest_id` 생성 규칙 구현 (`G-{YYYYMMDD}-{랜덤6자}`)
5. `admin-cli.js`에서 `warranties.user_id` → `warranties.owner_user_id`로 변경
6. `admin-cli.js`에서 `token_master.owner_user_id` 사용 제거
7. `auth-routes.js`에서 QR 스캔 시 보증서 생성 로직 제거
8. `order-routes.js`에서 `orders.status` 직접 업데이트 로직 제거

### 🎯 권장 실행 순서
1. **Phase 0**: `users.user_id` 형식 변경 (최우선) ⚠️
2. **Phase 1**: MAJOR_CHANGES_CHECKLIST.md의 비회원 주문 지원
3. **Phase 2**: FINAL_EXECUTION_SPEC_REVIEW.md의 핵심 테이블 생성
4. **Phase 3**: 배송/양도 시스템
5. **Phase 4**: 로깅/감사 시스템

---

## 📊 종합 평가

### 구현 가능성: ✅ 높음
- 모든 변경 사항이 명확하게 정의됨
- 기존 구조와의 충돌 지점 파악 완료
- 마이그레이션 전략 수립 가능

### 안정성: ⚠️ 주의 필요
- 기존 코드 수정 필요 (`admin-cli.js`, `auth-routes.js`, `order-routes.js`)
- 데이터 마이그레이션 전략 필요
- MySQL 버전 확인 필요

### 보안: ✅ 양호
- 기본적인 보안 조치가 잘 되어 있음
- 새로운 스펙에 따른 보안 고려사항 파악 완료
- 추가 보안 권장사항 제시 완료

### 확장성: ✅ 우수
- SSOT 원칙 준수
- 멱등성 보장
- 이벤트 로깅 시스템

---

**이 분석 보고서는 구현 전 필수 검토 자료입니다. 모든 변경 사항을 적용하기 전에 이 문서를 다시 확인하시기 바랍니다.**
