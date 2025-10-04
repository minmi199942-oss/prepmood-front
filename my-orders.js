// 내 주문 페이지 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 로그인 상태 확인
    checkLoginStatus();
    
    // 사용자 정보 표시
    displayUserInfo();
    
    // 주문 내역 표시
    displayOrderHistory();
    
    // 네비게이션 활성화
    initializeNavigation();
});

// 로그인 상태 확인
function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const userData = localStorage.getItem('user');
    
    if (!isLoggedIn || !userData) {
        // 비로그인 상태: 로그인 페이지로 리다이렉트
        alert('로그인이 필요한 페이지입니다.');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// 사용자 정보 표시
function displayUserInfo() {
    const userData = localStorage.getItem('user');
    
    if (userData) {
        try {
            const user = JSON.parse(userData);
            const welcomeText = document.getElementById('user-welcome-text');
            
            if (welcomeText && user.name) {
                welcomeText.textContent = `${user.name}님 환영합니다.`;
            }
        } catch (error) {
            console.error('사용자 정보 파싱 오류:', error);
        }
    }
}

// 주문 내역 표시 (임시 데이터)
function displayOrderHistory() {
    // 실제 환경에서는 API에서 주문 데이터를 가져와야 합니다
    const hasOrders = false; // 현재는 주문 없음으로 설정
    
    const ordersList = document.getElementById('orders-list');
    const noOrders = document.getElementById('no-orders');
    
    if (hasOrders) {
        ordersList.style.display = 'block';
        noOrders.style.display = 'none';
    } else {
        ordersList.style.display = 'none';
        noOrders.style.display = 'flex';
    }
}

// 네비게이션 초기화
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 모든 네비게이션 아이템에서 active 클래스 제거
            navItems.forEach(nav => {
                nav.classList.remove('active');
            });
            
            // 클릭된 아이템에 active 클래스 추가
            this.classList.add('active');
            
            // 페이지 이동 (실제 구현 시)
            const page = this.dataset.page;
            handleNavigation(page);
        });
    });
}

// 페이지 네비게이션 처리
function handleNavigation(page) {
    switch (page) {
        case 'orders':
            // 이미 내 주문 페이지에 있음
            break;
        case 'reservations':
            window.location.href = 'my-reservations.html';
            break;
        case 'profile':
            window.location.href = 'my-profile.html';
            break;
        default:
            console.log('알 수 없는 페이지:', page);
    }
}

// 주문 내역 데이터 로드 (실제 API 연동 시 사용)
async function loadOrderHistory() {
    try {
        const userData = JSON.parse(localStorage.getItem('user'));
        
        // 실제 API 호출
        const response = await fetch('https://prepmood.kr/api/orders', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userData.token}`, // JWT 토큰이 있다면
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const orders = await response.json();
            displayOrders(orders);
        } else {
            console.error('주문 내역 로드 실패:', response.statusText);
            displayOrderHistory(); // 기본 상태 표시
        }
    } catch (error) {
        console.error('주문 내역 로드 오류:', error);
        displayOrderHistory(); // 기본 상태 표시
    }
}

// 주문 목록 표시
function displayOrders(orders) {
    const ordersList = document.getElementById('orders-list');
    const noOrders = document.getElementById('no-orders');
    
    if (orders && orders.length > 0) {
        ordersList.style.display = 'block';
        noOrders.style.display = 'none';
        
        // 주문 목록 HTML 생성
        const ordersHTML = orders.map(order => `
            <div class="order-item">
                <div class="order-image">
                    <img src="${order.productImage || 'image/product-placeholder.jpg'}" 
                         alt="${order.productName}" 
                         class="product-image">
                </div>
                <div class="order-details">
                    <h3 class="product-name">${order.productName}</h3>
                    <p class="order-number">주문번호: ${order.orderNumber}</p>
                    <p class="order-price">₩${order.price.toLocaleString()}</p>
                    <p class="order-status status-${order.status}">${getStatusText(order.status)}</p>
                </div>
            </div>
        `).join('');
        
        // 주문 목록 앞부분만 교체 (버튼은 유지)
        const buttonContainer = ordersList.querySelector('.shopping-button-container');
        ordersList.innerHTML = ordersHTML + buttonContainer.outerHTML;
    } else {
        ordersList.style.display = 'none';
        noOrders.style.display = 'flex';
    }
}

// 주문 상태 텍스트 변환
function getStatusText(status) {
    const statusMap = {
        'pending': '주문 확인 중',
        'confirmed': '주문 확인됨',
        'shipping': '배송 중',
        'delivered': '배송 완료',
        'cancelled': '주문 취소'
    };
    
    return statusMap[status] || status;
}

// 로그아웃 처리 (헤더에서 호출될 수 있음)
function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// 전역 함수로 등록 (헤더에서 사용할 수 있도록)
window.handleLogout = handleLogout;
