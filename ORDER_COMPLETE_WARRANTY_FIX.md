# Order Complete 및 Warranty 상세 페이지 수정 사항

## 문제 요약

1. **order-complete 페이지**: 로그인 상태에서 주문했는데 "비회원 주문 세션 발급 실패" 에러 발생
2. **보증서 상세 페이지**: 500 에러 발생, 제품명이 없음

---

## 수정 사항

### 1. 보증서 상세 조회 API 수정 (`backend/auth-routes.js`)

**문제**: `warranties` 테이블에 `user_id` 컬럼이 없고 `owner_user_id` 컬럼이 있는데, 코드에서 `user_id`를 사용하고 있었음.

**수정**:
```javascript
// 수정 전
WHERE public_id = ? AND user_id = ?

// 수정 후
WHERE public_id = ? AND owner_user_id = ?
```

**위치**: `backend/auth-routes.js` 861줄

---

### 2. Order Complete 페이지 회원/비회원 구분 로직 수정

**문제**: 
- `processPaidOrder`에서 회원/비회원 모두 `guest_access_token`을 생성함 (이메일 링크 통일을 위해)
- `order-complete-script.js`에서 `guestToken`이 있으면 무조건 비회원 주문으로 처리하고 있었음
- 회원 주문인 경우에도 `guestToken`이 있어서 비회원 주문으로 잘못 처리됨

**수정**:

#### 2-1. `backend/payments-routes.js` - 응답에 `user_id` 추가
```javascript
res.json({
    success: true,
    data: {
        // ... 기존 필드들
        // ⚠️ 회원/비회원 구분을 위한 user_id 포함
        user_id: order.user_id,
        // ⚠️ 비회원 주문인 경우 guest_order_access_token 포함 (회원 주문이어도 이메일 링크용으로 생성됨)
        guest_access_token: guestAccessToken
    }
});
```

#### 2-2. `order-complete-script.js` - `user_id`로 회원/비회원 구분
```javascript
// ⚠️ 회원/비회원 구분: user_id가 있으면 회원 주문, 없으면 비회원 주문
const userId = result.data?.user_id;
const guestToken = result.data?.guest_access_token;

if (userId) {
  // 회원 주문: 기존 방식대로 조회
  await loadOrderDetails(orderId);
} else if (guestToken) {
  // 비회원 주문: guestToken과 함께 주문 조회
  await loadGuestOrderDetails(orderId, guestToken);
} else {
  // user_id도 없고 guestToken도 없는 경우 (예외 상황)
  console.warn('⚠️ 주문 타입을 확인할 수 없습니다. 회원 주문으로 시도합니다.');
  await loadOrderDetails(orderId);
}
```

---

## 검증 방법

### 1. 보증서 상세 페이지 테스트

1. 회원으로 로그인
2. 주문 완료 후 보증서 목록에서 보증서 클릭
3. 보증서 상세 페이지가 정상적으로 로드되는지 확인
4. 제품명이 정상적으로 표시되는지 확인

**예상 결과**:
- ✅ 500 에러 없음
- ✅ 제품명 정상 표시
- ✅ 보증서 정보 정상 표시

### 2. Order Complete 페이지 테스트

#### 회원 주문 테스트
1. 회원으로 로그인
2. 주문 및 결제 완료
3. `order-complete.html` 페이지 확인

**예상 결과**:
- ✅ "비회원 주문 세션 발급 실패" 에러 없음
- ✅ 주문 정보 정상 표시
- ✅ 회원 주문으로 처리됨

#### 비회원 주문 테스트
1. 로그아웃 상태
2. 주문 및 결제 완료
3. `order-complete.html` 페이지 확인

**예상 결과**:
- ✅ 비회원 주문으로 정상 처리
- ✅ 주문 정보 정상 표시

---

## 추가 확인 사항

### warranties 테이블 구조 확인

**실제 컬럼명**: `owner_user_id` (NOT `user_id`)

**확인 쿼리**:
```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('user_id', 'owner_user_id')
ORDER BY ORDINAL_POSITION;
```

**예상 결과**:
- `owner_user_id` 컬럼 존재 (NULL 허용)
- `user_id` 컬럼 없음

---

## 참고

- **warranties 테이블 마이그레이션**: `028_add_warranties_columns.sql`
  - `user_id` → `owner_user_id`로 변경됨
- **guest_order_access_tokens**: 회원/비회원 모두 이메일 링크 통일을 위해 생성됨
- **SSOT 문서**: `SYSTEM_FLOW_DETAILED.md`, `SCHEMA_SSOT.md`
