# 🔍 Pre.pMood 전체 시스템 분석 보고서

**작성일:** 2025년 10월 21일  
**분석 범위:** 프론트엔드 + 백엔드 전체 시스템

---

## 📋 **시스템 개요**

### **프로젝트 구조:**
```
project-root/
├── 프론트엔드 (HTML/CSS/JavaScript)
│   ├── 인증 시스템 (login, register, Google OAuth)
│   ├── 상품 시스템 (catalog, buy)
│   ├── 장바구니/위시리스트 (cart, wishlist)
│   ├── 마이페이지 (my-profile, my-orders)
│   └── 공통 컴포넌트 (header, footer, mini-cart)
│
└── 백엔드 (Node.js + Express)
    ├── 인증 API (email/password, Google OAuth)
    ├── 위시리스트 API
    ├── 상품 관리 API
    └── MySQL 데이터베이스
```

---

## 🔐 **현재 인증 시스템 상세 분석**

### **1. 로그인 흐름 (일반 이메일)**

#### **프론트엔드 (login.html:260-312)**
```javascript
// 1. 사용자가 이메일/비밀번호 입력
// 2. fetch('https://prepmood.kr/api/login', {...})
// 3. 응답 받기:
{
  success: true,
  user: {
    id: 123,
    email: "user@example.com",
    name: "홍길동",
    phone: "010-1234-5678",
    birthdate: "1990-01-01"
  }
  // ❌ token 없음!
}

// 4. localStorage에 저장:
localStorage.setItem('user', JSON.stringify(data.user));
localStorage.setItem('isLoggedIn', 'true');
sessionStorage.setItem('userLoggedIn', 'true');
sessionStorage.setItem('userEmail', data.user.email);
```

#### **백엔드 (backend/index.js:327-417)**
```javascript
app.post('/api/login', async (req, res) => {
  // 1. 이메일/비밀번호 검증
  // 2. DB에서 사용자 조회
  // 3. bcrypt로 비밀번호 확인
  // 4. 응답:
  res.json({
    success: true,
    user: {
      id: user.user_id,
      email: user.email,
      name: `${user.last_name} ${user.first_name}`,
      phone: user.phone,
      birthdate: user.birth
    }
    // ❌ JWT 토큰 발급 없음!
  });
});
```

**🔴 문제점:**
- JWT 토큰이 없어서 서버가 로그인 상태를 확인할 수 없음
- 클라이언트가 `localStorage.setItem('isLoggedIn', 'true')`로 임의로 로그인 상태 설정
- 누구나 개발자 도구로 조작 가능

---

### **2. 로그인 흐름 (Google OAuth)**

#### **프론트엔드 (login.html:115-156)**
```javascript
async function handleGoogleSignIn(response) {
  // 1. Google ID 토큰 받기
  // 2. 백엔드로 전송
  const backendResponse = await fetch('https://prepmood.kr/api/auth/google/login', {
    body: JSON.stringify({ idToken: response.credential })
  });
  
  // 3. 응답:
  {
    success: true,
    user: {...},
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // ✅ JWT 있음!
    needsAdditionalInfo: false
  }
  
  // 4. localStorage에 저장:
  localStorage.setItem('user', JSON.stringify(data.user));
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('authToken', data.token);  // ✅ 토큰 저장
}
```

#### **백엔드 (backend/google-auth-routes.js:19-71)**
```javascript
router.post('/auth/google/login', async (req, res) => {
  // 1. Google ID 토큰 검증
  // 2. DB에서 사용자 찾거나 생성
  // 3. JWT 토큰 생성
  const jwtToken = googleAuth.generateJWT(userResult.user);
  
  // 4. 응답:
  res.json({
    success: true,
    user: userResult.user,
    token: jwtToken,  // ✅ JWT 발급!
    needsAdditionalInfo: needsAdditionalInfo
  });
});
```

#### **JWT 생성 (backend/google-auth.js:128-140)**
```javascript
generateJWT(user) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }  // 7일 후 만료
  );
}
```

**⚠️ 문제점:**
- JWT는 발급하지만 **localStorage에 저장** (XSS 공격에 취약)
- httpOnly 쿠키로 저장해야 함
- 토큰을 발급해도 **실제로 사용하지 않음** (API 요청 시 검증 안 함)

---

### **3. 로그인 상태 확인 방식**

#### **프론트엔드 (header-loader.js:256-274)**
```javascript
function checkLoginStatus() {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';  // ❌ 클라이언트 사이드만 확인
  const userData = localStorage.getItem('user');
  
  if (isLoggedIn && userData) {
    // 로그인 상태
    mypageIcon.src = 'image/loginmypage.jpg';
  } else {
    // 비로그인 상태
    mypageToggle.href = 'login.html';
  }
}
```

**🔴 치명적 문제:**
```javascript
// 공격자가 개발자 도구(F12)에서:
localStorage.setItem('isLoggedIn', 'true');
localStorage.setItem('user', JSON.stringify({
  id: 999,
  email: 'hacker@evil.com',
  name: 'Admin'
}));
location.reload();
// → 로그인 성공! 마이페이지 접근 가능!
```

---

### **4. API 인증 방식**

#### **위시리스트 API (backend/index.js:778-842)**
```javascript
app.post('/api/wishlist/toggle', async (req, res) => {
  const { productId } = req.body;
  const userEmail = req.headers['x-user-email'];  // ❌ 헤더에서 이메일만 받음
  
  if (!userEmail) {
    return res.status(401).json({
      success: false,
      message: '로그인이 필요합니다.'
    });
  }
  
  // ❌ 이메일 검증 없이 그대로 사용!
  const [existing] = await connection.execute(
    'SELECT id FROM wishlists WHERE user_email = ? AND product_id = ?',
    [userEmail, productId]
  );
});
```

#### **프론트엔드 (wishlist-script.js:42-58)**
```javascript
const userEmail = sessionStorage.getItem('userEmail');  // ❌ 클라이언트에서 가져옴

const response = await fetch(`${API_BASE_URL}/wishlist`, {
  method: 'GET',
  headers: {
    'X-User-Email': userEmail  // ❌ 임의로 조작 가능!
  }
});
```

**🔴 심각한 보안 문제:**
```javascript
// 공격자가:
sessionStorage.setItem('userEmail', 'victim@example.com');

// 그리고 API 호출하면:
// → 피해자의 위시리스트를 조회/수정 가능!
```

---

## 🚨 **보안 취약점 상세**

### **취약점 1: 클라이언트 사이드 인증**

**위치:**
- `header-loader.js:258`
- `my-profile.js:19`
- `wishlist-script.js:7-8`

**코드:**
```javascript
const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
```

**공격 시나리오:**
1. F12 → Console
2. `localStorage.setItem('isLoggedIn', 'true')`
3. 페이지 새로고침
4. ✅ 로그인 완료!

**영향:**
- 마이페이지 접근
- 위시리스트 조회 (타인 것도 가능)
- 주문 내역 조회

**해결 방법:**
- JWT 기반 서버 사이드 인증
- httpOnly 쿠키로 토큰 저장
- 모든 API 요청에 토큰 검증

---

### **취약점 2: 민감 정보 LocalStorage 저장**

**위치:**
- `login.html:133-135, 291-297`
- `complete-profile.html`

**저장되는 데이터:**
```javascript
localStorage.setItem('user', JSON.stringify({
  id: 123,
  email: "user@example.com",
  name: "홍길동",
  phone: "010-1234-5678",
  birthdate: "1990-01-01"
}));
```

**문제점:**
- 암호화 없이 평문 저장
- XSS 공격으로 탈취 가능
- 공용 PC에서 정보 노출

**해결 방법:**
- 민감 정보는 서버에만 저장
- 클라이언트는 최소 정보만 (이름, 이메일 정도)
- JWT 토큰만 httpOnly 쿠키에 저장

---

### **취약점 3: API 인증 부재**

**영향받는 API:**
- `/api/wishlist/toggle`
- `/api/wishlist`
- `/api/wishlist/check`
- (장바구니 API 있다면 동일)

**현재 방식:**
```javascript
// 클라이언트:
headers: { 'X-User-Email': userEmail }

// 서버:
const userEmail = req.headers['x-user-email'];
// 그대로 신뢰하고 사용 → ❌
```

**공격 시나리오:**
```javascript
// Postman이나 curl로:
curl -X POST https://prepmood.kr/api/wishlist/toggle \
  -H "Content-Type: application/json" \
  -H "X-User-Email: victim@example.com" \
  -d '{"productId": "malicious-item"}'

// → 피해자의 위시리스트에 상품 추가 성공!
```

**해결 방법:**
```javascript
// 서버:
const token = req.cookies.accessToken;  // httpOnly 쿠키에서
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const userEmail = decoded.email;  // 토큰에서 추출된 이메일 사용
```

---

### **취약점 4: Google OAuth JWT 미사용**

**현재 상황:**
- Google 로그인 시 JWT 발급: ✅
- localStorage에 저장: ⚠️ (httpOnly 쿠키에 저장해야 함)
- API 요청 시 토큰 전송: ❌
- 서버에서 토큰 검증: ❌

**코드 확인:**
```javascript
// Google 로그인 후:
localStorage.setItem('authToken', data.token);  // 저장은 하지만...

// API 요청 시:
headers: {
  'X-User-Email': userEmail  // 토큰 대신 이메일만 전송!
}
```

**문제:**
- JWT를 발급해도 실제로 사용하지 않음
- 일반 로그인과 똑같이 이메일만 헤더로 전송
- 서버가 토큰을 검증하지 않음

---

## ✅ **잘 구현된 부분**

### **1. 비밀번호 보안**
```javascript
// backend/index.js:287-291
const saltRounds = 10;
const hashedPassword = await bcrypt.hash(password, saltRounds);
```
- ✅ bcrypt 사용
- ✅ Salt rounds 적절 (10)
- ✅ 평문 비밀번호 저장 안 함

---

### **2. 입력값 검증**
```javascript
// backend/index.js:86-93
body('email')
  .isEmail()
  .withMessage('올바른 이메일 형식이 아닙니다.')
  .normalizeEmail()
  .isLength({ max: 254 })
  .withMessage('이메일이 너무 깁니다.')
```
- ✅ express-validator 사용
- ✅ 이메일, 비밀번호, 생년월일 등 검증
- ✅ SQL Injection 방지 (Prepared Statements)

---

### **3. Rate Limiting**
```javascript
// backend/index.js:38-54
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15분
  max: 10  // 최대 10회
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
```
- ✅ 이메일 발송은 엄격하게 (10회)
- ✅ 일반 API는 관대하게 (100회)
- ⚠️ 하지만 여전히 약함 (브루트포스 가능)

---

### **4. CORS 설정**
```javascript
// backend/index.js:18-30
const allowedOrigins = [
  'http://localhost:8000',
  'http://localhost:3000',
  // ...
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
```
- ✅ CORS 설정 있음
- ⚠️ 너무 많은 origin 허용 (로컬호스트 6개)
- ⚠️ 프로덕션에서도 개발 origin 허용될 가능성

---

### **5. XSS 방어 (최근 수정)**
```javascript
// utils.js:17-26
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
```
- ✅ XSS 방어 함수 도입
- ✅ 모든 `innerHTML` 사용 시 이스케이프 처리
- ✅ `catalog-script.js`, `mini-cart.js` 등 적용 완료

---

### **6. Helmet 사용**
```javascript
// backend/index.js:32-36
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
```
- ✅ Helmet 사용 (기본 보안 헤더)
- ⚠️ CSP 비활성화 (CORS 호환성 위해)

---

## 🎯 **수정 계획 (우선순위 순)**

### **1단계: JWT 인증 시스템 완성 (가장 중요!)**

#### **A. 일반 로그인에 JWT 추가**

**backend/index.js:327-417 수정:**
```javascript
// 기존:
res.json({
  success: true,
  user: {...}
});

// 수정 후:
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    userId: user.user_id,
    email: user.email,
    name: `${user.last_name} ${user.first_name}`.trim()
  },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

// httpOnly 쿠키로 전송
res.cookie('accessToken', token, {
  httpOnly: true,  // JavaScript로 접근 불가
  secure: true,    // HTTPS만
  sameSite: 'strict',  // CSRF 방지
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7일
});

res.json({
  success: true,
  user: {
    id: user.user_id,
    email: user.email,
    name: `${user.last_name} ${user.first_name}`.trim()
  }
  // token은 응답에 포함하지 않음 (쿠키로만)
});
```

---

#### **B. JWT 검증 미들웨어 생성**

**backend/auth-middleware.js (새 파일):**
```javascript
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const token = req.cookies.accessToken;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: '로그인이 필요합니다.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;  // { userId, email, name }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '세션이 만료되었습니다. 다시 로그인해주세요.',
        expired: true
      });
    }
    return res.status(403).json({
      success: false,
      message: '유효하지 않은 토큰입니다.'
    });
  }
}

module.exports = { authenticateToken };
```

---

#### **C. API에 인증 미들웨어 적용**

**backend/index.js 수정:**
```javascript
const { authenticateToken } = require('./auth-middleware');

// 위시리스트 API에 인증 추가
app.post('/api/wishlist/toggle', authenticateToken, async (req, res) => {
  const { productId } = req.body;
  const userEmail = req.user.email;  // ✅ 토큰에서 추출 (신뢰 가능)
  
  // 기존 로직 그대로...
});

app.get('/api/wishlist', authenticateToken, async (req, res) => {
  const userEmail = req.user.email;  // ✅ 토큰에서 추출
  // ...
});
```

---

#### **D. Google 로그인도 httpOnly 쿠키로 변경**

**backend/google-auth-routes.js:19-71 수정:**
```javascript
router.post('/auth/google/login', async (req, res) => {
  // ... (기존 검증 로직)
  
  const jwtToken = googleAuth.generateJWT(userResult.user);
  
  // httpOnly 쿠키로 설정
  res.cookie('accessToken', jwtToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  
  res.json({
    success: true,
    user: userResult.user,
    // token은 응답에서 제거 (쿠키로만)
    needsAdditionalInfo: needsAdditionalInfo
  });
});
```

---

### **2단계: 프론트엔드 수정**

#### **A. localStorage 사용 중단**

**login.html:286-300 수정:**
```javascript
// 기존:
localStorage.setItem('user', JSON.stringify(data.user));
localStorage.setItem('isLoggedIn', 'true');
localStorage.setItem('authToken', data.token);

// 수정 후:
// 아무것도 저장하지 않음!
// 서버가 httpOnly 쿠키로 토큰을 설정함
// 필요하면 최소 정보만:
sessionStorage.setItem('userName', data.user.name);  // 환영 메시지용
```

---

#### **B. 로그인 상태 확인 API 추가**

**backend/index.js에 추가:**
```javascript
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      userId: req.user.userId,
      email: req.user.email,
      name: req.user.name
    }
  });
});
```

**header-loader.js 수정:**
```javascript
async function checkLoginStatus() {
  try {
    const response = await fetch('https://prepmood.kr/api/auth/me', {
      credentials: 'include'  // 쿠키 포함
    });
    
    const data = await response.json();
    
    if (data.success) {
      // 로그인 상태
      mypageIcon.src = 'image/loginmypage.jpg';
      sessionStorage.setItem('userName', data.user.name);
    } else {
      // 비로그인 상태
      mypageToggle.href = 'login.html';
    }
  } catch (error) {
    // 로그인 안 됨
    mypageToggle.href = 'login.html';
  }
}
```

---

#### **C. API 호출 시 credentials 포함**

**wishlist-script.js 수정:**
```javascript
// 기존:
const userEmail = sessionStorage.getItem('userEmail');
const response = await fetch(`${API_BASE_URL}/wishlist`, {
  headers: {
    'X-User-Email': userEmail  // ❌ 제거
  }
});

// 수정 후:
const response = await fetch(`${API_BASE_URL}/wishlist`, {
  credentials: 'include'  // ✅ 쿠키 자동 전송
  // 헤더는 필요 없음! 서버가 쿠키에서 토큰 읽음
});
```

---

### **3단계: CORS 설정 최적화**

**backend/index.js 수정:**
```javascript
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://prepmood.kr']  // 프로덕션: 실제 도메인만
  : ['http://localhost:5500', 'http://127.0.0.1:5500'];  // 개발: 로컬만

app.use(cors({
  origin: allowedOrigins,
  credentials: true  // httpOnly 쿠키 위해 필수
}));
```

---

### **4단계: Rate Limiting 강화**

**backend/index.js 수정:**
```javascript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,  // 15분에 5회로 강화
  message: {
    success: false,
    message: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.'
  }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  // ...
});
```

---

### **5단계: 비밀번호 정책 강화**

**register.html 수정:**
```javascript
validatePassword() {
  const password = document.getElementById('password').value;
  
  // 최소 8자
  if (password.length < 8) {
    return false;
  }
  
  // 영문, 숫자, 특수문자 조합
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!hasLetter || !hasNumber || !hasSpecial) {
    this.showError('passwordError', '비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.');
    return false;
  }
  
  return true;
}
```

---

## 📊 **수정 전 vs 수정 후 비교**

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **인증 방식** | localStorage (클라이언트) | JWT + httpOnly 쿠키 (서버) |
| **해킹 난이도** | ⭐ (1분) | ⭐⭐⭐⭐⭐ (거의 불가능) |
| **민감 정보 저장** | localStorage (평문) | 서버에만 저장 |
| **API 인증** | X-User-Email 헤더 (위조 가능) | JWT 토큰 검증 |
| **Google OAuth** | JWT 발급만 (사용 안 함) | JWT 발급 + 검증 |
| **XSS 공격** | localStorage 탈취 가능 | httpOnly 쿠키 (탈취 불가) |
| **CSRF 공격** | 가능 | sameSite='strict'로 방어 |
| **보안 등급** | D (매우 취약) | A (안전) |

---

## ⏱️ **예상 작업 시간**

| 단계 | 작업 | 소요 시간 |
|------|------|----------|
| 1 | JWT 인증 미들웨어 생성 | 1시간 |
| 2 | 일반 로그인 API 수정 | 30분 |
| 3 | Google 로그인 API 수정 | 30분 |
| 4 | 위시리스트 API에 인증 추가 | 30분 |
| 5 | 프론트엔드 수정 (localStorage 제거) | 1시간 |
| 6 | 로그인 상태 확인 API 추가 | 30분 |
| 7 | CORS 설정 최적화 | 15분 |
| 8 | Rate Limiting 강화 | 15분 |
| 9 | 비밀번호 정책 강화 | 30분 |
| 10 | 테스트 및 버그 수정 | 1-2시간 |
| **합계** | | **약 6-7시간** |

---

## 🚀 **시작할 준비 완료!**

**다음 단계:**
1. ✅ 전체 시스템 분석 완료
2. ⏭️ JWT 인증 미들웨어 생성
3. ⏭️ 백엔드 API 수정
4. ⏭️ 프론트엔드 수정
5. ⏭️ 테스트

**시작할까요?** 🎯

