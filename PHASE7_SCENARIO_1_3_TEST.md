# Phase 7 시나리오 1, 3 테스트 가이드

## 🎯 테스트 목표

- **시나리오 1**: warranty가 있는 경우 정상 조회 확인
- **시나리오 3**: revoked 상태 warranty 접근 거부 (403) 확인

---

## 📋 Step 1: 테스트 데이터 확인

### VPS에서 실행

```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/prepare_scenario_1_3_test.sql
```

### 결과 확인

**시나리오 1 (warranty 있음)**:
- warranty가 있는 토큰이 있으면 → 그 토큰 사용
- 없으면 → 테스트용 warranty 생성 필요

**시나리오 3 (revoked)**:
- revoked 상태 warranty가 있으면 → 그 토큰 사용
- 없으면 → 테스트용 revoked warranty 생성 필요

---

## 🔧 Step 2: 테스트 데이터 준비 (필요시)

### 시나리오 1: warranty가 없는 경우

**방법**: 실제 주문이 있다면 그 주문의 warranty 사용
- 또는 테스트용 주문 생성 후 warranty 확인

### 시나리오 3: revoked warranty 생성

**주의**: 실제 데이터를 변경하므로 테스트용 warranty만 변경

```sql
-- MySQL 접속
mysql -u prepmood_user -p prepmood

-- 1. 변경할 warranty 확인
SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    tm.token
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.status IN ('issued', 'issued_unassigned')
LIMIT 1;

-- 2. revoked로 변경 (위에서 확인한 warranty_id 사용)
-- 예시: warranty_id가 10인 경우
UPDATE warranties 
SET status = 'revoked', revoked_at = NOW()
WHERE id = 10 AND status IN ('issued', 'issued_unassigned');

-- 3. 변경 확인
SELECT 
    w.id,
    w.status,
    w.revoked_at,
    tm.token
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.id = 10;
```

---

## 🧪 Step 3: 시나리오 1 테스트 (warranty 있음)

### 준비
- warranty가 있는 토큰 확인 (Step 1에서 확인)
- 예시: `token = 'ABC123...'`

### 테스트

1. **브라우저에서 로그인**
   ```
   https://prepmood.kr/login.html
   ```

2. **QR 스캔 URL 접근**
   ```
   https://prepmood.kr/a/{TOKEN_WITH_WARRANTY}
   ```
   - 예시: `https://prepmood.kr/a/ABC123...`

3. **예상 결과**:
   - ✅ 200 OK
   - ✅ `success.html` 또는 `warning.html` 렌더링
   - ✅ warranty 정보 표시
   - ✅ warranty 생성 안 됨 (기존 warranty 조회만)

### 확인 사항

```sql
-- warranty가 새로 생성되지 않았는지 확인
SELECT COUNT(*) as new_warranties
FROM warranties
WHERE token_pk = ?
  AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE);
-- 결과: 0 (새 warranty 생성 안 됨)
```

---

## 🧪 Step 4: 시나리오 3 테스트 (revoked 상태)

### 준비
- revoked 상태 warranty 토큰 확인 (Step 2에서 생성)
- 예시: `token = 'XYZ789...'`

### 테스트

1. **브라우저에서 로그인**
   ```
   https://prepmood.kr/login.html
   ```

2. **QR 스캔 URL 접근**
   ```
   https://prepmood.kr/a/{TOKEN_REVOKED}
   ```
   - 예시: `https://prepmood.kr/a/XYZ789...`

3. **예상 결과**:
   - ✅ 403 Forbidden
   - ✅ `error.html` 렌더링
   - ✅ "이 보증서는 환불 처리되어 더 이상 유효하지 않습니다." 메시지

### 확인 사항

```sql
-- warranty 상태가 revoked인지 확인
SELECT status, revoked_at
FROM warranties
WHERE token_pk = ?;
-- 결과: status = 'revoked'
```

---

## 📊 Step 5: 서버 로그 확인

```bash
# VPS에서 실행
pm2 logs prepmood-backend --lines 50 | grep -E "AUTH|warranty"
```

**확인할 로그**:

**시나리오 1**:
- `[AUTH] 정품 인증 요청:` - 정상 조회

**시나리오 3**:
- `[AUTH] revoked 상태 보증서 접근 시도:` - revoked 접근 거부

---

## ✅ 테스트 완료 체크리스트

### 시나리오 1
- [ ] warranty 있는 토큰으로 접근
- [ ] 200 OK 응답
- [ ] warranty 정보 표시
- [ ] warranty 생성 안 됨

### 시나리오 3
- [ ] revoked 상태 warranty 토큰으로 접근
- [ ] 403 Forbidden 응답
- [ ] "보증서 무효" 메시지 표시
- [ ] warranty 상태 확인 (revoked)

---

## 🔄 테스트 후 원복 (선택사항)

테스트용으로 revoked로 변경한 warranty를 원래 상태로 되돌리려면:

```sql
-- 원래 상태로 복구 (issued 또는 issued_unassigned)
UPDATE warranties 
SET status = 'issued', revoked_at = NULL
WHERE id = ? AND status = 'revoked';
```

---

## 🐛 문제 해결

### 문제 1: warranty가 있는 토큰이 없음

**해결**: 
- 실제 주문이 있다면 그 주문의 warranty 사용
- 또는 테스트용 주문 생성

### 문제 2: revoked warranty 생성 실패

**원인**: warranty가 이미 revoked이거나 다른 상태

**해결**:
```sql
-- 현재 상태 확인
SELECT id, status FROM warranties WHERE id = ?;
```

### 문제 3: 403 에러가 안 나옴

**원인**: warranty 상태가 revoked가 아님

**해결**:
```sql
-- 상태 확인
SELECT status FROM warranties WHERE token_pk = ?;
```

---

**질문이 있으면 언제든지 물어보세요!** 😊
