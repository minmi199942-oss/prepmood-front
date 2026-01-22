# Phase 1 테스트 가이드

## 📋 테스트 목표

Phase 1에서 수정한 4가지 핵심 기능이 정상 동작하는지 확인:

1. ✅ 세션 교환 엔드포인트: Claim 완료 주문도 접근 가능
2. ✅ optionalAuth 미들웨어: JWT 쿠키 존재 시 검증 실패하면 즉시 401
3. ✅ Claim API 멱등성: UPDATE-first 패턴, 같은 사용자 재요청 시 200 OK
4. ✅ 토큰 발급: 회원 주문에도 토큰 생성, 이메일 발송 직전 최신 토큰 재조회

---

## 🚀 테스트 전 준비

### 1. 코드 배포 확인

```bash
# VPS에서 최신 코드 확인
cd /var/www/html/backend
git pull origin main
pm2 restart prepmood-backend

# 로그 확인
pm2 logs prepmood-backend --lines 50
```

### 2. 테스트 데이터 확인

```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/test_phase1_order_detail.sql
```

또는 MySQL에 직접 접속하여 테스트 데이터 확인:

```sql
-- Claim 완료된 주문의 토큰 확인
SELECT 
    got.token_id,
    got.order_id,
    got.token,
    got.expires_at,
    got.revoked_at,
    o.order_number,
    o.user_id,
    CASE 
        WHEN got.expires_at < NOW() THEN '만료됨'
        WHEN got.revoked_at IS NOT NULL THEN '회수됨'
        WHEN o.user_id IS NOT NULL THEN 'Claim 완료 (이제 접근 가능해야 함)'
        ELSE '정상'
    END AS status
FROM guest_order_access_tokens got
INNER JOIN orders o ON got.order_id = o.order_id
WHERE got.revoked_at IS NULL
ORDER BY got.created_at DESC
LIMIT 5;
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 세션 교환 엔드포인트 - Claim 완료 주문 접근

**목표**: Claim 완료된 주문도 이메일 링크로 접근 가능한지 확인

**준비**:
1. Claim 완료된 주문의 `guest_order_access_token` 확인 (위 SQL로 확인)
2. 토큰이 유효한지 확인 (`expires_at > NOW()`, `revoked_at IS NULL`)

**테스트 방법 1: curl**

```bash
# 실제 토큰으로 변경
TOKEN="your_valid_token_here"

# 세션 교환 요청
curl -v "https://prepmood.kr/api/guest/orders/session?token=${TOKEN}"

# 예상 결과:
# - 이전: 410 에러 (ORDER_CLAIMED)
# - 수정 후: 302 Redirect (Location: /guest/orders.html?order=ORD-...)
```

**테스트 방법 2: 브라우저**

1. 이메일에서 받은 링크 클릭 (Claim 완료된 주문)
2. 또는 직접 URL 입력: `https://prepmood.kr/api/guest/orders/session?token=xxx`
3. 예상 결과: 주문 상세 페이지로 리다이렉트 (이전에는 에러 페이지)

**확인 사항**:
- [ ] HTTP 302 Redirect (이전에는 410 에러)
- [ ] Location 헤더에 `/guest/orders.html?order=ORD-...` 포함
- [ ] `guest_session_token` 쿠키 설정됨

---

### 시나리오 2: optionalAuth 미들웨어 - JWT 검증 실패 시 401

**목표**: JWT 쿠키가 있으면 검증 실패 시 즉시 401 반환하는지 확인

**준비**:
1. 만료된 JWT 토큰 또는 잘못된 JWT 토큰 준비
2. 또는 브라우저 개발자 도구에서 `accessToken` 쿠키를 임의의 값으로 변경

**테스트 방법 1: curl**

```bash
# 만료된/잘못된 JWT 토큰
INVALID_JWT="expired_or_invalid_token"

# optionalAuth를 사용하는 엔드포인트 호출 (예: /api/auth/status)
curl -v "https://prepmood.kr/api/auth/status" \
  -H "Cookie: accessToken=${INVALID_JWT}"

# 예상 결과:
# - 이전: 200 OK, authenticated: false (세션으로 폴백)
# - 수정 후: 401 에러, code: AUTH_FAILED
```

**테스트 방법 2: 브라우저 개발자 도구**

1. 브라우저에서 로그인
2. 개발자 도구(F12) → Application → Cookies → `accessToken` 값을 임의의 값으로 변경
3. 페이지 새로고침 또는 API 호출
4. 예상 결과: 401 에러 (이전에는 세션으로 폴백되어 정상 동작)

**확인 사항**:
- [ ] HTTP 401 응답
- [ ] `success: false`, `code: AUTH_FAILED`
- [ ] 세션 쿠키가 있어도 무시됨

---

### 시나리오 3: Claim API 멱등성 - 같은 사용자 재요청

**목표**: 같은 사용자가 Claim을 재요청하면 200 OK (멱등)인지 확인

**준비**:
1. Claim 완료된 주문 확인 (`orders.user_id IS NOT NULL`)
2. 해당 주문을 Claim한 사용자의 JWT 토큰 준비

**테스트 방법 1: curl**

```bash
# 실제 값으로 변경
ORDER_ID=1
CLAIM_TOKEN="valid_claim_token"  # 실제로는 사용되지 않음 (이미 Claim됨)
JWT_TOKEN="your_jwt_token_here"

# Claim API 호출 (이미 Claim된 주문)
curl -X POST "https://prepmood.kr/api/orders/${ORDER_ID}/claim" \
  -H "Content-Type: application/json" \
  -H "Cookie: accessToken=${JWT_TOKEN}" \
  -d "{\"claim_token\": \"${CLAIM_TOKEN}\"}"

# 예상 결과:
# - 이전: 400 에러 (이미 회원 계정에 연동된 주문입니다)
# - 수정 후: 200 OK, already_claimed: true
```

**테스트 방법 2: 다른 사용자로 요청**

```bash
# 다른 사용자의 JWT 토큰
OTHER_USER_JWT="other_user_jwt_token"

curl -X POST "https://prepmood.kr/api/orders/${ORDER_ID}/claim" \
  -H "Content-Type: application/json" \
  -H "Cookie: accessToken=${OTHER_USER_JWT}" \
  -d "{\"claim_token\": \"${CLAIM_TOKEN}\"}"

# 예상 결과: 409 Conflict, code: ALREADY_CLAIMED_BY_OTHER
```

**확인 사항**:
- [ ] 같은 사용자 재요청: 200 OK, `already_claimed: true`
- [ ] 다른 사용자 요청: 409 Conflict
- [ ] UPDATE-first 패턴으로 경합 안전

---

### 시나리오 4: 토큰 발급 - 회원 주문에도 토큰 생성

**목표**: 회원 주문 결제 완료 후에도 토큰이 생성되는지 확인

**준비**:
1. 회원으로 로그인
2. 주문 생성 및 결제 완료

**테스트 방법: DB 확인**

```sql
-- 결제 완료 후 실행
SELECT 
    got.token_id,
    got.order_id,
    got.token,
    got.created_at,
    o.order_number,
    o.user_id,
    o.guest_id,
    CASE 
        WHEN o.user_id IS NOT NULL THEN '회원 주문 (토큰 생성됨 ✅)'
        WHEN o.guest_id IS NOT NULL THEN '비회원 주문'
        ELSE '알 수 없음'
    END AS order_type
FROM guest_order_access_tokens got
INNER JOIN orders o ON got.order_id = o.order_id
WHERE o.order_number = 'ORD-2025-XXXX-XXX'  -- 실제 주문번호로 변경
ORDER BY got.created_at DESC;
```

**확인 사항**:
- [ ] 회원 주문에도 토큰 생성됨
- [ ] 비회원 주문에도 토큰 생성됨
- [ ] 이메일 발송 직전 최신 토큰 재조회 확인 (로그 확인)

---

### 시나리오 5: 중복 confirm/webhook - 최신 토큰만 이메일에 포함

**목표**: 중복 결제 confirm/webhook에서도 최신 토큰만 이메일에 포함되는지 확인

**준비**:
1. 동일 주문에 대해 결제 confirm이 중복 호출되는 상황 시뮬레이션
2. 또는 실제로 중복 호출 발생 시 확인

**테스트 방법: 로그 확인**

```bash
# PM2 로그에서 확인
pm2 logs prepmood-backend --lines 100 | grep "PAID_PROCESSOR"

# 확인할 로그:
# - "기존 토큰 재사용" 또는 "새 토큰 생성"
# - "이메일 발송용 최신 토큰 선정"
```

**DB 확인**:

```sql
-- 주문당 토큰 개수 확인
SELECT 
    order_id,
    COUNT(*) as token_count,
    MAX(created_at) as latest_token_created_at,
    MIN(created_at) as earliest_token_created_at
FROM guest_order_access_tokens
WHERE order_id = ?  -- 실제 주문 ID로 변경
  AND expires_at > NOW()
  AND revoked_at IS NULL
GROUP BY order_id;

-- 이메일 발송용 최신 토큰 확인
SELECT 
    token,
    created_at
FROM guest_order_access_tokens
WHERE order_id = ?  -- 실제 주문 ID로 변경
  AND expires_at > NOW()
  AND revoked_at IS NULL
ORDER BY created_at DESC
LIMIT 1;
```

**확인 사항**:
- [ ] 중복 호출 시 여러 토큰이 생성될 수 있음 (레이스 조건)
- [ ] 이메일 발송 직전 최신 토큰 재조회 로그 확인
- [ ] 이메일에 포함된 토큰이 최신 토큰임을 확인

---

## 📊 테스트 체크리스트

### 세션 교환 엔드포인트
- [ ] Claim 완료 주문도 302 Redirect (이전에는 410 에러)
- [ ] 토큰 만료 시 410 에러
- [ ] 토큰 회수 시 410 에러
- [ ] 토큰 없음 시 400 에러

### optionalAuth 미들웨어
- [ ] JWT 유효 + 권한 있음 → 200 OK
- [ ] JWT 무효 → 401 에러 (세션 폴백 없음)
- [ ] JWT 없음 → 200 OK, authenticated: false

### Claim API 멱등성
- [ ] Claim 전 주문 → 성공
- [ ] 같은 사용자 재요청 → 200 OK, already_claimed: true
- [ ] 다른 사용자 요청 → 409 Conflict
- [ ] 동시 Claim 요청 → 경합 안전 (1개만 성공)

### 토큰 발급
- [ ] 회원 주문에도 토큰 생성
- [ ] 비회원 주문에도 토큰 생성
- [ ] 중복 confirm/webhook → 최신 토큰만 이메일에 포함
- [ ] 이메일 발송 직전 최신 토큰 재조회 로그 확인

---

## 🔍 문제 발생 시 확인 사항

### 세션 교환 실패
1. 토큰이 정말 유효한지 확인 (`expires_at`, `revoked_at`)
2. `orders.user_id IS NOT NULL` 차단 로직이 제거되었는지 확인
3. 로그 확인: `pm2 logs prepmood-backend | grep "GUEST_SESSION"`

### optionalAuth 문제
1. JWT 토큰이 정말 만료/깨진 상태인지 확인
2. `auth-middleware.js`의 수정사항 확인
3. 로그 확인: `pm2 logs prepmood-backend | grep "선택적 인증"`

### Claim API 문제
1. `UPDATE ... WHERE user_id IS NULL` 패턴이 사용되는지 확인
2. `affectedRows === 0`일 때 SELECT로 재확인하는지 확인
3. 로그 확인: `pm2 logs prepmood-backend | grep "CLAIM"`

### 토큰 발급 문제
1. 회원 주문에도 토큰 생성 로직이 실행되는지 확인
2. 이메일 발송 직전 최신 토큰 재조회 로직이 실행되는지 확인
3. 로그 확인: `pm2 logs prepmood-backend | grep "PAID_PROCESSOR"`

---

## 📝 테스트 결과 기록

테스트 완료 후 다음 정보를 기록하세요:

- 테스트 일시: 
- 테스트 환경: (로컬/VPS)
- 테스트 결과: (성공/실패)
- 발견된 문제: 
- 해결 방법: 
