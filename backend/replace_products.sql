-- ============================================================
-- 상품 데이터 교체 스크립트
-- ============================================================
-- 사용 방법:
-- 1. 전체 교체 (기존 데이터 삭제 후 새 데이터 삽입)
-- 2. 덮어쓰기 (기존 ID는 업데이트, 신규는 삽입)
-- ============================================================

USE prepmood;

-- ============================================================
-- 방법 1: 전체 삭제 후 삽입 (주의: 모든 기존 데이터 삭제됨)
-- ============================================================
-- 기존 데이터 백업 (선택사항)
CREATE TABLE admin_products_backup AS SELECT * FROM admin_products;

-- 기존 데이터 전체 삭제
TRUNCATE TABLE admin_products;

-- 새 데이터 삽입
INSERT INTO admin_products (id, name, price, image, category, type, description) VALUES
('PM-25-SH-Teneu-Solid-LB-S/M/L', '테뉴 솔리드 셔츠', 128000, 'Teneu-Solid-Shirt.jpg', 'tops', 'shirts', '테뉴 솔리드 셔츠 - 라이트 블루'),
('PM-25-SH-Oxford-Stripe-GY-S/M/L', '옥스퍼드 스트라이프 셔츠', 128000, 'Oxfor-Stripe-Shrit.jpg', 'tops', 'shirts', '옥스퍼드 스트라이프 셔츠 - 그레이'),
('PM-25-SH-Teneu-Solid-Pintuck-WH-S/M', '테뉴 솔리드 핀턱 셔츠', 128000, 'Teneu-Solid-Pintuck-Shrit.jpg', 'tops', 'shirts', '테뉴 솔리드 핀턱 셔츠 - 화이트'),
('PM-25-TOP-Solid-Suit-Bustier-BK/GY-F', '솔리드 수트 뷔스티에', 178000, 'Solid-Suit-Buistier.jpg', 'tops', 'shirts', '솔리드 수트 뷔스티에 - 블랙/그레이'),
('PM-25-TOP-Heavyweight-Vest-GY-S/M', '테뉴 헤비웨이트 베스트', 168000, 'Heavyweight-Vest.jpg', 'tops', 't-shirts', '테뉴 헤비웨이트 베스트 - 그레이'),
('PM-25-SK-Suit-Balloon-BK/GY-F', '솔리드 수트 벌룬 스커트', 188000, 'Suit-Balloon-Skirt.jpg', 'bottoms', 'skirts', '솔리드 수트 벌룬 스커트 - 블랙/그레이'),
('PM-25-Outer-LeStripe-Suit-NV-S/L', '르 스트라이프 수트 블루종', 580000, 'Outer-LeStripe-Suit.jpg', 'outer', 'jackets', '르 스트라이프 수트 블루종 - 네이비'),
('PM-25-Outer-London-Liberty-Toile-BK-S/L', '런던 리버티 투알 블루종', 680000, 'Outer-London-Liberty-Toile.jpg', 'outer', 'jackets', '런던 리버티 투알 블루종 - 블랙'),
('PM-25-ACC-Fabric-Tie-Solid', '솔리드 수트 슬림 타이', 89000, 'ACC-Fabric-Tie-Solid.jpg', 'accessories', 'ties', '솔리드 수트 슬림 타이'),
('PM-25-ACC-Fabric-Tie-Skinny', '솔리드 수트 스키니 타이', 89000, 'Fabric-Tie-Skinny.jpg', 'accessories', 'ties', '솔리드 수트 스키니 타이')
;

-- ============================================================
-- 방법 2: 덮어쓰기 (REPLACE INTO - 기존 ID는 업데이트, 신규는 삽입)
-- ============================================================
-- REPLACE INTO admin_products (id, name, price, image, category, type, description) VALUES
-- ('기존ID또는신규ID', '상품명', 가격, 'image/path.jpg', '카테고리', '타입', '설명'),
-- ... (여기에 교체할 상품 데이터 추가)
-- ;

-- ============================================================
-- 방법 3: INSERT ... ON DUPLICATE KEY UPDATE (더 세밀한 제어)
-- ============================================================
-- INSERT INTO admin_products (id, name, price, image, category, type, description) VALUES
-- ('기존ID또는신규ID', '상품명', 가격, 'image/path.jpg', '카테고리', '타입', '설명'),
-- ... (여기에 교체할 상품 데이터 추가)
-- ON DUPLICATE KEY UPDATE
--     name = VALUES(name),
--     price = VALUES(price),
--     image = VALUES(image),
--     category = VALUES(category),
--     type = VALUES(type),
--     description = VALUES(description),
--     updated_at = NOW();
-- ;

-- ============================================================
-- 현재 데이터 확인
-- ============================================================
SELECT '=== 현재 상품 개수 ===' AS info;
SELECT COUNT(*) AS total_products FROM admin_products;

SELECT '=== 카테고리별 상품 개수 ===' AS info;
SELECT category, COUNT(*) AS count 
FROM admin_products 
GROUP BY category 
ORDER BY category;

-- ============================================================
-- 주의사항
-- ============================================================
-- 1. 교체 전 반드시 백업을 권장합니다
-- 2. 장바구니(cart_items)나 주문(order_items)에서 참조 중인 상품은 삭제하지 마세요
-- 3. category: 'tops', 'bottoms', 'outer', 'bags', 'accessories'
-- 4. type: category에 따라 적절한 값 사용 (예: 'shirts', 'pants', 'jackets' 등)


