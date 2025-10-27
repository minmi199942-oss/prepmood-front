-- orders 테이블에 status 컬럼 추가 (이미 있으면 에러 발생하지 않음)

ALTER TABLE `orders` 
ADD COLUMN IF NOT EXISTS `status` varchar(50) DEFAULT 'pending' 
COMMENT '주문 상태: pending(대기), confirmed(확인), shipping(배송중), delivered(배송완료), cancelled(취소)';

-- orders 테이블 수정 (serial_number, quantity 제거 - order_items로 이동)
-- 주의: 기존 데이터가 있을 수 있으므로 사용자와 확인 후 진행

-- 우선 order_items로 전환하되 기존 필드는 유지
-- ALTER TABLE `orders` DROP COLUMN `serial_number`;
-- ALTER TABLE `orders` DROP COLUMN `quantity`;

