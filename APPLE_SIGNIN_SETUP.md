# 🍎 Apple Sign In 설정 가이드

## 📅 날짜: 2025-10-10

---

## ⚠️ 중요: Apple Developer 계정 필요

Apple Sign In을 사용하려면 **Apple Developer Program** 멤버십이 필요합니다.
- 비용: **$99/년**
- 가입: https://developer.apple.com/programs/

---

## 🔧 1단계: App ID 생성

### 1. Apple Developer Console 접속
https://developer.apple.com/account/resources/identifiers/list

### 2. App ID 생성
1. **+** 버튼 클릭
2. **App IDs** 선택 → Continue
3. **Type**: App 선택
4. **Description**: `Pre.pMood Web App`
5. **Bundle ID**: `kr.prepmood.webapp` (Explicit)
6. **Capabilities**: "Sign In with Apple" 체크 ✅
7. **Save** 클릭

---

## 🔧 2단계: Services ID 생성 (웹 앱용)

### 1. Identifiers 페이지에서
1. **+** 버튼 클릭
2. **Services IDs** 선택 → Continue
3. **Description**: `Pre.pMood Web Sign In`
4. **Identifier**: `kr.prepmood.webapp.signin`
5. **Sign In with Apple** 체크 ✅
6. **Configure** 클릭

### 2. Web Authentication Configuration
1. **Primary App ID**: 위에서 생성한 App ID 선택 (`kr.prepmood.webapp`)
2. **Website URLs** 추가:
   - **Domains and Subdomains**: `prepmood.kr`
   - **Return URLs**: 
     - `https://prepmood.kr/apple-callback.html`
     - `https://prepmood.kr/auth/apple/callback` (백엔드 콜백)
3. **Save** → **Continue** → **Register**

---

## 🔧 3단계: Sign In with Apple Key 생성

### 1. Keys 페이지 접속
https://developer.apple.com/account/resources/authkeys/list

### 2. Key 생성
1. **+** 버튼 클릭
2. **Key Name**: `Pre.pMood Sign In Key`
3. **Sign In with Apple** 체크 ✅
4. **Configure** 클릭
5. **Primary App ID**: `kr.prepmood.webapp` 선택
6. **Save** → **Continue** → **Register**
7. **Download** 버튼 클릭 → `.p8` 파일 다운로드 ⚠️ **한 번만 다운로드 가능!**

### 3. 중요 정보 기록
다운로드 후 다음 정보를 기록하세요:
- **Key ID**: (예: `ABC123DEFG`) - Keys 페이지에서 확인
- **Team ID**: (예: `DEF456GHIJ`) - 우측 상단에서 확인
- **Key 파일**: `AuthKey_ABC123DEFG.p8` - 안전한 곳에 보관

---

## 📝 4단계: 환경 변수 설정

### `.env` 파일에 추가할 내용:

```env
# Apple Sign In 설정
APPLE_CLIENT_ID=kr.prepmood.webapp.signin
APPLE_TEAM_ID=YOUR_TEAM_ID_HERE
APPLE_KEY_ID=YOUR_KEY_ID_HERE
APPLE_PRIVATE_KEY_PATH=/path/to/AuthKey_ABC123DEFG.p8
# 또는 key 내용을 직접 (프로덕션 권장)
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----"
APPLE_REDIRECT_URI=https://prepmood.kr/auth/apple/callback
```

---

## 🔑 Private Key 처리 방법

### 방법 1: 파일로 관리 (개발용)
```env
APPLE_PRIVATE_KEY_PATH=/var/www/html/backend/AuthKey_ABC123DEFG.p8
```

### 방법 2: 환경 변수로 관리 (프로덕션 권장)
1. `.p8` 파일 내용을 복사
2. 줄바꿈을 `\n`으로 변경
3. `.env` 파일에 직접 입력

```bash
# VPS에서 실행
cat AuthKey_ABC123DEFG.p8 | sed 's/$/\\n/g' | tr -d '\n'
```

---

## ⚠️ 보안 주의사항

### 1. Private Key 보안
- ⚠️ **절대 Git에 커밋하지 마세요!**
- `.gitignore`에 추가:
  ```
  *.p8
  backend/.env
  ```

### 2. Key 파일 권한 설정 (VPS)
```bash
chmod 600 /var/www/html/backend/AuthKey_ABC123DEFG.p8
chown www-data:www-data /var/www/html/backend/AuthKey_ABC123DEFG.p8
```

---

## 🧪 테스트용 설정 (로컬 개발)

로컬에서 테스트하려면:

### 1. 도메인 등록 (개발용)
Apple은 `localhost`를 지원하지 않으므로:
- **ngrok** 사용: `https://your-app.ngrok.io`
- **로컬 도메인**: `/etc/hosts` 수정 (하지만 Apple은 실제 도메인 필요)

### 2. Return URL 추가
Services ID의 Return URLs에 추가:
- `https://your-app.ngrok.io/apple-callback.html`

⚠️ **권장**: 프로덕션 서버에서만 테스트

---

## 📊 설정 체크리스트

- [ ] Apple Developer Program 가입 ($99/년)
- [ ] App ID 생성 (`kr.prepmood.webapp`)
- [ ] Services ID 생성 (`kr.prepmood.webapp.signin`)
- [ ] Return URLs 설정 (`https://prepmood.kr/apple-callback.html`)
- [ ] Sign In Key 생성 및 다운로드 (`.p8` 파일)
- [ ] Key ID, Team ID 기록
- [ ] `.p8` 파일을 VPS에 안전하게 업로드
- [ ] `.env` 파일에 환경 변수 추가
- [ ] `.gitignore`에 `.p8` 추가

---

## 🚀 다음 단계

설정이 완료되면:
1. `backend/apple-auth.js` 생성
2. `backend/apple-auth-routes.js` 생성
3. `login.html`에 Apple Sign In 버튼 통합
4. 테스트 및 배포

---

## 💡 참고 자료

- [Apple Sign In Documentation](https://developer.apple.com/documentation/sign_in_with_apple)
- [Sign In with Apple JS](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js)
- [REST API Guide](https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens)

---

## ⚠️ 중요 참고사항

Apple Sign In은 Google보다 복잡합니다:
- ✅ **장점**: 높은 보안, 프라이버시 보호, "이메일 숨기기" 기능
- ⚠️ **단점**: 설정 복잡, 연간 비용, localhost 테스트 불가

**준비되셨으면 다음 단계로 진행하겠습니다!**

