# 문의 관리 테이블 마이그레이션 실행 가이드

## 📋 마이그레이션 파일

**파일 경로:** `backend/migrations/010_create_inquiries_tables.sql`

**생성할 테이블:**
- `inquiries` - 문의 정보 테이블
- `inquiry_replies` - 답변 이력 테이블

---

## 🚀 실행 방법

### 방법 1: run-migration.js 사용 (권장)

VPS에서 실행:

```bash
cd /var/www/html
node backend/run-migration.js migrations/010_create_inquiries_tables.sql
```

**장점:**
- 실행 이력 자동 기록 (`schema_migrations` 테이블)
- 중복 실행 방지
- 파일 변경 감지 (안전장치)

### 방법 2: MySQL 직접 실행

VPS에서 실행:

```bash
cd /var/www/html
mysql -u prepmood_user -p prepmood < backend/migrations/010_create_inquiries_tables.sql
```

**주의:**
- 실행 이력이 자동으로 기록되지 않음
- 중복 실행 시 오류 발생 가능 (CREATE TABLE IF NOT EXISTS로 방지됨)

---

## ✅ 실행 전 확인

### 1. 테이블 존재 여부 확인

```bash
mysql -u prepmood_user -p prepmood -e "SHOW TABLES LIKE 'inquiries';"
```

### 2. 데이터 백업 (필요 시)

```bash
mysql -u prepmood_user -p prepmood -e "CREATE TABLE inquiries_backup AS SELECT * FROM inquiries;" 2>/dev/null || echo "테이블이 없어 백업 불필요"
```

---

## 🔍 실행 후 확인

### 1. 테이블 구조 확인

```bash
mysql -u prepmood_user -p prepmood -e "DESCRIBE inquiries;"
mysql -u prepmood_user -p prepmood -e "DESCRIBE inquiry_replies;"
```

### 2. 인덱스 확인

```bash
mysql -u prepmood_user -p prepmood -e "SHOW INDEXES FROM inquiries;"
mysql -u prepmood_user -p prepmood -e "SHOW INDEXES FROM inquiry_replies;"
```

### 3. 실행 이력 확인 (run-migration.js 사용 시)

```bash
mysql -u prepmood_user -p prepmood -e "SELECT * FROM schema_migrations WHERE migration_file LIKE '%010%';"
```

---

## ⚠️ 주의사항

1. **중복 실행 방지**
   - `run-migration.js` 사용 시 자동으로 중복 실행 방지
   - MySQL 직접 실행 시 `CREATE TABLE IF NOT EXISTS`로 안전하게 처리됨

2. **외래 키 제약**
   - `inquiries.user_id` → `users.user_id` (ON DELETE SET NULL)
   - `inquiry_replies.inquiry_id` → `inquiries.id` (ON DELETE CASCADE)
   - `inquiry_replies.admin_user_id` → `users.user_id` (ON DELETE CASCADE)

3. **인덱스**
   - 검색 성능을 위한 인덱스가 자동 생성됨
   - `idx_email`, `idx_name`, `idx_status`, `idx_category` 등

---

## 📝 실행 예시

### run-migration.js 사용

```bash
root@prepmood-vps:/var/www/html# node backend/run-migration.js migrations/010_create_inquiries_tables.sql
✅ MySQL 연결 성공
📄 마이그레이션 파일: migrations/010_create_inquiries_tables.sql
🚀 마이그레이션 실행 중...
✅ 마이그레이션 실행 완료
✅ 실행 이력 기록 완료
```

### MySQL 직접 실행

```bash
root@prepmood-vps:/var/www/html# mysql -u prepmood_user -p prepmood < backend/migrations/010_create_inquiries_tables.sql
Enter password: 
Field Type Null Key Default Extra
id bigint NO PRI NULL auto_increment
inquiry_number varchar(20) YES UNI NULL
user_id bigint YES MUL NULL
...
✅ inquiries 테이블 생성 완료
✅ inquiry_replies 테이블 생성 완료
```

---

## 🔄 롤백 방법

**주의:** 테이블을 삭제하면 모든 데이터가 삭제됩니다.

```bash
mysql -u prepmood_user -p prepmood -e "DROP TABLE IF EXISTS inquiry_replies;"
mysql -u prepmood_user -p prepmood -e "DROP TABLE IF EXISTS inquiries;"
```

**run-migration.js 실행 이력 삭제 (필요 시):**

```bash
mysql -u prepmood_user -p prepmood -e "DELETE FROM schema_migrations WHERE migration_file = 'migrations/010_create_inquiries_tables.sql';"
```

---

## ✅ 완료 체크리스트

- [ ] 마이그레이션 파일 확인 (`backend/migrations/010_create_inquiries_tables.sql`)
- [ ] VPS에 파일 업로드 (Git push 후 자동 배포 또는 수동 업로드)
- [ ] 마이그레이션 실행
- [ ] 테이블 구조 확인
- [ ] 인덱스 확인
- [ ] 실행 이력 확인 (run-migration.js 사용 시)







