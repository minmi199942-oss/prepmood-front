# 자동 배포 시스템 보안 분석

## 📋 현재 보안 상태

### ✅ 구현된 보안 기능

1. **GitHub Webhook 서명 검증**
   - HMAC-SHA256 사용
   - `DEPLOY_WEBHOOK_SECRET`으로 검증
   - 서명 없으면 401 반환

2. **이벤트 필터링**
   - Push 이벤트만 허용
   - main 브랜치만 허용

3. **배포 락**
   - 중복 실행 방지
   - `/tmp/prepmood-deploy.lock` 사용

4. **.env 파일 차단**
   - Nginx에서 `.env` 파일 접근 차단

5. **일반 API Rate Limiting**
   - `express-rate-limit` 사용
   - 15분당 500회 제한

## ⚠️ 잠재적 보안 취약점

### 🔴 높은 위험도

#### 1. GitHub IP 화이트리스트 없음
**문제:**
- 현재는 모든 IP에서 webhook 요청을 받음
- GitHub 서명만 검증하지만, 서명이 유출되면 다른 IP에서도 공격 가능

**해결책:**
```nginx
# nginx-prepmood.conf에 추가
location /api/deploy/webhook {
    # GitHub IP 범위만 허용
    allow 140.82.112.0/20;
    allow 143.55.64.0/20;
    allow 185.199.108.0/22;
    allow 192.30.252.0/22;
    deny all;
    
    limit_req zone=deploy_webhook burst=3 nodelay;
    limit_req_status 429;
    
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

#### 2. Deploy Webhook Rate Limiting 없음
**문제:**
- `/api/deploy/webhook`에 rate limiting이 없음
- DoS 공격 가능

**해결책:**
- Nginx 레벨 rate limiting 추가 (위 예시 참고)
- 또는 Node.js 레벨에서 추가

#### 3. Command Injection 가능성
**문제:**
```javascript
const deployCommand = `/bin/bash -lc "bash -x /root/prepmood-repo/deploy.sh >> '${DEPLOY_RUN_LOG}' 2>&1"`;
```
- `DEPLOY_RUN_LOG` 경로에 특수문자가 있으면 command injection 가능
- 하지만 `path.join(__dirname, 'deploy-run.log')`를 사용하므로 현재는 안전

**개선:**
- 경로 검증 추가

### 🟡 중간 위험도

#### 4. 로그 파일에 민감 정보 노출 가능
**문제:**
- `deploy-webhook.log`, `deploy-run.log`에 민감 정보가 기록될 수 있음
- 파일 권한이 너무 열려있을 수 있음

**해결책:**
```bash
# VPS에서 실행
chmod 600 /var/www/html/backend/deploy-webhook.log
chmod 600 /var/www/html/backend/deploy-run.log
chown root:root /var/www/html/backend/deploy-*.log
```

#### 5. GitHub 저장소 접근 권한
**문제:**
- 저장소가 public이면 누구나 코드 확인 가능
- 저장소가 private이면 더 안전

**확인 방법:**
- GitHub 저장소 → Settings → General → Danger Zone
- 저장소 visibility 확인

#### 6. 배포 스크립트 권한
**문제:**
- `/root/prepmood-repo/deploy.sh`가 root 권한으로 실행됨
- 스크립트가 악의적으로 수정되면 전체 시스템 위험

**해결책:**
- 배포 스크립트 파일 무결성 검증 추가
- 또는 별도 사용자로 실행 (권한 분리)

### 🟢 낮은 위험도

#### 7. 환경 변수 노출
**문제:**
- `.env` 파일이 실수로 커밋될 수 있음

**해결책:**
- `.gitignore`에 `.env` 추가 확인
- Git hooks로 `.env` 커밋 방지

#### 8. 로그 파일 크기 관리
**문제:**
- 로그 파일이 계속 커지면 디스크 공간 부족

**해결책:**
- 로그 로테이션 설정
- 또는 주기적 정리

## 🔒 권장 보안 개선 사항

### 즉시 적용 (필수)

1. **GitHub IP 화이트리스트 추가**
2. **Deploy Webhook Rate Limiting 추가**
3. **로그 파일 권한 제한**

### 단기 개선 (권장)

4. **배포 스크립트 무결성 검증**
5. **로그 로테이션 설정**
6. **모니터링 및 알림 추가**

### 장기 개선 (선택)

7. **별도 배포 사용자 생성 (권한 분리)**
8. **배포 승인 프로세스 추가**
9. **배포 롤백 자동화**

## 📝 보안 체크리스트

- [ ] GitHub IP 화이트리스트 추가
- [ ] Deploy Webhook Rate Limiting 추가
- [ ] 로그 파일 권한 제한 (600)
- [ ] GitHub 저장소 private 확인
- [ ] .env 파일 .gitignore 확인
- [ ] 로그 로테이션 설정
- [ ] 배포 스크립트 무결성 검증

