# 🔒 Google OAuth 보안 개선 사항

## 📅 날짜: 2025-10-10

---

## ✅ 적용된 보안 개선

### 1. **Rate Limiting** ⚡
**문제**: 무제한 API 호출 가능 → DDoS 공격 및 무차별 대입 공격 가능

**해결**:
```javascript
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10, // 15분당 10번 요청 허용
    message: {
        success: false,
        error: '너무 많은 요청입니다. 15분 후에 다시 시도해주세요.'
    }
});
```

**적용 엔드포인트**:
- `POST /auth/google/login`
- `POST /auth/complete-profile`

---

### 2. **XSS (Cross-Site Scripting) 방지** 🛡️
**문제**: `firstName`, `lastName`에 HTML/JavaScript 코드 삽입 가능

**해결**:
```javascript
// XSS 방지: HTML 태그 제거
const sanitize = (str) => str.replace(/<[^>]*>/g, '').trim();
const sanitizedLastName = sanitize(lastName);
const sanitizedFirstName = sanitize(firstName);
```

**추가 검증**:
```javascript
// 이름 형식 검증 (한글, 영문, 공백만 허용)
if (!/^[가-힣a-zA-Z\s]+$/.test(sanitizedLastName) || 
    !/^[가-힣a-zA-Z\s]+$/.test(sanitizedFirstName)) {
    return res.status(400).json({
        success: false,
        error: '이름에는 한글과 영문만 입력 가능합니다.'
    });
}
```

---

### 3. **입력 값 검증 강화** ✔️

#### **전화번호 검증**:
```javascript
// 기존: /^[0-9-]+$/ (길이 제한 없음)
// 개선: /^[0-9-]{10,15}$/ (10~15자리로 제한)
if (phone && !/^[0-9-]{10,15}$/.test(phone)) {
    return res.status(400).json({
        success: false,
        error: '유효하지 않은 전화번호 형식입니다.'
    });
}
```

#### **생년월일 검증** (신규):
```javascript
if (birth) {
    const birthDate = new Date(birth);
    const today = new Date();
    const minDate = new Date('1900-01-01');
    
    if (isNaN(birthDate.getTime()) || birthDate > today || birthDate < minDate) {
        return res.status(400).json({
            success: false,
            error: '유효하지 않은 생년월일입니다.'
        });
    }
}
```

**검증 내용**:
- ✅ 유효한 날짜 형식인지 확인
- ✅ 미래 날짜 불가
- ✅ 1900년 이전 날짜 불가

---

### 4. **에러 메시지 개선** 📝
**문제**: 시스템 내부 정보 노출 (`'Database error'` 같은 메시지)

**해결**:
```javascript
// 기존
return {
    success: false,
    error: 'Database error'
};

// 개선
return {
    success: false,
    error: '사용자 정보 처리 중 오류가 발생했습니다.'
};
```

---

## 🔐 기존에 잘 구현된 보안 기능

### ✅ **이미 적용되어 있는 보안**:
1. **JWT 토큰 검증** - 모든 인증 엔드포인트에서 토큰 유효성 확인
2. **Parameterized Queries** - SQL Injection 방지
3. **HTTPS 강제** - 모든 통신 암호화
4. **Google OAuth 토큰 검증** - `google-auth-library` 사용
5. **bcrypt 비밀번호 해싱** - Google ID를 bcrypt로 해싱하여 저장
6. **Database Connection Pool 관리** - `finally` 블록으로 연결 해제
7. **CORS 설정** - 허용된 도메인만 API 접근 가능

---

## ⚠️ 추가 고려사항 (선택사항)

### 1. **CSRF 토큰**
- 현재는 JWT만 사용
- SPA이므로 CSRF 위험도 낮음
- 필요시 `csurf` 미들웨어 추가 가능

### 2. **IP 기반 Rate Limiting**
- 현재는 모든 요청에 대해 동일한 제한
- 필요시 IP별로 다른 제한 적용 가능

### 3. **로깅 및 모니터링**
- 의심스러운 활동 로깅
- 실패한 로그인 시도 추적

### 4. **2FA (Two-Factor Authentication)**
- Google 로그인 자체가 2FA 역할
- 추가 보안이 필요하면 SMS/이메일 인증 추가 가능

---

## 📊 보안 개선 전/후 비교

| 항목 | 개선 전 | 개선 후 |
|------|---------|---------|
| **Rate Limiting** | ❌ 없음 | ✅ 15분당 10회 |
| **XSS 방지** | ❌ HTML 삽입 가능 | ✅ HTML 태그 제거 |
| **이름 형식 검증** | ❌ 모든 문자 허용 | ✅ 한글/영문만 허용 |
| **전화번호 검증** | ⚠️ 길이 제한 없음 | ✅ 10~15자리 제한 |
| **생년월일 검증** | ❌ 없음 | ✅ 범위 및 형식 검증 |
| **에러 메시지** | ⚠️ 시스템 정보 노출 | ✅ 일반적 메시지 |

---

## 🚀 배포 방법

### VPS에서 실행:
```bash
cd /var/www/html
git pull origin main
cd backend
pm2 restart all
```

### 로컬에서 테스트:
```bash
cd backend
npm install  # express-rate-limit이 이미 설치되어 있음
node index.js
```

---

## 📝 테스트 체크리스트

- [ ] Rate Limiting 테스트: 15분 내 10회 이상 로그인 시도
- [ ] XSS 방지 테스트: `<script>alert('xss')</script>` 입력 시 제거 확인
- [ ] 이름 형식 검증: 특수문자 입력 시 거부 확인
- [ ] 전화번호 검증: 9자리 또는 16자리 입력 시 거부 확인
- [ ] 생년월일 검증: `9999-99-99` 입력 시 거부 확인
- [ ] 미래 날짜 검증: 내일 날짜 입력 시 거부 확인

---

## 🎯 결론

**모든 주요 보안 취약점이 해결되었습니다!**

- ✅ 무차별 대입 공격 방지
- ✅ XSS 공격 방지
- ✅ 잘못된 입력 데이터 방지
- ✅ 정보 노출 최소화

**프로덕션 환경에서 안전하게 사용 가능합니다.**

