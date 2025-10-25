// API 기본 URL 설정
const API_BASE_URL = window.location.origin;

// 사용자 이메일 가져오기 (JWT 기반)
async function getUserEmail() {
    try {
        const response = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        const data = await response.json();
        return data.success && data.user ? data.user.email : null;
    } catch (error) {
        return null;
    }
}

// DOM 요소
const scanButton = document.getElementById('scanButton');
const codeForm = document.getElementById('codeForm');
const codeInput = document.getElementById('codeInput');
const resultSection = document.getElementById('resultSection');
const resultCard = document.getElementById('resultCard');
const loadingState = document.getElementById('loadingState');
const qrModal = document.getElementById('qrModal');
const closeModal = document.getElementById('closeModal');
const qrVideo = document.getElementById('qrVideo');

// QR 스캔 라이브러리 (html5-qrcode)
let html5QrCode = null;

// 페이지 로드 시 URL 파라미터 확인
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
        codeInput.value = code;
        verifyCode(code);
    }
});

// QR 스캔 버튼 클릭
scanButton.addEventListener('click', async () => {
    // 카메라 권한 요청 및 QR 스캔 시작
    try {
        // html5-qrcode 라이브러리가 로드되지 않은 경우
        if (typeof Html5Qrcode === 'undefined') {
            alert('QR 스캔 기능을 사용하려면 카메라가 필요합니다.\n\n대신 코드를 직접 입력해주세요.');
            codeInput.focus();
            return;
        }

        qrModal.style.display = 'flex';
        
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("qrVideo");
        }

        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            onScanSuccess,
            onScanError
        );
    } catch (err) {
        console.error('카메라 시작 오류:', err);
        alert('카메라에 접근할 수 없습니다.\n\n설정에서 카메라 권한을 허용해주세요.');
        qrModal.style.display = 'none';
    }
});

// QR 모달 닫기
closeModal.addEventListener('click', () => {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            qrModal.style.display = 'none';
        }).catch(err => {
            console.error('카메라 중지 오류:', err);
            qrModal.style.display = 'none';
        });
    } else {
        qrModal.style.display = 'none';
    }
});

// QR 스캔 성공
function onScanSuccess(decodedText, decodedResult) {
    console.log('QR 스캔 성공:', decodedText);
    
    // QR 스캔 중지
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            qrModal.style.display = 'none';
            codeInput.value = decodedText;
            verifyCode(decodedText);
        });
    }
}

// QR 스캔 오류 (무시)
function onScanError(errorMessage) {
    // 스캔 실패는 정상적인 상황이므로 무시
}

// 코드 폼 제출
codeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    
    if (!code) {
        alert('코드를 입력해주세요.');
        return;
    }
    
    verifyCode(code);
});

// QR 코드 검증
async function verifyCode(code) {
    // 로딩 시작
    loadingState.style.display = 'flex';
    resultSection.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE_URL}/authenticity?code=${encodeURIComponent(code)}`);
        const data = await response.json();
        
        // 로딩 종료
        loadingState.style.display = 'none';
        
        if (data.success) {
            displayResult(data);
        } else {
            displayError(data.error || '유효하지 않은 QR 코드입니다.');
        }
    } catch (error) {
        console.error('검증 오류:', error);
        loadingState.style.display = 'none';
        displayError('서버 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    }
}

// 결과 표시
function displayResult(data) {
    const { product, status, ownership } = data;
    
    let statusHTML = '';
    let actionHTML = '';
    
    if (status === 'unregistered') {
        statusHTML = `
            <div class="result-status success">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <h3>정품 확인</h3>
                <p>프레피무드 정품 제품입니다</p>
            </div>
            <div class="ownership-status unregistered">
                <p>이 제품은 아직 등록되지 않았습니다</p>
            </div>
        `;
        
        const userEmail = await getUserEmail();
        if (userEmail) {
            actionHTML = `
                <button class="btn-register" onclick="registerProduct('${product.serial}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <line x1="20" y1="8" x2="20" y2="14"/>
                        <line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    내 제품으로 등록하기
                </button>
            `;
        } else {
            actionHTML = `
                <button class="btn-login" onclick="window.location.href='login.html?redirect=authenticity.html?code=${encodeURIComponent(codeInput.value)}'">
                    로그인하고 제품 등록하기
                </button>
            `;
        }
    } else if (status === 'registered' && ownership) {
        statusHTML = `
            <div class="result-status success">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <h3>정품 확인 및 등록됨</h3>
                <p>프레피무드 정품 제품이며 소유권이 등록되었습니다</p>
            </div>
            <div class="ownership-status registered">
                <p>등록자: ${ownership.user_email}</p>
                <p>등록일: ${new Date(ownership.registered_at).toLocaleDateString('ko-KR')}</p>
            </div>
        `;
    }
    
    resultCard.innerHTML = `
        ${statusHTML}
        <div class="product-details">
            <h4>제품 정보</h4>
            <div class="detail-row">
                <span class="detail-label">시리얼 번호</span>
                <span class="detail-value">${escapeHtml(product.serial)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">제품명</span>
                <span class="detail-value">${escapeHtml(product.name)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">카테고리</span>
                <span class="detail-value">${escapeHtml(product.category)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">가격</span>
                <span class="detail-value">₩${Number(product.price).toLocaleString()}</span>
            </div>
            ${product.description ? `
            <div class="detail-row">
                <span class="detail-label">설명</span>
                <span class="detail-value">${escapeHtml(product.description)}</span>
            </div>
            ` : ''}
        </div>
        ${actionHTML}
    `;
    
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 오류 표시
function displayError(message) {
    resultCard.innerHTML = `
        <div class="result-status error">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <h3>확인 실패</h3>
            <p>${escapeHtml(message)}</p>
        </div>
        <button class="btn-retry" onclick="location.reload()">다시 시도</button>
    `;
    
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 제품 등록
async function registerProduct(serial) {
    const userEmail = await getUserEmail();
    
    if (!userEmail) {
        alert('로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    
    try {
        const code = codeInput.value.trim();
        const response = await fetch(`${API_BASE_URL}/api/qrcode/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Email': userEmail
            },
            credentials: 'include',
            body: JSON.stringify({ qrCode: code })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('제품이 성공적으로 등록되었습니다!');
            verifyCode(code); // 결과 새로고침
        } else {
            alert(data.error || '등록에 실패했습니다.');
        }
    } catch (error) {
        console.error('등록 오류:', error);
        alert('서버 오류가 발생했습니다. 나중에 다시 시도해주세요.');
    }
}

