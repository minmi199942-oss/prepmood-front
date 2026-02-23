# Invoice 레이아웃 · 페이지네이션 · 애니메이션 통합 규칙 문서 (Final · Corrected · Consistent Specification)

## 0. 문서 목적

이 문서는 인보이스 화면의 **레이아웃, 페이지 분할, Price 이동, 스택 애니메이션**을 **하나의 물리적 규칙**으로 고정한다.

**핵심 원칙:**  
계산으로 이미 결정된 레이아웃에서 **“공간이 부족해서 가격이 못 들어간다”** 같은 상황은 **존재하지 않는다**. 모든 분기는 **단 하나의 판정 기준(구분선 침범 여부)**에서만 발생한다.

다음 세 가지를 동시에 만족시키는 것이 목적이다.

1. **실제 인보이스 문서로서 자연스러운 구성**
2. **상품 길이에 따른 예측 가능한 페이지 분할**
3. **페이지 스택 애니메이션과 결합해도 깨지지 않는 구조**

**이 문서에 정의되지 않은 해석, 보완, 예외는 허용하지 않는다.**

---

## 1. 페이지의 기본 구조 — 고정 슬롯 템플릿 (절대)

**모든 페이지는 문서 흐름이 아닌 템플릿이다.** 각 페이지는 항상 동일한 슬롯 구조를 가진다. 이 레이아웃은 **세로 흐름 문서가 아니라 고정 슬롯 기반**이다.

```
┌─────────────────────────────────────┐
│ Header (고정)                        │  ← 페이지 내 Y 위치 항상 동일
├─────────────────────────────────────┤
│ Content Area (가변)                  │
│  ├─ 2열: Description (상품명)        │  ← 레이아웃 소유권 2열, 오버플로우 시 침범 판정
│  ├─ 구분선 (조건부)                  │  ← 침범 시 제거
│  └─ 3열: Price (가격/요약)           │  ← 조건부 활성
├─────────────────────────────────────┤
│ Footer (고정)                        │  ← 페이지 내 Y 위치 항상 동일
└─────────────────────────────────────┘
```

### 1.1 고정 슬롯 규칙 (절대)

- **Header · Footer**: 페이지 내부에서 **Y 위치가 항상 동일**. 상품 개수, 상품 길이, 가격 유무와 무관. 문서 흐름에 의해 밀리거나 당겨지지 않는다. `margin-top: auto` 등으로 Footer를 하단에 “밀어 넣는” 방식은 **금지**.
- **Description(2열)**: **레이아웃 소유권은 2열**이다 (grid 상 column=2 고정). 텍스트가 길어지면 3열 방향으로 **시각적 오버플로우**가 발생할 수 있으며, **이 오버플로우가 구분선 침범 판정의 근거**가 된다. “3열을 채운다”가 아니라, 침범 시 구분선·3열이 제거되고 Description은 2열 배치 기준만 유지한 채 세로로 이어질 뿐이다.
- **Price(3열)**: **조건부 활성**. 활성/비활성 판정은 **구분선 침범 여부**로만 한다 (섹션 2 참고).

**구현 상 주의:** “고정 슬롯”이란 **페이지 템플릿 내부에서의 상대적 위치 고정**을 의미하며, `position: absolute` 또는 `fixed`를 의미하지 않는다. **페이지 컨테이너 내부에서 grid 또는 고정 row 구조로 구현**한다.

---

## 2. 유일한 판정 기준 — 구분선 침범

### 2.1 정의

**구분선 침범 여부**란: 해당 페이지에서 **상품(Description) 영역의 하단 Y**가 **2열–3열 사이의 고정 구분선 Y(priceDividerY)**를 넘었는가이다.  
**이 판정이 모든 것을 결정한다.**

**측정 대상 (공식):** 침범 판정은 **해당 페이지 Description 내 마지막 상품 row의 `getBoundingClientRect().bottom`**과 **구분선 기준 Y(priceDividerY)** 비교로 수행한다. (row 분절 금지이므로 “마지막 row의 하단”이 침범 여부의 기준이 된다.)

**좌표계 (필수):** `priceDividerY`는 **해당 페이지 구분선 DOM 요소의 `getBoundingClientRect().top`**으로 정의한다. **동일 viewport 좌표계**에서 비교해야 하므로, `lastRowRect.bottom`과 `dividerRect.top`을 같은 기준(viewport)으로 쓴다. 침범 판정식: **`lastRowRect.bottom > dividerRect.top`**. (페이지 내부 상대좌표·offsetTop 등 자의 해석 금지.)

**오버플로우와 측정:** ellipsis / line-clamp / `overflow: hidden` 등은 스타일로 존재할 수 있으나, **침범 판정은 반드시 마지막 row의 실제 렌더 박스(rect) 기준으로만** 수행한다. 시각적으로 잘려 보이든 안 보이든, **lastRowRect.bottom**이 유일한 기준이다.

**페이지 유형별 침범 판정 적용 범위:** **PRODUCT_ONLY** 페이지에서는 구분선 요소를 렌더하지 않으며, 침범 판정도 수행하지 않는다. **PRICE_ONLY** 페이지는 상품이 없으므로 침범 판정 로직을 수행하지 않는다. (침범 판정·구분선 rect 참조는 “상품이 최소 한 row라도 배치된 페이지”에만 적용한다.)

### 2.2 결과

| 판정 | 결과 |
|------|------|
| **침범하지 않음** | 구분선 유지 · 3열 Price 활성 |
| **침범함** | 구분선 제거 · 3열 Price 비활성 |

### 2.3 사용 금지 기준

- ❌ 상품 “개수”
- ❌ 페이지 하단 여백
- ❌ `remainingSpace` / `priceCost`
- ❌ “가격 영역이 부족함”

### 2.4 시각적 참고 (이미지 대응)

- **첫 번째 이미지**: 상품 3개, 2열이 구분선을 넘지 않음 → 구분선 유지, 3열(가격) 존재.
- **두 번째 이미지**: 상품이 많아져 Description 오버플로우(침범) → 구분선 제거, 3열 비활성, 가격은 다음 장으로. Description은 2열 배치 기준으로 여백 유지하며 이어짐.

### 2.5 페이지 상태 (열 활성 상태)

“공백”이라는 표현은 사용하지 않는다. **열이 꺼졌다/켜졌다**로만 표현한다.

| 상태 | 구성 |
|------|------|
| **PRODUCT_AND_PRICE** | Header \| 상품(2열) \| 구분선 \| 가격(3열) \| Footer |
| **PRODUCT_ONLY** | Header \| 상품(2열) \| Footer (구분선·가격 없음) |
| **PRICE_ONLY** | Header \| 가격(2열) \| Footer (상품 없음) |

**PRICE_ONLY 구조 규칙 (선택이 아닌 필수):** PRICE_ONLY 상태에서는 3열은 의미가 없으므로 사용하지 않는다. 가격은 **항상 2열 기준으로 배치**한다.

### 2.6 영역 매핑 (현재 구현 기준)

| 규칙 문서 용어 | 현재 HTML/CSS 클래스 | 설명 |
|---------------|---------------------|------|
| Header | `.invoice-detail-header` | 인보이스 헤더 (INVOICE NO., ISSUE DATE 등) |
| Description | `.invoice-description-section` | 상품 리스트 테이블 (항상 2열) |
| 구분선 | (2열·3열 사이 세로선) | 상품이 이 선을 넘으면 해당 페이지에서 제거 |
| Price | `.invoice-summary-section` | 금액 요약. PRODUCT_AND_PRICE일 때는 3열, **PRICE_ONLY일 때는 2열 위치(Content Area 전체)에 배치** |
| Footer | `.invoice-detail-footer` | 회사 정보 및 고객 정보 |

---

## 3. 페이지 분할 우선순위 규칙

1. **Header · Footer**: 고정 슬롯. 계산 대상·밀리는 대상 아님.
2. **중간 영역**: 2열(상품) / 구분선 / 3열(가격)만 가변.
3. **Price 열 활성 여부**: **구분선 침범**으로만 판정 (상품 하단 > 구분선 Y → 3열 비활성, 구분선 제거).
4. **Description(상품)**: 2열에 배치(레이아웃 소유권 2열). 오버플로우는 침범 판정 근거. 행 단위 분절 금지.
5. **Price**: 상품이 구분선을 넘지 않는 페이지만 3열 활성; 넘으면 해당 페이지에서 비활성, 다음 페이지에 PRICE_ONLY 등으로 등장 가능.

**실행 순서 (Algorithm Order, 절대 유지):**
1. **행 단위로 페이지를 채운다** (분절 금지). → 해당 페이지에 들어갈 마지막 row까지 확정.
2. **그 페이지의 마지막 row가 정해진 뒤** 침범 판정을 수행한다. (lastRowRect.bottom vs dividerRect.top)
3. 침범이면 그 페이지는 **PRODUCT_ONLY**로 확정. 미침범이면 **PRODUCT_AND_PRICE** 가능.
4. **“상품이 끝난 페이지”에서만** Price를 배치한다 (미침범 → 같은 페이지, 침범 → 다음 페이지 PRICE_ONLY).

**"상품이 끝난 페이지" 정의:** 전체 상품 row 중 **마지막 row가 배치된 페이지**를 의미한다. (구현 시 boolean/플래그는 이 정의 기준으로만 설정한다.)

---

## 4. Description(상품) 분절 규칙

### 4.1 행 단위 분절 금지 (절대 규칙)

- **상품 리스트는 행(row) 단위로만 이동**
- 한 행이 페이지에 완전히 들어가지 않으면:
  - → **해당 행 전체를 다음 페이지로 이동**
- **행을 쪼개는 예외는 존재하지 않는다**

### 4.2 구현 방법

```javascript
// 행 분절 금지 로직 예시
function canFitRowInPage(currentPageHeight, rowHeight, pageMaxHeight) {
    const remainingSpace = pageMaxHeight - currentPageHeight;
    // 행이 완전히 들어가지 않으면 false
    return remainingSpace >= rowHeight;
}

// 행이 페이지에 들어가지 않으면 다음 페이지로 이동
if (!canFitRowInPage(currentHeight, rowHeight, pageHeight)) {
    moveToNextPage();
}
```

---

## 5. Price 영역 규칙 (핵심)

Price(3열) 활성/비활성은 **구분선 침범**으로만 판정한다 (섹션 2 참고).

### 5.1 Price 등장 조건

- **Price는 상품이 끝난 이후에만 등장 가능** (페이지 단위로는 “해당 페이지에 상품이 구분선을 넘지 않을 때”만 3열 활성).
- **Price는 상품 중간 페이지에 등장하지 않는다.**

**판정 기준은 “상품 개수”나 “페이지 끝”이 아니라 “상품 하단이 구분선 Y를 넘는가” 하나뿐이다.**

### 5.2 Price 배치 규칙 (최종)

- **Price는 상품 흐름이 종료된 이후에만 등장**하며, **등장 위치는 침범 여부만으로 결정된다**.
- **Price가 배치된 이후 페이지에는 동일 상품 흐름의 Description은 다시 등장하지 않는다** (PRICE_ONLY 페이지는 상품 없음).

Price는 다음 두 경우뿐이다:

1. **상품이 끝난 페이지가 미침범** → 같은 페이지에 Price 등장 → **PRODUCT_AND_PRICE**
2. **상품이 끝난 페이지가 침범** → 해당 페이지는 PRODUCT_ONLY, 다음 페이지에 Price → **PRICE_ONLY**

**중요한 정정:**  
**미침범인데 Price “공간이 부족해서” 다음 페이지로 가는 경우는 존재하지 않는다.** 구분선 Y와 Price 슬롯은 고정이므로, **미침범 = 항상 Price 수용 가능**.  
따라서 `remainingSpace`, `priceCost`, “Price 공간 부족” 로직은 **전부 사용하지 않는다.**

### 5.3 Price 판정 (침범만 사용)

```javascript
// 유일한 Price 관련 판정 — 구분선 침범
if (productBottom > priceDividerY) {
    // 해당 페이지: 구분선 제거, 3열 비활성 (PRODUCT_ONLY)
    // 상품이 이 페이지에서 끝나면 → 다음 페이지 PRICE_ONLY
} else {
    // 해당 페이지: 구분선 유지, 3열 활성
    // 상품이 이 페이지에서 끝나면 → 같은 페이지 PRODUCT_AND_PRICE
}
```

---

## 6. 결과 페이지 조합 (최종 케이스 정의)

페이지 상태 용어: **PRODUCT_AND_PRICE** / **PRODUCT_ONLY** / **PRICE_ONLY** (섹션 2.5).  
“가격 비활성” = 해당 페이지에서 구분선·3열 제거, Description은 2열 배치 기준·여백 유지.

### 케이스 A: 1페이지에 전부 들어가는 경우
```
1페이지: Header | 상품(2열) | 구분선 | 가격(3열) | Footer  → PRODUCT_AND_PRICE
```
(상품 하단이 구분선을 넘지 않음.)

### 케이스 B: 상품은 1페이지, Price만 다음 페이지로 이동
```
1페이지: Header | 상품(2열) | (가격 비활성) | Footer  → PRODUCT_ONLY
2페이지: Header | 가격(2열) | (상품 없음) | Footer   → PRICE_ONLY
```
- 1페이지: Description 오버플로우로 침범 → 3열 비활성·구분선 제거. Description은 2열 배치 기준으로 이어짐.
- PRICE_ONLY에서는 가격을 2열 기준(Content Area 전체)으로 배치 (3열 미사용).

### 케이스 C-1: 상품이 매우 길어 마지막 페이지에만 Price가 등장
```
1페이지: Header | 상품(2열) | (가격 비활성) | Footer  → PRODUCT_ONLY
2페이지: Header | 상품(2열) | (가격 비활성) | Footer  → PRODUCT_ONLY
...
N페이지: Header | 상품(2열) | 구분선 | 가격(3열) | Footer  → PRODUCT_AND_PRICE
```
1~N-1페이지: 구분선 침범으로 3열 비활성. N페이지에서는 상품이 구분선을 넘지 않아 3열 활성.

### 케이스 C-2: 여러 페이지 후 침범 종료 (B의 일반형, N≥1)

상품이 N페이지에서 끝나고, **그 N페이지가 침범 상태**인 경우. (케이스 B는 N=1인 특수형.)

```
1페이지: Header | 상품(2열) | Footer  → PRODUCT_ONLY
2페이지: Header | 상품(2열) | Footer  → PRODUCT_ONLY
...
N페이지:   Header | 상품(2열) | Footer  → PRODUCT_ONLY  (침범)
N+1페이지: Header | 가격(2열) | Footer  → PRICE_ONLY
```

### 케이스 C-3: 상품이 끝나는 페이지에 Price도 함께 들어가는 경우 (미침범 종료)
```
1페이지: Header | 상품(2열) | (가격 비활성) | Footer  → PRODUCT_ONLY
2페이지: Header | 상품(2열) | 구분선 | 가격(3열) | Footer  → PRODUCT_AND_PRICE
```
1페이지: 구분선 침범으로 3열 비활성. 2페이지: 상품이 구분선을 넘지 않아 3열 활성.

---

## 7. Footer-only / Price-only 페이지 규칙

### 7.1 Footer 위치 규칙 (절대)

- **Footer는 페이지 레이아웃의 고정 슬롯이다.** 문서 흐름에 맡기거나 “상품 많아지면 밀리는” 구조가 아니다.
- **페이지 템플릿에서 Footer의 Y 위치는 항상 동일하다.** 상품이 많아지든 적어지든 Footer Y는 변하지 않는다.
- **`margin-top: auto` 등으로 Footer를 “하단에 가깝게” 밀어 넣는 방식은 이 설계와 맞지 않는다** — Footer는 고정 슬롯이므로, 계산 대상·밀리는 대상이 아니다.

### 7.2 Footer-only 또는 Price-only 페이지 처리

Footer-only 또는 Price-only 페이지에서도:
- **Header · Footer는 동일한 고정 Y를 유지한다.**
- **중간 가변 영역만** “상품만 / 가격만 / 없음”에 따라 채워진다.
- 구현 시: Footer를 **페이지 템플릿의 고정 위치**에 두고, 그 위 공간만 Content Area로 두어야 한다. (예: 그리드/플렉스에서 Header·Footer는 고정 행/슬롯, 중간만 가변.)

---

## 8. 애니메이션 결합 규칙 (스택 UI)

**표시 단위:** 한 장 = 한 페이지 블록. (원본 HTML 기준: `.invoice-page` / Grid 기준: `.invoice-page-block` — 카드+보증서 컬럼이 함께 움직인다.)

### 8.1 누가 보이는지 (페이지별)

| 위치 | 현재 페이지 | 보이는 것 | 안 보이는 것 |
|------|-------------|-----------|--------------|
| **첫 페이지** | 정면 100% | 오른쪽에 **다음** 페이지만 살짝 | 이전 없음 |
| **중간 페이지** | 정면 100% | 오른쪽에 **다음** 페이지만 살짝 | 이전 페이지는 있으나 **노출하지 않음** |
| **마지막 페이지** | 정면 100% | 왼쪽에 **이전** 페이지만 살짝 | 다음 없음 |

- **첫 페이지와 중간 페이지는 동일 규칙:** 현재 정면 + **오른쪽에 다음 페이지만** 살짝 보임. 중간에서는 이전 페이지가 있어도 **표시하지 않는다.**
- **마지막 페이지만 예외:** 현재 정면 + **왼쪽에 이전 페이지만** 살짝 보임. 다음 페이지는 없으므로 오른쪽에는 아무것도 안 보임.

### 8.2 예시 (총 2페이지 / 총 3페이지)

**총 2페이지:**
- 1페이지: 1페이지 정면, 2페이지 오른쪽에 살짝 보임.
- 2페이지(마지막): 2페이지 정면, 1페이지 왼쪽에 살짝 보임.

**총 3페이지:**
- 1페이지: 1페이지 정면, 2페이지 오른쪽에 살짝 보임.
- 2페이지(중간): 2페이지 정면, **3페이지만** 오른쪽에 살짝 보임. 1페이지(이전)는 **안 보임.**
- 3페이지(마지막): 3페이지 정면, 2페이지 왼쪽에 살짝 보임. 다음 없음.

### 8.3 클래스 및 전환 규칙

- **current** / **last**: 현재 보는 페이지(정면). `translateX(0)`, z-index 높음.
- **next**: 현재 페이지 **다음** 장. 오른쪽에 살짝 보일 때만 사용. `translateX(양수)`, z-index 낮음.
- **prev**: 현재 페이지 **이전** 장. **마지막 페이지에 있을 때만** 왼쪽에 살짝 보이게 함. `translateX(음수)`, z-index 낮음.
- 중간 페이지에서는 **이전 페이지에 prev를 줘도 화면에는 노출하지 않음** (왼쪽에 안 보이게 처리).

### 8.4 CSS 예시

```css
/* 스택 애니메이션 예시. Grid 구현 시 셀렉터는 .invoice-page-block 로 적용 */
.invoice-page {
    transform-style: preserve-3d;
    transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.invoice-page.current {
    transform: translateZ(0) translateX(0);
    z-index: 10;
}

.invoice-page.next {
    /* 오른쪽에 다음 페이지만 살짝 보임 (첫 페이지·중간 페이지) */
    transform: translateZ(-100px) translateX(50px);
    z-index: 5;
}

.invoice-page.prev {
    /* 왼쪽에 이전 페이지 살짝 보임 — 마지막 페이지일 때만 시각적으로 노출 */
    transform: translateZ(-100px) translateX(-50px);
    z-index: 5;
}

.invoice-page.last {
    transform: translateZ(0) translateX(0);
    z-index: 10;
}
```

---

## 9. 측정 및 애니메이션 분리 원칙

### 9.1 측정 전제 조건

**페이지 분할 측정은 transform 없는 상태에서만 수행**

### 9.2 측정 프로세스

**측정 전:**
1. `.measure-mode` 클래스 적용
2. `transform` / `transition` 비활성화

**측정 완료 후:**
1. `measure-mode` 제거
2. 스택 애니메이션 적용

```css
/* 측정 모드 CSS */
.invoice-page.measure-mode {
    transform: none !important;
    transition: none !important;
    opacity: 1 !important;
}
```

```javascript
// 측정 프로세스 예시
async function measurePageLayout() {
    // 1. 측정 모드 활성화
    document.body.classList.add('measure-mode');
    
    // 2. 높이 측정
    const headerHeight = measureElement('.invoice-detail-header');
    const descriptionHeight = measureElement('.invoice-description-section');
    const priceHeight = measureElement('.invoice-summary-section');
    const footerHeight = measureElement('.invoice-detail-footer');
    
    // 3. 페이지 분할 계산
    const pageLayout = calculatePageSplit({
        headerHeight,
        descriptionHeight,
        priceHeight,
        footerHeight
    });
    
    // 4. 측정 모드 해제
    document.body.classList.remove('measure-mode');
    
    // 5. 애니메이션 적용
    applyStackAnimation(pageLayout);
}
```

---

## 10. 폰트 로딩 규칙

### 10.1 폰트 로딩 완료 대기

**페이지 분할은 반드시 폰트 로딩 완료 후 수행**

### 10.2 구현 방법

```javascript
// 폰트 로딩 완료 대기
async function waitForFonts() {
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    } else {
        // Fallback: Paperlogy 폰트 로딩 대기
        await new Promise((resolve) => {
            const checkFont = () => {
                if (document.fonts.check('1em Paperlogy')) {
                    resolve();
                } else {
                    setTimeout(checkFont, 100);
                }
            };
            checkFont();
        });
    }
}

// 페이지 분할 실행
async function initializeInvoicePagination() {
    // 1. 폰트 로딩 완료 대기
    await waitForFonts();
    
    // 2. 임시 레이아웃 표시 (선택사항)
    showTemporaryLayout();
    
    // 3. 페이지 분할 측정 및 적용
    await measurePageLayout();
    
    // 4. 최종 레이아웃 표시
    showFinalLayout();
}
```

### 10.3 폰트 로딩 전 처리

`document.fonts.ready` 완료 전에는:
- **임시 레이아웃만 표시**
- **분할 확정 금지**

---

## 11. 절대 금지 사항 요약

다음은 **무조건 금지**된다.

1. ❌ **`remainingSpace` / `priceCost` 기반 Price 이동**
2. ❌ **“Price 공간 부족”이라는 개념** — 구분선 Y·Price 슬롯 고정 전제 하에 미침범이면 항상 수용 가능
3. ❌ **상품 리스트(Description) 내부에 구분선 추가**
4. ❌ **상품 리스트(Description) 내부에 가격 정보 포함**
5. ❌ **Price가 상품 중간 페이지에 등장** — 상품이 아직 이어지는 페이지에는 Price 절대 등장 금지
6. ❌ **상품 행 분절** — 행 단위로만 이동, 행 쪼개기·반 행 배치 금지
7. ❌ **Header / Footer 위치가 상품 개수에 따라 변하는 구조** — Footer는 고정 슬롯, `margin-top: auto` 등으로 밀어 넣지 않음
8. ❌ **transform 상태에서 높이 측정**
9. ❌ **폰트 로딩 전 페이지 분할 확정**
10. ❌ **“3열 비활성 = Description이 3열을 채운다”로 구현하는 것** — Description의 **레이아웃 소유권은 2열**이며, 오버플로우는 침범 판정 근거이지 3열 "채우기"가 아님
11. ❌ **Price와 Description이 같은 페이지에 공존하면서 Description이 Price 이후에 이어지는 경우**

---

## 12. 구현 체크리스트

### 12.1 기본 레이아웃
- [ ] 슬롯 구조 구현: Header·Footer 고정 Y, 중간에 2열(상품)/구분선/3열(가격)
- [ ] Header·Footer가 모든 페이지에서 동일 Y로 존재 (고정 슬롯)
- [ ] Description은 2열 배치(오버플로우 시 침범 판정), Price(3열)는 구분선 침범 시에만 비활성
- [ ] 각 페이지는 최소한 **타입**(PRODUCT_AND_PRICE | PRODUCT_ONLY | PRICE_ONLY), **해당 페이지 상품 행 목록**, **구분선 유무**, **Price 유무**를 구분할 수 있어야 한다

### 12.2 페이지 분할 로직
- [ ] 행 단위 분절 금지 정책 구현
- [ ] **구분선 침범** 판정만 사용 (상품 하단 > 구분선 Y → 3열 비활성·구분선 제거)
- [ ] Price 배치: 미침범 종료 → PRODUCT_AND_PRICE, 침범 종료 → 다음 페이지 PRICE_ONLY (`remainingSpace`/`priceCost`/공간 부족 로직 미사용)
- [ ] 5가지 케이스 (A, B, C-1, C-2, C-3) 테스트

### 12.3 측정 및 애니메이션
- [ ] 측정 모드 (measure-mode) 구현
- [ ] transform 없는 상태에서 높이 측정
- [ ] 스택 애니메이션 구현
- [ ] 마지막 페이지 애니메이션 예외 처리

### 12.4 폰트 로딩
- [ ] `document.fonts.ready` 대기 로직 구현
- [ ] 폰트 로딩 전 임시 레이아웃 표시
- [ ] 폰트 로딩 완료 후 페이지 분할 확정

### 12.5 Footer 고정 슬롯 및 Price-only 페이지
- [ ] Footer를 페이지 템플릿의 고정 Y 슬롯으로 구현 (상품 개수와 무관)
- [ ] `margin-top: auto` 등으로 Footer를 “밀어 넣는” 방식 미사용
- [ ] Price-only 페이지에서도 Header·Footer 고정 Y 유지, 중간만 가격

### 12.6 테스트 케이스
- [ ] 케이스 A: 1페이지에 전부 들어가는 경우
- [ ] 케이스 B: Price만 다음 페이지로 이동
- [ ] 케이스 C-1: 상품이 매우 길어 마지막 페이지에만 Price 등장
- [ ] 케이스 C-2: 여러 페이지 후 침범 종료 (N페이지 PRODUCT_ONLY, N+1 PRICE_ONLY)
- [ ] 케이스 C-3: 상품이 끝나는 페이지에 Price도 함께 들어가는 경우
- [ ] 상품명 줄바꿈 테스트
- [ ] 반응형 브레이크포인트 테스트 (1440px+, 1439px 이하, 768px 이하)

---

## 13. 문서 결론 — 핵심 요약 문장 (최종)

이 설계는 다음으로 요약된다.

> **"상품은 페이지를 넘어 끝날 때까지 이어지며, 각 페이지에서 구분선 침범 여부에 따라 Price 열이 켜지거나 꺼진다. Price는 상품 종료 시점에 단 한 번만 배치된다."**

- **상품은 페이지를 넘어 끝날 때까지 이어진다** (흐름이 “구분선 전에서 멈추는” 것이 아님)
- **각 페이지에서 침범 여부만으로** 3열(Price) 활성/비활성이 결정된다
- **가격은 상품 흐름 종료 시점에 한 번만 배치**되며, 미침범이면 같은 페이지(PRODUCT_AND_PRICE), 침범이면 다음 페이지(PRICE_ONLY)
- **remainingSpace·priceCost·“공간 부족”은 사용하지 않는다**
- **이 규칙은 레이아웃, 페이지네이션, 애니메이션 어떤 레이어에서도 깨지지 않는다**

---

## 14. 기존 문서와의 차이점

### 14.1 주요 변경사항

| 항목 | 기존 문서 (INVOICE_PAGINATION_DESIGN.md) / v1 해석 | 새로운 규칙 (GPT 정리 반영) |
|------|----------------------------------------|---------------------------|
| **Price 등장·비활성 판정** | “상품 끝”·“페이지 끝” 등 다소 모호 | **구분선 침범** 하나만 사용: 상품 하단 > 구분선 Y → 3열 비활성·구분선 제거 |
| **“공백” 표현** | “Price 영역을 Description이 채운다” 등 사용 | **사용 금지**. “열 활성/비활성”(켜짐/꺼짐)으로만 표현. Description은 2열만 사용 |
| **레이아웃 모델** | 세로 스택·문서 흐름처럼 서술됨 | **슬롯 기반**: Header·Footer 고정 Y, 중간만 2열/구분선/3열 가변 |
| **Footer** | 문서 흐름 + `margin-top: auto` 예시 | **고정 슬롯**. 페이지 템플릿 고정 Y. auto·밀림 금지 |
| **페이지 상태** | 문장으로만 서술 | **PRODUCT_AND_PRICE / PRODUCT_ONLY / PRICE_ONLY** 로 명시 |

### 14.2 개선된 점

1. **Price 판정 기준 단일화**: “구분선 침범 여부”만 사용해, 상품 개수·페이지 끝 등 다른 기준 제거.
2. **“공백” 제거**: 열 비활성 시 “Description이 3열을 채운다”가 아닌 “3열·구분선만 제거, Description은 2열만 유지”로 정리.
3. **Footer 고정 명시**: 문서 흐름·auto 정렬 대신 “페이지 템플릿의 고정 슬롯”으로 정의.
4. **슬롯 구조 명시**: 세로 흐름이 아니라 Header/Content/Footer 슬롯 + Content 내 2열/구분선/3열 구조로 기술.

---

## 15. 기술적 구현 가능성 검토

### 15.1 현재 구조와의 호환성

✅ **호환 가능**: 현재 `invoice-detail.html`의 구조가 새로운 규칙과 호환됨

- `.invoice-detail-header` → Header
- `.invoice-description-section` → Description
- `.invoice-summary-section` → Price
- `.invoice-detail-footer` → Footer

### 15.2 구현 난이도

| 항목 | 난이도 | 비고 |
|------|--------|------|
| 기본 레이아웃 구조 | ⭐ 낮음 | 현재 구조 유지 |
| 행 분절 금지 | ⭐⭐ 중간 | 테이블 행 높이 측정 필요 |
| Price 등장 조건 | ⭐⭐ 중간 | 상품 끝 판정 로직 필요 |
| 측정 모드 분리 | ⭐⭐ 중간 | CSS 클래스 토글 구현 |
| 스택 애니메이션 | ⭐⭐⭐ 높음 | 3D transform 및 z-index 관리 |
| 폰트 로딩 대기 | ⭐ 낮음 | `document.fonts.ready` 사용 |

### 15.3 예상 구현 시간

- **기본 레이아웃 및 페이지 분할**: 2-3일
- **스택 애니메이션**: 2-3일
- **폰트 로딩 및 측정 모드**: 1일
- **테스트 및 버그 수정**: 2-3일

**총 예상 시간**: 약 1-2주

---

## 16. Implementation Decisions (Final)

다음은 구현 선택의 최종 고정이다. 규칙 본문 해석과 충돌하지 않으며, 코드화 시 이 결정을 따른다.

### 16.0 Divider DOM (필수)

- Description–Summary 경계는 시각적 border 재활용을 **금지**한다.
- 항상 독립 DOM 요소 **`.invoice-divider--desc-summary`** 를 둔다.
- 침범 판정 좌표는 **dividerRect.top (viewport)** 만 사용한다.

### 16.1 PRODUCT_ONLY 구현 (필수)

- PRODUCT_ONLY는 “숨김”이 아니라 **“레이아웃 모드 전환”** 이다.
- 해당 페이지에서 divider/summary **컬럼을 제거**(또는 0폭)하고, Description은 2열 기준으로만 유지한다.
- **단, divider DOM(침범 기준)은 측정/판정용으로 유지**되어야 한다 (표시 여부와 무관).

### 16.2 .invoice-page 도입 시점 (권장 + 제한적 예외)

- **권장:** `.invoice-page` 는 최종 구조 기준으로 **즉시 도입**한다 (멀티페이지/스택 애니메이션 전제).
- **제한적 예외 (1단계 검증 전용):** “침범 토글(PRODUCT_ONLY 전환)”만 빠르게 확인하려면, 기존 1페이지 컨테이너를 슬롯화한 뒤 `.invoice-page` 도입을 **1단계 검증 직후로 1회에 한해** 유예할 수 있다.
- **유예를 선택한 경우에도, 2단계(페이지 분할) 착수 전에는 `.invoice-page` 를 반드시 도입한다.**

### 16.3 멀티페이지 구현 시 체크 (실행 안정성)

- **침범 판정 입력:** lastRow는 **“해당 페이지에 배치된 마지막 row”** 이다. 전체 문서의 마지막 row가 아니다. row packing 결과(페이지별 row 리스트)가 침범 판정의 입력이 된다.
- **측정 후 애니메이션:** measure-mode(transform 없음)에서 DOM 생성·배치·측정·페이지 타입 확정까지 끝내고, **그 뒤에만** 애니메이션 클래스(current/next/prev/last)를 붙인다.

---

## 17. 참고사항

### 17.1 기존 문서 참조

- `INVOICE_PAGINATION_DESIGN.md`: 기존 페이지네이션 설계 문서 (참고용)
- 이 문서는 기존 문서의 개선 및 단순화 버전

### 17.2 관련 파일

- `invoice-detail.html`: 메인 구현 파일
- `invoice-detail.js`: 페이지 분할 및 애니메이션 로직

---

**문서 버전**: 1.8  
**최종 수정일**: 2026-01-28  
**작성 목적**: Invoice 레이아웃, 페이지네이션, 애니메이션 통합 규칙 정의 (Corrected · Consistent Specification)  
**v1.8 변경 요약**: 섹션 8 애니메이션 규칙 정리 — 첫/중간 페이지는 오른쪽에 다음만 보임, 마지막 페이지만 왼쪽에 이전 보임. 표·예시(2페이지/3페이지)·클래스 규칙·Grid용 .invoice-page-block 안내 추가.  
**v1.7**: Implementation Decisions (Final) — Divider 독립 DOM, PRODUCT_ONLY, .invoice-page 도입 시점, lastRow/measure-mode. **v1.6**: 구현 해석 여지 제거 4가지.
