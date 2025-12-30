# 최종 실행 지시서 (다운타임 단일화)

## 🎯 목표

**토큰 수천 개 운영 가능한 시스템 구축**

- 토큰 → 소유주(user_id/계정) 100% 추적
- 스캔 국가(IP 기반 국가코드) 저장
- 관리자 양도/삭제/차단 가능

---

## 📋 [PHASE 0] 서버 중지 & 백업

```bash
# VPS에서 실행
cd /var/www/html/backend

# 1. 서버 중지
pm2 stop prepmood-backend

# 2. SQLite 백업
cp prep.db prep.db.bak

# 3. MySQL 백업
mysqldump -u prepmood_user -p --no-tablespaces prepmood warranties users > /root/prepmood_backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## 📋 [PHASE 1] MySQL 스키마 생성

### 1.1 token_master 테이블 (SSOT)

**파일**: `backend/migrations/005_create_token_master_table.sql` (이미 수정됨)

**스키마**:
```sql
CREATE TABLE IF NOT EXISTS token_master (
    token VARCHAR(20) PRIMARY KEY,
    internal_code VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    is_blocked TINYINT(1) DEFAULT 0,
    owner_user_id INT NULL,
    owner_warranty_public_id CHAR(36) NULL,
    scan_count INT DEFAULT 0,
    first_scanned_at DATETIME NULL,
    last_scanned_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_internal_code (internal_code),
    INDEX idx_is_blocked (is_blocked),
    INDEX idx_owner_user_id (owner_user_id),
    INDEX idx_first_scanned_at (first_scanned_at),
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (owner_warranty_public_id) REFERENCES warranties(public_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.2 transfer_logs 테이블

**파일**: `backend/migrations/006_create_transfer_logs_table.sql` (이미 생성됨)

### 1.3 warranties soft delete

**파일**: `backend/migrations/007_add_soft_delete_to_warranties.sql` (이미 생성됨)

### 1.4 scan_logs 테이블 (국가 정보 포함)

**파일**: `backend/migrations/004_create_scan_logs_table.sql` (수정 필요)

**수정 내용**: `country_code`, `country_name` 컬럼 추가

```sql
CREATE TABLE IF NOT EXISTS scan_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(20) NOT NULL,
    user_id INT NULL,
    warranty_public_id CHAR(36) NULL,
    ip_address VARCHAR(45) NULL,
    country_code VARCHAR(2) NULL,  -- ✅ 추가: ISO 3166-1 alpha-2 (KR, US 등)
    country_name VARCHAR(100) NULL,  -- ✅ 추가: 국가명
    user_agent TEXT NULL,
    event_type VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_token (token),
    INDEX idx_user_id (user_id),
    INDEX idx_warranty_public_id (warranty_public_id),
    INDEX idx_created_at (created_at),
    INDEX idx_country_code (country_code),  -- ✅ 추가: 국가별 조회
    INDEX idx_event_type (event_type),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (warranty_public_id) REFERENCES warranties(public_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**실행 순서**:
```bash
cd /var/www/html/backend
node run-migration.js migrations/005_create_token_master_table.sql
node run-migration.js migrations/006_create_transfer_logs_table.sql
node run-migration.js migrations/007_add_soft_delete_to_warranties.sql
node run-migration.js migrations/004_create_scan_logs_table.sql
```

---

## 📋 [PHASE 2] SQLite → MySQL 이관

### 2.1 SQLite products 컬럼명 확인 (⚠️ 필수)

**중요**: 이관 전에 반드시 실제 컬럼명 확인 필요

```bash
cd /var/www/html/backend

# 방법 1: 스키마 확인
sqlite3 prep.db ".schema products"

# 방법 2: 컬럼 정보 확인
sqlite3 prep.db "PRAGMA table_info(products);"
```

**확인 사항**:
- `internal_code` 컬럼명이 정확한지 (예: `code`, `internal_code` 등)
- `product_name` 컬럼명이 정확한지 (예: `name`, `product_name` 등)
- `first_verified_at`, `last_verified_at` 컬럼명 확인

**이관 스크립트 수정**:
- 확인된 실제 컬럼명과 1:1로 매칭하여 수정

### 2.2 이관 스크립트 수정

**파일**: `backend/migrate-sqlite-to-mysql.js`

**수정 사항**:
1. 필드명 변환: `first_verified_at` → `first_scanned_at`
2. 필드명 변환: `last_verified_at` → `last_scanned_at`
3. `status_code` → `is_blocked` 변환 로직

**변환 로직**:
```javascript
// status → is_blocked
let isBlocked = 0;  // 기본값: 정상
if (product.status === 3) {
    isBlocked = 1;  // 무효화된 토큰은 차단
}
// status === 0, 1은 모두 is_blocked = 0 (정상)

// 필드명 변환
const firstScannedAt = product.first_verified_at 
    ? product.first_verified_at.replace('T', ' ').substring(0, 19)
    : null;
const lastScannedAt = product.last_verified_at
    ? product.last_verified_at.replace('T', ' ').substring(0, 19)
    : null;
```

### 2.3 이관 실행

```bash
cd /var/www/html/backend
node migrate-sqlite-to-mysql.js
```

**검증**:
```bash
mysql -u prepmood_user -p -D prepmood -e "
SELECT COUNT(*) as total FROM token_master;
SELECT COUNT(*) as with_owner FROM token_master WHERE owner_user_id IS NOT NULL;
"
```

---

## 📋 [PHASE 3] 코드 전환 (SQLite 의존 제거)

### 3.1 GeoIP 라이브러리 설치

```bash
cd /var/www/html/backend
npm install geoip-lite
```

### 3.2 getClientIp 유틸 생성 (⚠️ Cloudflare IP 추출)

**파일**: `backend/utils/get-client-ip.js` (이미 생성됨)

**사용법**:
```javascript
const { getClientIp } = require('./utils/get-client-ip');

// scan_logs INSERT 시
const clientIp = getClientIp(req);
```

**우선순위**:
1. `CF-Connecting-IP` (Cloudflare)
2. `X-Forwarded-For` (첫 번째 IP)
3. `X-Real-IP` (Nginx)
4. `req.ip` (fallback)

### 3.3 auth-routes.js 수정

**목표**: SQLite `getProductByToken()` 제거, MySQL `token_master` 기준으로 전환

**주요 변경**:

#### A) `/a/:token` GET 라우트

```javascript
// 기존: const product = getProductByToken(token);
// 변경: MySQL token_master 조회

const [tokenMasterRows] = await connection.execute(
    'SELECT * FROM token_master WHERE token = ?',
    [token]
);

if (tokenMasterRows.length === 0) {
    // 토큰 없음 → 가품 경고
    return res.status(400).render('fake', {
        title: '가품 경고 - Pre.p Mood'
    });
}

const tokenMaster = tokenMasterRows[0];

// 차단 체크
if (tokenMaster.is_blocked === 1) {
    return res.status(400).render('fake', {
        title: '차단된 인증서 - Pre.p Mood'
    });
}

// 스캔 카운트 업데이트
const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
const isFirstScan = !tokenMaster.first_scanned_at;

await connection.execute(
    `UPDATE token_master 
     SET scan_count = scan_count + 1,
         first_scanned_at = COALESCE(first_scanned_at, ?),
         last_scanned_at = ?,
         updated_at = ?
     WHERE token = ?`,
    [now, now, now, token]
);

// scan_logs INSERT (GeoIP 포함)
const { getClientIp } = require('../utils/get-client-ip');
const geoip = require('geoip-lite');

const clientIp = getClientIp(req);  // ✅ Cloudflare IP 우선 추출
const geo = geoip.lookup(clientIp);
const countryCode = geo ? geo.country : null;
const countryName = geo ? geo.country : null;

await connection.execute(
    `INSERT INTO scan_logs 
     (token, user_id, warranty_public_id, ip_address, country_code, country_name, user_agent, event_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
        token,
        req.user.userId,  // ✅ 로그인 필수이므로 항상 존재
        tokenMaster.owner_warranty_public_id || null,
        clientIp,  // ✅ getClientIp() 사용
        countryCode,
        countryName,
        req.headers['user-agent'] || null,
        isFirstScan ? 'verify_success_first' : 'verify_success_repeat',
        now
    ]
);
```

#### B) 보증서 발급 시 token_master 업데이트

```javascript
// warranties INSERT 후
await connection.execute(
    `UPDATE token_master 
     SET owner_user_id = ?,
         owner_warranty_public_id = ?,
         updated_at = ?
     WHERE token = ?`,
    [userId, publicId, now, token]
);
```

### 3.3 auth-db.js 수정 (선택)

**옵션 A**: SQLite 함수 유지 (읽기 전용)
- `getProductByToken()` 유지 (제품 정보 참조용)
- `updateFirstVerification()`, `updateReVerification()` 제거 또는 비활성화

**옵션 B**: 완전 제거
- 모든 SQLite 의존성 제거
- `token_master` 조회 함수로 대체

**권장**: 옵션 A (단계적 전환)

---

## 📋 [PHASE 4] 관리자 CLI 구현

### 4.1 admin-cli.js 생성

**파일**: `backend/admin-cli.js`

**의존성**: `commander` 패키지 (CLI 파싱)

```bash
npm install commander
```

### 4.2 CLI 명령어 스펙

#### A) `token:lookup <token>`

**기능**: 토큰 상세 정보 조회

**추가**: `token:search --email <email>` - 특정 고객의 토큰 목록 조회

**출력 포맷**:
```
╔════════════════════════════════════════════════════════════╗
║ 토큰 정보                                                  ║
╠════════════════════════════════════════════════════════════╣
║ 토큰: Z41xu1AxY2tP0sjL7prV                                 ║
║ 제품코드: ACC26FabricTieBKSkinny00001                      ║
║ 제품명: 솔리드 수트 스키니 타이                            ║
║ 상태: 정상 (차단: 아니오)                                   ║
║ 스캔 횟수: 19회                                             ║
║ 최초 스캔: 2025-12-30 10:00:00                              ║
║ 마지막 스캔: 2025-12-30 15:00:00                            ║
╠════════════════════════════════════════════════════════════╣
║ 소유주 정보                                                ║
╠════════════════════════════════════════════════════════════╣
║ 사용자 ID: 2                                                ║
║ 이메일: user@example.com                                    ║
║ 이름: 홍길동                                                ║
╠════════════════════════════════════════════════════════════╣
║ 보증서 정보                                                ║
╠════════════════════════════════════════════════════════════╣
║ 보증서 번호: 7c5a246e-33b7-4930-ab31-2cc8022b43c2         ║
║ 발급일: 2025-12-30 10:00:00                                 ║
╠════════════════════════════════════════════════════════════╣
║ 최근 스캔 이력 (최대 5개)                                   ║
╠════════════════════════════════════════════════════════════╣
║ 2025-12-30 15:00:00 | KR (대한민국) | 211.206.69.110       ║
║ 2025-12-30 14:30:00 | KR (대한민국) | 211.206.69.110       ║
╚════════════════════════════════════════════════════════════╝
```

**구현**:
```javascript
async function lookupToken(token) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        // token_master + owner + warranty 조회
        const [rows] = await connection.execute(`
            SELECT 
                tm.*,
                u.user_id, u.email, u.first_name, u.last_name,
                w.public_id, w.created_at as warranty_created_at
            FROM token_master tm
            LEFT JOIN users u ON tm.owner_user_id = u.user_id
            LEFT JOIN warranties w ON tm.owner_warranty_public_id = w.public_id
            WHERE tm.token = ?
        `, [token]);
        
        if (rows.length === 0) {
            console.log('❌ 토큰을 찾을 수 없습니다.');
            return;
        }
        
        const data = rows[0];
        
        // 최근 스캔 이력
        const [scans] = await connection.execute(`
            SELECT created_at, country_code, country_name, ip_address
            FROM scan_logs
            WHERE token = ?
            ORDER BY created_at DESC
            LIMIT 5
        `, [token]);
        
        // 표 출력 (위 포맷)
        // ...
    } finally {
        await connection.end();
    }
}
```

#### B) `token:block <token> <0|1> [reason]`

**기능**: 토큰 차단/해제

**출력**:
```
✅ 토큰 Z41xu1AxY2tP0sjL7prV 차단 상태 변경: 차단됨
사유: 분실 신고
```

**구현**:
```javascript
async function blockToken(token, isBlocked, reason) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        await connection.execute(
            'UPDATE token_master SET is_blocked = ?, updated_at = NOW() WHERE token = ?',
            [isBlocked, token]
        );
        
        console.log(`✅ 토큰 ${token.substring(0, 4)}... 차단 상태 변경: ${isBlocked ? '차단됨' : '정상'}`);
        if (reason) console.log(`사유: ${reason}`);
    } finally {
        await connection.end();
    }
}
```

#### C) `warranty:transfer <public_id> --to-email <email> [--reason "..."]`

**기능**: 보증서 양도

**출력**:
```
✅ 보증서 양도 완료
보증서: 7c5a246e-33b7-4930-ab31-2cc8022b43c2
이전 소유주: user@example.com (ID: 2)
새 소유주: newowner@example.com (ID: 5)
사유: 고객 문의: 양도 요청
```

**구현**:
```javascript
async function transferWarranty(publicId, toEmail, reason) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        await connection.beginTransaction();
        
        // 1. 새 소유주 조회
        const [users] = await connection.execute(
            'SELECT user_id FROM users WHERE email = ?',
            [toEmail]
        );
        
        if (users.length === 0) {
            throw new Error(`이메일을 찾을 수 없습니다: ${toEmail}`);
        }
        
        const toUserId = users[0].user_id;
        
        // 2. 기존 보증서 조회
        const [warranties] = await connection.execute(
            'SELECT token, user_id FROM warranties WHERE public_id = ?',
            [publicId]
        );
        
        if (warranties.length === 0) {
            throw new Error(`보증서를 찾을 수 없습니다: ${publicId}`);
        }
        
        const warranty = warranties[0];
        const fromUserId = warranty.user_id;
        const token = warranty.token;
        
        // 3. warranties 업데이트
        await connection.execute(
            'UPDATE warranties SET user_id = ? WHERE public_id = ?',
            [toUserId, publicId]
        );
        
        // 4. token_master 업데이트
        await connection.execute(
            'UPDATE token_master SET owner_user_id = ?, updated_at = NOW() WHERE token = ?',
            [toUserId, token]
        );
        
        // 5. transfer_logs 기록
        await connection.execute(
            `INSERT INTO transfer_logs 
             (warranty_public_id, token, from_user_id, to_user_id, admin_user_id, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [publicId, token, fromUserId, toUserId, process.env.ADMIN_USER_ID || 1, reason]
        );
        
        await connection.commit();
        
        // 출력
        const [fromUser] = await connection.execute('SELECT email FROM users WHERE user_id = ?', [fromUserId]);
        console.log(`✅ 보증서 양도 완료`);
        console.log(`보증서: ${publicId}`);
        console.log(`이전 소유주: ${fromUser[0].email} (ID: ${fromUserId})`);
        console.log(`새 소유주: ${toEmail} (ID: ${toUserId})`);
        if (reason) console.log(`사유: ${reason}`);
        
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        await connection.end();
    }
}
```

#### D) `warranty:delete <public_id> [--reason "..."] [--block-token]`

**기능**: 보증서 삭제 (soft delete)

**정책**: 삭제 정책 A안 (소유주 유지)
- `warranties.deleted_at`만 설정
- `token_master.owner_user_id`는 유지 (운영 추적 목적)

**출력**:
```
✅ 보증서 삭제 완료
보증서: 7c5a246e-33b7-4930-ab31-2cc8022b43c2
사유: 고객 요청
토큰 차단: 예
```

**구현**:
```javascript
async function deleteWarranty(publicId, reason, blockToken) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        await connection.beginTransaction();
        
        // 1. 보증서 조회
        const [warranties] = await connection.execute(
            'SELECT token FROM warranties WHERE public_id = ?',
            [publicId]
        );
        
        if (warranties.length === 0) {
            throw new Error(`보증서를 찾을 수 없습니다: ${publicId}`);
        }
        
        const token = warranties[0].token;
        
        // 2. warranties soft delete
        await connection.execute(
            'UPDATE warranties SET deleted_at = NOW(), deleted_by = ?, delete_reason = ? WHERE public_id = ?',
            [process.env.ADMIN_USER_ID || 1, reason, publicId]
        );
        
        // 3. 토큰 차단 (선택)
        if (blockToken) {
            await connection.execute(
                'UPDATE token_master SET is_blocked = 1, updated_at = NOW() WHERE token = ?',
                [token]
            );
        }
        
        await connection.commit();
        
        console.log(`✅ 보증서 삭제 완료`);
        console.log(`보증서: ${publicId}`);
        if (reason) console.log(`사유: ${reason}`);
        console.log(`토큰 차단: ${blockToken ? '예' : '아니오'}`);
        
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        await connection.end();
    }
}
```

### 4.3 CLI 인터페이스 구조

```javascript
#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();

program
    .name('admin-cli')
    .description('토큰/보증서 관리 CLI')
    .version('1.0.0');

// token:lookup
program
    .command('token:lookup <token>')
    .description('토큰 상세 정보 조회')
    .action(async (token) => {
        await lookupToken(token);
    });

// token:block
program
    .command('token:block <token> <0|1>')
    .description('토큰 차단/해제')
    .option('-r, --reason <reason>', '차단 사유')
    .action(async (token, isBlocked, options) => {
        await blockToken(token, parseInt(isBlocked), options.reason);
    });

// warranty:transfer
program
    .command('warranty:transfer <public_id>')
    .description('보증서 양도')
    .requiredOption('--to-email <email>', '새 소유주 이메일')
    .option('--reason <reason>', '양도 사유')
    .action(async (publicId, options) => {
        await transferWarranty(publicId, options.toEmail, options.reason);
    });

// warranty:delete
program
    .command('warranty:delete <public_id>')
    .description('보증서 삭제 (soft delete)')
    .option('--reason <reason>', '삭제 사유')
    .option('--block-token', '토큰도 차단')
    .action(async (publicId, options) => {
        await deleteWarranty(publicId, options.reason, options.blockToken);
    });

program.parse();
```

**실행 예시**:
```bash
node admin-cli.js token:lookup Z41xu1AxY2tP0sjL7prV
node admin-cli.js token:block Z41xu1AxY2tP0sjL7prV 1 --reason "분실 신고"
node admin-cli.js warranty:transfer 7c5a246e-33b7-4930-ab31-2cc8022b43c2 --to-email newowner@example.com --reason "고객 문의"
node admin-cli.js warranty:delete 7c5a246e-33b7-4930-ab31-2cc8022b43c2 --reason "고객 요청" --block-token
```

---

## 📋 [PHASE 5] 서버 재시작 & 테스트

### 5.1 서버 재시작

```bash
pm2 start prepmood-backend
pm2 logs prepmood-backend --lines 50
```

### 5.2 테스트 시나리오

#### A) 신규 토큰 스캔 테스트

**중요**: 스캔 = 로그인 필수이므로 비로그인 테스트 불가

1. 로그인 후 QR 코드 스캔
2. 확인:
   - `token_master.scan_count` 증가
   - `token_master.first_scanned_at` 설정
   - `scan_logs`에 기록 (user_id, country_code 포함)

#### B) 보증서 발급 테스트

1. 로그인 후 QR 코드 스캔
2. 확인:
   - `warranties` INSERT
   - `token_master.owner_user_id` 설정
   - `token_master.owner_warranty_public_id` 설정

#### C) 관리자 CLI 테스트

```bash
# 토큰 조회
node admin-cli.js token:lookup Z41xu1AxY2tP0sjL7prV

# 토큰 차단
node admin-cli.js token:block Z41xu1AxY2tP0sjL7prV 1 --reason "테스트"

# 보증서 양도
node admin-cli.js warranty:transfer <public_id> --to-email test@example.com

# 보증서 삭제
node admin-cli.js warranty:delete <public_id> --reason "테스트"
```

---

## ✅ 최종 체크리스트

### 다운타임 전
- [ ] 백업 완료 (SQLite, MySQL)
- [ ] GeoIP 라이브러리 설치 (`npm install geoip-lite`)
- [ ] 마이그레이션 파일 최종 확인
- [ ] **SQLite products 컬럼명 확인** (`.schema products`, `PRAGMA table_info`)
- [ ] 이관 스크립트 필드명 수정 확인
- [ ] `getClientIp` 유틸 생성 확인

### 다운타임 중
- [ ] 서버 중지
- [ ] 마이그레이션 실행 (4개 파일)
- [ ] SQLite → MySQL 이관
- [ ] 코드 수정 (auth-routes.js, auth-db.js)
  - [ ] SQLite `getProductByToken()` 제거
  - [ ] `token_master` 조회로 전환
  - [ ] `getClientIp()` 사용
  - [ ] `scan_logs` INSERT (GeoIP 포함)
- [ ] CLI 도구 구현 (admin-cli.js)
  - [ ] `token:lookup`
  - [ ] `token:block`
  - [ ] `token:search --email` (추가)
  - [ ] `warranty:transfer`
  - [ ] `warranty:delete`
  - [ ] `warranty:lookup` (추가)

### 다운타임 후
- [ ] 서버 재시작
- [ ] E2E 테스트
- [ ] 검증 완료

---

## 🎯 예상 소요 시간

- **마이그레이션**: 30분
- **코드 수정**: 2-3시간
- **CLI 구현**: 2-3시간
- **테스트**: 1시간
- **총계**: **5.5-7.5시간** (다운타임 포함)

---

## ⚠️ 주의사항

1. **SQLite 백업 필수**: 이관 실패 시 복구용
2. **MySQL 백업 필수**: 기존 warranties 데이터 보호
3. **GeoIP 라이브러리**: `geoip-lite`는 무료, `maxmind`는 더 정확하지만 유료
4. **과거 데이터**: Z41 같은 케이스는 소유주 복구 불가 (원래 기록 없음)
5. **SQLite products 컬럼명**: 반드시 서버에서 확인 후 이관 스크립트 수정
6. **Cloudflare IP**: `getClientIp()` 사용 필수 (CF-Connecting-IP 우선)
7. **QR 생성 시 token_master 선등록**: 향후 QR 생성 프로세스에 MySQL INSERT 추가 필요

## 🔒 불변 규칙 5개

1. **QR 생성 시점에 token_master에 무조건 INSERT**
   - "나중에 생기는 토큰" 금지
   - `init-auth-db.js` 수정 또는 별도 스크립트 필요

2. **/a/:token은 token_master만 본다**
   - SQLite 참조 금지
   - `getProductByToken()` 제거

3. **스캔 = 로그인**
   - user_id 없는 scan_logs는 존재하지 않음
   - `req.user.userId`는 항상 존재

4. **소유주는 token_master가 기준**
   - warranties는 화면/문서용
   - `token_master.owner_user_id`가 진실의 원천

5. **삭제는 soft delete**
   - 운영 추적은 남긴다
   - `warranties.deleted_at`만 설정, `token_master.owner_user_id` 유지

