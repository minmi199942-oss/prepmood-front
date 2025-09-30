// 가상 상품 데이터 (기존 이미지 활용)
window.CATALOG_DATA = {
  men: {
    tops: {
      shirts: [
        { id: 'm-ts-001', name: 'Classic Oxford Shirt', price: 89000, image: 'image/shirt.jpg' },
        { id: 'm-ts-002', name: 'Soft Cotton Shirt', price: 79000, image: 'image/shirt.jpg' },
        { id: 'm-ts-003', name: 'Relaxed Fit Shirt', price: 99000, image: 'image/shirt.jpg' },
        { id: 'm-ts-004', name: 'Stripe Poplin Shirt', price: 119000, image: 'image/shirt.jpg' },
        { id: 'm-ts-005', name: 'Linen Blend Shirt', price: 109000, image: 'image/shirt.jpg' },
        { id: 'm-ts-006', name: 'Denim Shirt', price: 95000, image: 'image/shirt.jpg' },
      ],
      knits: [
        { id: 'm-kn-001', name: 'Merino Wool Knit', price: 189000, image: 'image/knit.jpg' },
        { id: 'm-kn-002', name: 'Cashmere Sweater', price: 299000, image: 'image/knit.jpg' },
        { id: 'm-kn-003', name: 'Cable Knit Pullover', price: 149000, image: 'image/knit.jpg' },
        { id: 'm-kn-004', name: 'V-Neck Cardigan', price: 129000, image: 'image/knit.jpg' },
      ],
      't-shirts': [
        { id: 'm-ts-007', name: 'Basic Cotton Tee', price: 39000, image: 'image/shirt.jpg' },
        { id: 'm-ts-008', name: 'Oversized Graphic Tee', price: 59000, image: 'image/shirt.jpg' },
        { id: 'm-ts-009', name: 'Henley Long Sleeve', price: 69000, image: 'image/shirt.jpg' },
      ],
      jackets: [
        { id: 'm-jk-001', name: 'Nylon Puffer Jacket', price: 420000, image: 'image/denim.jpg' },
        { id: 'm-jk-002', name: 'Leather Bomber Jacket', price: 580000, image: 'image/denim.jpg' },
        { id: 'm-jk-003', name: 'Denim Jacket', price: 189000, image: 'image/denim.jpg' },
        { id: 'm-jk-004', name: 'Wool Blazer', price: 350000, image: 'image/denim.jpg' },
      ],
      suits: [
        { id: 'm-st-001', name: 'Classic Navy Suit', price: 890000, image: 'image/suit.jpg' },
        { id: 'm-st-002', name: 'Charcoal Two-Piece', price: 750000, image: 'image/suit.jpg' },
        { id: 'm-st-003', name: 'Linen Summer Suit', price: 650000, image: 'image/suit.jpg' },
      ],
    },
    bottoms: {
      denim: [
        { id: 'm-dn-001', name: 'Vintage Denim', price: 129000, image: 'image/denim.jpg' },
        { id: 'm-dn-002', name: 'Slim Fit Jeans', price: 149000, image: 'image/denim.jpg' },
        { id: 'm-dn-003', name: 'Raw Denim', price: 189000, image: 'image/denim.jpg' },
        { id: 'm-dn-004', name: 'Distressed Jeans', price: 169000, image: 'image/denim.jpg' },
      ],
      pants: [
        { id: 'm-pt-001', name: 'Pleated Pants', price: 139000, image: 'image/pants.jpg' },
        { id: 'm-pt-002', name: 'Chino Trousers', price: 119000, image: 'image/pants.jpg' },
        { id: 'm-pt-003', name: 'Cargo Pants', price: 159000, image: 'image/pants.jpg' },
        { id: 'm-pt-004', name: 'Wide Leg Pants', price: 179000, image: 'image/pants.jpg' },
      ],
      slacks: [
        { id: 'm-sl-001', name: 'Dress Slacks', price: 199000, image: 'image/pants.jpg' },
        { id: 'm-sl-002', name: 'Wool Trousers', price: 249000, image: 'image/pants.jpg' },
        { id: 'm-sl-003', name: 'Linen Slacks', price: 129000, image: 'image/pants.jpg' },
      ],
    },
    shoes: {
      sneakers: [
        { id: 'm-sn-001', name: 'White Canvas Sneakers', price: 89000, image: 'image/shoes.jpg' },
        { id: 'm-sn-002', name: 'Leather High-Tops', price: 149000, image: 'image/shoes.jpg' },
        { id: 'm-sn-003', name: 'Minimalist Runners', price: 119000, image: 'image/shoes.jpg' },
      ],
      loafers: [
        { id: 'm-lf-001', name: 'Classic Penny Loafers', price: 299000, image: 'image/shoes.jpg' },
        { id: 'm-lf-002', name: 'Tassel Loafers', price: 349000, image: 'image/shoes.jpg' },
        { id: 'm-lf-003', name: 'Driving Moccasins', price: 249000, image: 'image/shoes.jpg' },
      ],
      boots: [
        { id: 'm-bt-001', name: 'Chelsea Boots', price: 399000, image: 'image/shoes.jpg' },
        { id: 'm-bt-002', name: 'Combat Boots', price: 449000, image: 'image/shoes.jpg' },
        { id: 'm-bt-003', name: 'Chukka Boots', price: 329000, image: 'image/shoes.jpg' },
      ],
    },
    bags: {
      'backpacks': [
        { id: 'm-bp-001', name: 'Minimalist Backpack', price: 189000, image: 'image/backpack.jpg' },
        { id: 'm-bp-002', name: 'Leather Rucksack', price: 299000, image: 'image/backpack.jpg' },
        { id: 'm-bp-003', name: 'Canvas Daypack', price: 129000, image: 'image/backpack.jpg' },
      ],
      'tote-bags': [
        { id: 'm-tt-001', name: 'Canvas Tote Bag', price: 79000, image: 'image/earring.jpg' },
        { id: 'm-tt-002', name: 'Leather Tote', price: 199000, image: 'image/earring.jpg' },
      ],
      'crossbody-bags': [
        { id: 'm-cb-001', name: 'Sling Bag', price: 119000, image: 'image/earring.jpg' },
        { id: 'm-cb-002', name: 'Messenger Bag', price: 149000, image: 'image/earring.jpg' },
      ],
    },
    hats: {
      caps: [
        { id: 'm-cp-001', name: 'Baseball Cap', price: 49000, image: 'image/cap.jpg' },
        { id: 'm-cp-002', name: 'Dad Hat', price: 39000, image: 'image/cap.jpg' },
        { id: 'm-cp-003', name: 'Snapback Cap', price: 59000, image: 'image/cap.jpg' },
      ],
      beanies: [
        { id: 'm-bn-001', name: 'Wool Beanie', price: 39000, image: 'image/cap.jpg' },
        { id: 'm-bn-002', name: 'Cable Knit Beanie', price: 49000, image: 'image/cap.jpg' },
      ],
    },
    scarves: {
      mufflers: [
        { id: 'm-mf-001', name: 'Cashmere Scarf', price: 89000, image: 'image/scarf.jpg' },
        { id: 'm-mf-002', name: 'Wool Muffler', price: 69000, image: 'image/scarf.jpg' },
        { id: 'm-mf-003', name: 'Silk Scarf', price: 79000, image: 'image/scarf.jpg' },
      ],
    },
    accessories: {
      jewelry: [
        { id: 'm-jw-001', name: 'Silver Ring', price: 89000, image: 'image/earring.jpg' },
        { id: 'm-jw-002', name: 'Leather Bracelet', price: 49000, image: 'image/earring.jpg' },
        { id: 'm-jw-003', name: 'Chain Necklace', price: 119000, image: 'image/earring.jpg' },
      ],
      belts: [
        { id: 'm-bl-001', name: 'Leather Belt', price: 79000, image: 'image/belt.jpg' },
        { id: 'm-bl-002', name: 'Canvas Belt', price: 49000, image: 'image/belt.jpg' },
        { id: 'm-bl-003', name: 'Chain Belt', price: 99000, image: 'image/belt.jpg' },
      ],
      wallets: [
        { id: 'm-wl-001', name: 'Bifold Wallet', price: 89000, image: 'image/wallet.jpg' },
        { id: 'm-wl-002', name: 'Card Holder', price: 59000, image: 'image/wallet.jpg' },
        { id: 'm-wl-003', name: 'Money Clip', price: 69000, image: 'image/wallet.jpg' },
      ],
    },
  },
  women: {
    tops: {
      blouses: [
        { id: 'w-bl-001', name: 'Silk Blouse', price: 159000, image: 'image/knit.jpg' },
        { id: 'w-bl-002', name: 'Cotton Blouse', price: 99000, image: 'image/knit.jpg' },
        { id: 'w-bl-003', name: 'Linen Blouse', price: 119000, image: 'image/knit.jpg' },
        { id: 'w-bl-004', name: 'Chiffon Blouse', price: 139000, image: 'image/knit.jpg' },
      ],
      knits: [
        { id: 'w-kn-001', name: 'Cashmere Sweater', price: 299000, image: 'image/knit.jpg' },
        { id: 'w-kn-002', name: 'Turtleneck Knit', price: 149000, image: 'image/knit.jpg' },
        { id: 'w-kn-003', name: 'Cardigan Sweater', price: 179000, image: 'image/knit.jpg' },
        { id: 'w-kn-004', name: 'Crop Top Knit', price: 99000, image: 'image/knit.jpg' },
      ],
      't-shirts': [
        { id: 'w-ts-001', name: 'Basic Tee', price: 39000, image: 'image/shirt.jpg' },
        { id: 'w-ts-002', name: 'Oversized Tee', price: 49000, image: 'image/shirt.jpg' },
        { id: 'w-ts-003', name: 'Crop Top', price: 59000, image: 'image/shirt.jpg' },
      ],
      jackets: [
        { id: 'w-jk-001', name: 'Denim Jacket', price: 189000, image: 'image/denim.jpg' },
        { id: 'w-jk-002', name: 'Leather Jacket', price: 450000, image: 'image/denim.jpg' },
        { id: 'w-jk-003', name: 'Blazer', price: 249000, image: 'image/denim.jpg' },
        { id: 'w-jk-004', name: 'Trench Coat', price: 399000, image: 'image/denim.jpg' },
      ],
      suits: [
        { id: 'w-st-001', name: 'Pantsuit', price: 599000, image: 'image/suit.jpg' },
        { id: 'w-st-002', name: 'Skirt Suit', price: 549000, image: 'image/suit.jpg' },
        { id: 'w-st-003', name: 'Blazer Set', price: 399000, image: 'image/suit.jpg' },
      ],
    },
    bottoms: {
      skirts: [
        { id: 'w-sk-001', name: 'A-Line Skirt', price: 129000, image: 'image/pants.jpg' },
        { id: 'w-sk-002', name: 'Pencil Skirt', price: 149000, image: 'image/pants.jpg' },
        { id: 'w-sk-003', name: 'Mini Skirt', price: 99000, image: 'image/pants.jpg' },
        { id: 'w-sk-004', name: 'Midi Skirt', price: 119000, image: 'image/pants.jpg' },
      ],
      pants: [
        { id: 'w-pt-001', name: 'Wide Leg Pants', price: 179000, image: 'image/pants.jpg' },
        { id: 'w-pt-002', name: 'Skinny Jeans', price: 149000, image: 'image/pants.jpg' },
        { id: 'w-pt-003', name: 'Culottes', price: 139000, image: 'image/pants.jpg' },
        { id: 'w-pt-004', name: 'Palazzo Pants', price: 159000, image: 'image/pants.jpg' },
      ],
      denim: [
        { id: 'w-dn-001', name: 'High-Waist Jeans', price: 169000, image: 'image/denim.jpg' },
        { id: 'w-dn-002', name: 'Boyfriend Jeans', price: 149000, image: 'image/denim.jpg' },
        { id: 'w-dn-003', name: 'Distressed Jeans', price: 189000, image: 'image/denim.jpg' },
      ],
    },
    shoes: {
      heels: [
        { id: 'w-hl-001', name: 'Pump Heels', price: 199000, image: 'image/shoes.jpg' },
        { id: 'w-hl-002', name: 'Stiletto Heels', price: 249000, image: 'image/shoes.jpg' },
        { id: 'w-hl-003', name: 'Block Heels', price: 179000, image: 'image/shoes.jpg' },
        { id: 'w-hl-004', name: 'Ankle Strap Heels', price: 219000, image: 'image/shoes.jpg' },
      ],
      flats: [
        { id: 'w-fl-001', name: 'Ballet Flats', price: 99000, image: 'image/shoes.jpg' },
        { id: 'w-fl-002', name: 'Loafers', price: 149000, image: 'image/shoes.jpg' },
        { id: 'w-fl-003', name: 'Oxford Flats', price: 129000, image: 'image/shoes.jpg' },
      ],
      sneakers: [
        { id: 'w-sn-001', name: 'White Sneakers', price: 89000, image: 'image/shoes.jpg' },
        { id: 'w-sn-002', name: 'Platform Sneakers', price: 119000, image: 'image/shoes.jpg' },
        { id: 'w-sn-003', name: 'Retro Sneakers', price: 109000, image: 'image/shoes.jpg' },
      ],
    },
    bags: {
      'shoulder-bags': [
        { id: 'w-sb-001', name: 'Leather Shoulder Bag', price: 299000, image: 'image/earring.jpg' },
        { id: 'w-sb-002', name: 'Chain Shoulder Bag', price: 249000, image: 'image/earring.jpg' },
        { id: 'w-sb-003', name: 'Crossbody Shoulder Bag', price: 199000, image: 'image/earring.jpg' },
      ],
      'tote-bags': [
        { id: 'w-tt-001', name: 'Canvas Tote', price: 79000, image: 'image/earring.jpg' },
        { id: 'w-tt-002', name: 'Leather Tote', price: 199000, image: 'image/earring.jpg' },
        { id: 'w-tt-003', name: 'Straw Tote', price: 119000, image: 'image/earring.jpg' },
      ],
      'mini-bags': [
        { id: 'w-mb-001', name: 'Mini Crossbody', price: 149000, image: 'image/earring.jpg' },
        { id: 'w-mb-002', name: 'Clutch Bag', price: 99000, image: 'image/earring.jpg' },
        { id: 'w-mb-003', name: 'Mini Backpack', price: 129000, image: 'image/earring.jpg' },
      ],
    },
    hats: {
      caps: [
        { id: 'w-cp-001', name: 'Baseball Cap', price: 49000, image: 'image/cap.jpg' },
        { id: 'w-cp-002', name: 'Bucket Hat', price: 59000, image: 'image/cap.jpg' },
        { id: 'w-cp-003', name: 'Dad Hat', price: 39000, image: 'image/cap.jpg' },
      ],
      beanies: [
        { id: 'w-bn-001', name: 'Cable Knit Beanie', price: 49000, image: 'image/cap.jpg' },
        { id: 'w-bn-002', name: 'Slouchy Beanie', price: 39000, image: 'image/cap.jpg' },
      ],
    },
    scarves: {
      'silk-scarves': [
        { id: 'w-ss-001', name: 'Silk Square Scarf', price: 89000, image: 'image/scarf.jpg' },
        { id: 'w-ss-002', name: 'Silk Long Scarf', price: 119000, image: 'image/scarf.jpg' },
        { id: 'w-ss-003', name: 'Silk Bandana', price: 59000, image: 'image/scarf.jpg' },
      ],
      mufflers: [
        { id: 'w-mf-001', name: 'Cashmere Muffler', price: 129000, image: 'image/scarf.jpg' },
        { id: 'w-mf-002', name: 'Wool Muffler', price: 89000, image: 'image/scarf.jpg' },
      ],
    },
    accessories: {
      jewelry: [
        { id: 'w-jw-001', name: 'Pearl Earrings', price: 149000, image: 'image/earring.jpg' },
        { id: 'w-jw-002', name: 'Gold Chain Necklace', price: 199000, image: 'image/earring.jpg' },
        { id: 'w-jw-003', name: 'Diamond Ring', price: 599000, image: 'image/earring.jpg' },
        { id: 'w-jw-004', name: 'Bracelet Set', price: 99000, image: 'image/earring.jpg' },
      ],
      belts: [
        { id: 'w-bl-001', name: 'Leather Belt', price: 79000, image: 'image/belt.jpg' },
        { id: 'w-bl-002', name: 'Chain Belt', price: 119000, image: 'image/belt.jpg' },
        { id: 'w-bl-003', name: 'Fabric Belt', price: 49000, image: 'image/belt.jpg' },
      ],
      wallets: [
        { id: 'w-wl-001', name: 'Clutch Wallet', price: 99000, image: 'image/wallet.jpg' },
        { id: 'w-wl-002', name: 'Card Case', price: 69000, image: 'image/wallet.jpg' },
        { id: 'w-wl-003', name: 'Coin Purse', price: 49000, image: 'image/wallet.jpg' },
      ],
    },
  }
};

// 헬퍼: 숫자를 통화 포맷으로
window.formatKRW = (n) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(n);






