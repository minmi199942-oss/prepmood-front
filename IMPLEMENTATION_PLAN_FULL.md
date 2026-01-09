# 설계 문서 기반 전체 구현 계획

## 📋 목표
**설계 문서(`FINAL_EXECUTION_SPEC_REVIEW.md`, `SYSTEM_FLOW_DETAILED.md`)와 완벽하게 일치하도록 구현**

## ⚠️ 핵심 원칙
1. **설계 문서가 단일 진실(SSOT)**: 설계 문서와 다르게 구현 금지
2. **임의 수정 금지**: 규칙 변경이 필요하면 보고 → 의논 → 승인 후 변경
3. **테이블 구조 우선**: 코드 작성 전에 테이블 구조 완성 필수
4. **단계별 검증**: 각 Phase 완료 후 설계 문서와 일치 여부 확인

---

## 🔍 현재 상태 분석

### ✅ 이미 존재하는 테이블
- `orders` (guest_id 있음)
- `order_items`
- `warranties` (기본 구조)
- `token_master` (token이 PK)
- `order_idempotency` (owner_key 방식으로 변경됨)
- `invoices` (021_create_invoices_table.sql)

### ❌ 설계 문서에 있지만 없는 테이블
1. `paid_events` - **결제 SSOT, 멱등성 보장 핵심**
2. `order_item_units` - **주문 항목 단위 (시리얼 넘버, 토큰 연결)**
3. `stock_units` - **재고 관리**
4. `shipments` - **송장 정보**
5. `shipment_units` - **송장-단위 매핑**
6. `warranty_events` - **감사 로그**
7. `warranty_transfers` - **양도 관리**
8. `guest_order_access_tokens` - **비회원 주문 조회**
9. `claim_tokens` - **비회원 → 회원 전환**

### ❌ 설계 문서에 있지만 없는 컬럼
1. `orders.paid_at` - **결제 완료 시점 (캐시/파생 필드)**
2. `warranties.status` - **보증서 상태 (issued/active/revoked 등)**
3. `warranties.owner_user_id` - **보증서 소유자**
4. `warranties.source_order_item_unit_id` - **주문 단위 연결**
5. `warranties.activated_at` - **활성화 시점**
6. `warranties.revoked_at` - **환불 시점**

### ⚠️ 마이그레이션 필요
1. `token_master.token_pk` 추가 및 PK 교체 (복잡, 단계별 진행)
2. `warranties.token` → `warranties.token_pk` FK 전환

---

## 📊 구현 단계별 계획

### Phase 0: 현재 상태 정확히 파악 (필수 선행 작업)

**목적**: 설계 문서와 현재 상태의 차이점을 정확히 파악

**작업**:
1. VPS에서 현재 DB 스키마 확인
   ```sql
   -- 각 테이블 구조 확인
   SHOW CREATE TABLE orders;
   SHOW CREATE TABLE warranties;
   SHOW CREATE TABLE token_master;
   SHOW CREATE TABLE order_items;
   SHOW CREATE TABLE order_idempotency;
   ```

2. 설계 문서와 비교하여 차이점 리스트 작성
3. 기존 데이터 영향도 분석

**완료 조건**: 
- 모든 테이블 구조 문서화 완료
- 설계 문서와의 차이점 명확히 정리

---

### Phase 1: 핵심 인프라 테이블 생성 (최우선)

**목적**: 결제 처리의 기반이 되는 테이블 구조 완성

**작업 순서** (의존성 고려):

#### 1-1. `paid_events` 테이블 생성
**이유**: 결제 SSOT, 멱등성 보장의 핵심. 다른 모든 로직의 기반

```sql
CREATE TABLE paid_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    payment_key VARCHAR(255) NOT NULL,
    event_source ENUM('webhook', 'redirect', 'manual_verify') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
    raw_payload_json JSON COMMENT '원본 결제 응답',
    confirmed_at DATETIME NULL COMMENT '확정 시각',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_paid_events_order_payment (order_id, payment_key),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    INDEX idx_order_id (order_id),
    INDEX idx_payment_key (payment_key),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**검증**: UNIQUE 제약 확인, 멱등성 테스트

#### 1-2. `orders.paid_at` 컬럼 추가
**이유**: 설계 문서 명시, `paid_events`와 동기화 필요

```sql
ALTER TABLE orders
ADD COLUMN paid_at DATETIME NULL COMMENT '결제 완료 시점 (paid_events 기반, 캐시/파생 필드)' 
AFTER status;

CREATE INDEX idx_paid_at ON orders(paid_at);
```

**동기화 규칙**: `paid_events` 생성 시 `paid_at`도 함께 업데이트 (동일 트랜잭션)

#### 1-3. `stock_units` 테이블 생성
**이유**: 재고 관리, 재고 배정의 기반

```sql
CREATE TABLE stock_units (
    stock_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    token_pk INT NOT NULL COMMENT 'token_master.token_pk 참조 (FK 추가는 token_pk 마이그레이션 후)',
    status ENUM('in_stock', 'reserved', 'sold', 'returned') NOT NULL DEFAULT 'in_stock',
    reserved_at DATETIME NULL,
    reserved_by_order_id INT NULL,
    sold_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT,
    FOREIGN KEY (reserved_by_order_id) REFERENCES orders(order_id) ON DELETE SET NULL,
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_reserved_by_order_id (reserved_by_order_id),
    INDEX idx_token_pk (token_pk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**주의**: `token_pk` FK는 Phase 1-5에서 추가

#### 1-4. `order_item_units` 테이블 생성
**이유**: 주문 항목 단위 관리, 시리얼 넘버/토큰 연결

```sql
CREATE TABLE order_item_units (
    order_item_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_item_id INT NOT NULL,
    unit_seq INT NOT NULL COMMENT '같은 order_item_id 내 순서 (1부터 시작)',
    stock_unit_id BIGINT NULL COMMENT '재고 단위 연결 (재고 배정 후 설정)',
    token_pk INT NOT NULL COMMENT 'token_master.token_pk 참조 (FK 추가는 token_pk 마이그레이션 후)',
    unit_status ENUM('reserved', 'shipped', 'delivered', 'refunded') NOT NULL DEFAULT 'reserved',
    current_shipment_id BIGINT NULL COMMENT '현재 유효 송장 (shipments 테이블 생성 후 FK 추가)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE RESTRICT,
    FOREIGN KEY (stock_unit_id) REFERENCES stock_units(stock_unit_id) ON DELETE SET NULL,
    UNIQUE KEY uk_order_item_unit_seq (order_item_id, unit_seq),
    INDEX idx_order_item_id (order_item_id),
    INDEX idx_stock_unit_id (stock_unit_id),
    INDEX idx_token_pk (token_pk),
    INDEX idx_unit_status (unit_status),
    INDEX idx_current_shipment_id (current_shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**주의**: `token_pk` FK, `current_shipment_id` FK는 나중에 추가

#### 1-5. `warranties` 테이블 컬럼 추가
**이유**: 보증서 상태 관리, 소유자 관리

```sql
-- status 컬럼 추가
ALTER TABLE warranties
ADD COLUMN status ENUM('issued_unassigned', 'issued', 'active', 'suspended', 'revoked') 
NOT NULL DEFAULT 'issued_unassigned'
COMMENT '보증서 상태 (SSOT)' 
AFTER warranty_id;

-- owner_user_id 컬럼 추가
ALTER TABLE warranties
ADD COLUMN owner_user_id INT NULL
COMMENT '보증서 소유자 (NULL이면 issued_unassigned)'
AFTER status;

-- source_order_item_unit_id 컬럼 추가
ALTER TABLE warranties
ADD COLUMN source_order_item_unit_id BIGINT NULL
COMMENT '주문 항목 단위 연결 (order_item_units 테이블 생성 후 FK 추가)'
AFTER owner_user_id;

-- activated_at 컬럼 추가
ALTER TABLE warranties
ADD COLUMN activated_at DATETIME NULL
COMMENT '활성화 시점'
AFTER source_order_item_unit_id;

-- revoked_at 컬럼 추가
ALTER TABLE warranties
ADD COLUMN revoked_at DATETIME NULL
COMMENT '환불 시점 (재판매 시에도 유지, 이력)'
AFTER activated_at;

-- 인덱스 추가
CREATE INDEX idx_warranties_status ON warranties(status);
CREATE INDEX idx_warranties_owner_user_id ON warranties(owner_user_id);
CREATE INDEX idx_warranties_source_order_item_unit_id ON warranties(source_order_item_unit_id);

-- FK 추가 (나중에)
-- ALTER TABLE warranties
-- ADD CONSTRAINT fk_warranties_source_order_item_unit
-- FOREIGN KEY (source_order_item_unit_id) REFERENCES order_item_units(order_item_unit_id) ON DELETE RESTRICT;
```

**주의**: 기존 데이터 마이그레이션 필요 (status 기본값 설정)

#### 1-6. `token_pk` 마이그레이션 (복잡, 신중하게)
**이유**: 외부 노출과 내부 조인 분리, 성능 향상

**순서** (FINAL_EXECUTION_SPEC_REVIEW.md의 Phase 1-3 참조):
1. `token_master` 테이블에 `token_pk` 컬럼 추가 (NULL 허용)
2. 기존 데이터에 `token_pk` 값 채우기
3. `token_pk`를 NOT NULL로 변경
4. PK 교체 (옵션 A: 테이블 재생성 스왑 권장)
5. `warranties.token_pk` 컬럼 추가 및 데이터 마이그레이션
6. FK 전환

**주의**: 운영 안정성 최우선, 백업 필수

**완료 조건**:
- `paid_events` 테이블 생성 및 UNIQUE 제약 확인
- `orders.paid_at` 컬럼 추가
- `stock_units` 테이블 생성
- `order_item_units` 테이블 생성
- `warranties` 컬럼 추가 완료
- `token_pk` 마이그레이션 완료 (또는 Phase 1-7로 분리)

---

### Phase 2: 비회원 지원 인프라

**목적**: 비회원 주문 생성/조회 기능

**작업**:
1. `guest_order_access_tokens` 테이블 생성
2. `claim_tokens` 테이블 생성
3. `guest_session_id` 쿠키 관리 로직
4. `optionalAuth` 미들웨어 생성

**완료 조건**: 비회원 주문 생성/조회 테스트 통과

---

### Phase 3: Paid 처리 로직 구현

**목적**: 결제 완료 시 재고 배정, 보증서 생성, 인보이스 생성

**작업**:
1. `processPaidOrder()` 함수 구현
   - `paid_events` 멱등 INSERT
   - 주문 잠금 (FOR UPDATE)
   - 재고 배정 (`stock_units`)
   - `order_item_units` 생성
   - `warranties` 생성
   - 인보이스 생성 (이미 구현됨, 통합)
   - `orders.paid_at` 업데이트
   - COMMIT

2. `POST /api/payments/confirm`에 `processPaidOrder()` 호출 추가
3. `POST /api/payments/webhook`에 `processPaidOrder()` 호출 추가

**완료 조건**: 
- Paid 처리 트랜잭션 통과
- 재고 배정 정상
- `order_item_units`/`warranties` 생성 정상
- 동시성 테스트 통과

---

### Phase 4: 배송/송장 인프라

**목적**: 배송 관리 기능

**작업**:
1. `shipments` 테이블 생성 (active_key 패턴)
2. `shipment_units` 테이블 생성
3. `order_item_units.current_shipment_id` FK 추가
4. 송장 생성 API
5. 배송 완료 처리 API
6. `orders.status` 집계 함수

**완료 조건**: 송장 생성/교체/재발송 테스트 통과

---

### Phase 5: 보증서 활성화/Claim

**목적**: 보증서 활성화 및 비회원 → 회원 전환

**작업**:
1. 활성화 API 구현 (인보이스 연동 확인 포함)
2. Claim API 구현
3. QR 스캔 로직 수정 (warranty 생성 제거, 조회만)

**완료 조건**: 활성화/Claim 테스트 통과

---

### Phase 6: 환불/양도

**목적**: 환불 처리 및 보증서 양도

**작업**:
1. `warranty_transfers` 테이블 생성
2. `warranty_events` 테이블 생성
3. 환불 처리 API (관리자 전용)
4. 양도 요청/수락 API
5. 양도 만료 배치 작업

**완료 조건**: 환불/양도 테스트 통과

---

### Phase 7: 관리자 페이지

**목적**: 주문 관리, 배송/환불 처리

**작업**:
1. 주문 목록 API (검색/필터)
2. 주문 상세 API (3단 구조)
3. 배송 처리 페이지
4. 환불 처리 페이지

**완료 조건**: 관리자 페이지 기능 테스트 통과

---

## 🎯 우선순위 및 실행 순서

### 즉시 실행 (결제 에러 해결)
1. **`paid_events` 테이블 생성** (022_create_paid_events_table.sql)
2. **`orders.paid_at` 컬럼 추가** (023_add_orders_paid_at.sql)
3. **코드 수정**: `payments-routes.js`에서 `paid_at` 업데이트, `paid_events` INSERT

### 그 다음 (Phase 1 완성)
4. `stock_units` 테이블 생성
5. `order_item_units` 테이블 생성
6. `warranties` 컬럼 추가
7. `token_pk` 마이그레이션 (신중하게)

### 이후 (Phase 3)
8. `processPaidOrder()` 함수 구현
9. 결제 완료 시 호출 통합

---

## ⚠️ 주의사항

1. **설계 문서 준수**: 모든 구현은 설계 문서 기준
2. **테이블 구조 우선**: 코드 작성 전 테이블 구조 완성
3. **단계별 검증**: 각 Phase 완료 후 설계 문서와 일치 확인
4. **백업 필수**: 마이그레이션 전 백업
5. **의존성 고려**: 테이블 생성 순서 중요 (FK 의존성)

---

## 📝 다음 단계

**즉시 실행할 작업**:
1. `paid_events` 테이블 생성 마이그레이션 작성
2. `orders.paid_at` 컬럼 추가 마이그레이션 작성
3. 코드 수정 (설계 문서 기준)

이 계획대로 진행할까요?
