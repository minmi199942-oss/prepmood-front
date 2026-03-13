# 결제·주문 플로우 보안 점검 체크리스트

> **문서 역할**: **구현 착수 문서.** 실행 규칙이 확정되어 개발자가 코드로 옮길 수 있는 수준.  
> **원칙**: "구현이 있다" ≠ "문제가 해결되었다". 경합 테스트·실패 시나리오 검증 필수.

---

## 1. 구현 현황

| 항목 | 상태 | 설명 |
|------|------|------|
| 웹훅 HMAC 검증 | ✅ | `WEBHOOK_SHARED_SECRET` 서명 검증 |
| CSRF·JWT·SQLi 방지 | ✅ | verifyCSRF, authenticateToken, Prepared Statement |
| XSS | ⚠️ | 주요 화면 적용. 전수 점검 미완료. 신규 innerHTML 금지 |
| 결제 경로 Pool | ⚠️ | confirm·webhook·paid-event-creator는 pool. **order 생성·recovery 스크립트는 createConnection** |
| confirm 동시성 캡 | ⚠️ | activePaymentCount 503. **soft-protection일 뿐.** 정합성은 DB lock+UNIQUE+recovery |
| checkoutSessionKey 선점 | ⚠️ | Phase 1 FOR UPDATE. IN_PROGRESS 활성→409, **stale→423** (이번 작업에서 추가) |
| paid_events 멱등성 | ⚠️ | UNIQUE(order_id, payment_key). **provider event id dedupe 미구현** |
| 복구 스크립트 | ⚠️ | 3개 존재. **dry-run·audit·운영 프로토콜 미완료** |

**Connection 사용**: confirm·webhook·paid-event-creator·payment-wrapper → pool. order 생성·recovery → createConnection.

---

## 2. 우선순위·조치 항목

**P0** (고장 지점 4개): stale IN_PROGRESS 복구 | webhook IN_PROGRESS 보정 | provider event dedupe | recovery 운영 프로토콜  
**P1**: IP 신뢰 체계, confirm/webhook limiter, body size, 관리자 보호  
**P2**: innerHTML 전수, .env 점검, 감사 로그

### 2.1 P1 조치 (요약)

| 항목 | 현재 | 권장 |
|------|------|------|
| Reverse Proxy IP (P1) | trust proxy 'loopback', req.ip | getClientIp(req) 전역. Nginx real_ip_header 확정 |
| confirm limiter | 15분 500회 | 1분 10회, 429 시 버튼 5초 비활성화 |
| webhook | 15분 500회, 10mb | 1분 60~100회, body 64KB |
| 관리자 | 5회 15분 | 3회 30분 |
| PII·maskPII | - | allowlist 우선, maskPII 재귀 2~3 |

### 2.2 상태 전이 (핵심)

| 전이 | 규칙 |
|------|------|
| IN_PROGRESS + webhook | **IN_PROGRESS 자체로 return 금지.** paid_events 확인 → 없으면 provider 1회 재검증 → DONE이면 ensurePaidEvent, 아니면 recovery_status='REQUIRED' |
| stale IN_PROGRESS | **PENDING 복구 금지.** mark-only 후 423. RECOVERY_REQUIRED 전이 후 교차 검증 |
| processPaidOrder 재실행 | paid_event_processing success early return. UNIQUE 충돌 시 기존 참조. **부수 효과 no-op 테스트 필요** |

---

## 3. 설계 확정 결론

### 3.1 RECOVERY_REQUIRED (결론)

| 결정 | 내용 |
|------|------|
| recovery_status 위치 | `payment_attempts`에 컬럼 추가. **인덱스 필수**: `idx_recovery_status` 또는 `idx_status_recovery` |
| 복구 SSOT | `payment_attempts` |
| 조합 | `status=PROCESSING` + `recovery_status=REQUIRED` 허용 |
| 운영 기준 | 화면·스크립트는 `payment_attempts` 기준 조회 |

checkout_sessions = 세션 진입/선점. payment_attempts = 결제 시도·복구 SSOT.

### 3.2 webhook IN_PROGRESS 보정 (확정)

| 항목 | 확정 |
|------|------|
| provider API | `GET /v1/payments/{paymentKey}` |
| 웹훅 내 재검증 | **최대 1회** (장기 점유 방지). 실패 시 REQUIRED |
| recovery 경로 재검증 | 3회, 간격 2초·2초·4초 가능 |
| 확정 기준 | `status === 'DONE'`만 |
| 실패 시 | `recovery_status='REQUIRED'` 전이 |
| return early | **금지.** paid_events 확인 후 보정 분기까지 수행 |

### 3.3 stale IN_PROGRESS (권장)

- Phase 1: `status='IN_PROGRESS' && expires_at<=now` → stale. **mark-only.** payment_attempts.recovery_status='REQUIRED' 마킹 후 **423 Locked** 반환. **복구 실행 금지.**
- **상태코드 확정**: stale 시 **423** (409는 기존 IN_PROGRESS 활성 충돌용 유지). 응답: `code: "PAYMENT_STATUS_CHECK_REQUIRED"`, `message`, `orderNumber` 포함.
- 1단계: mark-only + 수동/스크립트 recovery. 2단계: cron auto-marking 검토.

### 3.4 provider event dedupe (확정)

| 항목 | 확정 |
|------|------|
| 테이블 | **별도 webhook_events.** paid_events와 분리 |
| 1순위 키 | `tosspayments-webhook-transmission-id` 헤더 |
| fallback | **timestamp 금지.** sha256(provider\|event_type\|paymentKey\|orderId\|status). **event_type은 dedupe 계산 전 내부 표준값으로 normalize** (예: 대문자 snake) |
| processing_status | RECEIVED/PROCESSING/PROCESSED/FAILED (pm2 restart 대비) |
| UNIQUE | (provider_name, provider_event_id) |
| **필수 컬럼** | id, provider_name, provider_event_id, event_type, processing_status, **received_at**, **updated_at**. (PROCESSING 장기 잔류 판단용) |
| 권장 추가 | order_id, payment_key |

### 3.5 recovery 스크립트 요구사항

| 항목 | recover_order_by_number | fix_missing_paid_events | recover_pipeline_batch |
|------|-------------------------|-------------------------|------------------------|
| --dry-run | ✅ | ✅ | ✅ |
| 단건/배치 | 단건 | 단건 | 배치 |
| audit | ✅ | ✅ | ✅ |

**목표 상태** (현재 구현은 미지원, 이번 작업에서 추가). **필수**: dry-run, 입력 검증, 실행 전/후 요약, audit 테이블/파일. 단건/배치 같은 스크립트에 섞지 말 것. **공통 서비스 함수 재사용, business logic 직접 구현 금지.**

**recovery 동시 실행 방지**: **단일 UPDATE로 선점.** `UPDATE payment_attempts SET recovery_status='IN_PROGRESS' WHERE id=? AND recovery_status='REQUIRED'` → affectedRows=1일 때만 진행. 0이면 다른 프로세스가 선점. **SELECT 후 UPDATE 금지** (레이스 가능).

### 3.6 processPaidOrder 멱등성 검증 대상

invoice, 이메일, stock, audit append, aggregate recompute, 외부 API side effect — 2회 실행 시 no-op인지 테스트 필요.

**paid_event_processing**: 033 마이그레이션으로 **이미 존재.** 094 신규 생성 불필요. 기존 테이블(event_id PK, status, last_error, processed_at) 사용.

---

## 4. 결정문서 4개·세부 6항목

| # | 결정문서 | 세부 결정 |
|---|----------|-----------|
| 1 | stale IN_PROGRESS 상태 모델 | recovery_status(payment_attempts), RECOVERY_REQUIRED 전이 |
| 2 | webhook IN_PROGRESS 보정 | 웹훅 1회 재검증, DONE만 확정, return early 금지 |
| 3 | provider event dedupe | webhook_events 분리, UNIQUE, fallback |
| 4 | recovery 운영 프로토콜 | 단건/배치 분리, dry-run, audit |

**세부 6항목**: (1) stale 판정 (2) webhook IN_PROGRESS 행동 (3) paid_events 생성 책임 (4) processPaidOrder 재실행 조건 (5) recovery 실행 절차·audit (6) provider dedupe 키

---

## 5. 가장 위험한 구멍 (우선순위)

1. **IN_PROGRESS stale recovery 미확정** — confirm crash + webhook 조기 반환 → 유령 상태
2. **webhook IN_PROGRESS 조기 반환** — paid_events 미확인 return → 상태 머신 끊김
3. **provider event dedupe 미구현** — 이벤트 재전송 멱등성 부족
4. **recovery 운영 프로토콜 부재** — 단건/배치 분리, dry-run, audit 필수

---

## 6. 빠른 확인

```powershell
# 웹훅 시그니처
node scripts/webhook-signature-verify.js
```
```bash
git status; git log -p --all -- .env   # .env 미추적·과거 노출 확인
```

---

## 7. 구현 요약

| 조치 | 영향 |
|------|------|
| getClientIp, trust proxy | limiter keyGenerator. Nginx real_ip_header |
| confirm 1분 10회, 429 버튼 5초 | index.js, order-complete-script.js |
| webhook 1분 60~100회, body 64KB | index.js webhookLimiter |
| 관리자 3회 30분 | index.js |
| maskPII·allowlist | utils/mask-pii.js, Logger |

**미들웨어 순서** (webhook raw body 적용 시):

1. `/api/payments/webhook` 전용: `express.raw({limit:'64kb'})` → HMAC 검증 → webhookLimiter → webhook handler  
2. 그 외: `express.json({limit:'10mb'})` → generalLimiter → confirmLimiter → 일반 paymentsRoutes  

**핵심**: webhook는 일반 JSON parser보다 **먼저** 분리. HMAC은 raw bytes 기준.

**구현 순서**: schema(recovery_status, webhook_events) → dedupe → webhook 보정 → stale mark-only → recovery 스크립트 → P1

---

## 8. 경합 테스트 (필수)

| 시나리오 | 기대 | 실패 시 |
|----------|------|---------|
| confirm 2회 동시 | 1회 성공, 2회 409 | 중복 paid_events |
| confirm 직전 webhook | 하나만 processPaidOrder | 이중 처리 |
| webhook 5회 재전송 | 1회만 처리 | 중복 주문 |
| recover 2회 재실행 | alreadyProcessed | 이중 보증서 |

---

## 9. 요약

| 구분 | 상태 |
|------|------|
| P0 4개 | stale recovery, webhook 보정, provider dedupe, recovery 프로토콜 — **설계 확정 후 구현** |
| P1 | IP·limiter·body·관리자 — 조치 항목 명확 |
| 확정 | recovery_status(payment_attempts), webhook 1회 재검증, return early 금지, dedupe fallback timestamp 금지 |
| 확정(2차) | stale SQL, webhook retry 범위, PROCESSING 5분 잔류, 423 payload, 미들웨어 순서 |
| 확정(3차) | ALREADY_CONFIRMED 구분, recovery 원자적 UPDATE, event_type normalize, recovery_status 인덱스 필수 |

---

## 10. 20년 경력 보안 검토 (GPT 응답 비판·코드 검증)

> GPT는 우리 코드·환경을 직접 보지 못함. 아래는 실제 코드·문서 대조 후 **수용/수정/폐기** 판단.

### 10.1 GPT 맞음 — 수용

| GPT 주장 | 코드 검증 | 판단 |
|----------|-----------|------|
| Phase 1에서 복구 실행 금지, mark-only | payment-wrapper.js 189-203: Phase 1은 세션 선점만. provider/paid_events 접근 없음 | ✅ 수용 |
| checkout_sessions에 복구 의미 싣지 말 것 | checkout_sessions = 선점용. recovery SSOT는 payment_attempts | ✅ 수용 |
| webhook 판단 중심은 paid_events + provider | payments-routes 1926-1937: 현재 IN_PROGRESS만 보고 return. paid_events 미확인 | ✅ 수용 |
| webhook 내부 장기 재시도 위험 | verifyPaymentWithToss 1회. 3회×2초·4초 = 8초+ 웹훅 점유 | ✅ 수용. **웹훅 1회 재검증, 실패 시 REQUIRED** |
| dedupe fallback에 timestamp 금지 | timestamp 넣으면 동일 이벤트도 매번 다른 키 | ✅ 수용. **deterministic hash만** |
| recovery 스크립트가 business logic 직접 구현 금지 | recover_order_by_number.js: createPaidEvent·processPaidOrder 직접 호출 | ✅ 수용. 공통 서비스 래핑 |
| webhook raw body + 64KB 시 HMAC 순서 주의 | 현재 express.json() → req.body → HMAC. raw 전환 시 **HMAC 먼저, parse 나중** | ✅ 수용 |
| getClientIp만 넣는다고 해결 안 됨 | Nginx real_ip_header, trust proxy, getClientIp 우선순위 일치 필요 | ✅ 수용 |
| confirm limiter IP only 약함 | NAT·공유망에서 정상 사용자 차단 가능 | ⚠️ 수용(복합키는 2단계). 1단계는 IP 1분 10회 |

### 10.2 GPT 틀림 — 수정·폐기

| GPT 주장 | 코드 검증 | 판단 |
|----------|-----------|------|
| **paid_event_processing 테이블 신규 생성 (094)** | **033_create_paid_event_processing_table.sql 이미 존재.** event_id PK, status(pending/processing/success/failed), last_error, processed_at, retry_count | ❌ **폐기.** 094 마이그레이션 불필요. **기존 테이블 사용** |
| payment_attempts.status INITIATED/SUCCEEDED 등 | 090: status = PROCESSING\|CONFIRMED\|FAILED\|ABORTED_CHECK_REQUIRED\|... | ❌ **폐기.** 기존 enum 유지 |
| webhook_events 스키마 15+ 컬럼 | 포렌식 목적 유효하나, 1단계는 최소(provider_event_id, processing_status, received_at)로 시작 가능 | ⚠️ **수정.** 단계적 확장. UNIQUE(provider_name, provider_event_id) + processing_status 필수 |
| "수동만(C)은 운영 설계 아님" → cron 필수 | cron auto-marking 권장이나, **우선 mark-only + recovery 스크립트**로 1단계 마무리 후 cron 검토 | ⚠️ **수정.** 1단계: Phase 1 mark-only + 수동/스크립트. 2단계: cron |

### 10.3 코드 검증 — 실제 구조

| 항목 | 실제 코드 |
|------|-----------|
| paid_event_processing | 033 마이그레이션. paid-event-creator.js 136-141: INSERT IGNORE. paid-order-processor.js 96-98: status='success' early return |
| Phase 1 SELECT | payment-wrapper.js 189-190: `session_key, status, attempt_id`만. **expires_at 없음** → SELECT에 expires_at 추가 필요 |
| checkout_sessions | 091: session_key PK, order_id, status, attempt_id, **expires_at** |
| webhook HMAC | payments-routes.js 2086-2087: `verifyWebhookSignature(req.body, tossSignature, ...)`. **req.body는 express.json() 파싱 결과** |
| invoice 멱등 | invoice-creator.js 19-28: order_id+type=invoice+status=issued 조회 후 기존 반환. 084: uk_invoices_invoice_order_id |
| getClientIp | utils/get-client-ip.js 존재. auth-routes에서 사용. **limiter는 req.ip 사용** (index.js 68-80) |

### 10.4 구현 시 필수 확인 (영향·사이드 이펙트)

| 변경 | 영향 | 확인 필요 |
|------|------|-----------|
| Phase 1에 expires_at 추가 | SELECT에 expires_at 포함. stale 시 attempt_id로 payment_attempts UPDATE | payment_attempts에 recovery_status 컬럼 선행 |
| webhook raw body 분리 | express.json() 전에 webhook만 raw로 파싱 → **라우트 분리 또는 미들웨어 순서** | HMAC은 raw bytes 기준. 토스 문서 확인 |
| webhook early return 제거 | 1926-1937 삭제 시 IN_PROGRESS여도 paid_events 확인 후 처리 | paid_events 없으면 verifyPaymentWithToss 1회. 실패 시 REQUIRED |
| recovery_status 추가 | payment_attempts ALTER. 기존 PROCESSING 행은 NULL | **인덱스 필수**: idx(recovery_status) 또는 idx(status, recovery_status). recovery 스캔·장기 잔류 조회에 필수 |
| webhook_events INSERT | ER_DUP_ENTRY → 이미 처리된 이벤트. 200 + `{ received: true }` 반환 후 종료. (receive_count/last_received_at은 093에 없음. 2차 확장 시 검토) | 1차: INSERT만. 중복 시 early return |

### 10.5 GPT 수용·수정 반영 — 최종 확정

| 항목 | 기존 문서 | 수정 후 |
|------|-----------|---------|
| stale Phase 1 | "확인 후 보정" | **mark-only.** REQUIRED 마킹 후 409/423. 복구 실행 금지 |
| webhook 재검증 | 3회 2초·2초·4초 | **웹훅 1회.** 실패 시 REQUIRED. recovery에서 3회 |
| paid_event_processing | 문서에 "success early return" | **기존 033 테이블 사용.** 094 신규 생성 폐기 |
| dedupe fallback | "확정 필요" | **timestamp 금지.** sha256(provider\|event_type\|paymentKey\|orderId\|status) |
| 구현 순서 | P1 먼저 | **schema → dedupe → webhook 보정 → stale mark-only → recovery 스크립트 → P1** |
| webhook body 64KB | 10mb 전체 | **webhook만 raw+64KB.** HMAC 검증 후 parse. 미들웨어 순서 주의 |

### 10.6 고객 경험·보안 균형

| 원칙 | 적용 |
|------|------|
| confirm 짧게 | Phase 1에서 provider/paid_events 조회 없음. stale면 마킹 후 즉시 종료 |
| webhook 짧게 | 1회 재검증, timeout 짧게. 실패 시 REQUIRED로 넘김 |
| 메시지 정책 | "실패" 단정 금지. "확인 중입니다. 잠시 후 주문내역에서 확인해주세요" |
| 429 시 | 버튼 5초 비활성화, "잠시 후 다시 시도" |

### 10.7 실행 규칙 확정 (GPT 2차 반영)

**stale 판정·마킹 (A안 확정)**:
- **stale candidate**: `checkout_sessions.status='IN_PROGRESS' AND expires_at<=NOW()`
- **mark REQUIRED 조건**: stale candidate이면 **무조건** REQUIRED 마킹. (Phase 1은 provider/paid_events 접근 금지이므로 paid_events 조회 불가)
- **결과**: 423 반환. 이미 결제 완료(paid_events 있음)인 주문도 REQUIRED로 마킹될 수 있으나, recovery/status 조회에서 no-op로 정리됨.

**webhook 1회 재검증 대상**:
- **재시도**: 네트워크 timeout, connection reset, provider 5xx
- **즉시 REQUIRED/실패**: provider 4xx, 잘못된 paymentKey/orderId 매핑, 응답 body schema 불일치

**webhook_events PROCESSING 장기 잔류**:
- `processing_status='PROCESSING' AND updated_at < NOW() - INTERVAL 5 MINUTE` → 장기 잔류 후보
- recovery 스크립트에서 재평가. cron 없어도 스크립트가 이 기준 사용.

**423 응답 payload**:
```json
{"code":"PAYMENT_STATUS_CHECK_REQUIRED","message":"결제 상태를 확인 중입니다. 잠시 후 주문 상태가 자동 반영됩니다.","orderNumber":"ORD-..."}
```
비회원: `guest_access_token` (기존 guest_order_access_tokens) 또는 주문조회 링크 제공. 프론트: "주문조회로 이동" 버튼 노출.

**ALREADY_CONFIRMED 응답** (이미 confirm 완료된 attempt에 재시도 시. Phase 3에서 attempt.status='CONFIRMED'인 경우):
```json
{"success":true,"code":"ALREADY_CONFIRMED","message":"이미 결제가 확인된 주문입니다.","data":{"order_number":"ORD-...","guest_access_token":...}}
```

**processPaidOrder 재실행 계약** (구성요소별 검증 필요): invoice(uk_invoices_invoice_order_id), 이메일(paid_event_id 기준?), stock(idempotent?), warranty(UNIQUE) — §3.6 테스트 대상.

### 10.8 GPT 2차 응답 검토 (실행 규칙 확정)

| GPT 제안 | 검증 | 판단 |
|----------|------|------|
| §2.2 "지연/no-op" → "IN_PROGRESS 자체로 return 금지" | payments-routes 1926-1937: IN_PROGRESS만 보고 return. paid_events 미확인 | ✅ 수용. 실행 규칙으로 명확화 |
| 409/423 → 423 고정 | payment-wrapper 200: SESSION_ALREADY_IN_USE 409. stale는 별도 케이스 | ✅ 수용. **stale 전용 423**, 기존 IN_PROGRESS 활성은 409 유지 |
| webhook_events updated_at 필수 | PROCESSING 장기 잔류 판단에 필요 | ✅ 수용 |
| dry-run 표 목표 상태(✅) | 현재 ❌, 목표 ✅. 문서 목적 명확화 | ✅ 수용. "이번 작업에서 추가" 비고 |
| 미들웨어 순서 raw-body 중심 | index.js 87: express.json() 전역. webhook만 raw 선행 필요 | ✅ 수용 |
| stale candidate / mark REQUIRED | Phase 1은 paid_events 조회 불가 → A안: stale면 무조건 REQUIRED. paid_events 조건 삭제 | ✅ 수용 (문서 정리) |
| webhook retry 대상 오류 범위 | verifyPaymentWithToss 현재 4xx/5xx 구분 없음 | ✅ 수용. verifyPaymentWithToss 수정 필요 |
| PROCESSING 5분 장기 잔류 | 임의 기준 없으면 recovery 불가 | ✅ 수용 |
| recovery 동시 실행 방지 | REQUIRED→IN_PROGRESS 원자적 전이 | ✅ 수용 |
| 423에 orderNumber 포함 | confirm 시 req.body.orderNumber 있음. 비회원 조회 경로 제공 | ✅ 수용 |

**코드 영향**: payment-wrapper Phase 1에 stale 분기 추가 시 **새 에러 타입** 필요 (예: `STALE_SESSION_NEEDS_RECOVERY`). payments-routes에서 423 + orderNumber 반환. 기존 SESSION_ALREADY_IN_USE(409)는 **expires_at>NOW()** 인 경우만 유지.

### 10.9 GPT 3차 응답 검토 (구현 착수 전 최종 4항목)

| GPT 제안 | 코드 검증 | 판단 |
|----------|-----------|------|
| ALREADY_CONFIRMED는 "새 confirm" 아님 | payments-routes 382-394: `alreadyConfirmed: true` in data. top-level `code` 없음 | ✅ 수용. `code: "ALREADY_CONFIRMED"` 추가. 프론트가 "새 완료" vs "멱등 재확인" 구분 |
| recovery 원자적 UPDATE | SELECT 후 UPDATE 시 레이스. 단일 UPDATE + affectedRows=1 검증 | ✅ 수용. 문서에 SQL 명시 |
| event_type normalize | 토스: PAYMENT_STATUS_CHANGED, seller.changed, payout.changed 혼재 | ✅ 수용. dedupe hash 전 대문자/snake 통일 |
| recovery_status 인덱스 필수 | 092 마이그레이션에 인덱스 포함. recovery 스캔·장기 잔류 조회에 필수 | ✅ 수용. 권장→필수로 상향 |

**구현 시 주의**: 코드 반영 시 상태 전이·멱등성 계약을 깨지 않을 것. 문서 품질보다 **실제 코드 정합성**이 우선.

---

## 11. P0 구현 진행 현황 (채팅 초기화 시 이 섹션 참고)

> **목적**: 컨텍스트 초기화 후에도 진행 상황·상세 계획을 이 문서에서 파악.

### 11.1 구현 현황

**구현된 것** (채팅에서 실제 코드 반영 완료)
| # | 항목 | 비고 |
|---|------|------|
| 1 | payment-recovery-service.js | mark/claim/ensure/process/complete, 조건부 UPDATE |
| 2 | payment-wrapper.js Phase 1 stale | expires_at 체크, markAttemptRecoveryRequired, STALE_SESSION_NEEDS_RECOVERY → 423 |
| 3 | payments-routes.js confirm 423/ALREADY_CONFIRMED | 423 응답, ALREADY_CONFIRMED 응답 |

**아직 구현 안 된 것** (계획만 있음)
| # | 항목 | 비고 |
|---|------|------|
| 4 | webhook (raw body, dedupe, 보정) | §11.2 계획대로 진행 |
| 5 | recovery 스크립트 3종 서비스 연동 | 4번 완료 후 진행 |

### 11.2 4번 Webhook 구현 계획 (상세)

**구현 전 고정 (코드 상수/헬퍼)**
- **event type 비교 기준 통일**: raw 수신 → 즉시 `normalizeEventType(rawEventType)` 호출 → 이후 **모든** 분기(allowlist, dedupe, 로그)는 **normalized 값만** 사용
- `normalizeEventType(raw)`: 대문자, `.` → `_` (예: `payout.changed` → `PAYOUT_CHANGED`)
- `EVENTS_REQUIRING_SIGNATURE`: `['PAYOUT_CHANGED', 'SELLER_CHANGED']` — normalized 값
- `EVENTS_SIGNATURE_OPTIONAL`: `['PAYMENT_STATUS_CHANGED', 'DEPOSIT_CALLBACK', 'CANCEL_STATUS_CHANGED', ...]` — normalized 값
- **규칙**: 시그니처 기대 이벤트인데 signature 없으면 → 처리 거부 + 보안 로그
- `buildFallbackDedupeKey(normalizedEventType, data)`: 이벤트 타입별 핵심 필드만 사용. **없는 값은 `''` 고정**

**raw body 파서**
- `index.js`: `express.json()` **앞에** webhook 전용 `express.raw({ type: 'application/json', limit: '64kb' })`
- webhook 진입 시 `req.body` = Buffer. HMAC: `req.body.toString('utf8')`. 검증 후 `JSON.parse(...)`

**dedupe (webhook_events)**
- 1순위: `tosspayments-webhook-transmission-id` 헤더
- 2순위 fallback: `buildFallbackDedupeKey()` — `sha256('toss|' + normalizedEventType + '|' + (paymentKey||'') + '|' + (orderId||'') + '|' + (status||'') + ...)`. DEPOSIT_CALLBACK는 transactionKey 사용
- ER_DUP_ENTRY → 200 + `{ received: true }`, 처리 없음

**processing_status 전이** (추적성: INSERT 직후 vs business logic 중 구분)
- INSERT: `RECEIVED` (093 기본값)
- business logic 시작 시: `UPDATE ... SET processing_status='PROCESSING'`
- 성공/ALREADY_CONFIRMED: `PROCESSED`
- 예외: `FAILED`

**ALREADY_CONFIRMED**: `paid_events` 존재 **AND** `pep.status='success'` 둘 다 만족 시만. pep.success 아님 → ensurePaidEventProcessing + processPaidEvent.

**IN_PROGRESS early return 제거**: payments-routes 1982–1994행 블록 전부 제거.

**attemptId 조회**: `pg_order_id`, `external_ref_id`로 조회. 없으면 로그만 (`reason: 'attempt_not_found_for_webhook_recovery_mark'`), **500 반환 금지**.

**verifyPaymentWithToss 반환 계약** (고정)
```js
{ ok: boolean, data: object|null, errorCategory: 'PROVIDER_4XX'|'SCHEMA_MISMATCH'|'KEY_ORDER_MISMATCH'|'TIMEOUT'|'CONNECTION_RESET'|'PROVIDER_5XX'|'STATUS_NOT_DONE'|null }
```

**로그 코드 분리** (운영 추적용): "이미 완료" | "후처리 재진입" | "verify 실패" | "attempt 없음" — 각각 다른 로그 코드.

**구현 순서**: raw body route 분리 → HMAC + parse → transmission-id/fallback dedupe → paid_events/pep 확인 → verify 1회 → ensurePaidEvent/ensurePaidEventProcessing/processPaidEvent → REQUIRED 마킹 → webhook_events 상태 마감

### 11.6 DEPOSIT_CALLBACK secret 검증 (운영 사고 방지 6칙)

**원본 secret 저장 위치**: `payments.payload_json.secret` (결제 승인 API 응답 전체 저장 시 Payment 객체 최상위). 없으면 `GET /v1/payments/orders/{orderId}` fallback.

| # | 규칙 | 근거 |
|---|------|------|
| 1 | **payments 조회 조건 엄격화** | `WHERE order_number = ? AND gateway = 'toss'` 필수. **`ORDER BY created_at DESC LIMIT 1`** 필수 — 재시도/중복 행 시 오래된 secret 선택 방지. (DEPOSIT_CALLBACK 본문에 paymentKey 없음) |
| 2 | **payload_json.secret만 사용** | Payment 객체 최상위 secret이 검증 대상. `virtualAccount.secret`, `data.secret` 등 임의 경로 탐색 금지. 없으면 fallback provider 조회. |
| 3 | **fallback 실패 시 500 금지** | provider 조회 timeout/5xx 시 500 반환하면 토스 재전송 루프 유발. errorCategory 로그 + attemptId 있으면 REQUIRED 마킹 + **200 종료**. |
| 4 | **secret mismatch 시 처리 금지** | `body.secret !== storedSecret` → 결제 처리 금지, 보안 로그, `webhook_events.processing_status='FAILED'`, **200 종료**. **REQUIRED 마킹 금지** — mismatch는 복구 대상이 아니라 차단 대상. |
| 5 | **최소 필드 일치 로깅** | secret 검증 통과 후에도 로그에 orderId, transactionKey, status, payment_row_id 기록. fallback provider 조회 시 **provider 응답 orderId와 webhook body orderId 재비교** 필수. |
| 6 | **WAITING_FOR_DEPOSIT ≠ 입금 완료** | `payload_json.secret`은 검증용 원본 보관. **paid_events 생성은 DEPOSIT_CALLBACK에서 status=DONE 확인된 시점에만**. secret 저장과 결제 완료 처리는 절대 동일시 금지. |

**검증 순서** (이 흐름만 유지):
1. payments 최신 toss row 조회 (`ORDER BY created_at DESC LIMIT 1`)
2. `payload_json.secret` 추출
3. 없으면 provider `GET /v1/payments/orders/{orderId}` fallback
4. `body.secret === storedSecret` 비교
5. **일치할 때만** paid_events / processPaidEvent 진입. 불일치면 FAILED + 200 (REQUIRED 아님).

### 11.3 5번 Recovery 스크립트 연동 계획

- **시점**: 4번 완료 후
- **연동**: createPaidEvent/processPaidOrder 대신 `payment-recovery-service` 사용
- **필수**: `--dry-run`, audit 로그

### 11.4 GPT 4차 검토 반영 (구현 디테일 확정)

| GPT 제안 | 검증 | 판단 |
|----------|------|------|
| HMAC 스킵: "헤더 없으면 무조건 스킵" 금지 | 토스 문서: `tosspayments-webhook-signature`는 **payout.changed, seller.changed에만** 포함 | ✅ 수용. EVENTS_REQUIRING_SIGNATURE / EVENTS_SIGNATURE_OPTIONAL allowlist |
| processing_status: RECEIVED→PROCESSING→PROCESSED/FAILED | 093 기본값 RECEIVED. INSERT 직후 vs business logic 중 구분 가능 | ✅ 수용 |
| fallback 해시: undefined/null → `''` 고정 | `paymentKey \|\| ''` 등. 해시 일관성 | ✅ 수용 |
| verifyPaymentWithToss 반환 계약 고정 | 현재 null만 반환. errorCategory 없음 | ✅ 수용. `{ ok, data, errorCategory }` |
| 로그 코드 분리 | "이미 완료", "후처리 재진입", "verify 실패", "attempt 없음" 각각 구분 | ✅ 수용 |
| DEPOSIT_CALLBACK secret 6칙 | payments 조회 엄격화, payload_json.secret만, fallback 500 금지, mismatch 처리 금지+200, 필드 일치 로깅, WAITING_FOR_DEPOSIT≠입금완료 | ✅ 수용. §11.6 |

### 11.5 변경 이력

- 2025-03-10: §11 추가. 1~3번 완료, 4~5번 계획 수립.
- 2025-03-10: §11.2·11.4 GPT 4차 반영 (allowlist, processing_status 3단계, fallback `''`, verifyPaymentWithToss 계약, 로그 코드).
- 2025-03-10: **GPT 5차 검토 3가지 문서 정리** — (1) stale mark REQUIRED: A안 확정, paid_events 조건 삭제 (§10.7). (2) receive_count++ 문구 삭제, ER_DUP_ENTRY → 200+received 반환 (§10.4). (3) event type normalized 기준 통일 (§11.2).
- 2025-03-10: **§11.6 DEPOSIT_CALLBACK secret 검증 6칙** — payments 조회 엄격화, payload_json.secret만 사용, fallback 실패 시 500 금지, mismatch 시 처리 금지+200, 필드 일치 로깅, WAITING_FOR_DEPOSIT≠입금완료 구분.
- 2025-03-10: **§11.6 보강** — ORDER BY created_at DESC LIMIT 1 필수화. mismatch 시 REQUIRED 마킹 금지(차단 대상). 검증 순서 5단계 명시.

---

## 부록: 코드 위치·감사 로그

**검증용 코드 위치**: payments-routes.js 1926-1937(webhook IN_PROGRESS), 1799(verifyPaymentWithToss), payment-wrapper.js 189-222(Phase 1), paid-event-creator.js 124-165(UNIQUE), paid-order-processor.js 96-98(paid_event_processing early return), 033(paid_event_processing 테이블).

**감사 로그 최소 스키마**: actor_type, actor_id, route, order_number, payment_key_hash, before_state, after_state, request_id, ip, timestamp. 복구 스크립트 실행 이력 필수.

---

*마지막 업데이트: 2025-03-10 (§11.6 DEPOSIT_CALLBACK secret 검증 6칙 추가)*
