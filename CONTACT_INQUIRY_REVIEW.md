# 고객 문의하기 서비스 설계안 검토

## ✅ 잘 설계된 부분

### 1. **Footer 링크 추가**
- 고객센터 이메일 하단에 "문의하기" 링크 추가 → 적절함
- `contact.html`로 네비게이션 → 적절함

### 2. **로그인 선택적 처리**
- 로그인 필수 아님 → 전환율 향상에 유리
- 로그인 시 자동 채움 → UX 개선
- `optionalAuth` 미들웨어 활용 → 기존 구조와 일치

### 3. **UI/UX 구조**
- 샤넬 스타일 레이아웃 반영 → 적절함
- 좌측 안내 문구 + 우측 폼 → 직관적
- 관심분야/주제 2단 셀렉트 → 분류 품질 향상

### 4. **메시지 제한**
- 1000자, 5줄 제한 → 프리미엄 톤 유지
- 실시간 카운터 표시 → UX 개선
- Enter 키로 줄수 초과 방지 → 적절함

### 5. **백엔드 설계**
- 허니팟 필드 → 스팸 방지 적절
- Rate limit → 남용 방지 적절
- `optionalAuth` 사용 → 적절함

### 6. **DB 구조**
- `user_id` NULL 허용 → 비로그인 문의 지원
- `status` ENUM → 관리 편의성
- `admin_memo` → 운영 편의성

## ⚠️ 수정이 필요한 부분

### 1. **사용자 데이터 매핑 불일치**

**문제:**
- 현재 DB: `last_name`, `first_name` (한국식: 성, 이름)
- 현재 API: `name: ${user.last_name} ${user.first_name}` (합쳐서 반환)
- 설계안: `first_name`, `lastName` (서양식: 이름, 성)

**해결 방안:**
```javascript
// contact.js의 tryAutofillFromLogin 함수 수정 필요
const data = await res.json();
if (data.success && data.user) {
  // DB는 last_name, first_name이지만
  // API 응답은 name으로 합쳐서 반환됨
  // 따라서 이름을 분리해야 함
  const nameParts = (data.user.name || '').split(' ');
  if (nameParts.length >= 2) {
    els.lastName.value = nameParts[0]; // 성
    els.firstName.value = nameParts.slice(1).join(' '); // 이름
  } else if (nameParts.length === 1) {
    els.lastName.value = nameParts[0];
  }
  
  els.email.value = data.user.email || '';
  els.phone.value = data.user.phone || '';
}
```

**또는 더 나은 방법:**
- `/api/auth/me`를 `optionalAuth`로 변경하거나
- 새로운 `/api/auth/me-optional` 엔드포인트 추가
- 응답에 `last_name`, `first_name`을 분리해서 반환

### 2. **개인정보 동의 체크박스**

**문제:**
- 단일 체크박스에 "개인정보 수집·이용 동의" + "만 14세 이상 확인" 통합
- 컴플라이언스 관점에서 분리 권장

**권장 수정:**
```html
<div class="consent">
  <label class="check">
    <input id="privacyConsent" type="checkbox" required />
    <span>
      본 문의 서비스 이용을 위해 필요한 최소한의 개인정보를 수집·이용합니다.
      수집된 정보는 고객 식별 및 문의 처리 목적으로만 사용되며, 관련 법령에 따라 3년간 보관됩니다.
      개인정보 수집·이용에 동의하지 않으실 경우, 본 서비스 이용이 제한될 수 있습니다.
    </span>
  </label>
  
  <label class="check">
    <input id="ageConsent" type="checkbox" required />
    <span>본인은 만 14세 이상임을 확인합니다.</span>
  </label>
</div>
```

### 3. **CSRF 토큰 처리**

**문제:**
- 설계안에 CSRF 토큰 처리 누락
- 현재 시스템은 CSRF 보호 사용 중

**수정 필요:**
```javascript
// contact.js
// 페이지 로드 시 CSRF 토큰 발급 (GET 요청)
// 폼 제출 시 X-XSRF-Token 헤더 추가
const response = await fetch('/api/inquiries', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-XSRF-Token': getCSRFToken(), // CSRF 토큰 추가
  },
  body: JSON.stringify(payload),
});
```

### 4. **Rate Limit 설정**

**문제:**
- 설계안에 rate limit 언급만 있고 구체적 설정 없음

**권장:**
```javascript
// backend/inquiry-routes.js
const { rateLimit } = require('express-rate-limit');

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5회
  message: '너무 많은 문의 요청이 있습니다. 잠시 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/api/inquiries', inquiryLimiter, optionalAuth, ...);
```

### 5. **에러 처리 개선**

**문제:**
- 설계안의 에러 처리가 단순함 (`alert`만 사용)

**권장:**
- 토스트 메시지 또는 인라인 에러 표시
- 서버 에러 메시지를 사용자 친화적으로 변환

### 6. **메시지 힌트 처리**

**문제:**
- 설계안: "투명하게 요청하실 내용을 입력해주세요."를 오버레이로 처리
- 실제로는 `placeholder` 속성 사용이 더 간단하고 표준적

**권장:**
```html
<textarea 
  id="message" 
  rows="5" 
  placeholder="요청하실 내용을 입력해주세요."
  required
></textarea>
```

## 📋 추가 권장 사항

### 1. **접수번호 생성**
- 문의 접수 후 8자리 접수번호 표시
- 예: `INQ-20250101-001`

### 2. **이메일 알림**
- 문의 접수 시 고객에게 자동 이메일 발송
- 관리자에게도 알림 (선택)

### 3. **관리자 화면 최소 구현**
- 문의 목록 조회
- 상태 변경 (new → in_progress → answered → closed)
- 메모 추가

### 4. **지역/국가 코드 데이터**
- 설계안에 하드코딩된 국가 코드
- 실제로는 국가 목록을 DB나 설정 파일로 관리 권장

### 5. **전화번호 형식 검증**
- 국가 코드별 전화번호 형식 검증 추가 권장

## 🔧 구현 시 주의사항

### 1. **API 엔드포인트**
- `/api/inquiries` (POST) - 문의 접수
- `/api/auth/me-optional` (GET) - 선택적 사용자 정보 조회 (신규 추가 권장)

### 2. **DB 마이그레이션**
- `inquiries` 테이블 생성 필요
- 인덱스: `user_id`, `status`, `created_at`

### 3. **보안**
- XSS 방지: 모든 사용자 입력 `escapeHtml` 처리
- SQL Injection: Prepared Statement 사용 (이미 적용됨)
- Rate Limit: 문의 남용 방지

## ✅ 최종 평가

**전체적으로 잘 설계되었습니다.**

다만 다음 3가지는 반드시 수정 권장:
1. ✅ 사용자 데이터 매핑 (last_name/first_name 분리)
2. ✅ 개인정보 동의 체크박스 분리
3. ✅ CSRF 토큰 처리 추가

나머지는 선택적 개선 사항입니다.







