-- invoices 테이블 생성 (디지털 인보이스)
-- 스냅샷 저장소 역할: 발급 시점의 주문 정보를 고정 저장

USE prepmood;

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    invoice_number VARCHAR(50) UNIQUE NOT NULL COMMENT 'PM-INV-YYMMDD-HHmm-{랜덤4자} 형식',
    type ENUM('invoice', 'credit_note') DEFAULT 'invoice',
    status ENUM('issued', 'void', 'refunded') DEFAULT 'issued',
    
    -- 스냅샷 필드 (발급 시점 고정)
    currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
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
    INDEX idx_related_invoice_id (related_invoice_id),
    INDEX idx_issued_at (issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
