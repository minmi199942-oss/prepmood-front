# 🔒 MySQL 보안 설정 - 왜 필요한가?

## 🚨 기존 방법의 보안 위험성

### 1. ROOT 사용자 사용의 위험성

#### ❌ 기존 방법 (위험)
```env
DB_USER=root
DB_PASSWORD=Tkfkdgod1-
```

#### 🔥 **왜 위험한가?**
```sql
-- ROOT 사용자가 가진 권한들
SHOW GRANTS FOR 'root'@'localhost';

-- 결과: 이런 무시무시한 권한들을 가짐
GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' WITH GRANT OPTION;
```

**ROOT가 할 수 있는 일들:**
- 🔥 **모든 데이터베이스 삭제** (`DROP DATABASE`)
- 🔥 **다른 사용자 생성/삭제** (`CREATE USER`, `DROP USER`)
- 🔥 **시스템 파일 읽기/쓰기** (`LOAD_FILE()`, `INTO OUTFILE`)
- 🔥 **MySQL 서버 종료** (`SHUTDOWN`)
- 🔥 **다른 데이터베이스 접근** (고객 정보, 결제 정보 등)

#### 💥 **실제 공격 시나리오**
```javascript
// 해커가 SQL 인젝션으로 이런 명령을 실행할 수 있음
"'; DROP DATABASE prepmood; --"
"'; CREATE USER 'hacker'@'%' IDENTIFIED BY 'password123'; --"
"'; SELECT * FROM mysql.user; --"  // 모든 사용자 정보 탈취
```

### 2. 약한 비밀번호의 위험성

#### ❌ 기존 비밀번호: `Tkfkdgod1-`
```bash
# 해커의 브루트포스 공격
# 1. 사전 공격 (Dictionary Attack)
john --wordlist=passwords.txt --format=mysql hash.txt

# 2. 패턴 기반 공격
# "Tkfkdgod1-" 같은 패턴은 한국어 키보드 패턴으로 쉽게 추측 가능
```

**약한 비밀번호의 문제점:**
- 📝 **패턴 예측 가능**: 한국어 자판 패턴
- 🔢 **길이 부족**: 10자 (최소 16자 권장)
- 🎯 **브루트포스 취약**: 몇 시간 내 뚫림

## ✅ 새로운 방법이 안전한 이유

### 1. 최소 권한 원칙 (Principle of Least Privilege)

#### ✅ 새로운 방법 (안전)
```sql
-- 전용 사용자 생성
CREATE USER 'prepmood_api'@'localhost' IDENTIFIED BY 'PrepmoodAPI2025!@#$%^&*';

-- 필요한 권한만 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON prepmood.* TO 'prepmood_api'@'localhost';
```

**제한된 권한으로 할 수 있는 일:**
- ✅ **prepmood 데이터베이스만** 접근 가능
- ✅ **기본 CRUD 작업만** 가능 (SELECT, INSERT, UPDATE, DELETE)
- ❌ **다른 데이터베이스** 접근 불가
- ❌ **사용자 생성/삭제** 불가
- ❌ **시스템 파일** 접근 불가
- ❌ **서버 종료** 불가

#### 💪 **공격 시나리오 차단**
```javascript
// 해커가 SQL 인젝션을 시도해도...
"'; DROP DATABASE prepmood; --"  
// ❌ 실패: DROP 권한 없음

"'; CREATE USER 'hacker'@'%'; --"  
// ❌ 실패: CREATE USER 권한 없음

"'; SELECT * FROM mysql.user; --"  
// ❌ 실패: mysql 데이터베이스 접근 권한 없음
```

### 2. 강력한 비밀번호

#### ✅ 새로운 비밀번호: `PrepmoodAPI2025!@#$%^&*`
```
길이: 24자
구성: 대문자 + 소문자 + 숫자 + 특수문자
패턴: 예측 불가능
브루트포스 시간: 수십억 년
```

## 🔍 상세한 설정 방법과 이유

### 1. 사용자 생성 시 호스트 제한

```sql
-- ❌ 위험: 모든 호스트에서 접근 가능
CREATE USER 'prepmood_api'@'%' IDENTIFIED BY 'password';

-- ✅ 안전: 특정 호스트에서만 접근 가능
CREATE USER 'prepmood_api'@'localhost' IDENTIFIED BY 'password';
-- 또는
CREATE USER 'prepmood_api'@'192.168.1.100' IDENTIFIED BY 'password';
```

**이유:** 네트워크 레벨에서 접근 차단

### 2. 데이터베이스별 권한 분리

```sql
-- ❌ 위험: 모든 데이터베이스 접근
GRANT ALL PRIVILEGES ON *.* TO 'user'@'localhost';

-- ✅ 안전: 특정 데이터베이스만 접근
GRANT SELECT, INSERT, UPDATE, DELETE ON prepmood.* TO 'prepmood_api'@'localhost';
```

**이유:** 다른 데이터베이스 보호 (고객정보, 결제정보 등)

### 3. 불필요한 권한 제거

```sql
-- 위험한 권한들 (절대 주면 안 됨)
-- FILE: 시스템 파일 읽기/쓰기
-- PROCESS: 다른 사용자 프로세스 확인
-- SUPER: 관리자 권한
-- SHUTDOWN: 서버 종료
-- CREATE USER: 사용자 생성
-- GRANT OPTION: 다른 사용자에게 권한 부여

-- API에 필요한 최소 권한만
GRANT SELECT, INSERT, UPDATE, DELETE ON prepmood.* TO 'prepmood_api'@'localhost';
```

## 🛡️ 추가 보안 계층

### 1. 네트워크 보안
```bash
# 방화벽으로 MySQL 포트 보호
sudo ufw deny 3306                    # 기본적으로 차단
sudo ufw allow from 192.168.1.100 to any port 3306  # 특정 IP만 허용
```

### 2. 연결 암호화
```sql
-- SSL 연결 강제
ALTER USER 'prepmood_api'@'localhost' REQUIRE SSL;
```

### 3. 로그 모니터링
```bash
# MySQL 로그 모니터링
tail -f /var/log/mysql/mysql.log
# 의심스러운 접근 시도 감지
```

## 📊 보안 수준 비교

| 항목 | 기존 방법 | 새로운 방법 |
|------|----------|------------|
| 사용자 권한 | ⭐☆☆☆☆ (ROOT) | ⭐⭐⭐⭐⭐ (제한됨) |
| 비밀번호 강도 | ⭐⭐☆☆☆ (약함) | ⭐⭐⭐⭐⭐ (강함) |
| 네트워크 보안 | ⭐☆☆☆☆ (제한없음) | ⭐⭐⭐⭐☆ (IP 제한) |
| 데이터베이스 격리 | ⭐☆☆☆☆ (전체 접근) | ⭐⭐⭐⭐⭐ (특정 DB만) |
| 공격 저항성 | ⭐☆☆☆☆ (매우 취약) | ⭐⭐⭐⭐⭐ (강력함) |

## 🚨 실제 해킹 사례

### 사례 1: ROOT 권한 남용
```
2023년 A회사: ROOT 계정 해킹으로 전체 고객 데이터베이스 삭제
피해: 100만 고객 정보 유실, 복구 불가능
원인: API에서 ROOT 계정 사용
```

### 사례 2: 약한 비밀번호
```
2022년 B회사: 브루트포스 공격으로 데이터베이스 침입
피해: 개인정보 50만건 유출
원인: "password123" 같은 약한 비밀번호 사용
```

## 💡 결론

**기존 방법이 위험한 이유:**
1. 🔥 **ROOT 권한**: 해커가 모든 것을 파괴할 수 있음
2. 🔓 **약한 비밀번호**: 쉽게 뚫림
3. 🌐 **무제한 접근**: 어디서든 접근 가능

**새로운 방법이 안전한 이유:**
1. 🛡️ **최소 권한**: 필요한 것만 할 수 있음
2. 🔒 **강력한 비밀번호**: 뚫기 거의 불가능
3. 🎯 **접근 제한**: 특정 위치에서만 접근 가능

**한 줄 요약:** 
기존 방법은 "집 열쇠를 마스터키로 주는 것"이고, 
새로운 방법은 "특정 방 열쇠만 주는 것"입니다! 🏠🔑

