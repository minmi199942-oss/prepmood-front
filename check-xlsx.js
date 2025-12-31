// xlsx 파일 구조 확인 스크립트
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'products.xlsx');

try {
    console.log('📄 파일 읽는 중:', filePath);
    const workbook = XLSX.readFile(filePath);
    
    // 첫 번째 시트 이름
    const sheetName = workbook.SheetNames[0];
    console.log('\n📋 시트 이름:', sheetName);
    
    // 시트 데이터 읽기
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log('\n📊 데이터 구조:');
    console.log('='.repeat(50));
    
    // 첫 5행만 출력
    const previewRows = Math.min(5, data.length);
    for (let i = 0; i < previewRows; i++) {
        console.log(`행 ${i + 1}:`, data[i]);
    }
    
    if (data.length > 5) {
        console.log(`... (총 ${data.length}행)`);
    }
    
    // 헤더 확인
    if (data.length > 0) {
        console.log('\n📌 헤더 (첫 번째 행):');
        console.log(data[0]);
        
        // JSON 형식으로 변환 (헤더 기반)
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        if (jsonData.length > 0) {
            console.log('\n📦 JSON 형식 샘플 (첫 번째 행):');
            console.log(JSON.stringify(jsonData[0], null, 2));
        }
    }
    
    console.log('\n✅ 파일 읽기 완료!');
    
} catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.log('\n💡 xlsx 라이브러리가 설치되어 있지 않을 수 있습니다.');
    console.log('   다음 명령어로 설치하세요: npm install xlsx');
}








