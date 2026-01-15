# VPS 빠른 수정 가이드

## 문제
`paid-event-creator.js` 180번 라인에 중복된 `catch` 블록이 있어서 서버가 시작되지 않음

## 해결 방법

### 방법 1: Git pull (권장)

```bash
cd /var/www/html/backend
git pull origin main
pm2 restart prepmood-backend
```

### 방법 2: 직접 수정

```bash
cd /var/www/html/backend/utils

# 백업
cp paid-event-creator.js paid-event-creator.js.backup

# 180-193번 라인 삭제
sed -i '180,193d' paid-event-creator.js

# 179번 라인 다음에 새 코드 추가
cat >> paid-event-creator.js << 'EOF'
    
    // 모든 재시도 실패 (이 코드는 도달하지 않아야 하지만 방어 코드)
    throw new Error('paid_events 생성 실패: 모든 재시도 실패');
EOF

# PM2 재시작
pm2 restart prepmood-backend
```

### 방법 3: nano로 직접 편집

```bash
cd /var/www/html/backend/utils
nano paid-event-creator.js
```

**수정 내용**:
- 180번 라인의 `} catch (error) {`부터 193번 라인까지 삭제
- 179번 라인 다음에 다음 코드 추가:
  ```javascript
      
      // 모든 재시도 실패 (이 코드는 도달하지 않아야 하지만 방어 코드)
      throw new Error('paid_events 생성 실패: 모든 재시도 실패');
  ```

## 확인

```bash
# 파일 확인
sed -n '175,185p' /var/www/html/backend/utils/paid-event-creator.js

# PM2 상태 확인
pm2 status

# 로그 확인 (에러 없어야 함)
pm2 logs prepmood-backend --lines 10 --nostream
```
