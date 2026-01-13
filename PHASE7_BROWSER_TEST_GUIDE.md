# Phase 7 브라우저 테스트 가이드

## 🎯 테스트 목표

QR 스캔 로직이 제대로 작동하는지 브라우저에서 확인

---

## 📋 테스트 시나리오

### 시나리오 2: warranty가 없는 경우 (404 에러)

**토큰**: `S2frizeUFcyIeWGiTXdi`

**테스트 단계**:

1. **브라우저에서 로그인**
   ```
   https://prepmood.kr/login.html
   ```

2. **QR 스캔 URL 접근**
   ```
   https://prepmood.kr/a/S2frizeUFcyIeWGiTXdi
   ```

3. **예상 결과 확인**:
   - ✅ 404 에러 페이지 표시
   - ✅ "이 제품의 보증서가 아직 발급되지 않았습니다. 주문 완료 후 보증서가 자동으로 발급됩니다." 메시지
   - ✅ warranty 생성 안 됨

4. **데이터 확인** (VPS에서):
   ```sql
   -- warranty가 생성되지 않았는지 확인
   SELECT COUNT(*) as new_warranties
   FROM warranties
   WHERE token_pk = 64
     AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE);
   -- 결과: 0 (새 warranty 생성 안 됨)
   
   -- scan_logs 확인
   SELECT * FROM scan_logs
   WHERE token = 'S2frizeUFcyIeWGiTXdi'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

---

## 🔍 확인 사항

### 1. 로그 확인

VPS에서 서버 로그 확인:
```bash
pm2 logs prepmood-backend --lines 50 | grep -E "AUTH|warranty"
```

**확인할 로그**:
- `[AUTH] warranty 없음 (paid 처리 필요):` - warranty가 없을 때
- `[AUTH] 정품 인증 요청:` - QR 스캔 요청

### 2. 데이터 무결성 확인

```sql
-- warranty 테이블에 새 레코드가 생성되지 않았는지 확인
SELECT 
    COUNT(*) as total_warranties,
    MAX(created_at) as latest_created
FROM warranties
WHERE token_pk = 64;

-- scan_logs에 이벤트가 기록되었는지 확인
SELECT 
    token,
    user_id,
    warranty_public_id,
    event_type,
    created_at
FROM scan_logs
WHERE token = 'S2frizeUFcyIeWGiTXdi'
ORDER BY created_at DESC
LIMIT 5;
```

---

## ⚠️ 문제 해결

### 문제 1: 여전히 warranty가 생성됨

**원인**: 코드가 배포되지 않았거나 서버가 재시작되지 않음

**해결**:
```bash
# VPS에서
cd /var/www/html/backend
git pull
pm2 restart prepmood-backend
```

### 문제 2: 404 에러가 안 나옴

**원인**: 에러 페이지 렌더링 문제 또는 다른 로직이 실행됨

**확인**:
- 브라우저 개발자 도구에서 Network 탭 확인
- 응답 코드가 404인지 확인
- 서버 로그 확인

### 문제 3: 로그인 후에도 로그인 페이지로 리다이렉트

**원인**: JWT 토큰 쿠키 문제

**해결**:
- 브라우저 쿠키 확인
- 로그아웃 후 다시 로그인

---

## ✅ 테스트 완료 기준

- [ ] warranty 없는 토큰으로 접근 시 404 에러 표시
- [ ] 에러 메시지 정상 표시
- [ ] warranty 테이블에 새 레코드 생성 안 됨
- [ ] scan_logs에 이벤트 기록됨
- [ ] 서버 로그에 적절한 메시지 기록됨

---

## 📝 테스트 결과 기록

테스트 후 아래 정보를 기록하세요:

1. **응답 코드**: 404
2. **에러 메시지**: "이 제품의 보증서가 아직 발급되지 않았습니다..."
3. **warranty 생성 여부**: ❌ 생성 안 됨
4. **로그 메시지**: `[AUTH] warranty 없음 (paid 처리 필요)`

---

**다음 단계**: 시나리오 1, 3 테스트 (warranty 있는 경우, revoked 상태)
