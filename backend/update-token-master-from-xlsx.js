/**
 * 기존 token_master 데이터를 xlsx 파일의 데이터로 업데이트
 * 
 * 역할:
 * 1. products.xlsx 파일 읽기 (serial_number, rot_code, warranty_bottom_code)
 * 2. 기존 token_master 데이터와 product_name으로 매칭
 * 3. serial_number, rot_code, warranty_bottom_code 업데이트
 * 
 * 실행 방법:
 * node backend/update-token-master-from-xlsx.js
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const mysql = require('mysql2/promise');
const Logger = require('./logger');

// xlsx 파일 경로 (프로젝트 루트)
const XLSX_PATH = path.join(__dirname, '..', 'products.xlsx');

// DB 설정
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'prepmood_user',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'prepmood',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

/**
 * xlsx 파일 읽기 및 파싱
 * @returns {Array} 제품 배열 [{serial_number, rot_code, warranty_bottom_code, product_name}, ...]
 */
function readXlsxFile() {
    try {
        console.log('[UPDATE] xlsx 파일 읽는 중:', XLSX_PATH);
        Logger.log('[UPDATE] xlsx 파일 읽는 중:', XLSX_PATH);
        
        const workbook = XLSX.readFile(XLSX_PATH);
        console.log('[UPDATE] workbook 읽기 완료, 시트 개수:', workbook.SheetNames.length);
        Logger.log('[UPDATE] workbook 읽기 완료, 시트 개수:', workbook.SheetNames.length);
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // JSON 형식으로 변환 (헤더 기반)
        const data = XLSX.utils.sheet_to_json(worksheet);
        console.log(`[UPDATE] 시트 "${sheetName}"에서 ${data.length}개 행 발견`);
        Logger.log(`[UPDATE] 시트 "${sheetName}"에서 ${data.length}개 행 발견`);
        
        // 디버깅: 첫 번째 행 확인
        if (data.length > 0) {
            console.log('[UPDATE] 첫 번째 행 샘플:', JSON.stringify(data[0], null, 2));
            console.log('[UPDATE] 첫 번째 행의 모든 키:', Object.keys(data[0]));
            Logger.log('[UPDATE] 첫 번째 행 샘플:', JSON.stringify(data[0], null, 2));
            Logger.log('[UPDATE] 첫 번째 행의 모든 키:', Object.keys(data[0]));
        } else {
            console.log('[UPDATE] ⚠️ 데이터 행이 없습니다!');
            Logger.warn('[UPDATE] ⚠️ 데이터 행이 없습니다!');
        }
        
        // 데이터 정제
        const products = [];
        let skippedNoProductName = 0;
        let skippedNoData = 0;
        
        for (const row of data) {
            // 컬럼명에 공백이 있을 수 있으므로 trim 처리
            const serialNumber = String(row['serial_number '] || row['serial_number'] || '').trim();
            const rotCode = String(row['rot_code '] || row['rot_code'] || '').trim();
            const warrantyBottomCode = String(row['warranty_bottom_code '] || row['warranty_bottom_code'] || '').trim();
            const digitalWarrantyCode = String(row['digital_warranty_code '] || row['digital_warranty_code'] || '').trim();
            const digitalWarrantyCollection = String(row['digital_warranty_collection '] || row['digital_warranty_collection'] || '').trim();
            const internalCode = String(row['internal_code '] || row['internal_code'] || '').trim(); // internal_code도 확인
            const productName = String(row['product_name'] || '').trim();
            
            // 필수 필드 확인 (product_name은 필수)
            if (!productName) {
                skippedNoProductName++;
                continue;
            }
            
            // serial_number, rot_code, warranty_bottom_code, internal_code 중 하나라도 있으면 추가
            // internal_code가 있으면 그것을 warranty_bottom_code로 매핑 (호환성)
            if (serialNumber || rotCode || warrantyBottomCode || internalCode) {
                products.push({
                    serial_number: serialNumber || null,
                    rot_code: rotCode || null,
                    warranty_bottom_code: warrantyBottomCode || internalCode || null, // internal_code를 warranty_bottom_code로 사용
                    digital_warranty_code: digitalWarrantyCode || null,
                    digital_warranty_collection: digitalWarrantyCollection || null,
                    product_name: productName,
                    internal_code: internalCode || null // 디버깅용으로 저장
                });
            } else {
                skippedNoData++;
            }
        }
        
        console.log(`[UPDATE] 유효한 제품 데이터 (serial_number/rot_code/warranty_bottom_code 중 하나라도 있는 것): ${products.length}개`);
        console.log(`[UPDATE] 건너뜀: product_name 없음=${skippedNoProductName}개, 데이터 없음=${skippedNoData}개`);
        Logger.log(`[UPDATE] 유효한 제품 데이터 (serial_number/rot_code/warranty_bottom_code 중 하나라도 있는 것): ${products.length}개`);
        Logger.log(`[UPDATE] 건너뜀: product_name 없음=${skippedNoProductName}개, 데이터 없음=${skippedNoData}개`);
        return products;
        
    } catch (error) {
        console.error('[UPDATE] xlsx 파일 읽기 실패:', error);
        Logger.error('[UPDATE] xlsx 파일 읽기 실패:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * token_master 업데이트 메인 함수
 */
async function updateTokenMaster() {
    let connection;
    try {
        Logger.log('='.repeat(50));
        Logger.log('token_master 업데이트 시작 (xlsx → MySQL)');
        Logger.log('='.repeat(50));
        
        // 1. MySQL 연결
        connection = await mysql.createConnection(dbConfig);
        Logger.log('[UPDATE] ✅ MySQL 연결 성공');
        
        // 2. xlsx 파일 읽기
        Logger.log('[UPDATE] xlsx 파일 경로:', XLSX_PATH);
        const fs = require('fs');
        if (!fs.existsSync(XLSX_PATH)) {
            Logger.error('[UPDATE] ❌ xlsx 파일이 존재하지 않습니다:', XLSX_PATH);
            return;
        }
        Logger.log('[UPDATE] ✅ xlsx 파일 존재 확인');
        
        // xlsx 파일 읽기 (에러 처리 강화)
        let products = [];
        try {
            products = readXlsxFile();
            Logger.log(`[UPDATE] readXlsxFile() 완료, 반환된 products.length: ${products.length}`);
        } catch (error) {
            Logger.error('[UPDATE] ❌ readXlsxFile() 에러:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
        
        Logger.log(`[UPDATE] 읽은 제품 데이터: ${products.length}개`);
        if (products.length === 0) {
            Logger.warn('[UPDATE] 업데이트할 제품 데이터가 없습니다.');
            Logger.warn('[UPDATE] 원인 확인: xlsx 파일을 확인하거나 디버깅 로그를 확인하세요.');
            Logger.warn('[UPDATE] readXlsxFile() 함수 내부 로그를 확인하세요.');
            return;
        }
        
        // 3. product_name으로 admin_products 조회 후 product_id로 token_master 업데이트
        Logger.log('[UPDATE] token_master 업데이트 중...');
        let updated = 0;
        let notFound = 0;
        let noChange = 0;
        
        for (const product of products) {
            // 3-1. product_name을 short_name으로 admin_products 조회 (정확히 매칭)
            const normalizedProductName = product.product_name.trim();
            const [adminProducts] = await connection.execute(
                `SELECT id, name, short_name 
                 FROM admin_products 
                 WHERE short_name = ? 
                 LIMIT 1`,
                [normalizedProductName]
            );
            
            if (adminProducts.length === 0) {
                Logger.warn(`[UPDATE] ⚠️  admin_products에서 상품을 찾을 수 없음: "${normalizedProductName}"`);
                Logger.warn(`[UPDATE]    short_name으로 매칭 실패. admin_products 테이블을 확인하세요.`);
                notFound++;
                continue;
            }
            
            const productId = adminProducts[0].id;
            
            // 3-2. product_id로 token_master 조회
            const [tokenRows] = await connection.execute(
                `SELECT token_pk, product_name, product_id, serial_number, rot_code, warranty_bottom_code
                 FROM token_master
                 WHERE product_id = ?`,
                [productId]
            );
            
            if (tokenRows.length === 0) {
                Logger.warn(`[UPDATE] ⚠️  token_master에서 product_id=${productId}인 토큰을 찾을 수 없음: ${product.product_name}`);
                notFound++;
                continue;
            }
            
            // 각 매칭된 토큰에 대해 업데이트
            for (const tokenRow of tokenRows) {
                // 값이 변경되었는지 확인
                const hasChange = 
                    (product.serial_number && tokenRow.serial_number !== product.serial_number) ||
                    (product.rot_code && tokenRow.rot_code !== product.rot_code) ||
                    (product.warranty_bottom_code && tokenRow.warranty_bottom_code !== product.warranty_bottom_code) ||
                    (product.digital_warranty_code && tokenRow.digital_warranty_code !== product.digital_warranty_code) ||
                    (product.digital_warranty_collection && tokenRow.digital_warranty_collection !== product.digital_warranty_collection);
                
                if (!hasChange && tokenRow.serial_number && tokenRow.rot_code && tokenRow.warranty_bottom_code) {
                    // 이미 모든 값이 있으면 스킵
                    noChange++;
                    continue;
                }
                
                // 업데이트 (NULL이 아닌 값만 업데이트)
                const updateFields = [];
                const updateValues = [];
                
                if (product.serial_number) {
                    updateFields.push('serial_number = ?');
                    updateValues.push(product.serial_number);
                }
                if (product.rot_code) {
                    updateFields.push('rot_code = ?');
                    updateValues.push(product.rot_code);
                }
                if (product.warranty_bottom_code) {
                    updateFields.push('warranty_bottom_code = ?');
                    updateValues.push(product.warranty_bottom_code);
                }
                if (product.digital_warranty_code) {
                    updateFields.push('digital_warranty_code = ?');
                    updateValues.push(product.digital_warranty_code);
                }
                if (product.digital_warranty_collection) {
                    updateFields.push('digital_warranty_collection = ?');
                    updateValues.push(product.digital_warranty_collection);
                }
                
                if (updateFields.length > 0) {
                    updateFields.push('updated_at = NOW()');
                    updateValues.push(tokenRow.token_pk);
                    
                    await connection.execute(
                        `UPDATE token_master
                         SET ${updateFields.join(', ')}
                         WHERE token_pk = ?`,
                        updateValues
                    );
                    
                    updated++;
                    Logger.log(`[UPDATE] ✅ token_pk=${tokenRow.token_pk} 업데이트: ${product.product_name}`);
                }
            }
        }
        
        Logger.log('='.repeat(50));
        Logger.log('✅ token_master 업데이트 완료!');
        Logger.log(`   - 처리된 제품: ${products.length}개`);
        Logger.log(`   - 업데이트 성공: ${updated}개`);
        Logger.log(`   - 변경 없음: ${noChange}개`);
        Logger.log(`   - 매칭 실패: ${notFound}개`);
        Logger.log('='.repeat(50));
        
        // 4. 업데이트 결과 확인
        const [resultRows] = await connection.execute(
            `SELECT 
                COUNT(*) as total,
                COUNT(serial_number) as with_serial_number,
                COUNT(rot_code) as with_rot_code,
                COUNT(warranty_bottom_code) as with_warranty_bottom_code
            FROM token_master`
        );
        
        Logger.log('\n📋 업데이트 결과 통계:');
        Logger.log(`   - 전체 토큰: ${resultRows[0].total}개`);
        Logger.log(`   - serial_number 있는 토큰: ${resultRows[0].with_serial_number}개`);
        Logger.log(`   - rot_code 있는 토큰: ${resultRows[0].with_rot_code}개`);
        Logger.log(`   - warranty_bottom_code 있는 토큰: ${resultRows[0].with_warranty_bottom_code}개`);
        
    } catch (error) {
        Logger.error('[UPDATE] 업데이트 실패:', {
            message: error.message,
            code: error.code
        });
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    updateTokenMaster()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            Logger.error('[UPDATE] 오류:', {
                message: error.message,
                code: error.code
            });
            process.exit(1);
        });
}

module.exports = {
    updateTokenMaster,
    readXlsxFile
};
