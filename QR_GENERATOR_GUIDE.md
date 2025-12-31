# QR 코드 생성기 실행 가이드

`generate_qr_local.py` 스크립트를 사용하여 제품 QR 코드를 생성하는 방법입니다.

---

## 📋 사전 준비사항

### 1. Python 버전 확인

**Windows (PowerShell):**
```powershell
python --version
```

**또는:**
```powershell
python3 --version
```

**필요한 버전:** Python 3.7 이상 (권장: 3.8 이상)

**설치되어 있지 않은 경우:**
- [Python 공식 사이트](https://www.python.org/downloads/)에서 다운로드
- 설치 시 "Add Python to PATH" 옵션 체크 필수

---

### 2. 필요한 라이브러리 설치

프로젝트 루트 디렉토리에서 다음 명령어를 실행하세요:

**Windows (PowerShell):**
```powershell
pip install pandas qrcode[pil] openpyxl
```

**설치 확인:**
```powershell
pip list | Select-String -Pattern "pandas|qrcode|openpyxl"
```

**설치된 라이브러리:**
- `pandas` - Excel/CSV 파일 읽기
- `qrcode[pil]` - QR 코드 생성 (Pillow 포함)
- `openpyxl` - Excel 파일 읽기

---

## 📁 파일 배치 구조

프로젝트 루트 디렉토리에 다음 파일들을 배치하세요:

```
project-root/
├── generate_qr_local.py    ← Python 스크립트
├── products.xlsx           ← 입력 파일 (필수)
└── (실행 후 생성됨)
    ├── output_qrcodes/     ← QR 이미지 폴더
    ├── mapping_result.csv ← 토큰 매핑 파일
    └── qrcodes.zip         ← 압축 파일
```

### 파일 위치 확인

**PowerShell에서 현재 디렉토리 확인:**
```powershell
pwd
```

**필요한 파일 확인:**
```powershell
ls generate_qr_local.py
ls products.xlsx
```

---

## 🚀 실행 방법

### 1. 프로젝트 루트 디렉토리로 이동

```powershell
cd C:\Users\minmi\Documents\00-html-play\project-root
```

### 2. 스크립트 실행

```powershell
python generate_qr_local.py
```

**또는 Python 3가 별도로 설치된 경우:**
```powershell
python3 generate_qr_local.py
```

---

## ✅ 실행 후 정상 결과 체크리스트

### 1. 콘솔 출력 확인

정상 실행 시 다음과 같은 메시지가 출력됩니다:

```
🚀 작업 시작...
📄 파일 읽는 중: products.xlsx
✨ 총 X개의 QR 코드를 생성합니다.
..........
💾 매핑 데이터(CSV) 저장 중...
📦 ZIP 압축 중...

✅ 모든 작업 완료!
1. 생성된 QR 폴더: output_qrcodes
2. 매핑 파일: mapping_result.csv
3. 최종 제출 파일: qrcodes.zip
```

### 2. 생성된 폴더 확인

**PowerShell:**
```powershell
Test-Path output_qrcodes
```

**폴더 내용 확인:**
```powershell
ls output_qrcodes
```

**예상 결과:**
- `{internal_code}.png` 파일들이 생성됨
- 예: `SH001.png`, `PM-25-M-BP-001.png` 등

### 3. 매핑 CSV 파일 확인

**PowerShell:**
```powershell
Test-Path mapping_result.csv
```

**파일 내용 확인 (첫 5줄):**
```powershell
Get-Content mapping_result.csv -Head 5
```

**예상 컬럼:**
- `token` - 생성된 고유 토큰
- `internal_code` - 원본 제품 코드
- `file_name` - 실제 파일명 (중복 시 `_1`, `_2` 접미사)
- `product_name` - 제품명
- `status` - 상태 (0)
- `created_at` - 생성 일시

### 4. ZIP 파일 확인

**PowerShell:**
```powershell
Test-Path qrcodes.zip
```

**ZIP 파일 크기 확인:**
```powershell
(Get-Item qrcodes.zip).Length
```

**ZIP 내용 확인 (압축 해제 없이):**
```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::OpenRead("qrcodes.zip").Entries | Select-Object Name
```

---

## 🔍 문제 해결

### 오류: `ModuleNotFoundError: No module named 'pandas'`

**해결:**
```powershell
pip install pandas qrcode[pil] openpyxl
```

---

### 오류: `FileNotFoundError: products.xlsx 또는 products.csv가 없습니다.`

**해결:**
1. `products.xlsx` 파일이 스크립트와 같은 디렉토리에 있는지 확인
2. 파일명이 정확한지 확인 (대소문자 구분)

**파일 확인:**
```powershell
ls products.xlsx
```

---

### 오류: `ValueError: 필수 컬럼이 없습니다: {'internal_code'}`

**해결:**
1. Excel 파일을 열어서 컬럼명 확인
2. 필수 컬럼: `internal_code`, `product_name`
3. 컬럼명 앞뒤 공백 제거 확인

**Excel 파일 구조 예시:**
| internal_code | product_name |
|---------------|--------------|
| SH001         | Slim Fit Jeans |
| PM-002        | Classic T-Shirt |

---

### QR 이미지가 생성되지 않음

**확인 사항:**
1. `output_qrcodes` 폴더가 생성되었는지 확인
2. 폴더에 쓰기 권한이 있는지 확인
3. 콘솔에 경고 메시지가 있는지 확인

**폴더 권한 확인:**
```powershell
Test-Path output_qrcodes
ls output_qrcodes
```

---

### ZIP 파일이 생성되지 않음

**확인 사항:**
1. `output_qrcodes` 폴더에 PNG 파일이 있는지 확인
2. ZIP 파일 생성 권한 확인
3. 동일한 이름의 ZIP 파일이 열려있지 않은지 확인

---

## 📊 실행 결과 검증 스크립트

다음 PowerShell 스크립트로 결과를 자동 검증할 수 있습니다:

```powershell
# 결과 검증 스크립트
Write-Host "=== QR 생성 결과 검증 ===" -ForegroundColor Cyan

# 1. 폴더 확인
if (Test-Path "output_qrcodes") {
    $qrCount = (Get-ChildItem "output_qrcodes\*.png").Count
    Write-Host "✅ QR 폴더: $qrCount 개의 PNG 파일 생성됨" -ForegroundColor Green
} else {
    Write-Host "❌ QR 폴더가 없습니다" -ForegroundColor Red
}

# 2. CSV 확인
if (Test-Path "mapping_result.csv") {
    $csvLines = (Get-Content "mapping_result.csv").Count
    Write-Host "✅ 매핑 CSV: $csvLines 줄 (헤더 포함)" -ForegroundColor Green
} else {
    Write-Host "❌ 매핑 CSV가 없습니다" -ForegroundColor Red
}

# 3. ZIP 확인
if (Test-Path "qrcodes.zip") {
    $zipSize = [math]::Round((Get-Item "qrcodes.zip").Length / 1MB, 2)
    Write-Host "✅ ZIP 파일: ${zipSize} MB" -ForegroundColor Green
} else {
    Write-Host "❌ ZIP 파일이 없습니다" -ForegroundColor Red
}

Write-Host "`n검증 완료!" -ForegroundColor Cyan
```

이 스크립트를 `verify_qr_results.ps1`로 저장하고 실행:
```powershell
.\verify_qr_results.ps1
```

---

## 📝 참고사항

1. **입력 파일 형식:**
   - Excel (`.xlsx`) 또는 CSV (`.csv`) 지원
   - 파일명은 `products.xlsx` 또는 `products.csv`여야 함

2. **중복 처리:**
   - 동일한 `internal_code`가 있으면 파일명에 `_1`, `_2` 접미사 추가
   - 원본 `internal_code`는 CSV에 그대로 저장됨

3. **QR 코드 URL:**
   - 생성된 URL 형식: `https://prepmood.kr/a/{token}`
   - 각 제품마다 고유한 토큰 생성

4. **이미지 크기:**
   - 최소 400x400px 보장
   - `box_size=12`, `border=4` 설정

---

## 🎯 다음 단계

QR 코드 생성이 완료되면:

1. **백엔드 연동:** `mapping_result.csv`의 데이터를 데이터베이스에 저장
2. **라우트 설정:** `/a/{token}` 경로로 정품 인증 페이지 연결
3. **QR 스캔 테스트:** 생성된 QR 코드로 실제 인증 테스트

---

**문의사항이나 오류 발생 시:** 콘솔 출력 메시지와 함께 문제를 확인하세요.











