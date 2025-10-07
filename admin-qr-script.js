// API 기본 URL
const API_BASE_URL = window.location.origin;

// DOM 요소
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const singleQrForm = document.getElementById('singleQrForm');
const qrResult = document.getElementById('qrResult');
const qrCanvas = document.getElementById('qrCanvas');
const qrSerial = document.getElementById('qrSerial');
const qrCodeText = document.getElementById('qrCodeText');
const downloadPngBtn = document.getElementById('downloadPng');
const downloadLabelBtn = document.getElementById('downloadLabel');
const resetFormBtn = document.getElementById('resetForm');

// 대량 생성 요소
const uploadArea = document.getElementById('uploadArea');
const uploadBtn = document.getElementById('uploadBtn');
const csvFileInput = document.getElementById('csvFile');
const downloadTemplateBtn = document.getElementById('downloadTemplate');
const bulkProgress = document.getElementById('bulkProgress');
const bulkResult = document.getElementById('bulkResult');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const bulkStats = document.getElementById('bulkStats');
const downloadAllBtn = document.getElementById('downloadAll');

// QR 목록 요소
const searchInput = document.getElementById('searchInput');
const refreshListBtn = document.getElementById('refreshList');
const listLoading = document.getElementById('listLoading');
const qrTableContainer = document.getElementById('qrTableContainer');
const qrTableBody = document.getElementById('qrTableBody');
const listEmpty = document.getElementById('listEmpty');

// 현재 생성된 QR 데이터
let currentQrData = null;
let bulkQrData = [];

// 탭 전환
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // 탭 버튼 활성화
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 탭 콘텐츠 표시
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === `${tab}-tab`) {
                content.classList.add('active');
            }
        });
        
        // QR 목록 탭이면 데이터 로드
        if (tab === 'list') {
            loadQrList();
        }
    });
});

// 단일 QR 생성
singleQrForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(singleQrForm);
    const productData = {
        serial: formData.get('serial'),
        name: formData.get('name'),
        category: formData.get('category'),
        price: formData.get('price'),
        description: formData.get('description') || ''
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/qrcode/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentQrData = data;
            displayQrCode(data);
        } else {
            alert(data.error || 'QR 코드 생성에 실패했습니다.');
        }
    } catch (error) {
        console.error('QR 생성 오류:', error);
        alert('서버 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    }
});

// QR 코드 표시
function displayQrCode(data) {
    const { qrCode, product } = data;
    
    // QR 코드 생성
    QRCode.toCanvas(qrCanvas, qrCode, {
        width: 300,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });
    
    // 정보 표시
    qrSerial.textContent = product.serial;
    qrCodeText.textContent = qrCode;
    
    // 폼 숨기고 결과 표시
    singleQrForm.parentElement.style.display = 'none';
    qrResult.style.display = 'block';
}

// PNG 다운로드
downloadPngBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `QR_${currentQrData.product.serial}.png`;
    link.href = qrCanvas.toDataURL();
    link.click();
});

// 라벨 인쇄용 다운로드
downloadLabelBtn.addEventListener('click', () => {
    // 라벨용 캔버스 생성
    const labelCanvas = document.createElement('canvas');
    const ctx = labelCanvas.getContext('2d');
    
    labelCanvas.width = 600;
    labelCanvas.height = 800;
    
    // 배경
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
    
    // QR 코드
    ctx.drawImage(qrCanvas, 150, 100, 300, 300);
    
    // 제품명
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(currentQrData.product.name, 300, 460);
    
    // 시리얼 번호
    ctx.font = '24px Arial';
    ctx.fillText(currentQrData.product.serial, 300, 500);
    
    // QR 코드 텍스트
    ctx.font = '12px Courier New';
    const code = currentQrData.qrCode;
    const maxWidth = 550;
    const words = code.match(/.{1,40}/g);
    words.forEach((word, index) => {
        ctx.fillText(word, 300, 540 + (index * 20));
    });
    
    // Pre.p Mood 로고/텍스트
    ctx.font = 'bold 20px Arial';
    ctx.fillText('Pre.p Mood', 300, 720);
    ctx.font = '14px Arial';
    ctx.fillText('정품 인증 제품', 300, 750);
    
    // 다운로드
    const link = document.createElement('a');
    link.download = `Label_${currentQrData.product.serial}.png`;
    link.href = labelCanvas.toDataURL();
    link.click();
});

// 폼 초기화
resetFormBtn.addEventListener('click', () => {
    singleQrForm.reset();
    singleQrForm.parentElement.style.display = 'block';
    qrResult.style.display = 'none';
    currentQrData = null;
});

// CSV 업로드
uploadBtn.addEventListener('click', () => {
    csvFileInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        processCsvFile(file);
    } else {
        alert('CSV 파일만 업로드 가능합니다.');
    }
});

csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processCsvFile(file);
    }
});

// CSV 파일 처리
async function processCsvFile(file) {
    const text = await file.text();
    const lines = text.trim().split('\n');
    
    // 헤더 제거
    const dataLines = lines.slice(1);
    
    const products = dataLines.map(line => {
        const [serial, name, category, price, description] = line.split(',');
        return {
            serial: serial.trim(),
            name: name.trim(),
            category: category.trim(),
            price: price.trim(),
            description: (description || '').trim()
        };
    });
    
    // 대량 생성 시작
    await generateBulkQr(products);
}

// 대량 QR 생성
async function generateBulkQr(products) {
    uploadArea.style.display = 'none';
    bulkProgress.style.display = 'block';
    bulkQrData = [];
    
    const total = products.length;
    let completed = 0;
    
    for (const product of products) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/qrcode/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(product)
            });
            
            const data = await response.json();
            
            if (data.success) {
                bulkQrData.push(data);
            }
        } catch (error) {
            console.error(`QR 생성 오류 (${product.serial}):`, error);
        }
        
        completed++;
        updateProgress(completed, total);
    }
    
    // 완료
    bulkProgress.style.display = 'none';
    bulkResult.style.display = 'block';
    bulkStats.textContent = `총 ${total}개 중 ${bulkQrData.length}개 생성 완료`;
}

// 진행률 업데이트
function updateProgress(completed, total) {
    const percent = (completed / total) * 100;
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${completed} / ${total}`;
}

// 전체 다운로드 (ZIP)
downloadAllBtn.addEventListener('click', async () => {
    // 간단한 구현: 각 QR을 개별 다운로드
    // 실제 프로덕션에서는 JSZip 라이브러리 사용 권장
    
    for (let i = 0; i < bulkQrData.length; i++) {
        const data = bulkQrData[i];
        const canvas = document.createElement('canvas');
        
        await new Promise((resolve) => {
            QRCode.toCanvas(canvas, data.qrCode, {
                width: 300,
                margin: 2
            }, () => {
                const link = document.createElement('a');
                link.download = `QR_${data.product.serial}.png`;
                link.href = canvas.toDataURL();
                link.click();
                
                setTimeout(resolve, 200);
            });
        });
    }
    
    alert('모든 QR 코드 다운로드가 완료되었습니다!');
});

// CSV 템플릿 다운로드
downloadTemplateBtn.addEventListener('click', () => {
    const template = 'serial,name,category,price,description\nPM-001,Slim Fit Jeans,하의,149000,프리미엄 데님 재질\nPM-002,Classic T-Shirt,상의,89000,100% 면 소재\n';
    
    const blob = new Blob([template], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = 'qr_template.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
});

// QR 목록 로드
async function loadQrList() {
    listLoading.style.display = 'flex';
    qrTableContainer.style.display = 'none';
    listEmpty.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/qrcode/list`);
        const data = await response.json();
        
        listLoading.style.display = 'none';
        
        if (data.success && data.qrCodes && data.qrCodes.length > 0) {
            displayQrList(data.qrCodes);
        } else {
            listEmpty.style.display = 'flex';
        }
    } catch (error) {
        console.error('QR 목록 로드 오류:', error);
        listLoading.style.display = 'none';
        listEmpty.style.display = 'flex';
    }
}

// QR 목록 표시
function displayQrList(qrCodes) {
    qrTableBody.innerHTML = '';
    
    qrCodes.forEach(qr => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${qr.serial}</td>
            <td>${qr.name}</td>
            <td>${qr.category}</td>
            <td>₩${Number(qr.price).toLocaleString()}</td>
            <td>${new Date(qr.created_at).toLocaleDateString('ko-KR')}</td>
            <td><span class="status-badge ${qr.is_valid ? 'valid' : 'invalid'}">${qr.is_valid ? '유효' : '무효'}</span></td>
            <td>
                <button class="btn-table-action" onclick="viewQr('${qr.qr_code}')">보기</button>
                <button class="btn-table-action danger" onclick="invalidateQr('${qr.serial}')">무효화</button>
            </td>
        `;
        qrTableBody.appendChild(row);
    });
    
    qrTableContainer.style.display = 'block';
}

// QR 보기
function viewQr(qrCode) {
    window.open(`/authenticity?code=${encodeURIComponent(qrCode)}`, '_blank');
}

// QR 무효화
async function invalidateQr(serial) {
    if (!confirm(`정말 ${serial} QR 코드를 무효화하시겠습니까?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/qrcode/invalidate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ serial })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('QR 코드가 무효화되었습니다.');
            loadQrList();
        } else {
            alert(data.error || '무효화에 실패했습니다.');
        }
    } catch (error) {
        console.error('QR 무효화 오류:', error);
        alert('서버 오류가 발생했습니다.');
    }
}

// 새로고침
refreshListBtn.addEventListener('click', loadQrList);

// 검색
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const rows = qrTableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    });
});

