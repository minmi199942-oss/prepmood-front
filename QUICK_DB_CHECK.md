# 빠른 DB 상태 확인 가이드

## 문제 해결

### 1. 오타 수정
- ❌ `npm run chech-db`
- ✅ `npm run check-db`

### 2. 경로 수정
현재 위치: `/var/www/html/backend`

**SQL 파일 실행 시:**
```bash
# 현재 디렉토리 기준 (backend 폴더 안에 있으므로)
mysql -u prepmood_user -p prepmood < check_current_db_state.sql
```

## 실행 방법

### 방법 1: Node.js 스크립트 (권장) ✅

```bash
cd /var/www/html/backend
npm run check-db
```

**장점:**
- 결과가 보기 좋게 포맷됨
- 에러 처리 포함
- 자동으로 연결 종료

### 방법 2: SQL 직접 실행

```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < check_current_db_state.sql
```

**주의:** 파일이 없다면 먼저 파일을 생성하거나 업로드해야 합니다.

## 파일이 없는 경우

### 파일 확인
```bash
ls -la /var/www/html/backend/check-db-state.js
ls -la /var/www/html/backend/check_current_db_state.sql
```

### 파일이 없다면

**옵션 1: 로컬에서 파일 업로드**
```bash
# 로컬에서 (Windows)
scp backend/check-db-state.js root@your-server:/var/www/html/backend/
scp backend/check_current_db_state.sql root@your-server:/var/www/html/backend/
```

**옵션 2: 서버에서 직접 생성**
```bash
# check-db-state.js 파일 내용을 서버에 생성
# (파일 내용은 아래 참고)
```

## 간단한 수동 확인 (파일 없이)

파일이 없어도 바로 확인할 수 있는 간단한 명령어:

```bash
mysql -u prepmood_user -p prepmood -e "
SELECT '=== MySQL 버전 ===' AS info;
SELECT VERSION() AS mysql_version;

SELECT '=== users 테이블 구조 ===' AS info;
DESCRIBE users;

SELECT '=== user_id 타입 ===' AS info;
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'user_id';

SELECT '=== users 데이터 개수 ===' AS info;
SELECT COUNT(*) AS total_users FROM users;

SELECT '=== FK 관계 ===' AS info;
SELECT TABLE_NAME, COLUMN_NAME 
FROM information_schema.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = 'prepmood' 
  AND REFERENCED_TABLE_NAME = 'users' 
  AND REFERENCED_COLUMN_NAME = 'user_id';
"
```

## 다음 단계

DB 상태 확인 후 결과를 공유해주시면:
1. 실제 DB 구조 분석
2. 마이그레이션 스크립트 구체화
3. 다음 단계 안내


