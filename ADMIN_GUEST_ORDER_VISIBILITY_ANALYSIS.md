# 관리자 페이지 비회원 주문 조회 가능 여부 분석

**최종 업데이트**: 2026-01-16  
**관련 파일**: `backend/index.js`, `admin-qhf25za8/admin-orders.js`

---

## 📊 현재 상태 요약

### ✅ 조회 가능 여부
**비회원 주문(guest_id)도 관리자 페이지에서 조회 가능합니다.**

하지만 **표시 및 검색 기능에 개선이 필요**합니다.

---

## 🔍 상세 분석

### 1. 주문 목록 조회 API (`GET /api/admin/orders`)

#### 현재 상태
**위치**: `backend/index.js` 1406-1551줄

**SELECT 쿼리** (1430-1449줄):
```sql
SELECT 
    o.order_id,
    o.order_number,
    o.user_id,
    o.total_price,
    o.status,
    o.shipping_name,
    o.shipping_phone,
    o.shipping_address,
    o.shipping_postal_code as shipping_zipcode,
    o.shipping_country,
    o.order_date as created_at,
    o.order_date as updated_at,
    u.email as customer_email,  -- ❌ 비회원 주문은 NULL
    u.name as customer_name     -- ❌ 비회원 주문은 NULL
FROM orders o
LEFT JOIN users u ON o.user_id = u.user_id
WHERE 1=1
```

**문제점**:
1. ❌ **`guest_id` 컬럼이 SELECT에 없음** → 비회원 주문인지 구분 불가
2. ❌ **`shipping_email` 컬럼이 SELECT에 없음** → 비회원 주문의 이메일 확인 불가
3. ✅ **비회원 주문도 조회는 됨** (`LEFT JOIN`이므로 `user_id`가 NULL인 주문도 포함)

**검색 기능** (1459-1463줄):
```sql
if (search) {
    query += ' AND (o.order_number LIKE ? OR o.shipping_name LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
    // ❌ o.shipping_email이 빠져있음 → 비회원 주문 이메일로 검색 불가
}
```

---

### 2. 주문 상세 조회 API (`GET /api/admin/orders/:orderId`)

#### 현재 상태
**위치**: `backend/index.js` 1583-1832줄

**SELECT 쿼리** (1600-1624줄):
```sql
SELECT 
    o.order_id,
    o.order_number,
    o.user_id,
    o.guest_id,              -- ✅ 포함됨
    o.status,
    o.total_price as total_amount,
    o.paid_at,
    o.order_date as created_at,
    o.shipping_name,
    o.shipping_email,        -- ✅ 포함됨
    o.shipping_phone,
    o.shipping_address,
    o.shipping_postal_code,
    o.shipping_city,
    o.shipping_country,
    u.email as customer_email,
    u.name as customer_name,
    u.phone as customer_phone
FROM orders o
LEFT JOIN users u ON o.user_id = u.user_id
WHERE o.order_id = ?
```

**상태**: ✅ **주문 상세 조회는 정상 동작** (`guest_id`, `shipping_email` 모두 포함)

---

### 3. 프론트엔드 표시 (`admin-qhf25za8/admin-orders.js`)

#### 주문 목록 테이블 (162-207줄)

**현재 렌더링**:
```javascript
const customerName = order.shipping_name || order.customer_name || '-';
// ✅ 비회원 주문도 표시됨 (shipping_name 사용)

const itemsSummary = order.items.length > 0 ? ... : '-';

return `
  <tr data-order-id="${order.order_id}">
    <td><strong>${order.order_number || `#${order.order_id}`}</strong></td>
    <td>${dateStr}</td>
    <td>
      ${customerName}<br>
      <small style="color: #6c757d;">${order.customer_email || ''}</small>
      <!-- ❌ 비회원 주문은 이메일이 표시 안 됨 (shipping_email 사용 필요) -->
    </td>
    <td>${itemsSummary}${moreItems}</td>
    <td><strong>${priceFormatted}</strong></td>
    <td>${renderOrderStatusBadge(order.status)}</td>
    <td>
      <button class="btn-sm btn-primary" onclick="window.viewOrderDetail(${order.order_id})">
        상세
      </button>
    </td>
  </tr>
`;
```

**문제점**:
1. ❌ **비회원 주문 구분 표시 없음** (`guest_id` 표시 안 됨)
2. ❌ **비회원 주문 이메일 표시 안 됨** (`customer_email`만 사용, `shipping_email` 사용 필요)

#### 주문 상세 모달 (364-555줄)

**현재 렌더링** (369-371줄):
```javascript
const customerName = order.customer_info?.name || order.shipping_info?.name || '-';
const customerEmail = order.customer_info?.email || order.shipping_info?.email || '-';
const customerPhone = order.customer_info?.phone || order.shipping_info?.phone || '-';
```

**상태**: ✅ **주문 상세는 정상 동작** (`shipping_info` fallback 사용)

**하지만**:
- ❌ **`guest_id` 표시 없음** (비회원 주문인지 명시적으로 표시 안 됨)

---

## ⚠️ 개선 필요 사항

### 1. 주문 목록 API 개선

**필요한 변경**:
```sql
SELECT 
    o.order_id,
    o.order_number,
    o.user_id,
    o.guest_id,              -- ✅ 추가
    o.total_price,
    o.status,
    o.shipping_name,
    o.shipping_email,        -- ✅ 추가
    o.shipping_phone,
    o.shipping_address,
    o.shipping_postal_code as shipping_zipcode,
    o.shipping_country,
    o.order_date as created_at,
    o.order_date as updated_at,
    u.email as customer_email,
    u.name as customer_name
FROM orders o
LEFT JOIN users u ON o.user_id = u.user_id
WHERE 1=1
```

**검색 기능 개선**:
```sql
if (search) {
    query += ' AND (o.order_number LIKE ? OR o.shipping_name LIKE ? OR o.shipping_email LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
    // ✅ o.shipping_email 추가
}
```

---

### 2. 프론트엔드 표시 개선

**주문 목록 테이블 개선**:
```javascript
const customerName = order.shipping_name || order.customer_name || '-';
const customerEmail = order.shipping_email || order.customer_email || '';  // ✅ shipping_email 우선
const isGuestOrder = !order.user_id && order.guest_id;  // ✅ 비회원 주문 구분

return `
  <tr data-order-id="${order.order_id}">
    <td>
      <strong>${order.order_number || `#${order.order_id}`}</strong>
      ${isGuestOrder ? '<br><small class="badge badge-secondary">비회원</small>' : ''}  <!-- ✅ 비회원 표시 -->
    </td>
    <td>${dateStr}</td>
    <td>
      ${customerName}<br>
      <small style="color: #6c757d;">${customerEmail}</small>  <!-- ✅ shipping_email 표시 -->
    </td>
    ...
  </tr>
`;
```

**주문 상세 모달 개선**:
```javascript
const isGuestOrder = !order.user_id && order.guest_id;
const customerName = order.customer_info?.name || order.shipping_info?.name || '-';
const customerEmail = order.customer_info?.email || order.shipping_info?.email || '-';
const customerPhone = order.customer_info?.phone || order.shipping_info?.phone || '-';

// 주문 정보 카드에 비회원 표시 추가
const orderInfoHtml = `
  <div class="detail-section">
    <h4>주문 정보</h4>
    <dl>
      <dt>주문번호</dt>
      <dd>${escapeHtml(order.order_number)}</dd>
      ${isGuestOrder ? `
      <dt>주문 유형</dt>
      <dd><span class="badge badge-secondary">비회원 주문</span></dd>
      <dt>Guest ID</dt>
      <dd><code>${escapeHtml(order.guest_id)}</code></dd>
      ` : `
      <dt>회원 ID</dt>
      <dd>${escapeHtml(order.user_id || '-')}</dd>
      `}
      <dt>고객명</dt>
      <dd>${escapeHtml(customerName)}</dd>
      <dt>이메일</dt>
      <dd>${escapeHtml(customerEmail)}</dd>
      <dt>전화번호</dt>
      <dd>${escapeHtml(customerPhone)}</dd>
      ...
    </dl>
  </div>
`;
```

---

## 📋 개선 작업 체크리스트

### 백엔드
- [ ] 주문 목록 API에 `guest_id` 추가
- [ ] 주문 목록 API에 `shipping_email` 추가
- [ ] 검색 기능에 `shipping_email` 추가

### 프론트엔드
- [ ] 주문 목록 테이블에 비회원 표시 추가
- [ ] 주문 목록 테이블에 `shipping_email` 표시
- [ ] 주문 상세 모달에 `guest_id` 표시
- [ ] 주문 상세 모달에 비회원 주문 구분 표시

---

## ✅ 결론

**현재 상태**:
- ✅ **비회원 주문도 조회 가능** (LEFT JOIN으로 포함됨)
- ✅ **주문 상세는 정상 동작** (`guest_id`, `shipping_email` 포함)
- ❌ **주문 목록에서 비회원 구분 및 이메일 표시 안 됨**
- ❌ **검색 기능에서 비회원 주문 이메일 검색 불가**

**권장 사항**:
위 개선 작업을 수행하여 관리자가 비회원 주문을 명확히 구분하고 관리할 수 있도록 개선하는 것을 권장합니다.
