# 🌊 DigitalOcean MySQL 설정 가이드

## 1️⃣ DigitalOcean 웹 콘솔 접속
1. https://cloud.digitalocean.com/ 로그인
2. **Droplets** → 서버 선택
3. **Console** 버튼 클릭 (웹 터미널)

## 2️⃣ MySQL 접속 및 사용자 생성

### MySQL 접속
```bash
# MySQL 접속 (root 비밀번호 입력)
mysql -u root -p
```

### 전용 사용자 생성
```sql
-- MySQL 콘솔에서 실행
-- 1. 새 사용자 생성 (강력한 비밀번호 사용)
CREATE USER 'prepmood_api'@'%' IDENTIFIED BY 'PrepmoodAPI2025!@#$';

-- 2. prepmood 데이터베이스 생성 (없는 경우)
CREATE DATABASE IF NOT EXISTS prepmood;

-- 3. 권한 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON prepmood.* TO 'prepmood_api'@'%';

-- 4. 권한 적용
FLUSH PRIVILEGES;

-- 5. 확인
SELECT User, Host FROM mysql.user WHERE User = 'prepmood_api';

-- 6. MySQL 종료
EXIT;
```

## 3️⃣ MySQL 외부 접속 허용 설정

### MySQL 설정 파일 수정
```bash
# MySQL 설정 파일 편집
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf

# 또는
sudo nano /etc/mysql/my.cnf
```

### 설정 내용 수정
```ini
# bind-address 주석 처리 또는 변경
# bind-address = 127.0.0.1  <- 이 줄을 주석 처리
bind-address = 0.0.0.0      <- 또는 이렇게 변경
```

### MySQL 재시작
```bash
sudo systemctl restart mysql
```

## 4️⃣ 방화벽 설정 (보안)

### MySQL 포트 허용 (특정 IP만)
```bash
# 현재 로컬 IP 확인 (이 IP만 허용할 예정)
curl ifconfig.me

# 방화벽에서 MySQL 포트 허용 (특정 IP만)
# YOUR_LOCAL_IP를 실제 IP로 변경
sudo ufw allow from YOUR_LOCAL_IP to any port 3306

# 또는 모든 IP 허용 (덜 안전)
sudo ufw allow 3306
```

## 5️⃣ 연결 테스트

### 서버에서 테스트
```bash
# 서버에서 새 사용자로 접속 테스트
mysql -u prepmood_api -p prepmood
```

### 로컬에서 테스트 (.env 파일 수정 후)
```bash
# backend 디렉토리에서
node -e "
const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
    try {
        const connection = await mysql.createConnection({
            host: 'prepmood.kr',  // 또는 실제 서버 IP
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        console.log('✅ MySQL 연결 성공!');
        await connection.end();
    } catch (error) {
        console.log('❌ MySQL 연결 실패:', error.message);
    }
}
test();
"
```

## 6️⃣ .env 파일 업데이트

```env
# 원격 MySQL 설정
DB_HOST=prepmood.kr
DB_USER=prepmood_api
DB_PASSWORD=PrepmoodAPI2025!@#$
DB_NAME=prepmood
```

## 🚨 보안 주의사항

1. **강력한 비밀번호 사용**: 위 예시보다 더 복잡하게
2. **방화벽 설정**: 특정 IP만 MySQL 접속 허용
3. **SSL 연결**: 가능하면 SSL 연결 사용
4. **정기 백업**: 데이터베이스 정기 백업 설정

## 🔧 문제 해결

### 연결 안 될 때
1. 방화벽 확인: `sudo ufw status`
2. MySQL 상태 확인: `sudo systemctl status mysql`
3. 포트 확인: `netstat -tlnp | grep 3306`
4. 로그 확인: `sudo tail -f /var/log/mysql/error.log`

