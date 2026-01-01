# 이미지 경로 처리 설명

## 현재 상황

### 1. 기존 이미지 (코딩으로 지정된 이미지)
- **저장 위치**: `/var/www/html/image/` 폴더
- **DB 저장 형식**: 파일명만 저장 (예: `Fabric-Tie-Skinny.jpg`, `ACC-Fabric-Tie-Solid.jpg`)
- **예시 데이터**:
  ```sql
  image: 'Fabric-Tie-Skinny.jpg'
  image: 'ACC-Fabric-Tie-Solid.jpg'
  image: 'Outer-LeStripe-Suit.jpg'
  ```

### 2. 새로 업로드된 이미지 (관리자 페이지에서 추가)
- **저장 위치**: `/var/www/html/uploads/products/` 폴더
- **DB 저장 형식**: 전체 경로 저장 (예: `/uploads/products/product-1767263501176-739858794.webp`)
- **예시 데이터**:
  ```sql
  image: '/uploads/products/product-1767263501176-739858794.webp'
  ```

## 프론트엔드 이미지 경로 처리

### 현재 구현 상태

#### ✅ catalog-script.js (카탈로그 페이지)
- **처리 로직**: 이미지 경로를 동적으로 처리
  - `/uploads/`로 시작 → 그대로 사용 (새로 업로드된 이미지)
  - `/image/`로 시작 → 그대로 사용 (기존 이미지)
  - 상대 경로 → `/image/` 추가
- **상태**: ✅ 정상 작동

#### ⚠️ buy-script.js (상품 상세 페이지)
- **처리 로직**: 항상 `image/${product.image}` 형식 사용
- **문제**: 새로 업로드된 이미지(`/uploads/products/...`)는 처리하지 못함
- **상태**: ⚠️ 수정 필요

#### ✅ search.html (검색 페이지)
- **처리 로직**: `/image/` 접두사 추가
- **상태**: ✅ 정상 작동 (기존 이미지만 사용하는 경우)

## 해결 방안

### 옵션 1: 기존 이미지 유지 + 새 이미지 지원 (권장)
- **기존 이미지**: `/image/` 폴더에 그대로 유지
- **새 이미지**: `/uploads/products/` 폴더에 저장
- **프론트엔드**: 두 경로 모두 지원하도록 수정

### 옵션 2: 모든 이미지를 `/uploads/products/`로 통일
- **기존 이미지**: `/image/`에서 `/uploads/products/`로 이동
- **DB 업데이트**: 모든 이미지 경로를 `/uploads/products/` 형식으로 변경
- **장점**: 경로 통일
- **단점**: 기존 이미지 파일 이동 필요, DB 업데이트 필요

## 권장 사항

**옵션 1을 권장합니다:**
- 기존 이미지는 그대로 유지
- 새로 추가하는 이미지만 `/uploads/products/`에 저장
- 프론트엔드에서 두 경로 모두 지원

이렇게 하면:
- ✅ 기존 이미지가 계속 작동
- ✅ 새 이미지도 정상 작동
- ✅ 마이그레이션 불필요

