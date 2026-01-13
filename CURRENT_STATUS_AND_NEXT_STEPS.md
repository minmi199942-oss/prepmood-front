# 현재 상태 및 다음 단계 분석

**⚠️ 중요**: 데이터베이스 스키마 구조는 `SCHEMA_SSOT.md`를 기준으로 합니다.

**분석 기준**: 
- `SCHEMA_SSOT.md`: 데이터베이스 스키마 실제 구조 (최종 기준)
- `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`: 구현 로드맵 (2026-01-11 기준)

## ✅ 완료된 작업

### Phase 15 (중기 개선)
- ✅ **15-1**: `product_options` 테이블 생성 완료
- ✅ **15-2**: 옵션 API 수정 완료 (product_options 기반, 재고 없는 옵션도 표시)

### 기본 인프라
- ✅ `orders` 테이블 (guest_id 포함)
- ✅ `order_items` 테이블
- ✅ `warranties` 테이블 (기본 구조)
- ✅ `token_master` 테이블
- ✅ `invoices` 테이블
- ✅ `order_idempotency` 테이블
- ✅ `stock_units` 테이블
- ✅ `order_item_units` 테이블
- ✅ `paid_events` 테이블
- ✅ `processPaidOrder()` 함수 구현
- ✅ QR 코드 다운로드 API
- ✅ 인보이스 생성 로직

### Product ID 리팩토링
- ✅ Product ID cutover 완료 (canonical_id로 전환)
- ✅ 사이즈 코드 제거 완료

---

## ⚠️ Phase 2 핵심 인프라 테이블 상태

### ✅ 완료된 것으로 보이는 것들
1. **Phase 2-1**: `warranties` 컬럼 추가
   - 파일: `028_add_warranties_columns.sql`
   - 상태: **마이그레이션 파일 존재, 실행 여부 확인 필요**
   - 포함 내용:
     - ✅ `status` 컬럼 (ENUM)
     - ✅ `owner_user_id` 컬럼
     - ✅ `source_order_item_unit_id` 컬럼
     - ✅ `activated_at`, `revoked_at` 컬럼
     - ⚠️ **누락**: `active_key` generated column (문서 스펙에 있음)

2. **Phase 2-10**: `orders.paid_at` 컬럼
   - 파일: `025_add_orders_paid_at.sql`
   - 상태: **마이그레이션 파일 존재, 실행 여부 확인 필요**

### ⚠️ 파일은 있지만 스펙이 다른 것들
3. **Phase 2-2**: `warranty_events` 테이블
   - 파일: `035_create_warranty_events_table.sql`
   - 상태: **파일 존재, 하지만 문서 스펙과 다름**
   - 차이점:
     - 문서: `event_type VARCHAR(50)`, `target_type`, `target_id`, `actor_type ENUM`, `metadata JSON`, `processed_at`
     - 현재: `event_type ENUM`, `warranty_id`, `old_value/new_value JSON`, `changed_by ENUM`
   - **조치 필요**: 문서 스펙에 맞게 수정 또는 새로 생성

4. **Phase 2-4**: `guest_order_access_tokens` 테이블
   - 파일: `031_create_guest_order_access_tokens_table.sql`
   - 상태: **파일 존재, 하지만 문서 스펙과 다름**
   - 차이점:
     - 문서: `token VARCHAR(100) UNIQUE`, `expires_at`, `revoked_at`
     - 현재: `token_hash VARCHAR(64)`, 구조 약간 다름
   - **조치 필요**: 문서 스펙 확인 후 필요시 수정

5. **Phase 2-5**: `claim_tokens` 테이블
   - 파일: `032_create_claim_tokens_table.sql`
   - 상태: **파일 존재, 하지만 문서 스펙과 다름**
   - 차이점:
     - 문서: `token VARCHAR(100) UNIQUE`, `order_id`, `expires_at`, `used_at`
     - 현재: `token_hash VARCHAR(64)`, `user_id` 포함, 구조 약간 다름
   - **조치 필요**: 문서 스펙 확인 후 필요시 수정

### ❌ 아직 없는 것들
6. **Phase 2-3**: `warranty_transfers` 테이블
   - 상태: **마이그레이션 파일 없음**
   - **필요**: 새로 생성 필요

7. **Phase 2-6**: `shipments` 테이블
   - 상태: **마이그레이션 파일 없음**
   - **필요**: 새로 생성 필요

8. **Phase 2-7**: `shipment_units` 테이블
   - 상태: **마이그레이션 파일 없음**
   - **필요**: 새로 생성 필요

9. **Phase 2-8**: `order_item_units.current_shipment_id` 컬럼
   - 상태: **마이그레이션 파일 없음**
   - **필요**: 새로 생성 필요

10. **Phase 2-9**: `order_item_units.active_lock` 컬럼
    - 상태: **마이그레이션 파일 없음**
    - **필요**: 새로 생성 필요

---

## 🎯 다음 단계 (우선순위 순)

### 즉시 확인 필요
1. **DB 상태 확인**: Phase 2-1, 2-10이 실제로 실행되었는지 확인
   ```sql
   -- warranties 테이블 구조 확인
   SHOW CREATE TABLE warranties;
   
   -- orders.paid_at 확인
   DESCRIBE orders;
   ```

2. **warranties.active_key 확인**: 문서 스펙에 있는 `active_key` generated column이 있는지 확인
   ```sql
   SHOW CREATE TABLE warranties;
   ```

### Phase 2 완성 (최우선)
**목적**: QR/디지털 보증서/인보이스 기능의 기반 완성

**작업 순서**:

#### Step 1: 기존 마이그레이션 검증 및 보완
1. **warranties.active_key 추가** (Phase 2-1 보완)
   - 파일: `backend/migrations/073_add_warranties_active_key.sql`
   - `active_key` generated column 추가
   - `UNIQUE INDEX uk_warranties_active_key` 추가

2. **warranty_events 테이블 수정** (Phase 2-2)
   - 옵션 A: 기존 테이블을 문서 스펙에 맞게 수정
   - 옵션 B: 새 테이블 생성 후 기존 데이터 마이그레이션
   - 파일: `backend/migrations/074_update_warranty_events_table.sql` 또는 새로 생성

3. **guest_order_access_tokens, claim_tokens 검토**
   - 문서 스펙과 비교하여 필요시 수정
   - 또는 기존 구조가 작동하면 그대로 사용

#### Step 2: 누락된 테이블 생성
4. **warranty_transfers 테이블 생성** (Phase 2-3)
   - 파일: `backend/migrations/075_create_warranty_transfers_table.sql`
   - 문서 스펙 그대로 생성

5. **shipments 테이블 생성** (Phase 2-6)
   - 파일: `backend/migrations/076_create_shipments_table.sql`
   - `active_key` generated column 포함

6. **shipment_units 테이블 생성** (Phase 2-7)
   - 파일: `backend/migrations/077_create_shipment_units_table.sql`

7. **order_item_units 컬럼 추가** (Phase 2-8, 2-9)
   - 파일: `backend/migrations/078_add_order_item_units_shipment_and_lock.sql`
   - `current_shipment_id` 컬럼 추가
   - `active_lock` generated column 추가
   - UNIQUE 제약 추가

#### Step 3: 검증
8. **Phase 2 완료 검증**
   - 모든 테이블/컬럼 생성 확인
   - FK 제약 확인
   - UNIQUE 제약 확인

---

## 📋 Phase 2 완료 후 가능한 작업

### Phase 3: processPaidOrder() 업데이트
- Phase 2-1 완료 후 가능
- warranties 생성 시 새로운 컬럼들 설정

### Phase 5: 보증서 활성화 API
- Phase 2-1, 2-2 완료 후 가능
- `POST /api/warranties/:warrantyId/activate`

### Phase 7: QR 스캔 로직 수정
- Phase 2-1 완료 후 가능
- warranty 생성 제거, 조회만 수행

### Phase 6, 8, 9, 10, 11, 12, 14
- Phase 2 완료 후 순차적으로 진행 가능

---

## 🔍 확인이 필요한 사항

1. **현재 DB 상태**: 
   - Phase 2-1, 2-10이 실제로 실행되었는지?
   - warranties 테이블에 `active_key`가 있는지?
   - warranty_events, guest_order_access_tokens, claim_tokens 테이블이 실제로 생성되었는지?

2. **기존 마이그레이션 파일 스펙**:
   - 문서 스펙과 다른 부분이 실제로 작동하는지?
   - 수정이 필요한지, 아니면 그대로 사용 가능한지?

---

## 💡 권장 실행 순서

1. **DB 상태 확인** (즉시)
   - VPS에서 실제 테이블 구조 확인
   - Phase 2-1, 2-10 실행 여부 확인

2. **Phase 2 완성** (최우선)
   - 누락된 테이블/컬럼 생성
   - 기존 테이블 스펙 검토 및 필요시 수정

3. **Phase 3 진행** (Phase 2 완료 후)
   - processPaidOrder() 업데이트

4. **Phase 5, 7 진행** (Phase 2, 3 완료 후)
   - 보증서 활성화 API
   - QR 스캔 로직 수정

---

**다음 액션**: VPS에서 DB 상태 확인 후 Phase 2 완성 작업 시작
