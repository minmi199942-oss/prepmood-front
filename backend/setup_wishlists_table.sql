-- 위시리스트 테이블 생성 스크립트
-- 사용법: MySQL 클라이언트에서 이 파일을 실행하거나 내용을 복사하여 실행

USE prepmood;

-- 위시리스트 테이블 생성
CREATE TABLE IF NOT EXISTS wishlists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_wishlist (user_email, product_id),
    INDEX idx_user_email (user_email),
    INDEX idx_product_id (product_id),
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 테이블 생성 확인
SELECT 
    TABLE_NAME,
    CREATE_TIME,
    TABLE_ROWS
FROM 
    INFORMATION_SCHEMA.TABLES
WHERE 
    TABLE_SCHEMA = 'prepmood' 
    AND TABLE_NAME = 'wishlists';

-- 인덱스 확인
SHOW INDEX FROM wishlists;

SELECT '✅ wishlists 테이블이 성공적으로 생성되었습니다!' AS message;

