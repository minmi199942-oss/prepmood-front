# 🔒 보안 설정 가이드

## MySQL 보안 설정

### 1. 사용자 권한 제한
```sql
-- 로컬호스트에서만 접근 가능한 사용자 생성
CREATE USER 'prepmood_user'@'localhost' IDENTIFIED BY 'strong_password_here';
GRANT SELECT, INSERT, UPDATE, DELETE ON prepmood.* TO 'prepmood_user'@'localhost';
FLUSH PRIVILEGES;

-- root 사용자 외부 접근 차단 확인
SELECT User, Host FROM mysql.user WHERE User = 'root';
```

### 2. 방화벽 설정
```bash
# MySQL 포트(3306) 외부 접근 차단
sudo ufw deny 3306
sudo ufw allow from 127.0.0.1 to any port 3306
```

### 3. MySQL 설정 파일 보안
```ini
# /etc/mysql/mysql.conf.d/mysqld.cnf
[mysqld]
bind-address = 127.0.0.1  # 로컬호스트만 허용
skip-networking = false   # 네트워크 연결 허용하되 bind-address로 제한
```

## 환경변수 보안

### 1. .env 파일 권한 설정
```bash
chmod 600 .env  # 소유자만 읽기/쓰기 가능
```

### 2. 운영 환경에서는 시스템 환경변수 사용
```bash
# 서버 환경변수로 설정 (더 안전)
export DB_PASSWORD="your_secure_password"
export EMAIL_PASS="your_app_password"
```

## 로그 보안

### 1. 로그 로테이션 설정
```bash
# PM2 로그 로테이션
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 2. 민감정보 필터링
- 비밀번호, 토큰, 개인정보는 로그에 기록 금지
- 에러 스택트레이스는 개발환경에서만 출력

## 추가 보안 조치

### 1. HTTPS 사용
```javascript
// 운영환경에서는 HTTPS 강제
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

### 2. Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100 // 최대 100회 요청
});

app.use('/api/', limiter);
```

### 3. 입력값 검증
```javascript
const validator = require('validator');

// 이메일 검증 강화
if (!validator.isEmail(email)) {
    return res.status(400).json({ 
        success: false, 
        message: '올바른 이메일 형식이 아닙니다.' 
    });
}
```

## 정기 보안 점검

1. **월 1회**: 의존성 취약점 검사 (`npm audit`)
2. **월 1회**: 로그 파일 정리 및 분석
3. **분기 1회**: 비밀번호 변경
4. **분기 1회**: 접근 권한 재검토

