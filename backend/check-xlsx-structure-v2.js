/**
 * XLSX 파일 구조 확인 스크립트 (정확한 확인)
 */
const XLSX = require('xlsx');
const path = require('path');

// 파일명에 공백이 있을 수 있으므로 두 가지 모두 시도
const XLSX_PATH_NORMAL = path.join(__dirname, '..', 'products.xlsx');
const XLSX_PATH_SPACE = path.join(__dirname, '..', 'products .xlsx');
const fs = require('fs');
const XLSX_PATH = fs.existsSync(XLSX_PATH_SPACE) ? XLSX_PATH_SPACE : XLSX_PATH_NORMAL;

try {
    console.log('📄 XLSX 파일 읽는 중:', XLSX_PATH);
    const workbook = XLSX.readFile(XLSX_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 원시 데이터 확인 (첫 2행)
    console.log('\n🔍 원시 데이터 확인 (첫 2행):');
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    console.log('첫 번째 행:', rawData[0]);
    console.log('두 번째 행:', rawData[1]);
    
    // 헤더 기반으로 읽기 (기본 동작)
    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log(`\n📊 헤더 기반 읽기 결과: ${data.length}개 행`);
    
    if (data.length > 0) {
        console.log('\n📋 첫 번째 데이터 행의 키들:');
        const keys = Object.keys(data[0]);
        keys.forEach((key, idx) => {
            console.log(`  ${idx + 1}. "${key}"`);
        });
        
        console.log('\n📋 첫 번째 데이터 행의 값들:');
        const firstRow = data[0];
        keys.forEach(key => {
            console.log(`  ${key}: "${firstRow[key]}"`);
        });
        
        // 헤더인지 확인
        const firstRowValues = Object.values(firstRow);
        const isHeader = firstRowValues.some(val => 
            ['serial_number', 'rot_code', 'warranty_bottom_code', 'product_name', 'digital_warranty_code', 'digital_warranty_collection']
            .includes(String(val).toLowerCase().trim())
        );
        
        console.log(`\n🔍 첫 번째 행이 헤더인가요? ${isHeader ? '✅ 예' : '❌ 아니오 (데이터)'}`);
        
        if (!isHeader && data.length > 1) {
            console.log('\n📋 두 번째 데이터 행:');
            const secondRow = data[1];
            keys.forEach(key => {
                console.log(`  ${key}: "${secondRow[key]}"`);
            });
        }
    }
    
} catch (error) {
    console.error('❌ 오류:', error.message);
    console.error(error.stack);
    process.exit(1);
}
