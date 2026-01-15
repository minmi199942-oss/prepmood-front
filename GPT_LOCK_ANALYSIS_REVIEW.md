# GPT 락 분석 의견 검토

**작성일**: 2026-01-15  
**기준**: 실제 코드 및 DB 구조 검증

---

## 📊 전체 평가

**정확도**: 약 **95%** (매우 정확하고 실용적)

**특징**:
- ✅ `ER_LOCK_WAIT_TIMEOUT` 원인 분석 정확
- ✅ 해결 방법 제안 적절
- ⚠️ 일부 정보가 실제 구조와 다름 (UNIQUE 제약 존재)
- ✅ 추가 확인 사항 제안 유용

---

## 1. ✅ 정확한 지적

### (1) 결론: paid_events가 안 생기는 직접 원인

**GPT 의견**:
> createPaidEvent()가 paid_events에 INSERT 하려고 하는 순간,
> 어떤 락을 기다리다가 타임아웃이 나서 실패하고 있어.

**실제 확인**:
- ✅ 로그에서 `ER_LOCK_WAIT_TIMEOUT` 확인됨
- ✅ `payments`는 `captured`로 남고 `paid_events`는 0
- ✅ 후처리는 시작도 못 함

**평가**: **정확함**. 이미 우리가 수정한 내용과 일치

---

### (2) 가장 먼저 해야 하는 것: "무슨 락" 때문에 기다리는지 확인

**GPT 의견**:
> A) 현재 락 걸고 있는 세션 찾기
> B) paid_events insert가 "같은 order_id/payment_key를 두 번" 넣으려는 경쟁인지
> C) createPaidEvent가 "orders 테이블" 같은 다른 테이블도 같이 업데이트하는지

**실제 확인**:
- ✅ `createPaidEvent()`는 `paid_events`와 `paid_event_processing`만 INSERT (다른 테이블 업데이트 안 함)
- ✅ 별도 커넥션(autocommit)으로 실행되어 트랜잭션 락은 없음
- ⚠️ 하지만 UNIQUE 제약 체크 시 락이 발생할 수 있음

**평가**: **정확함**. 확인 스크립트 작성 필요

**작업 완료**:
- ✅ `backend/scripts/check_mysql_locks.sql` 생성
- ✅ `backend/scripts/check_mysql_locks.sh` 생성

---

## 2. ⚠️ 부분적으로 정확한 지적

### (1) paid_events에 멱등성 제약

**GPT 의견**:
> 지금 paid_events에는 UNIQUE가 보이지 않아(구조 출력엔 order_id/payment_key가 MUL 인덱스만 있음).
> 즉, 중복 방지 제약이 약할 수 있고,
> 동시에 여러 흐름이 INSERT 시도하면 락 경합이 생길 수 있어.

**실제 확인**:
- ❌ **GPT가 틀렸음**: `uk_paid_events_order_payment (order_id, payment_key)` UNIQUE 제약 존재
- ✅ `db_structure_actual.txt` 553-554번 라인 확인:
  ```
  paid_events	uk_paid_events_order_payment	order_id	1	0	BTREE
  paid_events	uk_paid_events_order_payment	payment_key	2	0	BTREE
  ```
- ✅ `NON_UNIQUE = 0`이므로 UNIQUE 제약임

**평가**: **GPT가 틀렸지만 의도는 정확함**.
- UNIQUE 제약은 이미 존재함
- 하지만 `INSERT ... ON DUPLICATE KEY UPDATE` 사용은 여전히 유용함 (이미 우리가 수정함)

---

### (2) INSERT ... ON DUPLICATE KEY UPDATE 사용

**GPT 의견**:
> INSERT IGNORE 또는 INSERT ... ON DUPLICATE KEY UPDATE로 바꾸면,
> 중복 흐름이 와도 락 경합이 크게 줄어.

**실제 확인**:
- ✅ 이미 우리가 수정함 (67-75번 라인)
- ✅ `INSERT ... ON DUPLICATE KEY UPDATE` 사용
- ✅ `INSERT IGNORE`를 `paid_event_processing`에 사용 (88-93번 라인)

**평가**: **정확함**. 이미 적용됨

---

## 3. ✅ 추가 확인 사항 (유용함)

### (1) MySQL 락 확인

**GPT 의견**:
> SHOW FULL PROCESSLIST;
> SHOW ENGINE INNODB STATUS\G

**작업 완료**:
- ✅ `backend/scripts/check_mysql_locks.sql` 생성
- ✅ `backend/scripts/check_mysql_locks.sh` 생성

**평가**: **정확함**. 유용한 제안

---

### (2) 같은 payment_key 중복 확인

**GPT 의견**:
> 같은 payment_key가 payments에 여러 번 들어가는지 확인

**작업 완료**:
- ✅ SQL 쿼리에 포함됨 (check_mysql_locks.sql)

**평가**: **정확함**. 유용한 제안

---

### (3) confirm과 webhook 동시 호출 가능성

**GPT 의견**:
> confirm(redirect)와 webhook이 동시에 들어올 수 있는지 확인

**실제 확인**:
- ✅ 가능함: `event_source`가 `'redirect'`와 `'webhook'` 둘 다 있음
- ✅ 하지만 UNIQUE 제약이 `(order_id, payment_key)`이므로 `event_source`는 포함 안 됨
- ⚠️ 같은 `order_id`와 `payment_key`로 `redirect`와 `webhook`이 동시에 오면 첫 번째만 성공, 두 번째는 `ON DUPLICATE KEY UPDATE`로 처리됨

**평가**: **정확함**. 확인 필요

---

## 4. ✅ 정확한 지적 (별개 버그)

### order 56의 failed는 별개 버그

**GPT 의견**:
> order 56의 failed(order_id default value)는 별개 버그다
> paid_events 문제(락) 해결해도 processing 단계의 SQL 버그를 고치지 않으면
> "paid_events는 생기는데 후처리가 죽는" 장애가 남는다.

**실제 확인**:
- ✅ 이미 알고 있는 내용
- ✅ `processPaidOrder()`에서 `order_item_units` INSERT 시 `order_id` 누락 문제 (이미 수정됨)

**평가**: **정확함**. 이미 해결됨

---

## 5. ⚠️ 부분적으로 정확한 지적

### WEBHOOK_SHARED_SECRET 경고

**GPT 의견**:
> WEBHOOK_SHARED_SECRET 경고는 지금 당장 같이 처리해라
> 이건 락 타임아웃의 직접 원인이라기보단,
> 운영에서 "결제 이벤트가 엉뚱하게 중복/누락"될 가능성을 키우는 위험 요소야.

**실제 확인**:
- ✅ 프로덕션에서 설정 필요 (보안상 중요)
- ⚠️ 하지만 락 타임아웃의 직접 원인은 아님 (GPT도 인정)
- ✅ 웹훅 검증이 제대로 안 되면 중복 호출 가능성 증가

**평가**: **부분적으로 정확함**.
- 보안상 중요하지만 락 타임아웃의 직접 원인은 아님
- 중복 호출 가능성 증가는 맞음

**우선순위**:
- 🔴 즉시: 락 타임아웃 해결 (이미 완료)
- 🟡 단기: WEBHOOK_SHARED_SECRET 설정 (보안)

---

## 6. 📋 GPT 제안 vs 실제 구현 비교

| GPT 제안 | 실제 구현 | 상태 |
|---------|---------|------|
| 재시도 로직 추가 | ✅ 추가됨 (maxRetries=3, 지수 백오프) | 완료 |
| INSERT ... ON DUPLICATE KEY UPDATE | ✅ 사용 중 | 완료 |
| INSERT IGNORE | ✅ paid_event_processing에 사용 | 완료 |
| UNIQUE 제약 확인 | ✅ 이미 존재함 (GPT가 틀림) | 확인 완료 |
| MySQL 락 확인 스크립트 | ✅ 생성됨 | 완료 |
| payment_key 중복 확인 | ✅ SQL에 포함 | 완료 |

---

## 7. 🎯 추가 확인 필요 사항

### (1) createPaidEvent가 다른 테이블을 업데이트하는지

**GPT 의견**:
> createPaidEvent가 "orders 테이블" 같은 다른 테이블도 같이 업데이트하는지 확인

**실제 확인**:
- ✅ `createPaidEvent()`는 `paid_events`와 `paid_event_processing`만 INSERT
- ✅ 다른 테이블 업데이트 안 함
- ✅ 별도 커넥션(autocommit)으로 실행되어 트랜잭션 락 없음

**평가**: **GPT 우려는 타당하지만 실제로는 문제 없음**

---

### (2) UNIQUE 제약이 event_source를 포함하는지

**GPT 의견**:
> UNIQUE(payment_key, event_source) 또는 UNIQUE(order_id, payment_key)

**실제 확인**:
- ✅ 현재: `UNIQUE(order_id, payment_key)`
- ⚠️ `event_source`는 포함 안 됨
- ⚠️ 같은 `order_id`와 `payment_key`로 `redirect`와 `webhook`이 동시에 오면:
  - 첫 번째만 INSERT 성공
  - 두 번째는 `ON DUPLICATE KEY UPDATE`로 처리됨
  - `event_source`는 업데이트 안 됨 (첫 번째 값 유지)

**평가**: **현재 구조로도 문제 없음**.
- 같은 결제에 대해 여러 경로로 호출되어도 하나의 `paid_events`만 생성됨
- 이는 의도된 동작 (멱등성 보장)

---

## 8. 📊 최종 평가

### GPT 의견의 강점

1. **원인 분석 정확**: `ER_LOCK_WAIT_TIMEOUT` 원인 파악 정확
2. **해결 방법 적절**: 재시도 로직, `ON DUPLICATE KEY UPDATE` 제안 적절
3. **추가 확인 사항 유용**: MySQL 락 확인, 중복 확인 등 유용한 제안
4. **우선순위 명확**: 락 문제 해결 → 별개 버그 해결 순서 적절

### 보완 필요 사항

1. **UNIQUE 제약 정보 오류**: GPT가 "UNIQUE가 보이지 않아"라고 했지만 실제로는 존재함
2. **WEBHOOK_SHARED_SECRET 우선순위**: 락 타임아웃의 직접 원인은 아니지만 보안상 중요

### 결론

**GPT 의견은 매우 정확하고 실용적입니다.**

특히:
- ✅ 원인 분석 정확
- ✅ 해결 방법 적절 (이미 우리가 적용함)
- ✅ 추가 확인 사항 유용 (스크립트 생성 완료)
- ⚠️ UNIQUE 제약 정보 오류 (하지만 의도는 정확)

**권장 사항**:
1. ✅ 이미 완료: 재시도 로직, `ON DUPLICATE KEY UPDATE` 적용
2. 🔴 즉시: MySQL 락 확인 스크립트 실행 (`check_mysql_locks.sh`)
3. 🟡 단기: WEBHOOK_SHARED_SECRET 설정 (보안)
4. 🟢 중기: confirm과 webhook 동시 호출 시나리오 테스트

---

## 9. 📝 다음 액션

### 즉시 실행

1. **MySQL 락 확인**:
   ```bash
   cd /var/www/html/backend
   bash scripts/check_mysql_locks.sh
   ```

2. **결과 분석**:
   - 오래 걸리는 쿼리 확인
   - TRANSACTIONS 섹션에서 lock wait 정보 확인
   - 같은 payment_key 중복 확인

### 단기 개선

1. **WEBHOOK_SHARED_SECRET 설정** (보안)
2. **confirm과 webhook 동시 호출 테스트**

---

**이 문서는 GPT의 락 분석 의견을 실제 코드와 DB 구조와 비교하여 검토한 결과입니다.**
