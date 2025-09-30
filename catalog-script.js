// catalog-script.js

(function(){
  function qs(key){ return new URLSearchParams(location.search).get(key); }

  const gender = (qs('gender') || 'men').toLowerCase();
  const category = (qs('category') || 'tops').toLowerCase();
  const type = (qs('type') || 'shirts').toLowerCase();

  const title = document.getElementById('catalog-title');
  title.textContent = `${gender.toUpperCase()} · ${capitalize(category)} · ${humanize(type)}`;

  const grid = document.getElementById('product-grid');
  const list = (((window.CATALOG_DATA || {})[gender] || {})[category] || {})[type] || [];

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









