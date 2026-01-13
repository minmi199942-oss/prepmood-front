/**
 * Product ID Resolver Utility
 * 
 * ⚠️ Cutover 후: id가 이미 canonical이므로 단순 조회만 수행
 */

/**
 * product_id 확인 (cutover 후 id가 이미 canonical)
 * @param {string} productId - 입력 product_id
 * @param {Object} connection - MySQL connection
 * @returns {Promise<string|null>} - product_id (없으면 null)
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
 * product_id 확인 (cutover 후 id가 이미 canonical)
 * @param {string} productId - 입력 product_id
 * @param {Object} connection - MySQL connection
 * @returns {Promise<Object|null>} - {legacy_id, canonical_id} (둘 다 같은 값) 또는 null
 */
async function resolveProductIdBoth(productId, connection) {
    if (!productId) return null;
    
    // ⚠️ Cutover 후: id가 이미 canonical_id이므로 둘 다 같은 값
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
    
    const canonicalId = products[0].id;
    return {
        legacy_id: canonicalId,  // cutover 후 id가 canonical
        canonical_id: canonicalId  // cutover 후 id가 canonical
    };
}

// 모니터링 카운터
let legacyHitCount = 0;
let totalResolveCount = 0;

/**
 * product_id 확인 (모니터링 포함, cutover 후 단순화)
 * @param {string} productId - 입력 product_id
 * @param {Object} connection - MySQL connection
 * @returns {Promise<string|null>} - product_id (없으면 null)
 */
async function resolveProductIdWithLogging(productId, connection) {
    totalResolveCount++;
    
    if (!productId) return null;
    
    // ⚠️ Cutover 후: id가 이미 canonical이므로 단순 조회
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

module.exports = {
    resolveProductId,
    resolveProductIdBoth,
    resolveProductIdWithLogging
};
