# QR 인증 시스템 종합 보안 검토

## ✅ 현재 잘 구현된 보안 항목

### 1. 환경 변수 관리
- ✅ `.env` 파일 사용
- ✅ `AUTH_BASE_URL` 환경 변수로 관리
- ✅ 민감 정보 하드코딩 없음

### 2. SQL Injection 방지
- ✅ `better-sqlite3`의 prepared statement 사용
- ✅ 모든 쿼리에서 파라미터화된 쿼리 사용

### 3. Rate Limiting
- ✅ 인증 엔드포인트: 15분당 50회 제한
- ✅ 일반 API: 15분당 500회 제한

### 4. 입력 검증
- ✅ 토큰 형식 검증 (20자 영숫자)
- ✅ 잘못된 입력 차단

### 5. 보안 헤더
- ✅ Helmet 미들웨어 사용

### 6. 관리자 인증
- ✅ QR 코드 다운로드 시 `authenticateToken`, `requireAdmin` 미들웨어 적용

### 7. 민감 정보 로깅
- ✅ 토큰 일부만 로깅 (처음 4자)

---

## ⚠️ 추가 보안 개선 필요 사항

### 1. **DB 파일 권한 설정** 🔴 중요

**현재 상태:**
- DB 파일(`prep.db`)의 파일 시스템 권한이 코드에서 관리되지 않음
- 기본 시스템 권한에 의존

**위험성:**
- 서버가 해킹되면 DB 파일에 접근 가능
- 인증 기록 유출 가능

**개선 방안:**
```javascript
// auth-db.js에서 DB 생성 시 권한 설정
const fs = require('fs');

function initDatabase() {
    // ... DB 생성 코드 ...
    
    // 파일 권한 설정 (소유자만 읽기/쓰기)
    if (fs.existsSync(DB_PATH)) {
        fs.chmodSync(DB_PATH, 0o600); // rw------- (소유자만 읽기/쓰기)
    }
}
```

**VPS에서 수동 설정 (즉시 적용):**
```bash
chmod 600 /var/www/html/backend/prep.db
chown www-data:www-data /var/www/html/backend/prep.db
```

---

### 2. **QR 코드 출력 폴더 권한** 🟡 중요

**현재 상태:**
- `output_qrcodes/` 폴더 권한이 코드에서 관리되지 않음

**개선 방안:**
```javascript
// generate-qr-codes.js에서 폴더 생성 시 권한 설정
fs.mkdirSync(OUTPUT_DIR, { 
    recursive: true,
    mode: 0o755 // rwxr-xr-x (소유자: 읽기/쓰기/실행, 그룹/기타: 읽기/실행)
});

// 파일 생성 후 권한 설정
fs.chmodSync(filepath, 0o644); // rw-r--r-- (소유자: 읽기/쓰기, 그룹/기타: 읽기)
```

**VPS에서 수동 설정 (즉시 적용):**
```bash
chmod 755 /var/www/html/output_qrcodes
find /var/www/html/output_qrcodes -type f -exec chmod 644 {} \;
chown -R www-data:www-data /var/www/html/output_qrcodes
```

---

### 3. **.env 파일 보호** 🔴 중요

**현재 상태:**
- `.env` 파일이 Git에 커밋되지 않았는지 확인 필요

**확인 방법:**
```bash
# .gitignore에 .env가 있는지 확인
cat .gitignore | grep -E "^\.env$|^\.env\."

# Git에서 .env 파일 추적 여부 확인
git ls-files | grep "\.env"
```

**VPS에서 .env 파일 권한 확인:**
```bash
# .env 파일 권한 확인 (소유자만 읽기/쓰기여야 함)
ls -la /var/www/html/backend/.env
# 예상: -rw------- 1 www-data www-data

# 권한 설정 (필요시)
chmod 600 /var/www/html/backend/.env
chown www-data:www-data /var/www/html/backend/.env
```

---

### 4. **DB 백업 및 암호화** 🟡 중요

**현재 상태:**
- DB 백업 메커니즘 없음
- 백업 파일 암호화 없음

**위험성:**
- 데이터 손실 시 복구 불가능
- 백업 파일 유출 시 전체 토큰 노출

**개선 방안:**
```bash
# 백업 스크립트 (예시)
#!/bin/bash
BACKUP_DIR="/var/backups/prepmood-auth"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
cp /var/www/html/backend/prep.db "$BACKUP_DIR/prep_${DATE}.db"
# 30일 이상 된 백업 삭제
find $BACKUP_DIR -name "prep_*.db" -mtime +30 -delete
```

**cron 등록:**
```bash
# 매일 새벽 2시 백업
0 2 * * * /usr/local/bin/backup-auth-db.sh
```

---

### 5. **토큰 유출 대응 방안** 🟡 중요

**현재 상태:**
- 토큰 유출 시 무효화 메커니즘 없음

**시나리오:**
- QR 코드 이미지가 유출되었을 때
- 특정 제품의 토큰이 노출되었을 때

**개선 방안 (선택사항):**
```javascript
// auth-db.js에 토큰 무효화 함수 추가
function revokeToken(token) {
    const stmt = db.prepare(`
        UPDATE products 
        SET status = 3, -- 3 = 무효화됨
            last_verified_at = ?
        WHERE token = ?
    `);
    stmt.run(new Date().toISOString(), token);
}

// 관리자 API로 토큰 무효화 기능 제공
router.post('/api/admin/auth/revoke', authenticateToken, requireAdmin, (req, res) => {
    const { token } = req.body;
    revokeToken(token);
    res.json({ success: true, message: '토큰이 무효화되었습니다.' });
});
```

---

### 6. **모니터링 및 알림** 🟢 선택사항

**현재 상태:**
- 비정상적인 인증 시도 감지 없음
- 알림 시스템 없음

**개선 방안:**
```javascript
// auth-routes.js에서 비정상 패턴 감지
let failedAttempts = new Map();

router.get('/a/:token', authLimiter, async (req, res) => {
    const token = req.params.token;
    const product = getProductByToken(token);
    
    if (!product) {
        // 가품 시도 횟수 추적
        const ip = req.ip;
        const attempts = failedAttempts.get(ip) || 0;
        failedAttempts.set(ip, attempts + 1);
        
        // 특정 IP에서 가품 시도가 너무 많으면 경고
        if (attempts > 10) {
            Logger.warn(`[SECURITY] ${ip}에서 비정상적인 가품 시도 다수 감지: ${attempts}회`);
            // 관리자에게 이메일/알림 발송 (선택사항)
        }
    }
    // ...
});
```

---

### 7. **로그 파일 보안** 🟡 중요

**현재 상태:**
- 로그 파일 권한 확인 필요
- 로그 로테이션 설정 확인 필요

**VPS에서 확인:**
```bash
# PM2 로그 파일 권한 확인
ls -la ~/.pm2/logs/

# 로그 파일 권한 설정 (필요시)
chmod 640 ~/.pm2/logs/*.log
chown $USER:$USER ~/.pm2/logs/*.log
```

**로그 로테이션 설정 (PM2 모듈):**
```bash
# PM2 로그 로테이션 모듈 설치
pm2 install pm2-logrotate

# 설정
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

### 8. **CORS 설정 확인** ✅ 현재 양호

**현재 상태:**
- ✅ `ALLOWED_ORIGINS` 환경 변수로 관리
- ✅ 특정 도메인만 허용

**확인 사항:**
```bash
# .env 파일에서 ALLOWED_ORIGINS 확인
grep ALLOWED_ORIGINS /var/www/html/backend/.env
```

---

### 9. **SQLite DB 파일 암호화 (선택사항)** 🟢 고급

**현재 상태:**
- DB 파일이 평문으로 저장됨

**위험성:**
- 서버 파일 시스템 접근 시 전체 토큰 유출

**개선 방안:**
- `better-sqlite3`는 암호화를 기본 지원하지 않음
- SQLCipher 사용 고려 (하지만 복잡도 증가)
- **현재는 파일 시스템 권한으로 충분** (운영 환경에서 권장)

---

### 10. **정기적인 보안 감사** 🟢 권장

**체크리스트:**
- [ ] 정기적으로 의존성 취약점 확인: `npm audit`
- [ ] 로그 파일 정기 검토
- [ ] 비정상적인 인증 시도 패턴 확인
- [ ] DB 백업 파일 검증
- [ ] 파일 권한 정기 점검

---

## 🚨 즉시 조치 필요 (High Priority)

### 1. 파일 권한 설정
```bash
# VPS에서 실행
cd /var/www/html/backend

# DB 파일 권한
chmod 600 prep.db
chown www-data:www-data prep.db

# .env 파일 권한
chmod 600 .env
chown www-data:www-data .env

# QR 코드 폴더 권한
cd ..
chmod 755 output_qrcodes
find output_qrcodes -type f -exec chmod 644 {} \;
chown -R www-data:www-data output_qrcodes
```

### 2. .env 파일 Git 추적 확인
```bash
# 로컬에서 실행
git ls-files | grep "\.env"
# 결과가 없어야 함 (.env가 Git에 커밋되지 않아야 함)
```

### 3. 로그 파일 권한 확인
```bash
# VPS에서 실행
ls -la ~/.pm2/logs/
# 소유자만 읽기/쓰기 권한이 있는지 확인
```

---

## 📋 보안 체크리스트 (최종)

### 기본 보안 (✅ 완료)
- [x] SQL Injection 방지
- [x] Rate Limiting
- [x] 입력 검증
- [x] 환경 변수 사용
- [x] 관리자 인증
- [x] 보안 헤더 (Helmet)

### 파일 시스템 보안 (⚠️ 확인 필요)
- [ ] DB 파일 권한 (600)
- [ ] .env 파일 권한 (600)
- [ ] QR 코드 폴더 권한 (755)
- [ ] 로그 파일 권한 (640)

### 데이터 보호 (🟡 권장)
- [ ] DB 백업 메커니즘
- [ ] 백업 파일 암호화
- [ ] 토큰 무효화 기능

### 모니터링 (🟢 선택사항)
- [ ] 비정상 패턴 감지
- [ ] 알림 시스템
- [ ] 로그 로테이션

---

## 🎯 결론

**현재 상태:**
- 기본적인 보안은 잘 구현되어 있음
- 파일 시스템 권한 설정이 추가로 필요함

**우선순위:**
1. **즉시**: 파일 권한 설정 (DB, .env, QR 폴더)
2. **단기**: DB 백업 스크립트
3. **중기**: 토큰 무효화 기능
4. **장기**: 모니터링 및 알림 시스템

**전체 평가:**
현재 시스템은 **운영 환경에서 사용 가능한 수준**입니다. 위의 파일 권한 설정만 추가하면 **프로덕션 레벨의 보안**을 확보할 수 있습니다.

