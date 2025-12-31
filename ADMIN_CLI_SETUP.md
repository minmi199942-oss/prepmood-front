# 관리자 CLI 도구 설치 및 사용 가이드

## 1. VPS에서 바로 쓸 수 있게 세팅 점검

### (1) 파일 위치
```bash
cd /var/www/html/backend
node admin-cli.js ...
```

또는 npm 스크립트 사용:
```bash
cd /var/www/html/backend
npm run admin -- ...
```

### (2) 의존성 확인
```bash
cd /var/www/html/backend
cat package.json | grep -E "commander|mysql2|dotenv"
```

**확인 결과:**
- ✅ `commander`: ^12.1.0 (설치됨)
- ✅ `mysql2`: ^3.15.1 (설치됨)
- ✅ `dotenv`: ^17.2.3 (설치됨)
- ✅ CSV 파서: 외부 라이브러리 없이 자체 구현 (추가 설치 불필요)

**의존성 설치 (필요 시):**
```bash
cd /var/www/html/backend
npm install
```

### (3) .env 확인
`backend/.env` 파일에 다음 값이 있어야 합니다:

```bash
DB_HOST=127.0.0.1
DB_USER=prepmood_user
DB_PASSWORD=Tkfkdgod1-
DB_NAME=prepmood
DB_PORT=3306
ADMIN_EMAILS=dmsals0603@naver.com
```

**중요:** `ADMIN_EMAILS`는 **필수**입니다.
- CLI는 `ADMIN_EMAILS`가 비어있으면 에러로 중단합니다
- `transfer_logs.admin_user_id`는 항상 관리자 ID가 기록됩니다 (NULL 불가)
- 운영 정책: 관리자 이메일을 항상 `.env`에 설정해두세요

---

## 2. 운영 전 "꼭 한 번" 해볼 테스트 루틴

### (1) 조회 테스트
```bash
cd /var/www/html/backend

# 단일 토큰 조회
npm run admin -- token:lookup --token=Wu34wbf5N7GycYkYQp99

# 검색 (이메일, 제품명, 내부코드로 검색)
npm run admin -- token:search --term=minmi199942@gmail.com
npm run admin -- token:search --term=테뉴
```

### (2) 위험 작업은 항상 dry-run 먼저
```bash
cd /var/www/html/backend

# 양도 미리보기
npm run admin -- warranty:transfer \
  --token=Wu34wbf5N7GycYkYQp99 \
  --from=minmi199942@gmail.com \
  --to=sale_luxury@naver.com \
  --dry-run

# 토큰 차단 미리보기
npm run admin -- token:block --token=XXX --dry-run

# 보증서 삭제 미리보기
npm run admin -- warranty:delete --token=XXX --dry-run
```

### (3) 실제 실행은 프롬프트 확인 후
```bash
cd /var/www/html/backend

# 확인 프롬프트 표시 (기본)
npm run admin -- warranty:transfer \
  --token=Wu34wbf5N7GycYkYQp99 \
  --from=minmi199942@gmail.com \
  --to=sale_luxury@naver.com

# 자동화(무인 실행)일 때만 --yes 사용
npm run admin -- warranty:transfer \
  --token=Wu34wbf5N7GycYkYQp99 \
  --from=minmi199942@gmail.com \
  --to=sale_luxury@naver.com \
  --yes
```

---

## 3. Batch(CSV) 운영 팁 (수천 건 대비)

### (1) CSV는 "UTF-8"로 저장
- 엑셀에서 저장 시 인코딩이 흔들릴 수 있음
- VSCode에서 UTF-8로 저장하거나, 서버에서 heredoc로 생성 권장
- **중요**: UTF-8 BOM은 자동으로 제거됩니다

### (1-1) reason 필드에 콤마(,) 사용 금지
- 간단한 CSV 파서 사용으로 인해 `reason` 필드에 콤마를 사용할 수 없습니다
- 콤마가 필요하면 외부 라이브러리(csv-parse) 도입 필요
- **운영 규칙**: reason에는 콤마 사용 금지

**CSV 파일 생성 예시:**
```bash
cat > transfers.csv << 'EOF'
token,from,to,reason
Wu34wbf5N7GycYkYQp99,minmi199942@gmail.com,sale_luxury@naver.com,고객 요청
ABC123,user1@email.com,user2@email.com,양도 요청
EOF
```

**주의**: reason에 "고객 요청, 급함" 같은 콤마 포함 텍스트는 사용할 수 없습니다.

### (2) 헤더 고정
```
token,from,to,reason
```
이 순서를 고정해두면 실수 줄어듭니다.

**중복 토큰 체크**: 같은 배치에서 같은 토큰을 여러 번 양도할 수 없습니다 (자동 차단).

### (3) 배치도 dry-run → 실행 2단계로 습관화
```bash
cd /var/www/html/backend

# 1. 미리보기
npm run admin -- warranty:transfer-batch --file=transfers.csv --dry-run

# 2. 실제 실행
npm run admin -- warranty:transfer-batch --file=transfers.csv
```

---

## 4. "너무 복잡하다"를 완전히 끝내는 한 줄 개선

### (1) package.json에 스크립트 추가 (완료)
```json
"scripts": {
  "admin": "node admin-cli.js"
}
```

**사용법:**
```bash
npm run admin -- token:search --term=minmi199942@gmail.com
npm run admin -- warranty:transfer --token=... --from=... --to=...
```

### (2) 또는 bash alias
```bash
# ~/.bashrc 또는 ~/.bash_profile에 추가
alias ppadmin='cd /var/www/html/backend && node admin-cli.js'
```

**사용법:**
```bash
ppadmin token:search --term=minmi199942@gmail.com
ppadmin warranty:transfer --token=... --from=... --to=...
```

---

## 5. 사용 가능한 명령어

### 토큰 조회/검색
```bash
cd /var/www/html/backend

# 단일 토큰 조회
npm run admin -- token:lookup --token=TOKEN

# 검색 (토큰, 제품명, 내부코드, 이메일)
npm run admin -- token:search --term=검색어
```

### 보증서 양도
```bash
# 단일 양도
node admin-cli.js warranty:transfer \
  --token=TOKEN \
  --from=현재소유주@email.com \
  --to=새소유주@email.com \
  --reason="양도 사유" \
  --dry-run

# 일괄 양도 (CSV)
node admin-cli.js warranty:transfer-batch \
  --file=transfers.csv \
  --dry-run
```

### 토큰 차단/해제
```bash
# 차단
node admin-cli.js token:block --token=TOKEN --reason="차단 사유" --dry-run

# 해제
node admin-cli.js token:unblock --token=TOKEN
```

### 보증서 삭제
```bash
node admin-cli.js warranty:delete --token=TOKEN --reason="삭제 사유" --dry-run
```

---

## 6. 주의사항

1. **항상 dry-run 먼저**: 위험한 작업은 `--dry-run`으로 미리 확인
2. **CSV 인코딩**: UTF-8로 저장 (한글 포함 시 중요)
3. **CSV reason 필드**: 콤마(,) 사용 금지 (간단한 파서 제한)
4. **ADMIN_EMAILS 필수**: `.env`에 반드시 설정 (없으면 CLI 에러)
5. **확인 프롬프트**: 자동화가 아닌 이상 `--yes` 사용 금지
6. **중복 토큰**: 같은 배치에서 같은 토큰을 여러 번 양도할 수 없음

---

## 7. 문제 해결

### "사용자를 찾을 수 없습니다" 오류
- 이메일 주소 확인
- 대소문자 구분 없음 (자동 소문자 변환)

### "토큰을 찾을 수 없습니다" 오류
- 토큰 정확히 입력했는지 확인
- `token:search`로 먼저 검색

### "소유주가 일치하지 않습니다" 오류
- `--from` 이메일이 현재 소유주와 일치하는지 확인
- `token:lookup`으로 현재 소유주 확인

---

## 8. 다음 단계 (선택사항)

운영이 안정화되면 다음 기능 추가 고려:
- 실행 결과 파일 로그 저장
- batch 결과 요약 리포트
- 중복 토큰 처리 방지

