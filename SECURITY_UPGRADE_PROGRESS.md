# 🔐 보안 업그레이드 진행 상황

**작성일:** 2025년 10월 21일  
**진행 시간:** 약 1시간

---

## ✅ **완료된 작업**

### **1. JWT 인증 시스템 구축 (백엔드)** ✅

#### **생성한 파일:**
- `backend/auth-middleware.js` (새 파일)
  - `authenticateToken()` - JWT 검증 미들웨어
  - `optionalAuth()` - 선택적 인증 미들웨어
  - `generateToken()` - JWT 생성 함수
  - `setTokenCookie()` - httpOnly 쿠키 설정
  - `clearTokenCookie()` - 쿠키 삭제 (로그아웃)

#### **설치한 패키지:**
```bash
npm install cookie-parser
```

#### **수정한 파일:**
- `backend/index.js`
  - cookie-parser 추가
  - 인증 미들웨어 import
  - 로그인 API에 JWT 토큰 생성 추가
  - 로그인 상태 확인 API 추가 (`/api/auth/me`)
  - 로그아웃 API 추가 (`/api/logout`)

---

### **2. httpOnly 쿠키로 토큰 저장** ✅

#### **변경 사항:**
- **localStorage 사용 중단**
  - ❌ `localStorage.setItem('isLoggedIn', 'true')`
  - ❌ `localStorage.setItem('user', JSON.stringify(user))`
  - ❌ `localStorage.setItem('authToken', token)`
  
- **httpOnly 쿠키 사용**
  - ✅ `setTokenCookie(res, token)` - 서버에서 자동 설정
  - ✅ JavaScript로 접근 불가
  - ✅ XSS 공격 방어
  - ✅ CSRF 방어 (`sameSite: 'strict'`)

#### **수정한 파일:**
- `login.html`
  - Google 로그인 성공 시 localStorage 제거
  - 일반 로그인 성공 시 localStorage 제거
  - sessionStorage에 최소 정보만 저장 (userName)

---

### **3. API 엔드포인트에 인증 미들웨어 추가** ✅

#### **적용한 API:**
```javascript
// 위시리스트 API
app.post('/api/wishlist/toggle', authenticateToken, ...);
app.get('/api/wishlist/check', authenticateToken, ...);
app.get('/api/wishlist', authenticateToken, ...);

// 로그인 상태 확인
app.get('/api/auth/me', authenticateToken, ...);
```

#### **변경 전 vs 변경 후:**

**변경 전:**
```javascript
const userEmail = req.headers['x-user-email'];  // ❌ 클라이언트에서 전송 (위조 가능)
```

**변경 후:**
```javascript
const userEmail = req.user.email;  // ✅ JWT에서 추출 (신뢰 가능)
```

#### **수정한 파일:**
- `backend/index.js`
  - 위시리스트 API 3개에 `authenticateToken` 추가
  - `X-User-Email` 헤더 제거, `req.user.email` 사용

- `backend/google-auth-routes.js`
  - `setTokenCookie` import
  - Google 로그인 시 httpOnly 쿠키로 토큰 설정
  - Google 로그인 상태 확인 API 간소화

---

### **4. 프론트엔드 인증 로직 수정 (JWT 기반)** 🔄 진행 중

#### **완료된 작업:**

**header-loader.js:**
- ✅ `checkLoginStatus()` - 서버 API 호출로 변경
  ```javascript
  // 변경 전
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  
  // 변경 후
  const response = await fetch('https://prepmood.kr/api/auth/me', {
    credentials: 'include'  // httpOnly 쿠키 포함
  });
  ```

- ✅ `handleLogout()` - 서버 로그아웃 API 호출
  ```javascript
  await fetch('https://prepmood.kr/api/logout', {
    method: 'POST',
    credentials: 'include'
  });
  ```

- ✅ `toggleDropdown()` - 로그인 상태 확인 로직 변경

**wishlist-script.js:**
- ✅ API 호출 시 `X-User-Email` 헤더 제거
- ✅ `credentials: 'include'` 추가 (쿠키 자동 전송)

---

## ⏳ **진행 중인 작업**

### **프론트엔드 인증 로직 수정**

#### **아직 수정 필요한 파일:**
- `my-profile.js` - 로그인 확인 로직
- `buy-script.js` - 위시리스트 API 호출
- `complete-profile.html` - Google 로그인 후 추가 정보 입력

---

## 📋 **남은 작업**

### **5. CORS 설정 최적화**
```javascript
// 현재
const allowedOrigins = [
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

// 수정 필요
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://prepmood.kr']
  : ['http://localhost:5500', 'http://127.0.0.1:5500'];
```

---

### **6. Rate Limiting 강화**
```javascript
// 현재
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100  // 너무 관대함
});

// 수정 필요
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5  // 브루트포스 방지
});
```

---

### **7. 비밀번호 정책 강화**
```javascript
// 추가 필요
validatePassword() {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);
  
  if (!hasLetter || !hasNumber || !hasSpecial) {
    return false;
  }
}
```

---

## 📊 **진행 상황**

| 작업 | 상태 | 진행률 |
|------|------|--------|
| JWT 인증 시스템 구축 | ✅ 완료 | 100% |
| httpOnly 쿠키 적용 | ✅ 완료 | 100% |
| API 인증 미들웨어 | ✅ 완료 | 100% |
| 프론트엔드 수정 | 🔄 진행 중 | 70% |
| CORS 최적화 | ⏳ 대기 | 0% |
| Rate Limiting | ⏳ 대기 | 0% |
| 비밀번호 정책 | ⏳ 대기 | 0% |
| **전체** | 🔄 진행 중 | **67%** |

---

## 🎯 **다음 단계**

1. ✅ 프론트엔드 나머지 파일 수정
   - my-profile.js
   - buy-script.js  
   - complete-profile.html

2. ✅ CORS 설정 최적화

3. ✅ Rate Limiting 강화

4. ✅ 비밀번호 정책 추가

5. ✅ 테스트
   - 로그인/로그아웃
   - 위시리스트 추가/제거
   - 인증 필요 페이지 접근
   - F12로 localStorage 조작 시도 (실패 확인)

---

## 🚀 **예상 완료 시간**

- **남은 시간:** 약 30-40분
- **총 소요 시간:** 약 1.5-2시간

---

## 📝 **참고 사항**

### **테스트 방법:**
```bash
# 백엔드 서버 재시작 (PM2 사용 시)
pm2 restart prepmood-backend

# 또는 일반 실행
cd backend
node index.js
```

### **브라우저 테스트:**
1. **캐시 삭제** (Ctrl+Shift+Delete)
2. **로그인** → JWT 쿠키 확인 (DevTools → Application → Cookies)
3. **F12 콘솔에서 조작 시도:**
   ```javascript
   localStorage.setItem('isLoggedIn', 'true');
   // → 아무 효과 없음! (서버가 쿠키만 확인)
   ```

---

**계속 진행 중입니다...** 🚀

