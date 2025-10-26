// ???�로???�이지 JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    // 로그???�태 ?�인
    checkLoginStatus();
    
    // ?�용???�보 ?�시
    await displayUserInfo();
    
    // ?�벤??리스??초기??
    initializeEventListeners();
    
    // ?�비게이???�성??
    initializeNavigation();
});

// 로그???�태 ?�인 (JWT 기반)
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
        
        // JWT 기반 로그??- sessionStorage 불필??
        
        return true;
    } catch (error) {
        console.error('로그???�인 ?�류:', error);
        alert('로그?�이 ?�요???�이지?�니??');
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
                welcomeText.textContent = `${user.name}???�영?�니??`;
            }
            
            // ?�용???�보�?�??�드???�시
            document.getElementById('user-full-name').textContent = user.name || '?�보 ?�음';
            document.getElementById('user-email').textContent = user.email || '';
            
            // ?�용???�보가 ?�으�??�용, ?�으�?"?�보 ?�음" ?�는 기본�?
            document.getElementById('user-region').textContent = user.region || '?�?��?�?;
            document.getElementById('user-phone').textContent = user.phone || '?�보 ?�음';
            
            // ?�년?�일 ?�식 처리
            if (user.birthdate) {
                const birthDate = new Date(user.birthdate);
                const formattedBirth = `${birthDate.getFullYear()}. ${String(birthDate.getMonth() + 1).padStart(2, '0')}. ${String(birthDate.getDate()).padStart(2, '0')}.`;
                document.getElementById('user-birthdate').textContent = formattedBirth;
            } else {
                document.getElementById('user-birthdate').textContent = '?�보 ?�음';
            }
        }
    } catch (error) {
        console.error('?�용???�보 로드 ?�류:', error);
    }
}

// ?�벤??리스??초기??
function initializeEventListeners() {
    // ?�정 버튼 ?�릭 ?�벤??
    const editButtons = document.querySelectorAll('.edit-button');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const field = this.dataset.field;
            handleEditClick(field);
        });
    });

    // ?�이?�바 ?�기 ?�벤??
    initializeSidebarEvents();
    
    // ???�출 ?�벤??
    initializeFormEvents();
}

// ?�정 버튼 ?�릭 처리
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
            showNotification('?�당 기능?� 준�?중입?�다.');
    }
}

// ?�메???�정 ?�이?�바 ?�기
function openEmailSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('email-sidebar');
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // ???�메???�력 ?�드 ?�커??
    setTimeout(() => {
        document.getElementById('new-email').focus();
    }, 300);
}

// 비�?번호 ?�정 ?�이?�바 ?�기
function openPasswordSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('password-sidebar');
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // ?�재 비�?번호 ?�력 ?�드 ?�커??
    setTimeout(() => {
        document.getElementById('current-password').focus();
    }, 300);
}

// 개인?�보 ?�정 ?�이?�바 ?�기
function openPersonalInfoSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('personal-info-sidebar');
    
    // ?�재 값으�?placeholder ?�정
    const currentName = document.getElementById('user-full-name').textContent;
    const currentRegion = document.getElementById('user-region').textContent;
    const currentPhone = document.getElementById('user-phone').textContent;
    const currentBirthdate = document.getElementById('user-birthdate').textContent;
    
    // ?�짜 ?�식 변??(2002. 06. 03. -> 2002-06-03)
    const formattedDate = currentBirthdate.replace(/\.\s*/g, '-').replace(/\.$/, '').replace(/-$/, '');
    
    document.getElementById('edit-name').placeholder = currentName;
    document.getElementById('edit-region').placeholder = currentRegion;
    document.getElementById('edit-phone').placeholder = currentPhone;
    
    // ?�짜 ?�식 검�????�정
    if (formattedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        document.getElementById('edit-birthdate').value = formattedDate;
    } else {
        // 기본값으�??�재 ?�짜 ?�정
        document.getElementById('edit-birthdate').value = '';
    }
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // ?�름 ?�력 ?�드 ?�커??
    setTimeout(() => {
        document.getElementById('edit-name').focus();
    }, 300);
}

// 개인?�보 ?�정 처리
async function handlePersonalInfoSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('edit-name').value.trim();
    const region = document.getElementById('edit-region').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const birthdate = document.getElementById('edit-birthdate').value;
    
    // ?�수�?검�?
    if (!name || !region || !phone || !birthdate) {
        showFormError('personal-info-error', '모든 ?�드�??�력?�주?�요.');
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
            showFormError('personal-info-error', '로그?�이 ?�요?�니??');
            return;
        }
        
        // ?�버 API ?�출 ?�도 (?�용 ?�데?�트 ?�드?�인???�용)
        try {
            Logger.log('?�� ?�버 API ?�출 ?�도:', { email: userData.user.email, name, birthdate });
            
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
            
            Logger.log('?�� ?�버 ?�답 ?�태:', response.status);
            const data = await response.json();
            Logger.log('?�� ?�버 ?�답 ?�이??', data);
            
            if (data.success) {
                // ?�버 ?�???�공
                closeAllSidebars();
                showNotification('개인?�보가 ?�버???�?�되?�습?�다.');
                
                // 로컬???�데?�트
                userData.name = name;
                userData.region = region;
                userData.phone = phone;
                // JWT 기반 - localStorage 불필??
                displayUserInfo();
                return;
            } else {
                Logger.log('???�버 ?�???�패:', data.message);
            }
        } catch (apiError) {
            Logger.log('???�버 API ?�출 ?�패:', apiError.message);
        }
        
        // ?�버 ?�???�패 ??로컬 ?�??
        closeAllSidebars();
        showNotification('개인?�보가 ?�시�??�?�되?�습?�다. (?�버 ?�동 ?�요)');
        
        // 로컬 ?�??
        userData.name = name;
        userData.region = region;
        userData.phone = phone;
        // JWT 기반 - localStorage 불필??
        displayUserInfo();
        
    } catch (error) {
        console.error('개인?�보 변�??�류:', error);
        showFormError('personal-info-error', '개인?�보 변�?�??�류가 발생?�습?�다.');
    }
}

// 개인?�보 ?�출 버튼 ?�태 ?�데?�트
function updatePersonalInfoSubmitButton() {
    const name = document.getElementById('edit-name').value.trim();
    const region = document.getElementById('edit-region').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const birthdate = document.getElementById('edit-birthdate').value;
    
    const submitButton = document.getElementById('personal-info-submit');
    
    // 모든 ?�드가 채워?�야 ?�성??
    const isValid = name && region && phone && birthdate;
    
    submitButton.disabled = !isValid;
}

// 결제 방법 ?�이?�바 ?�기 (추후 기능 ?�장??
function openPaymentSidebar() {
    showNotification('결제 방법 추�? 기능?� 준�?중입?�다.');
}

// ?�이?�바 ?�벤??초기??
function initializeSidebarEvents() {
    const overlay = document.getElementById('sidebar-overlay');
    const closePersonalInfoBtn = document.getElementById('close-personal-info-sidebar');
    const closeEmailBtn = document.getElementById('close-email-sidebar');
    const closePasswordBtn = document.getElementById('close-password-sidebar');
    
    // ?�버?�이 ?�릭?�로 ?�이?�바 ?�기
    overlay.addEventListener('click', closeAllSidebars);
    
    // ?�기 버튼 ?�릭
    closePersonalInfoBtn.addEventListener('click', closeAllSidebars);
    closeEmailBtn.addEventListener('click', closeAllSidebars);
    closePasswordBtn.addEventListener('click', closeAllSidebars);
    
    // ESC ?�로 ?�이?�바 ?�기
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllSidebars();
        }
    });
}

// 모든 ?�이?�바 ?�기
function closeAllSidebars() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebars = document.querySelectorAll('.edit-sidebar');
    
    overlay.classList.remove('show');
    sidebars.forEach(sidebar => {
        sidebar.classList.remove('show');
    });
    
    // ??초기??
    resetAllForms();
}

// ??초기??
function resetAllForms() {
    // 개인?�보 ??초기??
    const personalInfoForm = document.getElementById('personal-info-form');
    if (personalInfoForm) {
        personalInfoForm.reset();
        clearFormError('personal-info-error');
        updatePersonalInfoSubmitButton();
    }
    
    // ?�메????초기??
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
        emailForm.reset();
        clearError('email-error');
    }
    
    // 비�?번호 ??초기??
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.reset();
        clearError('current-password-error');
        clearError('confirm-password-error');
        updatePasswordSubmitButton();
    }
}

// ???�벤??초기??
function initializeFormEvents() {
    // 개인?�보 ??
    const personalInfoForm = document.getElementById('personal-info-form');
    personalInfoForm.addEventListener('submit', handlePersonalInfoSubmit);
    
    // 개인?�보 ???�력 ?�벤??
    const personalInfoInputs = personalInfoForm.querySelectorAll('input');
    personalInfoInputs.forEach(input => {
        input.addEventListener('input', updatePersonalInfoSubmitButton);
    });
    
    // ?�메????
    const emailForm = document.getElementById('email-form');
    emailForm.addEventListener('submit', handleEmailSubmit);
    
    // 비�?번호 ??
    const passwordForm = document.getElementById('password-form');
    passwordForm.addEventListener('submit', handlePasswordSubmit);
    
    // 비�?번호 ?��? 버튼
    const passwordToggles = document.querySelectorAll('.password-toggle');
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const input = document.getElementById(targetId);
            togglePasswordVisibility(input, this);
        });
    });
    
    // 비�?번호 ?�력 ?�시�?검�?
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    
    currentPasswordInput.addEventListener('input', updatePasswordSubmitButton);
    newPasswordInput.addEventListener('input', updatePasswordSubmitButton);
    confirmPasswordInput.addEventListener('input', updatePasswordSubmitButton);
}

// ?�메???�정 처리
async function handleEmailSubmit(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('new-email');
    const email = emailInput.value.trim();
    
    // ?�메???�효??검??
    if (!email) {
        showError('email-error', '?�바�??�메??주소�??�력?�세??');
        return;
    }
    
    if (!isValidEmail(email)) {
        showError('email-error', '?�바�??�메??주소�??�력?�세??');
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
            showError('email-error', '로그?�이 ?�요?�니??');
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
            // ?�공 ??
            closeAllSidebars();
            showNotification('?�메?�이 ?�정?�었?�니??');
            
            // ?�용???�보 ?�데?�트
            displayUserInfo();
            
        } else {
            // ?�패 ??
            showError('email-error', data.message || '?�메??변경에 ?�패?�습?�다.');
        }
        
    } catch (error) {
        console.error('?�메??변�??�류:', error);
        showError('email-error', '?�트?�크 ?�류가 발생?�습?�다.');
    }
}

// 비�?번호 ?�정 처리
async function handlePasswordSubmit(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // 비�?번호 ?�효??검??
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
            showError('current-password-error', '로그?�이 ?�요?�니??');
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
            // ?�공 ??
            closeAllSidebars();
            showNotification('비�?번호가 ?�정?�었?�니??');
            
        } else {
            // ?�패 ??
            showError('current-password-error', data.message || '비�?번호 변경에 ?�패?�습?�다.');
        }
        
    } catch (error) {
        console.error('비�?번호 변�??�류:', error);
        showError('current-password-error', '?�트?�크 ?�류가 발생?�습?�다.');
    }
}

// 비�?번호 ?�효??검??
function validatePasswords(currentPassword, newPassword, confirmPassword) {
    let isValid = true;
    
    // ?�재 비�?번호 ?�인 (?�제로는 ?�버?�서 ?�인?�야 ??
    if (!currentPassword) {
        showError('current-password-error', '?�재 비�?번호�??�력?�세??');
        isValid = false;
    }
    
    // ??비�?번호?� ?�인 비�?번호 ?�치 ?�인
    if (newPassword !== confirmPassword) {
        showError('confirm-password-error', '비�?번호?� 비�?번호 ?�인?�???�치?��? ?�습?�다. ?�일??글?��? ?�력?�세??');
        isValid = false;
    } else {
        clearError('confirm-password-error');
    }
    
    // ??비�?번호 길이 ?�인
    if (newPassword && newPassword.length < 8) {
        showError('confirm-password-error', '비�?번호??8???�상?�어???�니??');
        isValid = false;
    }
    
    return isValid;
}

// 비�?번호 ?�출 버튼 ?�태 ?�데?�트
function updatePasswordSubmitButton() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    const submitButton = document.getElementById('password-submit');
    
    // 모든 ?�드가 채워지�?비�?번호가 ?�치???�만 ?�성??
    const isValid = currentPassword && 
                   newPassword && 
                   confirmPassword && 
                   newPassword === confirmPassword && 
                   newPassword.length >= 8;
    
    submitButton.disabled = !isValid;
}

// 비�?번호 ?�시/?�기�??��?
function togglePasswordVisibility(input, toggleButton) {
    if (input.type === 'password') {
        input.type = 'text';
        toggleButton.textContent = '?��';
    } else {
        input.type = 'password';
        toggleButton.textContent = '?���?;
    }
}

// ?�메???�효??검??
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ?�러 메시지 ?�시
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
    
    // ?�력 ?�드???�러 ?�래??추�?
    const inputElement = errorElement.previousElementSibling;
    if (inputElement && inputElement.tagName === 'INPUT') {
        inputElement.classList.add('error');
    }
}

// ?�러 메시지 ?�기�?
function clearError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.classList.remove('show');
        errorElement.textContent = '';
    }
    
    // ?�력 ?�드?�서 ?�러 ?�래???�거
    const inputElement = errorElement.previousElementSibling;
    if (inputElement && inputElement.tagName === 'INPUT') {
        inputElement.classList.remove('error');
    }
}

// ???�러 메시지 ?�시
function showFormError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
}

// ???�러 메시지 ?�기�?
function clearFormError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.classList.remove('show');
        errorElement.textContent = '';
    }
}

// ?�림 메시지 ?�시
function showNotification(message) {
    const notification = document.getElementById('notification');
    const messageElement = document.getElementById('notification-message');
    
    messageElement.textContent = message;
    notification.classList.add('show');
    
    // 3�????�동 ?�기�?
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ?�비게이??초기??
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 모든 ?�비게이???�이?�에??active ?�래???�거
            navItems.forEach(nav => {
                nav.classList.remove('active');
            });
            
            // ?�릭???�이?�에 active ?�래??추�?
            this.classList.add('active');
            
            // ?�이지 ?�동 (?�제 구현 ??
            const page = this.dataset.page;
            handleNavigation(page);
        });
    });
}

// ?�이지 ?�비게이??처리
function handleNavigation(page) {
    switch (page) {
        case 'orders':
            window.location.href = 'my-orders.html';
            break;
        case 'reservations':
            window.location.href = 'my-reservations.html';
            break;
        case 'profile':
            // ?��? ???�로???�이지???�음
            break;
        default:
            Logger.log('?????�는 ?�이지:', page);
    }
}

// 로그?�웃 처리 (?�더?�서 ?�출?????�음)
function handleLogout() {
    // JWT 기반 - localStorage 불필?? ?�버?�서 쿠키 ??��
    window.location.href = 'index.html';
}

// ?�역 ?�수�??�록 (?�더?�서 ?�용?????�도�?
window.handleLogout = handleLogout;
