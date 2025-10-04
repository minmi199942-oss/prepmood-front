// 내 프로필 페이지 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 로그인 상태 확인
    checkLoginStatus();
    
    // 사용자 정보 표시
    displayUserInfo();
    
    // 이벤트 리스너 초기화
    initializeEventListeners();
    
    // 네비게이션 활성화
    initializeNavigation();
});

// 로그인 상태 확인
function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const userData = localStorage.getItem('user');
    
    if (!isLoggedIn || !userData) {
        // 비로그인 상태: 로그인 페이지로 리다이렉트
        alert('로그인이 필요한 페이지입니다.');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// 사용자 정보 표시
function displayUserInfo() {
    const userData = localStorage.getItem('user');
    
    if (userData) {
        try {
            const user = JSON.parse(userData);
            const welcomeText = document.getElementById('user-welcome-text');
            
            if (welcomeText && user.name) {
                welcomeText.textContent = `${user.name}님 환영합니다.`;
            }
            
            // 사용자 정보를 각 필드에 표시
            const nameParts = user.name.split(' ');
            document.getElementById('user-first-name').textContent = nameParts[1] || '';
            document.getElementById('user-last-name').textContent = nameParts[0] || '';
            document.getElementById('user-email').textContent = user.email || '';
            
            // 추가 정보는 기본값으로 설정 (실제로는 API에서 가져와야 함)
            document.getElementById('user-region').textContent = '서울특별시';
            document.getElementById('user-phone').textContent = '+82 10-1234-5678';
            document.getElementById('user-birthdate').textContent = '2002-06-03';
            
        } catch (error) {
            console.error('사용자 정보 파싱 오류:', error);
        }
    }
}

// 이벤트 리스너 초기화
function initializeEventListeners() {
    // 수정 버튼 클릭 이벤트
    const editButtons = document.querySelectorAll('.edit-button');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const field = this.dataset.field;
            handleEditClick(field);
        });
    });

    // 사이드바 닫기 이벤트
    initializeSidebarEvents();
    
    // 폼 제출 이벤트
    initializeFormEvents();
}

// 수정 버튼 클릭 처리
function handleEditClick(field) {
    switch (field) {
        case 'email':
            openEmailSidebar();
            break;
        case 'password':
            openPasswordSidebar();
            break;
        default:
            showNotification('해당 기능은 준비 중입니다.');
    }
}

// 이메일 수정 사이드바 열기
function openEmailSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('email-sidebar');
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // 새 이메일 입력 필드 포커스
    setTimeout(() => {
        document.getElementById('new-email').focus();
    }, 300);
}

// 비밀번호 수정 사이드바 열기
function openPasswordSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('password-sidebar');
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // 현재 비밀번호 입력 필드 포커스
    setTimeout(() => {
        document.getElementById('current-password').focus();
    }, 300);
}

// 사이드바 이벤트 초기화
function initializeSidebarEvents() {
    const overlay = document.getElementById('sidebar-overlay');
    const closeEmailBtn = document.getElementById('close-email-sidebar');
    const closePasswordBtn = document.getElementById('close-password-sidebar');
    
    // 오버레이 클릭으로 사이드바 닫기
    overlay.addEventListener('click', closeAllSidebars);
    
    // 닫기 버튼 클릭
    closeEmailBtn.addEventListener('click', closeAllSidebars);
    closePasswordBtn.addEventListener('click', closeAllSidebars);
    
    // ESC 키로 사이드바 닫기
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllSidebars();
        }
    });
}

// 모든 사이드바 닫기
function closeAllSidebars() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebars = document.querySelectorAll('.edit-sidebar');
    
    overlay.classList.remove('show');
    sidebars.forEach(sidebar => {
        sidebar.classList.remove('show');
    });
    
    // 폼 초기화
    resetAllForms();
}

// 폼 초기화
function resetAllForms() {
    // 이메일 폼 초기화
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
        emailForm.reset();
        clearError('email-error');
    }
    
    // 비밀번호 폼 초기화
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.reset();
        clearError('current-password-error');
        clearError('confirm-password-error');
        updatePasswordSubmitButton();
    }
}

// 폼 이벤트 초기화
function initializeFormEvents() {
    // 이메일 폼
    const emailForm = document.getElementById('email-form');
    emailForm.addEventListener('submit', handleEmailSubmit);
    
    // 비밀번호 폼
    const passwordForm = document.getElementById('password-form');
    passwordForm.addEventListener('submit', handlePasswordSubmit);
    
    // 비밀번호 토글 버튼
    const passwordToggles = document.querySelectorAll('.password-toggle');
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const input = document.getElementById(targetId);
            togglePasswordVisibility(input, this);
        });
    });
    
    // 비밀번호 입력 실시간 검증
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    
    currentPasswordInput.addEventListener('input', updatePasswordSubmitButton);
    newPasswordInput.addEventListener('input', updatePasswordSubmitButton);
    confirmPasswordInput.addEventListener('input', updatePasswordSubmitButton);
}

// 이메일 수정 처리
async function handleEmailSubmit(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('new-email');
    const email = emailInput.value.trim();
    
    // 이메일 유효성 검사
    if (!email) {
        showError('email-error', '올바른 이메일 주소를 입력하세요.');
        return;
    }
    
    if (!isValidEmail(email)) {
        showError('email-error', '올바른 이메일 주소를 입력하세요.');
        return;
    }
    
    try {
        const userData = JSON.parse(localStorage.getItem('user'));
        
        const response = await fetch('https://prepmood.kr/api/update-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: userData.id,
                newEmail: email
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 성공 시
            closeAllSidebars();
            showNotification('수정이 완료되었습니다.');
            
            // 사용자 정보 업데이트
            userData.email = email;
            localStorage.setItem('user', JSON.stringify(userData));
            displayUserInfo();
            
        } else {
            // 실패 시
            showError('email-error', data.message || '이메일 변경에 실패했습니다.');
        }
        
    } catch (error) {
        console.error('이메일 변경 오류:', error);
        showError('email-error', '네트워크 오류가 발생했습니다.');
    }
}

// 비밀번호 수정 처리
async function handlePasswordSubmit(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // 비밀번호 유효성 검사
    if (!validatePasswords(currentPassword, newPassword, confirmPassword)) {
        return;
    }
    
    try {
        const userData = JSON.parse(localStorage.getItem('user'));
        
        const response = await fetch('https://prepmood.kr/api/update-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: userData.id,
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 성공 시
            closeAllSidebars();
            showNotification('수정이 완료되었습니다.');
            
        } else {
            // 실패 시
            showError('current-password-error', data.message || '비밀번호 변경에 실패했습니다.');
        }
        
    } catch (error) {
        console.error('비밀번호 변경 오류:', error);
        showError('current-password-error', '네트워크 오류가 발생했습니다.');
    }
}

// 비밀번호 유효성 검사
function validatePasswords(currentPassword, newPassword, confirmPassword) {
    let isValid = true;
    
    // 현재 비밀번호 확인 (실제로는 서버에서 확인해야 함)
    if (!currentPassword) {
        showError('current-password-error', '현재 비밀번호를 입력하세요.');
        isValid = false;
    }
    
    // 새 비밀번호와 확인 비밀번호 일치 확인
    if (newPassword !== confirmPassword) {
        showError('confirm-password-error', '비밀번호와 비밀번호 확인란이 일치하지 않습니다. 동일한 글자를 입력하세요.');
        isValid = false;
    } else {
        clearError('confirm-password-error');
    }
    
    // 새 비밀번호 길이 확인
    if (newPassword && newPassword.length < 8) {
        showError('confirm-password-error', '비밀번호는 8자 이상이어야 합니다.');
        isValid = false;
    }
    
    return isValid;
}

// 비밀번호 제출 버튼 상태 업데이트
function updatePasswordSubmitButton() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    const submitButton = document.getElementById('password-submit');
    
    // 모든 필드가 채워지고 비밀번호가 일치할 때만 활성화
    const isValid = currentPassword && 
                   newPassword && 
                   confirmPassword && 
                   newPassword === confirmPassword && 
                   newPassword.length >= 8;
    
    submitButton.disabled = !isValid;
}

// 비밀번호 표시/숨기기 토글
function togglePasswordVisibility(input, toggleButton) {
    if (input.type === 'password') {
        input.type = 'text';
        toggleButton.textContent = '🙈';
    } else {
        input.type = 'password';
        toggleButton.textContent = '👁️';
    }
}

// 이메일 유효성 검사
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// 에러 메시지 표시
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
    
    // 입력 필드에 에러 클래스 추가
    const inputElement = errorElement.previousElementSibling;
    if (inputElement && inputElement.tagName === 'INPUT') {
        inputElement.classList.add('error');
    }
}

// 에러 메시지 숨기기
function clearError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.classList.remove('show');
        errorElement.textContent = '';
    }
    
    // 입력 필드에서 에러 클래스 제거
    const inputElement = errorElement.previousElementSibling;
    if (inputElement && inputElement.tagName === 'INPUT') {
        inputElement.classList.remove('error');
    }
}

// 알림 메시지 표시
function showNotification(message) {
    const notification = document.getElementById('notification');
    const messageElement = document.getElementById('notification-message');
    
    messageElement.textContent = message;
    notification.classList.add('show');
    
    // 3초 후 자동 숨기기
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// 네비게이션 초기화
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 모든 네비게이션 아이템에서 active 클래스 제거
            navItems.forEach(nav => {
                nav.classList.remove('active');
            });
            
            // 클릭된 아이템에 active 클래스 추가
            this.classList.add('active');
            
            // 페이지 이동 (실제 구현 시)
            const page = this.dataset.page;
            handleNavigation(page);
        });
    });
}

// 페이지 네비게이션 처리
function handleNavigation(page) {
    switch (page) {
        case 'orders':
            window.location.href = 'my-orders.html';
            break;
        case 'reservations':
            window.location.href = 'my-reservations.html';
            break;
        case 'profile':
            // 이미 내 프로필 페이지에 있음
            break;
        default:
            console.log('알 수 없는 페이지:', page);
    }
}

// 로그아웃 처리 (헤더에서 호출될 수 있음)
function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// 전역 함수로 등록 (헤더에서 사용할 수 있도록)
window.handleLogout = handleLogout;
