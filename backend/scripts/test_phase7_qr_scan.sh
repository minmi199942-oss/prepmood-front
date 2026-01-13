#!/bin/bash
# ============================================================
# Phase 7 테스트: QR 스캔 로직 수정 검증
# ============================================================

echo "=========================================="
echo "Phase 7 테스트: QR 스캔 로직 수정 검증"
echo "=========================================="
echo ""

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="https://prepmood.kr"

# ============================================================
# 1. 테스트 데이터 확인
# ============================================================
echo -e "${YELLOW}=== 1. 테스트 데이터 확인 ===${NC}"
echo ""

# SQL 쿼리로 테스트용 토큰 확인
echo "테스트용 토큰 확인 중..."
mysql -u prepmood_user -p -e "
USE prepmood;
SELECT 
    tm.token,
    tm.token_pk,
    w.id as warranty_id,
    w.status,
    CASE 
        WHEN w.id IS NULL THEN 'warranty 없음 (404 예상)'
        WHEN w.status = 'revoked' THEN 'revoked 상태 (403 예상)'
        ELSE '정상 조회 가능'
    END AS test_scenario
FROM token_master tm
LEFT JOIN warranties w ON tm.token_pk = w.token_pk
WHERE tm.is_blocked = 0
ORDER BY w.id DESC
LIMIT 5;
"

echo ""
echo "위 결과를 보고 테스트할 토큰을 선택하세요."
echo ""

# ============================================================
# 2. 테스트 시나리오 안내
# ============================================================
echo -e "${YELLOW}=== 2. 테스트 시나리오 ===${NC}"
echo ""
echo "시나리오 1: warranty가 있는 경우 (정상 조회)"
echo "  - 예상: 200 OK, success.html 또는 warning.html 렌더링"
echo "  - 명령어: curl -L \"$BASE_URL/a/{TOKEN}\""
echo ""
echo "시나리오 2: warranty가 없는 경우 (404 에러)"
echo "  - 예상: 404, error.html 렌더링 (보증서 없음 메시지)"
echo "  - 명령어: curl -L \"$BASE_URL/a/{TOKEN}\""
echo ""
echo "시나리오 3: revoked 상태 warranty (403 에러)"
echo "  - 예상: 403, error.html 렌더링 (보증서 무효 메시지)"
echo "  - 명령어: curl -L \"$BASE_URL/a/{TOKEN}\""
echo ""

# ============================================================
# 3. 실제 테스트 실행 (예시)
# ============================================================
echo -e "${YELLOW}=== 3. 실제 테스트 실행 ===${NC}"
echo ""
echo "아래 명령어를 수동으로 실행하세요:"
echo ""
echo "# 예시 1: 정상 조회 (warranty 있음)"
echo "curl -L \"$BASE_URL/a/{TOKEN_WITH_WARRANTY}\""
echo ""
echo "# 예시 2: warranty 없음 (404)"
echo "curl -L \"$BASE_URL/a/{TOKEN_WITHOUT_WARRANTY}\""
echo ""
echo "# 예시 3: revoked 상태 (403)"
echo "curl -L \"$BASE_URL/a/{TOKEN_REVOKED}\""
echo ""

# ============================================================
# 4. 로그 확인
# ============================================================
echo -e "${YELLOW}=== 4. 로그 확인 ===${NC}"
echo ""
echo "서버 로그 확인:"
echo "pm2 logs prepmood-backend --lines 50"
echo ""

echo -e "${GREEN}테스트 준비 완료!${NC}"
