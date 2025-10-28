-- orders 테이블에 배송 정보 컬럼 추가
-- 배송 주소 및 연락처 정보를 저장

ALTER TABLE `orders` 
ADD COLUMN `shipping_first_name` varchar(100) DEFAULT NULL COMMENT '배송지 이름',
ADD COLUMN `shipping_last_name` varchar(100) DEFAULT NULL COMMENT '배송지 성',
ADD COLUMN `shipping_email` varchar(255) DEFAULT NULL COMMENT '배송지 이메일',
ADD COLUMN `shipping_phone` varchar(20) DEFAULT NULL COMMENT '배송지 전화번호',
ADD COLUMN `shipping_address` text DEFAULT NULL COMMENT '배송지 주소',
ADD COLUMN `shipping_city` varchar(100) DEFAULT NULL COMMENT '배송지 도시',
ADD COLUMN `shipping_postal_code` varchar(20) DEFAULT NULL COMMENT '배송지 우편번호',
ADD COLUMN `shipping_country` varchar(50) DEFAULT NULL COMMENT '배송지 국가',
ADD COLUMN `shipping_method` varchar(50) DEFAULT 'standard' COMMENT '배송 방법: standard(일반), express(당일), overnight(익일)',
ADD COLUMN `shipping_cost` decimal(10,2) DEFAULT 0.00 COMMENT '배송비',
ADD COLUMN `estimated_delivery` date DEFAULT NULL COMMENT '예상 배송일';
