# QR 코드 생성 및 커스터마이징 가이드

QR 코드의 크기, 굵기, 색상 등을 쉽게 조정할 수 있는 가이드입니다.

---

## 📋 목차

1. [빠른 시작](#빠른-시작)
2. [설정 파일 구조](#설정-파일-구조)
3. [설정 옵션 설명](#설정-옵션-설명)
4. [QR 코드 생성 방법](#qr-코드-생성-방법)
5. [샘플 생성 방법](#샘플-생성-방법)
6. [프리셋 커스터마이징](#프리셋-커스터마이징)

---

## 🚀 빠른 시작

### 1. 기본 QR 코드 생성

```bash
cd backend
node generate-qr-codes.js
```

기본 설정(`default`)으로 모든 제품의 QR 코드를 생성합니다.

### 2. 특정 프리셋으로 생성

```bash
# 큰 크기로 생성
node generate-qr-codes.js large

# 굵은 스타일로 생성
node generate-qr-codes.js bold

# 초대형으로 생성
node generate-qr-codes.js extra_large
```

### 3. 샘플 생성

```bash
# 모든 프리셋의 샘플 생성
node generate-qr-samples.js
```

`output_qrcodes/samples/` 폴더에 각 프리셋별 샘플이 생성됩니다.

---

## 📁 설정 파일 구조

설정 파일 위치: `backend/qr-config.json`

```json
{
  "default": {
    "width": 400,
    "margin": 4,
    "errorCorrectionLevel": "H",
    "color": {
      "dark": "#000000",
      "light": "#FFFFFF"
    },
    "description": "기본 설정 (400x400, 얇은 여백)"
  },
  "samples": {
    "small": { ... },
    "medium": { ... },
    "large": { ... },
    ...
  }
}
```

---

## ⚙️ 설정 옵션 설명

### `width` (필수)
- **설명**: QR 코드 이미지의 가로/세로 크기 (픽셀)
- **기본값**: `400`
- **권장 범위**: `200` ~ `1000`
- **예시**: 
  - `200`: 작은 크기 (명함, 작은 라벨)
  - `400`: 중간 크기 (일반 라벨, 포스터)
  - `600`: 큰 크기 (큰 포스터, 배너)
  - `800`: 초대형 (대형 배너, 현수막)

### `margin` (선택)
- **설명**: QR 코드 주변 여백 (모듈 단위)
- **기본값**: `4`
- **권장 범위**: `2` ~ `10`
- **설명**:
  - `2`: 최소 여백 (공간 절약)
  - `4`: 기본 여백 (권장)
  - `6-8`: 넓은 여백 (인쇄물, 포스터)
  - `10`: 매우 넓은 여백 (디자인 강조)

### `errorCorrectionLevel` (선택)
- **설명**: 오류 정정 레벨 (QR 코드가 손상되어도 읽을 수 있는 정도)
- **기본값**: `"H"`
- **옵션**: `"L"`, `"M"`, `"Q"`, `"H"`
- **설명**:
  - `"L"`: 약 7% 손상 복구 가능 (가장 작은 크기)
  - `"M"`: 약 15% 손상 복구 가능
  - `"Q"`: 약 25% 손상 복구 가능
  - `"H"`: 약 30% 손상 복구 가능 (가장 큰 크기, 권장)

### `color` (선택)
- **설명**: QR 코드 색상 설정
- **기본값**: 
  ```json
  {
    "dark": "#000000",  // QR 코드 패턴 색상 (검정)
    "light": "#FFFFFF"  // 배경 색상 (흰색)
  }
  ```
- **설명**:
  - `dark`: QR 코드의 검은색 부분 (필수: 어두운 색상)
  - `light`: 배경 색상 (필수: 밝은 색상)
  - **주의**: `dark`와 `light`는 명확한 대비가 있어야 스캔이 잘 됩니다.

---

## 🔧 QR 코드 생성 방법

### 방법 1: 기본 설정으로 생성

```bash
cd backend
node generate-qr-codes.js
```

- `qr-config.json`의 `default` 설정 사용
- DB의 모든 제품에 대해 QR 코드 생성
- `output_qrcodes/` 폴더에 저장

### 방법 2: 특정 프리셋으로 생성

```bash
node generate-qr-codes.js [프리셋이름]
```

**사용 가능한 프리셋:**
- `small`: 200x200px, 얇은 여백
- `medium`: 400x400px, 기본 여백
- `large`: 600x600px, 넓은 여백
- `extra_large`: 800x800px, 매우 넓은 여백
- `huge`: 1000x1000px, 거대형
- `giant`: 1200x1200px, 거대형
- `bold`: 500x500px, 기본 여백
- `bold_lines`: 500x500px, 굵은 선 (원래 크기 대비 선 굵게)
- `custom_color`: 400x400px, 커스텀 색상

**예시:**
```bash
# 큰 크기로 생성
node generate-qr-codes.js large

# 굵은 스타일로 생성
node generate-qr-codes.js bold
```

### ⚠️ 중요: 기존 파일 덮어쓰기

**VPS에서 실행 시 동작 방식:**

1. **기존 파일은 삭제되지 않고 덮어쓰기됩니다**
   - 같은 파일명(`{internal_code}.png`)으로 저장되므로
   - 기존 파일이 새 버전으로 **자동 교체**됩니다
   - 예: `SH001.png`가 있으면 → 같은 이름으로 큰 버전으로 교체

2. **파일 저장 위치**
   - 저장 경로: `output_qrcodes/{internal_code}.png`
   - 예: `output_qrcodes/SH001.png`, `output_qrcodes/PM-002.png`

3. **샘플 파일은 영향받지 않음**
   - `output_qrcodes/samples/` 폴더의 샘플 파일은 그대로 유지됩니다
   - 샘플은 `generate-qr-samples.js`로만 생성/수정됩니다

**실행 예시 (VPS):**
```bash
# VPS 접속 후
cd /var/www/html/backend

# 큰 크기로 모든 QR 코드 재생성 (기존 파일 덮어쓰기)
node generate-qr-codes.js large
```

**결과:**
- ✅ DB의 모든 제품에 대해 큰 크기(600x600px) QR 코드 생성
- ✅ 기존 파일들이 큰 버전으로 교체됨
- ✅ 파일명은 동일하게 유지 (`{internal_code}.png`)
- ✅ 샘플 폴더는 영향받지 않음

**주의사항:**
- ⚠️ 기존 QR 코드를 백업하고 싶다면 실행 전에 `output_qrcodes/` 폴더를 복사하세요
- ⚠️ 한 번 실행하면 모든 제품의 QR 코드가 새 설정으로 교체됩니다
- ⚠️ 샘플을 먼저 생성해서 크기를 확인한 후 전체 생성하는 것을 권장합니다

---

## 🎨 샘플 생성 방법

다양한 프리셋의 샘플을 한 번에 생성하여 비교할 수 있습니다.

```bash
cd backend
node generate-qr-samples.js
```

**결과:**
- `output_qrcodes/samples/` 폴더에 생성
- 파일명: `sample-{프리셋이름}.png`
- 예: `sample-small.png`, `sample-large.png` 등

**생성되는 샘플:**
- `sample-small.png` - 작은 크기
- `sample-medium.png` - 중간 크기
- `sample-large.png` - 큰 크기
- `sample-extra_large.png` - 초대형
- `sample-bold.png` - 굵은 스타일
- `sample-custom_color.png` - 커스텀 색상

---

## 🎯 프리셋 커스터마이징

### 1. 기존 프리셋 수정

`backend/qr-config.json` 파일을 열어서 원하는 프리셋을 수정합니다.

**예시: 더 큰 크기로 변경**
```json
{
  "samples": {
    "large": {
      "width": 800,        // 600 → 800으로 변경
      "margin": 8,         // 6 → 8로 변경
      "errorCorrectionLevel": "H",
      "color": {
        "dark": "#000000",
        "light": "#FFFFFF"
      },
      "description": "큰 크기 (800x800, 넓은 여백)"
    }
  }
}
```

### 2. 새로운 프리셋 추가

`qr-config.json`의 `samples` 객체에 새로운 프리셋을 추가합니다.

**예시: 매우 굵은 스타일 추가**
```json
{
  "samples": {
    "very_bold": {
      "width": 700,
      "margin": 3,
      "errorCorrectionLevel": "H",
      "color": {
        "dark": "#1a1a1a",  // 약간 연한 검정
        "light": "#f5f5f5"  // 약간 어두운 흰색
      },
      "description": "매우 굵은 스타일 (700x700, 얇은 여백)"
    }
  }
}
```

### 3. 기본 설정 변경

`default` 프리셋을 수정하면 기본 생성 시 사용되는 설정이 변경됩니다.

```json
{
  "default": {
    "width": 500,        // 기본 크기 변경
    "margin": 5,         // 기본 여백 변경
    "errorCorrectionLevel": "H",
    "color": {
      "dark": "#000000",
      "light": "#FFFFFF"
    },
    "description": "기본 설정 (500x500, 중간 여백)"
  }
}
```

---

## 📊 크기별 권장 용도

| 크기 | 용도 | 예시 |
|------|------|------|
| 200px | 작은 라벨, 명함 | 제품 태그, 명함 |
| 400px | 일반 라벨, 포스터 | 제품 박스, 포스터 |
| 500-600px | 큰 포스터, 배너 | 매장 포스터, 이벤트 배너 |
| 800px+ | 초대형 배너, 현수막 | 대형 이벤트, 현수막 |

---

## 🎨 색상 커스터마이징 팁

### 1. 대비 확보
- `dark`와 `light`의 색상 차이가 클수록 스캔 성공률이 높습니다.
- 권장: 검정/흰색 또는 진한 색/밝은 색 조합

### 2. 브랜드 색상 적용
```json
{
  "color": {
    "dark": "#1a1a1a",      // 브랜드 다크 색상
    "light": "#f8f8f8"      // 브랜드 라이트 색상
  }
}
```

### 3. 주의사항
- ❌ 빨강/녹색 조합 (색맹 사용자 문제)
- ❌ 너무 비슷한 색상 (대비 부족)
- ✅ 검정/흰색 (가장 안정적)
- ✅ 진한 파랑/밝은 노랑 (양호)

---

## 🔍 문제 해결

### 문제: QR 코드가 너무 작아서 스캔이 안 됨
**해결**: `width` 값을 증가시키세요 (최소 300px 권장)

### 문제: QR 코드가 너무 커서 파일 크기가 큼
**해결**: `width` 값을 감소시키세요 (200-400px 권장)

### 문제: 여백이 너무 좁아서 인쇄 시 잘림
**해결**: `margin` 값을 증가시키세요 (6-8 권장)

### 문제: 색상이 비슷해서 스캔이 안 됨
**해결**: `dark`와 `light`의 대비를 높이세요 (검정/흰색 권장)

---

## 📝 예시: 커스텀 프리셋 만들기

**목표**: 인쇄용 큰 QR 코드 (600x600, 넓은 여백, 브랜드 색상)

1. `backend/qr-config.json` 열기
2. `samples` 객체에 추가:
```json
{
  "samples": {
    "print_large": {
      "width": 600,
      "margin": 8,
      "errorCorrectionLevel": "H",
      "color": {
        "dark": "#1a1a1a",
        "light": "#f5f5f5"
      },
      "description": "인쇄용 큰 크기 (600x600, 넓은 여백)"
    }
  }
}
```

3. 생성:
```bash
node generate-qr-codes.js print_large
```

---

## ✅ 체크리스트

QR 코드 생성 전 확인사항:

- [ ] `qr-config.json` 파일이 존재하는가?
- [ ] 사용할 프리셋이 설정 파일에 있는가?
- [ ] `width` 값이 용도에 적합한가? (200-1000px 권장)
- [ ] `margin` 값이 적절한가? (인쇄용은 6-8 권장)
- [ ] `color.dark`와 `color.light`의 대비가 충분한가?
- [ ] `errorCorrectionLevel`이 'H'인가? (권장)

---

## 📚 참고 자료

- [qrcode npm 패키지 문서](https://www.npmjs.com/package/qrcode)
- [QR 코드 오류 정정 레벨 설명](https://en.wikipedia.org/wiki/QR_code#Error_correction)

---

**문의사항이나 문제 발생 시:** 설정 파일과 콘솔 출력을 확인하세요.

