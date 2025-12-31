/**
 * 토큰 확인 스크립트
 * 
 * 사용법:
 * node check-token.js                    # 모든 토큰 목록
 * node check-token.js <internal_code>    # 특정 제품의 토큰 확인
 * node check-token.js --token <token>    # 토큰으로 제품 정보 확인
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'prep.db');
const BASE_URL = process.env.AUTH_BASE_URL || 'https://prepmood.kr/a/';

// 인자 파싱
const args = process.argv.slice(2);
const internalCode = args.find(arg => !arg.startsWith('--'));
const tokenArg = args.find(arg => arg.startsWith('--token'));
const token = tokenArg ? tokenArg.split('=')[1] : null;

const db = new Database(DB_PATH);

try {
    if (token) {
        // 토큰으로 제품 정보 조회
        const product = db.prepare(`
            SELECT token, internal_code, product_name, status, scan_count, 
                   first_verified_at, last_verified_at
            FROM products
            WHERE token = ?
        `).get(token);

        if (product) {
            console.log('='.repeat(60));
            console.log('📋 제품 정보');
            console.log('='.repeat(60));
            console.log(`제품명: ${product.product_name}`);
            console.log(`상품번호: ${product.internal_code}`);
            console.log(`토큰: ${product.token}`);
            console.log(`상태: ${product.status === 0 ? '미인증' : product.status === 1 ? '인증됨' : '주의'}`);
            console.log(`스캔 횟수: ${product.scan_count}회`);
            if (product.first_verified_at) {
                console.log(`최초 인증일: ${product.first_verified_at}`);
            }
            if (product.last_verified_at) {
                console.log(`마지막 인증일: ${product.last_verified_at}`);
            }
            console.log(`URL: ${BASE_URL}${product.token}`);
            console.log('='.repeat(60));
        } else {
            console.log('❌ 해당 토큰을 찾을 수 없습니다.');
        }
    } else if (internalCode) {
        // internal_code로 토큰 조회
        const product = db.prepare(`
            SELECT token, internal_code, product_name, status, scan_count
            FROM products
            WHERE internal_code = ?
        `).get(internalCode);

        if (product) {
            console.log('='.repeat(60));
            console.log('📋 제품 정보');
            console.log('='.repeat(60));
            console.log(`제품명: ${product.product_name}`);
            console.log(`상품번호: ${product.internal_code}`);
            console.log(`토큰: ${product.token}`);
            console.log(`상태: ${product.status === 0 ? '미인증' : product.status === 1 ? '인증됨' : '주의'}`);
            console.log(`스캔 횟수: ${product.scan_count}회`);
            console.log(`URL: ${BASE_URL}${product.token}`);
            console.log('='.repeat(60));
        } else {
            console.log(`❌ 상품번호 "${internalCode}"를 찾을 수 없습니다.`);
        }
    } else {
        // 전체 목록 출력
        const products = db.prepare(`
            SELECT token, internal_code, product_name, status, scan_count
            FROM products
            ORDER BY internal_code
        `).all();

        console.log('='.repeat(60));
        console.log(`📋 전체 제품 목록 (총 ${products.length}개)`);
        console.log('='.repeat(60));
        console.log('');

        products.forEach((p, i) => {
            console.log(`${i + 1}. ${p.internal_code}`);
            console.log(`   제품명: ${p.product_name}`);
            console.log(`   토큰: ${p.token}`);
            console.log(`   상태: ${p.status === 0 ? '미인증' : p.status === 1 ? '인증됨' : '주의'} | 스캔: ${p.scan_count}회`);
            console.log(`   URL: ${BASE_URL}${p.token}`);
            console.log('');
        });

        console.log('='.repeat(60));
        console.log('');
        console.log('💡 사용법:');
        console.log('   node check-token.js <상품번호>          # 특정 제품의 토큰 확인');
        console.log('   node check-token.js --token=<토큰>     # 토큰으로 제품 정보 확인');
        console.log('');
    }
} catch (error) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
} finally {
    db.close();
}








