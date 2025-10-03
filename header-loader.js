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
    })
    .catch(err => {
      console.error('헤더 로딩 실패:', err);
    });
});