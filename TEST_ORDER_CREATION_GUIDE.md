# 테스트 주문 생성 가이드

## 목적
085 Idempotency-Key 테스트를 위한 테스트 주문 생성 및 보증서 귀속 확인

## 보증서 귀속 확인

### 구현 상태
✅ **구현 완료**: 회원 주문 시 보증서가 자동으로 귀속됩니다.

**코드 위치**: `backend/utils/paid-order-processor.js` 424-502줄
- 회원 주문: `warranties.owner_user_id = order.user_id`, `status = 'issued'`
- 비회원 주문: `warranties.owner_user_id = NULL`, `status = 'issued_unassigned'`

---

## 테스트 주문 생성 방법

### 방법 1: 웹 UI를 통한 주문 (권장)

1. **회원 로그인**
   - `/login.html` 또는 `/register.html`에서 회원가입/로그인
   - 로그인 상태 확인

2. **상품 장바구니에 추가**
   - 상품 페이지에서 상품 선택
   - 장바구니에 추가

3. **주문 및 결제**
   - `/checkout.html`에서 주문 정보 입력
   - 결제 진행 (테스트 모드 또는 실제 결제)

4. **결제 완료 후 확인**
   - `processPaidOrder()` 자동 실행
   - warranties 생성 및 귀속 확인

### 방법 2: API를 통한 직접 주문 생성 (개발/테스트용)

**주의**: 이 방법은 결제 처리가 필요하므로 실제 결제 또는 테스트 모드가 필요합니다.

#### 1단계: 회원 로그인 (JWT 토큰 획득)

```bash
# 로그인
curl -c /tmp/user_cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com", "password": "your-password"}'
```

#### 2단계: 주문 생성

```bash
# 주문 생성
curl -b /tmp/user_cookies.txt -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "items": [
      {
        "product_id": "PM-26-SH-Teneu-Solid-LB",
        "quantity": 1,
        "size": "M",
        "color": "Navy"
      }
    ],
    "shipping": {
      "name": "테스트 사용자",
      "email": "test@example.com",
      "phone": "010-1234-5678",
      "address": "서울시 강남구 테스트동 123",
      "cost": 0
    }
  }'
```

**응답 예시**:
```json
{
  "success": true,
  "order": {
    "order_id": 1,
    "order_number": "ORD-20250125-001",
    "total_price": 129000
  }
}
```

#### 3단계: 결제 처리 (테스트 모드)

**방법 A: 토스페이먼츠 테스트 모드**
- 결제 페이지에서 테스트 카드 사용
- 결제 완료 시 `processPaidOrder()` 자동 실행

**방법 B: 관리자 수동 paid 처리 (개발용)**
```bash
# ⚠️ 주의: 실제 운영에서는 사용하지 마세요. 개발/테스트 전용입니다.
# paid_events 생성 및 processPaidOrder() 실행
node backend/scripts/fix_missing_paid_events.js --order-number ORD-20250125-001
```

---

## 보증서 귀속 확인

### 주문 후 DB 확인

```sql
-- 1. 주문 확인
SELECT order_id, order_number, user_id, status
FROM orders
WHERE order_number = 'ORD-20250125-001';

-- 2. warranties 확인 (owner_user_id 확인)
SELECT w.id AS warranty_id, w.status, w.owner_user_id, w.token_pk, o.order_id, o.user_id
FROM warranties w
INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
INNER JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_number = 'ORD-20250125-001';
```

**예상 결과**:
- 회원 주문: `warranties.owner_user_id = orders.user_id` ✅
- `warranties.status = 'issued'` ✅

---

## 빠른 테스트 스크립트

### 전체 흐름 테스트

```bash
#!/bin/bash

# 1. 회원 로그인
curl -c /tmp/user_cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com", "password": "your-password"}'

# 2. 주문 생성
ORDER_RESPONSE=$(curl -b /tmp/user_cookies.txt -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "items": [{"product_id": "PM-26-SH-Teneu-Solid-LB", "quantity": 1, "size": "M", "color": "Navy"}],
    "shipping": {"name": "테스트", "email": "test@example.com", "phone": "010-1234-5678", "address": "서울", "cost": 0}
  }')

echo "주문 생성 결과: $ORDER_RESPONSE"

# 3. order_id 추출 (jq 필요)
ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.order.order_id')
ORDER_NUMBER=$(echo $ORDER_RESPONSE | jq -r '.order.order_number')

echo "주문 ID: $ORDER_ID"
echo "주문번호: $ORDER_NUMBER"

# 4. DB 확인
mysql -u prepmood_user -p prepmood -e "
SELECT w.id AS warranty_id, w.status, w.owner_user_id, o.user_id AS order_user_id
FROM warranties w
INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
INNER JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_id = $ORDER_ID;
"
```

---

## 주의사항

### 재고 확인
주문 생성 전에 재고가 있는지 확인:
```sql
SELECT product_id, COUNT(*) AS available_stock
FROM stock_units
WHERE status = 'in_stock'
GROUP BY product_id;
```

### 결제 처리
- 실제 결제: 토스페이먼츠 테스트 카드 사용
- 개발/테스트: `fix_missing_paid_events.js` 스크립트 사용 (운영 환경에서는 사용 금지)

---

## 다음 단계

주문 생성 및 결제 완료 후:
1. ✅ warranties 생성 확인
2. ✅ `warranties.owner_user_id` 확인 (회원 주문 시 귀속 확인)
3. ✅ 085 Idempotency-Key 테스트 진행
