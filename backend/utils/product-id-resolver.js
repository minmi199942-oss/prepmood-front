/**
 * Product ID Resolver Utility
 * 
 * 기능:
 * - product_id를 canonical_id로 정규화
 * - product_id를 legacy_id와 canonical_id 둘 다 반환
 * - 모니터링 포함 버전
 */

/**
 * product_id를 canonical_id로 정규화
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @param {Object} connection - MySQL connection
 * @returns {Promise<string|null>} - canonical_id (없으면 null)
 */
async function resolveProductId(productId, connection) {
    if (!productId) return null;
    
    // ⚠️ Cutover 후: id가 이미 canonical_id이므로 단순 조회
    const [products] = await connection.execute(
        `SELECT id
         FROM admin_products 
         WHERE id = ? 
         LIMIT 1`,
        [productId]
    );
    
    if (products.length === 0) {
        return null;
    }
    
    return products[0].id;
}

/**
 * product_id를 legacy_id와 canonical_id 둘 다 반환
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @param {Object} connection - MySQL connection
 * @returns {Promise<Object|null>} - {legacy_id, canonical_id} 또는 null
 */
async function resolveProductIdBoth(productId, connection) {
    if (!productId) return null;
    
    const [products] = await connection.execute(
        `SELECT id AS legacy_id, canonical_id
         FROM admin_products
         WHERE canonical_id = ? OR id = ?
         LIMIT 1`,
        [productId, productId]
    );
    
    if (products.length === 0) {
        return null;
    }
    
    const result = products[0];
    return {
        legacy_id: result.legacy_id,  // admin_products.id (항상 legacy)
        canonical_id: result.canonical_id || result.legacy_id  // canonical_id 또는 id
    };
}

// 모니터링 카운터
let legacyHitCount = 0;
let totalResolveCount = 0;

/**
 * product_id를 canonical_id로 정규화 (모니터링 포함)
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @param {Object} connection - MySQL connection
 * @returns {Promise<string|null>} - canonical_id (없으면 null)
 */
async function resolveProductIdWithLogging(productId, connection) {
    totalResolveCount++;
    
    if (!productId) return null;
    
    const [products] = await connection.execute(
        `SELECT id, canonical_id
         FROM admin_products
         WHERE canonical_id = ? OR id = ?
         LIMIT 1`,
        [productId, productId]
    );
    
    if (products.length === 0) {
        return null;
    }
    
    const result = products[0];
    const canonicalId = result.canonical_id || result.id;
    
    // legacy hit 여부: 입력값이 id로만 매칭되고 canonical_id로는 매칭 안 됐다
    const isLegacyHit = (productId === result.id && result.canonical_id && result.canonical_id !== result.id);
    
    if (isLegacyHit) {
        legacyHitCount++;
        // 주기적으로 로그 출력 (1000회마다)
        if (legacyHitCount % 1000 === 0) {
            const rate = ((legacyHitCount / totalResolveCount) * 100).toFixed(2);
            console.log(`[MONITORING] Legacy hit rate: ${rate}% (${legacyHitCount}/${totalResolveCount})`);
        }
    }
    
    return canonicalId;
}

module.exports = {
    resolveProductId,
    resolveProductIdBoth,
    resolveProductIdWithLogging
};
