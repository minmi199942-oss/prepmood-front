# 🔒 보안 감사 보고서 (Security Audit Report)

**일시**: 2025년 10월 11일  
**대상**: Pre.pMood 웹사이트 전체 시스템  
**범위**: 백엔드 API, 프론트엔드, 데이터베이스 쿼리

---

## 📋 요약 (Executive Summary)

### ✅ 수정된 심각한 취약점
- **개인정보 유출 버그** (Critical): 하드코딩된 개인정보가 모든 사용자에게 노출되는 문제 → **수정 완료**

### ⚠️ 발견된 추가 보안 이슈
1. **위시리스트 API 인증 취약점** (High)
2. **IDOR 취약점** (Medium)
3. **JWT Secret 노출 위험** (Medium)

---

## 🔍 상세 분석

### 1. ✅ 수정 완료: 개인정보 유출 버그 (CRITICAL)

#### **문제**:
```javascript
// ❌ my-profile.js (이전)
document.getElementById('user-phone').textContent = user.phone || '+82 01029965390';
document.getElementById('user-birthdate').textContent = '2002. 06. 03.';
```

#### **영향**:
- 모든 신규 사용자가 관리자의 개인정보(전화번호, 생년월일)를 보게 됨
- 개인정보 보호법 위반 가능성
- GDPR 위반 가능성

#### **수정**:
```javascript
// ✅ my-profile.js (수정 후)
document.getElementById('user-phone').textContent = user.phone || '정보 없음';
document.getElementById('user-birthdate').textContent = user.birthdate ? formatDate(user.birthdate) : '정보 없음';
```

**백엔드 수정**:
- 로그인 API에서 `phone`, `birth` 필드 반환 추가
- Google 로그인 API에서도 동일 필드 반환 추가

---

### 2. ⚠️ 위시리스트 API 인증 취약점 (HIGH)

#### **문제**:
```javascript
// backend/index.js:787
const userEmail = req.headers['x-user-email']; // 임시로 헤더에서 이메일 가져오기
```

#### **취약점**:
- 클라이언트가 임의의 이메일을 헤더에 설정 가능
- 다른 사용자의 위시리스트를 조작할 수 있음 (IDOR)

#### **공격 시나리오**:
```javascript
// 공격자가 다른 사용자의 위시리스트를 조작
fetch('https://prepmood.kr/api/wishlist/toggle', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-User-Email': 'victim@example.com' // 피해자 이메일
    },
    body: JSON.stringify({ productId: 'm-bp-003' })
});
```

#### **권장 수정**:
```javascript
// JWT 토큰 기반 인증으로 변경
const token = req.headers.authorization?.replace('Bearer ', '');
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const userId = decoded.userId; // 토큰에서 사용자 ID 추출

// user_id 기반으로 위시리스트 조작
await connection.execute(
    'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?',
    [userId, productId]
);
```

---

### 3. ⚠️ IDOR 취약점 (Medium)

#### **문제**:
```javascript
// backend/index.js:695-748
app.post('/api/update-profile', [
    body('userId').isInt(), // ❌ 클라이언트가 userId 전송
    ...
]);
```

#### **취약점**:
- 클라이언트가 임의의 `userId`를 전송하여 다른 사용자의 정보 수정 가능
- JWT 토큰과 userId의 일치 여부를 검증하지 않음

#### **공격 시나리오**:
```javascript
// 공격자가 다른 사용자의 정보를 수정
fetch('https://prepmood.kr/api/update-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        userId: 123, // 다른 사용자의 ID
        name: 'Hacked Name',
        birthdate: '1990-01-01'
    })
});
```

#### **권장 수정**:
```javascript
// JWT 토큰에서 userId를 추출하여 사용
const token = req.headers.authorization?.replace('Bearer ', '');
const decoded = jwt.verify(token, process.env.JWT_SECRET);

// 토큰의 userId만 사용 (클라이언트에서 받은 userId 무시)
await connection.execute(
    'UPDATE users SET last_name = ?, first_name = ?, birth = ? WHERE user_id = ?',
    [lastName, firstName, birthdate, decoded.userId] // 토큰의 userId 사용
);
```

---

### 4. ⚠️ JWT Secret 보안 (Medium)

#### **현재 상태**:
```env
# .env 파일에 하드코딩
JWT_SECRET=prepmood-jwt-secret-key-2025-change-in-production
```

#### **문제**:
- 추측 가능한 단순 시크릿
- 길이 부족 (최소 64자 권장)

#### **권장**:
```bash
# 강력한 랜덤 시크릿 생성
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 예시 결과:
# 3f7a9c2e1b8d6f4a0c5e9d7b3a1f8c6e4b2d0f9a7c5e3b1d8f6a4c2e0b9d7f5a3
```

---

### 5. ✅ 잘 구현된 보안 기능

#### **Rate Limiting**:
```javascript
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10, // 15분당 최대 10회 요청
});
```

#### **Input Validation**:
```javascript
body('email').isEmail().normalizeEmail(),
body('password').isLength({ min: 8 }),
body('name').notEmpty().trim()
```

#### **SQL Injection 방지**:
```javascript
// ✅ Prepared Statements 사용
await connection.execute(
    'SELECT * FROM users WHERE email = ?',
    [email] // 파라미터 바인딩
);
```

#### **XSS 방지**:
```javascript
// google-auth-routes.js:186-189
const sanitize = (str) => str.replace(/<[^>]*>/g, '').trim();
const sanitizedLastName = sanitize(lastName);
```

#### **CORS 설정**:
```javascript
app.use(cors({
    origin: allowedOrigins, // 특정 도메인만 허용
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
```

#### **Helmet.js (보안 헤더)**:
```javascript
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
```

#### **비밀번호 해싱**:
```javascript
const hashedPassword = await bcrypt.hash(password, 10); // bcrypt 사용
```

---

## 📊 위험도 평가

| 취약점 | 위험도 | 상태 | 우선순위 |
|--------|--------|------|----------|
| 개인정보 유출 (하드코딩) | 🔴 Critical | ✅ 수정 완료 | - |
| 위시리스트 IDOR | 🟠 High | ⚠️ 미수정 | 1 |
| 프로필 업데이트 IDOR | 🟡 Medium | ⚠️ 미수정 | 2 |
| JWT Secret 약함 | 🟡 Medium | ⚠️ 미수정 | 3 |

---

## 🛠️ 권장 조치사항

### 즉시 조치 필요 (High Priority)

#### 1. 위시리스트 API 인증 개선
```javascript
// 현재: X-User-Email 헤더 사용 (취약)
const userEmail = req.headers['x-user-email'];

// 개선: JWT 토큰 기반 인증
const token = req.headers.authorization?.replace('Bearer ', '');
const decoded = jwt.verify(token, process.env.JWT_SECRET);

// user_id 기반으로 변경 (wishlists 테이블 수정 필요)
// ALTER TABLE wishlists ADD COLUMN user_id INT;
// ALTER TABLE wishlists ADD FOREIGN KEY (user_id) REFERENCES users(user_id);
```

#### 2. IDOR 취약점 수정
```javascript
// /api/update-profile, /api/update-email, /api/update-password
// 모든 사용자 정보 수정 API에서:

// ❌ 제거: body('userId').isInt()
// ✅ 추가: JWT에서 userId 추출
const token = req.headers.authorization?.replace('Bearer ', '');
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const authenticatedUserId = decoded.userId;
```

### 단기 조치 (Medium Priority)

#### 3. JWT Secret 강화
```bash
# VPS에서 실행
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" >> .env.backup
# 생성된 시크릿을 .env에 업데이트
```

#### 4. 로깅 및 모니터링 강화
```javascript
// 의심스러운 활동 로깅
if (req.body.userId && decoded.userId !== req.body.userId) {
    console.warn(`⚠️ IDOR 시도 감지: Token userId=${decoded.userId}, Body userId=${req.body.userId}, IP=${req.ip}`);
}
```

---

## 🧪 테스트 체크리스트

### 보안 테스트

- [ ] **IDOR 테스트**: 다른 사용자의 정보 수정 시도
- [ ] **XSS 테스트**: `<script>alert(1)</script>` 입력
- [ ] **SQL Injection 테스트**: `' OR '1'='1` 입력
- [ ] **Rate Limiting 테스트**: 15분에 10회 이상 요청
- [ ] **CORS 테스트**: 허용되지 않은 도메인에서 요청
- [ ] **JWT 검증 테스트**: 만료된 토큰, 잘못된 토큰

---

## 📚 참고 자료

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

## 📝 변경 이력

| 날짜 | 내용 | 담당자 |
|------|------|--------|
| 2025-10-11 | 초기 보안 감사 실시 | AI Assistant |
| 2025-10-11 | 개인정보 유출 버그 수정 | AI Assistant |

---

## ⚖️ 면책 조항

본 보고서는 코드 검토를 기반으로 작성되었으며, 실제 침투 테스트는 수행되지 않았습니다. 프로덕션 환경에서는 전문 보안 감사를 권장합니다.



