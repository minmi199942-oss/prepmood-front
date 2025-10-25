-- Pre.pMood 상품 관리 시스템
-- products 테이블 생성

-- 기존 테이블이 있다면 삭제 (주의: 데이터 손실!)
-- DROP TABLE IF EXISTS products;

-- 상품 테이블 생성
CREATE TABLE IF NOT EXISTS products (
    -- 기본 정보
    id VARCHAR(50) PRIMARY KEY,                    -- 상품 ID (예: 'm-sh-001')
    name VARCHAR(255) NOT NULL,                    -- 상품명
    price INT NOT NULL,                            -- 가격
    
    -- 이미지
    image VARCHAR(500),                            -- 메인 이미지 URL
    
    -- 카테고리
    gender VARCHAR(20) NOT NULL,                   -- 'men', 'women'
    category VARCHAR(100) NOT NULL,                -- 'tops', 'bottoms', 'outer', 'bags', 'accessories'
    type VARCHAR(100) NOT NULL,                    -- 'shirts', 'pants', 'jackets', etc.
    
    -- 추가 정보
    description TEXT,                              -- 상품 설명
    
    -- 타임스탬프
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- 인덱스
    INDEX idx_gender (gender),
    INDEX idx_category (category),
    INDEX idx_gender_category (gender, category),
    INDEX idx_gender_category_type (gender, category, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 테이블 생성 확인
SELECT 'Products table created successfully!' AS status;

