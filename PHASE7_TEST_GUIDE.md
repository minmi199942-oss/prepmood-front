# Phase 7 테스트 가이드: QR 스캔 로직 수정

## 📋 테스트 목표

1. ✅ QR 스캔 시 warranty 생성 제거 확인
2. ✅ warranty 조회만 수행 확인
3. ✅ warranty 없을 때 404 에러 확인
4. ✅ revoked 상태 warranty 접근 거부 (403) 확인

---

## 🚀 테스트 전 준비

### 1. 코드 배포 확인

```bash
# VPS에서 최신 코드 확인
cd /var/www/html/backend
git pull origin main
pm2 restart prepmood-backend
```

### 2. 테스트 데이터 확인

```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/test_phase7_qr_scan.sql
```

---

## 🧪 테스트 시나리오

### 시나리오 1: warranty가 있는 경우 (정상 조회)

**목표**: warranty가 있는 토큰으로 QR 스캔 시 정상 조회되는지 확인

**준비**:
```sql
-- warranty가 있는 토큰 확인
SELECT 
    tm.token,
    tm.token_pk,
    w.id as warranty_id,
    w.status,
    w.owner_user_id
FROM token_master tm
JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.status IN ('issued', 'issued_unassigned', 'active')
LIMIT 1;
```

**테스트**:
```bash
# 브라우저에서 또는 curl로 테스트
curl -L "https://prepmood.kr/a/{TOKEN}"
# 또는 브라우저에서 직접 접근
# https://prepmood.kr/a/{TOKEN}
```

**예상 결과**:
- ✅ 200 OK
- ✅ `success.html` 또는 `warning.html` 렌더링
- ✅ warranty 정보 표시
- ✅ warranty 생성 안 됨 (기존 warranty 조회만)

**확인 사항**:
```sql
-- warranty가 새로 생성되지 않았는지 확인
SELECT COUNT(*) as new_warranties
FROM warranties
WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE);
-- 결과: 0 (새 warranty 생성 안 됨)
```

---

### 시나리오 2: warranty가 없는 경우 (404 에러)

**목표**: warranty가 없는 토큰으로 QR 스캔 시 404 에러가 나는지 확인

**준비**:
```sql
-- warranty가 없는 토큰 확인
SELECT 
    tm.token,
    tm.token_pk,
    'warranty 없음' AS status
FROM token_master tm
LEFT JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.id IS NULL
  AND tm.is_blocked = 0
LIMIT 1;
```

**테스트**:
```bash
curl -L "https://prepmood.kr/a/{TOKEN_WITHOUT_WARRANTY}"
```

**예상 결과**:
- ✅ 404 Not Found
- ✅ `error.html` 렌더링
- ✅ 메시지: "이 제품의 보증서가 아직 발급되지 않았습니다. 주문 완료 후 보증서가 자동으로 발급됩니다."

**확인 사항**:
```sql
-- warranty가 생성되지 않았는지 확인
SELECT COUNT(*) as new_warranties
FROM warranties
WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE);
-- 결과: 0 (새 warranty 생성 안 됨)
```

---

### 시나리오 3: revoked 상태 warranty (403 에러)

**목표**: revoked 상태 warranty로 QR 스캔 시 403 에러가 나는지 확인

**준비**:
```sql
-- revoked 상태 warranty 확인
SELECT 
    tm.token,
    tm.token_pk,
    w.id as warranty_id,
    w.status,
    w.revoked_at
FROM token_master tm
JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.status = 'revoked'
LIMIT 1;

-- 없으면 테스트용으로 생성
-- UPDATE warranties 
-- SET status = 'revoked', revoked_at = NOW()
-- WHERE id = ?;
```

**테스트**:
```bash
curl -L "https://prepmood.kr/a/{TOKEN_REVOKED}"
```

**예상 결과**:
- ✅ 403 Forbidden
- ✅ `error.html` 렌더링
- ✅ 메시지: "이 보증서는 환불 처리되어 더 이상 유효하지 않습니다."

**확인 사항**:
```sql
-- warranty 상태가 revoked인지 확인
SELECT status, revoked_at
FROM warranties
WHERE token_pk = ?;
-- 결과: status = 'revoked'
```

---

## 📊 테스트 체크리스트

### 기능 테스트
- [ ] 시나리오 1: warranty 있는 경우 정상 조회
- [ ] 시나리오 2: warranty 없는 경우 404 에러
- [ ] 시나리오 3: revoked 상태 warranty 403 에러
- [ ] warranty 생성 안 됨 (모든 시나리오)

### 로그 확인
- [ ] `[AUTH] warranty 없음 (paid 처리 필요)` 로그 확인
- [ ] `[AUTH] revoked 상태 보증서 접근 시도` 로그 확인
- [ ] `scan_logs` 테이블에 스캔 이력 기록 확인

### 데이터 무결성
- [ ] warranty 테이블에 새 레코드 생성 안 됨
- [ ] token_master 스캔 카운트 업데이트 확인
- [ ] scan_logs에 이벤트 기록 확인

---

## 🔍 로그 확인 방법

```bash
# VPS에서 실행
pm2 logs prepmood-backend --lines 100 | grep -E "AUTH|warranty"
```

**확인할 로그**:
- `[AUTH] warranty 없음 (paid 처리 필요)`
- `[AUTH] revoked 상태 보증서 접근 시도`
- `[AUTH] 정품 인증 요청`

---

## ⚠️ 주의사항

1. **로그인 필요**: QR 스캔은 로그인이 필요합니다 (`requireAuthForHTML` 미들웨어)
2. **테스트 토큰**: 실제 운영 데이터를 사용하지 말고 테스트용 토큰을 사용하세요
3. **데이터 백업**: 테스트 전 데이터 백업 권장

---

## 🐛 문제 해결

### 문제 1: warranty가 생성됨
**원인**: 코드가 배포되지 않았거나 캐시 문제
**해결**: 
```bash
pm2 restart prepmood-backend
# 또는
pm2 reload prepmood-backend
```

### 문제 2: 404/403 에러가 안 나옴
**원인**: 에러 페이지 렌더링 문제
**해결**: `backend/views/error.ejs` 파일 확인

### 문제 3: 로그가 안 보임
**원인**: 로그 레벨 설정 문제
**해결**: `backend/logger.js` 확인

---

## ✅ 테스트 완료 기준

1. ✅ 모든 시나리오에서 warranty 생성 안 됨
2. ✅ warranty 없는 경우 404 에러 정상 동작
3. ✅ revoked 상태 warranty 403 에러 정상 동작
4. ✅ 로그에 적절한 메시지 기록
5. ✅ scan_logs에 이벤트 기록

---

**테스트 완료 후**: Phase 5 (보증서 활성화 API) 진행
