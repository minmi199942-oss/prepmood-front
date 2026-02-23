# 관리자 페이지: 새 상품·토큰·재고 통합 설계/구현 방안

**요약**: **스키마 정리(옵션 메타 SSOT + 옵션별 시퀀스 + token_master 스냅샷 유지)** 후, 관리자 토큰 생성 API·UI를 구현한다.

**목적**: 관리자 페이지에서 **새 상품 → 토큰(옵션별 메타 포함) → 재고**까지 전체를 추가·관리할 수 있도록 설계 및 구현 방안을 정리합니다.  
(xlsx/SQL 수동 없이, 기존 토큰 초기화 없이 **상품+사이즈+색상+개수**만 입력하면 토큰과 보증서/인보이스용 메타를 서버가 한 번에 자동 생성)

---

## 1. 목표 및 범위

| 목표 | 설명 |
|------|------|
| **새 상품 추가** | 관리자 UI로 상품 등록 (이미 구현됨) |
| **토큰 추가** | 관리자 UI로 상품별 토큰 N개 생성 (신규 구현) |
| **재고 추가** | 관리자 UI로 토큰 선택 후 재고 등록 (이미 구현됨) |
| **기존 데이터 보호** | init/xlsx 실행 없이 **기존 토큰 유지**하면서 신규만 추가 |

**범위**
- 백엔드: 토큰 생성 API(상품+사이즈+색상+개수 → 토큰+메타 일괄 생성), 상품별 토큰 목록 API(기존 GET .../tokens 활용)
- 프론트: 토큰 관리 화면(상품·사이즈·색상 선택 후 토큰 생성), 재고 페이지 연동
- DB: **스키마 정리** — `product_options`에 옵션 메타 SSOT 추가, `token_variant_sequence` 신규(옵션별 시퀀스), `token_master`에는 `option_id` 추가 + 기존 메타 컬럼은 **스냅샷 유지**(기존 읽기 경로 무변경)

---

## 2. 현재 상태 요약

| 단계 | 기능 | 상태 | 비고 |
|------|------|------|------|
| 상품 | 상품 목록/추가/수정/삭제 | ✅ 구현됨 | `products.html`, POST /api/admin/products |
| 토큰 | 토큰 목록(상품별)·토큰 생성 | ❌ 없음 | 수동 SQL 또는 xlsx init(기존 삭제) 필요 |
| 재고 | 재고 목록·재고 추가(토큰 선택) | ✅ 구현됨 | `stock.html`, GET .../tokens, POST /api/admin/stock |

**갭**
- 상품 추가 후 해당 상품의 **토큰을 UI에서 생성하는 경로가 없음**
- 재고 추가 시 "사용 가능한 토큰"은 `token_master`에 이미 있는 것만 표시 → 토큰이 0개면 재고 추가 불가

**설계 방향**  
- 1차(토큰만 생성) → 2차(메타 자동 생성) 단계를 두지 않고, **처음부터 풀 메타 자동 생성**으로 구현. 상품+사이즈+색상+개수만 입력하면 토큰과 보증서/인보이스용 메타(warranty_bottom_code, rot_code, digital_warranty_code, collection)를 서버가 한 번에 생성.

---

## 3. 설계

### 3.0 스키마 정리 (SSOT · 시퀀스 · 스냅샷)

최소 스키마 변경으로 **깔끔함·효율·호환성**을 동시에 얻기 위한 정리안이다.

- **옵션 메타 SSOT**: 옵션마다 prefix가 달라지고, 번호는 **옵션별 시퀀스**에 의해 증가한다. `serial_prefix`도 옵션 메타로 두어 오타/규칙 변경의 SSOT를 `product_options`로 고정한다.
- **token_master**: 기존 컬럼(rot_code, warranty_bottom_code, digital_warranty_code 등)은 **스냅샷 유지** — 보증서/재고/관리자 코드가 이미 `tm.*`를 읽고 있으므로 파급 없음. `option_id`만 추가.

#### 3.0.1 product_options 확장 (옵션 메타 SSOT)

추가 컬럼(모두 NULL 허용, 기존 행은 NULL 유지):

| 컬럼 | 타입 | 비고 |
|------|------|------|
| rot_code | varchar(100) NULL | ROT 코드 (옵션 고정) |
| warranty_bottom_prefix | varchar(120) NULL | warranty_bottom_code = prefix + LPAD(seq,6,'0'). **prefix는 끝 구분자 포함 완성형**(예: PREPMOOD_TENEUSOLIDLBS_). 생성 로직에서 구분자 추가 금지. |
| serial_prefix | varchar(120) NULL | serial_number = serial_prefix + LPAD(seq,6,'0'). **prefix는 끝 구분자 포함 완성형**(예: PM26-TeneuSolid-LightBlue-S-). 옵션에서 가져와 오타 방지. |
| digital_warranty_code | varchar(100) NULL | 디지털 보증서 코드 (옵션 고정). **결정**: token_master 스냅샷·PUT 검증과 통일하기 위해 100으로 고정(200 확장 안 함). |
| digital_warranty_collection | varchar(100) NULL | 컬렉션명. 동일하게 100으로 통일. |
| season_code | varchar(20) NULL | (선택) 시즌 코드 |

#### 3.0.2 token_variant_sequence (신규)

옵션별 **원자적 시퀀스**용 테이블.

| 컬럼 | 타입 | 비고 |
|------|------|------|
| option_id | bigint NOT NULL | PK, product_options.option_id 참조 |
| last_number | int NOT NULL DEFAULT 0 | 마지막 할당 번호 |
| updated_at | datetime NOT NULL | DEFAULT CURRENT_TIMESTAMP ON UPDATE |

- **원자적 증가 필수**: count가 N이면 `last_number`를 N만큼 올리고, 1..N 구간을 한 번에 할당. 동시 요청 시에도 충돌 없이 번호가 이어지도록:
  1) 트랜잭션 내에서 **행이 없을 때** 경쟁 방지: `INSERT INTO token_variant_sequence(option_id, last_number) VALUES (?, 0) ON DUPLICATE KEY UPDATE last_number = last_number;` 로 멱등 처리.
  2) **구간 할당은 반드시 아래 순서로만 수행**(UPDATE만 하고 start/end를 다시 조회하는 방식 금지):
     - `SELECT last_number FROM token_variant_sequence WHERE option_id = ? FOR UPDATE;` → **old_last** 읽기
     - **start = old_last + 1**, **end = old_last + count**
     - `UPDATE token_variant_sequence SET last_number = end WHERE option_id = ?;`
     - 이후 **seq = start .. end** 루프로 토큰 생성
- token_master에 size/color 스냅샷 컬럼은 추가하지 않는다. size/color 필터는 **JOIN product_options**로 처리(§3.2.3).

#### 3.0.3 token_master 변경 (최소)

- **option_id** bigint NULL 추가.
- 인덱스: `INDEX idx_token_master_option_id (option_id)`.
- **FK: 기본 적용(권장)** — 신규 생성 토큰은 option_id가 채워지므로 FK로 정합성 강제. 기존 option_id NULL은 FK와 무관. ON DELETE RESTRICT 유지.

#### 3.0.4 기존 데이터

- 기존 `token_master` 행은 `option_id` NULL 그대로 둔다. 신규 생성분부터 `option_id` + 스냅샷 메타가 채워진다.
- 백필은 별도 작업으로, 필요 시 `stock_units`에 size/color가 있는 토큰 등 매칭 가능한 범위만 수행.

#### 3.0.5 마이그레이션 SQL (예시)

실제 적용 시 `db_structure_actual.txt` 및 기존 마이그레이션 규칙에 맞춰 조정.

```sql
-- product_options 컬럼 추가
ALTER TABLE product_options
  ADD COLUMN rot_code VARCHAR(100) NULL,
  ADD COLUMN warranty_bottom_prefix VARCHAR(120) NULL,
  ADD COLUMN serial_prefix VARCHAR(120) NULL,
  ADD COLUMN digital_warranty_code VARCHAR(100) NULL,
  ADD COLUMN digital_warranty_collection VARCHAR(100) NULL,
  ADD COLUMN season_code VARCHAR(20) NULL;

-- token_variant_sequence 생성
CREATE TABLE token_variant_sequence (
  option_id BIGINT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (option_id),
  CONSTRAINT fk_tvs_option_id
    FOREIGN KEY (option_id) REFERENCES product_options(option_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

-- token_master에 option_id 추가
ALTER TABLE token_master ADD COLUMN option_id BIGINT NULL;
CREATE INDEX idx_token_master_option_id ON token_master(option_id);
-- FK 기본 적용 (신규 토큰 정합성 강제, 기존 option_id NULL은 무관)
ALTER TABLE token_master ADD CONSTRAINT fk_tm_option_id
  FOREIGN KEY (option_id) REFERENCES product_options(option_id) ON DELETE SET NULL ON UPDATE CASCADE;
```

### 3.1 사용자 플로우 (목표)

1. **상품 관리** → "+ 새 상품 추가" → 상품 ID, 상품명, 가격 등 입력 → 저장  
   → `admin_products`에 행 추가
2. **토큰 관리**(신규) → "토큰 추가" → **상품 선택 → 사이즈·색상 선택 → 개수 입력** → 생성  
   → 서버가 `token` + `internal_code` + `warranty_bottom_code` + `rot_code` + `digital_warranty_code` + `digital_warranty_collection` + `product_name` 등을 한 번에 생성해 `token_master`에 INSERT (기존 토큰 삭제 없음)
3. **재고 관리** → "재고 추가" → 상품 선택 → (토큰이 없으면 "토큰 추가" 유도) → 사용 가능 토큰 목록에서 선택 → 저장  
   → `stock_units`에 행 추가

### 3.2 API 설계

#### 3.2.1 토큰 생성 (신규) — 풀 메타 자동 생성

| 항목 | 내용 |
|------|------|
| **엔드포인트** | `POST /api/admin/tokens` |
| **인증** | `authenticateToken`, `requireAdmin` |
| **Body** | `{ "product_id": "PM-26-SH-001", "size": "S", "color": "Light Blue", "count": 10 }` |
| **규칙** | `product_id` 필수, `admin_products`에 존재. **size/color 유효성 SSOT**: (resolveProductId로 얻은 상품 ID, size, color) 조합이 **product_options에 없으면 400**. product_options만 기준(재고 옵션 API 아님). `count`는 1~100, 미지정 시 1 |
| **로직** | 1) 입력 product_id는 **resolveProductId**로 **정규화된 상품 ID** 확정. 2) (그 상품 ID, size, color)로 `product_options`에서 option_id + 옵션 메타 조회 — **해당 행이 없으면 400**. 필수 옵션 메타 5개 중 하나라도 NULL이면 400. 3) **같은 connection으로 트랜잭션**: START TRANSACTION → INSERT ODKU → SELECT FOR UPDATE → start/end 확정 → UPDATE last_number → seq=start..end 루프로 토큰 생성 → token_master INSERT → COMMIT. **created_count ≠ count이면 에러 처리 + ROLLBACK**(부분 성공 금지). 4) 감사 로그: `[ADMIN_TOKENS_CREATE] { userId, option_id, count, start, end, created_count }`. |
| **응답** | `{ success: true, created: [ { token_pk, token_masked, internal_code, warranty_bottom_code } ], count: N }` (평문 필드 없음, 마스킹만) |

- 기존 `init-token-master-from-xlsx.js`의 `generateToken`, `generateUniqueToken` 로직 재사용. **INSERT 컬럼/기본값은 init 스크립트 INSERT 구문을 SSOT로 사용.**

#### 3.2.2 토큰 메타 자동 생성 규칙 (옵션 메타 SSOT + 시퀀스)

- **옵션마다 prefix가 달라지고, 번호는 옵션별 시퀀스에 의해 증가한다.** prefix·규칙의 SSOT는 `product_options`(§3.0.1)이다.
- **원자적 시퀀스**: `token_variant_sequence`에서 해당 `option_id` 행을 잠금(`SELECT ... FOR UPDATE`) 후 `last_number += count`로 구간 확보, 그 구간(1..count)으로 `warranty_bottom_code`·`serial_number`를 생성한다.

| 필드 | 규칙 (요약) |
|------|-------------|
| **warranty_bottom_code** | `warranty_bottom_prefix`(옵션 메타) + `LPAD(seq, 6, '0')`. seq는 해당 옵션의 `token_variant_sequence.last_number` 구간에서 할당. |
| **serial_number** | `serial_prefix`(옵션 메타) + `LPAD(seq, 6, '0')`. 동일 seq 사용. |
| **rot_code** | 옵션 메타 `rot_code` 그대로(옵션별 고정). |
| **digital_warranty_code** | 옵션 메타 `digital_warranty_code` 그대로(옵션별 고정). xlsx 규칙: `{MODEL_NAME_UPPER} · SIZE {SIZE} · {COLOR_UPPER}` 등. |
| **digital_warranty_collection** | 옵션 메타 `digital_warranty_collection` 그대로. xlsx 규칙: `COLLECTION — {SEASON_LABEL} {YEAR}`. |
| **product_name** | `admin_products.short_name ?? admin_products.name` 스냅샷. |

- **필수 옵션 메타**(토큰 생성 시 5개 모두 NOT NULL 검사): `rot_code`, `warranty_bottom_prefix`, `serial_prefix`, `digital_warranty_code`, `digital_warranty_collection`. 하나라도 NULL이면 400("옵션 메타 설정 필요") — 오타/누락 상태에서 대량 생성 방지.
- prefix는 **완성된 prefix**(끝 구분자 포함)로 저장. 생성 로직에서 구분자 추가하지 않음(SSOT 유지).
- 구현 시 `init-token-master-from-xlsx.js` 및 xlsx 행 구조를 참고해 규칙을 코드로 고정할 것.

#### 3.2.3 상품별 토큰 목록 (관리용, 선택)

| 항목 | 내용 |
|------|------|
| **엔드포인트** | 기존 `GET /api/admin/stock/products/:productId/tokens` 활용 또는 `GET /api/admin/tokens?product_id=xxx` 신규 |
| **용도** | 토큰 관리 화면에서 "이 상품의 토큰 전체 목록(재고 등록 여부 포함)" 표시 |
| **size/color 필터** | **token_master에는 size/color 컬럼이 없음.** 토큰 목록 API의 size/color 필터는 **JOIN product_options**로 구현한다: `tm.option_id = po.option_id`, product_id는 **resolveProductId로 얻은 정규화된 상품 ID** 사용, size/color 있으면 `AND po.size = ? AND po.color = ?`. 재고 미등록 조건은 기존대로 유지. option_id NULL인 기존 토큰 처리·폴백은 §9.1 참고. |
| **선택** | 재고 미등록만 쓰면 기존 API를 위 JOIN 방식으로 수정. "전체 토큰 목록+재고 여부"가 필요하면 별도 API 추가. |

- **option_id NULL(기존 토큰) 처리 — 결정**: (a) **size/color 필터가 있을 때**: option_id NULL 토큰은 **결과에서 제외**(정확성 우선). (b) **size/color 필터가 없을 때**: 전체 표시(LEFT JOIN), option_id NULL도 포함. serial_number 파싱 폴백은 **기본 경로에 넣지 않음**(정규식 파싱이 SSOT를 깨뜨리므로). 기존 토큰을 size/color로 찾아야 하는 요구가 생기면 그때만 별도 옵션(쿼리 파라미터 등)으로 추가.
- 1차 구현에서는 **기존 GET .../stock/products/:productId/tokens 쿼리를 JOIN 기반으로 변경**하여 size/color 필터가 동작하도록 한다.

#### 3.2.4 PUT 옵션 메타 편집 API — 검증 규칙 (결정)

`PUT /api/admin/product-options/:optionId/meta` 구현 시 **최소 검증**으로 깨진 메타 입력을 막는다.

| 항목 | 규칙 (결정) |
|------|-------------|
| **warranty_bottom_prefix**, **serial_prefix** | **끝 구분자 포함** 검사: 마지막 문자가 `_` 또는 `-` 등 허용 구분자여야 함. (빈 문자열이면 NULL/미설정으로 허용 가능.) |
| **rot_code**, **season_code** | 길이 제한: rot_code ≤ 100, season_code ≤ 20 (DB 컬럼 길이에 맞춤). |
| **digital_warranty_code**, **digital_warranty_collection** | **100자 제한** — product_options·token_master·검증 모두 100으로 통일. 100 초과 시 **400** 반환(자동 자르기 금지, §9.3). |

- 위 검증 실패 시 400 + 명확한 메시지로 옵션 메타 수정을 유도한다.

### 3.3 UI 설계

#### Option A: 토큰 전용 페이지 (권장)

| 항목 | 내용 |
|------|------|
| **경로** | `admin-qhf25za8/tokens.html` (신규) |
| **메뉴** | `admin-layout.js` 네비에 "토큰 관리" 추가 (상품 관리 다음 등) |
| **화면** | 1) 상품 선택 2) 사이즈·색상 선택(해당 상품 옵션) 3) "개수" 입력 + [토큰 생성] 버튼 → POST /api/admin/tokens 4) 성공 시 해당 상품·옵션의 "사용 가능한 토큰" 목록 갱신(GET .../tokens — 서버가 option_id JOIN으로 size/color 필터 적용). **옵션 메타 상태 표시(OK/미설정)** + **옵션 메타 편집** 버튼 또는 링크(필수: xlsx/SQL 수동 없이 메타를 넣을 경로 필요) |
| **장점** | 상품·재고와 분리되어 흐름이 명확함 |

#### Option B: 상품 관리 페이지에 통합

| 항목 | 내용 |
|------|------|
| **방식** | 상품 카드에 "토큰 관리" 버튼 추가 → 클릭 시 모달 또는 하위 영역에서 해당 상품의 토큰 목록 + "토큰 N개 추가" |
| **장점** | 상품 단위로 토큰을 바로 추가할 수 있음 |

#### Option C: 재고 관리 페이지에서 토큰 없을 때 유도

| 항목 | 내용 |
|------|------|
| **방식** | 재고 추가 모달에서 상품 선택 후 "사용 가능한 토큰" 0개이면 "이 상품에 토큰이 없습니다. 토큰 관리에서 먼저 토큰을 추가하세요." 메시지 + [토큰 관리로 이동] 링크 |
| **선택** | 토큰 관리 페이지(Option A)가 있으면 여기서 링크만 연결 |

**권장 조합**: **Option A(토큰 전용 페이지) + Option C(재고 페이지에서 토큰 없을 때 유도)**.  
Option B는 2차로 상품 카드에 "토큰 추가" 버튼만 추가해도 됨.

#### 옵션 메타 UX (권장 — B안: 템플릿 제안 + 미리보기·수정 + 저장 후 토큰 생성)

- **원칙**: digital_warranty_code / digital_warranty_collection은 **서버가 임의로 확정하지 않음**. "옵션 메타에 사람이 한 번 저장"한 값만 토큰 생성 시 복사(스냅샷). **미리보기만 하고 저장하지 않은 값으로 토큰 생성은 불가**(API에서 필수 5개 NULL이면 400).  
- **결정**: 토큰 생성은 **"옵션 메타 저장됨" 상태에서만 가능**하며, **미리보기 값(미저장)은 토큰 생성에 사용하지 않는다.**
- **흐름**: 1) 상품·사이즈·색상 선택 2) **옵션 메타 상태**: 저장됨(값 표시 + [수정]) / 미설정([자동 제안 생성] + [직접 입력]) 3) [자동 제안 생성] 시 템플릿으로 입력칸에 **프리필**(editable, 수정 가능) 4) 관리자가 **[옵션 메타 저장]**을 눌러야만 저장(PUT meta) 5) **저장 성공 후에만** [토큰 생성] 버튼 활성화, count 입력 후 생성.
- **템플릿 예시**(자동 제안용): code ≈ `{PRODUCT_SHORT_OR_NAME} · SIZE {SIZE} · {COLOR}`, collection ≈ `{COLLECTION_NAME} — {SEASON_CODE} {COLLECTION_YEAR}`. 저장 전 프론트에서 100자·끝 구분자 검증, 서버에서 동일 검증으로 400.
- **product_name**: 토큰 생성 시 **자동(스냅샷)** — `short_name ?? name` from admin_products. 필요 시 Phase 4에서 "토큰용 표시명 override" 입력칸 추가 가능(선택).

### 3.4 상품 `short_name` (선택)

- `token_master.product_name`은 xlsx/update 스크립트에서 `admin_products.short_name`으로 매칭됨.
- 상품 추가 API는 현재 `short_name`을 넣지 않음.  
  **선택 사항**: 상품 추가/수정 시 `short_name` 필드 추가(미입력 시 `name`과 동일 저장).  
  토큰 생성 API에서는 `product_name` = `short_name ?? name`으로 저장하면 xlsx/update와 일관됨.

---

## 4. 구현 단계

### Phase 1: 토큰 생성 API (백엔드) — 풀 메타 자동 생성

1. **라우트 추가**  
   - 별도 `token-admin-routes.js`(또는 stock-routes 내)에 `POST /api/admin/tokens` 추가.  
   - `authenticateToken`, `requireAdmin` 적용.
2. **입력**  
   - Body: `product_id`(필수), `size`(필수), `color`(필수), `count`(기본 1, 1~100).  
   - 입력 product_id는 **resolveProductId**로 **정규화된 상품 ID** 확정. (그 상품 ID, size, color)로 `product_options`에서 option_id + 옵션 메타 조회. **해당 행이 없으면 400**. 필수 메타 NULL이면 400.
3. **로직 (트랜잭션)**  
   - 입력 product_id는 **resolveProductId**로 **정규화된 상품 ID** 확정. token_master.product_id에는 그 값만 저장.  
   - **같은 connection으로 트랜잭션**: START TRANSACTION → **시퀀스 행 확보(멱등)** INSERT ODKU → **구간 원자 할당**(§3.0.2 순서) SELECT FOR UPDATE → start/end → UPDATE last_number → seq=start..end 루프로 토큰 생성 → token_master INSERT → COMMIT. **created_count ≠ count이면 에러 + ROLLBACK**(부분 성공 금지).  
   - **감사 로그**: `[ADMIN_TOKENS_CREATE] { userId, option_id, count, start, end, created_count }`.
4. **응답**  
   - 생성된 `token_pk`, `token_masked`, `internal_code`, `warranty_bottom_code` 배열 반환. **평문(token_full) 반환 금지.**
5. **index.js**  
   - `app.use('/api', tokenAdminRoutes)` 등으로 등록.

### Phase 2: 토큰 관리 UI (프론트)

1. **페이지**  
   - `admin-qhf25za8/tokens.html` 생성.  
   - 레이아웃/스타일은 `stock.html`·`products.html` 참고.
2. **기능**  
   - 상품 선택: `GET /api/products`(또는 /api/products/options)로 드롭다운 채우기.  
   - 사이즈·색상: 선택한 상품의 유효 옵션으로 채움.  
   - **옵션 메타**: 선택한 옵션의 메타 상태(OK/미설정) 표시 + [옵션 메타 편집] → `PUT /api/admin/product-options/:optionId/meta` 또는 전용 편집 모달/페이지. (메타 없이 토큰 생성 불가이므로 최소 1개 경로 필수.)  
   - 토큰 목록: 상품·size·color에 따라 `GET .../stock/products/:productId/tokens?size=...&color=...` 호출(서버가 option_id JOIN으로 필터).  
   - 토큰 추가: [토큰 생성] → `POST /api/admin/tokens` { product_id, size, color, count } → 성공 시 해당 상품·옵션 토큰 목록 다시 로드.
3. **네비**  
   - `admin-layout.js`의 `NAV_MENU`에 `{ id: 'tokens', label: '토큰 관리', href: 'tokens.html' }` 추가.

### Phase 3: 재고 페이지 연동

1. 재고 추가 모달에서 상품 선택 후 `GET .../stock/products/:productId/tokens` 결과가 0개이면  
   - "이 상품에 사용 가능한 토큰이 없습니다. 토큰 관리에서 먼저 토큰을 추가해 주세요."  
   - [토큰 관리 페이지로 이동] 링크 (또는 버튼) 표시.
2. (선택) 토큰 관리 페이지로 이동 시 쿼리 `?product_id=xxx`로 넘기고, tokens.html에서 해당 상품 자동 선택.

### Phase 4: 상품 short_name (선택)

1. 상품 추가/수정 API에서 `short_name` 수신 및 저장 (NULL 허용).  
2. 상품 폼에 "short_name(토큰 매칭용)" 입력 필드 추가(선택).  
3. 토큰 생성 시 `product_name` = `short_name ?? name` 유지.

---

## 5. DB·보안·기타

- **DB**  
  - §3.0 스키마 정리 적용: `product_options` 확장(옵션 메타 SSOT), `token_variant_sequence` 신규(옵션별 원자 시퀀스), `token_master`에 `option_id` 추가. 기존 메타 컬럼은 스냅샷 유지.  
  - **용어**: 문서 내 "canonical_id"는 **admin_products 테이블의 컬럼명이 아님**. resolveProductId()가 반환하는 **정규화된 상품 ID 값**을 의미함. admin_products에는 canonical_id 컬럼이 없음(migration 071 정리 후).  
  - **token_master.product_id 저장 규칙**: POST /api/admin/tokens에서 입력 product_id는 **resolveProductId로 정규화된 상품 ID**를 얻고, token_master.product_id에는 **그 값만 저장**한다. (조회 시에도 동일 규칙.)  
  - `token_master.product_id` FK로 `admin_products.id` 참조 유지. **token_master.option_id FK**: **기본 적용(권장)** — 신규 토큰은 option_id가 채워지므로 FK로 정합성 강제. 기존 option_id NULL 행은 FK와 무관. 마이그레이션 후 `db_structure_actual.txt` 갱신 필수.
- **보안**  
  - 토큰 생성 API는 관리자 전용.  
  - 응답 시 토큰 값은 마스킹(예: 앞 4자리 + `****` + 뒤 4자리) 권장.  
  - 상품 ID 등 입력은 기존 product-routes와 동일하게 검증(길이, 패턴 등).
- **xlsx/기존 스크립트**  
  - `init-token-master-from-xlsx.js`, `update-token-master-from-xlsx.js`는 그대로 두고, 관리자 UI 토큰 추가는 "추가만" 하므로 기존 토큰 초기화 없음.  
  - **토큰 메타 생성 규칙**은 xlsx 포맷을 SSOT로 하여 서버에서 동일하게 생성(오타·공백 문제 원천 차단).

---

## 6. 구현 체크리스트

| # | 항목 | 담당 레이어 | 비고 |
|---|------|-------------|------|
| 0a | product_options에 option_id 존재·PK 여부 확인 | DB | db_structure_actual.txt 기준. 없으면 option_id 추가(자동증가) + uk_product_color_size 유지 |
| 0b | 마이그레이션: product_options 확장, token_variant_sequence 생성, token_master.option_id | DB | §3.0.5 SQL 예시 참고. 실행 후 db_structure_actual.txt 갱신 |
| 1 | POST /api/admin/tokens (product_id, size, color, count) | 백엔드 | 필수 옵션 메타 5개 NULL 검사 → 시퀀스 INSERT ON DUPLICATE KEY UPDATE 후 FOR UPDATE 구간 할당 → 토큰+메타 생성 |
| 2 | 토큰 메타 자동 생성 규칙(§3.2.2) + 원자적 시퀀스(INSERT ODKU → SELECT FOR UPDATE → UPDATE last_number) | 백엔드 | product_options SSOT, prefix 완성형(구분자 포함) |
| 3 | GET .../stock/products/:productId/tokens — size/color 필터를 option_id JOIN(product_options)로 구현 | 백엔드 | token_master에 size/color 컬럼 추가 없음 |
| 4 | token_master INSERT(init 스크립트와 동일 컬럼 세트 + option_id) | 백엔드 | created_at, updated_at, is_blocked, scan_count 포함 |
| 5 | PUT /api/admin/product-options/:optionId/meta (옵션 메타 편집) | 백엔드 | rot_code, warranty_bottom_prefix, serial_prefix, digital_warranty_code, digital_warranty_collection 등. **검증 규칙**: §3.2.4 참고. |
| 6 | tokens.html + 상품·사이즈·색상 선택 + 옵션 메타 상태(OK/미설정) + 옵션 메타 편집 + 토큰 목록 + 토큰 생성 | 프론트 | GET .../tokens(서버 JOIN 필터), POST .../tokens |
| 7 | admin-layout.js에 "토큰 관리" 메뉴 추가 | 프론트 | NAV_MENU |
| 8 | 재고 추가 시 토큰 0개이면 안내 + 토큰 관리 링크 | 프론트 | admin-stock.js |
| 9 | (선택) short_name 상품 폼/API | 백엔드·프론트 | Phase 4 |

---

## 7. 참고 파일

| 구분 | 파일 |
|------|------|
| 토큰 생성 로직 참고 | `backend/init-token-master-from-xlsx.js` (generateToken, generateUniqueToken, INSERT 구조) |
| 재고 API·토큰 목록 | `backend/stock-routes.js` (GET /admin/stock/products/:productId/tokens, POST /admin/stock) |
| 상품 API | `backend/product-routes.js` (GET /products, POST /admin/products) |
| 관리자 레이아웃/메뉴 | `admin-qhf25za8/admin-layout.js` |
| 재고 UI | `admin-qhf25za8/stock.html`, `admin-qhf25za8/admin-stock.js` |
| DB 구조 | `backend/scripts/db_structure_actual.txt` (token_master, product_options, token_variant_sequence). 마이그레이션 후 반드시 갱신 |

---

## 8. GPT 의견 검증 및 구현 시 적용 사항

(외부 검토 의견을 우리 코드·DB와 비교해 반영한 요약. 구현 시 이 문서와 실제 코드를 함께 참고할 것.)

### 8.1 전체 평가

- 설계가 **토큰 증분 경로 부재**라는 병목을 제거하고, init/xlsx와 **충돌 없이 공존** 가능하다는 방향 → 우리 설계와 일치.
- **운영 사고 방지** 관점의 6가지 정책 → 대부분 우리 환경과 맞고, 이미 하는 것도 있음.

### 8.2 필수 정책 6개 vs 우리 환경

| GPT 정책 | 우리 환경 | 구현 시 적용 |
|----------|-----------|--------------|
| 토큰 평문 노출 금지, API/화면은 마스킹 | `stock-routes.js`에 `maskToken()` 있음 (앞4+…+뒤4). 기존 GET …/tokens는 `token_full`과 마스킹 둘 다 반환 | **신규 POST /api/admin/tokens 응답에는 마스킹만 반환.** `token_full` 등 평문 필드 넣지 않음. |
| 생성은 트랜잭션 + 충돌 재시도 | `token_master.token`은 DB에 UNIQUE 있음. init 스크립트도 ER_DUP_ENTRY 시 재시도 | 트랜잭션 사용. INSERT 실패 시 `ER_DUP_ENTRY` 캐치 후 토큰(및 필요 시 internal_code) 재생성·재시도. |
| count 상한 1~100(또는 200) | 토큰 생성 API 없음 | count는 1~100(상한은 정책에 따라 조정), 미지정 시 1. |
| "재고 미등록 토큰"만 기본 표시 | `GET /api/admin/stock/products/:productId/tokens`가 이미 재고 미등록만 반환 | tokens.html에서 이 API만 사용하면 "재고 미등록만"이 기본. 추가 작업 없음. |
| 감사 로그(최소 console/Logger) | 프로젝트 규칙: console.log 대신 Logger 사용 | **결정**: `Logger.log('[ADMIN_TOKENS_CREATE]', { userId, option_id, count, start, end, created_count })` 형태로 남긴다. 할당 구간(start/end)을 포함해 번호 건너뛰기·중복 의심 시 원인 추적 가능. (중간 실패 시 created_count < count도 로그에 드러남.) |
| product_name = 스냅샷(short_name ?? name, 이후 변경 안 함) | 상품 API는 short_name 미사용. token_master는 init에서 product_name 저장 | `product_name = admin_products.short_name ?? admin_products.name`으로 생성 시점에만 저장, 이후 변경하지 않음. |

### 8.3 DB 전제 (db_structure_actual.txt 기준)

| 항목 | 현재 상태 | 구현 시 |
|------|-----------|---------|
| `token_master.token` | UNIQUE 있음 | INSERT 충돌 시 ER_DUP_ENTRY → 토큰 재생성·재시도로 처리. |
| `token_master.internal_code` | UNIQUE 없음 (MUL만) | **결정(단계형)**: **Phase 1**: UNIQUE 걸지 않음. token INSERT 시 ER_DUP_ENTRY는 **token 유니크만** 대상으로 재시도. internal_code는 충분히 랜덤(8~10자리 권장) 유지. **향후**: internal_code 중복이 운영에서 문제 되면 Phase 2에서 UNIQUE 추가 또는 “충돌 시 재생성 루프(최대 N회)” 추가. 문서에 “중복 가능하며, 치명적이면 UNIQUE 추가”로 고정. |
| `token_master` INSERT 컬럼 | `created_at`, `updated_at` NOT NULL. init 스크립트는 `is_blocked`, `scan_count` 등 포함 | **실제 스키마·init 스크립트 INSERT 목록 참고.** 생성 API에서도 `created_at`, `updated_at`(및 필요 시 `is_blocked`, `scan_count`) 포함. |

### 8.4 구현 시 우리 코드베이스에 맞게 할 것

| 항목 | GPT 예시 등 외부 코드 | 우리 코드베이스 | 적용 |
|------|------------------------|-----------------|------|
| DB 연결 | pool.getConnection(), conn.release() | `mysql.createConnection(dbConfig)` + `connection.end()`. (stock-routes 등) | **createConnection** + try/finally에서 **end()** 사용. |
| token_master INSERT | token, internal_code, product_id, product_name 만 | 스키마상 created_at, updated_at NOT NULL. init 스크립트 INSERT 목록 참고 | **init-token-master-from-xlsx.js** INSERT 컬럼 참고해 필요한 컬럼 모두 포함. |
| 인증 정보 | req.user?.id | `authenticateToken`은 `req.user = { userId, email, name }` | 감사 로그에는 **req.user.userId** (또는 email) 사용. |
| 에러 코드 | e.code === 'ER_DUP_ENTRY' | init 스크립트에서 동일 사용 | 그대로 적용 가능. |

### 8.5 Q1~Q3 요약

- **Q1 (스키마 변경 없이 동시성)**  
  - token: UNIQUE 있으므로 동시 INSERT 시 한 쪽은 ER_DUP_ENTRY → 재시도로 처리 가능.  
  - internal_code: UNIQUE 없으면 이론상 중복 가능. UNIQUE 추가 권장 또는 코드에서 재시도/선행 SELECT로 보완.

- **Q2 ("재고 미등록만" vs "전체 토큰")**  
  - "재고 미등록만" 표시가 운영 사고 가능성 낮음. 우리 GET …/tokens가 이미 그 방식이므로 tokens.html에서 동일 API 사용.

- **Q3 (internal_code를 상품별 prefix + 시퀀스로)**  
  - 검수/라벨링/추적에 유리하나 시퀀스 관리·동시성 고려 필요. 선택 사항. 현재는 AUTO-{6자리 랜덤} 유지해도 됨.

### 8.6 토큰 평문 노출 금지 이유 (정책 근거)

- 토큰은 QR/URL·조회의 **접근 키** 역할. 평문 유출 시 재발급이 어렵고(이미 인쇄/출고), 유출 경로(화면 캡처, 로그, 네트워크 탭 등)가 많음.
- 우리 구조(토큰으로 보증/주문 관련 접근)에도 동일하게 적용. **신규 API·화면에서는 평문 미반환, 마스킹만 사용.**

### 8.7 GPT 최종안 반영 요약 (우리 방향에 맞게 정리)

- **받아들인 설계**: product_options 옵션 메타 SSOT + token_variant_sequence(옵션별 원자 시퀀스) + token_master 스냅샷 유지 + option_id. **A안**(product_options 확장) 채택.
- **문구 정리**: "상품마다 달라지는 건 serial_number·warranty_bottom_code" → **"옵션마다 prefix가 달라지고, 번호는 옵션별 시퀀스에 의해 증가"**. token_master에는 **option_id + 옵션 메타(serial_prefix 등) SSOT를 product_options로 고정**하여 자동 생성 완성도 확보.
- **필수 보완**: warranty_bottom_code·serial_number용 시퀀스는 **원자적 증가**(INSERT ON DUPLICATE KEY UPDATE → SELECT FOR UPDATE → last_number 구간 할당). serial_prefix는 옵션 메타로 두어 오타 방지. prefix는 **완성형(끝 구분자 포함)** 저장, 생성 로직에서 구분자 추가 금지.
- **기존 데이터**: option_id NULL 유지. 백필은 별도·선택(매칭 가능 범위만).

**문서·구현 시 강제 문구(핵심만)**  
- 토큰 목록 API의 size/color 필터는 **token_master.option_id ↔ product_options JOIN**으로 구현한다. (token_master에 size/color 스냅샷 컬럼 추가는 하지 않는다.)  
- token_variant_sequence 구간 할당은 **정확히 이 순서**: SELECT FOR UPDATE → old_last → start = old_last+1, end = old_last+count → UPDATE last_number=end → seq=start..end 루프. (UPDATE만 하고 start/end를 다시 조회하는 방식 금지.)  
- **option_id NULL(기존 토큰)**: size/color 필터 있을 때 → 결과에서 제외. 필터 없을 때 → 전체 표시(LEFT JOIN). serial_number 파싱 폴백은 기본 경로에 넣지 않음.  
- **용어**: 문서 내 “canonical_id”는 **admin_products 컬럼명이 아님**. resolveProductId()가 반환하는 **정규화된 상품 ID 값**을 의미.  
- **token_master.product_id**: 입력 product_id는 **resolveProductId로 정규화된 상품 ID**를 얻고, **token_master.product_id에는 그 값만 저장**한다.  
- **size/color 유효성**: (정규화된 상품 ID, size, color) 조합이 **product_options에 없으면 400**. product_options가 SSOT.  
- **글자 길이(결정)**: product_options·token_master·PUT 검증 모두 **100자**로 통일. digital_warranty_code/collection은 varchar(100), 100 초과 시 400(자동 자르기 금지).  
- **token_master.option_id FK**: **기본 적용(권장)**. 기존 option_id NULL은 FK와 무관.  
- **internal_code(결정)**: Phase 1은 UNIQUE 안 걸고 유지. 중복 가능, 운영상 문제 시 Phase 2에서 UNIQUE 또는 재시도 루프 추가.  
- **GET token_full**: Phase 1~3 유지. 제거 조건 = 재고 UI가 token_full 미참조 확인 후(검색·테스트).  
- **PUT 옵션 메타**: warranty_bottom_prefix/serial_prefix 끝 구분자(_/-) 포함 검사; digital_warranty_code/collection 100자 제한(§3.2.4).  
- **감사 로그**: `[ADMIN_TOKENS_CREATE] { userId, option_id, count, start, end, created_count }` — 할당 구간 포함.  
- **트랜잭션**: 같은 connection으로 START TRANSACTION → INSERT ODKU → SELECT FOR UPDATE → UPDATE → INSERT token_master → COMMIT/ROLLBACK. **created_count ≠ count이면 에러 처리 + ROLLBACK**(부분 성공 금지).  
- **필수 옵션 메타**(rot_code, warranty_bottom_prefix, serial_prefix, digital_warranty_code, digital_warranty_collection) **중 하나라도 NULL이면 토큰 생성 400**.

---

이 설계대로 **마이그레이션(§3.0.5) 후** Phase 1부터 순서대로 구현하면, 관리자 페이지에서 **새 상품 → 토큰 → 재고**까지 전체를 xlsx/SQL 수동 없이 추가·관리할 수 있습니다. 구현 시 **§8 구현 시 적용 사항**, **§9 구현 전 선제 검토**, **참고 파일(§7)**을 함께 참고할 것.

---

## 9. 구현 전 선제 검토 (실제 코드·DB 기준)

아래는 문서와 **실제 코드(stock-routes.js, init-token-master-from-xlsx.js)·DB(db_structure_actual.txt)** 대조 후 정리한 사항이다. 구현 시 참고할 것.

### 9.1 GET .../tokens 쿼리·필터

| 항목 | 현재 구현 | 설계 반영 시 (결정) |
|------|-----------|---------------------|
| **product_id** | `req.params.productId`를 그대로 WHERE에 사용 | **resolveProductId(productId)** 로 얻은 **정규화된 상품 ID**를 WHERE `tm.product_id = ?`에 사용. (저장 규칙과 동일: §5. ※ 문서 내 “canonical_id”는 컬럼명이 아니라 이 값을 의미.) |
| **size/color 필터** | token_master만 조회 후 **메모리에서** `serial_number` 정규식 파싱으로 필터링 | **JOIN product_options**: `tm.option_id = po.option_id`, size/color 있으면 `AND po.size = ? AND po.color = ?`. |
| **option_id NULL (기존 토큰)** | 해당 없음 | **결정**: size/color 필터가 **있을 때** → option_id NULL 토큰은 **결과에서 제외**. size/color 필터가 **없을 때** → 전체 표시(LEFT JOIN), option_id NULL 포함. **serial_number 파싱 폴백은 기본 경로에 넣지 않음**; 요구 생기면 별도 옵션으로 추가. (§3.2.3과 동일.) |

### 9.2 옵션 메타 입력 시점

- **필수 옵션 메타 5개**가 없으면 토큰 생성 400이므로, **POST /api/admin/tokens보다 먼저 또는 동시에** 옵션 메타를 넣을 경로가 필요하다.
- **권장**: 체크리스트 #5(PUT /api/admin/product-options/:optionId/meta)를 Phase 1 말미 또는 Phase 2 초입에 구현해, 토큰 생성 전에 메타를 설정할 수 있게 한다. (초기 테스트는 SQL로 메타 입력 가능.)

### 9.3 token_master 스냅샷 컬럼 길이 (결정)

- `token_master` 현재: `digital_warranty_code`, `digital_warranty_collection` 등은 **varchar(100)**.
- **결정**: 스냅샷 컬럼에 넣을 값이 **100자 초과이면 400**으로 막고, 옵션 메타 수정을 유도한다. **자동 자르기(truncate)는 하지 않는다** — 문구 깨짐이 조용히 발생하는 것을 방지.

### 9.4 GET .../tokens 응답의 token_full (결정)

- **현재**: `GET /api/admin/stock/products/:productId/tokens`는 응답에 **token_full**(평문)과 마스킹 값을 둘 다 포함한다.
- **설계**: 신규 **POST /api/admin/tokens** 응답에는 평문 미반환, 마스킹만.
- **결정**: **Phase 1~3**: 기존 재고 UI 호환을 위해 GET 응답의 **token_full 유지**(제거하지 않음). **제거 트리거**: “재고 UI가 token_full을 참조하지 않음을 확인(코드 검색·테스트)한 후” 또는 “Phase 4(재고 UI가 token_masked만 사용하도록 수정 완료 시점)”에 token_full 제거. 문서에 이 조건을 적어 두어 임의 제거/유지로 인한 사고 방지.

### 9.5 init 스크립트 INSERT 컬럼 vs 신규 API

- **init-token-master-from-xlsx.js** INSERT 컬럼: `token, internal_code, product_name, product_id, serial_number, rot_code, warranty_bottom_code, digital_warranty_code, digital_warranty_collection, is_blocked, scan_count, created_at, updated_at`.
- 신규 API는 위와 동일 + **option_id**. (owner_user_id, first_scanned_at, last_scanned_at은 init에도 없음 → NULL 또는 기본값.)

### 9.6 product_options.option_id (0a 검증)

- **db_structure_actual.txt** 기준 `product_options`에 이미 **option_id bigint PK, auto_increment** 존재. 체크리스트 0a는 “확인만” 수행하면 되며, 없을 때만 추가 마이그레이션.

### 9.7 admin_products vs 관리자 상품 추가 UI/API

- **admin_products 컬럼**(db_structure_actual 기준): `id`, `name`, `short_name`, `price`, `image`, `collection_year`, `category`, `type`, `description`, `created_at`, `updated_at`.
- **관리자 상품 추가 UI**(products.html): id, name, price, image, collection_year, category, type, description — **short_name 없음**.
- **POST /api/admin/products**: 위 UI 필드만 수신·INSERT. **short_name**은 수신·저장하지 않음(Phase 4 선택 사항).
- **일치 여부**: 관리자에서 추가하면 **short_name을 제외한** 모든 입력 필드는 admin_products에 들어간다. `created_at`/`updated_at`은 DB 기본값. **short_name**은 토큰 생성 시 product_name 매칭용(§3.4)으로 쓰이므로, 필요 시 Phase 4에서 UI/API에 short_name 추가.
- **코드 정합성**: admin_products에는 **canonical_id 컬럼이 없음**(migration 071 정리 후). INSERT는 `id, name, price, image, collection_year, category, type, description`만 사용. (문서 내 “canonical_id”는 resolveProductId 반환값을 부르는 말이며, 테이블 컬럼명이 아님.)
