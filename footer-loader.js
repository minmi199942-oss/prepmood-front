// 푸터 로더 - 모든 페이지에 푸터 자동 로드
window.addEventListener('DOMContentLoaded', () => {
  const footerContainer = document.getElementById('footer-container');
  
  if (footerContainer) {
    fetch('footer.partial')
      .then(res => res.text())
      .then(html => {
        footerContainer.innerHTML = html;
        console.log('Footer loaded successfully');
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
