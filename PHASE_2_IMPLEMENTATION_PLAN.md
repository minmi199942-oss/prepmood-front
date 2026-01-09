# Phase 2 구현 계획: Paid 처리 로직

## 📋 목표
**결제 완료 시 자동으로 재고 배정, 주문 단위 생성, 보증서 생성, 인보이스 생성을 처리하는 `processPaidOrder()` 함수 구현**

---

## ⚠️ 핵심 원칙 (SSOT 준수)

### 1. 락 순서 (필수)
**전역 락 순서**: `stock_units`(물리) → `orders`(결제) → `warranties`(권리) → `invoices`(문서)

### 2. 멱등성 보장 (필수)
- `paid_events` UNIQUE 제약으로 재처리 방지
- 각 단계별 `affectedRows=1` 검증

### 3. 재고 배정 규칙 (필수)
- **오직 `stock_units.status = 'in_stock'`만 배정**
- `FOR UPDATE SKIP LOCKED` 사용 (동시성 제어)

### 4. 보증서 생성 규칙 (필수)
- **회원 주문**: `status = 'issued'`, `owner_user_id = orders.user_id`
- **비회원 주문**: `status = 'issued_unassigned'`, `owner_user_id = NULL`
- `UNIQUE(token_pk)` 제약으로 토큰당 레코드 1개 강제

### 5. 금액 검증 (필수)
- 서버에서 확정한 주문 금액과 결제 금액 일치 확인
- 불일치 시 `paid_events`는 기록하되 주문 처리는 중단

---

## 🎯 구현 작업 목록

### 작업 1: `processPaidOrder()` 함수 구현

**파일**: `backend/utils/paid-order-processor.js` (신규 생성)

**함수 시그니처**:
```javascript
async function processPaidOrder({
    connection,      // 트랜잭션 연결 (이미 시작된 상태)
    orderId,         // 주문 ID
    paymentKey,      // 결제 키 (토스페이먼츠 paymentKey)
    amount,          // 결제 금액
    currency,        // 통화 (기본값: 'KRW')
    eventSource,     // 이벤트 소스 ('webhook', 'redirect', 'manual_verify')
    rawPayload       // 원본 결제 응답 (JSON)
})
```

**반환값**:
```javascript
{
    success: boolean,
    alreadyProcessed: boolean,  // 이미 처리된 경우 true
    message: string,
    data: {
        paidEventId: number,
        stockUnitsReserved: number,
        orderItemUnitsCreated: number,
        warrantiesCreated: number,
        invoiceNumber: string | null
    }
}
```

**처리 순서** (SYSTEM_FLOW_DETAILED.md 148-200줄 참조):

1. **주문 잠금 및 금액 검증**
   ```sql
   SELECT order_id, total_price, currency, user_id, guest_id, status 
   FROM orders 
   WHERE order_id = ? 
   FOR UPDATE
   ```
   - 주문 존재 확인
   - 금액/통화 일치 확인 (불일치 시 `paid_events` 기록 후 에러)

2. **paid_events INSERT (멱등성 체크)**
   ```sql
   INSERT INTO paid_events 
   (order_id, payment_key, event_source, amount, currency, raw_payload_json, confirmed_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
   ```
   - `ER_DUP_ENTRY` 에러 시 `alreadyProcessed: true` 반환

3. **order_items 조회**
   ```sql
   SELECT * FROM order_items WHERE order_id = ? ORDER BY order_item_id
   ```

4. **재고 배정 (락 순서 1단계: stock_units)**
   - 각 `order_item`의 `quantity`만큼 반복:
     ```sql
     SELECT stock_unit_id, token_pk, product_id
     FROM stock_units
     WHERE product_id = ? 
       AND status = 'in_stock'
     ORDER BY stock_unit_id
     LIMIT ? 
     FOR UPDATE SKIP LOCKED
     ```
   - 배정된 재고를 `reserved`로 업데이트:
     ```sql
     UPDATE stock_units
     SET status = 'reserved',
         reserved_at = NOW(),
         reserved_by_order_id = ?
     WHERE stock_unit_id = ?
     ```
   - `affectedRows=1` 검증

5. **order_item_units 생성 (락 순서 2단계: orders 이후)**
   - 각 배정된 재고 단위별로:
     ```sql
     INSERT INTO order_item_units
     (order_item_id, unit_seq, stock_unit_id, token_pk, unit_status, created_at)
     VALUES (?, ?, ?, ?, 'reserved', NOW())
     ```
   - `unit_seq`는 1부터 시작 (같은 `order_item_id` 내 순서)

6. **warranties 생성 (락 순서 3단계: warranties)**
   - 각 `order_item_unit`별로:
     ```sql
     INSERT INTO warranties
     (source_order_item_unit_id, token_pk, owner_user_id, status, created_at)
     VALUES (?, ?, ?, ?, NOW())
     ```
   - 회원: `owner_user_id = orders.user_id`, `status = 'issued'`
   - 비회원: `owner_user_id = NULL`, `status = 'issued_unassigned'`
   - `UNIQUE(token_pk)` 제약으로 중복 방지

7. **invoices 생성 (락 순서 4단계: invoices)**
   - 기존 `createInvoiceFromOrder()` 함수 활용
   - 트랜잭션 내에서 호출

8. **orders.paid_at 업데이트**
   ```sql
   UPDATE orders 
   SET paid_at = NOW()
   WHERE order_id = ?
   ```
   - `paid_events.confirmed_at`과 동기화

9. **COMMIT** (호출자가 처리)

---

### 작업 2: `payments-routes.js` 통합

**파일**: `backend/payments-routes.js`

**수정 위치**: `POST /api/payments/confirm` 라우트 (337-360줄)

**현재 상태**:
- 인보이스만 생성하고 있음
- `processPaidOrder()` 호출 없음

**수정 내용**:
1. `processPaidOrder()` import 추가
2. `paymentStatus === 'captured'`일 때 `processPaidOrder()` 호출
3. 인보이스 생성은 `processPaidOrder()` 내부로 이동 (또는 유지)
4. 에러 처리: `processPaidOrder()` 실패 시에도 결제는 성공 처리 (로깅만)

**수정 후 흐름**:
```javascript
if (paymentStatus === 'captured') {
    try {
        // processPaidOrder() 호출 (재고 배정, 주문 단위, 보증서, 인보이스 생성)
        const paidResult = await processPaidOrder({
            connection,
            orderId: order.order_id,
            paymentKey: paymentKey,
            amount: serverAmount,
            currency: currency,
            eventSource: 'redirect',  // 또는 'webhook'
            rawPayload: paymentResponse
        });
        
        if (paidResult.alreadyProcessed) {
            Logger.log('[payments][confirm] 이미 처리된 주문', {
                order_id: order.order_id
            });
        } else {
            Logger.log('[payments][confirm] Paid 처리 완료', {
                order_id: order.order_id,
                stockUnitsReserved: paidResult.data.stockUnitsReserved,
                warrantiesCreated: paidResult.data.warrantiesCreated
            });
        }
        
        invoiceCreated = paidResult.data.invoiceNumber !== null;
        invoiceNumber = paidResult.data.invoiceNumber;
        
    } catch (err) {
        // 에러 로깅 (결제는 성공 처리)
        Logger.error('[payments][confirm] Paid 처리 실패 (결제는 성공)', {
            order_id: order.order_id,
            error: err.message
        });
    }
}
```

---

### 작업 3: 웹훅 처리 통합

**파일**: `backend/payments-routes.js`

**수정 위치**: `POST /api/payments/webhook` 라우트

**수정 내용**:
- 웹훅에서도 `processPaidOrder()` 호출
- `eventSource: 'webhook'`로 설정

---

### 작업 4: 재고 부족 처리

**시나리오**: 재고가 부족한 경우

**처리 방법**:
1. 재고 부족 감지 시 에러 발생
2. `paid_events`는 이미 기록됨 (증거)
3. 주문 상태를 특별 상태로 변경 (예: `paid_but_out_of_stock`)
4. 관리자 알림 (선택사항)

**구현**:
```javascript
// 재고 부족 감지
if (availableStock.length < needQty) {
    throw new Error(`재고 부족: 상품 ${productId}, 필요: ${needQty}, 가용: ${availableStock.length}`);
}
```

---

### 작업 5: 에러 처리 및 로깅

**에러 처리 규칙**:
1. `paid_events` INSERT 실패 (ER_DUP_ENTRY): 정상 처리 (이미 처리됨)
2. 재고 부족: 에러 발생, `paid_events`는 기록됨
3. 기타 에러: 롤백, 에러 로깅

**로깅**:
- 각 단계별 상세 로깅
- 성공/실패 모두 로깅
- 재고 부족 시 관리자 알림 (선택사항)

---

## 📋 구현 순서

1. **`backend/utils/paid-order-processor.js` 생성**
   - `processPaidOrder()` 함수 구현
   - 단위 테스트 작성 (선택사항)

2. **`backend/payments-routes.js` 수정**
   - `processPaidOrder()` import
   - `POST /api/payments/confirm`에 통합
   - `POST /api/payments/webhook`에 통합

3. **테스트**
   - 결제 완료 시나리오 테스트
   - 재고 부족 시나리오 테스트
   - 중복 처리 시나리오 테스트

4. **검증**
   - 데이터 정합성 확인
   - 락 순서 준수 확인
   - 멱등성 확인

---

## ⚠️ 주의사항

1. **트랜잭션 관리**
   - `processPaidOrder()`는 이미 시작된 트랜잭션 내에서 실행
   - COMMIT/ROLLBACK은 호출자가 처리

2. **에러 처리**
   - `paid_events` INSERT는 항상 시도 (증거 보존)
   - 재고 부족 등은 에러로 처리하되, 결제 성공은 유지

3. **성능**
   - 배치 INSERT 고려 (order_item_units, warranties)
   - `FOR UPDATE SKIP LOCKED`로 동시성 제어

4. **데이터 정합성**
   - 각 단계별 `affectedRows` 검증
   - UNIQUE 제약 활용

---

## 📝 참고 문서

- `SYSTEM_FLOW_DETAILED.md` 148-200줄: Paid 처리 상세 흐름
- `FINAL_EXECUTION_SPEC_REVIEW.md` 2088-2162줄: 구현 예시
- `backend/payments-routes.js`: 현재 결제 처리 로직
