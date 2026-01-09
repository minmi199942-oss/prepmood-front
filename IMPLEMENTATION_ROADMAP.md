# 구현 로드맵: 현재 시스템 → 제시된 설계 전환

## 📊 현재 시스템 vs 제시된 설계 비교 요약

### ✅ 현재 시스템에 있는 것
- `users`, `orders`, `order_items` 테이블
- `warranties`, `token_master` 테이블 (기본 구조)
- 주문 생성 API (회원 전용)
- 보증서 발급 로직 (QR 스캔 기반)

### ❌ 현재 시스템에 없는 것 (제시된 설계 필요)
- 비회원 주문 지원 (`guest_orders`, `guest_order_access`)
- 재고 관리 시스템 (`stock_units`)
- 디지털 인보이스 시스템 (`invoices`)
- 보증서 상태 관리 (issued/active/suspended/revoked)
- 양도 시스템 (`warranty_transfers`)
- 환불 시스템 (`refunds`)
- 배송 관리 (`shipments` - 선택)

---

## 🎯 핵심 구현 전략

### 원칙
1. **기존 데이터 보존**: 기존 주문/보증서 데이터 유지
2. **점진적 마이그레이션**: 단계별로 안전하게 전환
3. **하위 호환성**: 기존 API는 유지하면서 새 기능 추가

---

## 📋 Phase별 구현 계획

### Phase 1: 비회원 주문 기반 구축 (최우선)

#### 1.1 DB 스키마 변경
```sql
-- 1. orders 테이블 수정
ALTER TABLE orders 
  MODIFY user_id INT NULL COMMENT '회원 주문: user_id, 비회원 주문: NULL',
  ADD COLUMN guest_id VARCHAR(36) NULL COMMENT '비회원 주문: guest_id (FK -> guest_orders.guest_id)',
  ADD INDEX idx_guest_id (guest_id);

-- 2. guest_orders 테이블 생성
CREATE TABLE guest_orders (
  guest_id VARCHAR(36) PRIMARY KEY,
  order_id INT UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NULL,
  claim_status ENUM('unclaimed', 'claimed') DEFAULT 'unclaimed',
  claimed_user_id INT NULL,
  claimed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (claimed_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_email (email),
  INDEX idx_claim_status (claim_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. guest_order_access 테이블 생성
CREATE TABLE guest_order_access (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id INT UNIQUE NOT NULL,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  status ENUM('active', 'expired', 'revoked') DEFAULT 'active',
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  last_access_at DATETIME NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  INDEX idx_token_hash (token_hash),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. orders_idempotency 테이블 수정
ALTER TABLE orders_idempotency
  MODIFY user_id INT NULL COMMENT '회원: user_id, 비회원: NULL',
  ADD COLUMN guest_id VARCHAR(36) NULL COMMENT '비회원: guest_id',
  DROP INDEX uniq_user_idem,
  ADD UNIQUE KEY uniq_user_idem (user_id, idem_key),
  ADD UNIQUE KEY uniq_guest_idem (guest_id, idem_key);
```

#### 1.2 백엔드 로직 변경
- [ ] `backend/order-routes.js`: 
  - `authenticateToken` → `optionalAuth` 변경
  - 비회원 주문 생성 로직 추가 (guest_id 발급)
  - 주문 생성 시 user_id/guest_id 분기 처리
- [ ] 비회원 주문 조회 API 생성 (`/api/guest/orders/:order_no`)
- [ ] 비회원 주문 연동(Claim) API 생성 (`/api/guest/orders/:order_no/claim`)

#### 1.3 프론트엔드 변경
- [ ] `checkout.html`: 비회원 주문 지원 (이메일 수집 동의 추가)
- [ ] `checkout-script.js`: 로그인 체크 제거
- [ ] 비회원 주문 상세 페이지 생성 (`guest-order-detail.html`)

---

### Phase 2: 재고 관리 시스템 구축

#### 2.1 DB 스키마
```sql
-- stock_units 테이블 생성
CREATE TABLE stock_units (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id VARCHAR(50) NOT NULL,
  serial_number VARCHAR(100) UNIQUE NOT NULL,
  barcode_number VARCHAR(100) UNIQUE NULL,
  token_id VARCHAR(20) UNIQUE NULL,
  status ENUM('in_stock', 'reserved', 'shipped', 'delivered', 'returned_pending_inspection', 'quarantined', 'destroyed') DEFAULT 'in_stock',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (token_id) REFERENCES token_master(token) ON DELETE SET NULL,
  INDEX idx_product_id (product_id),
  INDEX idx_serial_number (serial_number),
  INDEX idx_barcode_number (barcode_number),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- order_items 테이블 수정
ALTER TABLE order_items
  ADD COLUMN stock_unit_id BIGINT NULL COMMENT '재고 단위 연결 (FK -> stock_units.id)',
  ADD FOREIGN KEY (stock_unit_id) REFERENCES stock_units(id) ON DELETE SET NULL,
  ADD INDEX idx_stock_unit_id (stock_unit_id);

-- token_master 테이블 수정
ALTER TABLE token_master
  ADD COLUMN stock_unit_id BIGINT UNIQUE NULL COMMENT '재고 단위 연결 (FK -> stock_units.id)',
  ADD COLUMN status ENUM('unused', 'reserved', 'active', 'revoked') DEFAULT 'unused',
  ADD COLUMN revoked_at DATETIME NULL,
  ADD FOREIGN KEY (stock_unit_id) REFERENCES stock_units(id) ON DELETE SET NULL,
  ADD INDEX idx_stock_unit_id (stock_unit_id),
  ADD INDEX idx_status (status);
```

#### 2.2 백엔드 로직
- [ ] 재고 등록 API (`/api/admin/stock/import`) - xlsx 업로드
- [ ] 재고 배정 로직 (결제 성공 시 트랜잭션)
- [ ] 재고 상태 관리 API

---

### Phase 3: 디지털 인보이스 시스템

#### 3.1 DB 스키마
```sql
-- invoices 테이블 생성 (스냅샷 저장소 역할)
CREATE TABLE invoices (
  invoice_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  invoice_number VARCHAR(50) UNIQUE NOT NULL COMMENT 'PM-INV-YYMMDD-HHmmss-{랜덤} 형식',
  type ENUM('invoice', 'credit_note') DEFAULT 'invoice',
  status ENUM('issued', 'void', 'refunded') DEFAULT 'issued',
  
  -- 스냅샷 필드 (발급 시점 고정)
  currency VARCHAR(3) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL,
  
  billing_name VARCHAR(100) NOT NULL,
  billing_email VARCHAR(255) NOT NULL,
  billing_phone VARCHAR(30),
  billing_address_json JSON COMMENT '발급 시점 주소 고정',
  
  shipping_name VARCHAR(100) NOT NULL,
  shipping_email VARCHAR(255),
  shipping_phone VARCHAR(30),
  shipping_address_json JSON COMMENT '발급 시점 주소 고정',
  
  payload_json JSON COMMENT '전체 인보이스 데이터 스냅샷 (라인 아이템 포함)',
  order_snapshot_hash CHAR(64) COMMENT 'payload_json 해시 (위변조/동일문서 판별)',
  version INT DEFAULT 1 COMMENT '인보이스 템플릿/렌더링 버전',
  
  -- 메타데이터
  issued_by ENUM('system', 'admin') DEFAULT 'system',
  issued_by_id INT NULL COMMENT '관리자 발급 시 admin_user_id',
  related_invoice_id BIGINT NULL COMMENT 'credit_note가 취소하는 invoice_id (1:N 허용)',
  
  document_url TEXT NULL COMMENT 'PDF URL 또는 링크',
  document_key VARCHAR(255) NULL COMMENT 'S3 키 등',
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  emailed_at DATETIME NULL,
  voided_at DATETIME NULL,
  void_reason TEXT NULL,
  
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
  FOREIGN KEY (related_invoice_id) REFERENCES invoices(invoice_id) ON DELETE SET NULL,
  INDEX idx_order_id (order_id),
  INDEX idx_invoice_number (invoice_number),
  INDEX idx_status (status),
  INDEX idx_related_invoice_id (related_invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**⚠️ invoice_number 생성 규칙**:
- 형식: `PM-INV-YYMMDD-HHmm-{랜덤4자}` (분 단위 + 랜덤으로 충돌 방지)
- 랜덤 4자: 0-9, A-Z (36^4 = 1,679,616가지 조합)
- 충돌 확률: 거의 0% (같은 분에 160만 건 이상 발생 시에만 충돌 가능)
- DB UNIQUE(invoice_number) 충돌 시: 재시도 1~3회로 새 번호 재발급
- 재시도 실패 시: 장애로 보고(로그/알림) 중단

**⚠️ credit_note payload_json 최소 포함 사항**:
- 원본 invoice_id (`related_invoice_id`)
- 환불 대상 unit 식별자 (`order_item_unit_id` 리스트)
- 환불 금액/세금/통화
- 환불 사유/환불 트랜잭션 키 (`payment_key` 등)
- **부분 환불 지원**: 원본 1장에 여러 credit_note 가능 (`related_invoice_id`는 1:N 허용)

#### 3.2 백엔드 로직
- [ ] 인보이스 생성 로직 (결제 성공 시)
- [ ] 이메일 발송 로직 (MailerSend 연동)
- [ ] PDF 생성 또는 링크 생성

---

### Phase 4: 보증서 시스템 개선

#### 4.1 DB 스키마 마이그레이션
```sql
-- warranties 테이블 마이그레이션 (주의: 기존 데이터 보존)
-- 1단계: 컬럼 추가 (NULL 허용)
ALTER TABLE warranties
  ADD COLUMN owner_user_id INT NULL COMMENT '소유자 (기존 user_id에서 마이그레이션)',
  ADD COLUMN status ENUM('issued_unassigned', 'issued', 'active', 'suspended', 'revoked', 'transferred') DEFAULT 'issued',
  ADD COLUMN order_item_id INT NULL COMMENT '주문 아이템 연결',
  ADD COLUMN stock_unit_id BIGINT NULL COMMENT '재고 단위 연결',
  ADD COLUMN activated_at DATETIME NULL COMMENT '활성화 일시',
  ADD COLUMN revoked_at DATETIME NULL COMMENT '무효화 일시',
  ADD COLUMN issued_at DATETIME NULL COMMENT '발급 일시 (기존 created_at과 분리)',
  ADD INDEX idx_owner_user_id (owner_user_id),
  ADD INDEX idx_status (status),
  ADD INDEX idx_order_item_id (order_item_id),
  ADD INDEX idx_stock_unit_id (stock_unit_id);

-- 2단계: 기존 데이터 마이그레이션
UPDATE warranties 
SET owner_user_id = user_id,
    status = 'active',  -- 기존 보증서는 활성 상태로 간주
    issued_at = created_at
WHERE owner_user_id IS NULL;

-- 3단계: 기존 user_id 컬럼 제거 (FK 제약 해제 후)
ALTER TABLE warranties
  DROP FOREIGN KEY warranties_ibfk_1,  -- 기존 FK 이름 확인 필요
  DROP COLUMN user_id;

-- 4단계: 새 FK 추가
ALTER TABLE warranties
  ADD FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  ADD FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE SET NULL,
  ADD FOREIGN KEY (stock_unit_id) REFERENCES stock_units(id) ON DELETE SET NULL;
```

#### 4.2 백엔드 로직
- [ ] 보증서 생성 로직 개선 (결제 성공 시)
- [ ] 보증서 활성화 로직 (QR 스캔 또는 수동 활성화)
- [ ] 보증서 상태 관리 API

---

### Phase 5: 양도 시스템

#### 5.1 DB 스키마
```sql
-- warranty_transfers 테이블 생성
CREATE TABLE warranty_transfers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  warranty_id INT NOT NULL,
  from_user_id INT NOT NULL,
  to_user_id INT NULL COMMENT '수락 후 설정',
  to_email VARCHAR(255) NULL COMMENT '수령자 이메일',
  transfer_code_hash VARCHAR(64) UNIQUE NOT NULL,
  status ENUM('requested', 'accepted', 'completed', 'cancelled', 'expired') DEFAULT 'requested',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  completed_at DATETIME NULL,
  FOREIGN KEY (warranty_id) REFERENCES warranties(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_warranty_id (warranty_id),
  INDEX idx_from_user_id (from_user_id),
  INDEX idx_to_user_id (to_user_id),
  INDEX idx_status (status),
  INDEX idx_transfer_code_hash (transfer_code_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 5.2 백엔드 로직
- [ ] 양도 요청 API (`/api/warranties/:id/transfer`)
- [ ] 양도 수락 API (`/api/warranty/transfer/accept`)

---

### Phase 6: 환불 시스템

#### 6.1 DB 스키마
```sql
-- refunds 테이블 생성 (선택, 운영 편의)
CREATE TABLE refunds (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  order_item_id INT NULL COMMENT '부분 환불 시',
  status ENUM('requested', 'approved', 'processed', 'failed') DEFAULT 'requested',
  refund_amount DECIMAL(10,2) NOT NULL,
  pg_refund_id VARCHAR(255) NULL COMMENT 'PG사 환불 ID',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE SET NULL,
  INDEX idx_order_id (order_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 6.2 백엔드 로직
- [ ] 환불 처리 로직 (토큰/보증서 무효화)
- [ ] credit_note 발급 로직

---

## 🔄 결제 성공(paid) 트리거 핵심 로직

### 현재 상태
- ❌ 결제 성공 후 자동 처리 로직 없음
- ❌ 재고 배정 없음
- ❌ 인보이스 발급 없음
- ❌ 보증서 자동 생성 없음

### 필요한 변경
```javascript
// backend/order-routes.js 또는 별도 webhook handler
async function handlePaymentSuccess(orderNumber) {
  const connection = await mysql.createConnection(dbConfig);
  await connection.beginTransaction();
  
  try {
    // 1. 주문 정보 조회
    const [orders] = await connection.execute(
      'SELECT * FROM orders WHERE order_number = ?',
      [orderNumber]
    );
    const order = orders[0];
    
    // 2. 재고 배정 (트랜잭션)
    const [orderItems] = await connection.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [order.order_id]
    );
    
    for (const item of orderItems) {
      // 수량만큼 재고 할당
      const [stockUnits] = await connection.execute(
        `SELECT id FROM stock_units 
         WHERE product_id = ? AND status = 'in_stock' 
         LIMIT ? FOR UPDATE`,
        [item.product_id, item.quantity]
      );
      
      if (stockUnits.length < item.quantity) {
        throw new Error('재고 부족');
      }
      
      // 재고 상태 변경 및 order_items 연결
      for (let i = 0; i < item.quantity; i++) {
        await connection.execute(
          'UPDATE stock_units SET status = "reserved" WHERE id = ?',
          [stockUnits[i].id]
        );
        await connection.execute(
          'UPDATE order_items SET stock_unit_id = ? WHERE order_item_id = ?',
          [stockUnits[i].id, item.order_item_id]
        );
      }
    }
    
    // 3. 인보이스 생성
    const [invoiceResult] = await connection.execute(
      'INSERT INTO invoices (order_id, type, status) VALUES (?, "invoice", "issued")',
      [order.order_id]
    );
    
    // 4. 보증서 생성
    for (const item of orderItems) {
      const [stockUnit] = await connection.execute(
        'SELECT token_id FROM stock_units WHERE id = ?',
        [item.stock_unit_id]
      );
      
      if (stockUnit[0]?.token_id) {
        await connection.execute(
          `INSERT INTO warranties 
           (owner_user_id, token, order_item_id, stock_unit_id, status, issued_at, created_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            order.user_id,  // 회원: user_id, 비회원: NULL
            stockUnit[0].token_id,
            item.order_item_id,
            item.stock_unit_id,
            order.user_id ? 'issued' : 'issued_unassigned'
          ]
        );
      }
    }
    
    // 5. 주문 상태 변경
    await connection.execute(
      'UPDATE orders SET status = "paid", paid_at = NOW() WHERE order_id = ?',
      [order.order_id]
    );
    
    await connection.commit();
    
    // 6. 이메일 발송 (트랜잭션 외부)
    await sendInvoiceEmail(order, invoiceResult.insertId);
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}
```

---

## ⚠️ 주요 주의사항

### 1. 기존 데이터 마이그레이션
- **warranties 테이블**: 기존 `user_id` → `owner_user_id`로 마이그레이션
- **orders 테이블**: 기존 주문은 모두 회원 주문으로 간주 (guest_id = NULL)
- **token_master 테이블**: 기존 토큰은 `status = 'active'`로 설정

### 2. 트랜잭션 처리
- 결제 성공 시 재고 배정 + 인보이스 생성 + 보증서 생성은 **반드시 트랜잭션으로 묶어야 함**
- 이메일 발송은 트랜잭션 외부에서 처리 (실패해도 주문은 완료)

### 3. 하위 호환성
- 기존 API는 유지하면서 새 기능 추가
- 기존 보증서 조회 API는 `owner_user_id`로 조회하도록 수정

---

## 📝 다음 단계

1. **DB 스키마 확인**: 실제 테이블 구조 확인
2. **마이그레이션 스크립트 작성**: Phase별 마이그레이션 스크립트
3. **백엔드 API 구현**: Phase별 API 구현
4. **프론트엔드 구현**: Phase별 UI 구현
5. **테스트**: 각 Phase별 테스트







