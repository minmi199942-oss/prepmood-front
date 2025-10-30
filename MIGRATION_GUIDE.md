# 데이터베이스 마이그레이션 가이드

## 🔧 payments 테이블 생성

### 문제 상황
현재 프로덕션/로컬 데이터베이스에 `payments` 테이블이 없어서 결제 확인(`POST /api/payments/confirm`) API가 500 에러를 발생시킵니다.

### 해결 방법

#### 방법 1: 프로덕션 VPS에서 직접 실행

```bash
# VPS에 SSH 접속
ssh your_vps_hostname

# 백엔드 디렉토리로 이동
cd /path/to/backend

# 마이그레이션 SQL 실행
mysql -h localhost -u prepmood_api -p prepmood < migrations/2025-10-29_add_payments.sql
# 또는 환경변수를 사용하는 경우
mysql -h ${DB_HOST} -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} < migrations/2025-10-29_add_payments.sql
```

#### 방법 2: PM2로 관리되는 프로덕션 환경

```bash
# VPS에 SSH 접속
ssh prepmood.kr

# 백엔드 디렉토리로 이동
cd /var/www/prepmood/backend

# 또는 환경변수를 확인 후 수동 실행
echo $DB_HOST
echo $DB_USER
echo $DB_NAME

# MySQL 접속 후 직접 실행
mysql -h ${DB_HOST} -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME}
```

MySQL 콘솔에서:

```sql
USE prepmood;

CREATE TABLE IF NOT EXISTS payments (
    payment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(32) NOT NULL,
    gateway VARCHAR(32) NOT NULL COMMENT '결제 게이트웨이 (예: toss)',
    payment_key VARCHAR(128) NOT NULL COMMENT '게이트웨이 고유 키',
    status ENUM('initiated', 'authorized', 'captured', 'failed', 'cancelled', 'refunded') NOT NULL DEFAULT 'initiated',
    amount DECIMAL(12,2) NOT NULL COMMENT '결제 금액',
    currency CHAR(3) NOT NULL DEFAULT 'KRW' COMMENT '통화 코드',
    failure_reason VARCHAR(255) NULL COMMENT '실패 사유',
    payload_json JSON NULL COMMENT '게이트웨이 응답 원본',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_number) REFERENCES orders(order_number) ON DELETE CASCADE,
    UNIQUE KEY uk_payment_key (payment_key),
    KEY idx_payments_order (order_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 방법 3: 로컬 개발 환경 (선택사항)

로컬에서 테스트하려면 로컬 MySQL에 동일하게 실행하세요.

```bash
# 로컬 백엔드 디렉토리에서
cd backend

# 로컬 MySQL 접속 정보 사용
mysql -u root -p prepmood < migrations/2025-10-29_add_payments.sql
```

### 검증

마이그레이션 후 테이블이 생성되었는지 확인:

```sql
USE prepmood;
SHOW TABLES LIKE 'payments';
DESCRIBE payments;
```

### 서버 재시작

마이그레이션 완료 후 서버 재시작:

```bash
# PM2로 관리되는 경우
pm2 restart prepmood-backend

# 또는
pm2 restart all
```

### 확인

결제 테스트 후 로그 확인:

```bash
pm2 logs prepmood-backend --lines 100
```

성공 메시지:
```
[payments][mode=MOCK] 결제 확정 성공
```

---

## 📝 참고

- 마이그레이션 파일 위치: `backend/migrations/2025-10-29_add_payments.sql`
- 관련 코드: `backend/payments-routes.js` (280번째 줄)
- 환경 변수: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

