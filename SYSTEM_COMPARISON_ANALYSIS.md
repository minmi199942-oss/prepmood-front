# 현재 시스템 vs 제시된 설계 비교 분석

**최종 업데이트**: 2026-01-16  
**기준 문서**: 
- `SYSTEM_FLOW_DETAILED.md` (시스템 흐름 SSOT)
- `FINAL_EXECUTION_SPEC_REVIEW.md` (실행 스펙 SSOT)
- `WORK_STATUS_SUMMARY.md` (현재 작업 상태)
- `SYSTEM_FLOW_IMPLEMENTATION_CHECK.md` (구현 상태 검증)

**DB 구조 기준**: `backend/scripts/db_structure_actual.txt`

**현재 구현 상태**: 약 70% 완료 (DB 스키마 대부분 완료, 백엔드/프론트엔드 부분 완료)

---

## 📊 현재 시스템 구조 (실제 DB 구조 기준)

### ✅ 존재하는 테이블 및 컬럼

#### 1. `users` 테이블
- `user_id` (PK)
- `email`, `password_hash`
- `name` (단일 필드, `last_name`/`first_name` 아님)
- `phone` (필수)
- `membership_id` (외부 노출용, `PM.{년도}.{랜덤6자}`)
- ✅ 회원 정보 저장 가능

#### 2. `orders` 테이블
- `order_id` (PK)
- `user_id` (FK, **NULL 허용** - 비회원 주문 지원)
- ✅ **`guest_id` 컬럼 존재** (`varchar(20)`, NULL 허용, 비회원 주문 ID)
- `order_number` (UNIQUE)
- `status` (pending/confirmed/processing/shipped/delivered/cancelled/refunded)
- `total_price`
- ✅ **`paid_at` 컬럼 존재** (결제 완료 시점, 캐시/파생 필드)
- `shipping_name` (단일 필드)
- `shipping_email`, `shipping_phone`
- `shipping_address`, `shipping_city`, `shipping_postal_code`, `shipping_country`
- `shipping_method`, `shipping_cost`
- `estimated_delivery`

#### 3. `order_items` 테이블
- `order_item_id` (PK)
- `order_id` (FK)
- `product_id` (FK)
- `product_name`, `product_image`
- `size`, `color` (표준화된 색상값 사용)
- `quantity`, `unit_price`, `subtotal`
- ⚠️ **`stock_unit_id` 컬럼 없음** (재고는 `order_item_units`를 통해 연결)

#### 4. `order_item_units` 테이블 ✅ **존재함**
- `order_item_unit_id` (PK)
- `order_item_id` (FK)
- `order_id` (FK)
- `unit_seq` (같은 order_item_id 내 순서)
- `stock_unit_id` (FK, 재고 단위 연결)
- `token_pk` (FK, token_master 참조)
- `unit_status` (reserved/shipped/delivered/refunded)
- `carrier_code`, `tracking_number`
- `shipped_at`, `delivered_at`
- `current_shipment_id` (FK, shipments 참조)
- `active_lock` (GENERATED COLUMN, 이중 판매 방지)

#### 5. `warranties` 테이블 ✅ **대부분 구현됨**
- `id` (PK)
- ✅ **`owner_user_id` 컬럼 존재** (FK, **NULL 허용** - 비회원 지원)
- ✅ **`status` 컬럼 존재** (issued_unassigned/issued/active/suspended/revoked)
- ✅ **`token_pk` 컬럼 존재** (FK, token_master.token_pk 참조)
- `token` (DEPRECATED, backward compatibility용)
- `public_id` (UNIQUE, UUID)
- `product_name`
- ✅ **`source_order_item_unit_id` 컬럼 존재** (FK, order_item_units 참조)
- ✅ **`activated_at` 컬럼 존재**
- ✅ **`revoked_at` 컬럼 존재**
- ✅ **`active_key` 컬럼 존재** (GENERATED COLUMN, 유효 보증서 키)
- `verified_at`, `created_at`
- `deleted_at`, `deleted_by`, `delete_reason` (soft delete)

#### 6. `token_master` 테이블 ✅ **개선됨**
- ✅ **`token_pk` 컬럼 존재** (PK, AUTO_INCREMENT)
- `token` (UNIQUE, 외부 노출용)
- `internal_code`
- `product_name`
- `product_id` (FK, admin_products 참조)
- `is_blocked`
- `owner_user_id` (NULL 허용)
- `scan_count`
- `first_scanned_at`, `last_scanned_at`
- `created_at`, `updated_at`
- ⚠️ **`status` 컬럼 없음** (재고 상태는 `stock_units.status`에서 관리)

#### 7. `stock_units` 테이블 ✅ **존재함**
- `stock_unit_id` (PK)
- `product_id` (FK)
- `size`, `color` (표준화된 색상값)
- `token_pk` (FK, UNIQUE)
- `status` (in_stock/reserved/sold/returned)
- `reserved_at`, `reserved_by_order_id`
- `sold_at`
- `created_at`, `updated_at`

#### 8. `invoices` 테이블 ✅ **존재함**
- `invoice_id` (PK)
- `order_id` (FK)
- `invoice_number` (UNIQUE)
- `type` (invoice/credit_note)
- `status` (issued/void/refunded)
- `total_amount`, `tax_amount`, `net_amount`
- `billing_name`, `billing_email`, `billing_phone`, `billing_address_json`
- `shipping_name`, `shipping_email`, `shipping_phone`, `shipping_address_json`
- `payload_json` (스냅샷)
- `order_snapshot_hash`
- `related_invoice_id` (FK, credit_note가 취소하는 invoice_id)
- `issued_at`, `emailed_at`, `voided_at`

#### 9. `warranty_transfers` 테이블 ✅ **존재함**
- `transfer_id` (PK)
- `warranty_id` (FK)
- `from_user_id` (FK)
- `to_email`
- `to_user_id` (FK, NULL 허용)
- `transfer_code` (UNIQUE, 랜덤 7자)
- `status` (requested/accepted/completed/cancelled/expired)
- `expires_at` (72시간)
- `requested_at`, `accepted_at`, `completed_at`, `cancelled_at`

#### 10. `guest_order_access_tokens` 테이블 ✅ **존재함**
- `token_id` (PK)
- `order_id` (FK)
- `token` (UNIQUE, 90일 유효)
- `expires_at`
- `revoked_at`

#### 11. `claim_tokens` 테이블 ✅ **존재함**
- `token_id` (PK)
- `order_id` (FK)
- `token` (UNIQUE, 15분 유효)
- `expires_at`
- `used_at` (1회성)

#### 12. `shipments` 테이블 ✅ **존재함**
- `shipment_id` (PK)
- `order_id` (FK)
- `carrier_code` (FK, carriers 참조)
- `tracking_number`
- `active_key` (GENERATED COLUMN, 유효 송장 키)
- `shipped_at`
- `created_by_admin_id`
- `voided_at`, `void_reason`

#### 13. `shipment_units` 테이블 ✅ **존재함**
- `shipment_id` (FK, 복합키)
- `order_item_unit_id` (FK, 복합키)
- `created_at`

#### 14. `paid_events` 테이블 ✅ **존재함**
- `event_id` (PK)
- `order_id` (FK)
- `payment_key` (UNIQUE)
- `event_source` (webhook/redirect/manual_verify)
- `amount`, `currency`
- `raw_payload_json`
- `confirmed_at`
- `created_at`
- ✅ **UNIQUE(order_id, payment_key) 제약** (멱등성 보장)

#### 15. `paid_event_processing` 테이블 ✅ **존재함**
- `event_id` (PK, FK)
- `status` (pending/processing/success/failed)
- `last_error`
- `processed_at`
- `retry_count`

#### 16. `warranty_events` 테이블 ✅ **존재함**
- `event_id` (PK)
- `warranty_id` (FK)
- `event_type` (status_change/owner_change/suspend/unsuspend/revoke)
- `old_value` (JSON)
- `new_value` (JSON)
- `changed_by` (user/admin/system)
- `changed_by_id`
- `reason`
- `created_at`

#### 17. `orders_idempotency` 테이블 ✅ **개선됨**
- `id` (PK)
- `user_id` (NOT NULL - ⚠️ 비회원 지원을 위해 NULL 허용 필요할 수 있음)
- ✅ **`owner_key` 컬럼 존재** (`varchar(100)`, NOT NULL, `u:{user_id}` 또는 `g:{guest_id}` 형식)
- `idem_key`
- `order_number` (FK)
- ✅ **UNIQUE(owner_key, idem_key) 제약** 존재

### ✅ 구현된 기능

1. ✅ **재고 배정 시스템** - `stock_units` 테이블 존재, `processPaidOrder()` 구현됨
2. ✅ **디지털 인보이스 발급** - `invoices` 테이블 존재, 생성 로직 구현됨
3. ✅ **보증서 상태 관리** - `warranties.status` 컬럼 존재, 상태 전이 로직 구현됨
4. ✅ **환불 처리 API** - `POST /api/admin/refunds/process` 구현됨, 프론트엔드 UI 구현됨
5. ✅ **보증서 정지/정지 해제** - 관리자 페이지에서 구현됨
6. ✅ **보증서 관리 페이지** - 기본 기능 및 1단계 필수 기능 완료

### ⚠️ 부분 구현 또는 미완성 기능

1. ⚠️ **비회원 주문 생성** - DB 스키마 완료, 백엔드/프론트엔드 로직 미완성
2. ⚠️ **비회원 주문 조회** - `guest_order_access_tokens` 테이블 존재, API 미완성
3. ⚠️ **Claim (비회원 → 회원 전환)** - DB 스키마 완료, 백엔드 API 일부 구현됨
4. ⚠️ **보증서 활성화 API** - `POST /api/warranties/:id/activate` 미완성
5. ⚠️ **QR 스캔 로직 수정** - warranty 생성 제거, 조회만 수행하도록 수정 필요
6. ⚠️ **양도 시스템** - DB 스키마 완료, 백엔드 API 미완성
7. ⚠️ **재고 등록 API** - `POST /api/admin/stock/import` 미완성
8. ⚠️ **인보이스 이메일 발송** - MailerSend 연동 미완성
9. ⚠️ **인보이스 PDF 생성** - 미완성

---

## 🔄 제시된 설계와의 차이점

### 1. 비회원 주문 지원

#### 현재 상태
- ✅ `orders.user_id` NULL 허용 (비회원 주문 지원)
- ✅ `orders.guest_id` 컬럼 존재
- ✅ `guest_order_access_tokens` 테이블 존재
- ✅ `claim_tokens` 테이블 존재
- ✅ `orders_idempotency.owner_key` 컬럼 존재
- ✅ `orders_idempotency` UNIQUE(owner_key, idem_key) 제약 존재

#### 필요한 변경
- ✅ `orders_idempotency.owner_key` 컬럼 존재 (변경 불필요)
- [ ] 비회원 주문 생성 API 구현 (`POST /api/orders`, `optionalAuth` 미들웨어)
- [ ] 비회원 주문 조회 API 구현 (`GET /api/guest/orders/:orderNumber`)
- [ ] Claim API 완성 (`POST /api/orders/:orderId/claim`)
- [ ] 프론트엔드: 비회원 주문 지원 (체크아웃, 주문 상세)

### 2. 재고 관리 시스템

#### 현재 상태
- ✅ `stock_units` 테이블 존재
- ✅ `order_item_units` 테이블 존재 (재고 연결)
- ✅ 재고 배정 로직 구현됨 (`processPaidOrder()`)
- ⚠️ 재고 등록 API 미완성

#### 필요한 변경
- [ ] 재고 등록 API 구현 (`POST /api/admin/stock/import`, xlsx 업로드)
- [ ] 재고 상태 관리 API (필요 시)

### 3. 디지털 인보이스 시스템

#### 현재 상태
- ✅ `invoices` 테이블 존재
- ✅ 인보이스 생성 로직 구현됨 (`processPaidOrder()`)
- ⚠️ 이메일 발송 로직 미완성 (MailerSend 연동)
- ⚠️ PDF 생성 또는 링크 생성 미완성

#### 필요한 변경
- [ ] 이메일 발송 로직 구현 (MailerSend 연동)
- [ ] PDF 생성 또는 링크 생성

### 4. 보증서 시스템 개선

#### 현재 상태
- ✅ `warranties.owner_user_id` 컬럼 존재 (NULL 허용)
- ✅ `warranties.status` 컬럼 존재
- ✅ `warranties.source_order_item_unit_id` 컬럼 존재
- ✅ `warranties.activated_at` 컬럼 존재
- ✅ `warranties.revoked_at` 컬럼 존재
- ✅ `warranties.active_key` 컬럼 존재
- ✅ 보증서 생성 로직 구현됨 (`processPaidOrder()`)
- ⚠️ 보증서 활성화 API 미완성

#### 필요한 변경
- [ ] 보증서 활성화 API 구현 (`POST /api/warranties/:id/activate`)
- [ ] QR 스캔 로직 수정 (warranty 생성 제거, 조회만 수행)

### 5. 토큰 시스템 개선

#### 현재 상태
- ✅ `token_master.token_pk` 컬럼 존재 (PK)
- ✅ `token` 컬럼 존재 (UNIQUE, 외부 노출용)
- ✅ `stock_units.token_pk` 연결 존재
- ⚠️ `token_master.status` 컬럼 없음 (재고 상태는 `stock_units.status`에서 관리)

#### 필요한 변경
- ⚠️ **설계 변경**: `token_master.status`는 불필요 (재고 상태는 `stock_units.status`에서 관리)

### 6. 양도 시스템

#### 현재 상태
- ✅ `warranty_transfers` 테이블 존재
- ⚠️ 양도 요청/수락 API 미완성

#### 필요한 변경
- [ ] 양도 요청 API 구현 (`POST /api/warranties/:id/transfer`)
- [ ] 양도 수락 API 구현 (`POST /api/warranty/transfer/accept`)
- [ ] 양도 취소 API 구현 (`POST /api/warranty/transfer/:transferId/cancel`)
- [ ] 양도 만료 배치 작업 (72시간 초과 요청 자동 만료)
- [ ] 양도 UI (프론트엔드)

### 7. 환불 시스템

#### 현재 상태
- ✅ `orders.status`에 refunded 존재
- ✅ 환불 처리 API 구현됨 (`POST /api/admin/refunds/process`)
- ✅ 환불 시 `warranties.status = revoked` 처리 구현됨
- ✅ credit_note 발급 로직 구현됨 (`invoices.type = 'credit_note'`)
- ✅ 환불 처리 UI 구현됨 (관리자 페이지)

#### 필요한 변경
- ✅ **완료**: 환불 시스템은 대부분 구현됨

### 8. 배송 관리

#### 현재 상태
- ✅ `shipments` 테이블 존재
- ✅ `shipment_units` 테이블 존재
- ✅ `order_item_units.current_shipment_id` 컬럼 존재
- ⚠️ 송장 생성/관리 API 미완성

#### 필요한 변경
- [ ] 송장 생성 API 구현
- [ ] 송장 교체/재발송 로직 구현
- [ ] 배송 완료 처리 API

---

## 📋 구현 우선순위 및 단계별 계획

### ✅ Phase 1: 핵심 인프라 (완료)

#### 1.1 DB 스키마 ✅
- ✅ `orders.guest_id` 컬럼 추가
- ✅ `warranties.status` 컬럼 추가
- ✅ `warranties.owner_user_id` 컬럼 추가 (NULL 허용)
- ✅ `warranties.source_order_item_unit_id` 컬럼 추가
- ✅ `warranties.token_pk` 컬럼 추가
- ✅ `warranties.activated_at`, `revoked_at`, `active_key` 컬럼 추가
- ✅ `stock_units` 테이블 생성
- ✅ `order_item_units` 테이블 생성
- ✅ `invoices` 테이블 생성
- ✅ `paid_events` 테이블 생성
- ✅ `warranty_transfers` 테이블 생성
- ✅ `guest_order_access_tokens` 테이블 생성
- ✅ `claim_tokens` 테이블 생성
- ✅ `shipments`, `shipment_units` 테이블 생성
- ✅ `warranty_events` 테이블 생성
- ✅ `token_master.token_pk` 컬럼 추가

#### 1.2 백엔드 로직 ✅
- ✅ `processPaidOrder()` 함수 구현
- ✅ 재고 배정 로직 구현
- ✅ `order_item_units` 생성 로직 구현
- ✅ `warranties` 생성 로직 구현 (회원/비회원 구분)
- ✅ 인보이스 생성 로직 구현
- ✅ 재판매 처리 로직 구현 (`revoked → issued` 전이)

### ⚠️ Phase 2: 비회원 주문 기반 구축 (부분 완료)

#### 2.1 DB 스키마 ✅
- ✅ `orders.user_id` NULL 허용
- ✅ `orders.guest_id` 컬럼 존재
- ✅ `guest_order_access_tokens` 테이블 존재
- ✅ `claim_tokens` 테이블 존재
- ⚠️ `orders_idempotency.owner_key` 방식으로 변경 필요

#### 2.2 백엔드 로직 ⚠️
- ⚠️ 주문 생성 API: `optionalAuth` 미들웨어 추가 필요
- ⚠️ 비회원 주문 생성 로직 구현 필요
- ⚠️ 비회원 주문 조회 API 구현 필요
- ⚠️ Claim API 완성 필요 (`POST /api/orders/:orderId/claim`)

#### 2.3 프론트엔드 ⚠️
- ⚠️ `checkout.html`: 비회원 주문 지원
- ⚠️ `checkout-script.js`: 로그인 체크 제거 또는 optional 처리
- ⚠️ 비회원 주문 상세 페이지 생성

### ⚠️ Phase 3: 재고 관리 시스템 (부분 완료)

#### 3.1 DB 스키마 ✅
- ✅ `stock_units` 테이블 존재
- ✅ `order_item_units` 테이블 존재 (재고 연결)
- ✅ 재고 배정 로직 구현됨

#### 3.2 백엔드 로직 ⚠️
- ⚠️ 재고 등록 API 구현 필요 (`POST /api/admin/stock/import`, xlsx 업로드)
- ✅ 재고 배정 로직 구현됨 (`processPaidOrder()`)
- ✅ 재고 상태 관리 (in_stock/reserved/sold/returned)

### ⚠️ Phase 4: 디지털 인보이스 시스템 (부분 완료)

#### 4.1 DB 스키마 ✅
- ✅ `invoices` 테이블 존재
- ✅ credit_note 지원 (`type` 컬럼)

#### 4.2 백엔드 로직 ⚠️
- ✅ 인보이스 생성 로직 구현됨 (`processPaidOrder()`)
- ⚠️ 이메일 발송 로직 구현 필요 (MailerSend 연동)
- ⚠️ PDF 생성 또는 링크 생성 필요

### ⚠️ Phase 5: 보증서 시스템 개선 (부분 완료)

#### 5.1 DB 스키마 ✅
- ✅ 모든 필요한 컬럼 존재

#### 5.2 백엔드 로직 ⚠️
- ✅ 보증서 생성 로직 구현됨 (`processPaidOrder()`)
- ⚠️ 보증서 활성화 API 구현 필요 (`POST /api/warranties/:id/activate`)
- ⚠️ QR 스캔 로직 수정 필요 (warranty 생성 제거, 조회만 수행)
- ✅ 보증서 상태 관리 구현됨 (정지/정지 해제)

### ⚠️ Phase 6: 양도 시스템 (DB 완료, API 미완성)

#### 6.1 DB 스키마 ✅
- ✅ `warranty_transfers` 테이블 존재

#### 6.2 백엔드 로직 ⚠️
- ⚠️ 양도 요청 API 구현 필요 (`POST /api/warranties/:id/transfer`)
- ⚠️ 양도 수락 API 구현 필요 (`POST /api/warranty/transfer/accept`)
- ⚠️ 양도 취소 API 구현 필요
- ⚠️ 양도 만료 배치 작업 필요

#### 6.3 프론트엔드 ⚠️
- ⚠️ 양도 UI 구현 필요

### ✅ Phase 7: 환불 시스템 (완료)

#### 7.1 DB 스키마 ✅
- ✅ `invoices` 테이블에 credit_note 지원

#### 7.2 백엔드 로직 ✅
- ✅ 환불 처리 API 구현됨 (`POST /api/admin/refunds/process`)
- ✅ 환불 시 `warranties.status = revoked` 처리 구현됨
- ✅ credit_note 발급 로직 구현됨

#### 7.3 프론트엔드 ✅
- ✅ 환불 처리 UI 구현됨 (관리자 페이지)

---

## ⚠️ 주요 마이그레이션 주의사항

### 1. `warranties` 테이블 마이그레이션 ✅ **완료**
- ✅ `owner_user_id` 컬럼 존재 (NULL 허용)
- ✅ `status` 컬럼 존재
- ✅ `source_order_item_unit_id` 컬럼 존재
- ✅ `activated_at`, `revoked_at`, `active_key` 컬럼 존재
- ✅ `token_pk` 컬럼 존재

### 2. `orders` 테이블 마이그레이션 ✅ **완료**
- ✅ `user_id` NULL 허용
- ✅ `guest_id` 컬럼 존재
- ✅ `paid_at` 컬럼 존재

### 3. `token_master` 테이블 마이그레이션 ✅ **완료**
- ✅ `token_pk` 컬럼 존재 (PK)
- ✅ `token` 컬럼 존재 (UNIQUE)

### 4. `orders_idempotency` 테이블 마이그레이션 ✅ **완료**
- ✅ `owner_key` 컬럼 존재
- ✅ UNIQUE(owner_key, idem_key) 제약 존재

---

## 🔍 확인 필요 사항

### ✅ 확인 완료
1. ✅ `orders.user_id` 컬럼이 NULL 허용 (비회원 주문 지원)
2. ✅ `orders.guest_id` 컬럼 존재
3. ✅ `warranties.status` 컬럼 존재
4. ✅ `warranties.owner_user_id` 컬럼 존재 (NULL 허용)
5. ✅ `stock_units` 테이블 존재
6. ✅ `order_item_units` 테이블 존재
7. ✅ `invoices` 테이블 존재
8. ✅ `paid_events` 테이블 존재
9. ✅ `warranty_transfers` 테이블 존재
10. ✅ `guest_order_access_tokens` 테이블 존재
11. ✅ `claim_tokens` 테이블 존재
12. ✅ `shipments`, `shipment_units` 테이블 존재
13. ✅ `warranty_events` 테이블 존재
14. ✅ `token_master.token_pk` 컬럼 존재

### ✅ 추가 확인 완료
1. ✅ `orders_idempotency.owner_key` 컬럼 존재 확인
2. ✅ 기존 주문 데이터 마이그레이션 완료 (모든 주문은 회원 주문으로 간주)
3. ✅ 기존 보증서 데이터 마이그레이션 완료

---

## 📝 다음 단계 (우선순위별)

### 🔴 최우선 (즉시)
1. **비회원 주문 기반 구축** (Phase 2)
   - ✅ `orders_idempotency.owner_key` 컬럼 존재 (변경 불필요)
   - [ ] 비회원 주문 생성 API 구현 (`POST /api/orders`, `optionalAuth` 미들웨어)
   - [ ] 비회원 주문 조회 API 구현 (`GET /api/guest/orders/:orderNumber`)
   - [ ] Claim API 완성 (`POST /api/orders/:orderId/claim`)
   - [ ] 프론트엔드: 비회원 주문 지원 (체크아웃, 주문 상세)

### 🟡 높음 (단기)
2. **보증서 활성화 API** (Phase 5)
   - `POST /api/warranties/:id/activate` 구현
   - QR 스캔 로직 수정 (warranty 생성 제거)

3. **양도 시스템** (Phase 6)
   - 양도 요청/수락 API 구현
   - 양도 UI 구현

### 🟢 중간 (중기)
4. **재고 등록 API** (Phase 3)
   - `POST /api/admin/stock/import` 구현

5. **인보이스 이메일/PDF** (Phase 4)
   - MailerSend 연동
   - PDF 생성 또는 링크 생성

### ⚪ 낮음 (장기)
6. **송장 관리 API** (Phase 8)
   - 송장 생성/교체/재발송 로직
   - 배송 완료 처리

---

## 📊 현재 구현 상태 요약

### ✅ 완료된 부분 (약 70%)
- **DB 스키마**: 대부분 완료 (Phase 1, 2, 3, 4, 5, 6, 7의 DB 부분)
- **핵심 로직**: `processPaidOrder()`, 재고 배정, 보증서 생성, 인보이스 생성
- **환불 시스템**: 완전 구현 (백엔드 + 프론트엔드)
- **보증서 관리 페이지**: 기본 기능 및 1단계 필수 기능 완료

### ⚠️ 부분 완료 (약 20%)
- **비회원 주문**: DB 완료, 백엔드/프론트엔드 미완성
- **보증서 활성화**: DB 완료, API 미완성
- **양도 시스템**: DB 완료, API/UI 미완성
- **인보이스 이메일/PDF**: 생성 로직 완료, 발송/PDF 미완성

### ❌ 미완성 (약 10%)
- **재고 등록 API**: xlsx 업로드 기능
- **송장 관리 API**: 생성/교체/재발송 로직

---

## 🎯 핵심 정리

**현재 시스템은 설계 스펙의 대부분을 준수하고 있으며, DB 스키마는 거의 완료되었습니다.**

**남은 작업은 주로 백엔드 API와 프론트엔드 UI 구현입니다.**

**우선순위**:
1. 비회원 주문 기반 구축 (전체 시스템의 기반)
2. 보증서 활성화 API (핵심 방어 메커니즘)
3. 양도 시스템 (사용자 기능)
4. 부가 기능 (재고 등록, 인보이스 이메일/PDF, 송장 관리)







