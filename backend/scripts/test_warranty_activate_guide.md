# 보증서 활성화 API 테스트 가이드

## 📋 테스트 목표

1. ✅ 정상 케이스: issued 상태의 보증서 활성화
2. ✅ 에러 케이스: 동의 없음
3. ✅ 에러 케이스: 소유자 불일치
4. ✅ 에러 케이스: 상태가 issued가 아님
5. ✅ 에러 케이스: 인보이스 연동 확인 실패
6. ✅ 에러 케이스: 환불된 주문

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
mysql -u prepmood_user -p prepmood < scripts/test_warranty_activate.sql
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 정상 케이스 (보증서 활성화)

**목표**: issued 상태의 보증서를 정상적으로 활성화

**준비**:
```sql
-- 활성화 가능한 보증서 확인
SELECT 
    w.id as warranty_id,
    w.status,
    w.owner_user_id,
    u.email as owner_email,
    o.user_id as order_user_id,
    o.status as order_status,
    oiu.unit_status
FROM warranties w
LEFT JOIN users u ON w.owner_user_id = u.user_id
LEFT JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
LEFT JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
LEFT JOIN orders o ON oi.order_id = o.order_id
WHERE w.status = 'issued'
  AND w.owner_user_id IS NOT NULL
  AND o.user_id = w.owner_user_id
  AND o.status != 'refunded'
  AND oiu.unit_status != 'refunded'
LIMIT 1;
```

**테스트 방법 1: curl**
```bash
# JWT 토큰을 실제 토큰으로 변경
TOKEN="your_jwt_token_here"
WARRANTY_ID=1

curl -X POST "https://prepmood.kr/api/warranties/${WARRANTY_ID}/activate" \
  -H "Content-Type: application/json" \
  -H "Cookie: token=${TOKEN}" \
  -d '{"agree": true}'
```

**테스트 방법 2: 브라우저 개발자 도구**
1. 브라우저에서 로그인
2. 개발자 도구(F12) → Console 탭
3. 아래 코드 실행:
```javascript
fetch('/api/warranties/1/activate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include',
  body: JSON.stringify({ agree: true })
})
.then(res => res.json())
.then(data => console.log('결과:', data))
.catch(err => console.error('에러:', err));
```

**예상 결과**:
```json
{
  "success": true,
  "message": "보증서가 활성화되었습니다.",
  "warranty": {
    "id": 1,
    "status": "active",
    "activated_at": "2026-01-16T12:00:00.000Z"
  }
}
```

**확인 사항**:
```sql
-- 활성화 후 상태 확인
SELECT 
    w.id,
    w.status,
    w.activated_at,
    COUNT(we.event_id) as event_count
FROM warranties w
LEFT JOIN warranty_events we ON w.id = we.warranty_id
WHERE w.id = 1
GROUP BY w.id, w.status, w.activated_at;

-- 예상 결과:
-- status: 'active'
-- activated_at: 현재 시각
-- event_count: 1 (활성화 이벤트)
```

---

### 시나리오 2: 에러 케이스 - 동의 없음

**테스트**:
```bash
curl -X POST "https://prepmood.kr/api/warranties/1/activate" \
  -H "Content-Type: application/json" \
  -H "Cookie: token=${TOKEN}" \
  -d '{"agree": false}'
```

**예상 결과**:
```json
{
  "success": false,
  "message": "활성화 동의가 필요합니다."
}
```
- HTTP 상태 코드: 400

---

### 시나리오 3: 에러 케이스 - 소유자 불일치

**준비**:
```sql
-- 다른 사용자의 보증서 확인
SELECT 
    w.id,
    w.owner_user_id,
    u.email
FROM warranties w
JOIN users u ON w.owner_user_id = u.user_id
WHERE w.status = 'issued'
  AND w.owner_user_id != 2  -- 현재 로그인한 user_id가 2라고 가정
LIMIT 1;
```

**테스트**:
- 다른 사용자 계정으로 로그인
- 위에서 찾은 보증서 ID로 활성화 시도

**예상 결과**:
```json
{
  "success": false,
  "message": "보증서 소유자만 활성화할 수 있습니다."
}
```
- HTTP 상태 코드: 403

---

### 시나리오 4: 에러 케이스 - 상태가 issued가 아님

**준비**:
```sql
-- 이미 활성화된 보증서 확인
SELECT id, status FROM warranties WHERE status = 'active' LIMIT 1;
```

**테스트**:
- 위에서 찾은 보증서 ID로 활성화 시도

**예상 결과**:
```json
{
  "success": false,
  "message": "이미 활성화된 보증서입니다."
}
```
- HTTP 상태 코드: 400

---

### 시나리오 5: 에러 케이스 - 인보이스 연동 확인 실패

**준비**:
```sql
-- 주문 소유자와 보증서 소유자가 다른 경우 확인
SELECT 
    w.id as warranty_id,
    w.owner_user_id as warranty_owner,
    o.user_id as order_owner
FROM warranties w
JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
JOIN orders o ON oi.order_id = o.order_id
WHERE w.status = 'issued'
  AND w.owner_user_id != o.user_id
LIMIT 1;
```

**테스트**:
- 위에서 찾은 보증서 ID로 활성화 시도

**예상 결과**:
```json
{
  "success": false,
  "message": "해당 보증서가 속한 주문이 계정에 연동되지 않았습니다."
}
```
- HTTP 상태 코드: 403

---

### 시나리오 6: 에러 케이스 - 환불된 주문

**준비**:
```sql
-- 환불된 주문의 보증서 확인
SELECT 
    w.id as warranty_id,
    o.status as order_status,
    oiu.unit_status
FROM warranties w
JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
JOIN orders o ON oi.order_id = o.order_id
WHERE w.status = 'issued'
  AND (o.status = 'refunded' OR oiu.unit_status = 'refunded')
LIMIT 1;
```

**테스트**:
- 위에서 찾은 보증서 ID로 활성화 시도

**예상 결과**:
```json
{
  "success": false,
  "message": "환불 처리된 주문의 보증서는 활성화할 수 없습니다."
}
```
또는
```json
{
  "success": false,
  "message": "환불 처리된 주문 항목의 보증서는 활성화할 수 없습니다."
}
```
- HTTP 상태 코드: 403

---

## ✅ 검증 체크리스트

### 정상 케이스 검증
- [ ] HTTP 200 응답
- [ ] `success: true`
- [ ] `warranty.status`가 `'active'`로 변경됨
- [ ] `warranty.activated_at`이 설정됨
- [ ] `warranty_events`에 이벤트 기록됨
- [ ] 이벤트 `event_type`이 `'status_change'`
- [ ] 이벤트 `old_value`에 `'issued'` 포함
- [ ] 이벤트 `new_value`에 `'active'` 포함

### 에러 케이스 검증
- [ ] 동의 없음 → 400 에러
- [ ] 소유자 불일치 → 403 에러
- [ ] 상태 불일치 → 400 에러
- [ ] 인보이스 연동 실패 → 403 에러
- [ ] 환불된 주문 → 403 에러

---

## 🔍 PM2 로그 확인

```bash
# VPS에서 실행
pm2 logs prepmood-backend --lines 100 | grep -E "WARRANTY_ACTIVATE|warranty.*activate"
```

**예상 로그**:
```
[WARRANTY_ACTIVATE] 보증서 활성화 완료 { warrantyId: 1, userId: 2, previousStatus: 'issued', newStatus: 'active' }
```

---

## 📝 테스트 완료 후

테스트가 완료되면:
1. 모든 시나리오 통과 확인
2. PM2 로그에서 에러 없음 확인
3. 데이터베이스 상태 확인 (warranties, warranty_events)
