# 보증서 관리 페이지 현재 기능 정리

**작성일**: 2026-01-16  
**파일**: `admin-qhf25za8/warranties.html`, `admin-qhf25za8/admin-warranties.js`

---

## ✅ 현재 구현된 기능

### 1. 보증서 검색

**기능**: 다양한 식별자로 보증서 검색

**검색 가능한 항목**:
- 토큰 (20자 영숫자)
- UUID (public_id)
- 시리얼 넘버
- ROT 코드
- 보증서 하단 코드

**동작**:
- 검색어 입력 후 "검색" 버튼 클릭
- 단건 검색 결과: 자동으로 상세 모달 표시
- 다건 검색 결과: 테이블로 목록 표시 (클릭 시 상세 모달)

**API**: `GET /api/admin/warranties/search?q={검색어}`

---

### 2. 보증서 상세 조회

**기능**: 보증서의 모든 정보를 카드 형태로 표시

**표시 정보**:

#### 보증서 상태 카드
- 상태 (뱃지): `active`, `issued`, `issued_unassigned`, `suspended`, `revoked`
- 정책 경고 배지 (예: "양도 가능 / 환불 불가", "활성화 전 / 환불 가능")
- 재판매 배지 (재판매된 보증서인 경우)
- 활성화 일시
- 환불 일시
- 제품명
- 토큰 (20자)
- 시리얼 넘버

#### 소유자 정보 카드
- 현재 소유자 (이름, 이메일)
- 소유자 변경 이력 (타임라인)

#### 연결 정보 카드
- 주문번호
- 주문 상태
- 제품명
- 시리얼 넘버 (stock_units)
- ROT 코드 (stock_units)
- **인보이스 연동 상태** (최근 추가)
  - 연동됨 (회원 주문)
  - 연동됨 (비회원 주문, 클레임됨)
  - 미연동 (비회원, 미클레임)
  - 환불됨
- 원본 인보이스 정보 (인보이스 번호, 발급일시)
- Credit Note 목록 (있는 경우)

#### 보증서 이력 타임라인
- 모든 이벤트 타입 표시:
  - 상태 변경 (`status_change`)
  - 소유자 변경 (`owner_change`)
  - 양도 (`ownership_transferred`)
  - 제재 (`suspend`)
  - 제재 해제 (`unsuspend`)
  - 환불 (`revoke`)
- 각 이벤트의 변경 전/후 값 표시
- 변경 사유 표시
- 변경 일시 표시

**API**: `GET /api/admin/warranties/:id`

---

### 3. QR 코드 다운로드

**기능**: 보증서 상세 화면에서 QR 코드 다운로드

**동작**:
- 보증서 상세 모달 하단에 "QR 코드 다운로드" 버튼
- 클릭 시 새 창에서 QR 코드 다운로드 API 호출

**API**: `GET /api/admin/qrcode/download?public_id={public_id}`

---

## ❌ 현재 구현되지 않은 기능 (백엔드 API는 존재)

### 1. 보증서 정지 (제재)

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 8-6절):
> 보증서 정지 (`warranties.status` → `'suspended'`)

**백엔드 API**: ✅ 존재
- `POST /api/admin/warranties/:id/events`
- Body: `{ type: 'suspend', reason: '제재 사유' }`

**프론트엔드 UI**: ❌ 없음
- 보증서 상세 모달에 "정지" 버튼 없음

---

### 2. 보증서 정지 해제

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 8-6절):
> 보증서 정지 해제 (`warranties.status` → `'issued'`)

**백엔드 API**: ✅ 존재
- `POST /api/admin/warranties/:id/events`
- Body: `{ type: 'unsuspend', reason: '해제 사유' }`

**프론트엔드 UI**: ❌ 없음
- 보증서 상세 모달에 "정지 해제" 버튼 없음

---

### 3. 보증서 상태 수동 변경

**백엔드 API**: ✅ 존재
- `POST /api/admin/warranties/:id/events`
- Body: `{ type: 'status_change', params: { status: '...' }, reason: '변경 사유' }`

**프론트엔드 UI**: ❌ 없음
- 상태 변경 UI 없음

---

### 4. 소유자 수동 변경

**백엔드 API**: ✅ 존재
- `POST /api/admin/warranties/:id/events`
- Body: `{ type: 'owner_change', params: { owner_user_id: 123 }, reason: '변경 사유' }`

**프론트엔드 UI**: ❌ 없음
- 소유자 변경 UI 없음

---

### 5. 보증서 환불 (관리자 수동)

**문서 요구사항** (`SYSTEM_FLOW_DETAILED.md` 6-2절):
> 관리자 수동 처리: 시리얼 넘버와 토큰 확인 후 환불 처리

**백엔드 API**: ✅ 존재
- `POST /api/admin/refunds/process`
- Body: `{ warranty_id: 1, reason: '환불 사유' }`

**프론트엔드 UI**: ❌ 없음
- 보증서 상세 모달에 "환불 처리" 버튼 없음
- ⚠️ 주의: 환불은 `warranties.status` 기반 판정이므로, `active` 상태는 환불 불가

---

## 📊 기능 현황 요약

| 기능 | 백엔드 API | 프론트엔드 UI | 상태 |
|------|-----------|--------------|------|
| **검색** | ✅ | ✅ | 완료 |
| **상세 조회** | ✅ | ✅ | 완료 |
| **QR 코드 다운로드** | ✅ | ✅ | 완료 |
| **이력 조회** | ✅ | ✅ | 완료 |
| **정지 (제재)** | ✅ | ❌ | UI 없음 |
| **정지 해제** | ✅ | ❌ | UI 없음 |
| **상태 수동 변경** | ✅ | ❌ | UI 없음 |
| **소유자 수동 변경** | ✅ | ❌ | UI 없음 |
| **환불 처리** | ✅ | ❌ | UI 없음 |

---

## 🎯 결론

**현재 보증서 관리 페이지는 "조회 전용" 기능만 구현되어 있습니다.**

### 할 수 있는 것:
1. ✅ 보증서 검색 (토큰, UUID, 시리얼 넘버 등)
2. ✅ 보증서 상세 정보 조회 (상태, 소유자, 연결 정보, 이력)
3. ✅ QR 코드 다운로드
4. ✅ 인보이스 연동 상태 확인 (최근 추가)

### 할 수 없는 것 (백엔드 API는 있으나 UI 없음):
1. ❌ 보증서 정지 (제재)
2. ❌ 보증서 정지 해제
3. ❌ 보증서 상태 수동 변경
4. ❌ 소유자 수동 변경
5. ❌ 보증서 환불 처리

---

## 💡 권장 사항

`SYSTEM_FLOW_DETAILED.md` 8-6절에 따르면 관리자 액션이 필요합니다:
- 보증서 정지 (`warranties.status` → `'suspended'`)
- 보증서 정지 해제 (`warranties.status` → `'issued'`)
- 보증서 상태 확인 및 변경 이력 조회 (✅ 이미 구현됨)

**다음 단계**: 보증서 상세 모달에 관리자 액션 버튼 추가
- 정지 버튼 (상태가 `active` 또는 `issued`일 때)
- 정지 해제 버튼 (상태가 `suspended`일 때)
- 환불 처리 버튼 (상태가 `issued` 또는 `issued_unassigned`일 때, `active`는 불가)

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16