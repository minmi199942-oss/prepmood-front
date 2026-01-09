# Phase 1 데이터베이스 스키마 구현 가이드

## 📋 목표
Phase 1의 모든 마이그레이션 스크립트를 순서대로 실행하여 데이터베이스 스키마를 완성

---

## ⚠️ 사전 준비

### 1. 데이터베이스 백업 (필수)
```bash
mysqldump -u prepmood_user -p prepmood > prepmood_backup_$(date +%Y%m%d_%H%M%S).sql --no-tablespaces
```

### 2. 현재 상태 확인
```sql
-- token_master 테이블 확인
SELECT COUNT(*) as token_count FROM token_master;

-- warranties 테이블 확인
SELECT COUNT(*) as warranty_count FROM warranties;

-- 기존 FK 확인
SELECT 
    TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token';
```

---

## 🚀 실행 순서

### Phase 1-1: token_pk 마이그레이션 (최우선)

**파일**: `022_token_pk_migration_phase1_token_master.sql`

**주의사항**:
- ⚠️ **가장 중요한 마이그레이션** - 모든 후속 작업의 기반
- 백업 필수
- 실행 시간: 데이터 양에 따라 다름 (수십 초 ~ 수분)

**실행 명령**:
```bash
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < migrations/022_token_pk_migration_phase1_token_master.sql
```

**검증**:
- token_pk NULL 없음
- token UNIQUE 유지
- 데이터 개수 일치
- AUTO_INCREMENT 값 정상

---

### Phase 1-2: warranties FK 전환

**파일**: `023_token_pk_migration_phase2_warranties.sql`

**의존성**: Phase 1-1 완료 필수

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/023_token_pk_migration_phase2_warranties.sql
```

**검증**:
- 모든 warranties가 token_pk 매핑됨
- 참조 무결성 확인

---

### Phase 1-3: paid_events 테이블 생성

**파일**: `024_create_paid_events_table.sql`

**의존성**: 없음 (Phase 1-1과 병렬 가능)

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/024_create_paid_events_table.sql
```

---

### Phase 1-4: orders.paid_at 컬럼 추가

**파일**: `025_add_orders_paid_at.sql`

**의존성**: Phase 1-3 완료 권장 (동기화 규칙 명시)

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/025_add_orders_paid_at.sql
```

---

### Phase 1-5: stock_units 테이블 생성

**파일**: `026_create_stock_units_table.sql`

**의존성**: Phase 1-1 완료 필수 (token_pk FK)

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/026_create_stock_units_table.sql
```

---

### Phase 1-6: order_item_units 테이블 생성 (active_lock 포함)

**파일**: `027_create_order_item_units_table.sql`

**의존성**: 
- Phase 1-1 완료 필수 (token_pk FK)
- Phase 1-5 완료 권장 (stock_unit_id FK)

**주의사항**:
- ⚠️ **active_lock generated column** 포함
- ⚠️ **UNIQUE(stock_unit_id, active_lock)** 제약 포함

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/027_create_order_item_units_table.sql
```

**검증**:
- active_lock generated column 확인
- UNIQUE 제약 확인

---

### Phase 1-7: warranties 컬럼 추가

**파일**: `028_add_warranties_columns.sql`

**의존성**: Phase 1-2 완료 필수 (token_pk 사용)

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/028_add_warranties_columns.sql
```

**검증**:
- owner_user_id NULL 허용 확인
- UNIQUE(token_pk) 확인
- status 데이터 확인

---

### Phase 1-8: warranties FK 추가

**파일**: `029_add_warranties_foreign_keys.sql`

**의존성**: 
- Phase 1-6 완료 필수 (source_order_item_unit_id FK)
- Phase 1-7 완료 필수

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/029_add_warranties_foreign_keys.sql
```

---

### Phase 1-9: invoices 다장 인보이스 지원

**파일**: `030_add_invoices_multipart.sql`

**의존성**: invoices 테이블 존재 필수 (이미 생성됨)

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/030_add_invoices_multipart.sql
```

---

### Phase 1-10: guest_order_access_tokens 테이블 생성

**파일**: `031_create_guest_order_access_tokens_table.sql`

**의존성**: 없음

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/031_create_guest_order_access_tokens_table.sql
```

---

### Phase 1-11: claim_tokens 테이블 생성

**파일**: `032_create_claim_tokens_table.sql`

**의존성**: 없음

**실행 명령**:
```bash
mysql -u prepmood_user -p prepmood < migrations/032_create_claim_tokens_table.sql
```

---

## ✅ 전체 실행 스크립트 (순서대로)

```bash
cd /var/www/html/backend

# 백업
mysqldump -u prepmood_user -p prepmood > prepmood_backup_$(date +%Y%m%d_%H%M%S).sql --no-tablespaces

# Phase 1 실행
mysql -u prepmood_user -p prepmood < migrations/022_token_pk_migration_phase1_token_master.sql
mysql -u prepmood_user -p prepmood < migrations/023_token_pk_migration_phase2_warranties.sql
mysql -u prepmood_user -p prepmood < migrations/024_create_paid_events_table.sql
mysql -u prepmood_user -p prepmood < migrations/025_add_orders_paid_at.sql
mysql -u prepmood_user -p prepmood < migrations/026_create_stock_units_table.sql
mysql -u prepmood_user -p prepmood < migrations/027_create_order_item_units_table.sql
mysql -u prepmood_user -p prepmood < migrations/028_add_warranties_columns.sql
mysql -u prepmood_user -p prepmood < migrations/029_add_warranties_foreign_keys.sql
mysql -u prepmood_user -p prepmood < migrations/030_add_invoices_multipart.sql
mysql -u prepmood_user -p prepmood < migrations/031_create_guest_order_access_tokens_table.sql
mysql -u prepmood_user -p prepmood < migrations/032_create_claim_tokens_table.sql
```

---

## 🔍 최종 검증

모든 마이그레이션 완료 후:

```sql
-- 1. token_master 구조 확인
SHOW CREATE TABLE token_master\G

-- 2. warranties 구조 확인
SHOW CREATE TABLE warranties\G

-- 3. 신규 테이블 확인
SHOW TABLES LIKE '%paid_events%';
SHOW TABLES LIKE '%stock_units%';
SHOW TABLES LIKE '%order_item_units%';
SHOW TABLES LIKE '%guest_order_access_tokens%';
SHOW TABLES LIKE '%claim_tokens%';

-- 4. active_lock 확인
SELECT 
    COLUMN_NAME, 
    GENERATION_EXPRESSION,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units' 
  AND COLUMN_NAME = 'active_lock';

-- 5. UNIQUE 제약 확인
SELECT 
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME IN ('order_item_units', 'warranties', 'invoices', 'paid_events')
  AND CONSTRAINT_NAME LIKE 'uk_%'
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
```

---

## ⚠️ 문제 발생 시 롤백

각 마이그레이션은 되돌릴 수 있도록 설계되었습니다:

1. **Phase 1-1 롤백**: `token_master_backup` 테이블을 `token_master`로 복원
2. **Phase 1-2 롤백**: `token_pk` 컬럼 제거, FK 제거
3. **나머지**: 테이블 DROP 또는 컬럼 제거

롤백 스크립트는 필요 시 작성합니다.

---

## 📋 체크리스트

- [ ] 데이터베이스 백업 완료
- [ ] Phase 1-1 실행 및 검증
- [ ] Phase 1-2 실행 및 검증
- [ ] Phase 1-3 실행 및 검증
- [ ] Phase 1-4 실행 및 검증
- [ ] Phase 1-5 실행 및 검증
- [ ] Phase 1-6 실행 및 검증 (active_lock 확인)
- [ ] Phase 1-7 실행 및 검증
- [ ] Phase 1-8 실행 및 검증
- [ ] Phase 1-9 실행 및 검증
- [ ] Phase 1-10 실행 및 검증
- [ ] Phase 1-11 실행 및 검증
- [ ] 최종 검증 완료

---

## 🎯 다음 단계

Phase 1 완료 후:
- Phase 2: 백엔드 API 구현 시작
- `processPaidOrder()` 함수 구현
- 비회원 주문 조회 API 구현
- Claim API 구현
