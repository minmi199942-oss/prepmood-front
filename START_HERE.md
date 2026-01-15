# 🚀 작업 시작 가이드 (이 문서 하나만 보세요)

**⚠️ 중요**: 작업할 때는 이 문서만 보면 됩니다. 다른 문서는 필요할 때만 참조하세요.

---

## 📋 작업 전 체크리스트

### 1. 무엇을 해야 하나요?
→ **`COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`** 확인
- Phase별 작업 목록
- 현재 완료된 작업 확인
- 다음 단계 확인

### 2. 데이터베이스 구조는 어떻게 되어 있나요?
→ **`SCHEMA_SSOT.md`** 확인
- 실제 테이블 구조 (최종 기준)
- 마이그레이션 파일 위치
- 실제 구조 vs 문서 스펙 차이

### 3. 현재 상태는 어떤가요?
→ **`CURRENT_STATUS_AND_NEXT_STEPS.md`** 확인
- 완료된 작업
- 진행 중인 작업
- 다음 단계

---

## 🎯 실제 작업 시 참조 순서

### Step 1: 무엇을 할지 결정
```
1. COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md 열기
2. "현재 구현 상태" 섹션 확인
3. 다음 Phase 확인
```

### Step 2: 데이터베이스 구조 확인
```
1. SCHEMA_SSOT.md 열기
2. 관련 테이블 구조 확인
3. 마이그레이션 파일 위치 확인
```

### Step 3: 작업 시작
```
1. Phase별 작업 내용 확인 (ROADMAP)
2. 마이그레이션 파일 작성/실행
3. 코드 수정
```

---

## 📚 문서 계층 구조 (참조용)

### Level 1: 작업 시 필수 (이 문서 + 3개)
- ✅ **`START_HERE.md`** ← **지금 보고 있는 문서**
- ✅ **`COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`** ← 무엇을 할지
- ✅ **`SCHEMA_SSOT.md`** ← DB 구조
- ✅ **`CURRENT_STATUS_AND_NEXT_STEPS.md`** ← 현재 상태

### Level 2: 필요 시 참조 (상세 정보)
- `FINAL_EXECUTION_SPEC_REVIEW.md` ← 핵심 정책 상세 (SSOT 규칙, 상태 전이표 등)
- `SYSTEM_FLOW_DETAILED.md` ← 시스템 흐름도 상세
- `SCHEMA_DECISION_GUIDE.md` ← 스키마 결정 방법론

### Level 3: 분석/참고 문서 (필요 시만)
- `DATABASE_SCHEMA_ACTUAL_STATE.md` ← 상세 분석
- `DOCUMENT_CONSISTENCY_ANALYSIS.md` ← 일관성 분석
- `DOCUMENT_CONSISTENCY_CHECK.md` ← 일관성 체크 가이드

---

## 🔍 빠른 참조표

| 작업 | 참조 문서 | 위치 |
|------|----------|------|
| **무엇을 해야 하나?** | `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md` | Phase별 작업 목록 |
| **DB 구조는?** | `SCHEMA_SSOT.md` | 테이블 구조 섹션 |
| **현재 상태는?** | `CURRENT_STATUS_AND_NEXT_STEPS.md` | 완료된 작업 섹션 |
| **핵심 정책은?** | `FINAL_EXECUTION_SPEC_REVIEW.md` | SSOT 규칙, 상태 전이표 |
| **시스템 흐름은?** | `SYSTEM_FLOW_DETAILED.md` | Phase별 흐름도 |
| **스키마 결정 방법은?** | `SCHEMA_DECISION_GUIDE.md` | 체크리스트 |

---

## 💡 실제 사용 예시

### 예시 1: Phase 2 마이그레이션 실행
```
1. START_HERE.md 확인 → "무엇을 해야 하나요?" → ROADMAP 확인
2. ROADMAP에서 Phase 2 확인 → 어떤 테이블을 만들어야 하는지 확인
3. SCHEMA_SSOT.md 확인 → 실제 구조 확인 (이미 있는지, 없으면 생성)
4. 마이그레이션 파일 실행
```

### 예시 2: 새 기능 구현
```
1. START_HERE.md 확인 → "무엇을 해야 하나요?" → ROADMAP 확인
2. ROADMAP에서 해당 Phase 확인 → 작업 내용 확인
3. FINAL_EXECUTION_SPEC_REVIEW.md 확인 → 핵심 정책 확인 (SSOT 규칙 등)
4. SYSTEM_FLOW_DETAILED.md 확인 → 흐름도 확인
5. 코드 작성
```

### 예시 3: DB 구조 변경
```
1. START_HERE.md 확인 → "DB 구조는?" → SCHEMA_SSOT.md 확인
2. SCHEMA_DECISION_GUIDE.md 확인 → 체크리스트 따라 확인
3. 관련 마이그레이션 파일 검색
4. 마이그레이션 파일 작성/실행
5. SCHEMA_SSOT.md 업데이트
```

---

## ⚠️ 중요 원칙

### 1. 문서 우선순위
1. **SCHEMA_SSOT.md** (DB 구조 최종 기준)
2. **COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md** (작업 목록)
3. **FINAL_EXECUTION_SPEC_REVIEW.md** (핵심 정책)

### 2. 충돌 시 해결
- **DB 구조 충돌**: `SCHEMA_SSOT.md`가 최종 기준
- **정책 충돌**: `FINAL_EXECUTION_SPEC_REVIEW.md`가 최종 기준
- **작업 순서 충돌**: `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`가 최종 기준

### 3. 문서 업데이트 원칙
- **DB 구조 변경 시**: `SCHEMA_SSOT.md` 먼저 업데이트
- **작업 완료 시**: `CURRENT_STATUS_AND_NEXT_STEPS.md` 업데이트
- **새 Phase 추가 시**: `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md` 업데이트

---

## 🎯 다음 작업 시작하기

### 지금 바로 시작하려면:
1. **`WORK_STATUS_SUMMARY.md`** 열기 ← **현재 상태 및 다음 단계 요약**
2. "다음 단계" 섹션 확인
3. 해당 Phase의 작업 시작

### 현재 상태 요약
**완료된 것**:
- ✅ 기본 인프라 (orders, warranties 기본 구조, order_item_units 등)
- ✅ processPaidOrder() 함수 구현
- ✅ QR 코드 다운로드 API
- ✅ 인보이스 생성 로직
- ✅ Product ID 리팩토링 완료
- ✅ Phase 15 (product_options) 완료

**다음 단계 (최우선)**:
1. **VPS에서 DB 상태 확인** (실제로 무엇이 실행되었는지)
2. **Phase 2 마이그레이션 실행** (073~078)
   - warranties.active_key 추가
   - warranty_transfers 테이블
   - guest_order_access_tokens 테이블
   - claim_tokens 테이블
   - shipments 테이블
   - shipment_units 테이블
3. **Phase 3**: processPaidOrder() 업데이트
4. **Phase 5, 7**: 보증서 활성화 API, QR 스캔 로직 수정

### 예시: Phase 2 마이그레이션 실행
```
1. WORK_STATUS_SUMMARY.md 확인
   → "Step 1: DB 상태 확인" 실행

2. VPS에서 DB 상태 확인 쿼리 실행
   → 무엇이 이미 실행되었는지 확인

3. Phase 2 마이그레이션 실행 (073~078)
   → 실행 명령어는 WORK_STATUS_SUMMARY.md에 있음

4. 검증
   → 테이블 생성 확인
```

---

**이 문서 하나만 보면 모든 작업을 시작할 수 있습니다!**
