window.addEventListener('DOMContentLoaded', () => {
  const headerContainer = document.getElementById('header-container');

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
        console.log('All dropdowns closed');
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
          console.log('Mouse enter on item:', link ? link.textContent : 'Unknown');
          
          // 다른 메뉴 닫기
          closeAllDropdowns();
          
          // 현재 메뉴 열기
          if (menu) {
            menu.classList.add('show');
            currentOpenMenu = item;
            console.log('Dropdown opened:', link ? link.textContent : 'Unknown');
          }
        });

        // mouseleave 이벤트
        item.addEventListener('mouseleave', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('Mouse leave on item:', link ? link.textContent : 'Unknown');
          
          closeTimer = setTimeout(() => {
            if (menu) {
              menu.classList.remove('show');
              console.log('Dropdown closed:', link ? link.textContent : 'Unknown');
            }
            if (currentOpenMenu === item) {
              currentOpenMenu = null;
            }
          }, 200);
        });

        // 링크에도 동일한 이벤트 추가
        if (link) {
          link.addEventListener('mouseenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            clearTimeout(closeTimer);
            console.log('Mouse enter on link:', link.textContent);
            
            closeAllDropdowns();
            
            if (menu) {
              menu.classList.add('show');
              currentOpenMenu = item;
              console.log('Dropdown opened via link:', link.textContent);
            }
          });

          link.addEventListener('mouseleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Mouse leave on link:', link.textContent);
            
            closeTimer = setTimeout(() => {
              if (menu) {
                menu.classList.remove('show');
                console.log('Dropdown closed via link:', link.textContent);
              }
              if (currentOpenMenu === item) {
                currentOpenMenu = null;
              }
            }, 200);
          });
        }

        // 드롭다운 자체에도 이벤트 추가 (유지용)
        if (menu) {
          menu.addEventListener('mouseenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            clearTimeout(closeTimer);
            console.log('Mouse enter on dropdown:', link ? link.textContent : 'Unknown');
          });

          menu.addEventListener('mouseleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Mouse leave on dropdown:', link ? link.textContent : 'Unknown');
            
            closeTimer = setTimeout(() => {
              menu.classList.remove('show');
              console.log('Dropdown closed via dropdown area:', link ? link.textContent : 'Unknown');
              if (currentOpenMenu === item) {
                currentOpenMenu = null;
              }
            }, 200);
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

  // 로그인 상태 확인
  function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const userData = localStorage.getItem('user');
    
    if (isLoggedIn && userData) {
      // 로그인 상태: 드롭다운 메뉴 표시, 아이콘 변경
      mypageToggle.href = '#';
      mypageIcon.src = 'image/loginmypage.jpg';
      mypageIcon.classList.add('mypage-icon-logged-in');
      console.log('로그인 상태 감지됨');
    } else {
      // 비로그인 상태: 로그인 페이지로 이동, 기본 아이콘
      mypageToggle.href = 'login.html';
      mypageIcon.src = 'image/mypage.jpg';
      mypageIcon.classList.remove('mypage-icon-logged-in');
      console.log('비로그인 상태 감지됨');
    }
  }

  // 드롭다운 토글
  function toggleDropdown() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    
    if (isLoggedIn) {
      mypageDropdown.classList.toggle('show');
    }
  }

  // 드롭다운 외부 클릭 시 닫기
  function closeDropdown() {
    mypageDropdown.classList.remove('show');
  }

  // 로그아웃 기능
  function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    
    // 페이지 새로고침하여 상태 업데이트
    window.location.reload();
  }

  // 이벤트 리스너 등록
  mypageToggle.addEventListener('click', function(e) {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    
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

  // 로그인 상태 변경 감지 (다른 탭에서 로그인/로그아웃 시)
  window.addEventListener('storage', function(e) {
    if (e.key === 'isLoggedIn' || e.key === 'user') {
      checkLoginStatus();
      closeDropdown();
    }
  });

  console.log('마이페이지 기능이 초기화되었습니다.');
}