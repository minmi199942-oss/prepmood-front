# Product ID 마이그레이션 실행 계획

## 📋 실행 순서 (효율적, 충돌 최소화)

### ✅ Phase 1 완료
- [x] 신규 상품 규칙 정의 문서화
- [x] 관리자 페이지 수정 (슬래시 검증)
- [x] 백엔드 API 수정 (신규 상품 ID 검증)
- [ ] **다음**: DB 확장 마이그레이션 실행

---

## 🚀 실행 단계

### Step 1: DB 확장 (운영 영향 0) ⚡ 즉시 실행 가능

**목적**: admin_products.id를 VARCHAR(128)로 확장

**파일**: `backend/migrations/050_extend_admin_products_id_to_128.sql`

**실행 순서**:
1. 백업 (선택사항, 안전을 위해)
2. 마이그레이션 스크립트 실행
3. 결과 확인

**예상 시간**: 1-2분

**리스크**: 거의 없음 (컬럼 확장은 안전)

---

### Step 2: 데이터 분석 (Phase 2) 📊

**목적**: 기존 상품 패턴 확인, 중복 확인, 마이그레이션 영향도 파악

**작업**:
1. 기존 product_id 패턴 분석 스크립트 실행
2. 중복 확인 (new_id + name 조합)
3. 참조 무결성 확인 (stock_units, order_items, token_master)

**예상 시간**: 30분-1시간

**결과물**:
- 중복 리스트 (수동 해결 필요)
- 참조 무결성 리포트
- 마이그레이션 영향도 평가

---

### Step 3: Expand (스키마 확장) - 운영 영향 0 ⚡

**목적**: canonical_id 컬럼 추가, 매핑 테이블 생성

**작업 순서**:
1. 전체 데이터베이스 백업
2. 매핑 테이블 생성 (idempotent)
3. 매핑 데이터 생성 (SUBSTRING_INDEX 사용)
4. admin_products.canonical_id 컬럼 추가
5. stock_units.product_id_canonical 컬럼 추가

**예상 시간**: 5-10분

**리스크**: 낮음 (컬럼 추가만, NULL 허용)

---

### Step 4: Backfill (데이터 채우기) - 운영 영향 최소 ⚡

**목적**: canonical_id 백필, 중복 해결, NOT NULL 제약 추가

**작업 순서**:
1. admin_products.canonical_id 백필
2. stock_units.product_id_canonical 백필
3. 중복 확인 및 해결 (수동)
4. canonical_id NOT NULL 제약 추가
5. UNIQUE 인덱스 생성
6. 참조 무결성 확인

**예상 시간**: 10-30분 (중복 해결 시간 제외)

**리스크**: 중간 (중복 발생 시 수동 해결 필요)

---

### Step 5: 코드 배포 1차 (Dual-read) 🔄

**목적**: 조회는 양쪽 지원, 기존 기능 유지

**작업**:
1. 정규화 함수 구현 (resolveProductId, resolveProductIdBoth, resolveProductIdWithLogging)
2. 옵션 API 수정 (dual-read, SQL 괄호 버그 수정)
3. 재고 조회 수정 (dual-read)
4. 토큰 조회 수정 (dual-read, 최우선)
5. 관리자 UI fallback 지원

**예상 시간**: 2-3시간

**리스크**: 낮음 (기존 기능 유지, 새 기능 추가만)

**검증**: 
- 기존 기능 정상 동작 확인
- legacy ID로 조회 가능 확인

---

### Step 6: 코드 배포 2차 (Dual-write) 🔄

**목적**: 쓰기는 canonical로 저장, 점진적 전환

**작업**:
1. 신규 상품 생성: canonical_id=id 강제
2. 신규 stock_units: resolveProductIdBoth로 legacy_id/canonical_id 둘 다 저장
3. 주문 생성: canonical로 저장
4. 토큰 생성: canonical로 저장

**예상 시간**: 1-2시간

**리스크**: 낮음 (새 데이터만 영향)

**검증**:
- 신규 상품 생성 시 canonical_id 자동 설정 확인
- 신규 stock_units 생성 시 양쪽 모두 저장 확인

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
1. Step 1: DB 확장 (즉시, 운영 영향 0)
   ↓
2. Step 2: 데이터 분석 (30분-1시간)
   ↓
3. Step 3: Expand (5-10분, 운영 영향 0)
   ↓
4. Step 4: Backfill (10-30분, 중복 해결 시간 제외)
   ↓
5. Step 5: 코드 배포 1차 - Dual-read (2-3시간)
   ↓
6. Step 6: 코드 배포 2차 - Dual-write (1-2시간)
   ↓
7. Step 7: 검증 기간 (1-2주, 모니터링만)
   ↓
8. Step 8: Cutover (10-30분, 점검창)
```

---

## ⚠️ 주의사항

1. **Step 1-4**: 운영 영향 최소, 안전하게 진행 가능
2. **Step 5-6**: 코드 배포는 단계별로, 각 단계마다 검증
3. **Step 7**: 충분한 검증 기간 확보 필수
4. **Step 8**: 사전 리허설 필수, 짧은 점검창 확보

---

**문서 버전**: 1.0  
**작성일**: 2026-01-11
