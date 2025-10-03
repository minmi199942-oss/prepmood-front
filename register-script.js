// register-script.js

document.addEventListener('DOMContentLoaded', () => {
  // 폼 요소들
  const registerForm = document.getElementById('registerForm');
  const emailInput = document.getElementById('email');
  const verifyCodeInput = document.getElementById('verify-code');
  const sendCodeBtn = document.getElementById('sendCodeBtn');
  const verifyCodeBtn = document.getElementById('verifyCodeBtn');
  const lastNameInput = document.getElementById('last-name');
  const firstNameInput = document.getElementById('first-name');
  const phoneInput = document.getElementById('phone');
  const birthdateInput = document.getElementById('birthdate');
  const passwordInput = document.getElementById('password');
  const passwordConfirmInput = document.getElementById('password-confirm');
  const agreeDataCheckbox = document.getElementById('agree-data');
  const agreeTransferCheckbox = document.getElementById('agree-transfer');
  const registerBtn = document.getElementById('registerBtn');

  // 비밀번호 보이기/숨기기
  const passwordEye = document.getElementById('passwordEye');
  const passwordConfirmEye = document.getElementById('passwordConfirmEye');

  let isEmailVerified = false;

  // 비밀번호 토글
  passwordEye.addEventListener('click', () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
  });

  passwordConfirmEye.addEventListener('click', () => {
    const type = passwordConfirmInput.type === 'password' ? 'text' : 'password';
    passwordConfirmInput.type = type;
  });

  // 인증 코드 발송
  sendCodeBtn.addEventListener('click', () => {
    const email = emailInput.value.trim();
    
    if (!email) {
      alert('이메일을 입력해주세요.');
      return;
    }

    // Mock: 인증 코드 발송
    alert('인증코드 발송 (Mock)');
    
    // 인증 코드 입력칸 활성화
    verifyCodeInput.disabled = false;
    verifyCodeBtn.disabled = false;
    sendCodeBtn.textContent = '재발송';
  });

  // 인증 코드 확인
  verifyCodeBtn.addEventListener('click', () => {
    const code = verifyCodeInput.value.trim();
    
    if (!code) {
      alert('인증 코드를 입력해주세요.');
      return;
    }

    // Mock: 코드 확인
    alert('코드 확인 (Mock)');
    
    // 인증 완료 처리
    isEmailVerified = true;
    verifyCodeInput.disabled = true;
    verifyCodeBtn.disabled = true;
    verifyCodeBtn.textContent = '✓ 확인됨';
    sendCodeBtn.disabled = true;
    
    checkFormValidity();
  });

  // 폼 유효성 검사
  function checkFormValidity() {
    const emailFilled = emailInput.value.trim().length > 0;
    const lastNameFilled = lastNameInput.value.trim().length > 0;
    const firstNameFilled = firstNameInput.value.trim().length > 0;
    const phoneFilled = phoneInput.value.trim().length > 0;
    const birthdateFilled = birthdateInput.value.trim().length > 0;
    const passwordFilled = passwordInput.value.trim().length > 0;
    const passwordConfirmFilled = passwordConfirmInput.value.trim().length > 0;
    const passwordMatch = passwordInput.value === passwordConfirmInput.value;
    const agreeDataChecked = agreeDataCheckbox.checked;
    const agreeTransferChecked = agreeTransferCheckbox.checked;

    const allValid = isEmailVerified && 
                     emailFilled && 
                     lastNameFilled && 
                     firstNameFilled && 
                     phoneFilled && 
                     birthdateFilled && 
                     passwordFilled && 
                     passwordConfirmFilled && 
                     passwordMatch && 
                     agreeDataChecked && 
                     agreeTransferChecked;

    if (allValid) {
      registerBtn.classList.add('active');
      registerBtn.disabled = false;
    } else {
      registerBtn.classList.remove('active');
      registerBtn.disabled = true;
    }
  }

  // 입력 필드 변화 감지
  emailInput.addEventListener('input', checkFormValidity);
  lastNameInput.addEventListener('input', checkFormValidity);
  firstNameInput.addEventListener('input', checkFormValidity);
  phoneInput.addEventListener('input', checkFormValidity);
  birthdateInput.addEventListener('input', checkFormValidity);
  passwordInput.addEventListener('input', checkFormValidity);
  passwordConfirmInput.addEventListener('input', checkFormValidity);
  agreeDataCheckbox.addEventListener('change', checkFormValidity);
  agreeTransferCheckbox.addEventListener('change', checkFormValidity);

  // 폼 제출
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Mock: 회원가입 요청
    alert('회원가입 요청 (Mock)');
    
    // 실제 API 연동 시:
    // const formData = {
    //   email: emailInput.value,
    //   lastName: lastNameInput.value,
    //   firstName: firstNameInput.value,
    //   phone: phoneInput.value,
    //   countryCode: document.getElementById('country-code').value,
    //   birthdate: birthdateInput.value,
    //   password: passwordInput.value,
    //   agreeMarketing: document.getElementById('agree-marketing').checked
    // };
    // await fetch('https://prepmood.kr/api/register', {...});
  });
});





