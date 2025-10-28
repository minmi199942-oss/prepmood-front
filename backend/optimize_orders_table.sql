-- orders 테이블 최적화 스크립트
-- 주문번호 고유 제약, 상태/배송방법 체크 제약, 인덱스 최적화

-- 1. 주문번호 컬럼 추가 (고유 제약을 위한)
ALTER TABLE `orders` 
ADD COLUMN `order_number` varchar(20) UNIQUE COMMENT '주문번호 (예: ORD-20250127-001)';

-- 2. 상태 체크 제약 추가
ALTER TABLE `orders` 
ADD CONSTRAINT `chk_order_status` 
CHECK (`status` IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'));

-- 3. 배송방법 체크 제약 추가
ALTER TABLE `orders` 
ADD CONSTRAINT `chk_shipping_method` 
CHECK (`shipping_method` IN ('standard', 'express', 'overnight', 'pickup'));

-- 4. 배송비 체크 제약 추가 (0 이상)
ALTER TABLE `orders` 
ADD CONSTRAINT `chk_shipping_cost` 
CHECK (`shipping_cost` >= 0);

-- 5. 총 금액 체크 제약 추가 (0 이상)
ALTER TABLE `orders` 
ADD CONSTRAINT `chk_total_price` 
CHECK (`total_price` >= 0);

-- 6. 인덱스 최적화
-- 6-1. 사용자별 주문 조회 최적화 (복합 인덱스)
CREATE INDEX `idx_orders_user_date` ON `orders` (`user_id`, `order_date` DESC);

-- 6-2. 주문 상태별 조회 최적화
CREATE INDEX `idx_orders_status` ON `orders` (`status`);

-- 6-3. 배송 방법별 조회 최적화
CREATE INDEX `idx_orders_shipping_method` ON `orders` (`shipping_method`);

-- 6-4. 예상 배송일 조회 최적화
CREATE INDEX `idx_orders_delivery_date` ON `orders` (`estimated_delivery`);

-- 6-5. 주문번호 조회 최적화 (이미 UNIQUE 제약으로 인덱스 자동 생성됨)
-- CREATE INDEX `idx_orders_number` ON `orders` (`order_number`);

-- 7. 기존 데이터에 주문번호 생성 (필요시)
-- UPDATE `orders` SET `order_number` = CONCAT('ORD-', DATE_FORMAT(`order_date`, '%Y%m%d'), '-', LPAD(`order_id`, 3, '0'))
-- WHERE `order_number` IS NULL;

-- 8. 테이블 구조 확인
DESCRIBE `orders`;

-- 9. 인덱스 확인
SHOW INDEX FROM `orders`;
