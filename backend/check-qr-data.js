/**
 * QR 코드 데이터 확인 스크립트
 * - DB에 있는 제품 개수 확인
 * - internal_code 중복 확인
 * - QR 코드 파일 개수 확인
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'prep.db');
const OUTPUT_DIR = path.join(__dirname, '..', 'output_qrcodes');

console.log('='.repeat(60));
console.log('QR 코드 데이터 확인');
console.log('='.repeat(60));

// DB 연결
const db = new Database(DB_PATH);

// 1. DB 제품 개수
const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get();
console.log(`\n📊 DB 제품 개수: ${totalProducts.count}개`);

// 2. internal_code 중복 확인
const duplicates = db.prepare(`
    SELECT internal_code, COUNT(*) as cnt 
    FROM products 
    GROUP BY internal_code 
    HAVING cnt > 1
`).all();

if (duplicates.length > 0) {
    console.log(`\n⚠️  중복된 internal_code 발견: ${duplicates.length}개`);
    duplicates.forEach(dup => {
        console.log(`   - ${dup.internal_code}: ${dup.cnt}개`);
    });
} else {
    console.log('\n✅ internal_code 중복 없음');
}

// 3. QR 코드 파일 확인
if (fs.existsSync(OUTPUT_DIR)) {
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
    console.log(`\n📁 QR 코드 파일 개수: ${files.length}개`);
    
    // 파일명에서 internal_code 추출
    const fileCodes = files.map(f => f.replace('.png', ''));
    
    // DB에는 있지만 파일이 없는 경우
    const dbCodes = db.prepare('SELECT DISTINCT internal_code FROM products').all().map(r => r.internal_code);
    const missingFiles = dbCodes.filter(code => !fileCodes.includes(code));
    
    if (missingFiles.length > 0) {
        console.log(`\n⚠️  파일이 없는 제품: ${missingFiles.length}개`);
        missingFiles.slice(0, 5).forEach(code => {
            console.log(`   - ${code}`);
        });
        if (missingFiles.length > 5) {
            console.log(`   ... 외 ${missingFiles.length - 5}개`);
        }
    }
    
    // 파일은 있지만 DB에 없는 경우
    const extraFiles = fileCodes.filter(code => !dbCodes.includes(code));
    if (extraFiles.length > 0) {
        console.log(`\n⚠️  DB에 없는 파일: ${extraFiles.length}개`);
        extraFiles.slice(0, 5).forEach(code => {
            console.log(`   - ${code}.png`);
        });
        if (extraFiles.length > 5) {
            console.log(`   ... 외 ${extraFiles.length - 5}개`);
        }
    }
    
    // 파일명 중복 확인
    const fileCounts = {};
    fileCodes.forEach(code => {
        fileCounts[code] = (fileCounts[code] || 0) + 1;
    });
    const duplicateFiles = Object.entries(fileCounts).filter(([code, count]) => count > 1);
    if (duplicateFiles.length > 0) {
        console.log(`\n⚠️  중복된 파일명: ${duplicateFiles.length}개`);
        duplicateFiles.forEach(([code, count]) => {
            console.log(`   - ${code}.png: ${count}개`);
        });
    }
} else {
    console.log('\n❌ QR 코드 폴더가 없습니다:', OUTPUT_DIR);
}

// 4. 샘플 데이터
console.log('\n📋 샘플 제품 (처음 5개):');
const samples = db.prepare('SELECT internal_code, product_name, token FROM products LIMIT 5').all();
samples.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.internal_code} - ${p.product_name}`);
    console.log(`      토큰: ${p.token}`);
    console.log(`      URL: https://prepmood.kr/a/${p.token}`);
});

db.close();

console.log('\n' + '='.repeat(60));

