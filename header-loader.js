const ADMIN_LINK_ID = 'admin-nav-link';

function getAdminLinkContainer() {
  return document.querySelector('#header-container .header-actions');
}

function renderAdminLink() {
  var container = getAdminLinkContainer();
  if (!container) return;
  if (container.querySelector('#' + ADMIN_LINK_ID)) return;

  var link = document.createElement('a');
  link.id = ADMIN_LINK_ID;
  link.href = '/admin-qhf25za8/orders.html';
  link.textContent = '관리자';
  link.className = 'action-link';
  container.appendChild(link);
}

function removeAdminLink() {
  var link = document.querySelector('#' + ADMIN_LINK_ID);
  if (link && link.parentNode) {
    link.parentNode.removeChild(link);
  }
}

function checkAdminAccess() {
  fetch('/api/admin/check', { credentials: 'include' })
    .then(function(res) {
      if (!res.ok) {
        throw new Error('NOT_ADMIN');
      }
      return res.json();
    })
    .then(function(data) {
      if (data && data.admin) {
        renderAdminLink();
      } else {
        removeAdminLink();
      }
    })
    .catch(function() {
      removeAdminLink();
    });
}

window.addEventListener('DOMContentLoaded', () => {
  const headerContainer = document.getElementById('header-container');
  
  if (!headerContainer) {
    console.warn('header-container ?�소�?찾을 ???�습?�다.');
    return;
  }

  fetch('header.partial')
    .then(res => res.text())
    .then(html => {
      headerContainer.innerHTML = html;
      checkAdminAccess();

      // ?�더 로드 ??미니 카트 ?�벤???�바?�딩 (?�?�밍 ?�슈 ?�결)
      setTimeout(() => {
        if (window.miniCart && typeof window.miniCart.bindEvents === 'function') {
          const cartToggle = document.getElementById('cart-toggle');
          if (cartToggle && !cartToggle.hasAttribute('data-bind-attempted')) {
            console.log('?�� ?�더 로드 ?�료 - 미니 카트 ?�벤???�바?�딩');
            window.miniCart.bindEvents();
            cartToggle.setAttribute('data-bind-attempted', 'true');
          }
        }
      }, 100);

      // sync CSS var with actual header height (init + on resize)
      const headerEl = headerContainer.querySelector('header');
      function updateHeaderHeight(){
        if (!headerEl) return;
        const h = headerEl.offsetHeight;
        document.documentElement.style.setProperty('--header-height', h + 'px');
      }
      updateHeaderHeight();
      window.addEventListener('resize', updateHeaderHeight);

      // ?�롭?�운 ?�스??초기??      const megaItems = headerContainer.querySelectorAll('.has-mega');
      let currentOpenMenu = null;
      let closeTimer = null;

      // ?�롭?�운 ?�기 ?�수
      const closeAllDropdowns = () => {
        megaItems.forEach(item => {
          const menu = item.querySelector('.mega-menu');
          if (menu) {
            menu.classList.remove('show');
          }
        });
        currentOpenMenu = null;
      };

      // �?.has-mega???�벤??바인??      megaItems.forEach((item, index) => {
        const menu = item.querySelector('.mega-menu');
        const link = item.querySelector('a');
        
        Logger.log(`Setting up menu item ${index}:`, link ? link.textContent : 'No link found');

        // mouseenter ?�벤??        item.addEventListener('mouseenter', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          clearTimeout(closeTimer); // 기존 ?�?�머 취소
          
          // ?�른 메뉴 ?�기
          closeAllDropdowns();
          
          // ?�재 메뉴 ?�기
          if (menu) {
            menu.classList.add('show');
            currentOpenMenu = item;
          }
        });

        // mouseleave ?�벤??        item.addEventListener('mouseleave', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          closeTimer = setTimeout(() => {
            if (menu) {
              menu.classList.remove('show');
            }
            if (currentOpenMenu === item) {
              currentOpenMenu = null;
            }
          }, 150); // 150ms 지?�으�??�정???�상
        });

        // 링크?�도 ?�일???�벤??추�?
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

        // ?�롭?�운 ?�체?�도 ?�벤??추�? (?��???
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

      Logger.log('Dropdown system initialized with', megaItems.length, 'menu items');

      // 검??기능 초기??      const searchModal = document.getElementById('search-modal');
      const searchToggle = document.getElementById('search-toggle');
      const searchClose = document.getElementById('search-close');
      const searchInput = document.getElementById('search-input');
      const searchBtn = document.getElementById('search-btn');
      const searchResults = document.getElementById('search-results');
      const categoryFilter = document.getElementById('category-filter');
      const priceFilter = document.getElementById('price-filter');

      if (searchModal && searchToggle) {
        // 검??모달 ?�기
        searchToggle.addEventListener('click', function(e) {
          e.preventDefault();
          searchModal.style.display = 'block';
          if (searchInput) searchInput.focus();
        });

        // 검??모달 ?�기
        if (searchClose) {
          searchClose.addEventListener('click', function() {
            searchModal.style.display = 'none';
          });
        }

        // 모달 ?��? ?�릭 ???�기
        window.addEventListener('click', function(e) {
          if (e.target === searchModal) {
            searchModal.style.display = 'none';
          }
        });

        // 검???�행 ?�수
        function performSearch() {
          const query = searchInput ? searchInput.value.trim() : '';

          if (!query) {
            if (searchResults) {
              searchResults.innerHTML = '<p class="no-results">검?�어�??�력?�주?�요.</p>';
            }
            return;
          }

          // 검??결과 ?�이지�??�동
          const searchUrl = `search.html?q=${encodeURIComponent(query)}`;
          window.location.href = searchUrl;
        }

        // 검??모달?�??�제 검??결과 ?�이지�?리다?�렉?�만 ?�니??
        // 검??버튼 ?�릭
        if (searchBtn) {
          searchBtn.addEventListener('click', performSearch);
        }

        // ?�터?�로 검??        if (searchInput) {
          searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              performSearch();
            }
          });
        }

        // ?�터 변�????�동 검??        if (categoryFilter) {
          categoryFilter.addEventListener('change', performSearch);
        }
        if (priceFilter) {
          priceFilter.addEventListener('change', performSearch);
        }

        Logger.log('검??기능??초기?�되?�습?�다.');
      } else {
        Logger.log('검???�소�?찾을 ???�습?�다.');
      }

      // 마이?�이지 기능 초기??      initializeMypageFunctionality();
    })
    .catch(err => {
      console.error('?�더 로딩 ?�패:', err);
    });
});

// 마이?�이지 기능 초기??function initializeMypageFunctionality() {
  const mypageToggle = document.getElementById('mypage-toggle');
  const mypageDropdown = document.getElementById('mypage-dropdown');
  const mypageIcon = document.getElementById('mypage-icon');
  const logoutBtn = document.getElementById('logout-btn');

  if (!mypageToggle || !mypageDropdown || !mypageIcon) {
    Logger.log('마이?�이지 ?�소�?찾을 ???�습?�다.');
    return;
  }

  // ??localStorage ?�용?��? ?�음 (JWT 기반 ?�증?�로 변경됨)

  // 로그???�태 ?�인 (JWT 기반)
  async function checkLoginStatus() {
    try {
      // ?�로?�션 API URL ?�용
      const API_BASE_URL = 'https://prepmood.kr/api';
      
      // ???�버???�증 ?�태 ?�인 ?�청 (JWT ?�큰 ?�동 ?�송)
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include'  // httpOnly 쿠키 ?�함
      });
      
      // 401 ?�류??경우 로그?�하지 ?��? 것으�?처리 (?�상?�인 ?�작)
      if (response.status === 401) {
        // 로그?�하지 ?��? ?�태�?처리
        mypageToggle.href = 'login.html';
        mypageIcon.src = 'image/mypage.jpg';
        mypageIcon.classList.remove('mypage-icon-logged-in');
        
        // 비로그인 ?�태?????�바구니 ?�기�?        if (window.miniCart) {
          window.miniCart.hideCartForLogout();
          console.log('?�� 비로그인 ?�태 - ?�바구니 ?��?');
        }
        
        // console.log('??비로그인 ?�태'); // ?�상?�인 ?�작?��?�?로그 ?�거
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.user) {
        // 로그???�태: ?�롭?�운 메뉴 ?�시, ?�이�?변�?        mypageToggle.href = '#';
        mypageIcon.src = 'image/loginmypage.jpg';
        mypageIcon.classList.add('mypage-icon-logged-in');
        
        // JWT 기반 - sessionStorage 불필??        
        // 로그???�태?????�바구니 복원
        if (window.miniCart) {
          window.miniCart.restoreCartForLogin();
          Logger.log('?�� 로그???�태 - ?�바구니 복원');
        }
        
        checkAdminAccess();
        Logger.log('??로그???�태:', data.user.email);
      } else {
        // 비로그인 ?�태
        setLoggedOutState();
      }
    } catch (error) {
      // ?�증 ?�패 ?�는 ?�트?�크 ?�류
      if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
        Logger.log('?�️ Rate Limiting 감�? - 로그???�태 ?�인 불�?');
        // Rate Limiting??경우 기본?�으�?로그?�웃 ?�태�?처리
        setLoggedOutState();
      } else {
        Logger.log('?�️ ?�증 ?�인 ?�패:', error.message);
        setLoggedOutState();
      }
    }
  }
  
  function setLoggedOutState() {
    removeAdminLink();
    mypageToggle.href = 'login.html';
    mypageIcon.src = 'image/mypage.jpg';
    mypageIcon.classList.remove('mypage-icon-logged-in');
    // JWT 기반 - sessionStorage 불필??    
    // 비로그인 ?�태?????�바구니 ?�기�?(?�이?�는 보존)
    if (window.miniCart) {
      window.miniCart.hideCartForLogout();
      console.log('?�� 비로그인 ?�태 - ?�바구니 ?��?');
    }
    
    console.log('??비로그인 ?�태');
  }

  // ?�롭?�운 ?��?
  function toggleDropdown() {
    // 로그???�태?��? ?�인 (mypage ?�이�??�래?�로 ?�단)
    if (mypageIcon.classList.contains('mypage-icon-logged-in')) {
      mypageDropdown.classList.toggle('show');
    }
  }

  // ?�롭?�운 ?��? ?�릭 ???�기
  function closeDropdown() {
    mypageDropdown.classList.remove('show');
  }

  // 로그?�웃 기능
  async function handleLogout() {
    try {
      // ?�로?�션 API URL ?�용
      const API_BASE_URL = 'https://prepmood.kr/api';
      
      // ???�버??로그?�웃 ?�청 (JWT 쿠키 ??��)
      await fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include'  // httpOnly 쿠키 ?�함
      });
      
      // JWT 기반 - sessionStorage 불필??      
      console.log('??로그?�웃 ?�료');
      
      // 로그?�웃 ???�바구니 ?�기�?(?�이?�는 보존)
      if (window.miniCart) {
        window.miniCart.hideCartForLogout();
        console.log('?�� 로그?�웃 ???�바구니 ?��?');
      }
      
      // 로그?�웃 ??리디?�션 처리
      const currentPage = window.location.pathname;
      const loginRequiredPages = ['/my-orders.html', '/my-profile.html', '/my-reservations.html', '/complete-profile.html'];
      
      if (loginRequiredPages.includes(currentPage)) {
        // 로그???�요 ?�이지?�서 로그?�웃 ??메인?�로 ?�동
        window.location.href = 'index.html';
      } else {
        // ?�른 ?�이지?�서???�로고침
        window.location.reload();
      }
    } catch (error) {
      console.error('로그?�웃 ?�류:', error);
      // JWT 기반 - sessionStorage 불필??      window.location.reload();
    }
  }

  // ?�벤??리스???�록
  mypageToggle.addEventListener('click', function(e) {
    // ??JWT 기반: mypage ?�이�??�래?�로 로그???�태 ?�인
    const isLoggedIn = mypageIcon.classList.contains('mypage-icon-logged-in');
    
    if (isLoggedIn) {
      e.preventDefault();
      toggleDropdown();
    }
    // 비로그인 ?�태?�서??기본 링크 ?�작 (login.html�??�동)
  });

  // ?�롭?�운 메뉴 ?�이???�릭 처리
  const dropdownItems = mypageDropdown.querySelectorAll('.dropdown-item');
  dropdownItems.forEach(item => {
    item.addEventListener('click', function(e) {
      // 로그?�웃 버튼???�닌 경우?�만 ?�롭?�운 ?�기
      if (this.id !== 'logout-btn') {
        closeDropdown();
      }
    });
  });

  // 로그?�웃 버튼 ?�릭
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirm('로그?�웃 ?�시겠습?�까?')) {
        handleLogout();
      }
    });
  }

  // ?�롭?�운 ?��? ?�릭 ???�기
  document.addEventListener('click', function(e) {
    if (!mypageToggle.contains(e.target) && !mypageDropdown.contains(e.target)) {
      closeDropdown();
    }
  });

  // ESC ?�로 ?�롭?�운 ?�기
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  // 초기 ?�태 ?�정
  checkLoginStatus();

  // ??JWT 기반?�서??localStorage 감�? 불필??(?�버 쿠키 기반)

  console.log('마이?�이지 기능??초기?�되?�습?�다.');

  // 미니 카트 ?�크립트 ?�적 로드 (간단??방법)
  console.log('?�� 미니 카트 로딩 ?�작...');
  console.log('?�재 ?�태:', {
    hasCatalogData: !!window.CATALOG_DATA,
    hasMiniCart: !!window.miniCart
  });
  
  // 중복 로드 방�? (???�연?�게)
  if (window.scriptsLoading && window.CATALOG_DATA && window.miniCart) {
    console.log('???�크립트가 ?��? 로드?�었?�니??');
    return;
  }
  
  if (!window.CATALOG_DATA) {
    console.log('?�� catalog-data.js 로딩 �?..');
    const catalogScript = document.createElement('script');
    catalogScript.src = 'catalog-data.js';
    catalogScript.defer = true;
    catalogScript.onload = () => console.log('??catalog-data.js 로드 ?�료');
    catalogScript.onerror = () => console.error('??catalog-data.js 로드 ?�패');
    document.head.appendChild(catalogScript);
  }
  
  if (!window.miniCart) {
    console.log('?�� mini-cart.js 로딩 �?..');
    const miniCartScript = document.createElement('script');
    miniCartScript.src = 'mini-cart.js';
    miniCartScript.defer = true;
    miniCartScript.onload = () => {
      console.log('??mini-cart.js 로드 ?�료');
      // 미니 카트 초기???�인
      setTimeout(() => {
        if (window.miniCart) {
          console.log('??미니 카트 초기???�료');
        }
      }, 100);
    };
    miniCartScript.onerror = () => {
      console.error('??mini-cart.js 로드 ?�패');
    };
    document.head.appendChild(miniCartScript);
  } else {
    console.log('??mini-cart가 ?��? 로드?�어 ?�습?�다.');
    window.scriptsLoading = false;
  }
}
