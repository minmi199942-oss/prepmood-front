# 마이그레이션 실행 오류 해결

## 오류: Plugin 'mysql_native_password' is not loaded

**원인:** MySQL 8.0 이상에서 기본 인증 방식이 `caching_sha2_password`로 변경되었지만, Node.js 연결 설정이 `mysql_native_password`를 요구하는 경우 발생합니다.

**해결 방법:**

### 방법 1: MySQL 직접 실행 (권장 - 가장 빠름)

```bash
cd /var/www/html
mysql -u prepmood_user -p prepmood < backend/migrations/010_create_inquiries_tables.sql
```

이 방법은 Node.js 연결 설정과 무관하게 직접 SQL을 실행하므로 오류가 발생하지 않습니다.

### 방법 2: MySQL 사용자 인증 방식 확인

```bash
mysql -u root -p -e "SELECT user, host, plugin FROM mysql.user WHERE user='prepmood_user';"
```

### 방법 3: 사용자 인증 방식 변경 (필요 시)

```bash
mysql -u root -p -e "ALTER USER 'prepmood_user'@'%' IDENTIFIED WITH mysql_native_password BY 'your_password';"
mysql -u root -p -e "FLUSH PRIVILEGES;"
```

**주의:** 이 방법은 보안상 권장되지 않습니다. MySQL 직접 실행이 더 안전합니다.

---

## 실행 후 확인

```bash
# 테이블 구조 확인
mysql -u prepmood_user -p prepmood -e "DESCRIBE inquiries;"
mysql -u prepmood_user -p prepmood -e "DESCRIBE inquiry_replies;"

# 테이블 목록 확인
mysql -u prepmood_user -p prepmood -e "SHOW TABLES LIKE 'inquiries%';"
```







