# 현재 시스템 vs 제시된 설계 비교 분석

## 📊 현재 시스템 구조

### ✅ 존재하는 테이블

#### 1. `users` 테이블
- `user_id` (PK)
- `email`, `password_hash`
- `last_name`, `first_name`
- `birth`, `phone`
- ✅ 회원 정보 저장 가능

#### 2. `orders` 테이블
- `order_id` (PK)
- `user_id` (FK, **NULL 허용 여부 확인 필요**)
- `order_number` (UNIQUE)
- `status` (pending/confirmed/processing/shipped/delivered/cancelled/refunded)
- `total_price`
- `shipping_first_name`, `shipping_last_name`
- `shipping_email`, `shipping_phone`
- `shipping_address`, `shipping_city`, `shipping_postal_code`, `shipping_country`
- `shipping_method`, `shipping_cost`
- `estimated_delivery`
- ⚠️ **`guest_id` 컬럼 없음**

#### 3. `order_items` 테이블
- `order_item_id` (PK)
- `order_id` (FK)
- `product_id` (FK)
- `product_name`, `product_image`
- `size`, `color`
- `quantity`, `unit_price`, `subtotal`
- ⚠️ **`stock_unit_id` 컬럼 없음**

#### 4. `warranties` 테이블
- `id` (PK)
- `user_id` (FK, **NOT NULL** - 비회원 지원 안됨)
- `token` (UNIQUE)
- `public_id` (UNIQUE, UUID)
- `product_name`
- `verified_at`, `created_at`
- ⚠️ **`owner_user_id` NULL 허용 안됨**
- ⚠️ **`status` 컬럼 없음** (issued/active/suspended/revoked)
- ⚠️ **`order_item_id`, `stock_unit_id` 연결 없음**

#### 5. `token_master` 테이블
- `token` (PK)
- `internal_code`
- `product_name`
- `is_blocked`
- `owner_user_id` (NULL 허용)
- `owner_warranty_public_id` (FK)
- `scan_count`
- `first_scanned_at`, `last_scanned_at`
- `created_at`, `updated_at`
- ⚠️ **`status` 컬럼 없음** (unused/reserved/active/revoked)
- ⚠️ **`stock_unit_id` 연결 없음**

#### 6. `orders_idempotency` 테이블
- `id` (PK)
- `user_id` (NOT NULL - 비회원 지원 안됨)
- `idem_key`
- `order_number`
- ⚠️ **비회원 주문 시 idempotency 처리 불가**

### ❌ 존재하지 않는 테이블

1. **`guest_orders`** - 비회원 주문 관리
2. **`guest_order_access`** - 비회원 주문 조회 토큰
3. **`stock_units`** - 재고 단위 관리
4. **`invoices`** - 디지털 인보이스
5. **`warranty_transfers`** - 보증서 양도
6. **`refunds`** - 환불 관리
7. **`shipments`** - 배송 관리 (선택)

### ❌ 존재하지 않는 기능

1. **비회원 주문 생성** - `authenticateToken` 필수
2. **재고 배정 시스템** - stock_units 테이블 없음
3. **디지털 인보이스 발급** - invoices 테이블 없음
4. **보증서 상태 관리** - issued/active/suspended/revoked
5. **보증서 양도** - warranty_transfers 테이블 없음
6. **환불 처리** - refunds 테이블 없음
7. **비회원 주문 조회** - guest_order_access 없음

---

## 🔄 제시된 설계와의 차이점

### 1. 비회원 주문 지원

#### 현재 상태
- ❌ `orders.user_id` NULL 허용 여부 불명확
- ❌ `guest_id` 컬럼 없음
- ❌ `guest_orders` 테이블 없음
- ❌ `guest_order_access` 테이블 없음
- ❌ `orders_idempotency.user_id` NOT NULL (비회원 불가)

#### 필요한 변경
- [ ] `orders.user_id` NULL 허용 확인 및 변경
- [ ] `orders.guest_id` 컬럼 추가 (FK -> guest_orders.guest_id)
- [ ] `guest_orders` 테이블 생성
- [ ] `guest_order_access` 테이블 생성
- [ ] `orders_idempotency.user_id` NULL 허용 또는 guest_id 추가

### 2. 재고 관리 시스템

#### 현재 상태
- ❌ `stock_units` 테이블 없음
- ❌ `order_items.stock_unit_id` 컬럼 없음
- ❌ 재고 배정 로직 없음
- ❌ 시리얼/바코드 관리 없음

#### 필요한 변경
- [ ] `stock_units` 테이블 생성
- [ ] `order_items.stock_unit_id` 컬럼 추가
- [ ] 재고 배정 로직 구현 (결제 성공 시)
- [ ] xlsx 업로드로 재고 등록 기능

### 3. 디지털 인보이스 시스템

#### 현재 상태
- ❌ `invoices` 테이블 없음
- ❌ 인보이스 발급 로직 없음
- ❌ 이메일 발송 로직 없음

#### 필요한 변경
- [ ] `invoices` 테이블 생성
- [ ] 인보이스 생성 로직 (결제 성공 시)
- [ ] 이메일 발송 로직
- [ ] PDF 생성 또는 링크 생성

### 4. 보증서 시스템 개선

#### 현재 상태
- ⚠️ `warranties.user_id` NOT NULL (비회원 불가)
- ❌ `warranties.status` 컬럼 없음
- ❌ `warranties.order_item_id` 연결 없음
- ❌ `warranties.stock_unit_id` 연결 없음
- ❌ `warranties.activated_at` 없음
- ❌ `warranties.revoked_at` 없음

#### 필요한 변경
- [ ] `warranties.user_id` → `warranties.owner_user_id`로 변경 (NULL 허용)
- [ ] `warranties.status` 컬럼 추가 (issued_unassigned/issued/active/suspended/revoked/transferred)
- [ ] `warranties.order_item_id` 컬럼 추가 (FK)
- [ ] `warranties.stock_unit_id` 컬럼 추가 (FK)
- [ ] `warranties.activated_at` 컬럼 추가
- [ ] `warranties.revoked_at` 컬럼 추가
- [ ] `warranties.issued_at` 컬럼 추가 (기존 `created_at`과 분리)

### 5. 토큰 시스템 개선

#### 현재 상태
- ⚠️ `token_master.status` 컬럼 없음
- ❌ `token_master.stock_unit_id` 연결 없음
- ❌ `token_master.revoked_at` 없음

#### 필요한 변경
- [ ] `token_master.status` 컬럼 추가 (unused/reserved/active/revoked)
- [ ] `token_master.stock_unit_id` 컬럼 추가 (FK)
- [ ] `token_master.revoked_at` 컬럼 추가

### 6. 양도 시스템

#### 현재 상태
- ❌ `warranty_transfers` 테이블 없음
- ❌ 양도 로직 없음

#### 필요한 변경
- [ ] `warranty_transfers` 테이블 생성
- [ ] 양도 요청/수락 로직 구현

### 7. 환불 시스템

#### 현재 상태
- ⚠️ `orders.status`에 refunded는 있음
- ❌ `refunds` 테이블 없음
- ❌ 환불 시 토큰/보증서 무효화 로직 없음
- ❌ credit_note (환불 확인서) 발급 없음

#### 필요한 변경
- [ ] `refunds` 테이블 생성 (선택, 운영 편의)
- [ ] 환불 시 `token_master.status = revoked` 처리
- [ ] 환불 시 `warranties.status = revoked` 처리
- [ ] credit_note 발급 로직

### 8. 배송 관리

#### 현재 상태
- ⚠️ `orders` 테이블에 배송 정보는 있음
- ❌ `shipments` 테이블 없음 (부분 배송 불가)

#### 필요한 변경
- [ ] `shipments` 테이블 생성 (선택, 부분 배송 필요 시)

---

## 📋 구현 우선순위 및 단계별 계획

### Phase 1: 비회원 주문 기반 구축 (최우선)

#### 1.1 DB 스키마 변경
- [ ] `orders.user_id` NULL 허용 확인 및 변경
- [ ] `orders.guest_id` 컬럼 추가
- [ ] `guest_orders` 테이블 생성
- [ ] `guest_order_access` 테이블 생성
- [ ] `orders_idempotency` 테이블 수정 (guest_id 지원)

#### 1.2 백엔드 로직 변경
- [ ] 주문 생성 API: `authenticateToken` → `optionalAuth`
- [ ] 비회원 주문 생성 로직 (guest_id 발급)
- [ ] 비회원 주문 조회 API (토큰 기반)
- [ ] 비회원 주문 연동(Claim) API

#### 1.3 프론트엔드 변경
- [ ] `checkout.html`: 비회원 주문 지원
- [ ] `checkout-script.js`: 로그인 체크 제거
- [ ] 비회원 주문 상세 페이지 생성

### Phase 2: 재고 관리 시스템 구축

#### 2.1 DB 스키마
- [ ] `stock_units` 테이블 생성
- [ ] `order_items.stock_unit_id` 컬럼 추가
- [ ] `token_master.stock_unit_id` 컬럼 추가

#### 2.2 백엔드 로직
- [ ] 재고 등록 API (xlsx 업로드)
- [ ] 재고 배정 로직 (결제 성공 시)
- [ ] 재고 상태 관리 (in_stock/reserved/shipped 등)

### Phase 3: 디지털 인보이스 시스템

#### 3.1 DB 스키마
- [ ] `invoices` 테이블 생성

#### 3.2 백엔드 로직
- [ ] 인보이스 생성 로직 (결제 성공 시)
- [ ] 이메일 발송 로직
- [ ] PDF 생성 또는 링크 생성

### Phase 4: 보증서 시스템 개선

#### 4.1 DB 스키마
- [ ] `warranties` 테이블 마이그레이션
  - `user_id` → `owner_user_id` (NULL 허용)
  - `status` 컬럼 추가
  - `order_item_id`, `stock_unit_id` 추가
  - `activated_at`, `revoked_at`, `issued_at` 추가

#### 4.2 백엔드 로직
- [ ] 보증서 생성 로직 개선 (결제 성공 시)
- [ ] 보증서 활성화 로직 (QR 스캔 또는 수동 활성화)
- [ ] 보증서 상태 관리

### Phase 5: 양도 시스템

#### 5.1 DB 스키마
- [ ] `warranty_transfers` 테이블 생성

#### 5.2 백엔드 로직
- [ ] 양도 요청 API
- [ ] 양도 수락 API

### Phase 6: 환불 시스템

#### 6.1 DB 스키마
- [ ] `refunds` 테이블 생성 (선택)
- [ ] `invoices` 테이블에 credit_note 지원

#### 6.2 백엔드 로직
- [ ] 환불 처리 로직 (토큰/보증서 무효화)
- [ ] credit_note 발급 로직

---

## ⚠️ 주요 마이그레이션 주의사항

### 1. `warranties` 테이블 마이그레이션
- 기존 데이터가 있는 경우:
  - `user_id` → `owner_user_id`로 컬럼명 변경
  - 기존 `user_id` 값 유지
  - `status` 컬럼 추가 후 기존 데이터는 `active` 또는 `issued`로 설정
  - `order_item_id`, `stock_unit_id`는 NULL로 시작 (기존 데이터)

### 2. `orders` 테이블 마이그레이션
- `user_id` NULL 허용 확인 필요
- `guest_id` 컬럼 추가 (NULL 허용)
- 기존 주문은 모두 회원 주문으로 간주 (guest_id = NULL)

### 3. `token_master` 테이블 마이그레이션
- `status` 컬럼 추가
- 기존 데이터는 `active` 또는 `unused`로 설정
- `stock_unit_id` 컬럼 추가 (NULL 허용, 기존 데이터는 NULL)

---

## 🔍 확인 필요 사항

### 즉시 확인 필요
1. [ ] `orders.user_id` 컬럼이 NULL 허용인지 확인
2. [ ] 기존 `warranties` 테이블에 데이터가 있는지 확인
3. [ ] 기존 `token_master` 테이블에 데이터가 있는지 확인
4. [ ] 현재 인보이스 발급 시스템이 있는지 확인

### 추가 검토 필요
1. [ ] 기존 주문 데이터 마이그레이션 전략
2. [ ] 기존 보증서 데이터 마이그레이션 전략
3. [ ] 기존 토큰 데이터 마이그레이션 전략

---

## 📝 다음 단계

1. **현재 DB 스키마 확인**: 실제 테이블 구조 확인
2. **마이그레이션 스크립트 작성**: 단계별 마이그레이션 스크립트
3. **백엔드 API 구현**: 단계별 API 구현
4. **프론트엔드 구현**: 단계별 UI 구현
5. **테스트**: 각 단계별 테스트







