// ???„ë¡œ???˜ì´ì§€ JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    // ë¡œê·¸???íƒœ ?•ì¸
    checkLoginStatus();
    
    // ?¬ìš©???•ë³´ ?œì‹œ
    await displayUserInfo();
    
    // ?´ë²¤??ë¦¬ìŠ¤??ì´ˆê¸°??
    initializeEventListeners();
    
    // ?¤ë¹„ê²Œì´???œì„±??
    initializeNavigation();
});

// ë¡œê·¸???íƒœ ?•ì¸ (JWT ê¸°ë°˜)
async function checkLoginStatus() {
    try {
        // ???œë²„???¸ì¦ ?íƒœ ?•ì¸
        const response = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'  // httpOnly ì¿ í‚¤ ?¬í•¨
        });
        
        const data = await response.json();
        
        if (!data.success || !data.user) {
            // ë¹„ë¡œê·¸ì¸ ?íƒœ: ë¡œê·¸???˜ì´ì§€ë¡?ë¦¬ë‹¤?´ë ‰??
            alert('ë¡œê·¸?¸ì´ ?„ìš”???˜ì´ì§€?…ë‹ˆ??');
            window.location.href = 'login.html';
            return false;
        }
        
        // JWT ê¸°ë°˜ ë¡œê·¸??- sessionStorage ë¶ˆí•„??
        
        return true;
    } catch (error) {
        console.error('ë¡œê·¸???•ì¸ ?¤ë¥˜:', error);
        alert('ë¡œê·¸?¸ì´ ?„ìš”???˜ì´ì§€?…ë‹ˆ??');
        window.location.href = 'login.html';
        return false;
    }
}

// ?¬ìš©???•ë³´ ?œì‹œ (JWT ê¸°ë°˜)
async function displayUserInfo() {
    try {
        const response = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success && data.user) {
            const user = data.user;
            const welcomeText = document.getElementById('user-welcome-text');
            
            if (welcomeText && user.name) {
                welcomeText.textContent = `${user.name}???˜ì˜?©ë‹ˆ??`;
            }
            
            // ?¬ìš©???•ë³´ë¥?ê°??„ë“œ???œì‹œ
            document.getElementById('user-full-name').textContent = user.name || '?•ë³´ ?†ìŒ';
            document.getElementById('user-email').textContent = user.email || '';
            
            // ?¬ìš©???•ë³´ê°€ ?ˆìœ¼ë©??¬ìš©, ?†ìœ¼ë©?"?•ë³´ ?†ìŒ" ?ëŠ” ê¸°ë³¸ê°?
            document.getElementById('user-region').textContent = user.region || '?€?œë?êµ?;
            document.getElementById('user-phone').textContent = user.phone || '?•ë³´ ?†ìŒ';
            
            // ?ë…„?”ì¼ ?•ì‹ ì²˜ë¦¬
            if (user.birthdate) {
                const birthDate = new Date(user.birthdate);
                const formattedBirth = `${birthDate.getFullYear()}. ${String(birthDate.getMonth() + 1).padStart(2, '0')}. ${String(birthDate.getDate()).padStart(2, '0')}.`;
                document.getElementById('user-birthdate').textContent = formattedBirth;
            } else {
                document.getElementById('user-birthdate').textContent = '?•ë³´ ?†ìŒ';
            }
        }
    } catch (error) {
        console.error('?¬ìš©???•ë³´ ë¡œë“œ ?¤ë¥˜:', error);
    }
}

// ?´ë²¤??ë¦¬ìŠ¤??ì´ˆê¸°??
function initializeEventListeners() {
    // ?˜ì • ë²„íŠ¼ ?´ë¦­ ?´ë²¤??
    const editButtons = document.querySelectorAll('.edit-button');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const field = this.dataset.field;
            handleEditClick(field);
        });
    });

    // ?¬ì´?œë°” ?«ê¸° ?´ë²¤??
    initializeSidebarEvents();
    
    // ???œì¶œ ?´ë²¤??
    initializeFormEvents();
}

// ?˜ì • ë²„íŠ¼ ?´ë¦­ ì²˜ë¦¬
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
            showNotification('?´ë‹¹ ê¸°ëŠ¥?€ ì¤€ë¹?ì¤‘ì…?ˆë‹¤.');
    }
}

// ?´ë©”???˜ì • ?¬ì´?œë°” ?´ê¸°
function openEmailSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('email-sidebar');
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // ???´ë©”???…ë ¥ ?„ë“œ ?¬ì»¤??
    setTimeout(() => {
        document.getElementById('new-email').focus();
    }, 300);
}

// ë¹„ë?ë²ˆí˜¸ ?˜ì • ?¬ì´?œë°” ?´ê¸°
function openPasswordSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('password-sidebar');
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // ?„ì¬ ë¹„ë?ë²ˆí˜¸ ?…ë ¥ ?„ë“œ ?¬ì»¤??
    setTimeout(() => {
        document.getElementById('current-password').focus();
    }, 300);
}

// ê°œì¸?•ë³´ ?˜ì • ?¬ì´?œë°” ?´ê¸°
function openPersonalInfoSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('personal-info-sidebar');
    
    // ?„ì¬ ê°’ìœ¼ë¡?placeholder ?¤ì •
    const currentName = document.getElementById('user-full-name').textContent;
    const currentRegion = document.getElementById('user-region').textContent;
    const currentPhone = document.getElementById('user-phone').textContent;
    const currentBirthdate = document.getElementById('user-birthdate').textContent;
    
    // ? ì§œ ?•ì‹ ë³€??(2002. 06. 03. -> 2002-06-03)
    const formattedDate = currentBirthdate.replace(/\.\s*/g, '-').replace(/\.$/, '').replace(/-$/, '');
    
    document.getElementById('edit-name').placeholder = currentName;
    document.getElementById('edit-region').placeholder = currentRegion;
    document.getElementById('edit-phone').placeholder = currentPhone;
    
    // ? ì§œ ?•ì‹ ê²€ì¦????¤ì •
    if (formattedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        document.getElementById('edit-birthdate').value = formattedDate;
    } else {
        // ê¸°ë³¸ê°’ìœ¼ë¡??„ì¬ ? ì§œ ?¤ì •
        document.getElementById('edit-birthdate').value = '';
    }
    
    overlay.classList.add('show');
    sidebar.classList.add('show');
    
    // ?´ë¦„ ?…ë ¥ ?„ë“œ ?¬ì»¤??
    setTimeout(() => {
        document.getElementById('edit-name').focus();
    }, 300);
}

// ê°œì¸?•ë³´ ?˜ì • ì²˜ë¦¬
async function handlePersonalInfoSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('edit-name').value.trim();
    const region = document.getElementById('edit-region').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const birthdate = document.getElementById('edit-birthdate').value;
    
    // ?„ìˆ˜ê°?ê²€ì¦?
    if (!name || !region || !phone || !birthdate) {
        showFormError('personal-info-error', 'ëª¨ë“  ?„ë“œë¥??…ë ¥?´ì£¼?¸ìš”.');
        return;
    }
    
    try {
        // JWT ê¸°ë°˜?¼ë¡œ ?¬ìš©???•ë³´ ê°€?¸ì˜¤ê¸?
        const userResponse = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        const userData = await userResponse.json();
        
        if (!userData.success) {
            showFormError('personal-info-error', 'ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??');
            return;
        }
        
        // ?œë²„ API ?¸ì¶œ ?œë„ (?„ìš© ?…ë°?´íŠ¸ ?”ë“œ?¬ì¸???¬ìš©)
        try {
            Logger.log('?“ ?œë²„ API ?¸ì¶œ ?œë„:', { email: userData.user.email, name, birthdate });
            
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
            
            Logger.log('?“¡ ?œë²„ ?‘ë‹µ ?íƒœ:', response.status);
            const data = await response.json();
            Logger.log('?“‹ ?œë²„ ?‘ë‹µ ?°ì´??', data);
            
            if (data.success) {
                // ?œë²„ ?€???±ê³µ
                closeAllSidebars();
                showNotification('ê°œì¸?•ë³´ê°€ ?œë²„???€?¥ë˜?ˆìŠµ?ˆë‹¤.');
                
                // ë¡œì»¬???…ë°?´íŠ¸
                userData.name = name;
                userData.region = region;
                userData.phone = phone;
                // JWT ê¸°ë°˜ - localStorage ë¶ˆí•„??
                displayUserInfo();
                return;
            } else {
                Logger.log('???œë²„ ?€???¤íŒ¨:', data.message);
            }
        } catch (apiError) {
            Logger.log('???œë²„ API ?¸ì¶œ ?¤íŒ¨:', apiError.message);
        }
        
        // ?œë²„ ?€???¤íŒ¨ ??ë¡œì»¬ ?€??
        closeAllSidebars();
        showNotification('ê°œì¸?•ë³´ê°€ ?„ì‹œë¡??€?¥ë˜?ˆìŠµ?ˆë‹¤. (?œë²„ ?°ë™ ?„ìš”)');
        
        // ë¡œì»¬ ?€??
        userData.name = name;
        userData.region = region;
        userData.phone = phone;
        // JWT ê¸°ë°˜ - localStorage ë¶ˆí•„??
        displayUserInfo();
        
    } catch (error) {
        console.error('ê°œì¸?•ë³´ ë³€ê²??¤ë¥˜:', error);
        showFormError('personal-info-error', 'ê°œì¸?•ë³´ ë³€ê²?ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.');
    }
}

// ê°œì¸?•ë³´ ?œì¶œ ë²„íŠ¼ ?íƒœ ?…ë°?´íŠ¸
function updatePersonalInfoSubmitButton() {
    const name = document.getElementById('edit-name').value.trim();
    const region = document.getElementById('edit-region').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const birthdate = document.getElementById('edit-birthdate').value;
    
    const submitButton = document.getElementById('personal-info-submit');
    
    // ëª¨ë“  ?„ë“œê°€ ì±„ì›Œ?¸ì•¼ ?œì„±??
    const isValid = name && region && phone && birthdate;
    
    submitButton.disabled = !isValid;
}

// ê²°ì œ ë°©ë²• ?¬ì´?œë°” ?´ê¸° (ì¶”í›„ ê¸°ëŠ¥ ?•ì¥??
function openPaymentSidebar() {
    showNotification('ê²°ì œ ë°©ë²• ì¶”ê? ê¸°ëŠ¥?€ ì¤€ë¹?ì¤‘ì…?ˆë‹¤.');
}

// ?¬ì´?œë°” ?´ë²¤??ì´ˆê¸°??
function initializeSidebarEvents() {
    const overlay = document.getElementById('sidebar-overlay');
    const closePersonalInfoBtn = document.getElementById('close-personal-info-sidebar');
    const closeEmailBtn = document.getElementById('close-email-sidebar');
    const closePasswordBtn = document.getElementById('close-password-sidebar');
    
    // ?¤ë²„?ˆì´ ?´ë¦­?¼ë¡œ ?¬ì´?œë°” ?«ê¸°
    overlay.addEventListener('click', closeAllSidebars);
    
    // ?«ê¸° ë²„íŠ¼ ?´ë¦­
    closePersonalInfoBtn.addEventListener('click', closeAllSidebars);
    closeEmailBtn.addEventListener('click', closeAllSidebars);
    closePasswordBtn.addEventListener('click', closeAllSidebars);
    
    // ESC ?¤ë¡œ ?¬ì´?œë°” ?«ê¸°
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllSidebars();
        }
    });
}

// ëª¨ë“  ?¬ì´?œë°” ?«ê¸°
function closeAllSidebars() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebars = document.querySelectorAll('.edit-sidebar');
    
    overlay.classList.remove('show');
    sidebars.forEach(sidebar => {
        sidebar.classList.remove('show');
    });
    
    // ??ì´ˆê¸°??
    resetAllForms();
}

// ??ì´ˆê¸°??
function resetAllForms() {
    // ê°œì¸?•ë³´ ??ì´ˆê¸°??
    const personalInfoForm = document.getElementById('personal-info-form');
    if (personalInfoForm) {
        personalInfoForm.reset();
        clearFormError('personal-info-error');
        updatePersonalInfoSubmitButton();
    }
    
    // ?´ë©”????ì´ˆê¸°??
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
        emailForm.reset();
        clearError('email-error');
    }
    
    // ë¹„ë?ë²ˆí˜¸ ??ì´ˆê¸°??
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.reset();
        clearError('current-password-error');
        clearError('confirm-password-error');
        updatePasswordSubmitButton();
    }
}

// ???´ë²¤??ì´ˆê¸°??
function initializeFormEvents() {
    // ê°œì¸?•ë³´ ??
    const personalInfoForm = document.getElementById('personal-info-form');
    personalInfoForm.addEventListener('submit', handlePersonalInfoSubmit);
    
    // ê°œì¸?•ë³´ ???…ë ¥ ?´ë²¤??
    const personalInfoInputs = personalInfoForm.querySelectorAll('input');
    personalInfoInputs.forEach(input => {
        input.addEventListener('input', updatePersonalInfoSubmitButton);
    });
    
    // ?´ë©”????
    const emailForm = document.getElementById('email-form');
    emailForm.addEventListener('submit', handleEmailSubmit);
    
    // ë¹„ë?ë²ˆí˜¸ ??
    const passwordForm = document.getElementById('password-form');
    passwordForm.addEventListener('submit', handlePasswordSubmit);
    
    // ë¹„ë?ë²ˆí˜¸ ? ê? ë²„íŠ¼
    const passwordToggles = document.querySelectorAll('.password-toggle');
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const input = document.getElementById(targetId);
            togglePasswordVisibility(input, this);
        });
    });
    
    // ë¹„ë?ë²ˆí˜¸ ?…ë ¥ ?¤ì‹œê°?ê²€ì¦?
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    
    currentPasswordInput.addEventListener('input', updatePasswordSubmitButton);
    newPasswordInput.addEventListener('input', updatePasswordSubmitButton);
    confirmPasswordInput.addEventListener('input', updatePasswordSubmitButton);
}

// ?´ë©”???˜ì • ì²˜ë¦¬
async function handleEmailSubmit(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('new-email');
    const email = emailInput.value.trim();
    
    // ?´ë©”??? íš¨??ê²€??
    if (!email) {
        showError('email-error', '?¬ë°”ë¥??´ë©”??ì£¼ì†Œë¥??…ë ¥?˜ì„¸??');
        return;
    }
    
    if (!isValidEmail(email)) {
        showError('email-error', '?¬ë°”ë¥??´ë©”??ì£¼ì†Œë¥??…ë ¥?˜ì„¸??');
        return;
    }
    
    try {
        // JWT ê¸°ë°˜?¼ë¡œ ?¬ìš©???•ë³´ ê°€?¸ì˜¤ê¸?
        const userResponse = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        const userData = await userResponse.json();
        
        if (!userData.success) {
            showError('email-error', 'ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??');
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
            // ?±ê³µ ??
            closeAllSidebars();
            showNotification('?´ë©”?¼ì´ ?˜ì •?˜ì—ˆ?µë‹ˆ??');
            
            // ?¬ìš©???•ë³´ ?…ë°?´íŠ¸
            displayUserInfo();
            
        } else {
            // ?¤íŒ¨ ??
            showError('email-error', data.message || '?´ë©”??ë³€ê²½ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');
        }
        
    } catch (error) {
        console.error('?´ë©”??ë³€ê²??¤ë¥˜:', error);
        showError('email-error', '?¤íŠ¸?Œí¬ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.');
    }
}

// ë¹„ë?ë²ˆí˜¸ ?˜ì • ì²˜ë¦¬
async function handlePasswordSubmit(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // ë¹„ë?ë²ˆí˜¸ ? íš¨??ê²€??
    if (!validatePasswords(currentPassword, newPassword, confirmPassword)) {
        return;
    }
    
    try {
        // JWT ê¸°ë°˜?¼ë¡œ ?¬ìš©???•ë³´ ê°€?¸ì˜¤ê¸?
        const userResponse = await fetch('https://prepmood.kr/api/auth/me', {
            credentials: 'include'
        });
        const userData = await userResponse.json();
        
        if (!userData.success) {
            showError('current-password-error', 'ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??');
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
            // ?±ê³µ ??
            closeAllSidebars();
            showNotification('ë¹„ë?ë²ˆí˜¸ê°€ ?˜ì •?˜ì—ˆ?µë‹ˆ??');
            
        } else {
            // ?¤íŒ¨ ??
            showError('current-password-error', data.message || 'ë¹„ë?ë²ˆí˜¸ ë³€ê²½ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.');
        }
        
    } catch (error) {
        console.error('ë¹„ë?ë²ˆí˜¸ ë³€ê²??¤ë¥˜:', error);
        showError('current-password-error', '?¤íŠ¸?Œí¬ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.');
    }
}

// ë¹„ë?ë²ˆí˜¸ ? íš¨??ê²€??
function validatePasswords(currentPassword, newPassword, confirmPassword) {
    let isValid = true;
    
    // ?„ì¬ ë¹„ë?ë²ˆí˜¸ ?•ì¸ (?¤ì œë¡œëŠ” ?œë²„?ì„œ ?•ì¸?´ì•¼ ??
    if (!currentPassword) {
        showError('current-password-error', '?„ì¬ ë¹„ë?ë²ˆí˜¸ë¥??…ë ¥?˜ì„¸??');
        isValid = false;
    }
    
    // ??ë¹„ë?ë²ˆí˜¸?€ ?•ì¸ ë¹„ë?ë²ˆí˜¸ ?¼ì¹˜ ?•ì¸
    if (newPassword !== confirmPassword) {
        showError('confirm-password-error', 'ë¹„ë?ë²ˆí˜¸?€ ë¹„ë?ë²ˆí˜¸ ?•ì¸?€???¼ì¹˜?˜ì? ?ŠìŠµ?ˆë‹¤. ?™ì¼??ê¸€?ë? ?…ë ¥?˜ì„¸??');
        isValid = false;
    } else {
        clearError('confirm-password-error');
    }
    
    // ??ë¹„ë?ë²ˆí˜¸ ê¸¸ì´ ?•ì¸
    if (newPassword && newPassword.length < 8) {
        showError('confirm-password-error', 'ë¹„ë?ë²ˆí˜¸??8???´ìƒ?´ì–´???©ë‹ˆ??');
        isValid = false;
    }
    
    return isValid;
}

// ë¹„ë?ë²ˆí˜¸ ?œì¶œ ë²„íŠ¼ ?íƒœ ?…ë°?´íŠ¸
function updatePasswordSubmitButton() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    const submitButton = document.getElementById('password-submit');
    
    // ëª¨ë“  ?„ë“œê°€ ì±„ì›Œì§€ê³?ë¹„ë?ë²ˆí˜¸ê°€ ?¼ì¹˜???Œë§Œ ?œì„±??
    const isValid = currentPassword && 
                   newPassword && 
                   confirmPassword && 
                   newPassword === confirmPassword && 
                   newPassword.length >= 8;
    
    submitButton.disabled = !isValid;
}

// ë¹„ë?ë²ˆí˜¸ ?œì‹œ/?¨ê¸°ê¸?? ê?
function togglePasswordVisibility(input, toggleButton) {
    if (input.type === 'password') {
        input.type = 'text';
        toggleButton.textContent = '?™ˆ';
    } else {
        input.type = 'password';
        toggleButton.textContent = '?‘ï¸?;
    }
}

// ?´ë©”??? íš¨??ê²€??
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ?ëŸ¬ ë©”ì‹œì§€ ?œì‹œ
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
    
    // ?…ë ¥ ?„ë“œ???ëŸ¬ ?´ë˜??ì¶”ê?
    const inputElement = errorElement.previousElementSibling;
    if (inputElement && inputElement.tagName === 'INPUT') {
        inputElement.classList.add('error');
    }
}

// ?ëŸ¬ ë©”ì‹œì§€ ?¨ê¸°ê¸?
function clearError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.classList.remove('show');
        errorElement.textContent = '';
    }
    
    // ?…ë ¥ ?„ë“œ?ì„œ ?ëŸ¬ ?´ë˜???œê±°
    const inputElement = errorElement.previousElementSibling;
    if (inputElement && inputElement.tagName === 'INPUT') {
        inputElement.classList.remove('error');
    }
}

// ???ëŸ¬ ë©”ì‹œì§€ ?œì‹œ
function showFormError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
}

// ???ëŸ¬ ë©”ì‹œì§€ ?¨ê¸°ê¸?
function clearFormError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.classList.remove('show');
        errorElement.textContent = '';
    }
}

// ?Œë¦¼ ë©”ì‹œì§€ ?œì‹œ
function showNotification(message) {
    const notification = document.getElementById('notification');
    const messageElement = document.getElementById('notification-message');
    
    messageElement.textContent = message;
    notification.classList.add('show');
    
    // 3ì´????ë™ ?¨ê¸°ê¸?
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ?¤ë¹„ê²Œì´??ì´ˆê¸°??
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // ëª¨ë“  ?¤ë¹„ê²Œì´???„ì´?œì—??active ?´ë˜???œê±°
            navItems.forEach(nav => {
                nav.classList.remove('active');
            });
            
            // ?´ë¦­???„ì´?œì— active ?´ë˜??ì¶”ê?
            this.classList.add('active');
            
            // ?˜ì´ì§€ ?´ë™ (?¤ì œ êµ¬í˜„ ??
            const page = this.dataset.page;
            handleNavigation(page);
        });
    });
}

// ?˜ì´ì§€ ?¤ë¹„ê²Œì´??ì²˜ë¦¬
function handleNavigation(page) {
    switch (page) {
        case 'orders':
            window.location.href = 'my-orders.html';
            break;
        case 'reservations':
            window.location.href = 'my-reservations.html';
            break;
        case 'profile':
            // ?´ë? ???„ë¡œ???˜ì´ì§€???ˆìŒ
            break;
        default:
            Logger.log('?????†ëŠ” ?˜ì´ì§€:', page);
    }
}

// ë¡œê·¸?„ì›ƒ ì²˜ë¦¬ (?¤ë”?ì„œ ?¸ì¶œ?????ˆìŒ)
function handleLogout() {
    // JWT ê¸°ë°˜ - localStorage ë¶ˆí•„?? ?œë²„?ì„œ ì¿ í‚¤ ?? œ
    window.location.href = 'index.html';
}

// ?„ì—­ ?¨ìˆ˜ë¡??±ë¡ (?¤ë”?ì„œ ?¬ìš©?????ˆë„ë¡?
window.handleLogout = handleLogout;
