# 최종 운영 체크리스트

## ✅ 교정 1: transfer_logs.admin_user_id 정책

### 정책 결정: 정책 A (NOT NULL 유지 + ADMIN_EMAILS 필수)

**구현 상태:**
- ✅ `ADMIN_EMAILS`가 비어있으면 CLI가 에러로 중단
- ✅ `admin_user_id`는 항상 관리자 ID 기록 (NULL 불가)
- ✅ `transferWarranty`, `deleteWarranty` 함수에 적용

**확인 방법:**
```bash
cd /var/www/html/backend
grep ADMIN_EMAILS .env
# 출력: ADMIN_EMAILS=dmsals0603@naver.com

# ADMIN_EMAILS 없으면 에러 테스트
npm run admin -- warranty:transfer --token=TEST --from=test@test.com --to=test2@test.com
# 예상 출력: ❌ ADMIN_EMAILS가 .env에 설정되지 않았습니다.
```

---

## ✅ 교정 2: batch CSV 규칙

### 구현 완료 사항:

1. **UTF-8 BOM 제거** ✅
   - 파일 시작 부분 `\ufeff` 자동 제거
   - 헤더 첫 컬럼 BOM 제거

2. **CRLF 정규화** ✅
   - Windows 줄바꿈 (`\r\n`) → LF (`\n`) 변환
   - Mac 줄바꿈 (`\r`) → LF (`\n`) 변환

3. **reason 콤마 검증** ✅
   - reason 필드에 콤마 포함 시 에러 발생
   - 운영 규칙: reason에는 콤마 사용 금지

4. **중복 토큰 체크** ✅
   - parseCSV에서 체크
   - transferBatch에서 이중 확인

**CSV 규칙:**
```
헤더: token,from,to,reason
- token: 필수, 중복 불가
- from: 필수 (현재 소유주 이메일)
- to: 필수 (새 소유주 이메일)
- reason: 선택, 콤마(,) 사용 금지
```

**테스트:**
```bash
cd /var/www/html/backend

# 올바른 CSV 예시
cat > test.csv << 'EOF'
token,from,to,reason
ABC123,user1@test.com,user2@test.com,고객 요청
EOF

# BOM 포함 CSV 테스트 (자동 제거됨)
# CRLF 포함 CSV 테스트 (자동 정규화됨)
# reason 콤마 포함 CSV 테스트 (에러 발생)
```

---

## ✅ 교정 3: 실행 위치 통일

### 표준 실행 방법:

**모든 예시는 `/var/www/html/backend` 기준으로 통일:**

```bash
cd /var/www/html/backend
npm run admin -- [명령어]
```

**문서 업데이트:**
- ✅ 모든 예시에 `cd /var/www/html/backend` 추가
- ✅ `node admin-cli.js` → `npm run admin --` 통일

---

## ✅ 실수 방지 안전장치

### 1. 중복 토큰 체크 ✅

**구현 위치:**
- `parseCSV`: CSV 파싱 시 중복 체크
- `transferBatch`: 배치 실행 전 이중 확인

**동작:**
- 같은 배치에서 같은 토큰이 여러 번 등장하면 즉시 중단
- 에러 메시지에 중복된 행 번호 표시

### 2. dry-run affectedRows 출력 ✅

**구현 위치:**
- `transferWarranty`: dry-run 모드에 예상 affectedRows 출력
- `transferBatch`: 각 행별 예상 affectedRows 출력
- `deleteWarranty`: dry-run 모드에 예상 affectedRows 출력

**출력 예시:**
```
🔍 [DRY-RUN] 다음 작업이 실행될 예정입니다:
   1. warranties.user_id: 2 → 5 (예상 affectedRows: 1)
   2. token_master.owner_user_id: 2 → 5 (예상 affectedRows: 1)
   3. transfer_logs 기록 추가 (예상: 1건)

💡 참고: affectedRows가 0이면 소유주가 일치하지 않거나 이미 변경되었을 수 있습니다.
```

### 3. 실제 실행 affectedRows 출력 ✅

**구현 위치:**
- `transferWarranty`: 실행 후 affectedRows 출력
- `deleteWarranty`: 실행 후 affectedRows 출력

**출력 예시:**
```
✅ 업데이트 완료:
   warranties.affectedRows: 1
   token_master.affectedRows: 1
```

---

## 최종 운영 준비 상태

### ✅ 완료된 항목

1. **정책 A 선택**: NOT NULL 유지 + ADMIN_EMAILS 필수
2. **CSV 파서 개선**: BOM/CRLF/reason 콤마 처리
3. **실행 위치 통일**: `/var/www/html/backend` 기준
4. **안전장치**: 중복 토큰 체크, affectedRows 출력

### 📋 VPS에서 실행 전 확인

```bash
# 1. 파일 위치 확인
cd /var/www/html/backend
ls -la admin-cli.js

# 2. 의존성 확인
npm list commander mysql2 dotenv

# 3. .env 확인 (ADMIN_EMAILS 필수)
grep ADMIN_EMAILS .env

# 4. 테스트 실행
npm run admin -- token:lookup --token=Wu34wbf5N7GycYkYQp99
```

---

## 운영 정책 요약

### transfer_logs.admin_user_id
- **정책**: NOT NULL 유지
- **요구사항**: `.env`에 `ADMIN_EMAILS` 필수 설정
- **동작**: `ADMIN_EMAILS` 없으면 CLI 에러로 중단

### CSV 규칙
- **인코딩**: UTF-8 (BOM 자동 제거)
- **줄바꿈**: CRLF/LF 자동 정규화
- **reason 필드**: 콤마(,) 사용 금지
- **중복 토큰**: 배치 내 중복 불가

### 실행 위치
- **표준**: `/var/www/html/backend`
- **명령어**: `npm run admin -- [명령어]`

---

## 결론

**모든 교정 사항이 반영되었습니다.**

- ✅ 정책 A 선택 및 구현
- ✅ CSV 파서 개선 (BOM/CRLF/reason)
- ✅ 실행 위치 통일
- ✅ 실수 방지 안전장치 (중복 체크, affectedRows 출력)

**수천 개 토큰 운영에 사용 가능합니다.**
