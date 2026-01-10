/**
 * products.xlsx의 제품명 목록 확인
 */

const XLSX = require('xlsx');
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'products.xlsx');

try {
    const workbook = XLSX.readFile(XLSX_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log('=== products.xlsx의 제품명 목록 ===');
    const productNames = [...new Set(data.map(row => row.product_name).filter(Boolean))];
    
    productNames.forEach((name, i) => {
        console.log(`${i + 1}. ${name}`);
    });
    
    console.log(`\n총 ${productNames.length}개의 고유 제품명`);
    
} catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
}
