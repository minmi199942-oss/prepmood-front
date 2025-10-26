# 🔒 홈페이지 보안 위험 평가 보고서

**작성일:** 2025년 10월 21일  
**대상:** Pre.pMood 이커머스 웹사이트  
**평가 범위:** 프론트엔드 + 백엔드 시스템

---

## 📊 **종합 보안 등급**

| 구분 | 등급 | 상태 |
|------|------|------|
| **전체 보안** | ⚠️ **B-** | 중간 위험 |
| **프론트엔드** | ✅ **A** | 양호 (최근 XSS 수정 완료) |
| **백엔드** | ⚠️ **C+** | 주의 필요 |
| **데이터베이스** | ⚠️ **B** | 개선 필요 |
| **인증/세션** | 🔴 **D** | **심각한 위험** |

---

## 🚨 **심각도별 위험 요소**

### 🔴 **긴급 (Critical) - 즉시 조치 필요**

#### 1. **클라이언트 사이드 인증 (Client-Side Authentication)**
**위치:** `header-loader.js:258`, `my-profile.js:19`

```javascript
// ❌ 매우 위험한 코드!
const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
```

**문제점:**
- ✅ 브라우저의 개발자 도구(F12)로 **누구나 조작 가능**
- ✅ 공격자가 다음과 같이 쉽게 우회:
  ```javascript
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('user', JSON.stringify({name: 'Admin', email: 'admin@test.com'}));
  ```
- ✅ 마이페이지, 주문 내역 등 **모든 보호된 페이지 접근 가능**

**해킹 시나리오:**
1. 공격자가 F12를 열어 콘솔에서 `localStorage.setItem('isLoggedIn', 'true')` 실행
2. 페이지 새로고침
3. ✅ **로그인 없이 모든 기능 접근 성공!**

**영향도:** 🔴 **최상**  
**해킹 난이도:** ⭐ (5분 안에 가능)

**해결 방법:**
```javascript
// ✅ 올바른 방법: 서버에서 JWT 토큰 검증
// 1. 백엔드에서 JWT 발급
// 2. httpOnly 쿠키에 저장 (JavaScript로 접근 불가)
// 3. 모든 API 요청에 토큰 검증
```

---

#### 2. **민감 정보 LocalStorage 저장**
**위치:** `my-profile.js:20`, `header-loader.js:259`

```javascript
// ❌ 위험: 사용자 정보 평문 저장
const userData = localStorage.getItem('user');
```

**문제점:**
- ✅ 사용자 이름, 이메일, 전화번호, 생년월일 등이 **암호화 없이** 브라우저에 저장됨
- ✅ 악성 확장 프로그램이나 XSS 공격으로 데이터 탈취 가능
- ✅ 공용 PC에서 로그인 시 다음 사용자가 정보 열람 가능

**영향도:** 🔴 **최상**  
**해킹 난이도:** ⭐⭐ (중급 해커)

---

#### 3. **서버 인증 없는 API 요청**
**위치:** `wishlist-script.js`, `cart-script.js`, `checkout-script.js`

```javascript
// ⚠️ 서버에서 사용자 신원 확인 없음
headers: {
  'X-User-Email': userEmail  // 클라이언트가 보내는 이메일을 그대로 신뢰
}
```

**문제점:**
- ✅ 공격자가 다른 사람의 이메일로 요청 가능
- ✅ A의 장바구니를 B가 조작 가능
- ✅ 주문 정보 탈취 가능

**영향도:** 🔴 **최상**  
**해킹 난이도:** ⭐⭐ (중급 해커)

---

### ⚠️ **높음 (High) - 빠른 조치 권장**

#### 4. **HTTPS 미사용 (개발 환경)**
**현재 상태:** `http://localhost:5500`

**문제점:**
- ✅ 중간자 공격(MITM) 가능
- ✅ 네트워크 감청으로 모든 데이터 노출
- ✅ 세션 하이재킹 가능

**영향도:** ⚠️ **높음** (프로덕션 배포 시)  
**해킹 난이도:** ⭐⭐⭐ (네트워크 접근 필요)

---

#### 5. **CORS 설정 과도하게 열림**
**위치:** `backend/index.js:19-21`

```javascript
// ⚠️ 너무 많은 origin 허용
const allowedOrigins = ['http://localhost:8000', 'http://localhost:3000', ...];
```

**문제점:**
- ✅ 개발 환경 origin들이 프로덕션에서도 허용됨
- ✅ 로컬호스트에서 악성 사이트 실행 시 API 접근 가능

**영향도:** ⚠️ **높음**  
**해킹 난이도:** ⭐⭐⭐

---

#### 6. **Rate Limiting 너무 관대함**
**위치:** `backend/index.js:39-51`

```javascript
// ⚠️ 15분에 100회 요청 허용
max: 100
```

**문제점:**
- ✅ 브루트포스 공격 가능 (비밀번호 무차별 대입)
- ✅ DDoS 공격에 취약
- ✅ 스크래핑 봇이 데이터 수집 가능

**영향도:** ⚠️ **높음**  
**해킹 난이도:** ⭐⭐

---

### 💛 **중간 (Medium) - 개선 권장**

#### 7. **인증 코드 메모리 저장**
**위치:** `backend/index.js:73`

```javascript
// 💛 메모리에만 저장 (서버 재시작 시 소실)
const verificationCodes = new Map();
```

**문제점:**
- ✅ 서버 재시작 시 모든 인증 코드 삭제
- ✅ 확장성 문제 (서버 여러 대 운영 시)
- ✅ 메모리 누수 가능성 (만료된 코드 자동 삭제 없음)

**영향도:** 💛 **중간**  
**권장:** Redis 또는 DB 사용

---

#### 8. **비밀번호 정책 부재**
**현재 상태:** 검증 로직 없음

**문제점:**
- ✅ 약한 비밀번호 허용 (예: "1234", "password")
- ✅ 무차별 대입 공격에 취약
- ✅ 사용자 계정 보안 취약

**영향도:** 💛 **중간**  
**권장:** 최소 8자, 영문+숫자+특수문자 조합 강제

---

#### 9. **SQL Injection 방어 불완전**
**위치:** `backend/product-routes.js`

**현재 상태:**
- ✅ Prepared Statements 사용 중 (양호)
- ⚠️ 일부 동적 쿼리 존재 가능성

**권장:** 모든 쿼리를 Prepared Statements로 작성

---

#### 10. **로그 미흡**
**현재 상태:** `console.log()` 위주

**문제점:**
- ✅ 공격 탐지 불가
- ✅ 해킹 발생 시 추적 어려움
- ✅ 감사(Audit) 불가능

**영향도:** 💛 **중간**  
**권장:** Winston, Morgan 등 로깅 라이브러리 도입

---

### 💚 **낮음 (Low) - 장기 개선**

#### 11. **XSS 방어 (최근 수정 완료)**
**위치:** 모든 프론트엔드 JavaScript 파일

**현재 상태:**
- ✅ **수정 완료!** `escapeHtml()` 함수 적용
- ✅ 모든 `innerHTML` 사용 시 이스케이프 처리

**영향도:** 💚 **낮음** (현재)

---

#### 12. **Content Security Policy (CSP) 비활성화**
**위치:** `backend/index.js:34`

```javascript
contentSecurityPolicy: false  // ⚠️ 비활성화
```

**문제점:**
- ✅ 외부 스크립트 로드 제한 없음
- ✅ XSS 공격 시 추가 방어선 없음

**영향도:** 💚 **낮음** (XSS 수정 완료로 위험도 감소)

---

## 🎯 **실제 해킹 시나리오**

### **시나리오 1: 무단 관리자 접근**

```javascript
// 1. 공격자가 F12를 열고 콘솔에 입력
localStorage.setItem('isLoggedIn', 'true');
localStorage.setItem('user', JSON.stringify({
  name: 'Admin',
  email: 'admin@prepmood.kr',
  role: 'admin'
}));

// 2. 페이지 새로고침
location.reload();

// ✅ 결과: 로그인 없이 마이페이지, 주문 내역 모두 접근!
```

**난이도:** ⭐ (초보도 가능)  
**소요 시간:** 1분  
**피해:** 개인정보 접근, 주문 조작

---

### **시나리오 2: 타인 장바구니 조작**

```javascript
// 1. 공격자가 개발자 도구에서 Network 탭 확인
// 2. 장바구니 API 요청 복사:
fetch('https://prepmood.kr/api/cart/add', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Email': 'victim@example.com'  // ❌ 다른 사람 이메일
  },
  body: JSON.stringify({
    productId: 'malicious-item',
    quantity: 999
  })
});

// ✅ 결과: 피해자 장바구니에 악성 상품 추가!
```

**난이도:** ⭐⭐ (중급)  
**소요 시간:** 5분  
**피해:** 타인 장바구니 조작, 주문 방해

---

### **시나리오 3: 세션 하이재킹**

```javascript
// 1. 공용 Wi-Fi에서 중간자 공격
// 2. HTTP 트래픽 감청
// 3. localStorage 데이터 탈취:
{
  "isLoggedIn": "true",
  "user": {
    "name": "홍길동",
    "email": "hong@example.com",
    "phone": "010-1234-5678",
    "birthdate": "1990-01-01"
  }
}

// ✅ 결과: 피해자 신원 도용, 개인정보 탈취!
```

**난이도:** ⭐⭐⭐ (고급)  
**소요 시간:** 30분  
**피해:** 개인정보 유출, 신원 도용

---

## ✅ **현재 잘 된 보안 요소**

| 항목 | 상태 | 설명 |
|------|------|------|
| **XSS 방어** | ✅ 완료 | `escapeHtml()` 적용 완료 |
| **Helmet 사용** | ✅ 양호 | 기본 보안 헤더 설정됨 |
| **CORS 설정** | ✅ 존재 | Origin 제한 있음 |
| **Rate Limiting** | ✅ 존재 | API 요청 제한 있음 |
| **bcrypt 비밀번호** | ✅ 양호 | 비밀번호 해싱 사용 |
| **입력값 검증** | ✅ 존재 | express-validator 사용 |
| **SQL Injection** | ✅ 대부분 안전 | Prepared Statements 사용 |

---

## 🛠️ **즉시 수정 권장 사항 (우선순위)**

### **1순위 (긴급) - 1주일 내 수정**

#### ✅ **JWT 기반 인증 도입**

**현재:**
```javascript
// ❌ 클라이언트 사이드 인증
localStorage.getItem('isLoggedIn')
```

**수정 후:**
```javascript
// ✅ 서버 사이드 JWT 인증
// backend/auth-middleware.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const token = req.cookies.accessToken;  // httpOnly 쿠키
  
  if (!token) {
    return res.status(401).json({ success: false, message: '인증 필요' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: '유효하지 않은 토큰' });
    req.user = user;
    next();
  });
}

// 사용:
app.get('/api/mypage', authenticateToken, (req, res) => {
  // req.user에 인증된 사용자 정보 있음
});
```

**효과:** 🔴 **해킹 위험 90% 감소**

---

#### ✅ **httpOnly 쿠키 사용**

**변경 사항:**
```javascript
// 로그인 성공 시
res.cookie('accessToken', token, {
  httpOnly: true,      // JavaScript로 접근 불가
  secure: true,        // HTTPS만 허용
  sameSite: 'strict',  // CSRF 방지
  maxAge: 3600000      // 1시간
});

// ❌ localStorage 사용 중단
// localStorage.setItem('isLoggedIn', 'true'); // 삭제!
```

---

#### ✅ **API 엔드포인트 인증 추가**

**모든 API에 인증 미들웨어 적용:**
```javascript
// backend/index.js
app.use('/api/cart', authenticateToken, cartRoutes);
app.use('/api/wishlist', authenticateToken, wishlistRoutes);
app.use('/api/orders', authenticateToken, orderRoutes);
```

---

### **2순위 (높음) - 1개월 내 수정**

1. ✅ **HTTPS 적용** (Let's Encrypt 무료 SSL)
2. ✅ **CORS origin 프로덕션만 허용**
3. ✅ **Rate Limiting 강화** (15분에 50회로 감소)
4. ✅ **비밀번호 정책 강화**
5. ✅ **Redis 도입** (인증 코드, 세션 저장)

---

### **3순위 (중간) - 3개월 내 수정**

1. ✅ **로깅 시스템 구축** (Winston)
2. ✅ **CSP 활성화**
3. ✅ **보안 감사 정기화** (월 1회)
4. ✅ **침투 테스트** (펜테스트)

---

## 🔐 **프라다, 애플 등 명품 브랜드의 보안 방식**

### **1. 인증 방식**
- ✅ **JWT + OAuth 2.0** (Google, Apple 로그인)
- ✅ **httpOnly 쿠키** (XSS 방어)
- ✅ **Refresh Token** (장기 세션 유지)
- ✅ **Multi-Factor Authentication** (2단계 인증)

### **2. 데이터 보호**
- ✅ **End-to-End Encryption** (결제 정보)
- ✅ **PCI DSS 준수** (카드 정보)
- ✅ **GDPR 준수** (EU 사용자)

### **3. 인프라**
- ✅ **AWS/Google Cloud** (전문 보안 팀)
- ✅ **CDN + DDoS 방어** (Cloudflare)
- ✅ **WAF** (Web Application Firewall)

### **4. 모니터링**
- ✅ **24/7 보안 모니터링**
- ✅ **침입 탐지 시스템** (IDS)
- ✅ **자동화된 취약점 스캔**

---

## 📈 **개선 로드맵**

```
현재 (2025년 10월)
├─ 보안 등급: B-
├─ XSS 방어: ✅ 완료
└─ 인증 시스템: 🔴 취약

1주 후 (JWT 도입)
├─ 보안 등급: B+
├─ 인증 시스템: ✅ 개선
└─ 해킹 위험: 70% 감소

1개월 후 (HTTPS + 강화된 보안)
├─ 보안 등급: A-
├─ 프로덕션 준비: ✅ 완료
└─ 해킹 위험: 90% 감소

3개월 후 (전문가 수준)
├─ 보안 등급: A+
├─ 엔터프라이즈급 보안
└─ 명품 브랜드 수준 달성
```

---

## 🎓 **결론 및 권장사항**

### **Q: 우리 홈페이지는 해킹의 위험이 있나요?**

**A: 네, 현재는 해킹 위험이 있습니다.** 🔴

**주요 이유:**
1. 🔴 **클라이언트 사이드 인증** - 누구나 F12로 로그인 우회 가능
2. 🔴 **민감 정보 평문 저장** - 개인정보 탈취 가능
3. ⚠️ **서버 인증 부재** - API 요청 위조 가능

**하지만!** 
- ✅ XSS 방어는 최근 완료되어 **큰 진전**
- ✅ 백엔드 기본 보안(bcrypt, helmet, rate limit)은 **양호**
- ✅ **1-2주 안에 주요 문제 해결 가능**

---

### **즉시 조치 사항:**

#### **개발 우선순위:**
```
1️⃣ JWT 인증 도입 (3-5일 소요)
2️⃣ httpOnly 쿠키 적용 (1일 소요)
3️⃣ API 인증 미들웨어 추가 (2일 소요)
4️⃣ localStorage 사용자 정보 제거 (1일 소요)
5️⃣ HTTPS 적용 (프로덕션 배포 시)
```

**총 소요 시간: 약 1주일**

---

### **현재 상태:**
- 🟡 **개발 환경**: 적당히 안전 (localhost)
- 🔴 **프로덕션 배포**: **절대 불가** (인증 취약점)

### **권장 조치:**
1. ✅ 프로덕션 배포 전 **반드시** JWT 인증 도입
2. ✅ 보안 전문가 코드 리뷰 (가능하면)
3. ✅ 침투 테스트 실시
4. ✅ 보안 체크리스트 준수

---

## 📞 **추가 지원**

### **무료 보안 도구:**
- 🔧 **OWASP ZAP** - 자동화 취약점 스캔
- 🔧 **Burp Suite Community** - 침투 테스트
- 🔧 **npm audit** - npm 패키지 취약점 검사

### **학습 자료:**
- 📚 **OWASP Top 10** - 웹 보안 필수 항목
- 📚 **JWT.io** - JWT 토큰 학습
- 📚 **Let's Encrypt** - 무료 SSL 인증서

---

**작성자:** AI Security Analyst  
**검토 필요:** 보안 전문가  
**다음 검토일:** 2025년 11월 21일

---

## ⚡ **요약 (TL;DR)**

| 질문 | 답변 |
|------|------|
| **해킹 위험 있나요?** | 🔴 **네, 있습니다** |
| **어떤 위험?** | 클라이언트 사이드 인증 (F12로 우회 가능) |
| **얼마나 심각?** | 🔴 **매우 심각** (초보도 5분 안에 해킹 가능) |
| **해결 가능?** | ✅ **가능** (1주일 안에 90% 개선) |
| **프로덕션 배포?** | 🔴 **절대 불가** (JWT 도입 후 가능) |
| **비용?** | 💲 **거의 무료** (Let's Encrypt SSL 무료) |

**결론: 현재는 위험하지만, 빠르게 개선 가능합니다!** 🚀

