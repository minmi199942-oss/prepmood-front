# QR 코드 생성 설정 가이드

## 개요

QR 코드의 크기, 굵기, 여백 등을 환경 변수로 조정할 수 있습니다.

## 설정 방법

`.env` 파일에 다음 환경 변수를 추가하세요:

```env
# QR 코드 전체 이미지 크기 (픽셀)
# 기본값: 400
QR_WIDTH=400

# QR 코드 여백 (모듈 단위)
# 기본값: 4
QR_MARGIN=4

# QR 코드 오류 수정 레벨
# L (낮음), M (중간), Q (높음), H (매우 높음)
# 기본값: H
QR_ERROR_CORRECTION_LEVEL=H

# QR 코드 색상 (검정)
# 기본값: #000000
QR_COLOR_DARK=#000000

# 배경 색상 (흰색)
# 기본값: #FFFFFF
QR_COLOR_LIGHT=#FFFFFF

# 각 모듈(점)의 크기 (선택사항)
# scale을 지정하면 width는 무시됨
# 기본값: 미사용 (width 사용)
# QR_SCALE=10
```

## 옵션 설명

### 1. QR_WIDTH (전체 이미지 크기)
- **설명**: QR 코드 이미지의 전체 크기 (픽셀)
- **기본값**: 400
- **예시**:
  - `QR_WIDTH=200` → 작은 QR 코드 (200x200 픽셀)
  - `QR_WIDTH=600` → 큰 QR 코드 (600x600 픽셀)
  - `QR_WIDTH=1000` → 매우 큰 QR 코드 (1000x1000 픽셀)

### 2. QR_SCALE (모듈 크기)
- **설명**: 각 모듈(점)의 크기를 직접 지정
- **기본값**: 미사용
- **주의**: `QR_SCALE`을 지정하면 `QR_WIDTH`는 무시됩니다
- **예시**:
  - `QR_SCALE=5` → 각 점이 5x5 픽셀
  - `QR_SCALE=10` → 각 점이 10x10 픽셀 (더 굵은 QR 코드)

### 3. QR_MARGIN (여백)
- **설명**: QR 코드 주변의 여백 크기 (모듈 단위)
- **기본값**: 4
- **예시**:
  - `QR_MARGIN=2` → 작은 여백
  - `QR_MARGIN=8` → 큰 여백

### 4. QR_ERROR_CORRECTION_LEVEL (오류 수정 레벨)
- **설명**: QR 코드가 손상되어도 읽을 수 있는 정도
- **기본값**: H (매우 높음)
- **옵션**:
  - `L` (Low): 약 7% 손상 복구 가능
  - `M` (Medium): 약 15% 손상 복구 가능
  - `Q` (Quartile): 약 25% 손상 복구 가능
  - `H` (High): 약 30% 손상 복구 가능

### 5. QR_COLOR_DARK / QR_COLOR_LIGHT (색상)
- **설명**: QR 코드와 배경의 색상
- **기본값**: 검정(#000000) / 흰색(#FFFFFF)
- **예시**:
  - `QR_COLOR_DARK=#0000FF` → 파란색 QR 코드
  - `QR_COLOR_LIGHT=#F0F0F0` → 연한 회색 배경

## 사용 예시

### 예시 1: 작고 굵은 QR 코드
```env
QR_WIDTH=300
QR_MARGIN=2
QR_ERROR_CORRECTION_LEVEL=H
```

### 예시 2: 크고 얇은 QR 코드
```env
QR_WIDTH=800
QR_MARGIN=6
QR_ERROR_CORRECTION_LEVEL=M
```

### 예시 3: 모듈 크기 직접 지정 (더 정밀한 제어)
```env
QR_SCALE=8
QR_MARGIN=4
QR_ERROR_CORRECTION_LEVEL=H
```

## 적용 방법

1. `.env` 파일에 원하는 설정 추가
2. QR 코드 재생성:
   ```bash
   node backend/generate-qr-codes.js
   ```

## 주의사항

- **QR_WIDTH vs QR_SCALE**: 
  - `QR_WIDTH`는 전체 이미지 크기를 지정 (QR 코드 내용에 따라 모듈 크기가 자동 조정)
  - `QR_SCALE`은 각 모듈의 크기를 직접 지정 (QR 코드 내용에 따라 전체 크기가 달라짐)
  - 두 옵션을 동시에 사용하면 `QR_SCALE`이 우선됩니다

- **오류 수정 레벨**:
  - 레벨이 높을수록 QR 코드가 더 복잡해지고 크기가 커집니다
  - 인쇄나 스티커에 사용할 경우 `H` 레벨을 권장합니다

- **색상**:
  - QR 코드와 배경의 대비가 충분해야 스캔이 잘 됩니다
  - 어두운 색상과 밝은 색상의 조합을 권장합니다

