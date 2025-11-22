// 중복 로드 방지
if (window.__HEADER_LOADER_INITIALIZED__) {
  console.warn('header-loader.js: 이미 초기화되었습니다. 중복 로드를 건너뜁니다.');
} else {
  window.__HEADER_LOADER_INITIALIZED__ = true;

const ADMIN_LINK_ID = 'admin-nav-link';
const HEADER_PARTIAL_URL = (function() {
  const origin = window.location.origin;
  if (origin && origin !== 'null') {
    return origin.replace(/\/$/, '') + '/header.partial';
  }
  return 'header.partial';
})();

const debugLog = (...args) => {
  if (window.Logger && window.Logger.isDevelopment) {
    window.Logger.log(...args);
  }
};

function getAdminLinkContainer() {
  return document.querySelector('#header-container .header-actions');
}

function renderAdminLink() {
  var container = getAdminLinkContainer();
  if (!container) return;
  if (container.querySelector('#' + ADMIN_LINK_ID)) return;

  var link = document.createElement('a');
  link.id = ADMIN_LINK_ID;
  const adminPath = window.ADMIN_PATH || '/admin-qhf25za8';
  link.href = `${adminPath}/orders.html`;
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
  fetch('/api/admin/status', { credentials: 'include' })
    .then(function(res) {
      if (!res.ok) {
        return { success: false, admin: false };
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
    console.warn('header-loader: #header-container element not found.');
    return;
  }

  fetch(HEADER_PARTIAL_URL)
    .then(res => res.text())
    .then(html => {
      headerContainer.innerHTML = html;

      // After the header loads, bind mini-cart events (timing safeguard)
      setTimeout(() => {
        if (window.miniCart && typeof window.miniCart.bindEvents === 'function') {
          const cartToggle = document.getElementById('cart-toggle');
          if (cartToggle && !cartToggle.hasAttribute('data-bind-attempted')) {
            debugLog('header-loader: header loaded, binding mini-cart events');
            window.miniCart.bindEvents();
            cartToggle.setAttribute('data-bind-attempted', 'true');
          }
        }
      }, 100);

      // 헤더 스크롤 동작 초기화 (프라다 스타일)
      setTimeout(() => {
        if (window.initHeaderScroll && typeof window.initHeaderScroll === 'function') {
          debugLog('header-loader: initializing header scroll behavior');
          window.initHeaderScroll();
        }
      }, 100);

      // 모바일 햄버거 메뉴 초기화
      initMobileMenu();

      // sync CSS var with actual header height (init + on resize)
      const headerEl = headerContainer.querySelector('header');
      function updateHeaderHeight(){
        if (!headerEl) return;
        const h = headerEl.offsetHeight;
        document.documentElement.style.setProperty('--header-height', h + 'px');
      }
      updateHeaderHeight();
      window.addEventListener('resize', updateHeaderHeight);

      // 드롭다운 메뉴 목록 초기화
      const megaItems = headerContainer.querySelectorAll('.has-mega');
      let currentOpenMenu = null;
      let closeTimer = null;

      // Close any open dropdown menu
      const closeAllDropdowns = () => {
        megaItems.forEach(item => {
          const menu = item.querySelector('.mega-menu');
          if (menu) {
            menu.classList.remove('show');
          }
        });
        currentOpenMenu = null;
      };

      // Attach events to each mega menu item
      megaItems.forEach((item, index) => {
        const menu = item.querySelector('.mega-menu');
        const link = item.querySelector('a');
        
        debugLog(`Setting up menu item ${index}:`, link ? link.textContent : 'No link found');

        item.addEventListener('mouseenter', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          clearTimeout(closeTimer);
          
          // Close every other menu
          closeAllDropdowns();
          
          // Open the current menu
          if (menu) {
            menu.classList.add('show');
            currentOpenMenu = item;
          }
        });

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
          }, 150);
        });

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

      debugLog('Dropdown system initialized with', megaItems.length, 'menu items');

      // Search modal elements
      const searchModal = document.getElementById('search-modal');
      const searchToggle = document.getElementById('search-toggle');
      const searchClose = document.getElementById('search-close');
      const searchInput = document.getElementById('search-input');
      const searchBtn = document.getElementById('search-btn');
      const searchResults = document.getElementById('search-results');
      const categoryFilter = document.getElementById('category-filter');
      const priceFilter = document.getElementById('price-filter');

      if (searchModal && searchToggle) {
        // Open search modal
        searchToggle.addEventListener('click', function(e) {
          e.preventDefault();
          searchModal.style.display = 'block';
          if (searchInput) searchInput.focus();
        });

        // Close search modal
        if (searchClose) {
          searchClose.addEventListener('click', function() {
            searchModal.style.display = 'none';
          });
        }

        // Close modal when clicking outside
        window.addEventListener('click', function(e) {
          if (e.target === searchModal) {
            searchModal.style.display = 'none';
          }
        });

        // Perform search helper
        function performSearch() {
          const query = searchInput ? searchInput.value.trim() : '';

          if (!query) {
            if (searchResults) {
              searchResults.innerHTML = '<p class="no-results">검색어를 입력해 주세요.</p>';
            }
            return;
          }

          // Redirect to search results page
          const searchUrl = `search.html?q=${encodeURIComponent(query)}`;
          window.location.href = searchUrl;
        }

        // Search button click
        if (searchBtn) {
          searchBtn.addEventListener('click', performSearch);
        }

        // Enter key submits search
        if (searchInput) {
          searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              performSearch();
            }
          });
        }

        if (categoryFilter) {
          categoryFilter.addEventListener('change', performSearch);
        }
        if (priceFilter) {
          priceFilter.addEventListener('change', performSearch);
        }

        debugLog('header-loader: search modal initialized');
      } else {
        debugLog('header-loader: search modal elements not found');
      }

      // Initialize mypage dropdown and related UI
      initializeMypageFunctionality();
    })
    .catch(err => {
      console.error('header-loader: failed to load header partial', err);
    });
});

// 마이페이지 기능 초기화
function initializeMypageFunctionality() {
  const mypageToggle = document.getElementById('mypage-toggle');
  const mypageDropdown = document.getElementById('mypage-dropdown');
  const mypageIcon = document.getElementById('mypage-icon');
  const logoutBtn = document.getElementById('logout-btn');

  if (!mypageToggle || !mypageDropdown || !mypageIcon) {
    debugLog('header-loader: mypage elements not found');
    return;
  }

  const getApiBaseUrl = () => {
    const origin = window.location.origin;
    return origin && origin !== 'null'
      ? origin.replace(/\/$/, '') + '/api'
      : '/api';
  };

  async function checkLoginStatus() {
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/status`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.authenticated && data.user) {
        mypageToggle.href = '#';
        mypageIcon.src = 'image/loginmypage.jpg';
        mypageIcon.classList.add('mypage-icon-logged-in');

        if (window.miniCart) {
          window.miniCart.restoreCartForLogin();
          debugLog('header-loader: authenticated, restoring mini cart');
        }

        checkAdminAccess();
        debugLog('header-loader: authenticated user', data.user.email);
      } else {
        setLoggedOutState();
      }
    } catch (error) {
      if (String(error.message).includes('429') || String(error.message).includes('Too Many Requests')) {
        debugLog('header-loader: rate limited while checking auth state');
      } else {
        debugLog('header-loader: failed to check auth state', error.message);
      }
      setLoggedOutState();
    }
  }

  function setLoggedOutState() {
    removeAdminLink();
    mypageToggle.href = 'login.html';
    mypageIcon.src = 'image/mypage.jpg';
    mypageIcon.classList.remove('mypage-icon-logged-in');

    if (window.miniCart) {
      window.miniCart.hideCartForLogout();
      debugLog('header-loader: logged-out state, hiding mini cart');
    }

    debugLog('header-loader: user is not logged in');
  }

  function toggleDropdown() {
    if (mypageIcon.classList.contains('mypage-icon-logged-in')) {
      mypageDropdown.classList.toggle('show');
    }
  }

  function closeDropdown() {
    mypageDropdown.classList.remove('show');
  }

  async function handleLogout() {
    try {
      await fetch(`${getApiBaseUrl()}/logout`, {
        method: 'POST',
        credentials: 'include'
      });

      debugLog('header-loader: logout complete');

      if (window.miniCart) {
        window.miniCart.hideCartForLogout();
        debugLog('header-loader: hiding mini cart after logout');
      }

      const currentPage = window.location.pathname;
      const loginRequiredPages = ['/my-orders.html', '/my-profile.html', '/my-reservations.html', '/complete-profile.html'];

      if (loginRequiredPages.includes(currentPage)) {
        window.location.href = 'index.html';
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('header-loader: logout error', error);
      window.location.reload();
    }
  }

  mypageToggle.addEventListener('click', function(e) {
    if (mypageIcon.classList.contains('mypage-icon-logged-in')) {
      e.preventDefault();
      toggleDropdown();
    }
  });

  const dropdownItems = mypageDropdown.querySelectorAll('.dropdown-item');
  dropdownItems.forEach(item => {
    item.addEventListener('click', function() {
      if (this.id !== 'logout-btn') {
        closeDropdown();
      }
    });
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirm('로그아웃 하시겠습니까?')) {
        handleLogout();
      }
    });
  }

  document.addEventListener('click', function(e) {
    if (!mypageToggle.contains(e.target) && !mypageDropdown.contains(e.target)) {
      closeDropdown();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  checkLoginStatus();
  debugLog('header-loader: mypage functionality initialised');

  debugLog('header-loader: mini cart loader state', {
    hasCatalogData: !!window.CATALOG_DATA,
    hasMiniCart: !!window.miniCart
  });

  if (window.scriptsLoading && window.CATALOG_DATA && window.miniCart) {
    debugLog('header-loader: scripts already loaded, skipping');
    return;
  }

  if (!window.CATALOG_DATA) {
    debugLog('header-loader: loading catalog-data.js');
    const catalogScript = document.createElement('script');
    catalogScript.src = 'catalog-data.js';
    catalogScript.defer = true;
    catalogScript.onload = () => debugLog('header-loader: catalog-data.js loaded');
    catalogScript.onerror = () => console.error('header-loader: catalog-data.js failed to load');
    document.head.appendChild(catalogScript);
  }

  if (!window.miniCart) {
    debugLog('header-loader: loading mini-cart.js');
    const miniCartScript = document.createElement('script');
    miniCartScript.src = 'mini-cart.js';
    miniCartScript.defer = true;
    miniCartScript.onload = () => {
      setTimeout(() => {
        if (window.miniCart) {
          debugLog('header-loader: mini cart ready');
        }
      }, 100);
    };
    miniCartScript.onerror = () => {
      console.error('header-loader: mini-cart.js failed to load');
    };
    document.head.appendChild(miniCartScript);
  } else {
    debugLog('header-loader: mini cart already loaded');
    window.scriptsLoading = false;
  }
}

// 모바일 햄버거 메뉴 초기화
function initMobileMenu() {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const menuClose = document.getElementById('mobile-menu-close');
  const slideMenu = document.getElementById('mobile-slide-menu');
  const menuOverlay = document.getElementById('mobile-menu-overlay');

  if (!menuToggle || !menuClose || !slideMenu || !menuOverlay) {
    debugLog('header-loader: mobile menu elements not found');
    return;
  }

  function openMenu() {
    slideMenu.classList.add('active');
    menuOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    slideMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  // 햄버거 메뉴 버튼 클릭
  menuToggle.addEventListener('click', (e) => {
    e.preventDefault();
    openMenu();
  });

  // 닫기 버튼 클릭
  menuClose.addEventListener('click', (e) => {
    e.preventDefault();
    closeMenu();
  });

  // 오버레이 클릭 시 닫기
  menuOverlay.addEventListener('click', () => {
    closeMenu();
  });

  // 모바일 메뉴 내 네비게이션 링크 클릭 시 메뉴 닫기
  const mobileMenuLinks = slideMenu.querySelectorAll('.mobile-menu-list a');
  mobileMenuLinks.forEach(link => {
    link.addEventListener('click', () => {
      // 링크 이동 전에 메뉴 닫기 (약간의 지연을 두어 부드러운 전환)
      closeMenu();
    });
  });

  // 모바일 메뉴 내 쇼핑백 링크 클릭
  const mobileCartLink = document.getElementById('mobile-cart-link');
  if (mobileCartLink) {
    mobileCartLink.addEventListener('click', (e) => {
      e.preventDefault();
      closeMenu();
      // 장바구니 열기
      const cartToggle = document.getElementById('cart-toggle');
      if (cartToggle) {
        setTimeout(() => {
          cartToggle.click();
        }, 300);
      }
    });
  }

  // 모바일 메뉴 내 문의하기 링크 클릭
  const mobileContactLink = document.getElementById('mobile-contact-link');
  if (mobileContactLink) {
    mobileContactLink.addEventListener('click', (e) => {
      e.preventDefault();
      closeMenu();
      // 문의하기 처리 (추후 구현)
      alert('문의하기 기능은 준비 중입니다.');
    });
  }

  // ESC 키로 메뉴 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && slideMenu.classList.contains('active')) {
      closeMenu();
    }
  });

  // 장바구니 배지 동기화
  function syncCartBadge() {
    const desktopBadge = document.getElementById('cart-badge');
    const mobileBadge = document.getElementById('mobile-cart-badge');
    if (desktopBadge && mobileBadge) {
      const count = desktopBadge.textContent || '0';
      mobileBadge.textContent = count;
      if (count !== '0' && count !== '') {
        mobileBadge.style.display = 'block';
      } else {
        mobileBadge.style.display = 'none';
      }
    }
  }

  // 장바구니 업데이트 감지
  const observer = new MutationObserver(syncCartBadge);
  const cartBadge = document.getElementById('cart-badge');
  if (cartBadge) {
    observer.observe(cartBadge, { childList: true, characterData: true, subtree: true });
    syncCartBadge();
  }

  debugLog('header-loader: mobile menu initialized');
}
} // 중복 로드 방지 블록 닫기
