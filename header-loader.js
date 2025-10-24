window.addEventListener('DOMContentLoaded', () => {
  const headerContainer = document.getElementById('header-container');
  
  if (!headerContainer) {
    console.warn('header-container 요소를 찾을 수 없습니다.');
    return;
  }

  fetch('header.partial')
    .then(res => res.text())
    .then(html => {
      headerContainer.innerHTML = html;

      // sync CSS var with actual header height (init + on resize)
      const headerEl = headerContainer.querySelector('header');
      function updateHeaderHeight(){
        if (!headerEl) return;
        const h = headerEl.offsetHeight;
        document.documentElement.style.setProperty('--header-height', h + 'px');
      }
      updateHeaderHeight();
      window.addEventListener('resize', updateHeaderHeight);

      // 드롭다운 시스템 초기화
      const megaItems = headerContainer.querySelectorAll('.has-mega');
      let currentOpenMenu = null;
      let closeTimer = null;

      // 드롭다운 닫기 함수
      const closeAllDropdowns = () => {
        megaItems.forEach(item => {
          const menu = item.querySelector('.mega-menu');
          if (menu) {
            menu.classList.remove('show');
          }
        });
        currentOpenMenu = null;
      };

      // 각 .has-mega에 이벤트 바인딩
      megaItems.forEach((item, index) => {
        const menu = item.querySelector('.mega-menu');
        const link = item.querySelector('a');
        
        console.log(`Setting up menu item ${index}:`, link ? link.textContent : 'No link found');

        // mouseenter 이벤트
        item.addEventListener('mouseenter', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          clearTimeout(closeTimer); // 기존 타이머 취소
          
          // 다른 메뉴 닫기
          closeAllDropdowns();
          
          // 현재 메뉴 열기
          if (menu) {
            menu.classList.add('show');
            currentOpenMenu = item;
          }
        });

        // mouseleave 이벤트
        item.addEventListener('mouseleave', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          closeTimer = setTimeout(() => {
            if (menu) {
              menu.classList.remove('show');
            }
            if (currentOpenMenu === item) {
              currentOpenMenu = null;
            }
          }, 150); // 150ms 지연으로 안정성 향상
        });

        // 링크에도 동일한 이벤트 추가
        if (link) {
          link.addEventListener('mouseenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            clearTimeout(closeTimer);
            closeAllDropdowns();
            
            if (menu) {
              menu.classList.add('show');
              currentOpenMenu = item;
            }
          });

          link.addEventListener('mouseleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            closeTimer = setTimeout(() => {
              if (menu) {
                menu.classList.remove('show');
              }
              if (currentOpenMenu === item) {
                currentOpenMenu = null;
              }
            }, 150);
          });
        }

        // 드롭다운 자체에도 이벤트 추가 (유지용)
        if (menu) {
          menu.addEventListener('mouseenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            clearTimeout(closeTimer);
          });

          menu.addEventListener('mouseleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            closeTimer = setTimeout(() => {
              menu.classList.remove('show');
              if (currentOpenMenu === item) {
                currentOpenMenu = null;
              }
            }, 150);
          });
        }
      });

      console.log('Dropdown system initialized with', megaItems.length, 'menu items');

      // 검색 기능 초기화
      const searchModal = document.getElementById('search-modal');
      const searchToggle = document.getElementById('search-toggle');
      const searchClose = document.getElementById('search-close');
      const searchInput = document.getElementById('search-input');
      const searchBtn = document.getElementById('search-btn');
      const searchResults = document.getElementById('search-results');
      const categoryFilter = document.getElementById('category-filter');
      const priceFilter = document.getElementById('price-filter');

      if (searchModal && searchToggle) {
        // 검색 모달 열기
        searchToggle.addEventListener('click', function(e) {
          e.preventDefault();
          searchModal.style.display = 'block';
          if (searchInput) searchInput.focus();
        });

        // 검색 모달 닫기
        if (searchClose) {
          searchClose.addEventListener('click', function() {
            searchModal.style.display = 'none';
          });
        }

        // 모달 외부 클릭 시 닫기
        window.addEventListener('click', function(e) {
          if (e.target === searchModal) {
            searchModal.style.display = 'none';
          }
        });

        // 검색 실행 함수
        function performSearch() {
          const query = searchInput ? searchInput.value.trim() : '';

          if (!query) {
            if (searchResults) {
              searchResults.innerHTML = '<p class="no-results">검색어를 입력해주세요.</p>';
            }
            return;
          }

          // 검색 결과 페이지로 이동
          const searchUrl = `search.html?q=${encodeURIComponent(query)}`;
          window.location.href = searchUrl;
        }

        // 검색 모달은 이제 검색 결과 페이지로 리다이렉트만 합니다

        // 검색 버튼 클릭
        if (searchBtn) {
          searchBtn.addEventListener('click', performSearch);
        }

        // 엔터키로 검색
        if (searchInput) {
          searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              performSearch();
            }
          });
        }

        // 필터 변경 시 자동 검색
        if (categoryFilter) {
          categoryFilter.addEventListener('change', performSearch);
        }
        if (priceFilter) {
          priceFilter.addEventListener('change', performSearch);
        }

        console.log('검색 기능이 초기화되었습니다.');
      } else {
        console.log('검색 요소를 찾을 수 없습니다.');
      }

      // 마이페이지 기능 초기화
      initializeMypageFunctionality();
    })
    .catch(err => {
      console.error('헤더 로딩 실패:', err);
    });
});

// 마이페이지 기능 초기화
function initializeMypageFunctionality() {
  const mypageToggle = document.getElementById('mypage-toggle');
  const mypageDropdown = document.getElementById('mypage-dropdown');
  const mypageIcon = document.getElementById('mypage-icon');
  const logoutBtn = document.getElementById('logout-btn');

  if (!mypageToggle || !mypageDropdown || !mypageIcon) {
    console.log('마이페이지 요소를 찾을 수 없습니다.');
    return;
  }

  // ✅ localStorage 사용하지 않음 (JWT 기반 인증으로 변경됨)

  // 로그인 상태 확인 (JWT 기반)
  async function checkLoginStatus() {
    try {
      // ✅ 항상 프로덕션 API 사용 (로컬 개발 시에도)
      const API_BASE_URL = 'https://prepmood.kr/api';
      
      // ✅ 서버에 인증 상태 확인 요청 (JWT 토큰 자동 전송)
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include'  // httpOnly 쿠키 포함
      });
      
      const data = await response.json();
      
      if (data.success && data.user) {
        // 로그인 상태: 드롭다운 메뉴 표시, 아이콘 변경
        mypageToggle.href = '#';
        mypageIcon.src = 'image/loginmypage.jpg';
        mypageIcon.classList.add('mypage-icon-logged-in');
        
        // JWT 기반 - sessionStorage 불필요
        
        console.log('✅ 로그인 상태:', data.user.email);
      } else {
        // 비로그인 상태
        setLoggedOutState();
      }
    } catch (error) {
      // 인증 실패 또는 네트워크 오류
      console.log('⚠️ 인증 확인 실패:', error.message);
      setLoggedOutState();
    }
  }
  
  function setLoggedOutState() {
    mypageToggle.href = 'login.html';
    mypageIcon.src = 'image/mypage.jpg';
    mypageIcon.classList.remove('mypage-icon-logged-in');
    // JWT 기반 - sessionStorage 불필요
    console.log('❌ 비로그인 상태');
  }

  // 드롭다운 토글
  function toggleDropdown() {
    // 로그인 상태인지 확인 (mypage 아이콘 클래스로 판단)
    if (mypageIcon.classList.contains('mypage-icon-logged-in')) {
      mypageDropdown.classList.toggle('show');
    }
  }

  // 드롭다운 외부 클릭 시 닫기
  function closeDropdown() {
    mypageDropdown.classList.remove('show');
  }

  // 로그아웃 기능
  async function handleLogout() {
    try {
      // ✅ 항상 프로덕션 API 사용 (로컬 개발 시에도)
      const API_BASE_URL = 'https://prepmood.kr/api';
      
      // ✅ 서버에 로그아웃 요청 (JWT 쿠키 삭제)
      await fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include'  // httpOnly 쿠키 포함
      });
      
      // JWT 기반 - sessionStorage 불필요
      
      console.log('✅ 로그아웃 완료');
      
      // 페이지 새로고침하여 상태 업데이트
      window.location.reload();
    } catch (error) {
      console.error('로그아웃 오류:', error);
      // JWT 기반 - sessionStorage 불필요
      window.location.reload();
    }
  }

  // 이벤트 리스너 등록
  mypageToggle.addEventListener('click', function(e) {
    // ✅ JWT 기반: mypage 아이콘 클래스로 로그인 상태 확인
    const isLoggedIn = mypageIcon.classList.contains('mypage-icon-logged-in');
    
    if (isLoggedIn) {
      e.preventDefault();
      toggleDropdown();
    }
    // 비로그인 상태에서는 기본 링크 동작 (login.html로 이동)
  });

  // 드롭다운 메뉴 아이템 클릭 처리
  const dropdownItems = mypageDropdown.querySelectorAll('.dropdown-item');
  dropdownItems.forEach(item => {
    item.addEventListener('click', function(e) {
      // 로그아웃 버튼이 아닌 경우에만 드롭다운 닫기
      if (this.id !== 'logout-btn') {
        closeDropdown();
      }
    });
  });

  // 로그아웃 버튼 클릭
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirm('로그아웃 하시겠습니까?')) {
        handleLogout();
      }
    });
  }

  // 드롭다운 외부 클릭 시 닫기
  document.addEventListener('click', function(e) {
    if (!mypageToggle.contains(e.target) && !mypageDropdown.contains(e.target)) {
      closeDropdown();
    }
  });

  // ESC 키로 드롭다운 닫기
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  // 초기 상태 설정
  checkLoginStatus();

  // ✅ JWT 기반에서는 localStorage 감지 불필요 (서버 쿠키 기반)

  console.log('마이페이지 기능이 초기화되었습니다.');

  // 미니 카트 스크립트 동적 로드 (간단한 방법)
  console.log('🛒 미니 카트 로딩 시작...');
  console.log('현재 상태:', {
    hasCatalogData: !!window.CATALOG_DATA,
    hasMiniCart: !!window.miniCart
  });
  
  // 중복 로드 방지 (더 유연하게)
  if (window.scriptsLoading && window.CATALOG_DATA && window.miniCart) {
    console.log('✅ 스크립트가 이미 로드되었습니다.');
    return;
  }
  
  if (!window.CATALOG_DATA) {
    console.log('📦 catalog-data.js 로딩 중...');
    const catalogScript = document.createElement('script');
    catalogScript.src = 'catalog-data.js';
    catalogScript.defer = true;
    catalogScript.onload = () => console.log('✅ catalog-data.js 로드 완료');
    catalogScript.onerror = () => console.error('❌ catalog-data.js 로드 실패');
    document.head.appendChild(catalogScript);
  }
  
  if (!window.miniCart) {
    console.log('🛒 mini-cart.js 로딩 중...');
    const miniCartScript = document.createElement('script');
    miniCartScript.src = 'mini-cart.js';
    miniCartScript.defer = true;
    miniCartScript.onload = () => {
      console.log('✅ mini-cart.js 로드 완료');
      // 미니 카트 초기화 확인
      setTimeout(() => {
        if (window.miniCart) {
          console.log('✅ 미니 카트 초기화 완료');
        }
      }, 100);
    };
    miniCartScript.onerror = () => {
      console.error('❌ mini-cart.js 로드 실패');
    };
    document.head.appendChild(miniCartScript);
  } else {
    console.log('✅ mini-cart가 이미 로드되어 있습니다.');
    window.scriptsLoading = false;
  }
}