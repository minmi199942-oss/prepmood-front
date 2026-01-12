# Product ID 마이그레이션 실행 계획

## 📋 실행 순서 (효율적, 충돌 최소화)

### ✅ Phase 1 완료
- [x] 신규 상품 규칙 정의 문서화
- [x] 관리자 페이지 수정 (슬래시 검증)
- [x] 백엔드 API 수정 (신규 상품 ID 검증)

### ✅ Step 1-5 완료
- [x] Step 1: DB 확장 (050)
- [x] Step 2: 데이터 분석
- [x] Step 3: Expand (062, 063)
- [x] Step 4: Backfill (064, 065)
- [x] Step 5: Dual-read 구현

---

## 🚀 실행 단계

### Step 1: DB 확장 (운영 영향 0) ⚡ ✅ 완료

**목적**: admin_products.id를 VARCHAR(128)로 확장

**파일**: `backend/migrations/050_extend_admin_products_id_to_128.sql`

**예상 시간**: 1-2분

**리스크**: 거의 없음 (컬럼 확장은 안전)

---

### Step 2: 데이터 분석 (Phase 2) 📊 ✅ 완료

**목적**: 기존 상품 패턴 확인, 중복 확인, 마이그레이션 영향도 파악

**작업**:
1. 기존 product_id 패턴 분석 스크립트 실행
2. 중복 확인 (new_id + name 조합)
3. 참조 무결성 확인 (stock_units, order_items, token_master)
4. orphan 상품 정리 (051)

**예상 시간**: 30분-1시간

---

### Step 3: Expand (스키마 확장) - 운영 영향 0 ⚡ ✅ 완료

**목적**: canonical_id 컬럼 추가, 매핑 테이블 생성

**작업 순서**:
1. PM-25 → PM-26 변경 (052)
2. 매핑 테이블 생성 (062)
3. admin_products.canonical_id 컬럼 추가 (063)
4. stock_units.product_id_canonical 컬럼 추가 (063)

**예상 시간**: 5-10분

**리스크**: 낮음 (컬럼 추가만, NULL 허용)

---

### Step 4: Backfill (데이터 채우기) - 운영 영향 최소 ⚡ ✅ 완료

**목적**: canonical_id 백필, 중복 해결, NOT NULL 제약 추가

**작업 순서**:
1. admin_products.canonical_id 백필 (064)
2. stock_units.product_id_canonical 백필 (064)
3. 중복 확인 및 해결 (수동)
4. canonical_id NOT NULL 제약 추가 (065)
5. UNIQUE 인덱스 생성 (065)
6. 참조 무결성 확인

**예상 시간**: 10-30분 (중복 해결 시간 제외)

**리스크**: 중간 (중복 발생 시 수동 해결 필요)

---

### Step 5: 코드 배포 1차 (Dual-read) 🔄 ✅ 완료

**목적**: 조회는 양쪽 지원, 기존 기능 유지

**작업**:
1. 정규화 함수 구현 (resolveProductId, resolveProductIdBoth, resolveProductIdWithLogging)
2. 옵션 API 수정 (dual-read, SQL 괄호 버그 수정)
3. 재고 조회 수정 (dual-read)
4. 토큰 조회 수정 (dual-read, 최우선)
5. 상품 조회 API 수정 (dual-read)

**예상 시간**: 2-3시간

**리스크**: 낮음 (기존 기능 유지, 새 기능 추가만)

**검증**: 
- 기존 기능 정상 동작 확인
- legacy ID로 조회 가능 확인

---

### Step 6: 코드 배포 2차 (Dual-write) 🔄 ⚠️ 진행 중

**목적**: 쓰기는 canonical로 저장, 점진적 전환

**⚠️ Step 6 전 스모크 테스트 (5-10분)**
1. 상품 옵션 API: legacy id로 호출 → 색상/사이즈 정상
2. 상품 옵션 API: canonical_id로 호출 → 동일하게 정상
3. 관리자 재고 조회: legacy 필터 → 정상
4. 토큰 조회(상품별): legacy 입력 → 토큰 정상

**작업 순서 (우선순위 순)**:

#### 6-1. 쓰기 유틸 함수 구현
**목적**: 입력 product_id를 받아서 canonical_id를 확정하는 단일 함수

**파일**: `backend/product-routes.js`, `backend/stock-routes.js`

**함수**: `resolveProductIdBoth()` (이미 구현됨)

#### 6-2. 재고 등록/수정 엔드포인트 dual-write 적용 ⭐ 최우선
**목적**: stock_units 생성 시 legacy_id/canonical_id 둘 다 저장

**파일**: `backend/stock-routes.js`

**규칙**:
- `stock_units.product_id` = legacy_id (기존 호환)
- `stock_units.product_id_canonical` = canonical_id (정규화)
- 저장 시점에 서버가 `resolveProductIdBoth()`로 확정

**리스크**: 낮음 (가장 효과 큼)

#### 6-3. 상품 생성/수정에서 canonical_id 자동 세팅 + 검증
**목적**: 신규 상품 생성 시 canonical_id=id 강제

**파일**: `backend/product-routes.js`

**규칙**:
- `admin_products.id` = legacy (기존 유지, PM-26 체계)
- `admin_products.canonical_id` = 정규화된 ID (자동 계산)
- 신규 상품이면 canonical_id는 "정규화(id에서 사이즈 제거/슬래시 제거 결과)" 자동 계산
- 서버단 검증: canonical_id가 비거나 잘못된 값이면 UNIQUE 때문에 바로 터짐

**리스크**: 낮음

#### 6-4. 주문 생성: order_items dual-write 적용 ⚠️ 선택지 A
**목적**: order_items에 product_id_canonical 컬럼 추가 후 dual-write

**⚠️ 결정**: **선택지 A (dual-write)** 채택
- **이유**: 
  - order_items는 FK 없음 (안전)
  - 기존 화면/리포트가 legacy를 기대할 수 있음
  - 점진적 전환이 안전함
  - 프론트엔드에서 product_id 직접 사용 안 함 (확인됨)

**작업**:
1. order_items에 `product_id_canonical VARCHAR(128)` 컬럼 추가
2. 주문 생성 시 `resolveProductIdBoth()`로 legacy_id/canonical_id 확정
3. `order_items.product_id` = legacy_id 저장
4. `order_items.product_id_canonical` = canonical_id 저장
5. 주문 조회 시 dual-read 지원 (기존 호환)

**파일**: 
- 마이그레이션: `backend/migrations/066_add_order_items_canonical.sql`
- 코드: `backend/order-routes.js`

**리스크**: 낮음 (점진적 전환)

#### 6-5. 토큰 발급/연결 (token_master) - 당장은 유지
**목적**: token_master는 당장은 legacy 유지

**이유**:
- 이미 FK가 `admin_products(id)`로 걸려있어서 바로 canonical로 바꾸기 어려움
- Step 5 dual-read로 이미 안전망 구축됨
- 추후에 token_master에 product_id_canonical 컬럼 추가하는 Phase로 분리 (Step 8 이후)

**리스크**: 없음 (당장 변경 안 함)

**⚠️ Step 6 후 스모크 테스트 (5-10분)**
5. 재고 1개 새로 추가 → stock_units에 product_id_canonical이 NULL 아닌지 확인
6. 상품 1개 수정(이름만 바꿔도 됨) → canonical_id 유지/정상
7. 옵션 API 다시 호출(legacy/canonical 둘 다) → 동일하게 정상
8. 주문 1개 생성 → order_items에 product_id_canonical 저장 확인

**예상 시간**: 1-2시간

**리스크**: 낮음 (새 데이터만 영향)

**검증**:
- 신규 상품 생성 시 canonical_id 자동 설정 확인
- 신규 stock_units 생성 시 양쪽 모두 저장 확인
- 신규 주문 생성 시 양쪽 모두 저장 확인

---

### Step 7: 검증 기간 (1-2주) 📈

**목적**: legacy 입력 hit rate 모니터링, 데이터 수렴 확인

**모니터링**:
- DB 기반: orphan/NULL 리포트 (일 단위)
- 로그 기반: legacy 입력 hit rate (일 단위)

**검증 완료 기준**:
- legacy hit rate 0% 수렴 (1주일 동안 0%)
- orphan_count 0
- canonical_null_count 0

**예상 시간**: 1-2주 (모니터링만)

---

### Step 8: Cutover (최종 전환) - 짧은 점검창 ⚠️

**목적**: 컬럼 swap, FK 교체, 최종 전환

**사전 작업**:
- 스테이징에서 리허설 (DDL 시간 측정, smoke test)

**작업 순서**:
1. FK 이름 조회
2. stock_units 컬럼 swap (FK 교체)
3. order_items 업데이트 (선택적)
4. token_master 업데이트 (선택적)
5. 정합성 리포트 확인
6. 핵심 플로우 smoke test

**예상 시간**: 10-30분 (점검창)

**리스크**: 중간 (컬럼 swap은 테이블 락 발생 가능)

---

## 🎯 최적 실행 순서 요약

```
1. Step 1: DB 확장 (✅ 완료)
   ↓
2. Step 2: 데이터 분석 (✅ 완료)
   ↓
3. Step 3: Expand (✅ 완료)
   ↓
4. Step 4: Backfill (✅ 완료)
   ↓
5. Step 5: 코드 배포 1차 - Dual-read (✅ 완료)
   ↓
6. Step 6: 코드 배포 2차 - Dual-write (⚠️ 진행 중)
   ├─ 6-1. 쓰기 유틸 함수 (✅ 완료)
   ├─ 6-2. 재고 등록/수정 (진행 예정)
   ├─ 6-3. 상품 생성/수정 (진행 예정)
   ├─ 6-4. 주문 생성 (선택지 A: dual-write) (진행 예정)
   └─ 6-5. 토큰 (당장 유지)
   ↓
7. Step 7: 검증 기간 (1-2주, 모니터링만)
   ↓
8. Step 8: Cutover (10-30분, 점검창)
```

---

## ⚠️ 주의사항

1. **Step 1-4**: 운영 영향 최소, 안전하게 진행 가능 ✅
2. **Step 5-6**: 코드 배포는 단계별로, 각 단계마다 검증
3. **Step 6 전/후**: 스모크 테스트 필수 (5-10분)
4. **Step 7**: 충분한 검증 기간 확보 필수
5. **Step 8**: 사전 리허설 필수, 짧은 점검창 확보

---

## 📝 Step 6 상세 계획

### 6-4. order_items dual-write 상세

**마이그레이션**: `backend/migrations/066_add_order_items_canonical.sql`
```sql
-- order_items에 product_id_canonical 컬럼 추가
ALTER TABLE order_items
ADD COLUMN product_id_canonical VARCHAR(128) NULL
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
AFTER product_id;

-- 인덱스 추가 (조회 성능)
CREATE INDEX idx_order_items_product_id_canonical 
ON order_items(product_id_canonical);
```

**코드 수정**: `backend/order-routes.js`
- 주문 생성 시: `resolveProductIdBoth()`로 legacy_id/canonical_id 확정
- `order_items.product_id` = legacy_id 저장
- `order_items.product_id_canonical` = canonical_id 저장
- 주문 조회 시: dual-read 지원 (기존 호환)

**리스크**: 낮음 (FK 없음, 점진적 전환)

---

**문서 버전**: 2.0  
**최종 업데이트**: 2026-01-11  
**Step 6 결정**: 선택지 A (dual-write) 채택
