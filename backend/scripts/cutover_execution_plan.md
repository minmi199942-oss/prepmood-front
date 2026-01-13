# Cutover 실행 계획 (서버 멈춤 방식)

## ⚠️ 사전 준비

1. **백업** (선택사항, 안전을 위해)
```bash
mysqldump -u prepmood_user -p prepmood > backup_before_cutover_$(date +%Y%m%d_%H%M%S).sql
```

2. **사전 체크리스트 (GPT 최소 체크리스트)**

```sql
USE prepmood;

-- 1. FK 전수 목록 확인 (추가 참조 테이블 없음 확인)
SELECT
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'admin_products'
  AND REFERENCED_COLUMN_NAME = 'id';

-- 2. product_id 컬럼 전수 스캔 (업데이트 누락 테이블 없음 확인)
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND COLUMN_NAME IN ('product_id', 'product_id_canonical')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- 3. canonical_id 중복 확인 (어떤 값이 중복인지 확인)
SELECT 
    canonical_id,
    COUNT(*) as duplicate_count,
    GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as conflicting_ids
FROM admin_products
WHERE canonical_id IS NOT NULL
GROUP BY canonical_id
HAVING COUNT(*) > 1;
-- 결과가 0개여야 함!
```

3. **서버 중지**
```bash
pm2 stop prepmood-backend
```

## 🚀 실행 순서

### 1. 마이그레이션 실행

```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < migrations/068_cutover_to_canonical_id.sql
```

### 2. 결과 확인

```sql
USE prepmood;

-- admin_products 확인
SELECT id, canonical_id, name 
FROM admin_products 
ORDER BY id;

-- legacy ID 남아있는지 확인 (슬래시 포함)
SELECT COUNT(*) as legacy_count
FROM admin_products
WHERE id LIKE '%/%';

-- 참조 무결성 확인
SELECT 
    'stock_units' AS table_name,
    COUNT(*) as orphan_count
FROM stock_units su
LEFT JOIN admin_products ap ON su.product_id = ap.id
WHERE su.product_id IS NOT NULL AND ap.id IS NULL
UNION ALL
SELECT 
    'order_items' AS table_name,
    COUNT(*) as orphan_count
FROM order_items oi
LEFT JOIN admin_products ap ON oi.product_id = ap.id
WHERE oi.product_id IS NOT NULL AND ap.id IS NULL;
```

### 3. 코드 단순화 (다음 단계)

- `resolveProductId` 함수 제거
- Dual-read/dual-write 로직 제거
- `product_id_canonical` 컬럼 제거 (선택사항)

### 4. 서버 재시작

```bash
pm2 start prepmood-backend
```

## ✅ 완료 기준

- [ ] admin_products.id에 슬래시(`/`) 포함된 ID 없음
- [ ] 모든 참조 테이블의 product_id가 canonical_id로 업데이트됨
- [ ] 참조 무결성 확인 (orphan_count = 0, 모든 테이블)
- [ ] 서버 정상 재시작

## 🧪 스모크 테스트 (GPT 최소 체크리스트)

서버 재시작 후 다음 4개만 확인:

1. **buy.html** - 상품 상세 페이지 접속
2. **옵션 API** - `/api/products/options?product_id=...` 호출
3. **관리자 재고조회** - `/api/admin/stock` 호출
4. **토큰조회** - `/api/admin/stock/products/:productId/tokens` 호출
