# 이름 필드 통합에 따른 코드 변경 사항

## 📋 개요

`users` 테이블의 `last_name`, `first_name`을 `name` 단일 필드로 통합하면서 수정해야 하는 코드 목록입니다.

## 🔍 영향 받는 코드 위치

### 1. 회원가입 API (`backend/index.js`)

#### 현재 코드 (445줄)
```javascript
await connection.execute(
    'INSERT INTO users (email, password_hash, last_name, first_name, birth, phone, verified) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [email, hashedPassword, lastName, firstName, birthdate, phoneValue]
);
```

#### 변경 후
```javascript
await connection.execute(
    'INSERT INTO users (user_id, email, password_hash, name, phone, verified, email_verified, privacy_consent, marketing_consent, terms_consent, privacy_policy_consent) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)',
    [newUserId, email, hashedPassword, name, phone, privacy_consent, marketing_consent, terms_consent, privacy_policy_consent]
);
```

**변경 사항**:
- `last_name`, `first_name` → `name` 단일 필드
- `birth` 제거
- `user_id` 직접 생성 및 INSERT
- 동의 관련 컬럼 4개 추가

### 2. 로그인 API (`backend/index.js`)

#### 현재 코드 (499줄)
```javascript
'SELECT user_id, email, password_hash, last_name, first_name, phone, birth, verified FROM users WHERE email = ?'
```

#### 변경 후
```javascript
'SELECT user_id, email, password_hash, name, phone, verified FROM users WHERE email = ?'
```

#### 현재 코드 (544줄)
```javascript
name: `${user.last_name} ${user.first_name}`.trim()
```

#### 변경 후
```javascript
name: user.name
```

### 3. 프로필 조회 API (`backend/index.js`)

#### 현재 코드 (1164줄)
```javascript
'SELECT user_id, email, last_name, first_name, phone, birth FROM users WHERE user_id = ?'
```

#### 변경 후
```javascript
'SELECT user_id, email, name, phone FROM users WHERE user_id = ?'
```

#### 현재 코드 (1182-1184줄)
```javascript
name: `${user.last_name} ${user.first_name}`.trim(), // 기존 유지 (하위호환)
last_name: user.last_name,  // ✅ 추가
first_name: user.first_name, // ✅ 추가
```

#### 변경 후
```javascript
name: user.name
```

### 4. 프로필 업데이트 API (`backend/index.js`)

#### 현재 코드 (711줄, 771줄, 1004줄)
```javascript
'UPDATE users SET last_name = ?, first_name = ?, birth = ? WHERE user_id = ?'
```

#### 변경 후
```javascript
'UPDATE users SET name = ? WHERE user_id = ?'
```

### 5. Google 로그인 (`backend/google-auth.js`)

#### 현재 코드 (69줄)
```javascript
'SELECT user_id, email, first_name, last_name, phone, birth, google_id, profile_picture FROM users WHERE email = ?'
```

#### 변경 후
```javascript
'SELECT user_id, email, name, phone, google_id, profile_picture FROM users WHERE email = ?'
```

#### 현재 코드 (81-82줄, 99-101줄)
```javascript
firstName: user.first_name,
lastName: user.last_name
```

#### 변경 후
```javascript
name: user.name
```

#### 현재 코드 (139줄)
```javascript
'INSERT INTO users (email, first_name, password_hash, google_id, profile_picture, email_verified, verified) VALUES (?, ?, ?, ?, ?, ?, ?)'
```

#### 변경 후
```javascript
'INSERT INTO users (user_id, email, name, password_hash, google_id, profile_picture, email_verified, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
```

**변경 사항**:
- `first_name` → `name`
- `user_id` 직접 생성 및 INSERT
- `last_name` 제거

### 6. 관리자 주문 조회 API (`backend/index.js`)

#### 현재 코드 (1401-1402줄)
```javascript
u.first_name,
u.last_name
```

#### 변경 후
```javascript
u.name
```

#### 현재 코드 (1417줄, 1464줄)
```javascript
query += ' AND (o.order_number LIKE ? OR o.shipping_first_name LIKE ? OR o.shipping_last_name LIKE ? OR u.email LIKE ?)';
```

#### 변경 후
```javascript
query += ' AND (o.order_number LIKE ? OR o.shipping_name LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
```

**변경 사항**:
- `u.first_name`, `u.last_name` → `u.name`
- `o.shipping_first_name`, `o.shipping_last_name` → `o.shipping_name` (이름 필드 통합 시)

### 7. 기타 사용 위치

다음 위치에서도 `last_name`, `first_name`을 사용하는지 확인 필요:
- JWT 토큰 생성 시
- 이메일 발송 시
- 관리자 페이지
- 프론트엔드 코드

## 📝 변경 체크리스트

- [ ] `backend/index.js` - 회원가입 API 수정
- [ ] `backend/index.js` - 로그인 API 수정
- [ ] `backend/index.js` - 프로필 조회 API 수정
- [ ] `backend/index.js` - 프로필 업데이트 API 수정
- [ ] `backend/index.js` - 관리자 주문 조회 API 수정
- [ ] `backend/google-auth.js` - Google 로그인 수정
- [ ] JWT 토큰 생성 로직 확인
- [ ] 이메일 발송 로직 확인
- [ ] 관리자 페이지 확인
- [ ] 프론트엔드 코드 확인

## ⚠️ 주의사항

1. **기존 데이터 마이그레이션**: `last_name`, `first_name` → `name` 변환 필요
2. **하위 호환성**: 기존 API 응답에서 `name` 필드 제공 필요
3. **검색 기능**: 이름 검색 로직 수정 필요 (`first_name`, `last_name` → `name`)

---

**이 문서는 users 테이블 마이그레이션 후 코드 수정 시 참고용입니다.**


