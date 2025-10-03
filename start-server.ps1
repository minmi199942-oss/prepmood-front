# 서버 시작 스크립트
# 현재 경로 확인
$currentPath = Get-Location
Write-Host "현재 경로: $currentPath"

# backend 폴더로 이동
if (Test-Path "backend") {
    Write-Host "backend 폴더로 이동합니다..."
    Set-Location "backend"
    Write-Host "이동 완료: $(Get-Location)"
} else {
    Write-Host "backend 폴더를 찾을 수 없습니다."
    exit 1
}

# package.json 확인
if (Test-Path "package.json") {
    Write-Host "package.json 발견. 서버를 시작합니다..."
    npm start
} else {
    Write-Host "package.json을 찾을 수 없습니다."
    exit 1
}

