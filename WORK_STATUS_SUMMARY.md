# 작업 현황 요약 및 다음 단계

**작성일**: 2026-01-11  
**목적**: QR/디지털 인보이스/디지털 보증서 구현을 위한 현재 상태 정리

---

## ✅ 완료된 작업

### 1. 기본 인프라 (완료)
- ✅ `orders` 테이블 (guest_id 포함)
- ✅ `order_items` 테이블
- ✅ `warranties` 테이블 (기본 구조)
- ✅ `token_master` 테이블
- ✅ `invoices` 테이블
- ✅ `order_idempotency` 테이블
- ✅ `stock_units` 테이블
- ✅ `order_item_units` 테이블 (027)
  - ✅ `current_shipment_id` 컬럼 (이미 포함)
  - ✅ `active_lock` generated column (이미 포함)
- ✅ `paid_events` 테이블

### 2. 백엔드 로직 (완료)
- ✅ `processPaidOrder()` 함수 구현
  - 재고 예약 (reserved)
  - `order_item_units` 생성
  - `warranties` 생성 (회원: issued, 비회원: issued_unassigned)
  - 인보이스 생성
- ✅ QR 코드 다운로드 API
- ✅ 인보이스 생성 로직

### 3. Product ID 리팩토링 (완료)
- ✅ Product ID cutover 완료
- ✅ 사이즈 코드 제거 완료

### 4. Phase 15 (완료)
- ✅ `product_options` 테이블 생성
- ✅ 옵션 API 수정 (product_options 기반, 재고 없는 옵션도 표시)

---

## ✅ Phase 2 핵심 인프라 (완료)

### 마이그레이션 파일 상태
- ✅ **073**: `warranties.active_key` 추가 (생성됨)
- ✅ **074**: `warranty_transfers` 테이블 (생성됨)
- ✅ **075**: `guest_order_access_tokens` 테이블 (생성됨, 실제 구조 사용)
- ✅ **076**: `claim_tokens` 테이블 (생성됨, 실제 구조 사용)
- ✅ **077**: `shipments` 테이블 (생성됨)
- ✅ **078**: `shipment_units` 테이블 (생성됨)

### VPS 실행 상태 (2026-01-11 완료)
- ✅ **warranties**: `status`, `owner_user_id`, `source_order_item_unit_id`, `activated_at`, `revoked_at` 컬럼 모두 존재
- ✅ **warranties.active_key**: 생성 완료 (073 실행 완료)
- ✅ **warranty_events**: 테이블 존재 (035 파일로 생성됨)
- ✅ **warranty_transfers**: 생성 완료 (074 실행 완료)
- ✅ **guest_order_access_tokens**: 생성 완료 (075 실행 완료)
- ✅ **claim_tokens**: 생성 완료 (076 실행 완료)
- ✅ **shipments**: 생성 완료 (077 실행 완료)
- ✅ **shipment_units**: 생성 완료 (078 실행 완료)
- ✅ **orders.paid_at**: 컬럼 존재
- ✅ **order_item_units.current_shipment_id FK**: 추가 완료 (078에서 추가)

---

## 🎯 QR/디지털 인보이스/디지털 보증서 구현을 위한 다음 단계

### Step 0: 🔴 주문 후처리 파이프라인 복구 (최우선 - 장애 해결)

**목적**: 주문 완료 후 보증서/인보이스/재고 배정이 안 되는 문제 해결

**확인 사항**:
1. `paid_events` 생성 여부 확인
2. `paid_event_processing` 상태 확인 (`pending`/`failed`)
3. `order_item_units` 생성 여부 확인
4. `stock_units.status`/`reserved_by_order_id` 변화 여부 확인
5. `invoices`/`warranties` 생성 여부 확인
6. `order_stock_issues`에 기록 남는지 확인

**VPS에서 실행할 쿼리**:
```sql
-- 주문 후처리 파이프라인 상태 확인
SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT status FROM paid_event_processing WHERE event_id = (SELECT event_id FROM paid_events WHERE order_id = o.order_id LIMIT 1)) as processing_status,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM warranties WHERE source_order_item_unit_id IN (SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id)) as warranties_count,
    (SELECT COUNT(*) FROM invoices WHERE order_id = o.order_id) as invoices_count
FROM orders o
WHERE o.status = 'processing' AND o.paid_at IS NULL
ORDER BY o.order_id DESC
LIMIT 10;
```

**참조 문서**: `GPT_OPINIONS_INTEGRATED_ANALYSIS.md` (8. 우선순위 최종 정리)

---

### Step 1: DB 상태 확인 (즉시)
**목적**: 실제로 무엇이 실행되었는지 확인

**VPS에서 실행할 쿼리**:
```sql
-- 1. warranties 테이블 구조 확인
SHOW CREATE TABLE warranties;

-- 2. warranty_events 테이블 존재 확인
SHOW TABLES LIKE 'warranty_events';

-- 3. warranty_transfers 테이블 존재 확인
SHOW TABLES LIKE 'warranty_transfers';

-- 4. guest_order_access_tokens 테이블 존재 확인
SHOW TABLES LIKE 'guest_order_access_tokens';

-- 5. claim_tokens 테이블 존재 확인
SHOW TABLES LIKE 'claim_tokens';

-- 6. shipments 테이블 존재 확인
SHOW TABLES LIKE 'shipments';

-- 7. shipment_units 테이블 존재 확인
SHOW TABLES LIKE 'shipment_units';

-- 8. orders.paid_at 컬럼 확인
DESCRIBE orders;
```

### Step 2: Phase 2 마이그레이션 실행 (최우선)
**목적**: QR/디지털 보증서/인보이스 기능의 기반 완성

**실행 순서**:
1. **073**: `warranties.active_key` 추가
2. **074**: `warranty_transfers` 테이블 생성
3. **075**: `guest_order_access_tokens` 테이블 생성
4. **076**: `claim_tokens` 테이블 생성
5. **077**: `shipments` 테이블 생성
6. **078**: `shipment_units` 테이블 생성

**실행 명령어** (VPS에서):
```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < migrations/073_add_warranties_active_key.sql
mysql -u prepmood_user -p prepmood < migrations/074_create_warranty_transfers_table.sql
mysql -u prepmood_user -p prepmood < migrations/075_create_guest_order_access_tokens_table.sql
mysql -u prepmood_user -p prepmood < migrations/076_create_claim_tokens_table.sql
mysql -u prepmood_user -p prepmood < migrations/077_create_shipments_table.sql
mysql -u prepmood_user -p prepmood < migrations/078_create_shipment_units_table.sql
```

### Step 3: Phase 3 - processPaidOrder() 업데이트 (다음 단계)
**목적**: Phase 2에서 추가한 warranties 컬럼 반영

**작업**:
- `backend/utils/paid-order-processor.js` 수정
- warranties 생성 시 `status`, `owner_user_id`, `source_order_item_unit_id` 설정
- 회원 주문: `status = 'issued'`, `owner_user_id = orders.user_id`
- 비회원 주문: `status = 'issued_unassigned'`, `owner_user_id = NULL`
- 재판매 처리: `revoked` 상태 warranties 업데이트 (새 레코드 생성 안 함)
- 금액 검증 추가 (서버 확정 금액 vs 결제 금액 일치 확인)
- 멱등성 체크 강화 (`paid_events` UNIQUE 제약 활용)

### Step 4: Phase 5 - 보증서 활성화 API
**목적**: 첫 활성화 시 인보이스 연동 확인 (핵심 방어 메커니즘)

**작업**:
- `POST /api/warranties/:warrantyId/activate` 구현
- 인보이스 연동 확인 로직
- 환불된 주문의 보증서 활성화 차단

### Step 5: Phase 7 - QR 스캔 로직 수정
**목적**: QR 스캔 시 warranty 생성 제거, 조회만 수행

**작업**:
- `backend/auth-routes.js` 수정
- warranty 생성 제거
- warranty 조회만 수행
- revoked 상태 보증서 접근 거부

---

## 📋 실행 체크리스트

### 즉시 확인
- [x] VPS에서 DB 상태 확인 (위 쿼리 실행) ✅ 완료
- [x] Phase 2 마이그레이션 실행 여부 확인 ✅ 완료

### Phase 2 완성
- [x] 073 실행 (warranties.active_key) ✅ 완료
- [x] 074 실행 (warranty_transfers) ✅ 완료
- [x] 075 실행 (guest_order_access_tokens) ✅ 완료
- [x] 076 실행 (claim_tokens) ✅ 완료
- [x] 077 실행 (shipments) ✅ 완료
- [x] 078 실행 (shipment_units) ✅ 완료

### Phase 3 (Phase 2 완료 후)
- [x] processPaidOrder() 업데이트 ✅ 완료
  - [x] 재판매 처리 로직 추가 (revoked → issued 전이)
  - [x] 원자적 조건 검증 (affectedRows=1)
  - [x] revoked_at 유지 (이력 보존)
- [ ] 테스트 및 검증 필요

### 🔴 즉시 (장애 해결)
- [ ] 주문 후처리 파이프라인 복구
  - [ ] `paid_events` 생성 여부 확인
  - [ ] `paid_event_processing` 상태 확인
  - [ ] `order_item_units`, `warranties`, `invoices` 생성 여부 확인
  - [ ] `order_stock_issues` 기록 확인

### 🟡 단기 (1-2주)
- [ ] orders.created_at/updated_at 추가
  - 현재 `orders.order_date`만 있어서 마지막 갱신 시각 추적 불가
  - 장애/정산/CS에 즉효
- [ ] 스냅샷 컬럼 주석 명확화
  - `token_master.product_name`
  - `order_items.product_name`
  - `warranties.product_name`

### Phase 5, 7 (Phase 2, 3 완료 후)
- [ ] 보증서 활성화 API 구현
- [ ] QR 스캔 로직 수정

---

## 💡 핵심 포인트

1. **Phase 2가 모든 기능의 기반**: QR/디지털 보증서/인보이스 기능을 구현하려면 Phase 2 완성이 필수
2. **마이그레이션 파일은 이미 생성됨**: 실행만 하면 됨
3. **실행 순서 중요**: 의존성 고려하여 순서대로 실행
4. **검증 필수**: 각 마이그레이션 실행 후 테이블 생성 확인

---

---

## ✅ Phase 2 완료 확인

**실행 완료**: 2026-01-11
- ✅ warranties.active_key 추가 완료
- ✅ warranty_transfers 테이블 생성 완료
- ✅ guest_order_access_tokens 테이블 생성 완료
- ✅ claim_tokens 테이블 생성 완료
- ✅ shipments 테이블 생성 완료
- ✅ shipment_units 테이블 생성 완료
- ✅ order_item_units.current_shipment_id FK 추가 완료

---

## ✅ Phase 3 완료 확인

**작업 완료**: 2026-01-11
- ✅ processPaidOrder() 재판매 처리 로직 추가
  - revoked 상태 warranty 확인
  - revoked → issued/issued_unassigned 전이
  - 원자적 조건 검증 (affectedRows=1)
  - revoked_at 유지 (이력 보존)
- ✅ 회원/비회원 구분 유지
- ✅ 금액 검증 유지
- ✅ 멱등성 체크 유지

**다음 액션**: 
1. **🔴 주문 후처리 파이프라인 복구** (즉시 - 장애 해결)
   - 참조: `GPT_OPINIONS_INTEGRATED_ANALYSIS.md` (8. 우선순위 최종 정리)
2. **🟡 orders.created_at/updated_at 추가** (단기)
3. Phase 5, 7 - 보증서 활성화 API, QR 스캔 로직 수정
