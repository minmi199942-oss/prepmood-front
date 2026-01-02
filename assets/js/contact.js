// contact.js - 문의 접수 페이지 스크립트

(function() {
  'use strict';

  // API 설정
  const API_BASE = (window.API_BASE) 
    ? window.API_BASE 
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  // 관심분야/주제 데이터 구조
  const CATEGORIES = [
    {
      key: "제품 관련 안내",
      topics: [
        "제품 사양 · 소재 · 제작 방식",
        "착용감 · 관리 방법",
        "재입고 · 생산 일정 관련 안내"
      ]
    },
    {
      key: "구매 및 제공 가능 여부",
      topics: [
        "구매 가능 여부",
        "한정 수량 · 대기 리스트 안내",
        "선예약 · 사전 주문 관련 안내"
      ]
    },
    {
      key: "비스포크 · 커스텀 서비스",
      topics: [
        "개인 맞춤 제작 요청",
        "컬러 · 소재 · 디테일 변경 가능 여부",
        "이니셜 · 각인 등 특별 요청"
      ]
    },
    {
      key: "프라이빗 클라이언트 서비스",
      topics: [
        "기존 구매 이력 기반 문의",
        "동일 모델 리오더 · 추가 구매",
        "개인별 맞춤 안내 요청"
      ]
    },
    {
      key: "정품 인증 및 이력 확인",
      topics: [
        "정품 인증 절차 안내",
        "시리얼 · 인증 정보 확인",
        "제품 등록 관련 문의"
      ]
    },
    {
      key: "배송 및 프리미엄 딜리버리",
      topics: [
        "출고 일정 안내",
        "프리미엄 배송 옵션 안내",
        "해외 배송 · 통관 관련 안내"
      ]
    },
    {
      key: "애프터케어 · 사후 관리",
      topics: [
        "수선 · 복원 서비스 안내",
        "케어 프로그램 문의",
        "보관 · 유지 관리 상담"
      ]
    },
    {
      key: "기밀 · 특별 문의",
      topics: [
        "VIP · 기업 구매",
        "협업 · 파트너십",
        "기타 비공개 요청"
      ]
    }
  ];

  // DOM 요소
  const elements = {
    form: document.getElementById('inquiryForm'),
    category: document.getElementById('category'),
    topic: document.getElementById('topic'),
    message: document.getElementById('message'),
    lineCounter: document.getElementById('lineCounter'),
    charCounter: document.getElementById('charCounter'),
    submitBtn: document.getElementById('submitBtn'),
    successMessage: document.getElementById('successMessage'),
    privacyToggle: document.getElementById('privacyToggle'),
    privacyDetails: document.getElementById('privacyDetails'),
    // 자동 채움용
    lastName: document.getElementById('lastName'),
    firstName: document.getElementById('firstName'),
    email: document.getElementById('email'),
    countryCode: document.getElementById('countryCode'),
    phone: document.getElementById('phone'),
    honeypot: document.getElementById('honeypot')
  };

  // ============================================
  // 전화번호 자동 포맷팅
  // ============================================
  function formatPhoneNumber(value) {
    // 숫자만 추출
    const numbers = value.replace(/[^0-9]/g, '');
    
    // 길이에 따라 하이픈 추가
    if (numbers.length <= 3) {
      return numbers;
    } else if (numbers.length <= 7) {
      return numbers.slice(0, 3) + '-' + numbers.slice(3);
    } else {
      return numbers.slice(0, 3) + '-' + numbers.slice(3, 7) + '-' + numbers.slice(7, 11);
    }
  }

  function setupPhoneFormatting() {
    if (!elements.phone) return;
    
    elements.phone.addEventListener('input', function(e) {
      const cursorPosition = e.target.selectionStart;
      const oldValue = e.target.value;
      const newValue = formatPhoneNumber(oldValue);
      
      // 값이 변경된 경우에만 업데이트
      if (oldValue !== newValue) {
        e.target.value = newValue;
        
        // 커서 위치 조정 (하이픈 추가로 인한 위치 변화 보정)
        const addedHyphens = (newValue.match(/-/g) || []).length - (oldValue.match(/-/g) || []).length;
        const newCursorPosition = Math.min(cursorPosition + addedHyphens, newValue.length);
        e.target.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    });
    
    // 붙여넣기 시에도 포맷팅
    elements.phone.addEventListener('paste', function(e) {
      setTimeout(() => {
        e.target.value = formatPhoneNumber(e.target.value);
      }, 0);
    });
  }

  // ============================================
  // reCAPTCHA 초기화
  // ============================================
  let recaptchaWidgetId = null;

  function initRecaptcha() {
    const container = document.getElementById('recaptcha-container');
    if (!container) return;

    // config.js에서 Site Key 가져오기
    const siteKey = window.RECAPTCHA_SITE_KEY;
    if (!siteKey) {
      console.warn('reCAPTCHA Site Key가 설정되지 않았습니다. config.js를 확인하세요.');
      return;
    }

    // 이미 렌더된 경우 방지
    if (recaptchaWidgetId !== null) return;

    // reCAPTCHA API가 로드될 때까지 대기
    function waitForRecaptcha() {
      if (typeof grecaptcha !== 'undefined' && grecaptcha.render) {
        recaptchaWidgetId = grecaptcha.render(container, {
          'sitekey': siteKey
        });
      } else {
        setTimeout(waitForRecaptcha, 100);
      }
    }

    waitForRecaptcha();
  }

  function getRecaptchaToken() {
    if (typeof grecaptcha === 'undefined') return '';
    if (recaptchaWidgetId === null) return '';
    return grecaptcha.getResponse(recaptchaWidgetId);
  }

  function resetRecaptcha() {
    if (typeof grecaptcha === 'undefined') return;
    if (recaptchaWidgetId === null) return;
    grecaptcha.reset(recaptchaWidgetId);
  }

  // ============================================
  // 초기화
  // ============================================
  async function init() {
    // 전화번호 자동 포맷팅 설정
    setupPhoneFormatting();
    
    // 관심분야/주제 연동 설정
    setupCategoryTopicLink();

    // 메시지 제한 설정
    setupMessageLimits();

    // 자동 채움 시도
    await tryAutofillFromLogin();

    // reCAPTCHA 초기화
    initRecaptcha();

    // 폼 제출 이벤트
    elements.form.addEventListener('submit', handleSubmit);

    // 개인정보 동의 접기/펼치기
    if (elements.privacyToggle) {
      elements.privacyToggle.addEventListener('click', togglePrivacyDetails);
    }
  }

  // ============================================
  // 관심분야/주제 연동
  // ============================================
  function setupCategoryTopicLink() {
    elements.category.addEventListener('change', function() {
      const selectedCategory = this.value;
      const categoryData = CATEGORIES.find(cat => cat.key === selectedCategory);

      // 주제 옵션 초기화
      elements.topic.innerHTML = '<option value="">관심 분야를 먼저 선택해주세요</option>';

      if (categoryData) {
        // 주제 옵션 추가
        categoryData.topics.forEach(topic => {
          const option = document.createElement('option');
          option.value = topic;
          option.textContent = topic;
          elements.topic.appendChild(option);
        });
      }
    });
  }

  // ============================================
  // 메시지 제한 (1000자, 5줄)
  // ============================================
  function setupMessageLimits() {
    const MAX_CHARS = 1000;
    const MAX_LINES = 5;

    function updateCounters() {
      const text = elements.message.value;
      const trimmed = text.trim();
      
      // 글자수 카운터
      const charCount = trimmed.length;
      elements.charCounter.textContent = charCount;

      // 줄수 카운터
      const lines = trimmed.split('\n');
      const lineCount = lines.length;
      elements.lineCounter.textContent = lineCount;

      // 제한 초과 시 스타일 변경
      if (charCount > MAX_CHARS || lineCount > MAX_LINES) {
        elements.message.classList.add('error');
        elements.submitBtn.disabled = true;
      } else {
        elements.message.classList.remove('error');
        elements.submitBtn.disabled = false;
      }
    }

    // 입력 이벤트
    elements.message.addEventListener('input', function() {
      const text = this.value;
      const trimmed = text.trim();
      
      // 1000자 제한
      if (trimmed.length > MAX_CHARS) {
        this.value = text.substring(0, MAX_CHARS);
      }

      // 5줄 제한 (Enter 키로 6번째 줄 방지)
      const lines = this.value.split('\n');
      if (lines.length > MAX_LINES) {
        this.value = lines.slice(0, MAX_LINES).join('\n');
      }

      updateCounters();
    });

    // 초기 카운터 업데이트
    updateCounters();
  }

  // ============================================
  // 자동 채움 (로그인 상태 확인)
  // ============================================
  async function tryAutofillFromLogin() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        return; // 로그인 안 됨
      }

      const data = await response.json();
      if (data.success && data.user) {
        // last_name, first_name 분리해서 채움
        if (data.user.last_name) {
          elements.lastName.value = data.user.last_name;
        }
        if (data.user.first_name) {
          elements.firstName.value = data.user.first_name;
        }
        if (data.user.email) {
          elements.email.value = data.user.email;
        }

        // 전화번호 처리 (countryCode + phone 분리)
        if (data.user.phone) {
          const phoneMatch = data.user.phone.match(/^(\+\d{1,3})[- ]?(.+)$/);
          if (phoneMatch) {
            elements.countryCode.value = phoneMatch[1];
            elements.phone.value = phoneMatch[2].replace(/[^0-9]/g, '');
          } else {
            // 국가 코드 없는 경우 숫자만 추출
            elements.phone.value = data.user.phone.replace(/[^0-9]/g, '');
          }
        }
      }
    } catch (error) {
      // 무시 (로그인 안 됨)
    }
  }

  // ============================================
  // 개인정보 동의 접기/펼치기
  // ============================================
  function togglePrivacyDetails(e) {
    e.preventDefault();
    const isVisible = elements.privacyDetails.style.display !== 'none';
    elements.privacyDetails.style.display = isVisible ? 'none' : 'block';
    elements.privacyToggle.textContent = isVisible ? '자세히 보기' : '접기';
  }

  // ============================================
  // 폼 제출
  // ============================================
  async function handleSubmit(e) {
    e.preventDefault();

    // 허니팟 필드 체크
    if (elements.honeypot.value !== '') {
      alert('스팸 방지 검증에 실패했습니다.');
      return;
    }

    // reCAPTCHA 검증
    const recaptchaToken = getRecaptchaToken();
    if (!recaptchaToken) {
      alert('로봇이 아님을 확인해주세요.');
      return;
    }

    // 메시지 검증 (클라이언트 측)
    const messageText = elements.message.value.trim();
    const lines = messageText.split('\n');
    
    if (messageText.length === 0) {
      alert('메시지를 입력해주세요.');
      elements.message.focus();
      return;
    }

    if (messageText.length > 1000) {
      alert('메시지는 1000자 이하여야 합니다.');
      elements.message.focus();
      return;
    }

    if (lines.length > 5) {
      alert('메시지는 5줄 이하여야 합니다.');
      elements.message.focus();
      return;
    }

    // 제출 버튼 비활성화
    elements.submitBtn.disabled = true;
    elements.submitBtn.textContent = '전송 중...';

    try {
      // 폼 데이터 수집
      const formData = {
        salutation: elements.form.salutation.value,
        first_name: elements.form.first_name.value.trim(),
        last_name: elements.form.last_name.value.trim(),
        email: elements.form.email.value.trim(),
        region: elements.form.region.value,
        city: elements.form.city.value.trim() || null,
        country_code: elements.form.country_code.value || null,
        phone: elements.form.phone.value.trim() || null,
        category: elements.form.category.value,
        topic: elements.form.topic.value,
        message: messageText,
        privacy_consent: elements.form.privacy_consent.checked ? 'true' : 'false',
        age_consent: elements.form.age_consent.checked ? 'true' : 'false',
        recaptcha_token: recaptchaToken, // reCAPTCHA 토큰
        honeypot: elements.honeypot.value // 허니팟 필드
      };

      // CSRF 토큰 포함하여 제출 (secureFetch 사용)
      const response = await window.secureFetch(`${API_BASE}/inquiries`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '문의 접수에 실패했습니다.');
      }

      if (data.success) {
        // 성공: 폼 숨기고 성공 메시지 표시
        elements.form.style.display = 'none';
        elements.successMessage.style.display = 'block';
        
        // 폼 리셋
        elements.form.reset();
        elements.topic.innerHTML = '<option value="">관심 분야를 먼저 선택해주세요</option>';
        elements.lineCounter.textContent = '0';
        elements.charCounter.textContent = '0';
        
        // reCAPTCHA 리셋
        resetRecaptcha();
      } else {
        throw new Error(data.message || '문의 접수에 실패했습니다.');
      }

    } catch (error) {
      alert(error.message || '문의 접수 중 오류가 발생했습니다.');
      elements.submitBtn.disabled = false;
      elements.submitBtn.textContent = '보내기';
    }
  }

  // ============================================
  // 페이지 로드 시 초기화
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

