# 현재 상태 및 다음 단계 분석

**🚀 작업 시작**: 작업할 때는 **`START_HERE.md`**를 먼저 보세요.

**⚠️ 중요**: 데이터베이스 스키마 구조는 `SCHEMA_SSOT.md`를 기준으로 합니다.

**분석 기준**: 
- `SCHEMA_SSOT.md`: 데이터베이스 스키마 실제 구조 (최종 기준)
- `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`: 구현 로드맵 (2026-01-11 기준)

## ✅ 완료된 작업

### Phase 15 (중기 개선)
- ✅ **15-1**: `product_options` 테이블 생성 완료
- ✅ **15-2**: 옵션 API 수정 완료 (product_options 기반, 재고 없는 옵션도 표시)
- ✅ **15-3**: 관리자 페이지 옵션 관리 기능 완료

### Phase 13: 관리자 페이지 개선
- ✅ **13-1**: 주문 상세 API 3단 구조 응답 완료
- ✅ **13-2**: 주문 상세 프론트엔드 3단 구조 완료
- ✅ **13-3**: 보증서 상세 화면 완료

### Phase 14: 프론트엔드 사용자 페이지
- ✅ **14-1**: 보증서 활성화 페이지 완료
- ✅ **14-2**: 보증서 양도 요청 완료
- ✅ **14-3**: 양도 수락 페이지 완료
- ✅ **14-4**: 비회원 주문 조회 페이지 완료

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

## ✅ Phase 2 핵심 인프라 (완료)

**완료일**: 2026-01-13 (실제 DB 구조 확인 완료 - `db_structure_actual.txt` 기준)

### 완료된 마이그레이션
1. ✅ **073**: warranties.active_key 추가 (완료)
2. ✅ **074**: warranty_transfers 테이블 생성 (완료)
3. ✅ **075**: guest_order_access_tokens 테이블 생성 (완료)
4. ✅ **076**: claim_tokens 테이블 생성 (완료)
5. ✅ **077**: shipments 테이블 생성 (완료)
6. ✅ **078**: shipment_units 테이블 생성 (완료)

### 실제 DB 구조 확인 (db_structure_actual.txt 기준)

**warranties 테이블**:
- ✅ `status` ENUM 존재 (`issued_unassigned`, `issued`, `active`, `suspended`, `revoked`)
- ✅ `owner_user_id` 존재
- ✅ `source_order_item_unit_id` 존재
- ✅ `activated_at` 존재
- ✅ `revoked_at` 존재
- ✅ `active_key` VIRTUAL GENERATED 존재
- ✅ `token_pk` 존재
- ✅ UNIQUE `uk_warranties_active_key` 존재
- ✅ UNIQUE `uk_warranties_token_pk` 존재

**order_item_units 테이블**:
- ✅ `current_shipment_id` 존재
- ✅ `active_lock` VIRTUAL GENERATED 존재
- ✅ UNIQUE `uk_stock_unit_active` (stock_unit_id, active_lock) 존재

**shipments 테이블**:
- ✅ `active_key` VIRTUAL GENERATED 존재
- ✅ UNIQUE `uk_shipments_active_key` 존재

**shipment_units 테이블**:
- ✅ 복합키 (shipment_id, order_item_unit_id) 존재

**warranty_transfers 테이블**:
- ✅ 모든 컬럼 존재 (transfer_id, warranty_id, from_user_id, to_email, to_user_id, transfer_code, status, expires_at 등)

**guest_order_access_tokens 테이블**:
- ✅ `token VARCHAR(100) UNIQUE` (평문) 존재
- ✅ `expires_at`, `revoked_at` 존재

**claim_tokens 테이블**:
- ✅ `token VARCHAR(100) UNIQUE` (평문) 존재
- ✅ `expires_at`, `used_at` 존재

**orders 테이블**:
- ✅ `paid_at` 컬럼 존재

**warranty_events 테이블**:
- ✅ 테이블 존재 (실제 구조는 단순 구조 사용: warranty_id, event_type ENUM, old_value/new_value JSON)

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

---

## ✅ 최근 완료된 작업 (2026-01-16)

### Phase 13: 관리자 페이지 개선 (완료)
- ✅ Phase 13-1: 주문 상세 API 3단 구조 응답 (`backend/index.js`)
- ✅ Phase 13-2: 주문 상세 프론트엔드 3단 구조 (`admin-qhf25za8/admin-orders.js`)
- ✅ Phase 13-3: 보증서 상세 화면 (`admin-qhf25za8/admin-warranties.js`)
  - 보증서 검색 기능
  - 보증서 상세 화면 (상태 카드, 소유자 정보, 연결 정보, 이력 타임라인)

### Phase 14: 프론트엔드 사용자 페이지 (완료)
- ✅ Phase 14-1: 보증서 활성화 페이지 (`my-warranties.html`)
- ✅ Phase 14-2: 보증서 양도 요청 (`my-warranties.html`)
- ✅ Phase 14-3: 양도 수락 페이지 (`warranty-transfer-accept.html`)
- ✅ Phase 14-4: 비회원 주문 조회 페이지 (`guest/orders.html`)
  - 결제 정보 표시 포함
  - 정책 링크 포함

### Phase 15-3: 관리자 옵션 관리 기능 (완료)
- ✅ 옵션 조회/추가/수정/삭제 API
- ✅ 관리자 페이지 UI (상품 수정 모달에 옵션 관리 섹션)

## 🎯 다음 단계 (우선순위 순)

### 🔴 즉시 (장애 해결)
1. **주문 후처리 파이프라인 복구** (필요 시)
   - `paid_events` 생성 여부 확인
   - `paid_event_processing` 상태 확인 (`pending`/`failed`)
   - `order_item_units`, `warranties`, `invoices` 생성 여부 확인
   - `order_stock_issues` 기록 확인
   - 참조: `GPT_OPINIONS_INTEGRATED_ANALYSIS.md` (8. 우선순위 최종 정리)

### 🟡 단기 (1-2주)
2. **orders.created_at/updated_at 추가**
   - 현재 `orders.order_date`만 있어서 마지막 갱신 시각 추적 불가
   - 장애/정산/CS에 즉효
   - 마이그레이션 파일 작성 필요

### 🟢 중기 개선 (선택적)
3. **선예약형 재고 관리 (Phase 4)**
   - 선택적 작업
   - 현재 방식도 동작하므로 낮은 우선순위

### 🟢 장기 리팩토링 (선택적)
4. **Phase 16: Product ID 구조 개선**
   - 사이즈/색상 코드 제거
   - 장기 리팩토링

5. **token_pk 마이그레이션**
   - ⚠️ 복잡, 신중하게 진행 필요
