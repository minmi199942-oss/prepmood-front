# 문서 일관성 검증 가이드

**목적**: 여러 MD 파일 간의 일관성 유지 및 충돌 방지

---

## 📋 문서 계층 구조

### Level 1: 최종 기준 (SSOT)
- **`SCHEMA_SSOT.md`**: 데이터베이스 스키마 실제 구조 (최종 기준)
  - VPS 실제 DB 구조 반영
  - 마이그레이션 파일 전체 분석
  - 다른 모든 문서의 기준

### Level 2: 구현 가이드
- **`COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`**: 전체 구현 로드맵
  - 이상적 목표 포함
  - `SCHEMA_SSOT.md` 참조 명시
  - Phase별 작업 계획

### Level 3: 상태/분석 문서
- **`CURRENT_STATUS_AND_NEXT_STEPS.md`**: 현재 진행 상황
  - `SCHEMA_SSOT.md` 기반
  - 다음 단계 제시

- **`DATABASE_SCHEMA_ACTUAL_STATE.md`**: 상세 분석
  - `SCHEMA_SSOT.md` 요약
  - 차이점 상세 설명

---

## 🔍 일관성 체크 방법

### 1. 새 문서 작성 시
```markdown
**⚠️ 중요**: 데이터베이스 스키마는 `SCHEMA_SSOT.md`를 기준으로 합니다.
```

### 2. 기존 문서 수정 시
- `SCHEMA_SSOT.md` 먼저 확인
- 충돌 발견 시 `SCHEMA_SSOT.md` 기준으로 수정

### 3. 정기적 검증
```bash
# SCHEMA_SSOT.md 언급 검색
grep -r "SCHEMA_SSOT" *.md

# 스키마 관련 언급 검색
grep -r "warranties\|order_item_units\|shipments" *.md
```

---

## ⚠️ 충돌 해결 규칙

1. **스키마 구조**: `SCHEMA_SSOT.md`가 최종 기준
2. **구현 계획**: `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md` 참고
3. **진행 상황**: `CURRENT_STATUS_AND_NEXT_STEPS.md` 확인

---

## 📝 문서 업데이트 워크플로우

### 스키마 변경 시
1. VPS에서 실제 구조 확인
2. `SCHEMA_SSOT.md` 업데이트
3. 다른 문서들 `SCHEMA_SSOT.md` 참조 추가/수정

### 새 기능 추가 시
1. `SCHEMA_SSOT.md` 확인
2. `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`에 Phase 추가
3. `CURRENT_STATUS_AND_NEXT_STEPS.md` 업데이트

---

**이 가이드를 따라 문서 간 일관성을 유지합니다.**
