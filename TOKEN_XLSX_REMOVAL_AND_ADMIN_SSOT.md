# 토큰 xlsx 경로 제거 및 관리자 단일 SSOT 정리

이 문서는 **token_master**에 대한 xlsx 기반 init/update 스크립트 제거 결정, GPT 분석과 실제 코드 비교, 영향 범위, 변경 사항, 그리고 이후 필요 기능(관리자 수정·대량 등록)을 정리한 SSOT입니다.

---

## 1. 결정 사항

- **xlsx 기반 토큰 경로 제거**: `init-token-master-from-xlsx.js`, `update-token-master-from-xlsx.js` 제거.  
  (현재 홈페이지 직접 운영 중이 아니므로 기존 xlsx 토큰 경로를 없애도 됨.)
- **SSOT**: 토큰 생성·갱신은 **관리자(admin) 단일 경로**로 통합. product_options → token_master 한 경로만 유지.
- **필요한 다음 기능**:
  1. **관리자에서 기존 token_master 수정 기능** (rot_code, serial_number, digital_warranty_code 등 개별/범위 수정). → §6 설계 원칙 준수.
  2. **관리자 전용 대량 등록** (엑셀 업로드 → INSERT만, 삭제/덮어쓰기 없음). → §7 설계 원칙 준수.

---

## 2. 토큰 데이터 정책 (스냅샷·불변·SSOT)

### 2.0 스냅샷 정책 선언

- **token_master는 발급 시점 스냅샷**이다. product_options 변경은 **미래 발급분(신규 생성 토큰)**에만 반영된다. 이미 생성된 행은 옵션 메타와 무관하게 저장된 값을 유지한다.

### 2.1 불변 원칙과 예외·금지

| 구분 | 내용 |
|------|------|
| **원칙** | token_master의 고객 노출값(rot_code, serial_number, digital_warranty_code, warranty_bottom_code 등)은 **생성 후 불변**으로 둔다. |
| **예외** | (1) **오타 수정**, (2) **운영 정책 변경**으로 불가피할 때만 관리자 수정 기능으로 변경. 이때도 §6 수정 가능 조건을 만족하는 토큰만 대상. |
| **금지** | **이미 사용/발급/연결된 토큰**은 수정 불가. 즉, warranties·stock_units·order_item_units에 연결된 token_pk는 수정 대상에서 제외한다. (고객 노출·인쇄·주문 연결 후 변경 시 정합성 사고 가능.) |

이렇게 “수정 기능이 필요하다”의 **범위를 좁혀** API/UI 스펙이 과하게 커지지 않도록 한다.

### 2.2 products.xlsx와 token_master SSOT

- **products.xlsx**는 **검사용/보조 데이터**이며, **token_master를 채우는 경로로 사용하지 않는다.**
- **token_master 입력 SSOT**는 **관리자(토큰 생성 UI)** 와 **(추가 예정) 관리자 전용 대량 업로드** 뿐이다.
- products.xlsx를 읽는 다른 스크립트(check-xlsx-*.js, init-auth-db.js 등)가 있어도, token_master와의 관계는 “참조용·검증용”일 뿐이다.

---

## 3. GPT 분석 vs 우리 코드·환경 비교

### 3.1 맞는 말

| GPT 내용 | 우리 현황 |
|----------|-----------|
| update가 product_id 단위로 전체 갱신 → admin 토큰도 덮어쓸 수 있음 | `update-token-master-from-xlsx.js`: short_name → product_id → `WHERE product_id = ?` 로 해당 상품 전체 갱신. 관리자 생성 토큰 포함. |
| init이 전체 DELETE 후 재삽입 → 운영에서 한 번만 실행해도 admin 토큰 전부 삭제 | `init-token-master-from-xlsx.js`: 기존 행 있으면 `DELETE FROM token_master` 후 xlsx만 INSERT. |
| "xlsx 제거 + admin 단일 SSOT"가 충돌을 설계 차원에서 제거 | 동의. 위 두 위험 요인이 코드에서 제거됨. |
| 기존 토큰 처리: A안(현상 유지)이 안전, B안(일괄 정리)은 이미 발급된 코드 변경 리스크 | success/warning 등에서 token_master 값을 그대로 사용하므로, 이미 나간 코드 변경 시 불일치 가능. |
| **기존 token_master 개별 수정 UI/API가 없으면 "관리자에서만 수정" 불가** | **맞음.** `token-admin-routes.js`는 POST /admin/tokens(생성)만 있음. PATCH/PUT·편집 페이지 없음. → 수정 기능 추가 필요. |
| 대량 입력 시 INSERT ONLY, 중복 시 스킵+리포트, product_id 단위 UPDATE/전체 DELETE 금지 | 관리자 전용 대량 등록 설계 시 적용할 안전장치. |
| 실행 순서: init 차단 → update 제거 → admin만 → 필요 시 대량 등록 추가 | 그 순서로 진행. |

### 3.2 부족한 점 (우리 환경 반영)

| GPT 표현 | 우리 환경 |
|----------|-----------|
| "init 실행을 코드 가드로 차단" | init/update는 **HTTP 라우트가 아니라 CLI 스크립트**. `index.js`에 라우트 없음. 따라서 "가드"는 배포/문서/권한 또는 스크립트 상단 `NODE_ENV` 체크 등으로 이해. 이번에는 **스크립트 자체 제거**로 처리. |
| "update를 운영 경로에서 제거" | 스크립트 파일 삭제 + `reset-token-master.js`, VPS 스크립트 등 참조 수정으로 완결. |

### 3.3 기존 token_master 처리 정책 (선택지)

- **A안(현상 유지, 추천)**: 기존 행은 그대로 두고, 신규만 product_options 스냅샷으로 생성. (현재 방식 유지.)
- **B안(일괄 정리)**: 특정 product_id의 기존 token_master 메타를 현재 product_options로 일괄 UPDATE. → 이미 발급·인쇄된 코드 체계가 바뀌는 리스크 있음.

**결론**: A안 유지. 필요 시 관리자 수정 기능으로 **예외적으로** 개별/소량만 수정.

---

## 4. xlsx 스크립트 제거 시 영향 및 변경 사항

### 4.1 제거한 파일

- `backend/init-token-master-from-xlsx.js`
- `backend/update-token-master-from-xlsx.js`

### 4.2 수정한 코드·스크립트

- **backend/reset-token-master.js**  
  - "다음 단계: node init-token-master-from-xlsx.js …" → "토큰은 관리자 UI에서 생성하세요." 로 변경.
- **backend/token-admin-routes.js**  
  - 주석: "init-token-master-from-xlsx.js와 동일" → "20자 랜덤 토큰" 등으로 변경 (해당 스크립트 참조 제거).
- **VPS_TOKEN_MASTER_FULL_INIT.sh**  
  - Step 4에서 `node init-token-master-from-xlsx.js` 호출 제거. token_master 데이터는 관리자 또는 (추가 예정) 대량 업로드로만 추가한다는 안내로 변경.

### 4.3 그대로 두는 것

- **backend/migrations/044_init_token_master_with_fk_handling.sql**  
  - FK 제거 로직은 유지. 내부 메시지 "이제 init-token-master-from-xlsx.js를 실행할 수 있습니다"는 역사적 안내일 뿐이며, **초기 데이터는 이제 관리자 또는 대량 업로드로만 입력**한다고 이해하면 됨.
- **products.xlsx**  
  - 다른 스크립트(예: check-xlsx-*.js, init-auth-db.js 등)에서 사용할 수 있으므로 파일 자체는 유지. **token_master**만 더 이상 이 xlsx로 채우지 않음. (SSOT 명시는 §2.2 참고.)

### 4.4 참조만 있는 문서 (추가 수정 여부는 선택)

다음 문서들은 init/update 스크립트를 **과거·폐기 참조**로 포함할 수 있음. 필요 시 "폐기됨, 관리자 단일 경로로 통합" 문구 추가 가능.

- ADMIN_TOKEN_PRODUCT_STOCK_DESIGN.md
- TOKEN_PRODUCT_STOCK_CURRENT_FLOW.md
- VPS_TOKEN_MASTER_INIT_GUIDE.md
- VPS_PRODUCTS_XLSX_CHECK.md
- PRODUCTS_XLSX_UPDATE_SAFETY.md
- NEW_PRODUCT_ADDITION_GUIDE.md
- GPT_RISK_ANALYSIS_AND_RECOMMENDATIONS.md
- PRODUCT_NAME_COLOR_REMOVAL_IMPACT_ANALYSIS.md
- SIZE_COLOR_STANDARDIZATION_POLICY.md

---

## 5. 해야 할 부분 (체크리스트) 및 완료 정의

### 5.1 체크리스트

| 완료 | 항목 |
|------|------|
| ✅ | xlsx init/update 스크립트 제거 및 참조 수정 (reset-token-master.js, token-admin-routes.js, VPS_TOKEN_MASTER_FULL_INIT.sh) |
| ☐ | **관리자 token_master 수정 기능**: API(PATCH/PUT) + 관리자 UI. §6 설계 원칙 준수(수정 가능 조건·허용 컬럼·감사 로그). |
| ☐ | **관리자 전용 대량 등록**: 엑셀 업로드 → token_master **INSERT만**. §7 설계 원칙 준수. |

### 5.2 완료 정의 (Definition of Done)

xlsx 경로 제거 작업이 “완료”로 인정되기 위한 최소 조건(현재 상태 반영):

- [x] repo에서 **실행 가능한** init/update 스크립트 파일이 없음 (삭제 완료).
- [x] reset-token-master.js, VPS_TOKEN_MASTER_FULL_INIT.sh에서 **실행 단계**로 해당 스크립트를 호출하지 않음.
- [ ] (권장) **실행/가이드 문서**에서 `init-token-master-from-xlsx`, `update-token-master-from-xlsx` 문자열 검색 시, **§4.4 목록(참조만 있는 문서) 외에는 0건**. 즉, “이 스크립트를 실행하라”는 안내가 실행 가능한 경로·문서에 남지 않았는지 확인.
- [ ] (권장) 배포·운영 문서 또는 체크리스트에 “token_master 초기화는 관리자 UI 또는 대량 업로드만 사용, legacy xlsx 스크립트 실행 금지” 문구 포함.
- [ ] (권장) 운영 서버에서 “토큰 생성/표시/정품 인증” 플로우 회귀 확인: 관리자 생성 토큰 1건 → success/warning 등에서 CODE·SERIAL·바코드 밑 문자 표시 정상.

다른 .md 문서에 **과거 참조**로 init/update 스크립트 이름이 남아 있는 것은 “참조만 있는 문서”(§4.4)로 두고, 필요 시 해당 문서에 “폐기됨” 문구만 추가하면 됨.

---

## 6. 관리자 token_master 수정 기능 설계 원칙

수정 기능을 만든다는 것은 “이미 고객에게 노출된 값을 바꿀 수 있는 버튼”을 만든다는 뜻이므로, 아래 제약이 없으면 운영 사고로 이어질 수 있다. **아래 원칙은 v1으로 확정되어 있음(§13).**

### 6.1 수정 가능 대상 조건 (v1 정책)

**1) 스캔 여부 SSOT**  
수정 가능 여부 판단 시 **token_master.scan_count**를 SSOT로 사용.

- `scan_count = 0`이면 “아직 스캔 전”으로 간주. (스키마: db_structure_actual.txt, auth-routes에서 스캔 시 증가.)
- **scan_logs**는 **진단·불일치 탐지용**만. scan_count=0인데 scan_logs에 해당 token 행이 있으면 **데이터 불일치**로 간주.  
  **불일치 시 처리(v1 확정)**: 수정 API는 **409 Conflict**로 거부하고, 응답·감사·서버 로그에 reason `"데이터 불일치 점검 필요"`를 남김. (운영 안전 우선.)  
  쿼리 예(진단용): `SELECT 1 FROM scan_logs WHERE token = (SELECT token FROM token_master WHERE token_pk = ?) LIMIT 1`

**2) 컬럼별 수정 허용 조건(v1 확정)**

| 대상 컬럼 | 수정 허용 조건 |
|-----------|----------------|
| **고객 노출값** (rot_code, serial_number, warranty_bottom_code, digital_warranty_code, digital_warranty_collection) | **4조건 모두**: scan_count=0 + **warranties**에 해당 token_pk 없음 + **stock_units**에 해당 token_pk 없음 + **order_item_units**에 해당 token_pk 없음. |
| **product_name만** (내부 표시용) | **완화**: scan_count=0 + **warranties** 미연결 + **order_item_units** 미연결. **stock_units** 연결은 허용(재고만 묶인 단계에서 product_name 수정 가능). |

product_name은 **내부 표시 목적**이며, **판매/보증**(= order_item_units 또는 warranties 연결) 이후는 수정 금지. 위 표 조건에 이미 포함되어 있으나 문장으로 고정.

**3) 거부·권한 및 HTTP 상태(v1 확정)**  
위 조건을 만족하지 않으면 “이미 사용/발급/연결된 토큰”으로 간주하고 수정 API는 **409 Conflict**로 거부.  
**403 Forbidden**: 관리자 권한 없음 등 **권한** 거부 시에만 사용.  
**404 Not Found**: 해당 **token_pk**가 존재하지 않음.  
**422 Unprocessable Entity**: 요청 body에 **허용되지 않은 컬럼**이 포함됨(화이트리스트 위반).  
**500**: DB 오류·트랜잭션 실패 등 서버 내부 오류(서버 로그로 추적).

### 6.2 수정 허용 컬럼

- **표시용만 허용**: product_name (고객 노출 직결이 아닌 내부 표시용인 경우만).
- **고객 노출값 허용(예외 시)** : rot_code, serial_number, warranty_bottom_code, digital_warranty_code, digital_warranty_collection.  
  → §2.1 예외(오타·정책 변경)에 한해, 수정 가능 조건을 만족하는 토큰만 변경.

token, internal_code, token_pk, product_id, option_id 등 **식별자/연결자**는 수정 불가로 고정 권장.

### 6.3 감사 로그

**테이블 구분**: `token_admin_audit_logs`는 `token_master`와 별도 테이블이며, 관리자에 의한 token_master 수정 이력(누가/언제/무슨 컬럼을/어떤 값→어떤 값)을 기록한다. 현재 DB에는 없으며 v1 설계안대로 마이그레이션으로 생성한다.

- **필수**: 누가(관리자 user_id)·언제·어떤 token_pk(또는 token)·어떤 컬럼을 **어떤 값에서 어떤 값으로** 바꿨는지 기록.
- **v1 확정(감사 로그 테이블 스키마)**  
  **현재 DB에는 해당 테이블 없음**(설계안). 구현 시 마이그레이션으로 생성하고, **생성 후 db_structure_actual.txt 및 본 문서를 실제 스키마와 맞출 것.**  
  테이블명: `token_admin_audit_logs`(또는 유사).  
  - **필수 컬럼**: id(PK), token_pk, admin_user_id, changed_at, column_name, old_value, new_value.  
  - **권장 추가**: request_id(또는 trace id), ip, user_agent.  
  - **인덱스**: (token_pk, changed_at), (admin_user_id, changed_at).  
  변경 추적에 위만 있어도 충분.
- **v1 확정(수정 API 입력 형태)**:  
  - **API**: 한 요청에서 **여러 컬럼 변경 가능**(PATCH body에 허용 컬럼만 포함).  
  - **감사 로그**: **컬럼별 N행 INSERT**(**실제로 값이 바뀐 컬럼만** 1행씩). 변경 없음(old_value === new_value) 컬럼은 **감사 로그 미기록**.  
  - **UI**: 체크박스·필드 노출 제한으로 오남용 방지(예: product_name만 기본 노출, 고객 노출값은 “고급” 섹션으로 분리).
- **v1 확정(부분 성공 금지)**:  
  body에 여러 컬럼이 와도 **하나라도 실패**(허용 컬럼이지만 값 형식 오류, 조건 미충족 등)면 **전체 422 Unprocessable Entity**로 롤백. 부분 적용 없음. 트랜잭션 단순·감사 로그 일관성 유지.
- 수정 API 내부에서 UPDATE 전에 위 규칙대로 감사 로그 INSERT 한 뒤 token_master UPDATE 수행.

### 6.4 동시성·원자성

- 수정 API는 **단일 트랜잭션**으로 처리 권장: (1) 수정 가능 조건 확인 → (2) 감사 로그 INSERT → (3) token_master UPDATE.
- **동시 수정 방지**: 동일 token을 여러 관리자가 동시에 수정하지 않도록, **낙관적 락**(요청 시점의 `updated_at` 비교) 또는 **SELECT … FOR UPDATE**로 행 잠금 후 UPDATE.  
  감사 로그만 있어도 값이 꼬일 수 있으므로, 구현 시 위 둘 중 하나 적용.

### 6.5 수정 API 구현 시 코드에서 반드시 지킬 체크 순서

아래 순서를 지키면 §6.1·§6.3(부분 성공 금지, 변경 없음 미기록, 409/422 정의)과 일치한다. 중간에 하나라도 실패하면 **전체 롤백** 후 422(입력/형식) 또는 409(조건) 또는 500(DB) 반환.  
**상태코드 우선순위**: 같은 요청에서 422·409가 동시에 성립할 수 있으면, v1 기준 **입력/형식(422) → 조건(409)** 순으로 고정. 검증 단계에서 422 사유가 발견되면 조건 체크(409) 이전에 **422로 종료**한다.

1. **입력 검증(화이트리스트)** — 허용 컬럼 외 포함 시 **422**.
2. **(가능하면)** token_master 1행 잠금: **SELECT … FOR UPDATE** 또는 **updated_at** 기반 낙관락.
3. **§6.1 조건 체크**  
   - `scan_count=0`인데 scan_logs에 해당 token 행 존재 → **409** (데이터 불일치).  
   - 컬럼별 허용 조건(warranties/stock_units/order_item_units 미연결 등) 미충족 → **409**.
4. **실제 변경분만** 골라서 감사 로그 **N행 INSERT** (old_value === new_value인 컬럼은 **미기록**).
5. **token_master UPDATE**.
6. **트랜잭션 커밋**.

---

## 7. 관리자 전용 대량 등록(엑셀 업로드) 설계 원칙

- **INSERT ONLY** 유지. product_id 단위 일괄 UPDATE·전체 DELETE·“엑셀에 없는 건 삭제” **금지**.

### 7.1 입력 스키마(최소)

- **v1 강제**: **1행당 1토큰**, 엑셀 입력 키는 **option_id 1열만** 허용. 한 행 = “해당 option_id에 토큰 1개 생성”.  
  product_id+size+color 조합은 **v2 확장**으로 미룸(size/color 표준화·검증 복잡도 회피). **건수(batch count) 방식도 v2**.
- **서버에서 토큰 생성**: 엑셀에는 **token을 넣지 않고**, token·internal_code는 서버에서 생성. 기존 POST /admin/tokens와 동일한 규칙(token_admin_routes.js) 사용.
- **대안(덜 권장)**: 엑셀에 token 컬럼을 두고 “있으면 그대로 INSERT, 없으면 서버 생성”도 가능하나, 중복·형식 오류 리스크가 있으므로 **서버 생성 우선** 권장.

### 7.2 dry-run(미리보기) 모드

- 업로드 API에 **dry_run=true** 옵션 지원.
- 실제 INSERT 없이 “추가될 행 수 / 스킵될 행 수(token UNIQUE 충돌 등) / 실패 원인(매핑 실패 등)” 리포트만 반환.
- 관리자가 확인 후 dry_run=false로 재요청.

### 7.3 결과 리포트

- 성공 건수, 스킵 건수(중복 token 등), 실패 건수 및 사유를 응답에 포함.
- (권장) 성공/스킵/실패 목록을 **다운로드 가능한 파일**(CSV 등)로 제공해 운영 추적 용이하게.
- **생성된 토큰 목록 정책(고정)**:  
  - **dry-run**: 생성된 token 없음(당연).  
  - **실제 실행**: 생성된 token/token_pk/internal_code는 **CSV 다운로드로만 제공**(웹에서 다운로드). API 응답에는 요약(성공 건수 등)만 포함.  
  (내부 관리자 전용이면 응답에 일부 포함도 가능하나, 정책을 한 줄로 정해 두면 구현 혼선이 줄어듦.)
- **업로드 결과 CSV 스펙(v1)**  
  - **파일명**: `token_bulk_create_YYYYMMDD_HHMMSS.csv` (실행 시각 기준).  
  - **컬럼(권장)**: option_id, token_pk, token, internal_code, product_id(있으면), size, color(option에서 조인 가능하면), status(성공/스킵/실패), reason, created_at.  
  구현 시 위 필드·파일명 규칙을 따르면 작업이 빨라짐.

### 7.4 토큰 생성 규칙(강제)

- **token**: 서버에서 **crypto 기반**으로 생성(구현 예: randomBytes → base62/영숫자 인코딩 권장. 문서는 방식 강제하지 않고 “crypto 기반”만 명시).  
  **문자셋·길이**(예: 영숫자 62자, 20자) 고정. **token UNIQUE 충돌** 시 자동 재시도 N회(기존 token-admin-routes와 동일, 최대 시도 횟수 명시).
- **internal_code**: 서버에서 생성. 규칙·길이(예: 8~10자 영숫자) 고정. **중복 시** 재생성 또는 UNIQUE 위반 행 스킵 후 리포트.
- 구현 시 §7.1·§7.4를 한곳(예: utils 또는 token-admin-routes)에 두고, 관리자 단건 생성과 대량 업로드가 **동일 규칙**을 쓰도록 할 것.

---

## 8. 운영 안전장치 (legacy 스크립트 재등장 방지)

- **현재**: init/update 스크립트는 **파일 삭제**로 제거된 상태. CLI 전용이라 HTTP 라우트는 없음.
- **남는 리스크**: 이전 커밋/브랜치 체크아웃으로 스크립트가 되살아나거나, 문서만 보고 누군가 로컬에서 복사해 운영 서버에서 실행할 수 있음.

### 8.1 권장 조치

| 조치 | 설명 | 우리 환경 반영 |
|------|------|----------------|
| **배포·문서 경고** | 운영 가이드·배포 체크리스트에 “token_master 초기화는 관리자 UI 또는 대량 업로드만 사용. init-token-master-from-xlsx, update-token-master-from-xlsx 실행 금지” 문구 명시. | deploy.sh 또는 운영 문서에 한 줄 추가 가능. |
| **CI/배포 체크(선택)** | 배포 파이프라인에서 `backend/init-token-master-from-xlsx.js` 또는 `update-token-master-from-xlsx.js` **파일 존재 시** 빌드/배포 실패하도록 grep 체크. | 현재 배포는 deploy.sh 기반이라, 별도 CI가 있으면 해당 단계에 추가. 없으면 “배포 전 수동 확인” 항목으로. |
| **deploy.sh pre-deploy 체크(권장)** | deploy.sh **실행 초기**에 legacy 스크립트 **파일 존재**를 검사하고, 있으면 **즉시 종료**. **1순위는 파일 존재 체크**(문자열 grep은 문서/가이드 잔여 실행 문구 탐지용 보조). | **체크 방식**: `test -f "$REPO_DIR/backend/init-token-master-from-xlsx.js"` 등. **경로 기준**: deploy.sh에서 `REPO_DIR="/root/prepmood-repo"`로 정의되며, `cd "$REPO_DIR"` 후 실행되므로 **REPO_DIR 기준 절대 경로** 사용(예: `"$REPO_DIR/backend/init-token-master-from-xlsx.js"`). |
| **비실행 보관(대안)** | 삭제 대신 `backend/legacy/` 등으로 이동하고, 파일 상단에 `if (process.env.NODE_ENV === 'production') process.exit(1);` 가드 추가. | 현재는 **삭제**로 완료했으므로 선택 사항. 필요 시 나중에 legacy 폴더 정리 시 참고. |

---

## 9. 요약

- **xlsx 토큰 경로 제거**로 init(전체 DELETE 후 재삽입), update(product_id 단위 전체 갱신)에 따른 충돌·사고 가능성을 제거했고, **관리자 단일 SSOT**로 정리했다.
- **토큰 데이터 정책**(§2): 스냅샷 선언, 불변 원칙+예외+금지, products.xlsx는 token_master SSOT가 아님.
- **관리자 수정 기능**은 §6 설계 원칙(수정 가능 조건·허용 컬럼·감사 로그·§6.4 동시성·원자성)을 반드시 준수해 구현한다.
- **관리자 전용 대량 등록**은 §7 설계 원칙(INSERT ONLY, 입력 스키마 v1 1행=1토큰, dry-run, 결과 리포트, §7.4 토큰 생성 규칙)을 준수해 별도 작업으로 추가한다.
- **운영 안전장치**(§8): legacy 스크립트 재등장 방지를 위해 배포·문서 경고 및(가능 시) CI/배포 체크를 권장한다.
- 다른 문서에서 init/update 스크립트를 참조할 때는 이 문서와 "폐기됨, 관리자 단일 경로로 통합"을 기준으로 이해하면 된다.

---

## 10. GPT 피드백 반영 요약 (수신·검토 결과)

**과거 검토 기록.** 최종 v1 정책은 **§6·§7·§8 본문 및 §13**을 따름.
GPT가 제안한 보완 사항을 **우리 코드·DB·배포 환경**에 맞게 검토한 뒤, 아래처럼 반영했다.

| GPT 제안 | 판단 | 반영 내용 |
|----------|------|-----------|
| “토큰 불변 vs 수정 허용” 정책 명확화 | **받아들임** | §2.1: 원칙(불변), 예외(오타·정책 변경), 금지(이미 사용/발급/연결된 토큰). |
| CLI 재등장 방지(CI grep 등) | **부분 반영** | §8: 파일은 이미 삭제됨. 배포·문서 경고 권장. CI/배포 체크는 “선택·가능 시”로 기술. (현재 deploy.sh 기반이라 별도 CI 없음.) |
| 수정 기능 안전장치(조건·허용 컬럼·감사 로그) | **받아들임** | §6: 수정 가능 조건(scan_count=0, warranties/stock_units/order_item_units 미연결), 허용 컬럼, token_admin_audit_logs 권장. |
| 대량 등록 스펙(키·dry-run·리포트) | **받아들임** | §7: 입력 스키마(서버에서 token 생성 권장), dry-run, 결과 리포트·다운로드. |
| products.xlsx SSOT 아님 명시 | **받아들임** | §2.2: “검사용/보조”, “token_master 입력 SSOT는 관리자·대량 업로드만”. |
| 완료 정의(체크리스트) | **받아들임** | §5.2: 스크립트 삭제·실행 단계 제거 완료, 배포 문서·회귀 확인은 권장 항목. |
| 스냅샷 정책 한 문장 | **받아들임** | §2.0: “token_master는 발급 시점 스냅샷, product_options 변경은 미래 발급분에만 반영”. |

---

## 11. GPT 피드백(2차) 반영 요약

**과거 검토 기록.** “조건 완화(선택)” 등은 이후 §13에서 **v1 정책으로 확정**됨. 최종은 §6.1·§13 참고.
GPT가 제안한 보완을 **우리 코드·DB**에 맞게 검토한 결과.

| GPT 제안 | 판단 | 반영 내용 |
|----------|------|-----------|
| §6.1 scan_count가 DB에 없을 수 있음 → scan_logs EXISTS로 | **우리 DB에는 scan_count 존재** | token_master.scan_count 컬럼 있음(db_structure_actual.txt). auth-routes에서 스캔 시 증가. 문서에 **스키마 근거** 한 줄 추가. 동일 의미로 scan_logs(token) 없음으로 대체 가능하다고 명시. |
| 수정 가능 조건이 너무 강함 → 컬럼별/단계별 완화 | **받아들임** | §6.1에 **조건 완화(선택)** 단락 추가: stock_units만 연결된 단계 허용, 또는 컬럼별(product_name 완화 등) 분리. 기본은 보수적 유지. |
| 수정 기능 동시성/원자성 규칙 | **받아들임** | §6.4 추가: 단일 트랜잭션(조건 확인→감사 INSERT→UPDATE), 낙관적 락 또는 SELECT FOR UPDATE. |
| 대량 업로드 v1은 1행당 1토큰, 건수는 v2 | **받아들임** | §7.1: v1은 1행당 1토큰. 3차에서 v1 입력 키를 **option_id만** 강제로 고정(§7.1 갱신). |
| token 생성 규칙 문서화( crypto, 재시도, 문자셋) | **받아들임** | §7.4 추가: token은 서버 crypto 기반, UNIQUE 충돌 시 재시도 N회, 문자셋 고정. internal_code 중복 처리 명시. |
| §5.2 DoD에 “문자열 참조 0건” 체크 | **받아들임** | 완료 정의에 “실행/가이드 문서에서 init/update 스크립트 이름이 §4.4 외 0건” 항목 추가. |
| “커밋/푸시” 문단 제거 | **해당 없음** | 해당 문구는 SSOT 문서 본문에 없음(이전 답변에만 있었음). 문서 수정 없음. |

**이상한 부분**: “scan_count가 없을 가능성이 크다”는 **우리 환경과 불일치**. token_master.scan_count는 존재하며 auth에서 갱신함.  
**추가로 필요한 부분**: 수정·대량 등록 **구현 시** §6·§7(및 §6.4, §7.4)을 스펙/테스트 기준으로 사용할 것.

---

## 12. GPT 피드백(3차) 반영 요약

**과거 검토 기록.** “구현 전 둘 중 하나 확정” 등은 §13에서 **v1으로 확정**됨. 최종 정책은 §6·§7·§8 본문 및 §13 참고.
실제 구현/운영에서 터질 수 있는 디테일을 **우리 스키마·코드**에 맞게 반영한 결과.

| GPT 제안 | 판단 | 반영 내용 |
|----------|------|-----------|
| §6.1 scan_logs 키(token vs token_pk) 혼재 방지 | **우리 스키마 확인** | scan_logs는 **token varchar(20)** 만 보유(token_pk 없음). §6.1에 “scan_logs.token 기준” 명시 및 **쿼리 예시 1개** 추가. |
| 수정 거부 코드 403/409 통일 | **받아들임** | **409 Conflict**: 이미 연결되어 변경 불가. **403 Forbidden**: 관리자 권한 없음. 문서에 고정. |
| 감사 로그 다중 컬럼 시 N행 vs 1행 정책 | **받아들임** | §6.3: 한 요청에서 여러 컬럼 변경 시 **컬럼별 N행 INSERT**(권장). 또는 API에서 1컬럼만 허용해 1요청=1행. 구현 전 둘 중 하나 확정. |
| §7.1 v1은 option_id만 강제 | **받아들임** | §7.1: v1 입력 키를 **option_id 1열만** 허용. product_id+size+color는 v2로 미룸. |
| 대량 업로드 결과 “생성된 token 목록” 정책 | **받아들임** | §7.3: dry-run은 생성 token 없음. 실제 실행 시 생성 token/token_pk/internal_code는 **CSV 다운로드로만** 제공, API 응답은 요약만. |
| §7.4 crypto 예시 완화(randomInt → randomBytes 권장) | **받아들임** | §7.4: “crypto 기반”만 강제, 구현 예는 randomBytes→base62 등 권장으로 완화. 문자셋·길이·재시도는 유지. |
| deploy.sh pre-deploy 체크 구체화 | **받아들임** | §8.1: deploy.sh 실행 초기에 legacy 파일 존재 시 **즉시 종료**하는 grep 체크 한 줄 추가 권장(5줄 내외). |

**이상한 부분**: 없음.  
**결론**: 스키마 키(scan_logs.token), API/로그/리포트 일관성(409·감사 N행·업로드 결과 정책), v1 option_id 강제, deploy.sh 가드까지 문서에 반영해 두었으므로 구현 단계에서 의사결정 재논의를 줄일 수 있음.

---

## 13. GPT 피드백(4차) 반영 요약 — v1 정책 확정

“선택지를 남겨둔 부분을 v1으로 확정”해 구현 시 재논의를 없앤 결과.

| GPT 제안 | 판단 | 반영 내용 |
|----------|------|-----------|
| 수정 API 입력 형태 하나로 확정 | **받아들임** | §6.3 v1 확정: **여러 컬럼 변경 가능** + 감사 로그 **컬럼별 N행 INSERT**. UI는 체크박스·필드 제한으로 오남용 방지(product_name 기본, 고객 노출값은 고급 섹션). |
| 컬럼별 조건 완화를 v1 정책으로 고정 | **받아들임** | §6.1 **v1 정책 확정(2단계)**: 고객 노출값 → 보수적 4조건 모두. product_name만 → scan_count=0 + order_item_units/warranties 미연결, stock_units 연결은 허용. |
| scan_count vs scan_logs SSOT 우선순위 | **받아들임** | §6.1: **수정 가능 여부 SSOT = token_master.scan_count**. scan_count=0이면 “스캔 전”. scan_logs는 **진단·불일치 탐지용**만(불일치 시 점검). |
| 업로드 결과 CSV 필드·파일명 규칙 | **받아들임** | §7.3: 파일명 `token_bulk_create_YYYYMMDD_HHMMSS.csv`. 컬럼(권장): option_id, token_pk, token, internal_code, product_id, size, color, status, reason, created_at. |
| deploy.sh 체크를 “파일 존재”로 코드 레벨 고정 | **받아들임** | §8.1: **1순위 = 파일 존재 체크**. 예시: `test -f backend/init-token-master-from-xlsx.js && { echo "Legacy script 존재; 배포 중단."; exit 1; }`. 문자열 grep은 보조. |

**이상한 부분**: 없음.  
**결론**: 수정 API 형태·컬럼별 조건·스캔 SSOT·CSV 스펙·deploy.sh 체크 방식을 v1으로 확정해 두었으므로, 문서만 보고 구현해도 의사결정 지점이 남지 않음.

---

## 14. 실제 DB 확인 결과 및 실행 준비

**기준**: `backend/scripts/db_structure_actual.txt` (실제 DB 구조 스냅샷).

### 14.1 확인한 테이블·컬럼

| 테이블 | 상태 | 비고 |
|--------|------|------|
| **token_master** | 존재 | PK `token_pk`(int), `token`(varchar 20 UNI), `product_id`(varchar 128 FK→admin_products), `option_id`(bigint FK→product_options), `scan_count`(int 기본 0), `serial_number`·`rot_code`·`warranty_bottom_code`·`digital_warranty_code`·`digital_warranty_collection`·`product_name` 등. 수정 API·§6.1 조건 검증에 사용할 컬럼 모두 존재. |
| **scan_logs** | 존재 | `token`(varchar 20), `user_id`, `event_type`, `created_at` 등. token_pk 없음 → **token**으로 token_master와 조인. §6.1 불일치 진단 쿼리: `SELECT 1 FROM scan_logs WHERE token = (SELECT token FROM token_master WHERE token_pk = ?) LIMIT 1`. |
| **users** | 존재 | PK `user_id`(int). 별도 admin 테이블 없음. `inquiry_replies.admin_user_id`, `transfer_logs.admin_user_id` 등이 **users.user_id** 참조 → **token_admin_audit_logs.admin_user_id**도 `users.user_id` FK로 통일 가능. |
| **token_admin_audit_logs** | 없음 | §6.3 설계안대로 마이그레이션으로 신규 생성 대상. |

### 14.2 이름·FK 일관성

- **테이블명**: `qr_audit_logs`는 별도 용도(QR 시리얼/이벤트). `token_admin_audit_logs` 신규명으로 충돌 없음.
- **admin_user_id**: 기존 패턴대로 `INT` → `users(user_id)` FK, NOT NULL. (관리자 삭제 시 감사 행 유지를 위해 RESTRICT 권장.)

### 14.3 실행 준비 — 다음 단계

1. **마이그레이션 적용**: `088_create_token_admin_audit_logs.sql` 실행 후 **실제 DB에서** `db_structure_actual.txt` 덤프로 갱신. (현재 파일 내 token_admin_audit_logs는 **088 적용 후 예상 스키마**이며, 적용 전에는 해당 테이블이 DB에 없음.)
2. **문서 동기화**: 생성된 테이블 스키마를 §6.3 또는 본 절에 실제 컬럼·인덱스 기준으로 반영(선택).
3. **이후 구현**: 관리자 token_master 수정 API(PATCH)·UI는 §6 전부 준수하여 구현.

### 14.4 GPT 8항목 검증 결과 (088 실행 전 점검)

| # | GPT 제안 | 판단 | 근거 |
|---|----------|------|------|
| 1 | **멱등성**: IF NOT EXISTS·인덱스/FK 재실행 시 스킵 | **일리 있음, 이미 충족** | 088은 `CREATE TABLE IF NOT EXISTS` 한 문으로 테이블·인덱스·FK를 모두 정의. 재실행 시 테이블이 있으면 전체 스킵. 주석 1줄 추가함. |
| 2 | **token_pk FK** 가능 여부(token_master PK·InnoDB) | **일리 있음, 이미 충족** | db_structure_actual 기준 `token_master.token_pk`는 INT PK, 엔진 InnoDB. FK 참조 가능. |
| 3 | **users(user_id) FK** 존재·타입 일치 | **일리 있음, 이미 충족** | `users.user_id` INT PK, InnoDB. admin_user_id INT로 동일 타입. |
| 4 | **컬럼 타입/길이·DEFAULT** | **일리 있음, 일부 반영** | token_pk·admin_user_id는 **참조 컬럼과 동일해야 함** → INT 유지(GPT의 BIGINT UNSIGNED 제안은 token_master·users가 INT이므로 적용 시 타입 불일치). **changed_at**만 `DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`로 반영(누락 방지·마이크로초). |
| 5 | **인덱스 (token_pk, changed_at), (admin_user_id, changed_at)** | **일리 있음, 이미 충족** | v1에서 위 두 개만으로 충분. changed_at 단독 인덱스는 v1 생략. |
| 6 | **FK ON DELETE RESTRICT** 적합성 | **일리 있음** | 감사 로그는 삭제되면 안 되므로 RESTRICT 적절. 단, users 행을 실제로 DELETE하는 운영이 있으면 RESTRICT로 막히므로, 관리자 계정은 소프트 삭제만 쓰는지 확인 필요. |
| 7 | **db_structure_actual “적용 전/후” 구분** | **일리 있음** | §14.3에 “token_admin_audit_logs는 088 적용 후 예상 스키마, 적용 후 실제 덤프로 동기화” 문구 반영. |
| 8 | **실행 후 검증** (SHOW CREATE TABLE, FK/인덱스·더미 INSERT 실패 확인) | **일리 있음** | §14.5에 최소 검증 절차 정리. |

### 14.5 088 적용 직후 최소 검증

- `SHOW CREATE TABLE token_admin_audit_logs\G` 로 테이블·인덱스·FK 확인.
- `SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='prepmood' AND TABLE_NAME='token_admin_audit_logs';` 로 키 개수 확인.
- FK 동작: 존재하지 않는 `token_pk` 또는 `admin_user_id`로 INSERT 시도 → 실패하는지 확인.
- **기존에 이미 있던 테이블인지**까지 확인하면, “테이블은 있는데 컬럼/인덱스/FK가 빠진 부분 적용” 상태를 걸러낼 수 있음. v1에서는 **SHOW CREATE TABLE 출력에 FK 2개(fk_taal_token_pk, fk_taal_admin_user_id)와 복합 인덱스 2개(idx_token_pk_changed_at, idx_admin_user_id_changed_at)가 모두 존재하는지** 확인하면 충분. v2에서 088을 “테이블 생성 + (인덱스/FK 존재 체크 후 추가)”로 쪼개면 멱등 보정까지 가능.

### 14.6 남는 리스크/결정 포인트 (2개)

**1. CREATE TABLE IF NOT EXISTS 멱등성의 한계**

- 현재 방식은 “테이블이 있으면 **전체 스킵**”이라, 테이블은 이미 있는데 컬럼/인덱스/FK가 빠진 상태(부분 적용·수동 생성·옛 스키마)면 **자동 보정이 되지 않음**.
- §14.5의 SHOW CREATE TABLE·키 개수·FK 더미 INSERT 검증이 그래서 중요하고, 운영에서는 “한 번만 보고 끝”이 아니라 **기존에 있던 테이블인지**까지 확인하는 절차가 됨.
- 이 리스크까지 제로로 만들려면 v2에서 088을 “테이블 생성 + (인덱스/FK 존재 체크 후 추가)” 형태로 쪼개는 방식이 최종형. **v1에서는 현재도 충분히 실용적.**

**2. users 삭제 정책 고정 (= RESTRICT와 충돌 가능성 차단)**

- 감사 로그 철학상 **ON DELETE RESTRICT**는 맞으나, users 행을 실제로 **DELETE**하면 운영 중 FK 에러 발생.
- **운영 정책/문서에 한 줄 고정**: “**관리자 계정은 소프트 삭제만**” 또는 최소한 “**DELETE 금지**”.
  - 이미 소프트 삭제 구현이 있으면: 위 문장만 문서에 추가하면 됨.
  - 아직 없으면: “DELETE 금지”만이라도 고정해 두면 RESTRICT 리스크는 사라짐.
