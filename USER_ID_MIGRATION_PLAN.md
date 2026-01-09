# users.user_id 형식 변경 마이그레이션 계획

## 📋 개요

`users.user_id`를 `INT AUTO_INCREMENT`에서 `VARCHAR(20)` 형식 (`PM.{년도}.{랜덤6자}`)으로 변경하는 마이그레이션 계획입니다.

## ⚠️ 중요성

이 변경은 **모든 FK 관계에 영향을 미치므로**, 다른 모든 작업보다 먼저 완료해야 합니다.

## 📊 변경 사항

### Before (현재)
```sql
users.user_id: INT AUTO_INCREMENT PRIMARY KEY
-- 예: 1, 2, 3, 4, ...
```

### After (변경 후)
```sql
users.user_id: VARCHAR(20) PRIMARY KEY
-- 형식: PM.{년도}.{랜덤6자}
-- 예: PM.2025.ABC123, PM.2025.XYZ789, ...
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

## 📝 users 테이블 추가 변경 사항 (회원가입 페이지 구조 반영)

### 동의 관련 컬럼 추가 (4개)

회원가입 페이지 구조에 따라 다음 컬럼들이 추가로 필요합니다:

1. **`privacy_consent`** - 개인정보 수집 및 이용 동의 (필수)
   - 타입: `TINYINT(1) NOT NULL DEFAULT 0`
   - 기본값: `0` (FALSE)

2. **`marketing_consent`** - 마케팅 정보 수신 동의 (선택, 체크 여부 기록 필수)
   - 타입: `TINYINT(1) NOT NULL DEFAULT 0`
   - 기본값: `0` (FALSE)
   - ⚠️ **선택이지만 체크 여부 기록 필수**

3. **`terms_consent`** - 이용약관 동의 (필수)
   - 타입: `TINYINT(1) NOT NULL DEFAULT 0`
   - 기본값: `0` (FALSE)

4. **`privacy_policy_consent`** - 개인정보 처리 방침 동의 (필수)
   - 타입: `TINYINT(1) NOT NULL DEFAULT 0`
   - 기본값: `0` (FALSE)

### 기타 변경 사항

1. **`birth` 컬럼 제거 또는 NULL 허용**
   - 생년월일 필드가 제거되므로 `birth` 컬럼도 제거 또는 NULL 허용

2. **`phone` 컬럼 필수로 변경**
   - 전화번호가 필수이므로 `phone` 컬럼을 `NOT NULL`로 변경 (또는 기본값 설정)

3. **이름 필드 처리**
   - 옵션 B 권장: `last_name`, `first_name` 유지, 백엔드에서 `name`을 분리 저장

## 📝 마이그레이션 단계

### Step 1: 백업 및 준비
```sql
-- 1. 전체 데이터베이스 백업
mysqldump -u [user] -p [database] > backup_before_user_id_migration.sql

-- 2. 기존 user_id 매핑 테이블 생성 (마이그레이션용)
CREATE TABLE user_id_migration_map (
    old_user_id INT PRIMARY KEY,
    new_user_id VARCHAR(20) UNIQUE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_new_user_id (new_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Step 2: 새 user_id 생성 함수 구현

**JavaScript (Node.js)**:
```javascript
/**
 * 새 user_id 생성 함수
 * 형식: PM.{년도}.{랜덤6자}
 * @returns {string} 새 user_id (예: PM.2025.ABC123)
 */
function generateNewUserId() {
  const year = new Date().getFullYear();
  const randomChars = generateRandomString(6); // 대문자 영문 + 숫자
  return `PM.${year}.${randomChars}`;
}

/**
 * 랜덤 문자열 생성 (대문자 영문 + 숫자)
 * @param {number} length - 길이
 * @returns {string} 랜덤 문자열
 */
function generateRandomString(length) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * user_id 중복 체크
 * @param {string} userId - 체크할 user_id
 * @param {Connection} connection - DB 연결
 * @returns {Promise<boolean>} 중복 여부
 */
async function checkUserIdExists(userId, connection) {
  const [rows] = await connection.execute(
    'SELECT COUNT(*) as count FROM users WHERE user_id = ?',
    [userId]
  );
  return rows[0].count > 0;
}

/**
 * 고유한 user_id 생성 (중복 체크 포함)
 * @param {Connection} connection - DB 연결
 * @param {number} maxRetries - 최대 재시도 횟수
 * @returns {Promise<string>} 새 user_id
 */
async function generateUniqueUserId(connection, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const newUserId = generateNewUserId();
    const exists = await checkUserIdExists(newUserId, connection);
    if (!exists) {
      return newUserId;
    }
  }
  throw new Error('고유한 user_id 생성 실패 (최대 재시도 횟수 초과)');
}
```

### Step 3: 기존 데이터 마이그레이션

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
    
    // ... (나머지 테이블도 동일한 방식으로)
    
    await connection.commit();
    console.log('✅ 마이그레이션 완료');
    
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
```

### Step 3-5: 동의 관련 컬럼 추가 (user_id 마이그레이션과 별도로 진행 가능)

```sql
-- 동의 관련 컬럼 추가
ALTER TABLE users
  ADD COLUMN privacy_consent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '개인정보 수집 및 이용 동의 (필수)',
  ADD COLUMN marketing_consent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '마케팅 정보 수신 동의 (선택, 체크 여부 기록)',
  ADD COLUMN terms_consent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '이용약관 동의 (필수)',
  ADD COLUMN privacy_policy_consent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '개인정보 처리 방침 동의 (필수)';

-- 생년월일 컬럼 제거 (또는 NULL 허용)
-- 옵션 A: 완전 제거
ALTER TABLE users DROP COLUMN birth;

-- 옵션 B: NULL 허용 (기존 데이터 보존)
-- ALTER TABLE users MODIFY COLUMN birth DATE NULL;

-- 전화번호 필수로 변경
ALTER TABLE users
  MODIFY COLUMN phone VARCHAR(30) NOT NULL COMMENT '전화번호 (필수)';
```

### Step 4: FK 제약 삭제 및 재생성

```sql
-- 1. 모든 FK 제약 삭제
ALTER TABLE orders DROP FOREIGN KEY fk_orders_user_id;
ALTER TABLE warranties DROP FOREIGN KEY fk_warranties_user_id;
ALTER TABLE inquiries DROP FOREIGN KEY fk_inquiries_user_id;
-- ... (나머지 FK도 삭제)

-- 2. users 테이블 user_id 타입 변경
ALTER TABLE users 
  MODIFY COLUMN user_id VARCHAR(20) NOT NULL;

-- 3. 기존 데이터 업데이트 (매핑 테이블 사용)
UPDATE users u
INNER JOIN user_id_migration_map m ON u.user_id = m.old_user_id
SET u.user_id = m.new_user_id;

-- 4. 모든 FK 테이블 user_id 타입 변경 및 데이터 업데이트
ALTER TABLE orders 
  MODIFY COLUMN user_id VARCHAR(20) NULL;

UPDATE orders o
INNER JOIN user_id_migration_map m ON o.user_id = m.old_user_id
SET o.user_id = o.user_id_new;

ALTER TABLE orders DROP COLUMN user_id_new;

-- ... (나머지 테이블도 동일한 방식으로)

-- 5. 새 FK 제약 추가
ALTER TABLE orders 
  ADD CONSTRAINT fk_orders_user_id 
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- ... (나머지 FK도 추가)
```

### Step 5: 검증 및 정리

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

-- 3. 마이그레이션 매핑 테이블 보관 (필요 시)
-- 백업 후 삭제 또는 보관
```

## ⚠️ 주의사항

1. **운영 중단 필요**: 이 마이그레이션은 운영 중단이 필요할 수 있습니다.
2. **롤백 계획**: 마이그레이션 실패 시 롤백 계획 수립 필수
3. **테스트 환경에서 먼저 실행**: 운영 환경 적용 전 테스트 환경에서 충분히 테스트
4. **백업 필수**: 마이그레이션 전 전체 데이터베이스 백업 필수

## 📊 예상 소요 시간

- **준비 및 테스트**: 1-2일
- **마이그레이션 실행**: 2-3시간 (데이터 양에 따라 다름)
- **검증 및 정리**: 0.5-1일

**총 예상 소요 시간**: 3-5일

---

## 📝 guest_id 생성 규칙

### 형식
```
G-{YYYYMMDD}-{랜덤6자}
```

### 예시
- `G-20250101-ABC123`
- `G-20250115-XYZ789`

### 생성 함수

```javascript
/**
 * guest_id 생성 함수
 * 형식: G-{YYYYMMDD}-{랜덤6자}
 * @param {Date} orderDate - 주문 생성 시점 (기본값: 현재 날짜)
 * @returns {string} 새 guest_id
 */
function generateGuestId(orderDate = new Date()) {
  const year = orderDate.getFullYear();
  const month = String(orderDate.getMonth() + 1).padStart(2, '0');
  const day = String(orderDate.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const randomChars = generateRandomString(6); // 대문자 영문 + 숫자
  return `G-${dateStr}-${randomChars}`;
}

/**
 * 고유한 guest_id 생성 (중복 체크 포함)
 * @param {Connection} connection - DB 연결
 * @param {Date} orderDate - 주문 생성 시점
 * @param {number} maxRetries - 최대 재시도 횟수
 * @returns {Promise<string>} 새 guest_id
 */
async function generateUniqueGuestId(connection, orderDate = new Date(), maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const newGuestId = generateGuestId(orderDate);
    const [rows] = await connection.execute(
      'SELECT COUNT(*) as count FROM orders WHERE guest_id = ?',
      [newGuestId]
    );
    if (rows[0].count === 0) {
      return newGuestId;
    }
  }
  throw new Error('고유한 guest_id 생성 실패 (최대 재시도 횟수 초과)');
}
```

### 사용 예시

```javascript
// 비회원 주문 생성 시
const guestId = await generateUniqueGuestId(connection, new Date());

await connection.execute(
  'INSERT INTO orders (user_id, guest_id, order_number, ...) VALUES (?, ?, ?, ...)',
  [null, guestId, orderNumber, ...]
);
```

---

**이 마이그레이션은 매우 중요한 변경이므로, 신중하게 계획하고 실행해야 합니다.**

