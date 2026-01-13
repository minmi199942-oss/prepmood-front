# 스키마 결정 가이드: 유기적 판단 방법론

**목적**: 단편적 접근을 피하고, 전체 구조를 유기적으로 파악하여 일관된 결정을 내리기

---

## 🎯 핵심 원칙

### 1. 실제 구조 우선 (Reality First)
- 문서는 "이상적 목표"일 수 있음
- 이미 작동하는 구조는 최대한 존중
- 변경은 명확한 이점이 있을 때만

### 2. 전체 맥락 파악 (Context Awareness)
- 단일 테이블이 아닌 전체 관계 파악
- 마이그레이션 히스토리 추적
- 의존성 체인 이해

### 3. 점진적 개선 (Incremental Improvement)
- 한 번에 모든 것을 바꾸지 않음
- 작동하는 것부터 완성
- 필요시 점진적 리팩토링

---

## 📋 체크리스트: 새 마이그레이션 작성 전

### Step 1: 기존 구조 전체 파악
- [ ] 관련 테이블의 모든 마이그레이션 파일 검색
- [ ] 실제 DB 구조 확인 (SHOW CREATE TABLE)
- [ ] FK 관계 전체 매핑
- [ ] 인덱스 및 제약 조건 확인

### Step 2: 문서 스펙과 비교
- [ ] 문서에서 요구하는 구조 파악
- [ ] 실제 구조와의 차이점 명확히 식별
- [ ] 차이점의 이유 파악 (보안, 성능, 단순화 등)

### Step 3: 영향도 분석
- [ ] 기존 코드가 사용하는 구조 확인
- [ ] 변경 시 영향받는 코드 범위
- [ ] 데이터 마이그레이션 필요 여부

### Step 4: 결정
- [ ] 실제 구조 유지 vs 문서 스펙 적용
- [ ] 하이브리드 접근 가능 여부
- [ ] 점진적 전환 계획

---

## 🔍 실제 사례: Phase 2 분석

### Case 1: order_item_units.current_shipment_id
**초기 판단**: 없음 → 추가 필요  
**실제 확인**: `027_create_order_item_units_table.sql`에 이미 포함  
**결과**: 중복 작업 방지

### Case 2: warranty_events
**문서 스펙**: 범용 구조 (target_type/id, metadata, processed_at)  
**실제 구조**: 직접 참조 (warranty_id, old_value/new_value)  
**판단**: 실제 구조가 더 단순하고 직관적 → 유지 권장

### Case 3: guest_order_access_tokens
**문서 스펙**: 평문 token  
**실제 구조**: token_hash (해시)  
**판단**: 실제 구조가 보안상 우수 → 유지 권장

### Case 4: shipments 테이블
**문서 스펙**: 별도 테이블 분리  
**실제 구조**: order_item_units에 직접 포함 (039)  
**판단**: 선택 필요 (단순 vs 정규화)

---

## 🛠️ 실전 워크플로우

### 1. 새 기능 추가 전
```bash
# 1. 관련 테이블 전체 검색
grep -r "CREATE TABLE.*테이블명" backend/migrations/
grep -r "ALTER TABLE.*테이블명" backend/migrations/

# 2. 실제 DB 구조 확인
mysql> SHOW CREATE TABLE 테이블명;

# 3. 관련 코드 검색
grep -r "테이블명" backend/
```

### 2. 문서 작성 시
- 실제 구조를 먼저 문서화
- 문서 스펙과의 차이 명시
- 선택 이유 설명

### 3. 마이그레이션 작성 시
- 기존 구조 존중
- idempotent 체크 (IF NOT EXISTS 등)
- 기존 데이터 마이그레이션 포함

---

## 📊 구조 비교 도구

### 마이그레이션 파일 분석 스크립트
```bash
# 모든 CREATE TABLE 추출
grep -h "CREATE TABLE" backend/migrations/*.sql | sort | uniq

# 모든 ALTER TABLE ADD COLUMN 추출
grep -h "ALTER TABLE.*ADD COLUMN" backend/migrations/*.sql

# FK 관계 전체 매핑
grep -h "FOREIGN KEY" backend/migrations/*.sql
```

### DB 구조 확인 쿼리
```sql
-- 테이블 목록
SHOW TABLES;

-- 특정 테이블 구조
SHOW CREATE TABLE 테이블명;

-- FK 관계 전체
SELECT 
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME;
```

---

## 🎓 학습 포인트

### 실수했던 부분
1. **order_item_units**: 이미 current_shipment_id, active_lock 포함 → 중복 작업
2. **warranty_events**: 문서 스펙만 보고 새로 만들려 했음 → 기존 구조 확인 필요
3. **guest_order_access_tokens**: 문서 스펙만 보고 수정하려 했음 → 실제 구조가 더 나음

### 개선 방법
1. **항상 기존 마이그레이션 파일 전체 검색**
2. **실제 DB 구조 확인 (SHOW CREATE TABLE)**
3. **관련 코드 검색 (grep)**
4. **문서는 "참고"로, 실제 구조는 "기준"으로**

---

## 📝 문서 업데이트 원칙

### 실제 구조 반영
- 마이그레이션 파일이 실제 구조
- 문서는 "이상적 목표"일 수 있음
- 실제 구조와 다르면 문서 업데이트 고려

### 차이점 명시
- 문서에 "실제 구조" 섹션 추가
- 차이점과 이유 명시
- 마이그레이션 경로 제시

---

**이 가이드를 따라 작업하면 단편적 접근을 피하고, 전체 구조를 유기적으로 파악할 수 있습니다.**
