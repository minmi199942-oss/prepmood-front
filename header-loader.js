// 중복 로드 방지
if (window.__HEADER_LOADER_INITIALIZED__) {
  Logger.warn('header-loader.js: 이미 초기화되었습니다. 중복 로드를 건너뜁니다.');
} else {
  window.__HEADER_LOADER_INITIALIZED__ = true;

const ADMIN_LINK_ID = 'admin-nav-link';
const HEADER_PARTIAL_URL = '/header.partial';

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
    Logger.warn('header-loader: #header-container element not found.');
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
      
      // ⚠️ 중복 등록 방지: 기존 리스너 제거 후 새로 등록
      if (window.__headerHeightUpdateHandler) {
        window.removeEventListener('resize', window.__headerHeightUpdateHandler);
      }
      if (window.__headerResizeHandler) {
        window.removeEventListener('resize', window.__headerResizeHandler);
      }
      
      function updateHeaderHeight(){
        if (!headerEl) return;
        
        // 실제 콘텐츠 높이 측정 (min-height 제거로 순환 참조 해결)
        const h = headerEl.offsetHeight;
        
        // 현재 설정된 --header-height와 비교
        const currentHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
        
        // 실제 높이가 유효하고, 현재 설정값과 다를 때만 업데이트
        // ⚠️ 누적 방지: 비정상적으로 큰 값은 무시 (정상적인 리사이즈는 허용)
        if (h > 0 && h !== currentHeight) {
          // 리사이즈 시 정상적인 높이 변화는 허용 (현재 높이의 150% 이내 또는 초기값)
          if (h <= currentHeight * 1.5 || currentHeight === 0) {
            document.documentElement.style.setProperty('--header-height', h + 'px');
          } else {
            // 비정상적으로 큰 값은 무시 (누적 방지)
            Logger.warn('header-loader: 헤더 높이 누적 감지, 업데이트 건너뜀', { h, currentHeight });
          }
        }
      }
      updateHeaderHeight();
      
      // 전역 변수에 저장하여 나중에 제거 가능하도록 함
      window.__headerHeightUpdateHandler = updateHeaderHeight;
      window.addEventListener('resize', updateHeaderHeight);
      
      // 브라우저 크기 변경 시 모바일 메뉴 로그인 상태 업데이트 (debounce 적용)
      let resizeTimeout;
      const resizeHandler = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          // 모바일 메뉴가 보이는 상태일 때 로그인 상태 확인
          const slideMenu = document.getElementById('mobile-slide-menu');
          if (slideMenu && slideMenu.classList.contains('active')) {
            if (window.updateMobileLoginStatus) {
              window.updateMobileLoginStatus();
            }
          }
        }, 300);
      };
      
      // 전역 변수에 저장하여 나중에 제거 가능하도록 함
      window.__headerResizeHandler = resizeHandler;
      window.addEventListener('resize', resizeHandler);

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

      // 검색 오버레이: 구찌처럼 pushState(?s-flyout=open) + popstate 시 뒤로가기로 닫기
      const searchOverlay = document.getElementById('search-overlay');
      const searchToggle = document.getElementById('search-toggle');
      const searchClose = document.getElementById('search-close');
      const searchInput = document.getElementById('search-input');
      const searchResults = document.getElementById('search-results');

      if (searchOverlay && searchToggle && searchResults) {
        const DEBOUNCE_MS = 400;
        let searchDebounceTimer = null;
        const FLYOUT_PARAM = 's-flyout';

        function getFlattenedCatalog() {
          const catalog = typeof window.CATALOG_DATA !== 'undefined' ? window.CATALOG_DATA : {};
          const out = [];
          Object.keys(catalog).forEach(function (mainCat) {
            const sub = catalog[mainCat];
            if (sub && typeof sub === 'object') {
              Object.keys(sub).forEach(function (subCat) {
                const products = sub[subCat];
                if (Array.isArray(products)) {
                  products.forEach(function (p) {
                    out.push({
                      id: p.id,
                      name: p.name,
                      price: p.price,
                      image: p.image,
                      mainCategory: mainCat,
                      subCategory: subCat,
                      category: mainCat
                    });
                  });
                }
              });
            }
          });
          return out;
        }

        function filterCatalog(keyword) {
          const k = (keyword || '').trim().toLowerCase();
          if (!k) return [];
          const list = getFlattenedCatalog();
          return list.filter(function (p) {
            const name = (p.name || '').toLowerCase();
            const cat = (p.category || p.mainCategory || '').toLowerCase();
            return name.indexOf(k) !== -1 || cat.indexOf(k) !== -1;
          });
        }

        function renderResults(keyword, products) {
          searchResults.innerHTML = '';
          if (!products || products.length === 0) {
            const p = document.createElement('p');
            p.className = 'search-no-results';
            p.textContent = keyword && keyword.trim()
              ? keyword.trim() + '에 대한 검색 결과가 없습니다.'
              : '검색어를 2글자 이상 입력해 주세요.';
            searchResults.appendChild(p);
            return;
          }
          products.forEach(function (product) {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            const link = document.createElement('a');
            link.href = '/buy.html?id=' + encodeURIComponent(product.id || '');
            const nameEl = document.createElement('h4');
            nameEl.textContent = product.name || '상품명';
            const meta = document.createElement('p');
            meta.textContent = (product.category || '') + (product.price != null ? ' · ₩' + Number(product.price).toLocaleString() : '');
            link.appendChild(nameEl);
            link.appendChild(meta);
            item.appendChild(link);
            searchResults.appendChild(item);
          });
        }

        /** 검색 결과만 갱신: 1글자는 아무것도 안 보임, 2글자 이상일 때만 결과 또는 "검색 결과가 없습니다" */
        function applySearch() {
          const keyword = searchInput ? searchInput.value.trim() : '';
          if (keyword.length >= 2) {
            const products = filterCatalog(keyword);
            renderResults(keyword, products);
          } else {
            searchResults.innerHTML = '';
          }
        }

        /** 구찌처럼: 입력하는 즉시 URL만 실시간 반영 (replaceState, 1글자라도 반영) */
        function syncUrlFromInput() {
          if (!searchOverlay || !searchOverlay.classList.contains('is-open')) return;
          var keyword = searchInput ? searchInput.value.trim() : '';
          var url = new URL(window.location.href);
          url.searchParams.set(FLYOUT_PARAM, 'open');
          if (keyword.length > 0) {
            url.searchParams.set('keyword', keyword);
          } else {
            url.searchParams.delete('keyword');
          }
          var newUrl = url.pathname + url.search;
          window.history.replaceState({ searchFlyout: true, searchKeyword: keyword }, '', newUrl);
        }

        function runSearch() {
          if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
          searchDebounceTimer = setTimeout(applySearch, DEBOUNCE_MS);
        }

        function openSearchOverlay(skipPushState) {
          searchOverlay.classList.add('is-open');
          searchOverlay.setAttribute('aria-hidden', 'false');
          document.body.classList.add('search-overlay-open');
          if (searchInput) {
            searchInput.value = (new URLSearchParams(window.location.search).get('keyword') || '').trim();
            searchInput.focus();
            applySearch();
          }
          if (!skipPushState) {
            var url = new URL(window.location.href);
            url.searchParams.set(FLYOUT_PARAM, 'open');
            var kw = searchInput ? searchInput.value.trim() : '';
            if (kw) url.searchParams.set('keyword', kw);
            else url.searchParams.delete('keyword');
            window.history.pushState({ searchFlyout: true, searchKeyword: kw }, '', url.pathname + url.search);
          }
        }

        function closeSearchOverlay() {
          searchOverlay.classList.remove('is-open');
          searchOverlay.setAttribute('aria-hidden', 'true');
          document.body.classList.remove('search-overlay-open');
        }

        searchToggle.addEventListener('click', function (e) {
          e.preventDefault();
          openSearchOverlay();
        });

        if (searchClose) {
          searchClose.addEventListener('click', function () {
            window.history.back();
          });
        }

        if (searchInput) {
          searchInput.addEventListener('input', function () {
            syncUrlFromInput();
            runSearch();
          });
          searchInput.addEventListener('compositionend', function () {
            syncUrlFromInput();
            runSearch();
          });
          searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') window.history.back();
          });
        }

        window.addEventListener('popstate', function () {
          var params = new URLSearchParams(window.location.search);
          if (params.get(FLYOUT_PARAM) !== 'open') {
            closeSearchOverlay();
            var keyword = (params.get('keyword') || '').trim();
            if (searchInput) searchInput.value = keyword;
            if (keyword.length >= 2) {
              var products = filterCatalog(keyword);
              renderResults(keyword, products);
            } else {
              var p = document.createElement('p');
              p.className = 'search-no-results';
              p.textContent = keyword ? keyword + '에 대한 검색 결과가 없습니다.' : '검색어를 2글자 이상 입력해 주세요.';
              searchResults.innerHTML = '';
              searchResults.appendChild(p);
            }
          } else {
            openSearchOverlay(true);
          }
        });

        if (new URLSearchParams(window.location.search).get(FLYOUT_PARAM) === 'open') {
          openSearchOverlay(true);
        }

        debugLog('header-loader: search overlay initialized (pushState s-flyout=open)');
      } else {
        debugLog('header-loader: search overlay elements not found');
      }

      // Initialize mypage dropdown and related UI
      initializeMypageFunctionality();
    })
    .catch(err => {
      Logger.error('header-loader: failed to load header partial', err);
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
        mypageIcon.src = '/image/loginmypage.jpg';
        mypageIcon.classList.add('mypage-icon-logged-in');

        // 모바일 메뉴 로그인 링크 업데이트
        const mobileLoginLink = document.getElementById('mobile-login-link');
        if (mobileLoginLink) {
          mobileLoginLink.href = '/my-profile.html';
          const textElement = mobileLoginLink.querySelector('.mobile-action-text');
          if (textElement) {
            textElement.textContent = '마이페이지';
          }
        }

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
    mypageToggle.href = '/login.html';
    mypageIcon.src = '/image/mypage.jpg';
    mypageIcon.classList.remove('mypage-icon-logged-in');

    // 모바일 메뉴 로그인 링크 업데이트
    const mobileLoginLink = document.getElementById('mobile-login-link');
    if (mobileLoginLink) {
      mobileLoginLink.href = '/login.html';
      const textElement = mobileLoginLink.querySelector('.mobile-action-text');
      if (textElement) {
        textElement.textContent = '로그인 또는 계정 생성';
      }
    }

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
      Logger.error('header-loader: logout error', error);
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

  // 헤더가 완전히 로드된 후 로그인 상태 확인 (모바일 링크 요소가 존재하는지 보장)
  // 약간의 지연을 두어 DOM이 완전히 렌더링된 후 실행
  setTimeout(() => {
    checkLoginStatus();
    debugLog('header-loader: mypage functionality initialised');
  }, 100);

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
    catalogScript.src = '/catalog-data.js';
    catalogScript.defer = true;
    catalogScript.onload = () => debugLog('header-loader: catalog-data.js loaded');
    catalogScript.onerror = () => Logger.error('header-loader: catalog-data.js failed to load');
    document.head.appendChild(catalogScript);
  }

  if (!window.miniCart) {
    debugLog('header-loader: loading mini-cart.js');
    const miniCartScript = document.createElement('script');
    miniCartScript.src = '/mini-cart.js';
    miniCartScript.defer = true;
    miniCartScript.onload = () => {
      setTimeout(() => {
        if (window.miniCart) {
          debugLog('header-loader: mini cart ready');
        }
      }, 100);
    };
    miniCartScript.onerror = () => {
      Logger.error('header-loader: mini-cart.js failed to load');
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

  const getApiBaseUrl = () => {
    const origin = window.location.origin;
    return origin && origin !== 'null'
      ? origin.replace(/\/$/, '') + '/api'
      : '/api';
  };

  // 모바일 로그인 상태 업데이트 함수 (재사용 가능)
  function updateMobileLoginStatus() {
    const mobileLoginLink = document.getElementById('mobile-login-link');
    if (!mobileLoginLink) return;
    
    fetch(`${getApiBaseUrl()}/auth/status`, {
      credentials: 'include'
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.success && data.authenticated && data.user) {
          mobileLoginLink.href = '/my-profile.html';
          const textElement = mobileLoginLink.querySelector('.mobile-action-text');
          if (textElement) {
            textElement.textContent = '마이페이지';
          }
        } else {
          mobileLoginLink.href = '/login.html';
          const textElement = mobileLoginLink.querySelector('.mobile-action-text');
          if (textElement) {
            textElement.textContent = '로그인 또는 계정 생성';
          }
        }
      })
      .catch(() => {
        // 에러 발생 시 기본 상태 유지
      });
  }

  // 전역으로 노출하여 다른 곳에서도 호출 가능하게 함
  window.updateMobileLoginStatus = updateMobileLoginStatus;

  function openMenu() {
    slideMenu.classList.add('active');
    menuOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // 모바일 메뉴가 열릴 때 로그인 상태 확인 (모바일에서 쿠키 동기화 문제 대응)
    updateMobileLoginStatus();
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
