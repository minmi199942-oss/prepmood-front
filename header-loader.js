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
    })
    .catch(err => {
      console.error('헤더 로딩 실패:', err);
    });
});