# users 테이블 마이그레이션 계획 (통합)

## 📋 개요

`users` 테이블의 다음 변경 사항을 통합하여 마이그레이션합니다:

1. **`user_id` 형식 변경**: `INT AUTO_INCREMENT` → `VARCHAR(20)` (`PM.{년도}.{랜덤6자}`)
2. **동의 관련 컬럼 추가**: 4개 컬럼 추가
3. **생년월일 제거**: `birth` 컬럼 제거
4. **전화번호 필수**: `phone` 컬럼 필수로 변경

## 📊 변경 사항 요약

### Before (현재)
```sql
users 테이블:
- user_id: INT AUTO_INCREMENT PRIMARY KEY
- email
- password_hash
- last_name (성)
- first_name (이름)
- birth: DATE (생년월일)
- phone: VARCHAR(30) NULL (선택)
- verified
- google_id
- profile_picture
- email_verified
-- ❌ 동의 관련 컬럼 없음
-- ❌ name 컬럼 없음
```

### After (변경 후)
```sql
users 테이블:
- user_id: VARCHAR(20) PRIMARY KEY (PM.{년도}.{랜덤6자})
- email
- password_hash
- name: VARCHAR(100) NOT NULL (이름 단일 필드)
- phone: VARCHAR(30) NOT NULL (필수)
- verified
- google_id
- profile_picture
- email_verified
- privacy_consent: TINYINT(1) NOT NULL DEFAULT 0 (개인정보 수집 및 이용 동의, 필수)
- marketing_consent: TINYINT(1) NOT NULL DEFAULT 0 (마케팅 정보 수신 동의, 선택, 체크 여부 기록)
- terms_consent: TINYINT(1) NOT NULL DEFAULT 0 (이용약관 동의, 필수)
- privacy_policy_consent: TINYINT(1) NOT NULL DEFAULT 0 (개인정보 처리 방침 동의, 필수)
-- ❌ birth 컬럼 제거
-- ❌ last_name, first_name 컬럼 제거
```

## 🔗 영향 받는 FK 관계

다음 테이블들의 FK가 모두 수정되어야 합니다:

1. `orders.user_id` → `users.user_id`
2. `warranties.user_id` → `warranties.owner_user_id` → `users.user_id`
3. `inquiries.user_id` → `users.user_id`
4. `token_master.owner_user_id` → `users.user_id` (레거시)
5. `transfer_logs.from_user_id` → `users.user_id`
6. `transfer_logs.to_user_id` → `users.user_id`
7. `transfer_logs.admin_user_id` → `users.user_id`
8. `scan_logs.user_id` → `users.user_id`
9. `orders_idempotency.user_id` → `users.user_id`

## 📝 마이그레이션 단계

### Step 1: 백업 및 준비

```sql
-- 1. 전체 데이터베이스 백업
mysqldump -u [user] -p [database] > backup_before_users_migration.sql

-- 2. 기존 user_id 매핑 테이블 생성 (마이그레이션용)
CREATE TABLE user_id_migration_map (
    old_user_id INT PRIMARY KEY,
    new_user_id VARCHAR(20) UNIQUE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_new_user_id (new_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Step 2: 이름 필드 통합 및 기타 컬럼 변경 (user_id 변경 전에 먼저 진행 가능)

```sql
-- 1. name 컬럼 추가
ALTER TABLE users
  ADD COLUMN name VARCHAR(100) NULL COMMENT '이름 (단일 필드)';

-- 2. 기존 데이터 마이그레이션 (last_name + first_name → name)
UPDATE users 
SET name = CONCAT(TRIM(COALESCE(last_name, '')), ' ', TRIM(COALESCE(first_name, '')))
WHERE name IS NULL;

-- 3. name 컬럼 필수로 변경
ALTER TABLE users
  MODIFY COLUMN name VARCHAR(100) NOT NULL COMMENT '이름 (단일 필드)';

-- 4. last_name, first_name 컬럼 제거
ALTER TABLE users
  DROP COLUMN last_name,
  DROP COLUMN first_name;

-- 5. 동의 관련 컬럼 추가
ALTER TABLE users
  ADD COLUMN privacy_consent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '개인정보 수집 및 이용 동의 (필수)',
  ADD COLUMN marketing_consent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '마케팅 정보 수신 동의 (선택, 체크 여부 기록)',
  ADD COLUMN terms_consent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '이용약관 동의 (필수)',
  ADD COLUMN privacy_policy_consent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '개인정보 처리 방침 동의 (필수)';

-- 6. 생년월일 컬럼 제거
ALTER TABLE users DROP COLUMN birth;

-- 7. 전화번호 필수로 변경
-- 기존 NULL 값이 있으면 먼저 처리 필요
UPDATE users SET phone = '' WHERE phone IS NULL;
ALTER TABLE users
  MODIFY COLUMN phone VARCHAR(30) NOT NULL COMMENT '전화번호 (필수)';
```

### Step 3: user_id 생성 함수 구현

**JavaScript (Node.js)** - `backend/utils/user-id-generator.js`에 이미 구현됨:
```javascript
const { generateUniqueUserId } = require('./utils/user-id-generator');

// 사용 예시
const newUserId = await generateUniqueUserId(connection);
```

### Step 4: 기존 데이터 마이그레이션

```javascript
/**
 * 기존 user_id를 새 형식으로 마이그레이션
 */
async function migrateUserIds(connection) {
  await connection.beginTransaction();
  
  try {
    // 1. 기존 users 데이터 조회
    const [users] = await connection.execute(
      'SELECT user_id, email, created_at FROM users ORDER BY user_id'
    );
    
    console.log(`총 ${users.length}명의 사용자 마이그레이션 시작...`);
    
    // 2. 각 사용자에 대해 새 user_id 생성 및 매핑 테이블 저장
    const { generateUniqueUserId } = require('./utils/user-id-generator');
    
    for (const user of users) {
      const newUserId = await generateUniqueUserId(connection);
      
      await connection.execute(
        'INSERT INTO user_id_migration_map (old_user_id, new_user_id) VALUES (?, ?)',
        [user.user_id, newUserId]
      );
      
      console.log(`  ${user.user_id} → ${newUserId} (${user.email})`);
    }
    
    // 3. 모든 FK 테이블 업데이트 (임시 컬럼 사용)
    // 3-1. orders 테이블
    await connection.execute(`
      ALTER TABLE orders 
      ADD COLUMN user_id_new VARCHAR(20) NULL
    `);
    
    await connection.execute(`
      UPDATE orders o
      INNER JOIN user_id_migration_map m ON o.user_id = m.old_user_id
      SET o.user_id_new = m.new_user_id
    `);
    
    // 3-2. warranties 테이블
    await connection.execute(`
      ALTER TABLE warranties 
      ADD COLUMN user_id_new VARCHAR(20) NULL
    `);
    
    await connection.execute(`
      UPDATE warranties w
      INNER JOIN user_id_migration_map m ON w.user_id = m.old_user_id
      SET w.user_id_new = m.new_user_id
    `);
    
    // 3-3. inquiries 테이블
    await connection.execute(`
      ALTER TABLE inquiries 
      ADD COLUMN user_id_new VARCHAR(20) NULL
    `);
    
    await connection.execute(`
      UPDATE inquiries i
      INNER JOIN user_id_migration_map m ON i.user_id = m.old_user_id
      SET i.user_id_new = m.new_user_id
    `);
    
    // 3-4. token_master 테이블
    await connection.execute(`
      ALTER TABLE token_master 
      ADD COLUMN owner_user_id_new VARCHAR(20) NULL
    `);
    
    await connection.execute(`
      UPDATE token_master tm
      INNER JOIN user_id_migration_map m ON tm.owner_user_id = m.old_user_id
      SET tm.owner_user_id_new = m.new_user_id
    `);
    
    // 3-5. transfer_logs 테이블
    await connection.execute(`
      ALTER TABLE transfer_logs 
      ADD COLUMN from_user_id_new VARCHAR(20) NULL,
      ADD COLUMN to_user_id_new VARCHAR(20) NULL,
      ADD COLUMN admin_user_id_new VARCHAR(20) NULL
    `);
    
    await connection.execute(`
      UPDATE transfer_logs tl
      INNER JOIN user_id_migration_map m1 ON tl.from_user_id = m1.old_user_id
      SET tl.from_user_id_new = m1.new_user_id
    `);
    
    await connection.execute(`
      UPDATE transfer_logs tl
      INNER JOIN user_id_migration_map m2 ON tl.to_user_id = m2.old_user_id
      SET tl.to_user_id_new = m2.new_user_id
    `);
    
    await connection.execute(`
      UPDATE transfer_logs tl
      INNER JOIN user_id_migration_map m3 ON tl.admin_user_id = m3.old_user_id
      SET tl.admin_user_id_new = m3.new_user_id
    `);
    
    // 3-6. scan_logs 테이블
    await connection.execute(`
      ALTER TABLE scan_logs 
      ADD COLUMN user_id_new VARCHAR(20) NULL
    `);
    
    await connection.execute(`
      UPDATE scan_logs sl
      INNER JOIN user_id_migration_map m ON sl.user_id = m.old_user_id
      SET sl.user_id_new = m.new_user_id
    `);
    
    // 3-7. orders_idempotency 테이블
    await connection.execute(`
      ALTER TABLE orders_idempotency 
      ADD COLUMN user_id_new VARCHAR(20) NULL
    `);
    
    await connection.execute(`
      UPDATE orders_idempotency oi
      INNER JOIN user_id_migration_map m ON oi.user_id = m.old_user_id
      SET oi.user_id_new = m.new_user_id
    `);
    
    await connection.commit();
    console.log('✅ 마이그레이션 완료');
    
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
```

### Step 5: FK 제약 삭제 및 재생성

```sql
-- 1. 모든 FK 제약 삭제
ALTER TABLE orders DROP FOREIGN KEY fk_orders_user_id;
ALTER TABLE warranties DROP FOREIGN KEY fk_warranties_user_id;
ALTER TABLE inquiries DROP FOREIGN KEY fk_inquiries_user_id;
ALTER TABLE token_master DROP FOREIGN KEY fk_token_master_owner_user_id;
ALTER TABLE transfer_logs DROP FOREIGN KEY fk_transfer_logs_from_user_id;
ALTER TABLE transfer_logs DROP FOREIGN KEY fk_transfer_logs_to_user_id;
ALTER TABLE transfer_logs DROP FOREIGN KEY fk_transfer_logs_admin_user_id;
ALTER TABLE scan_logs DROP FOREIGN KEY fk_scan_logs_user_id;
ALTER TABLE orders_idempotency DROP FOREIGN KEY fk_orders_idempotency_user_id;

-- 2. users 테이블 user_id 타입 변경
ALTER TABLE users 
  MODIFY COLUMN user_id VARCHAR(20) NOT NULL;

-- 3. 기존 데이터 업데이트 (매핑 테이블 사용)
UPDATE users u
INNER JOIN user_id_migration_map m ON u.user_id = m.old_user_id
SET u.user_id = m.new_user_id;

-- 4. 모든 FK 테이블 user_id 타입 변경 및 데이터 업데이트
-- 4-1. orders 테이블
ALTER TABLE orders 
  MODIFY COLUMN user_id VARCHAR(20) NULL;

UPDATE orders o
INNER JOIN user_id_migration_map m ON o.user_id = m.old_user_id
SET o.user_id = o.user_id_new;

ALTER TABLE orders DROP COLUMN user_id_new;

-- 4-2. warranties 테이블
ALTER TABLE warranties 
  MODIFY COLUMN user_id VARCHAR(20) NOT NULL;

UPDATE warranties w
INNER JOIN user_id_migration_map m ON w.user_id = m.old_user_id
SET w.user_id = w.user_id_new;

ALTER TABLE warranties DROP COLUMN user_id_new;

-- 4-3. inquiries 테이블
ALTER TABLE inquiries 
  MODIFY COLUMN user_id VARCHAR(20) NULL;

UPDATE inquiries i
INNER JOIN user_id_migration_map m ON i.user_id = m.old_user_id
SET i.user_id = i.user_id_new;

ALTER TABLE inquiries DROP COLUMN user_id_new;

-- 4-4. token_master 테이블
ALTER TABLE token_master 
  MODIFY COLUMN owner_user_id VARCHAR(20) NULL;

UPDATE token_master tm
INNER JOIN user_id_migration_map m ON tm.owner_user_id = m.old_user_id
SET tm.owner_user_id = tm.owner_user_id_new;

ALTER TABLE token_master DROP COLUMN owner_user_id_new;

-- 4-5. transfer_logs 테이블
ALTER TABLE transfer_logs 
  MODIFY COLUMN from_user_id VARCHAR(20) NULL,
  MODIFY COLUMN to_user_id VARCHAR(20) NOT NULL,
  MODIFY COLUMN admin_user_id VARCHAR(20) NOT NULL;

UPDATE transfer_logs tl
INNER JOIN user_id_migration_map m ON tl.from_user_id = m.old_user_id
SET tl.from_user_id = tl.from_user_id_new;

UPDATE transfer_logs tl
INNER JOIN user_id_migration_map m ON tl.to_user_id = m.old_user_id
SET tl.to_user_id = tl.to_user_id_new;

UPDATE transfer_logs tl
INNER JOIN user_id_migration_map m ON tl.admin_user_id = m.old_user_id
SET tl.admin_user_id = tl.admin_user_id_new;

ALTER TABLE transfer_logs 
  DROP COLUMN from_user_id_new,
  DROP COLUMN to_user_id_new,
  DROP COLUMN admin_user_id_new;

-- 4-6. scan_logs 테이블
ALTER TABLE scan_logs 
  MODIFY COLUMN user_id VARCHAR(20) NULL;

UPDATE scan_logs sl
INNER JOIN user_id_migration_map m ON sl.user_id = m.old_user_id
SET sl.user_id = sl.user_id_new;

ALTER TABLE scan_logs DROP COLUMN user_id_new;

-- 4-7. orders_idempotency 테이블
ALTER TABLE orders_idempotency 
  MODIFY COLUMN user_id VARCHAR(20) NULL;

UPDATE orders_idempotency oi
INNER JOIN user_id_migration_map m ON oi.user_id = m.old_user_id
SET oi.user_id = oi.user_id_new;

ALTER TABLE orders_idempotency DROP COLUMN user_id_new;

-- 5. 새 FK 제약 추가
ALTER TABLE orders 
  ADD CONSTRAINT fk_orders_user_id 
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE warranties 
  ADD CONSTRAINT fk_warranties_user_id 
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT;

ALTER TABLE inquiries 
  ADD CONSTRAINT fk_inquiries_user_id 
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE token_master 
  ADD CONSTRAINT fk_token_master_owner_user_id 
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE transfer_logs 
  ADD CONSTRAINT fk_transfer_logs_from_user_id 
  FOREIGN KEY (from_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_transfer_logs_to_user_id 
  FOREIGN KEY (to_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_transfer_logs_admin_user_id 
  FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE RESTRICT;

ALTER TABLE scan_logs 
  ADD CONSTRAINT fk_scan_logs_user_id 
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE orders_idempotency 
  ADD CONSTRAINT fk_orders_idempotency_user_id 
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;
```

### Step 6: 검증 및 정리

```sql
-- 1. 데이터 무결성 검증
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as mapped_users FROM user_id_migration_map;
-- total_users == mapped_users 여야 함

-- 2. FK 관계 검증
SELECT COUNT(*) as orphaned_orders 
FROM orders o 
LEFT JOIN users u ON o.user_id = u.user_id 
WHERE o.user_id IS NOT NULL AND u.user_id IS NULL;
-- orphaned_orders == 0 이어야 함

-- 3. 동의 관련 컬럼 확인
DESCRIBE users;
-- privacy_consent, marketing_consent, terms_consent, privacy_policy_consent 확인

-- 4. 이름 필드 통합 확인
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN 'name 컬럼 존재함'
    ELSE 'name 컬럼 없음'
  END AS name_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'name';

SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN 'last_name, first_name 컬럼 존재함 (제거 필요)'
    ELSE 'last_name, first_name 컬럼 없음 (이미 제거됨)'
  END AS old_name_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN ('last_name', 'first_name');
-- old_name_status == '없음' 이어야 함

-- 5. 생년월일 컬럼 제거 확인
SELECT COUNT(*) as birth_column_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'birth';
-- birth_column_exists == 0 이어야 함

-- 6. 전화번호 필수 확인
SELECT 
  COLUMN_NAME,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'phone';
-- IS_NULLABLE == 'NO' 이어야 함

-- 6. 마이그레이션 매핑 테이블 보관 (필요 시)
-- 백업 후 삭제 또는 보관
```

## ⚠️ 주의사항

1. **운영 중단 필요**: 이 마이그레이션은 운영 중단이 필요할 수 있습니다.
2. **롤백 계획**: 마이그레이션 실패 시 롤백 계획 수립 필수
3. **테스트 환경에서 먼저 실행**: 운영 환경 적용 전 테스트 환경에서 충분히 테스트
4. **백업 필수**: 마이그레이션 전 전체 데이터베이스 백업 필수
5. **전화번호 NULL 값 처리**: 기존 NULL 값이 있으면 먼저 처리 필요

## 📊 예상 소요 시간

- **준비 및 테스트**: 1-2일
- **동의 컬럼 추가**: 0.5일
- **user_id 마이그레이션 실행**: 2-3시간 (데이터 양에 따라 다름)
- **검증 및 정리**: 0.5-1일

**총 예상 소요 시간**: 3-5일

---

## 📝 회원가입 API 변경 사항 (마이그레이션 후)

### 변경 후 회원가입 API

```javascript
// backend/index.js - /api/register 엔드포인트 수정

app.post('/api/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('confirmPassword').equals(body('password')).withMessage('비밀번호가 일치하지 않습니다.'),
    body('name').notEmpty().trim(),
    body('phone').notEmpty().trim(),
    body('privacy_consent').equals('true').withMessage('개인정보 수집 및 이용 동의가 필요합니다.'),
    body('terms_consent').equals('true').withMessage('이용약관 동의가 필요합니다.'),
    body('privacy_policy_consent').equals('true').withMessage('개인정보 처리 방침 동의가 필요합니다.'),
    body('marketing_consent').optional().isBoolean()
], async (req, res) => {
    try {
        const { email, password, confirmPassword, name, phone, 
                privacy_consent, marketing_consent, terms_consent, privacy_policy_consent } = req.body;

        // 1. 이메일 중복 확인
        const [existingUsers] = await connection.execute(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            // 이미 가입된 이메일 → 로그인 페이지로 이동 안내
            return res.status(409).json({
                success: false,
                code: 'EMAIL_ALREADY_EXISTS',
                message: '이미 가입된 이메일입니다.',
                redirectTo: '/login.html'
            });
        }

        // 2. 이메일 인증 확인 (기존 로직)
        const verificationData = verificationCodes.get(email);
        if (!verificationData || !verificationData.verified) {
            return res.status(400).json({
                success: false,
                message: '이메일 인증을 먼저 완료해주세요.'
            });
        }

        // 3. user_id 생성 (마이그레이션 후)
        const { generateUniqueUserId } = require('./utils/user-id-generator');
        const newUserId = await generateUniqueUserId(connection);

        // 4. 비밀번호 해시화
        const hashedPassword = await bcrypt.hash(password, 10);

        // 5. 사용자 정보 저장 (이름은 단일 필드로 저장)
        await connection.execute(
            `INSERT INTO users (
                user_id, email, password_hash, name, 
                phone, verified, email_verified,
                privacy_consent, marketing_consent, terms_consent, privacy_policy_consent
            ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
            [
                newUserId,
                email,
                hashedPassword,
                name,  // 단일 필드로 저장
                phone,
                privacy_consent === 'true' ? 1 : 0,
                marketing_consent === 'true' ? 1 : 0,  // 선택이지만 체크 여부 기록
                terms_consent === 'true' ? 1 : 0,
                privacy_policy_consent === 'true' ? 1 : 0
            ]
        );

        // 7. 인증 코드 삭제
        verificationCodes.delete(email);

        res.json({
            success: true,
            message: '회원가입이 완료되었습니다.',
            user_id: newUserId
        });

    } catch (error) {
        console.error('❌ 회원가입 오류:', error.message);
        res.status(500).json({
            success: false,
            message: '회원가입 중 오류가 발생했습니다.'
        });
    }
});
```

---

**이 마이그레이션은 매우 중요한 변경이므로, 신중하게 계획하고 실행해야 합니다.**

