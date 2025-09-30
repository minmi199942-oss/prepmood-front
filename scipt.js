document.addEventListener("DOMContentLoaded", () => {
  // ✅ IntersectionObserver: 스크롤 시 섹션 등장
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.3
  });

  // ✅ 섹션들에 observer 적용
  document.querySelectorAll('.fade-in').forEach(section => {
    observer.observe(section);
  });

  // ✅ 메뉴 클릭 시 부드럽게 스크롤
  document.querySelectorAll('.navbar a').forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href').substring(1);
      const target = document.getElementById(targetId);
      const headerOffset = 80;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    });
  });

  // 디버깅용 로그
  console.log("✅ DOM fully loaded, script.js executed.");
});
