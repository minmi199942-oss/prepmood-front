# 관리자 페이지 표준 초기화 규약

> **목적**: 모든 관리자 페이지가 동일한 초기화 패턴을 따르도록 표준화하여, 권한 체크 누락/중복 실행/전역 충돌을 구조적으로 방지합니다.

---

## 📋 핵심 규칙

### 1. 스크립트 순서 (필수)

모든 관리자 페이지 하단은 다음 순서를 **반드시** 준수합니다:

```html
<!-- 1. 공통 레이아웃 -->
<script src="admin-layout.js"></script>

<!-- 2. 페이지별 JS -->
<script src="admin-<page>.js"></script>

<!-- 3. 초기화 스크립트 (inline) -->
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await initAdminLayout('<page>');
    if (!ok) return;
    
    // 네임스페이스 패턴으로 페이지별 init 호출
    const fn = window.AdminPages?.['<page>']?.init;
    if (typeof fn === 'function') fn();
  });
</script>
```

**예시 (`orders.html`):**
```html
<script src="admin-layout.js"></script>
<script src="admin-orders.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await initAdminLayout('orders');
    if (!ok) return;
    
    const fn = window.AdminPages?.orders?.init;
    if (typeof fn === 'function') fn();
  });
</script>
```

### 2. 페이지별 JS 규칙

#### ✅ 필수 사항

1. **IIFE로 감싸기** (전역 스코프 오염 방지)
   ```javascript
   (function() {
     'use strict';
     // 모든 코드
   })();
   ```

2. **init 함수를 네임스페이스로 노출**
   ```javascript
   // 파일 마지막 (IIFE 내부)
   window.AdminPages = window.AdminPages || {};
   window.AdminPages['<page>'] = window.AdminPages['<page>'] || {};
   window.AdminPages['<page>'].init = init;
   ```

3. **init 함수는 페이지별 기능만 초기화**
   ```javascript
   async function init() {
     // 관리자 권한 확인은 admin-layout.js에서 처리됨
     // 여기서는 페이지별 기능만 초기화
     
     setupEventListeners();
     await loadData();
   }
   ```

#### ❌ 금지 사항

1. **`DOMContentLoaded` 직접 바인딩 금지**
   ```javascript
   // ❌ 금지
   document.addEventListener('DOMContentLoaded', init);
   
   // ✅ 올바른 방법: window.AdminPages에 노출만 하고, HTML inline에서 호출
   ```

2. **전역 실행 코드 금지**
   ```javascript
   // ❌ 금지
   fetch('/api/data').then(...);  // 파일 로드 시 즉시 실행
   
   // ✅ 올바른 방법: init 함수 내부에서만 실행
   async function init() {
     await fetch('/api/data');
   }
   ```

3. **`window.init` 직접 사용 금지** (충돌 위험)
   ```javascript
   // ❌ 금지
   window.init = init;
   
   // ✅ 올바른 방법: 네임스페이스 패턴
   window.AdminPages['<page>'].init = init;
   ```

### 3. 권한 체크 흐름

```
1. HTML 로드
   ↓
2. admin-layout.js 로드 (initAdminLayout 정의)
   ↓
3. admin-<page>.js 로드 (init 정의 + window.AdminPages['<page>'].init에 노출)
   ↓
4. DOMContentLoaded 이벤트 발생
   ↓
5. await initAdminLayout('<page>') 실행
   ├─ checkAdminAccess() 호출
   ├─ 권한 없음 → login.html로 리다이렉트, return false
   └─ 권한 있음 → 헤더 렌더링, return true
   ↓
6. initAdminLayout 성공 시에만 window.AdminPages['<page>'].init() 호출
```

---

## 📝 표준 템플릿

### 새 관리자 페이지 추가 시 복붙용

#### 1. HTML 파일 (`admin-<page>.html`)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title><페이지명> | Pre.pMood Admin</title>
  <link rel="stylesheet" href="../assets/css/global.css">
  <link rel="stylesheet" href="admin.css">
</head>
<body>
  <!-- 관리자 헤더는 admin-layout.js에서 동적 생성됨 -->

  <!-- 메인 컨텐츠 -->
  <main class="admin-main">
    <div class="admin-container">
      <!-- 페이지별 컨텐츠 -->
    </div>
  </main>

  <!-- 공통 레이아웃 스크립트 -->
  <script src="admin-layout.js"></script>
  <!-- 페이지별 스크립트 -->
  <script src="admin-<page>.js"></script>
  <script>
    // 공통 레이아웃 초기화 (권한 체크 + 헤더 렌더링)
    document.addEventListener('DOMContentLoaded', async () => {
      const ok = await initAdminLayout('<page>');
      if (!ok) return;
      
      // 네임스페이스 패턴으로 페이지별 init 호출
      const fn = window.AdminPages?.['<page>']?.init;
      if (typeof fn === 'function') fn();
    });
  </script>
</body>
</html>
```

#### 2. JS 파일 (`admin-<page>.js`)

```javascript
// admin-<page>.js - <페이지명> 스크립트

(function() {
  'use strict';

  // API 설정
  const API_BASE = (window.API_BASE) 
    ? window.API_BASE 
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  // ============================================
  // 초기화
  // ============================================
  async function init() {
    // 관리자 권한 확인은 admin-layout.js에서 처리됨
    // 여기서는 페이지별 기능만 초기화

    setupEventListeners();
    await loadData();
  }

  // ============================================
  // 이벤트 리스너 설정
  // ============================================
  function setupEventListeners() {
    // 페이지별 이벤트 바인딩
  }

  // ============================================
  // 데이터 로드
  // ============================================
  async function loadData() {
    // 페이지별 데이터 로드
  }

  // ============================================
  // 페이지 로드 시 초기화
  // ============================================
  // init은 admin-layout.js의 inline 스크립트에서 호출됨
  // 네임스페이스 패턴으로 전역 충돌 방지
  window.AdminPages = window.AdminPages || {};
  window.AdminPages['<page>'] = window.AdminPages['<page>'] || {};
  window.AdminPages['<page>'].init = init;

})();
```

---

## 🔍 검증 체크리스트

새 페이지 추가 후 다음을 확인하세요:

- [ ] HTML 하단 스크립트 순서: `admin-layout.js` → `admin-<page>.js` → inline 스크립트
- [ ] JS 파일이 IIFE로 감싸져 있음
- [ ] JS 파일 마지막에 `window.AdminPages['<page>'].init = init;` 존재
- [ ] JS 파일에 `document.addEventListener('DOMContentLoaded', ...)` 없음
- [ ] HTML inline에서 `window.AdminPages?.['<page>']?.init` 호출
- [ ] 권한 없는 상태에서 접근 시 `login.html`로 리다이렉트됨
- [ ] 권한 있는 상태에서 접근 시 헤더 렌더링 + 페이지 기능 정상 작동

---

## 📚 참고

- **Phase 0 정책**: 로깅 정책, 토큰 마스킹 등은 `backend/CORE_POLICIES.md` 참고
- **공통 레이아웃**: `admin-layout.js`는 모든 관리자 페이지에서 공통으로 사용
- **네비게이션 메뉴**: `admin-layout.js`의 `NAV_MENU` 배열에 새 페이지 추가 필요

---

## 🚨 주의사항

1. **전역 변수 충돌**: `window.init` 대신 반드시 `window.AdminPages['<page>'].init` 사용
2. **중복 실행 방지**: JS 파일 내부에서 `DOMContentLoaded` 바인딩 금지
3. **권한 체크 누락 방지**: 모든 페이지에서 `initAdminLayout()` 호출 필수

