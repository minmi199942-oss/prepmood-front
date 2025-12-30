# 003 마이그레이션 Preflight 체크

## UUID 중복 확인 (마이그레이션 실행 전 필수)

003 마이그레이션을 실행하기 전에, 기존 데이터에 `public_id` 중복이 있는지 확인합니다.

### 실행 방법

```bash
mysql -h "$DB_HOST" -u "$DB_USER" -p -D prepmood -e "
SELECT public_id, COUNT(*) AS cnt
FROM warranties
WHERE public_id IS NOT NULL
GROUP BY public_id
HAVING cnt > 1;"
```

### 결과 해석

- **0 rows**: 정상 → 003 마이그레이션 실행 가능
- **1줄 이상**: 중복 발견 → 003 실행하지 말고 원인부터 처리

### 주의사항

- UUID 중복은 사실상 불가능하지만, 안전을 위해 확인합니다.
- 중복이 발견되면 마이그레이션을 실행하지 말고 원인을 조사하세요.
- 003 마이그레이션 실행 후에는 `public_id`에 UNIQUE 제약이 걸리므로, 중복이 있으면 마이그레이션이 실패합니다.

