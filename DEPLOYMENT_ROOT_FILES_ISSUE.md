# 배포 시스템 문제 분석: 루트 HTML 파일 누락

## 🔍 문제 발생 원인

### 1. 구조적 문제

**프로젝트 구조:**
```
project-root/
├── login.html          ← Nginx가 정적 파일로 서빙
├── index.html          ← Nginx가 정적 파일로 서빙
├── utils.js            ← Nginx가 정적 파일로 서빙
├── backend/            ← Node.js 서버 (PM2)
│   ├── index.js
│   └── ...
└── ...
```

**Nginx 설정:**
```nginx
location / {
    root /var/www/html;  # ← 루트 HTML 파일들을 직접 서빙
    index index.html;
}

location /api {
    proxy_pass http://127.0.0.1:3000;  # ← backend/만 Node.js로
}
```

**배포 스크립트 (문제 발생 전):**
```bash
# ❌ backend/만 동기화
rsync ... "$REPO_DIR/backend/" "$LIVE_BACKEND/"
```

### 2. 왜 이런 문제가 발생했나?

**보안 개선 과정에서 생긴 부작용:**

1. **예전 방식 (보안 문제):**
   ```bash
   cd /var/www/html/backend
   git pull origin main  # ← .git 디렉토리가 웹 루트에 노출
   ```
   - `.git/config`가 HTTP로 접근 가능 (보안 위험)
   - 스캐너가 `.git/config`를 HTTP 200으로 접근한 기록 확인

2. **새로운 방식 (보안 개선):**
   ```bash
   cd /root/prepmood-repo  # ← 웹 루트 밖
   git pull origin main
   rsync ... backend/ ...  # ← backend/만 동기화
   ```
   - ✅ `.git` 디렉토리 노출 문제 해결
   - ❌ **루트 HTML 파일 배포 누락** (의도하지 않은 부작용)

### 3. 근본 원인

**배포 스크립트 설계 시점의 가정:**
- "모든 코드는 `backend/` 폴더에 있다"
- "정적 파일은 별도로 관리한다" (하지만 실제로는 Git에 포함됨)

**실제 상황:**
- 루트에 HTML 파일들이 존재
- Nginx가 이 파일들을 직접 서빙
- 배포 스크립트가 이 파일들을 동기화하지 않음

---

## ⚠️ 앞으로도 발생 가능한가?

### 1. 현재 상태 (수정 후)

**수정된 배포 스크립트:**
```bash
# ✅ backend/ 동기화
rsync ... "$REPO_DIR/backend/" "$LIVE_BACKEND/"

# ✅ 루트 HTML 파일 동기화 (추가됨)
ROOT_HTML_FILES=(
    "login.html"
    "index.html"
    "register.html"
    "my-profile.html"
    "my-orders.html"
    "complete-profile.html"
    "utils.js"
    "google-callback.html"
)
for file in "${ROOT_HTML_FILES[@]}"; do
    cp "$REPO_DIR/$file" "$LIVE_ROOT/$file"
done
```

**현재 포함된 파일:**
- ✅ `login.html`
- ✅ `index.html`
- ✅ `register.html`
- ✅ `my-profile.html`
- ✅ `my-orders.html`
- ✅ `complete-profile.html`
- ✅ `utils.js`
- ✅ `google-callback.html`

### 2. 여전히 발생 가능한 경우

**❌ 새로운 HTML 파일 추가 시:**
- 예: `checkout.html`, `cart.html`, `wishlist.html` 등
- 배포 스크립트의 `ROOT_HTML_FILES` 배열에 수동 추가 필요
- 추가하지 않으면 동일한 문제 발생

**❌ 새로운 공통 JS 파일 추가 시:**
- 예: `common.js`, `api-config.js` 등
- 동일하게 수동 추가 필요

**❌ 기존 파일 이름 변경 시:**
- 예: `login.html` → `signin.html`
- 배열에서 이름 업데이트 필요

### 3. 근본적인 해결책 (장기)

**옵션 1: 자동 감지 방식 (⚠️ 보안 위험)**
```bash
# 루트의 모든 .html, .js 파일 자동 동기화
find "$REPO_DIR" -maxdepth 1 -type f \( -name "*.html" -o -name "*.js" \) \
    -exec cp {} "$LIVE_ROOT/" \;
```

**장점:**
- 새 파일 추가 시 자동 포함
- 수동 관리 불필요

**단점:**
- ❌ **보안 위험**: `debug.html`, `temp.html`, `test-payment.html` 같은 파일이 실수로 배포될 수 있음
- 불필요한 파일도 복사될 수 있음 (예: `test.html`)
- `.gitignore`에 명시된 파일도 복사됨

**옵션 2: 허용 목록 기반 rsync (✅ 권장)**
```bash
# 허용 목록만 동기화 (--delete 제거로 기존 파일 보호)
rsync -av \
    --include="login.html" \
    --include="index.html" \
    --include="my-*.html" \
    --include="utils.js" \
    --exclude="*" \
    "$REPO_DIR/" "$LIVE_ROOT/"
```

**장점:**
- ✅ 의도치 않은 파일 노출 방지
- ✅ 기존 파일 보호 (robots.txt, favicon.ico 등)
- ✅ 부분 배포 가능성 낮춤 (cp 루프보다 안정적)

**옵션 3: 구조 개선 (대규모 리팩토링)**
```
project-root/
├── frontend/          ← 모든 정적 파일
│   ├── login.html
│   ├── index.html
│   └── ...
├── backend/          ← Node.js 서버
└── ...
```

---

## 📋 체크리스트: 앞으로 배포 시 확인할 것

### 배포 전
- [ ] 새로운 HTML 파일 추가했는가? → `ROOT_HTML_FILES` 배열에 추가
- [ ] 새로운 공통 JS 파일 추가했는가? → `ROOT_HTML_FILES` 배열에 추가
- [ ] 기존 파일 이름 변경했는가? → 배열에서 이름 업데이트

### 배포 후
- [ ] 브라우저에서 새로고침 (Ctrl+Shift+R)
- [ ] Network 탭에서 파일 Response 확인
- [ ] Console에서 로그 확인

---

## 🎯 결론

### 문제 발생 이유
1. **보안 개선 과정의 부작용**: `.git` 노출 방지를 위해 배포 방식을 변경하면서 루트 파일 동기화가 누락됨
2. **구조적 불일치**: 프로젝트 구조(루트에 HTML)와 배포 스크립트 설계(backend/만 동기화)가 불일치
3. **초기 설계 누락**: 배포 스크립트 작성 시 루트 HTML 파일을 고려하지 않음

### 앞으로 발생 가능성
- **현재 수정으로 해결**: 이미 배포된 주요 파일들은 포함됨
- **새 파일 추가 시**: 수동으로 배열에 추가해야 함 (자동화 필요)
- **근본 해결**: 자동 감지 방식으로 개선 권장

### 권장 사항
1. **단기**: 현재 수정된 스크립트 사용 (주요 파일 포함)
2. **중기**: 자동 감지 방식으로 개선 (새 파일 자동 포함)
3. **장기**: 프로젝트 구조 개선 (frontend/ 디렉토리 분리)

