// catalog-script.js

(function(){
  function qs(key){ return new URLSearchParams(location.search).get(key); }

  const gender = (qs('gender') || 'men').toLowerCase();
  const category = (qs('category') || 'accessories').toLowerCase();
  const type = qs('type') ? qs('type').toLowerCase() : null;

  const title = document.getElementById('catalog-title');
  const grid = document.getElementById('product-grid');
  let list = [];

  // type이 없으면 해당 카테고리의 모든 하위 항목 합치기
  if (!type || type === 'all') {
    // 카테고리의 모든 하위 타입 데이터 합치기
    const categoryData = ((window.CATALOG_DATA || {})[gender] || {})[category] || {};
    list = Object.values(categoryData).flat();
    title.textContent = `${capitalize(category)} · All`;
  } else {
    // 특정 타입만 가져오기
    list = (((window.CATALOG_DATA || {})[gender] || {})[category] || {})[type] || [];
    title.textContent = `${capitalize(category)} · ${humanize(type)}`;
  }

  document.getElementById('product-count').textContent = `${list.length} items`;

  grid.innerHTML = list.map(item => `
    <a class="product-card-lg" href="buy.html?id=${item.id}">
      <figure>
        <img src="${item.image}" alt="${escapeHtml(item.name)}"/>
      </figure>
      <div class="meta">
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="price">${window.formatKRW ? window.formatKRW(item.price) : item.price}</div>
      </div>
    </a>
  `).join('');

  function capitalize(s){ return s.replace(/(^|[-_\s])(\w)/g, (_,b,c)=> (b?b:'') + c.toUpperCase()); }
  function humanize(s){ return s.replace(/-/g,' ').replace(/\b\w/g, c=>c.toUpperCase()); }
  function escapeHtml(str){ return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
})();









