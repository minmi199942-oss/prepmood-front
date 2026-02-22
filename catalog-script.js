// catalog-script.js

(function(){
  function qs(key){ return new URLSearchParams(location.search).get(key); }

  const collection = qs('collection');
  const category = (qs('category') || (collection ? null : 'tops'))?.toLowerCase();
  const type = qs('type') ? qs('type').toLowerCase() : null;

  const title = document.getElementById('catalog-title');
  const grid = document.getElementById('product-grid');

  function renderCatalog() {
    if (!title || !grid) return; // 필드가 없으면 건너뛰기
    
    let list = [];

    // Collection 뷰: collection 파라미터 있으면 해당 연도 전체 상품 표시
    if (collection) {
      const catalogData = window.CATALOG_DATA || {};
      list = Object.values(catalogData).flatMap(cat => Object.values(cat || {}).flat());
      title.textContent = `Collection ${collection}`;
    }
    // 카테고리 뷰
    else if (!type || type === 'all') {
      const categoryData = (window.CATALOG_DATA || {})[category] || {};
      list = Object.values(categoryData).flat();
      title.textContent = `${capitalize(category)} · All`;
    } else {
      list = ((window.CATALOG_DATA || {})[category] || {})[type] || [];
      title.textContent = `${capitalize(category)} · ${humanize(type)}`;
    }

    const productCount = document.getElementById('product-count');
    if (productCount) {
      productCount.textContent = `${list.length} items`;
    }

    grid.innerHTML = list.map(item => {
      // 이미지 경로 처리: /uploads/products/로 시작하면 그대로 사용, 아니면 /image/ 추가
      let imageSrc = item.image || '';
      if (imageSrc.startsWith('/uploads/')) {
        // 업로드된 이미지 (새로 추가/수정된 이미지)
        imageSrc = imageSrc;
      } else if (imageSrc.startsWith('/image/')) {
        // 기존 이미지 경로
        imageSrc = imageSrc;
      } else if (imageSrc) {
        // 상대 경로인 경우
        imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
      } else {
        // 이미지가 없는 경우 기본 이미지
        imageSrc = '/image/shirt.jpg';
      }
      
      return `
      <a class="product-card-lg" href="buy.html?id=${escapeHtml(item.id)}">
        <figure>
          <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.name)}"/>
        </figure>
        <div class="meta">
          <div class="name">${escapeHtml(item.name)}</div>
          <div class="price">${window.formatKRW ? window.formatKRW(item.price) : escapeHtml(item.price)}</div>
        </div>
      </a>
    `;
    }).join('');
  }

  // 상품 데이터 로드 완료를 기다림
  if (window.productsLoaded && window.CATALOG_DATA) {
    renderCatalog();
  } else {
    // 로드 완료 이벤트 리스너 등록
    window.addEventListener('productsLoaded', renderCatalog);
    
    // 로드 오류 시 기본 메시지 표시
    window.addEventListener('productsLoadError', () => {
      title.textContent = '상품을 불러올 수 없습니다';
      document.getElementById('product-count').textContent = '0 items';
      grid.innerHTML = '<div class="error-message">상품 데이터를 불러오는데 실패했습니다. 잠시 후 다시 시도해주세요.</div>';
    });
  }

  function capitalize(s){ return s.replace(/(^|[-_\s])(\w)/g, (_,b,c)=> (b?b:'') + c.toUpperCase()); }
  function humanize(s){ return s.replace(/-/g,' ').replace(/\b\w/g, c=>c.toUpperCase()); }
  // escapeHtml은 utils.js에서 전역으로 제공됨
})();









