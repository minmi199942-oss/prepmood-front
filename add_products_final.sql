-- 모든 제품들을 admin_products 테이블에 추가 (완전한 버전)

-- 상의 (Tops)
INSERT INTO admin_products (id, name, price, image, category, type, description) VALUES
-- 셔츠
('ts-001', 'Classic Oxford Shirt', 89000, 'image/shirt.jpg', 'tops', 'shirts', '클래식 옥스포드 셔츠'),
('ts-002', 'Soft Cotton Shirt', 79000, 'image/shirt.jpg', 'tops', 'shirts', '소프트 코튼 셔츠'),
('ts-003', 'Relaxed Fit Shirt', 99000, 'image/shirt.jpg', 'tops', 'shirts', '릴랙스드 핏 셔츠'),
('ts-004', 'Stripe Poplin Shirt', 119000, 'image/shirt.jpg', 'tops', 'shirts', '스트라이프 팝린 셔츠'),
('ts-005', 'Linen Blend Shirt', 109000, 'image/shirt.jpg', 'tops', 'shirts', '린넨 블렌드 셔츠'),
('ts-006', 'Denim Shirt', 95000, 'image/shirt.jpg', 'tops', 'shirts', '데님 셔츠'),

-- 티셔츠
('ts-007', 'Basic Cotton Tee', 39000, 'image/shirt.jpg', 'tops', 't-shirts', '베이직 코튼 티셔츠'),
('ts-008', 'Oversized Graphic Tee', 59000, 'image/shirt.jpg', 'tops', 't-shirts', '오버사이즈 그래픽 티셔츠'),
('ts-009', 'Henley Long Sleeve', 69000, 'image/shirt.jpg', 'tops', 't-shirts', '헨리 롱슬리브'),

-- 니트
('kn-001', 'Merino Wool Knit', 189000, 'image/knit.jpg', 'tops', 'knits', '메리노 울 니트'),
('kn-002', 'Cashmere Sweater', 299000, 'image/knit.jpg', 'tops', 'knits', '캐시미어 스웨터'),
('kn-003', 'Cable Knit Pullover', 149000, 'image/knit.jpg', 'tops', 'knits', '케이블 니트 풀오버'),
('kn-004', 'V-Neck Cardigan', 129000, 'image/knit.jpg', 'tops', 'knits', '브이넥 카디건');

-- 아우터 (Outer)
INSERT INTO admin_products (id, name, price, image, category, type, description) VALUES
-- 재킷
('jk-001', 'Nylon Puffer Jacket', 420000, 'image/denim.jpg', 'outer', 'jackets', '나일론 퍼퍼 재킷'),
('jk-002', 'Leather Bomber Jacket', 580000, 'image/denim.jpg', 'outer', 'jackets', '가죽 봄버 재킷'),
('jk-003', 'Denim Jacket', 189000, 'image/denim.jpg', 'outer', 'jackets', '데님 재킷'),
('jk-004', 'Wool Blazer', 350000, 'image/denim.jpg', 'outer', 'jackets', '울 블레이저'),

-- 수트
('st-001', 'Classic Navy Suit', 890000, 'image/denim.jpg', 'outer', 'suits', '클래식 네이비 수트'),
('st-002', 'Charcoal Business Suit', 1200000, 'image/denim.jpg', 'outer', 'suits', '차콜 비즈니스 수트'),
('st-003', 'Linen Summer Suit', 650000, 'image/denim.jpg', 'outer', 'suits', '린넨 썸머 수트');

-- 하의 (Bottoms)
INSERT INTO admin_products (id, name, price, image, category, type, description) VALUES
-- 팬츠
('pt-001', 'Slim Fit Jeans', 149000, 'image/pants.jpg', 'bottoms', 'pants', '슬림핏 데님 팬츠'),
('pt-002', 'Classic Chinos', 129000, 'image/pants.jpg', 'bottoms', 'pants', '클래식 치노 팬츠'),
('pt-003', 'Wool Dress Pants', 189000, 'image/pants.jpg', 'bottoms', 'pants', '울 드레스 팬츠'),
('pt-004', 'Cargo Pants', 99000, 'image/pants.jpg', 'bottoms', 'pants', '카고 팬츠'),
('pt-005', 'High-Waist Jeans', 149000, 'image/pants.jpg', 'bottoms', 'pants', '하이웨스트 데님'),
('pt-006', 'Wide Leg Pants', 129000, 'image/pants.jpg', 'bottoms', 'pants', '와이드 레그 팬츠'),
('pt-007', 'Culottes', 99000, 'image/pants.jpg', 'bottoms', 'pants', '퀼롯'),

-- 쇼츠
('sh-001', 'Chino Shorts', 79000, 'image/pants.jpg', 'bottoms', 'shorts', '치노 쇼츠'),
('sh-002', 'Denim Shorts', 89000, 'image/pants.jpg', 'bottoms', 'shorts', '데님 쇼츠'),
('sh-003', 'Swim Trunks', 59000, 'image/pants.jpg', 'bottoms', 'shorts', '수영복'),
('sh-004', 'High-Waist Shorts', 79000, 'image/pants.jpg', 'bottoms', 'shorts', '하이웨스트 쇼츠'),
('sh-005', 'Bermuda Shorts', 89000, 'image/pants.jpg', 'bottoms', 'shorts', '버뮤다 쇼츠'),

-- 스커트
('sk-001', 'A-Line Skirt', 89000, 'image/pants.jpg', 'bottoms', 'skirts', 'A라인 스커트'),
('sk-002', 'Pencil Skirt', 79000, 'image/pants.jpg', 'bottoms', 'skirts', '펜슬 스커트'),
('sk-003', 'Mini Skirt', 69000, 'image/pants.jpg', 'bottoms', 'skirts', '미니 스커트');

-- 가방 (Bags)
INSERT INTO admin_products (id, name, price, image, category, type, description) VALUES
('bg-001', 'Leather Briefcase', 350000, 'image/hat.jpg', 'bags', 'briefcases', '가죽 서류가방'),
('bg-002', 'Canvas Backpack', 189000, 'image/hat.jpg', 'bags', 'backpacks', '캔버스 백팩'),
('bg-003', 'Crossbody Bag', 129000, 'image/hat.jpg', 'bags', 'crossbody', '크로스바디 백'),
('bg-004', 'Leather Handbag', 350000, 'image/hat.jpg', 'bags', 'handbags', '가죽 핸드백'),
('bg-005', 'Tote Bag', 129000, 'image/hat.jpg', 'bags', 'totes', '토트백'),
('bg-006', 'Clutch Bag', 79000, 'image/hat.jpg', 'bags', 'clutches', '클러치백');

-- 액세서리 (Accessories)
INSERT INTO admin_products (id, name, price, image, category, type, description) VALUES
-- 모자
('cp-001', 'Baseball Cap', 49000, 'image/cap.jpg', 'accessories', 'caps', '야구 모자'),
('cp-002', 'Beanie', 39000, 'image/cap.jpg', 'accessories', 'caps', '비니'),
('cp-003', 'Bucket Hat', 59000, 'image/cap.jpg', 'accessories', 'caps', '버킷 햇'),
('cp-004', 'Wide Brim Hat', 89000, 'image/cap.jpg', 'accessories', 'caps', '와이드 브림 햇'),

-- 벨트
('bl-001', 'Leather Belt', 89000, 'image/hat.jpg', 'accessories', 'belts', '가죽 벨트'),
('bl-002', 'Canvas Belt', 59000, 'image/hat.jpg', 'accessories', 'belts', '캔버스 벨트'),
('bl-003', 'Chain Belt', 59000, 'image/hat.jpg', 'accessories', 'belts', '체인 벨트'),

-- 지갑
('wl-001', 'Leather Wallet', 129000, 'image/hat.jpg', 'accessories', 'wallets', '가죽 지갑'),
('wl-002', 'Card Holder', 79000, 'image/hat.jpg', 'accessories', 'wallets', '카드 홀더');


