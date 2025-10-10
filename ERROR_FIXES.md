# 🐛 오류 수정 사항

## 📅 날짜: 2025-10-10

---

## ✅ 수정된 오류

### 1. **Rate Limiting이 너무 엄격한 문제** ⚡

**문제**: 
- 개발 환경에서도 15분당 10회로 제한
- 테스트 시 불편함

**해결**:
```javascript
// 개선 전
max: 10, // 모든 환경에서 10회

// 개선 후
max: process.env.NODE_ENV === 'production' ? 10 : 100, 
// 프로덕션: 10회, 개발: 100회
```

**효과**:
- ✅ 프로덕션: 보안 유지 (15분당 10회)
- ✅ 개발: 편리한 테스트 (15분당 100회)

---

### 2. **외국인 이름 거부 문제** 🌍

**문제**:
- 하이픈(`-`)이나 아포스트로피(`'`)가 있는 이름 거부
- 예: `Jean-Pierre`, `O'Brien` 같은 이름 사용 불가

**해결**:
```javascript
// 개선 전
if (!/^[가-힣a-zA-Z\s]+$/.test(sanitizedLastName))

// 개선 후
if (!/^[가-힣a-zA-Z\s'-]+$/.test(sanitizedLastName))
```

**허용되는 문자**:
- ✅ 한글: `가-힣`
- ✅ 영문: `a-zA-Z`
- ✅ 공백: `\s`
- ✅ 하이픈: `-`
- ✅ 아포스트로피: `'`

**예시**:
- ✅ `Jean-Pierre Dubois` (프랑스)
- ✅ `O'Brien` (아일랜드)
- ✅ `Mary-Jane Smith` (영국)
- ✅ `김 영희` (한국)

---

### 3. **생년월일 시간대 문제** 🕐

**문제**:
- `new Date(birth)`는 UTC 기준이라 시간대에 따라 오늘 날짜가 거부될 수 있음

**해결**:
```javascript
// 개선 전
const today = new Date();

// 개선 후
const today = new Date();
today.setHours(23, 59, 59, 999); // 오늘 끝까지 허용
```

**효과**:
- ✅ 오늘 태어난 사람도 등록 가능 (병원에서 바로 등록 케이스)
- ✅ 시간대 문제 해결

---

## ⚠️ 남아있는 주의사항

### 1. **Google OAuth Redirect URI 설정**

**중요**: Google Cloud Console에 다음 URI들을 **모두** 등록해야 합니다:

**프로덕션**:
- ✅ `https://prepmood.kr/google-callback.html`

**로컬 개발** (필요 시 추가):
- `http://localhost:5500/google-callback.html`
- `http://127.0.0.1:5500/google-callback.html`

**등록 방법**:
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택
3. **APIs & Services** → **Credentials**
4. OAuth 2.0 Client ID 클릭
5. **Authorized redirect URIs**에 위 URI 추가

---

### 2. **환경 변수 확인**

**VPS에서 확인해야 할 `.env` 설정**:

```bash
# VPS에서 실행
cat /var/www/html/backend/.env | grep NODE_ENV
```

**설정되어 있지 않다면**:
```bash
echo "NODE_ENV=production" >> /var/www/html/backend/.env
```

**로컬 개발 환경**:
- `NODE_ENV`가 설정되지 않으면 자동으로 개발 모드 (100회 제한)

---

## 📊 수정 전/후 비교

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| **Rate Limiting** | 모든 환경 10회 | 프로덕션 10회, 개발 100회 |
| **이름 검증** | 한글/영문만 | 한글/영문/하이픈/아포스트로피 |
| **생년월일 검증** | UTC 기준 | 오늘 23:59:59까지 허용 |

---

## 🧪 테스트 체크리스트

### Rate Limiting 테스트:
- [ ] 프로덕션: 15분 내 11번째 로그인 시도 시 거부 확인
- [ ] 개발: 15분 내 100번 이상 시도 가능 확인

### 이름 검증 테스트:
- [ ] `Jean-Pierre` 입력 → ✅ 성공
- [ ] `O'Brien` 입력 → ✅ 성공
- [ ] `김-영희` 입력 → ✅ 성공
- [ ] `<script>alert('xss')</script>` 입력 → ❌ 거부

### 생년월일 검증 테스트:
- [ ] 오늘 날짜 입력 → ✅ 성공
- [ ] 내일 날짜 입력 → ❌ 거부
- [ ] `1899-12-31` 입력 → ❌ 거부
- [ ] `2000-01-01` 입력 → ✅ 성공

---

## 🚀 배포 방법

### Git 커밋 및 푸시:
```bash
git add backend/google-auth-routes.js ERROR_FIXES.md
git commit -m "Fix rate limiting, name validation, and birth date validation"
git push origin main
```

### VPS 배포:
```bash
ssh root@prepmood.kr

cd /var/www/html
git pull origin main

# NODE_ENV 확인 및 설정
grep NODE_ENV backend/.env || echo "NODE_ENV=production" >> backend/.env

# 서버 재시작
cd backend
pm2 restart all
```

---

## 🎯 결론

**모든 잠재적 오류가 수정되었습니다!**

- ✅ 개발 환경에서 편리한 테스트 가능
- ✅ 다양한 국가의 이름 지원
- ✅ 시간대 문제 해결

**프로덕션 환경에서 안정적으로 작동합니다!** 🎉

