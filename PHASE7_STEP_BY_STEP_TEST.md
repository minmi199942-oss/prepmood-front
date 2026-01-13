# Phase 7 테스트 - 단계별 가이드

## 🎯 테스트 목표
warranty가 없는 토큰으로 QR 스캔 시 404 에러가 나오는지 확인

---

## 📝 준비물
- ✅ 테스트용 토큰: `S2frizeUFcyIeWGiTXdi` (warranty 없음)
- ✅ 브라우저 (Chrome, Edge, Firefox 등)
- ✅ prepmood.kr 계정 (로그인 필요)

---

## 🚀 Step 1: 브라우저 열기

1. **브라우저 실행**
   - Chrome, Edge, Firefox 등 아무 브라우저나 실행

2. **개발자 도구 열기** (중요!)
   - **Windows**: `F12` 키 또는 `Ctrl + Shift + I`
   - **Mac**: `Cmd + Option + I`
   - 또는 브라우저 메뉴 → 개발자 도구

3. **Network 탭 열기**
   - 개발자 도구에서 **"Network"** 탭 클릭
   - 이 탭에서 서버 응답 코드를 확인할 수 있습니다

---

## 🔐 Step 2: 로그인하기

1. **로그인 페이지 접근**
   ```
   https://prepmood.kr/login.html
   ```
   - 주소창에 위 URL 입력 후 Enter

2. **로그인**
   - 이메일/비밀번호 입력 또는 Google 로그인
   - 로그인 완료 후 메인 페이지로 이동

3. **로그인 확인**
   - 페이지 상단에 사용자 이름이 표시되면 로그인 성공

---

## 🔍 Step 3: QR 스캔 URL 접근

1. **새 탭 열기** (또는 주소창 사용)
   - `Ctrl + T` (Windows) 또는 `Cmd + T` (Mac)

2. **QR 스캔 URL 입력**
   ```
   https://prepmood.kr/a/S2frizeUFcyIeWGiTXdi
   ```
   - 주소창에 위 URL 입력 후 Enter

3. **페이지 로딩 대기**
   - 페이지가 로드될 때까지 기다리기

---

## ✅ Step 4: 결과 확인

### 4-1. 화면에서 확인

**예상 결과**:
- ✅ 에러 페이지가 표시됨
- ✅ "보증서 없음" 또는 "이 제품의 보증서가 아직 발급되지 않았습니다" 메시지 표시

**실제로 보이는 것**:
- 에러 메시지가 있는 페이지
- 또는 "404" 에러 페이지

### 4-2. 개발자 도구에서 확인

1. **Network 탭 확인**
   - 개발자 도구의 Network 탭에서
   - `/a/S2frizeUFcyIeWGiTXdi` 요청 찾기
   - **Status** 컬럼 확인:
     - ✅ **404** → 정상 (warranty 없음)
     - ❌ **200** → 문제 (warranty가 생성되었거나 다른 페이지 표시)

2. **Response 탭 확인** (선택사항)
   - 해당 요청 클릭
   - **Response** 탭에서 서버 응답 확인

### 4-3. Console 탭 확인 (선택사항)

1. **Console 탭 열기**
   - 개발자 도구에서 **"Console"** 탭 클릭

2. **에러 메시지 확인**
   - 빨간색 에러 메시지가 있으면 확인
   - 하지만 404는 정상이므로 에러가 없어도 됨

---

## 📊 Step 5: VPS에서 데이터 확인

### 5-1. VPS 접속

```bash
# SSH로 VPS 접속
ssh root@prepmood.kr
# 또는 사용하는 SSH 클라이언트 사용
```

### 5-2. 서버 로그 확인

```bash
# 서버 로그 확인
pm2 logs prepmood-backend --lines 50 | grep -E "AUTH|warranty"
```

**확인할 로그**:
```
[AUTH] warranty 없음 (paid 처리 필요): { token_prefix: 'S2fr...', token_pk: 64 }
```

이 로그가 보이면 ✅ 정상 동작

### 5-3. 데이터베이스 확인

```bash
# MySQL 접속
mysql -u prepmood_user -p prepmood
# 비밀번호 입력
```

```sql
-- warranty가 생성되지 않았는지 확인
SELECT COUNT(*) as new_warranties
FROM warranties
WHERE token_pk = 64
  AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE);
```

**예상 결과**: `0` (새 warranty 생성 안 됨)

```sql
-- scan_logs 확인 (스캔 이력)
SELECT 
    token,
    user_id,
    warranty_public_id,
    event_type,
    created_at
FROM scan_logs
WHERE token = 'S2frizeUFcyIeWGiTXdi'
ORDER BY created_at DESC
LIMIT 1;
```

**예상 결과**: 스캔 이력이 기록됨 (warranty_public_id는 NULL)

---

## 📸 Step 6: 스크린샷 찍기 (선택사항)

테스트 결과를 기록하기 위해:
1. 에러 페이지 스크린샷
2. Network 탭 스크린샷 (404 응답)
3. 서버 로그 스크린샷

---

## ✅ 테스트 완료 체크리스트

- [ ] 브라우저에서 로그인 완료
- [ ] QR 스캔 URL 접근 (`/a/S2frizeUFcyIeWGiTXdi`)
- [ ] 404 에러 페이지 또는 에러 메시지 표시
- [ ] Network 탭에서 404 응답 코드 확인
- [ ] 서버 로그에 "warranty 없음" 메시지 확인
- [ ] warranty 테이블에 새 레코드 생성 안 됨 (COUNT = 0)
- [ ] scan_logs에 이벤트 기록됨

---

## 🐛 문제 해결

### 문제 1: 여전히 로그인 페이지로 리다이렉트됨

**원인**: 로그인이 안 되어 있음

**해결**:
1. 로그인 페이지에서 다시 로그인
2. 쿠키 확인 (개발자 도구 → Application → Cookies)
3. JWT 토큰 쿠키가 있는지 확인

### 문제 2: 200 OK 응답이 나옴

**원인**: 코드가 배포되지 않았거나 서버가 재시작되지 않음

**해결**:
```bash
# VPS에서
cd /var/www/html/backend
git pull
pm2 restart prepmood-backend
```

### 문제 3: warranty가 생성됨

**원인**: 코드 수정이 제대로 반영되지 않음

**해결**:
1. 코드 확인 (`backend/auth-routes.js`)
2. 서버 재시작
3. 다시 테스트

---

## 📝 테스트 결과 기록

테스트 후 아래 정보를 기록하세요:

```
테스트 날짜: 2026-01-XX
테스트 토큰: S2frizeUFcyIeWGiTXdi
응답 코드: 404
에러 메시지: "이 제품의 보증서가 아직 발급되지 않았습니다..."
warranty 생성 여부: ❌ 생성 안 됨
서버 로그: [AUTH] warranty 없음 (paid 처리 필요)
```

---

## 🎉 다음 단계

테스트가 성공하면:
1. 시나리오 1 테스트 (warranty 있는 경우)
2. 시나리오 3 테스트 (revoked 상태)
3. Phase 5 진행 (보증서 활성화 API)

---

**질문이 있으면 언제든지 물어보세요!** 😊
