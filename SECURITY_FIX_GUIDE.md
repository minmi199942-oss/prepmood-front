# 🔧 보안 취약점 수정 가이드

## ⚠️ 발견된 취약점

### 1. IDOR (Insecure Direct Object Reference) 취약점
### 2. 위시리스트 API 인증 취약점
### 3. JWT Secret 약함

---

## 🛠️ 즉시 적용 가능한 수정 사항

### 1. JWT Secret 강화 (즉시 적용 권장)

#### **현재 상태**:
```env
JWT_SECRET=prepmood-jwt-secret-key-2025-change-in-production
```

#### **수정 방법**:

**로컬에서 강력한 시크릿 생성**:
```bash
# PowerShell에서 실행
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**VPS에서 .env 업데이트**:
```bash
ssh root@prepmood.kr

# 백업 생성
cp /var/www/html/backend/.env /var/www/html/backend/.env.backup

# 새 시크릿 생성
cd /var/www/html/backend
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 출력된 시크릿을 복사하고 .env 파일 수정
nano .env
# JWT_SECRET=<새로운_64자_이상의_랜덤_시크릿>

# 백엔드 재시작
pm2 restart index
pm2 logs index --lines 20
```

**⚠️ 주의사항**:
- JWT Secret을 변경하면 **기존 로그인 세션이 모두 무효화**됩니다
- 사용자들이 다시 로그인해야 합니다
- 점검 시간에 수행하는 것이 좋습니다

---

### 2. IDOR 취약점 수정 (선택적)

현재 **실제로 사용되는 API**는 `IDOR 위험이 낮음`:
- `/api/update-profile-simple`: 이메일 기반 (OK)
- `/api/login`: 비밀번호 검증 (OK)

하지만 **사용되지 않는 구형 API**에 취약점 존재:
- `/api/update-profile`: userId를 클라이언트에서 받음 (위험)
- `/api/update-email`: userId를 클라이언트에서 받음 (위험)
- `/api/update-password`: userId를 클라이언트에서 받음 (위험)

#### **옵션 1: API 제거 (권장)**

프론트엔드에서 사용하지 않으므로 삭제:

```javascript
// backend/index.js에서 해당 라우트들을 주석 처리하거나 삭제
/*
app.post('/api/update-profile', [...])
app.post('/api/update-email', [...])  
app.post('/api/update-password', [...])
*/
```

#### **옵션 2: JWT 검증 추가 (복잡함)**

JWT 미들웨어를 추가하여 인증:

```javascript
// JWT 검증 미들웨어
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: '인증 토큰이 필요합니다.'
        });
    }

    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId; // 토큰에서 추출한 userId
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: '유효하지 않은 토큰입니다.'
        });
    }
};

// API에 적용
app.post('/api/update-profile', verifyToken, [
    body('name').notEmpty().trim(),
    // ❌ body('userId').isInt() 제거
    ...
], async (req, res) => {
    // ✅ JWT에서 추출한 userId 사용
    const userId = req.userId; // 클라이언트가 아닌 토큰에서 가져옴
    
    // ... 나머지 로직
});
```

---

### 3. 위시리스트 API 개선 (중장기 계획)

#### **현재 문제**:
```javascript
const userEmail = req.headers['x-user-email']; // 클라이언트가 임의로 설정 가능
```

#### **근본적인 해결책**:

**1단계: wishlists 테이블 스키마 변경**
```sql
-- VPS MySQL에서 실행
ALTER TABLE wishlists ADD COLUMN user_id INT AFTER id;
ALTER TABLE wishlists ADD FOREIGN KEY (user_id) REFERENCES users(user_id);
CREATE INDEX idx_wishlists_user_id ON wishlists(user_id);

-- user_email을 user_id로 마이그레이션
UPDATE wishlists w
INNER JOIN users u ON w.user_email = u.email
SET w.user_id = u.user_id;

-- user_email 컬럼은 일단 유지 (호환성)
-- 추후 제거: ALTER TABLE wishlists DROP COLUMN user_email;
```

**2단계: 백엔드 API 수정**
```javascript
// JWT 토큰에서 userId 추출
const token = req.headers.authorization?.replace('Bearer ', '');
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const userId = decoded.userId;

// user_id 기반으로 쿼리
const [existing] = await connection.execute(
    'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?',
    [userId, productId]
);
```

**3단계: 프론트엔드 수정**
```javascript
// buy-script.js, wishlist-script.js 등
const response = await fetch(`${API_BASE_URL}/wishlist/toggle`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}` // JWT 토큰 전송
    },
    body: JSON.stringify({ productId: currentProduct.id })
});
```

---

## 📊 우선순위 및 영향도

| 수정 사항 | 우선순위 | 난이도 | 영향도 | 권장 시기 |
|-----------|----------|--------|--------|-----------|
| JWT Secret 강화 | 🔴 High | ⭐ Easy | 모든 사용자 재로그인 | 즉시 |
| 구형 API 제거 | 🟡 Medium | ⭐ Easy | 없음 (사용 안 함) | 1주일 내 |
| 위시리스트 JWT 인증 | 🟠 High | ⭐⭐⭐ Hard | 프론트+백엔드+DB 수정 | 1개월 내 |

---

## 🧪 수정 후 테스트

### JWT Secret 변경 후:
```bash
# 1. 기존 사용자 로그아웃 확인
# 2. 새로 로그인 시도
# 3. 로그인 성공 및 JWT 발급 확인
# 4. API 호출 정상 작동 확인
```

### API 제거 후:
```bash
# 1. 삭제된 API 호출 시 404 또는 401 반환 확인
# 2. 프론트엔드에서 해당 API를 사용하지 않는지 확인 (grep)
```

### 위시리스트 API 수정 후:
```bash
# 1. 자신의 위시리스트 추가/제거 정상 작동
# 2. 다른 사용자의 이메일로 조작 시도 → 실패 확인
# 3. 유효하지 않은 토큰 사용 시 401 반환 확인
```

---

## 📝 수정 스크립트

### VPS에서 한 번에 실행 (JWT Secret 변경)

```bash
#!/bin/bash
# jwt-secret-update.sh

cd /var/www/html/backend

# 백업
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 새 시크릿 생성
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# .env 업데이트
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env

echo "✅ JWT Secret updated"
echo "New Secret: $NEW_SECRET"

# 백엔드 재시작
pm2 restart index
pm2 logs index --lines 20
```

**실행**:
```bash
ssh root@prepmood.kr
cd /var/www/html/backend
chmod +x jwt-secret-update.sh
./jwt-secret-update.sh
```

---

## 🔒 추가 보안 권장사항

### 1. HTTPS 강제 적용
```javascript
// backend/index.js
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            res.redirect(`https://${req.header('host')}${req.url}`);
        } else {
            next();
        }
    });
}
```

### 2. Secure Cookie 설정
```javascript
res.cookie('token', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7일
});
```

### 3. 비밀번호 정책 강화
```javascript
body('password')
    .isLength({ min: 10 }) // 8자 → 10자
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('비밀번호는 대문자, 소문자, 숫자, 특수문자를 포함해야 합니다.')
```

### 4. 계정 잠금 기능 (Brute Force 방지)
이미 구현되어 있음:
```javascript
// backend/index.js:72-74
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15분
```

---

## 📚 관련 문서

- `SECURITY_AUDIT_REPORT.md`: 전체 보안 감사 보고서
- `backend/.env.example`: 환경 변수 예시
- `backend/google-auth-routes.js`: JWT 검증 예시 코드

---

## ⚠️ 중요 알림

**JWT Secret을 변경하면 모든 사용자가 로그아웃됩니다.**  
유지보수 시간에 수행하거나 사용자에게 사전 공지하세요.

```
공지 예시:
"[공지] 2025년 10월 12일 오전 2시 ~ 2시 10분, 보안 강화를 위한 시스템 업데이트가 진행됩니다. 
작업 후 자동 로그아웃되오니 다시 로그인해 주시기 바랍니다."
```



