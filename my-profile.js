// 마이프로필 페이지 JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    // 로그인 상태 확인
    checkLoginStatus();
    
    // 사용자 정보 표시
    await displayUserInfo();
    
    // 이벤트 리스너 초기화
    initializeEventListeners();
    
    // 네비게이션 초기화
    initializeNavigation();
});

// 로그인 상태 확인 (JWT 기반)
async function checkLoginStatus() {
    try {
        // 서버에 인증 상태 확인
        const response = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'  // httpOnly 쿠키 포함
        });
        
        // 401 오류인 경우 로그인하지 않은 것으로 처리
        if (response.status === 401) {
            alert('로그인이 필요한 페이지입니다');
            window.location.href = 'login.html';
            return false;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.user) {
            // 비로그인 상태: 로그인 페이지로 리디렉션
            alert('로그인이 필요한 페이지입니다');
            window.location.href = 'login.html';
            return false;
        }
        
        // JWT 기반 로그인 - sessionStorage 불필요
        
        return true;
    } catch (error) {
        console.error('로그인 상태 확인 오류:', error);
        alert('로그인이 필요한 페이지입니다');
        window.location.href = 'login.html';
        return false;
    }
}

// 사용자 정보 표시 (JWT 기반) - 401 오류 처리 개선
async function displayUserInfo() {
    try {
        const response = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        
        // 401 오류인 경우 로그인하지 않은 것으로 처리
        if (response.status === 401) {
            alert('로그인이 필요한 페이지입니다');
            window.location.href = 'login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.user) {
            const user = data.user;
            const welcomeText = document.getElementById('user-welcome-text');
            
            if (welcomeText && user.name) {
                welcomeText.textContent = `${user.name}님 환영합니다!`;
            }
            
            // 사용자 정보를 화면에 표시
            document.getElementById('user-full-name').textContent = user.name || '정보 없음';
            document.getElementById('user-email').textContent = user.email || '';
            
            // 사용자 정보가 없는 경우, 기본값으로 "정보 없음" 표시
            document.getElementById('user-region').textContent = user.region || '정보 없음';
            document.getElementById('user-phone').textContent = user.phone || '정보 없음';
            
            // 생년월일 형식 처리
            if (user.birthdate) {
                const birthDate = new Date(user.birthdate);
                const formattedBirth = `${birthDate.getFullYear()}. ${String(birthDate.getMonth() + 1).padStart(2, '0')}. ${String(birthDate.getDate()).padStart(2, '0')}.`;
                document.getElementById('user-birthdate').textContent = formattedBirth;
            } else {
                document.getElementById('user-birthdate').textContent = '정보 없음';
            }
        }
    } catch (error) {
        console.error('사용자 정보 로드 오류:', error);
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

    // 사이드바 열기 이벤트
    initializeSidebarEvents();
    
    // 폼 제출 이벤트
    initializeFormEvents();
}

// 수정 버튼 클릭 처리
function handleEditClick(field) {
    switch (field) {
        case 'personalInfo':
            openPersonalInfoSidebar();
            break;
        case 'email':
            openEmailSidebar();
            break;
        case 'password':
            openPasswordSidebar();
            break;
        case 'payment':
            openPaymentSidebar();
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

// 개인정보 수정 사이드바 열기
function openPersonalInfoSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('personal-info-sidebar');
    
    // 현재 값으로 placeholder 설정
    const currentName = document.getElementById('user-full-name').textContent;
    const currentRegion = document.getElementById('user-region').textContent;
    const currentPhone = document.getElementById('user-phone').textContent;
    const currentBirthdate = document.getElementById('user-birthdate').textContent;
    
    // 날짜 형식 변환 (2002. 06. 03. -> 2002-06-03)
    const formattedDate = currentBirthdate.replace(/\.\s*/g, '-').replace(/\.$/, '').replace(/-$/, '');
    
    document.getElementById('edit-name').placeholder = currentName;
    document.getElementById('edit-region').placeholder = currentRegion;
    document.getElementById('edit-phone').placeholder = currentPhone;
    
    // 날짜 형식 검증 및 설정
    if (formattedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        document.getElementById('edit-birthdate').value = formattedDate;
    } else {
        // 기본값으로 현재 날짜 설정
        document.getElementById('edit-birthdate').value = '';
    }
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // 이름 입력 필드 포커스
    setTimeout(() => {
        document.getElementById('edit-name').focus();
    }, 300);
}

// 개인정보 수정 처리
async function handlePersonalInfoSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('edit-name').value.trim();
    const region = document.getElementById('edit-region').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const birthdate = document.getElementById('edit-birthdate').value;
    
    // 필수값 검증
    if (!name || !region || !phone || !birthdate) {
        showFormError('personal-info-error', '모든 필드를 입력해주세요.');
        return;
    }
    
    try {
        // JWT 기반으로 사용자 정보 가져오기 - 401 오류 처리 개선
        const userResponse = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        
        // 401 오류인 경우 로그인하지 않은 것으로 처리
        if (userResponse.status === 401) {
            alert('로그인이 필요한 페이지입니다');
            window.location.href = 'login.html';
            return;
        }
        
        if (!userResponse.ok) {
            throw new Error(`HTTP ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        
        if (!userData.success) {
            showFormError('personal-info-error', '로그인이 필요합니다');
            return;
        }
        
        // 서버 API 호출 준비 (사용자 데이터 검증 후 사용)
        try {
            Logger.log('서버 API 호출 준비:', { email: userData.user.email, name, birthdate });
            
            const response = await fetch('https://prepmood.kr/api/update-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    email: userData.user.email,
                    name: name,
                    birthdate: birthdate
                })
            });
            
            Logger.log('서버 응답 상태:', response.status);
            const data = await response.json();
            Logger.log('서버 응답 데이터:', data);
            
            if (data.success) {
                // 서버 저장 성공
                closeAllSidebars();
                showNotification('개인정보가 서버에 저장되었습니다.');
                
                // 로컬 데이터 업데이트
                userData.name = name;
                userData.region = region;
                userData.phone = phone;
                // JWT 기반 - localStorage 불필요
                displayUserInfo();
                return;
            } else {
                Logger.log('서버 저장 실패:', data.message);
            }
        } catch (apiError) {
            Logger.log('서버 API 호출 실패:', apiError.message);
        }
        
        // 서버 저장 실패 시 로컬 저장
        closeAllSidebars();
        showNotification('개인정보가 임시로 저장되었습니다. (서버 동기화 필요)');
        
        // 로컬 저장
        userData.name = name;
        userData.region = region;
        userData.phone = phone;
        // JWT 기반 - localStorage 불필요
        displayUserInfo();
        
    } catch (error) {
        console.error('개인정보 변경 오류:', error);
        showFormError('personal-info-error', '개인정보 변경 중 오류가 발생했습니다.');
    }
}

// 개인정보 제출 버튼 상태 업데이트
function updatePersonalInfoSubmitButton() {
    const name = document.getElementById('edit-name').value.trim();
    const region = document.getElementById('edit-region').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const birthdate = document.getElementById('edit-birthdate').value;
    
    const submitButton = document.getElementById('personal-info-submit');
    
    // 모든 필드가 채워져야 활성화
    const isValid = name && region && phone && birthdate;
    
    submitButton.disabled = !isValid;
}

// 결제 방법 사이드바 열기 (추후 기능 확장)
function openPaymentSidebar() {
    showNotification('결제 방법 추가 기능은 준비 중입니다.');
}

// 사이드바 이벤트 초기화
function initializeSidebarEvents() {
    const overlay = document.getElementById('sidebar-overlay');
    const closePersonalInfoBtn = document.getElementById('close-personal-info-sidebar');
    const closeEmailBtn = document.getElementById('close-email-sidebar');
    const closePasswordBtn = document.getElementById('close-password-sidebar');
    
    // 오버레이 클릭으로 사이드바 닫기
    overlay.addEventListener('click', closeAllSidebars);
    
    // 닫기 버튼 클릭
    closePersonalInfoBtn.addEventListener('click', closeAllSidebars);
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
    // 개인정보 폼 초기화
    const personalInfoForm = document.getElementById('personal-info-form');
    if (personalInfoForm) {
        personalInfoForm.reset();
        clearFormError('personal-info-error');
        updatePersonalInfoSubmitButton();
    }
    
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

// 이벤트 초기화
function initializeFormEvents() {
    // 개인정보 폼
    const personalInfoForm = document.getElementById('personal-info-form');
    personalInfoForm.addEventListener('submit', handlePersonalInfoSubmit);
    
    // 개인정보 폼 입력 이벤트 (input과 select 모두 포함)
    const personalInfoInputs = personalInfoForm.querySelectorAll('input, select');
    personalInfoInputs.forEach(input => {
        input.addEventListener('input', updatePersonalInfoSubmitButton);
        input.addEventListener('change', updatePersonalInfoSubmitButton);
    });
    
    // 이메일 폼
    const emailForm = document.getElementById('email-form');
    emailForm.addEventListener('submit', handleEmailSubmit);
    
    // 비밀번호 폼
    const passwordForm = document.getElementById('password-form');
    passwordForm.addEventListener('submit', handlePasswordSubmit);
    
    // 비밀번호 변경 버튼
    const passwordToggles = document.querySelectorAll('.password-toggle');
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const input = document.getElementById(targetId);
            togglePasswordVisibility(input, this);
        });
    });
    
    // 비밀번호 입력 시 검증
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    
    currentPasswordInput.addEventListener('input', updatePasswordSubmitButton);
    newPasswordInput.addEventListener('input', updatePasswordSubmitButton);
    confirmPasswordInput.addEventListener('input', updatePasswordSubmitButton);
}

// 이메일 변경 처리
async function handleEmailSubmit(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('new-email');
    const email = emailInput.value.trim();
    
    // 이메일 유효성 검증
    if (!email) {
        showError('email-error', '올바른 이메일 주소를 입력해주세요.');
        return;
    }
    
    if (!isValidEmail(email)) {
        showError('email-error', '올바른 이메일 주소를 입력해주세요.');
        return;
    }
    
    try {
        // JWT 기반으로 사용자 정보 가져오기 - 401 오류 처리 개선
        const userResponse = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        
        // 401 오류인 경우 로그인하지 않은 것으로 처리
        if (userResponse.status === 401) {
            alert('로그인이 필요한 페이지입니다');
            window.location.href = 'login.html';
            return;
        }
        
        if (!userResponse.ok) {
            throw new Error(`HTTP ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        
        if (!userData.success) {
            showError('email-error', '로그인이 필요합니다.');
            return;
        }
        
        const response = await fetch('https://prepmood.kr/api/update-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                userId: userData.user.userId,
                newEmail: email
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 성공 처리
            closeAllSidebars();
            showNotification('이메일이 변경되었습니다.');
            
            // 사용자 정보 업데이트
            displayUserInfo();
            
        } else {
            // 실패 처리
            showError('email-error', data.message || '이메일 변경에 실패했습니다.');
        }
        
    } catch (error) {
        console.error('이메일 변경 오류:', error);
        showError('email-error', '네트워크 오류가 발생했습니다.');
    }
}

// 비밀번호 변경 처리
async function handlePasswordSubmit(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // 비밀번호 유효성 검증
    if (!validatePasswords(currentPassword, newPassword, confirmPassword)) {
        return;
    }
    
    try {
        // JWT 기반으로 사용자 정보 가져오기 - 401 오류 처리 개선
        const userResponse = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        
        // 401 오류인 경우 로그인하지 않은 것으로 처리
        if (userResponse.status === 401) {
            alert('로그인이 필요한 페이지입니다');
            window.location.href = 'login.html';
            return;
        }
        
        if (!userResponse.ok) {
            throw new Error(`HTTP ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        
        if (!userData.success) {
            showError('current-password-error', '로그인이 필요합니다.');
            return;
        }
        
        const response = await fetch('https://prepmood.kr/api/update-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                userId: userData.user.userId,
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 성공 처리
            closeAllSidebars();
            showNotification('비밀번호가 변경되었습니다.');
            
        } else {
            // 실패 처리
            showError('current-password-error', data.message || '비밀번호 변경에 실패했습니다.');
        }
        
    } catch (error) {
        console.error('비밀번호 변경 오류:', error);
        showError('current-password-error', '네트워크 오류가 발생했습니다.');
    }
}

// 비밀번호 유효성 검증
function validatePasswords(currentPassword, newPassword, confirmPassword) {
    let isValid = true;
    
    // 현재 비밀번호 확인 (실제로는 서버에서 확인해야 함)
    if (!currentPassword) {
        showError('current-password-error', '현재 비밀번호를 입력해주세요.');
        isValid = false;
    }
    
    // 새 비밀번호와 확인 비밀번호 일치 확인
    if (newPassword !== confirmPassword) {
        showError('confirm-password-error', '비밀번호와 비밀번호 확인이 일치하지 않습니다. 동일하게 입력해주세요.');
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

// 비밀번호 보기/숨기기 토글
function togglePasswordVisibility(input, toggleButton) {
    if (input.type === 'password') {
        input.type = 'text';
        toggleButton.textContent = '보기';
    } else {
        input.type = 'password';
        toggleButton.textContent = '숨기기';
    }
}

// 이메일 유효성 검증
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

// 폼 에러 메시지 표시
function showFormError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
}

// 폼 에러 메시지 숨기기
function clearFormError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.classList.remove('show');
        errorElement.textContent = '';
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
            
            // 클릭한 아이템에 active 클래스 추가
            this.classList.add('active');
            
            // 페이지 이동 (현재 구현 없음)
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
            // 현재 프로필 페이지이므로 이동 없음
            break;
        default:
            Logger.log('알 수 없는 페이지:', page);
    }
}

// 로그아웃 처리 (헤더에서 호출하는 함수)
function handleLogout() {
    // JWT 기반 - localStorage 불필요, 서버에서 쿠키 삭제
    window.location.href = 'index.html';
}

// 전역 함수로 등록 (헤더에서 사용할 수 있도록)
window.handleLogout = handleLogout;
