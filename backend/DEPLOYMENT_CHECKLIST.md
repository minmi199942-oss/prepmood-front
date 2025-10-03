# 🚀 운영 배포 전 보안 체크리스트

## ✅ 완료된 항목들
- [x] 하드코딩된 비밀번호 제거
- [x] .gitignore 설정 (.env 파일 보호)
- [x] Rate Limiting 적용
- [x] 입력값 검증 (express-validator)
- [x] CORS 제한 설정
- [x] Helmet.js 보안 헤더
- [x] 로그 보안 강화
- [x] HTTPS (Cloudflare 프록시)

## ⚠️ 배포 전 필수 작업

### 1. MySQL 보안 설정
```sql
-- 전용 사용자 생성 (root 사용 금지)
CREATE USER 'prepmood_api'@'localhost' IDENTIFIED BY 'NEW_STRONG_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON prepmood.* TO 'prepmood_api'@'localhost';
FLUSH PRIVILEGES;
```

### 2. 환경변수 업데이트
```bash
# .env 파일 수정
DB_USER=prepmood_api  # root에서 변경
DB_PASSWORD=NEW_STRONG_PASSWORD  # 새 비밀번호
EMAIL_PASS=NEW_NAVER_APP_PASSWORD  # 새 앱 비밀번호 (기존 것 노출됨)
NODE_ENV=production
ALLOWED_ORIGINS=https://prepmood.kr
```

### 3. 서버 방화벽 설정
```bash
# MySQL 포트 외부 차단
sudo ufw deny 3306
sudo ufw allow from 127.0.0.1 to any port 3306

# API 포트만 허용
sudo ufw allow 3000
```

### 4. PM2 설정
```bash
# 프로덕션 모드로 실행
pm2 start index.js --name "prepmood-api" --env production
pm2 save
pm2 startup
```

### 5. 로그 로테이션
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## 🚨 즉시 변경해야 할 비밀번호들

1. **MySQL 비밀번호**: `Tkfkdgod1-` → 새 비밀번호
2. **네이버 앱 비밀번호**: `2GFH6M3WHJS1` → 새 앱 비밀번호
3. **MySQL 사용자**: `root` → 전용 사용자

## 📊 모니터링 설정

### 1. 로그 모니터링
```bash
# 실시간 로그 확인
pm2 logs prepmood-api

# 에러 로그만 확인
pm2 logs prepmood-api --err
```

### 2. 성능 모니터링
```bash
# PM2 모니터링
pm2 monit

# 시스템 리소스 확인
htop
```

## 🔒 정기 보안 점검

### 월 1회
- [ ] npm audit 실행 및 취약점 패치
- [ ] 로그 파일 정리
- [ ] 접근 로그 분석

### 분기 1회
- [ ] 비밀번호 변경
- [ ] 의존성 업데이트
- [ ] 보안 설정 재검토

## 🚨 보안 사고 대응

1. **의심스러운 활동 감지시**
   - 즉시 API 서버 중단
   - 로그 분석
   - 비밀번호 즉시 변경

2. **데이터 유출 의심시**
   - 데이터베이스 접근 차단
   - 사용자 알림
   - 보안 전문가 상담

## ✅ 최종 확인

배포 전 다음 사항들을 반드시 확인하세요:

- [ ] 모든 비밀번호가 변경되었는가?
- [ ] .env 파일이 Git에 올라가지 않는가?
- [ ] Rate Limiting이 적절히 설정되었는가?
- [ ] CORS 설정이 올바른가?
- [ ] 로그에 민감정보가 출력되지 않는가?
- [ ] MySQL 사용자 권한이 최소화되었는가?

