/**
 * XLSX 파일 구조 확인 스크립트
 */
const XLSX = require('xlsx');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'products.xlsx');

try {
    console.log('📄 XLSX 파일 읽는 중:', XLSX_PATH);
    const workbook = XLSX.readFile(XLSX_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 헤더 확인 (첫 번째 행이 헤더인지 데이터인지 확인)
    const firstRow = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1 })[0];
    console.log('\n✅ 첫 번째 행:');
    firstRow.forEach((col, idx) => {
        console.log(`  ${idx + 1}. "${col}"`);
    });
    
    // 헤더가 있는지 확인 (첫 번째 행이 컬럼명처럼 보이는지)
    const hasHeader = firstRow.some(cell => 
        ['serial_number', 'rot_code', 'warranty_bottom_code', 'product_name', 'digital_warranty_code', 'digital_warranty_collection']
        .includes(String(cell).toLowerCase().trim())
    );
    
    console.log(`\n📋 헤더 행 존재 여부: ${hasHeader ? '✅ 있음' : '❌ 없음 (첫 번째 행이 데이터)'}`);
    
    // 샘플 데이터 읽기 (헤더 없이 읽기)
    const data = XLSX.utils.sheet_to_json(worksheet, { header: ['serial_number', 'rot_code', 'warranty_bottom_code', 'product_name', 'digital_warranty_code', 'digital_warranty_collection'] });
    console.log(`\n📊 총 행 수: ${data.length}개`);
    
    if (data.length > 0) {
        console.log('\n📋 샘플 데이터 (첫 번째 행):');
        const sample = data[0];
        Object.keys(sample).forEach(key => {
            const value = sample[key];
            console.log(`  ${key}: "${value}"`);
        });
    }
    
    // 필수 컬럼 확인
    console.log('\n🔍 필수 컬럼 확인:');
    const requiredColumns = ['product_name'];
    const optionalColumns = ['serial_number', 'rot_code', 'warranty_bottom_code', 'digital_warranty_code', 'digital_warranty_collection'];
    
    if (data.length > 0) {
        const sampleKeys = Object.keys(data[0]);
        requiredColumns.forEach(col => {
            const found = sampleKeys.includes(col);
            console.log(`  ${col}: ${found ? '✅' : '❌'}`);
        });
        
        console.log('\n📝 선택 컬럼 확인:');
        optionalColumns.forEach(col => {
            const found = sampleKeys.includes(col);
            console.log(`  ${col}: ${found ? '✅' : '⚠️  없음 (NULL 허용)'}`);
        });
    }
    
} catch (error) {
    console.error('❌ 오류:', error.message);
    process.exit(1);
}
