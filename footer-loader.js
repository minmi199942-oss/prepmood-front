// 푸터 로더 - 모든 페이지에 푸터 자동 로드
window.addEventListener('DOMContentLoaded', () => {
  const footerContainer = document.getElementById('footer-container');
  
  if (footerContainer) {
    fetch('footer.partial')
      .then(res => res.text())
      .then(html => {
        footerContainer.innerHTML = html;
        console.log('Footer loaded successfully');
        initFooterAccordion(); // 아코디언 기능 초기화
      })
      .catch(error => {
        console.error('Error loading footer:', error);
        // 푸터 로드 실패 시 기본 푸터 표시
        footerContainer.innerHTML = `
          <footer class="global-footer">
            <div class="footer-container">
              <div class="footer-bottom">
                <p class="footer-copyright">© Prepmood 2025. All rights reserved.</p>
              </div>
            </div>
          </footer>
        `;
      });
  }
});

// 푸터 아코디언 기능 (모바일에서만 동작)
function initFooterAccordion() {
  // 모바일에서만 아코디언 활성화
  if (window.innerWidth > 767) {
    return; // 데스크톱에서는 아코디언 비활성화
  }

  const accordionToggles = document.querySelectorAll('.footer-accordion-toggle');
  
  accordionToggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      const isExpanded = this.getAttribute('aria-expanded') === 'true';
      const content = this.nextElementSibling;
      const icon = this.querySelector('.footer-accordion-icon');
      
      // 모든 아코디언 닫기 (선택사항: 한 번에 하나만 열리게 하려면)
      // accordionToggles.forEach(otherToggle => {
      //   if (otherToggle !== this) {
      //     otherToggle.setAttribute('aria-expanded', 'false');
      //     otherToggle.nextElementSibling.style.maxHeight = null;
      //     otherToggle.querySelector('.footer-accordion-icon').textContent = '▼';
      //   }
      // });
      
      // 현재 아코디언 토글
      if (isExpanded) {
        this.setAttribute('aria-expanded', 'false');
        content.style.maxHeight = null;
        icon.textContent = '▼';
      } else {
        this.setAttribute('aria-expanded', 'true');
        content.style.maxHeight = content.scrollHeight + 'px';
        icon.textContent = '▲';
      }
    });
  });
  
  // 화면 크기 변경 시 아코디언 상태 업데이트
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 767) {
        // 데스크톱으로 전환 시 모든 아코디언 열기
        accordionToggles.forEach(toggle => {
          toggle.setAttribute('aria-expanded', 'true');
          const content = toggle.nextElementSibling;
          content.style.maxHeight = null; // CSS에서 자동으로 표시
          toggle.querySelector('.footer-accordion-icon').textContent = '▼';
        });
      } else {
        // 모바일로 전환 시 모든 아코디언 닫기
        accordionToggles.forEach(toggle => {
          toggle.setAttribute('aria-expanded', 'false');
          const content = toggle.nextElementSibling;
          content.style.maxHeight = null;
          toggle.querySelector('.footer-accordion-icon').textContent = '▼';
        });
      }
    }, 250);
  });
}
