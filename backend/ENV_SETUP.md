# 환경 변수 설정 가이드

## 정품 인증 시스템 환경 변수

### 필수 환경 변수

`.env` 파일에 다음 변수를 추가하세요:

```bash
# 정품 인증 URL 기본 경로
# 예: https://prepmood.kr/a/
AUTH_BASE_URL=https://prepmood.kr/a/
```

### 설정 방법

1. `backend/.env` 파일 열기 (없으면 생성)
2. 위의 `AUTH_BASE_URL` 추가
3. 서버 재시작

### 기본값

환경 변수가 설정되지 않으면 기본값 `https://prepmood.kr/a/`를 사용합니다.

### 사용 위치

- `init-auth-db.js`: DB 초기화 시 샘플 URL 출력
- `generate-qr-codes.js`: QR 코드 생성 시 URL 생성

