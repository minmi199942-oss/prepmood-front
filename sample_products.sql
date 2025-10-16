-- ====================================
-- 샘플 상품 데이터 추가 스크립트
-- ====================================

USE prepmood;

-- 샘플 상품 데이터 삽입
INSERT INTO admin_products (id, name, price, image, gender, category, type, description) VALUES
('m-sh-001', '클래식 화이트 셔츠', 89000, 'image/shirt.jpg', 'male', 'tops', 'shirt', '클래식한 화이트 셔츠입니다. 비즈니스 캐주얼부터 포멀까지 다양한 스타일에 활용 가능합니다.'),
('m-sh-002', '데님 셔츠', 75000, 'image/denim.jpg', 'male', 'tops', 'shirt', '부드러운 데님 소재의 셔츠입니다. 일상적인 스타일링에 완벽합니다.'),
('m-ts-001', '베이직 티셔츠', 45000, 'image/knit.jpg', 'male', 'tops', 't-shirt', '편안한 착용감의 베이직 티셔츠입니다. 다양한 컬러로 구성되어 있습니다.'),
('m-jw-001', '클래식 청바지', 129000, 'image/pants.jpg', 'male', 'bottoms', 'jeans', '클래식한 스타일의 청바지입니다. 슬림핏으로 세련된 실루엣을 연출합니다.'),
('m-ot-001', '데님 재킷', 159000, 'image/denim.jpg', 'male', 'outer', 'jacket', '시원한 데님 재킷입니다. 레이어드 스타일에 완벽합니다.'),
('m-ac-001', '클래식 모자', 59000, 'image/cap.jpg', 'male', 'accessories', 'cap', '심플하고 세련된 디자인의 모자입니다.'),
('m-ac-002', '가죽 지갑', 89000, 'image/earring.jpg', 'male', 'accessories', 'wallet', '고급 가죽 소재의 지갑입니다.'),
('w-sh-001', '레이스 블라우스', 99000, 'image/shirt.jpg', 'female', 'tops', 'blouse', '우아한 레이스 디테일의 블라우스입니다.'),
('w-sk-001', '미디 스커트', 119000, 'image/pants.jpg', 'female', 'bottoms', 'skirt', '여성스러운 실루엣의 미디 스커트입니다.'),
('w-bg-001', '토트백', 139000, 'image/hat.jpg', 'female', 'bags', 'tote', '실용적인 토트백입니다.');

-- 완료 메시지
SELECT 'Sample products inserted successfully!' AS status;
SELECT COUNT(*) AS total_products FROM admin_products;
