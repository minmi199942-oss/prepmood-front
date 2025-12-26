# QR 인증 시스템 보안 및 구조 검토 보고서

## ✅ 잘 구현된 부분

1. **SQL Injection 방지**: `better-sqlite3`의 prepared statement 사용 ✅
2. **토큰 생성**: `crypto.randomBytes` 사용 (암호학적으로 안전) ✅
3. **에러 처리**: try-catch로 예외 처리 ✅
4. **로깅**: 모든 인증 요청 로깅 ✅
5. **DB 트랜잭션**: 일괄 삽입 시 트랜잭션 사용 ✅

---

## ⚠️ 보안 문제점

### 1. **토큰 생성 편향 (Bias) 문제** 🔴 중요
**위치**: `backend/init-auth-db.js:33-45`

**문제**:
```javascript
token += chars[randomBytes[i] % chars.length];
```
- `%` 연산으로 인해 일부 문자 선택 확률이 높아짐
- 62개 문자 중 일부가 더 자주 선택될 수 있음

**해결책**:
```javascript
function generateToken() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let token = '';
    
    for (let i = 0; i < 20; i++) {
        // crypto.randomInt 사용 (Node.js 14.10.0+)
        const randomIndex = crypto.randomInt(0, chars.length);
        token += chars[randomIndex];
    }
    
    return token;
}
```

### 2. **토큰 중복 체크 없음** 🟡 중요
**위치**: `backend/init-auth-db.js:114-117`

**문제**:
- 같은 토큰이 생성될 가능성 (비록 낮지만)
- DB에 중복 토큰 삽입 시도 시 에러 발생 가능

**해결책**:
```javascript
// 토큰 생성 시 중복 체크
function generateUniqueToken(existingTokens) {
    let token;
    do {
        token = generateToken();
    } while (existingTokens.has(token));
    existingTokens.add(token);
    return token;
}
```

### 3. **Rate Limiting 없음** 🔴 중요
**위치**: `backend/auth-routes.js:27`

**문제**:
- `/a/:token` 라우트에 rate limiting이 없음
- 무차별 대입 공격(Brute Force) 가능
- 토큰 추측 공격 가능

**해결책**:
```javascript
// auth-routes.js에 추가
const { rateLimit } = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 15분당 최대 100회
    message: '너무 많은 인증 요청입니다. 잠시 후 다시 시도해주세요.'
});

router.get('/a/:token', authLimiter, async (req, res) => {
    // ...
});
```

### 4. **토큰 입력 검증 없음** 🟡 중요
**위치**: `backend/auth-routes.js:28`

**문제**:
- 토큰 길이/형식 검증 없음
- 이상한 입력값 처리 안 됨

**해결책**:
```javascript
router.get('/a/:token', authLimiter, async (req, res) => {
    const token = req.params.token;
    
    // 토큰 형식 검증 (20자, 영숫자만)
    if (!/^[a-zA-Z0-9]{20}$/.test(token)) {
        Logger.warn('[AUTH] 잘못된 토큰 형식:', token);
        return res.render('fake', {
            title: '가품 경고 - Pre.p Mood'
        });
    }
    
    // ...
});
```

### 5. **민감 정보 로깅** 🟡 보통
**위치**: `backend/auth-routes.js:31`

**문제**:
- 모든 토큰이 로그에 남음
- 로그 파일이 유출되면 모든 토큰 노출

**해결책**:
```javascript
// 토큰 일부만 로깅
Logger.log('[AUTH] 정품 인증 요청:', token.substring(0, 4) + '...');
```

---

## ⚠️ 구조적 문제점

### 6. **에러 페이지 없음** 🟡 보통
**위치**: `backend/auth-routes.js:78`

**문제**:
- `error.ejs` 파일이 없음
- 에러 발생 시 500 에러 페이지가 제대로 렌더링 안 될 수 있음

**해결책**: `backend/views/error.ejs` 파일 생성 필요

### 7. **DB 백업 메커니즘 없음** 🟡 보통
**문제**:
- `prep.db` 파일 자동 백업 없음
- 데이터 손실 시 복구 불가능

**해결책**: 주기적 백업 스크립트 추가

### 8. **관리자 기능 부족** 🟢 낮음
**문제**:
- 관리자 페이지에서 인증 기록 확인 불가
- 통계/모니터링 기능 없음

**해결책**: 관리자 페이지에 인증 통계 추가

---

## 📋 권장 개선 사항

### 우선순위 1 (즉시 수정)
1. ✅ Rate Limiting 추가
2. ✅ 토큰 생성 편향 수정
3. ✅ 토큰 입력 검증 추가

### 우선순위 2 (빠른 시일 내)
4. ✅ 토큰 중복 체크
5. ✅ 에러 페이지 생성
6. ✅ 민감 정보 로깅 개선

### 우선순위 3 (여유 있을 때)
7. ✅ DB 백업 스크립트
8. ✅ 관리자 통계 페이지

---

## 🔒 보안 체크리스트

- [x] SQL Injection 방지 (prepared statement)
- [ ] Rate Limiting 적용
- [ ] 토큰 생성 편향 제거
- [ ] 토큰 중복 체크
- [ ] 입력 검증
- [ ] 민감 정보 로깅 최소화
- [ ] 에러 페이지 구현
- [ ] DB 백업 메커니즘

---

## 📝 결론

**전체 평가**: 기본적인 보안은 구현되어 있으나, 몇 가지 중요한 보안 취약점이 있습니다.

**즉시 수정 필요**:
1. Rate Limiting 추가 (무차별 대입 공격 방지)
2. 토큰 생성 편향 수정 (보안 강화)
3. 토큰 입력 검증 (잘못된 입력 방지)

이 3가지만 수정해도 보안이 크게 향상됩니다.

