# Pre.pMood 데이터베이스 스키마 전체 구조

## 📊 테이블 목록 (카테고리별)

### 1. 사용자 관리
- `users` - 사용자 정보

### 2. 상품/재고 관리
- `admin_products` - 상품 정보
- `stock_units` - 재고 단위 (물리적 재고)
- `color_standards` - 색상 표준값 (LOOKUP 테이블)

### 3. 주문 관리
- `orders` - 주문 정보
- `order_items` - 주문 상품 (수량 단위)
- `order_item_units` - 주문 상품 단위 (출고/배송 단위)

### 4. 토큰/보증서 관리
- `token_master` - 토큰 마스터 (모든 토큰 정보)
- `warranties` - 디지털 보증서
- `transfer_logs` - 보증서 양도 로그
- `scan_logs` - QR 스캔 로그
- `warranty_events` - 보증서 이벤트 로그

### 5. 결제/인보이스
- `payments` - 결제 정보
- `invoices` - 디지털 인보이스
- `paid_events` - 결제 이벤트 로그
- `paid_event_processing` - 결제 이벤트 처리 상태

### 6. 문의 관리
- `inquiries` - 고객 문의
- `inquiry_replies` - 문의 답변

### 7. 물류 관리
- `carriers` - 택배사 정보 (LOOKUP 테이블)
- `order_stock_issues` - 주문/재고 이슈 로그

### 8. 기타
- `guest_order_access_tokens` - 비회원 주문 접근 토큰
- `claim_tokens` - 클레임 토큰
- `orders_idempotency` - 주문 중복 방지

---

## 📋 테이블 상세 구조

### 1. users (사용자)
**목적**: 회원 및 관리자 사용자 정보

**주요 컬럼**:
- `user_id` INT PRIMARY KEY AUTO_INCREMENT
- `email` VARCHAR(255) UNIQUE NOT NULL
- `name` VARCHAR(100)
- `membership_id` VARCHAR(50) UNIQUE (회원번호)
- `created_at`, `updated_at` DATETIME

**관계**:
- `orders.user_id` → `users.user_id`
- `warranties.user_id` → `users.user_id`
- `token_master.owner_user_id` → `users.user_id`

---

### 2. admin_products (상품 정보)
**목적**: 판매 상품 정보

**주요 컬럼**:
- `id` VARCHAR(50) PRIMARY KEY (예: `PM-25-SH-Teneu-Solid-LB-S/M/L`)
- `name` VARCHAR(255) NOT NULL (예: "테뉴 솔리드 셔츠")
- `short_name` VARCHAR(100) UNIQUE NULL (xlsx 매칭용, 예: "SH Teneu Solid")
- `price` INT NOT NULL
- `image` VARCHAR(500) NULL
- `collection_year` INT NOT NULL DEFAULT 2026
- `category` VARCHAR(100) NOT NULL (`'tops'`, `'bottoms'`, `'outer'`, `'bags'`, `'accessories'`)
- `type` VARCHAR(100) NULL (액세서리만 필수: `'cap'`, `'wallet'`, `'tie'`, `'scarf'`, `'belt'`)
- `description` TEXT NULL
- `created_at`, `updated_at` DATETIME

**인덱스**:
- `idx_collection_year`, `idx_collection_category`, `idx_collection_category_type`
- `uk_admin_products_short_name` (UNIQUE)

**관계**:
- `stock_units.product_id` → `admin_products.id`

---

### 3. stock_units (재고 단위)
**목적**: 물리적 재고 관리 (물류 관점)

**주요 컬럼**:
- `stock_unit_id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `product_id` VARCHAR(50) NOT NULL → `admin_products.id`
- `token_pk` INT NOT NULL → `token_master.token_pk`
- `size` VARCHAR(10) NULL (`'S'`, `'M'`, `'L'`, `'XL'`, `'XXL'`, `'F'`)
- `color` VARCHAR(50) NULL → `color_standards.color_code`
- `status` ENUM(`'in_stock'`, `'reserved'`, `'sold'`, `'returned'`) NOT NULL DEFAULT `'in_stock'`
- `reserved_at` DATETIME NULL
- `reserved_by_order_id` INT NULL → `orders.order_id`
- `sold_at` DATETIME NULL
- `created_at`, `updated_at` DATETIME

**인덱스**:
- `idx_product_id`, `idx_status`, `idx_token_pk`, `idx_reserved_by_order_id`
- `idx_stock_units_product_status_size_color` (복합 인덱스, 재고 배정용)

**관계**:
- `order_item_units.stock_unit_id` → `stock_units.stock_unit_id`

**특징**:
- 1 stock_unit = 1 물리적 상품 = 1 token
- 사이즈/색상별 재고 관리
- 상태별 재고 추적 (재고 있음 → 예약 → 판매)

---

### 4. token_master (토큰 마스터)
**목적**: 모든 토큰의 중앙 집중 관리 (SSOT)

**주요 컬럼**:
- `token_pk` INT PRIMARY KEY AUTO_INCREMENT
- `token` VARCHAR(20) UNIQUE NOT NULL (QR 코드용 토큰)
- `internal_code` VARCHAR(100) NOT NULL (내부 코드)
- `product_id` VARCHAR(50) NULL → `admin_products.id`
- `product_name` VARCHAR(255) NOT NULL
- `serial_number` VARCHAR(100) NULL
- `rot_code` VARCHAR(100) NULL
- `warranty_bottom_code` VARCHAR(100) NULL
- `digital_warranty_code` VARCHAR(100) NULL
- `owner_user_id` INT NULL → `users.user_id`
- `owner_warranty_public_id` CHAR(36) NULL → `warranties.public_id`
- `is_blocked` TINYINT(1) DEFAULT 0
- `scan_count` INT DEFAULT 0
- `first_scanned_at`, `last_scanned_at` DATETIME NULL
- `created_at`, `updated_at` DATETIME

**인덱스**:
- `idx_internal_code`, `idx_is_blocked`, `idx_owner_user_id`
- `idx_serial_number`, `idx_rot_code`, `idx_warranty_bottom_code`

**관계**:
- `stock_units.token_pk` → `token_master.token_pk`
- `order_item_units.token_pk` → `token_master.token_pk`
- `warranties.token_pk` → `token_master.token_pk`

**특징**:
- 1 token = 1 물리적 상품 (영구 고유 식별자)
- 양도/차단 등 토큰 상태 관리

---

### 5. orders (주문)
**목적**: 주문 정보

**주요 컬럼**:
- `order_id` INT PRIMARY KEY AUTO_INCREMENT
- `order_number` VARCHAR(32) UNIQUE NOT NULL
- `user_id` INT NULL → `users.user_id` (비회원 주문 허용)
- `guest_id` VARCHAR(50) NULL (비회원 식별자)
- `status` ENUM(`'pending'`, `'paid'`, `'shipping'`, `'delivered'`, `'cancelled'`)
- `total_amount` DECIMAL(12,2) NOT NULL
- `shipping_name`, `shipping_email`, `shipping_phone` VARCHAR
- `shipping_address_json` JSON
- `paid_at` DATETIME NULL
- `created_at`, `updated_at` DATETIME

**인덱스**:
- `idx_user_id`, `idx_order_number`, `idx_status`

**관계**:
- `order_items.order_id` → `orders.order_id`
- `payments.order_number` → `orders.order_number`
- `invoices.order_id` → `orders.order_id`

---

### 6. order_items (주문 상품)
**목적**: 주문에 포함된 상품 (수량 단위)

**주요 컬럼**:
- `order_item_id` INT PRIMARY KEY AUTO_INCREMENT
- `order_id` INT NOT NULL → `orders.order_id`
- `product_id` VARCHAR(50) NOT NULL → `admin_products.id`
- `product_name` VARCHAR(255) NOT NULL
- `size` VARCHAR(10) NULL
- `color` VARCHAR(50) NULL → `color_standards.color_code`
- `quantity` INT NOT NULL
- `price` DECIMAL(12,2) NOT NULL
- `created_at` DATETIME

**관계**:
- `order_item_units.order_item_id` → `order_items.order_item_id`

**특징**:
- 1 order_item = 1 상품 + 수량
- 예: "테뉴 솔리드 셔츠 - Light Blue - S × 2개"

---

### 7. order_item_units (주문 상품 단위)
**목적**: 출고/배송 단위 관리 (물류 관점)

**주요 컬럼**:
- `order_item_unit_id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `order_id` INT NOT NULL → `orders.order_id`
- `order_item_id` INT NOT NULL → `order_items.order_item_id`
- `unit_seq` INT NOT NULL (같은 order_item_id 내 순서)
- `stock_unit_id` BIGINT NULL → `stock_units.stock_unit_id`
- `token_pk` INT NOT NULL → `token_master.token_pk`
- `unit_status` ENUM(`'reserved'`, `'shipped'`, `'delivered'`, `'refunded'`) DEFAULT `'reserved'`
- `carrier_code` VARCHAR(20) NULL → `carriers.code`
- `tracking_number` VARCHAR(100) NULL
- `shipped_at` DATETIME NULL
- `delivered_at` DATETIME NULL
- `active_lock` INT GENERATED VIRTUAL (이중 판매 방지)
- `created_at`, `updated_at` DATETIME

**UNIQUE 제약**:
- `uk_order_item_unit_seq` (`order_item_id`, `unit_seq`)
- `uk_stock_unit_active` (`stock_unit_id`, `active_lock`) - 이중 판매 방지

**인덱스**:
- `idx_order_item_id`, `idx_order_id`, `idx_stock_unit_id`
- `idx_token_pk`, `idx_unit_status`, `idx_carrier_code`

**특징**:
- 1 order_item_unit = 1 물리적 상품 = 1 stock_unit
- 부분 출고/배송 지원 (예: 2개 주문 중 1개만 출고)
- 이중 판매 방지 (active_lock)

---

### 8. warranties (디지털 보증서)
**목적**: 디지털 보증서 정보

**주요 컬럼**:
- `id` INT PRIMARY KEY AUTO_INCREMENT
- `public_id` CHAR(36) UNIQUE NOT NULL (UUID)
- `user_id` INT NOT NULL → `users.user_id`
- `token_pk` INT NOT NULL → `token_master.token_pk`
- `status` ENUM(`'active'`, `'transferred'`, `'void'`, `'refunded'`)
- `activated_at` DATETIME NOT NULL
- `transferred_at`, `voided_at`, `refunded_at` DATETIME NULL
- `created_at`, `updated_at` DATETIME

**인덱스**:
- `idx_user_id`, `idx_token_pk`, `idx_public_id`, `idx_status`

**관계**:
- `token_master.owner_warranty_public_id` → `warranties.public_id`

**특징**:
- 1 warranty = 1 token = 1 소유자
- 보증서 양도/환불 추적

---

### 9. payments (결제)
**목적**: 결제 정보

**주요 컬럼**:
- `payment_id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `order_number` VARCHAR(32) NOT NULL → `orders.order_number`
- `gateway` VARCHAR(32) NOT NULL (예: `'toss'`, `'mock'`)
- `payment_key` VARCHAR(128) UNIQUE NOT NULL
- `status` ENUM(`'initiated'`, `'authorized'`, `'captured'`, `'failed'`, `'cancelled'`, `'refunded'`)
- `amount` DECIMAL(12,2) NOT NULL
- `currency` CHAR(3) DEFAULT `'KRW'`
- `failure_reason` VARCHAR(255) NULL
- `payload_json` JSON NULL
- `created_at`, `updated_at` DATETIME

**인덱스**:
- `uk_payment_key` (UNIQUE), `idx_payments_order`

---

### 10. invoices (디지털 인보이스)
**목적**: 디지털 인보이스 정보 (스냅샷 저장소)

**주요 컬럼**:
- `invoice_id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `order_id` INT NOT NULL → `orders.order_id`
- `invoice_number` VARCHAR(50) UNIQUE NOT NULL
- `type` ENUM(`'invoice'`, `'credit_note'`) DEFAULT `'invoice'`
- `status` ENUM(`'issued'`, `'void'`, `'refunded'`) DEFAULT `'issued'`
- `total_amount`, `tax_amount`, `net_amount` DECIMAL(12,2)
- `billing_name`, `billing_email`, `billing_phone` VARCHAR
- `billing_address_json` JSON
- `shipping_name`, `shipping_email`, `shipping_phone` VARCHAR
- `shipping_address_json` JSON
- `payload_json` JSON (전체 인보이스 데이터 스냅샷)
- `order_snapshot_hash` CHAR(64)
- `document_url` TEXT NULL (PDF 링크)
- `issued_at`, `emailed_at`, `voided_at` DATETIME
- `created_at`, `updated_at` DATETIME

**인덱스**:
- `idx_order_id`, `idx_invoice_number`, `idx_status`, `idx_issued_at`

---

### 11. carriers (택배사)
**목적**: 택배사 정보 LOOKUP 테이블

**주요 컬럼**:
- `code` VARCHAR(20) PRIMARY KEY (예: `'CJ'`, `'ILYANG'`, `'VALEX'`)
- `name` VARCHAR(100) NOT NULL (예: "CJ대한통운", "일양로지스")
- `name_en` VARCHAR(100) NULL
- `is_active` TINYINT(1) DEFAULT 1
- `tracking_url_template` VARCHAR(500) NULL
- `created_at`, `updated_at` DATETIME

**관계**:
- `order_item_units.carrier_code` → `carriers.code`

---

### 12. color_standards (색상 표준값)
**목적**: 색상 표준값 LOOKUP 테이블

**주요 컬럼**:
- `color_code` VARCHAR(50) PRIMARY KEY
- `display_name` VARCHAR(100) NOT NULL
- `is_active` TINYINT(1) DEFAULT 1
- `created_at`, `updated_at` DATETIME

**표준값**:
- `'Black'`, `'Navy'`, `'White'`, `'Grey'`
- `'Light Blue'`, `'Light Grey'`

**관계**:
- `stock_units.color` → `color_standards.color_code`
- `order_items.color` → `color_standards.color_code`

---

### 13. inquiries (고객 문의)
**주요 컬럼**:
- `id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `inquiry_number` VARCHAR(20) UNIQUE NULL
- `user_id` INT NULL → `users.user_id`
- `salutation`, `first_name`, `last_name`, `email`, `phone` VARCHAR
- `region`, `city`, `country_code` VARCHAR
- `category`, `topic` VARCHAR
- `message` TEXT
- `status` ENUM(`'new'`, `'in_progress'`, `'answered'`, `'closed'`)
- `admin_memo` TEXT NULL
- `created_at`, `updated_at` DATETIME

**관계**:
- `inquiry_replies.inquiry_id` → `inquiries.id`

---

### 14. inquiry_replies (문의 답변)
**주요 컬럼**:
- `id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `inquiry_id` BIGINT NOT NULL → `inquiries.id`
- `admin_user_id` INT NOT NULL → `users.user_id`
- `message` TEXT NOT NULL
- `email_status` ENUM(`'pending'`, `'sent'`, `'failed'`)
- `created_at` DATETIME

---

### 15. transfer_logs (보증서 양도 로그)
**주요 컬럼**:
- `id` INT PRIMARY KEY AUTO_INCREMENT
- `token` VARCHAR(20) NOT NULL
- `from_user_id`, `to_user_id` INT
- `admin_user_id` INT NULL
- `reason` TEXT NULL
- `created_at` DATETIME

---

### 16. scan_logs (QR 스캔 로그)
**주요 컬럼**:
- `id` INT PRIMARY KEY AUTO_INCREMENT
- `token` VARCHAR(20) NOT NULL
- `user_id` INT NULL
- `ip_address` VARCHAR(45)
- `user_agent` TEXT
- `scanned_at` DATETIME

---

### 17. paid_events (결제 이벤트)
**주요 컬럼**:
- `paid_event_id` BIGINT PRIMARY KEY AUTO_INCREMENT
- `order_number` VARCHAR(32) NOT NULL
- `event_type` VARCHAR(50) NOT NULL
- `payload_json` JSON
- `processed` TINYINT(1) DEFAULT 0
- `created_at` DATETIME

---

## 🔗 주요 관계도

```
users
  ├── orders (user_id)
  ├── warranties (user_id)
  └── token_master (owner_user_id)

admin_products
  └── stock_units (product_id)
       └── order_item_units (stock_unit_id)

orders
  ├── order_items (order_id)
  │    └── order_item_units (order_item_id)
  ├── payments (order_number)
  └── invoices (order_id)

token_master (SSOT)
  ├── stock_units (token_pk)
  ├── order_item_units (token_pk)
  └── warranties (token_pk)

stock_units (물리적 재고)
  └── order_item_units (stock_unit_id)

carriers (LOOKUP)
  └── order_item_units (carrier_code)

color_standards (LOOKUP)
  ├── stock_units (color)
  └── order_items (color)
```

---

## 📌 핵심 설계 원칙

### 1. 토큰 중심 설계 (token_master = SSOT)
- 모든 토큰은 `token_master`에 중앙 집중
- `token_pk`로 모든 테이블 연결
- 토큰 양도/차단 등 상태 관리

### 2. 3단계 주문 구조
1. **orders**: 주문 정보
2. **order_items**: 상품 + 수량
3. **order_item_units**: 물리적 단위 (출고/배송)

### 3. 재고 관리 (stock_units)
- 사이즈/색상별 재고 관리
- 상태별 추적: `in_stock` → `reserved` → `sold`
- 이중 판매 방지 (active_lock)

### 4. 표준값 관리 (LOOKUP 테이블)
- `color_standards`: 색상 표준값
- `carriers`: 택배사 코드

### 5. 스냅샷 저장소
- `invoices`: 발급 시점 주문 정보 고정
- `payload_json`: 전체 데이터 스냅샷

---

## 🗂️ 인덱스 전략

### 재고 배정 최적화
- `stock_units`: `(product_id, status, size, color, stock_unit_id)` 복합 인덱스

### 주문 조회 최적화
- `orders`: `idx_user_id`, `idx_order_number`, `idx_status`
- `order_item_units`: `idx_order_id`, `idx_unit_status`

### 토큰 조회 최적화
- `token_master`: `idx_internal_code`, `idx_serial_number`

---

**문서 버전**: 1.0  
**최종 업데이트**: 2026-01-11
