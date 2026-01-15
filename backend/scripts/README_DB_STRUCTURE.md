# DB 구조 파일 업데이트 가이드

## 📋 목적

이 디렉토리의 `db_structure_actual.txt` 파일은 **실제 VPS DB 구조의 스냅샷**입니다.
마이그레이션 스크립트 작성 시 이 파일을 참조하여 정확한 테이블/컬럼 구조를 확인할 수 있습니다.

---

## 🔄 업데이트 방법

### VPS에서 실행

```bash
# 1. DB 구조 추출
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/show_db_structure.sql > /tmp/db_structure.txt 2>&1

# 2. 파일 확인
cat /tmp/db_structure.txt | head -50
```

### 로컬로 다운로드

**방법 1: scp 사용 (Windows PowerShell 또는 Git Bash) - 권장**
```bash
# 로컬에서 실행
scp root@prepmood.kr:/tmp/db_structure.txt backend/scripts/db_structure_actual.txt
```

**방법 2: 파일을 여러 부분으로 나눠서 확인 (VPS에서)**
```bash
# VPS에서 실행 - 파일 크기 확인
wc -l /tmp/db_structure.txt

# 첫 100줄 확인
head -n 100 /tmp/db_structure.txt

# 중간 부분 확인 (예: 200-300줄)
sed -n '200,300p' /tmp/db_structure.txt

# 마지막 100줄 확인
tail -n 100 /tmp/db_structure.txt

# 특정 테이블만 찾기 (예: warranties)
grep -A 20 "warranties" /tmp/db_structure.txt
```

**방법 3: 파일을 압축해서 다운로드**
```bash
# VPS에서 실행
gzip /tmp/db_structure.txt

# 로컬에서 다운로드
scp root@prepmood.kr:/tmp/db_structure.txt.gz backend/scripts/

# 로컬에서 압축 해제 (Windows PowerShell)
# gzip이 없으면 7-Zip 사용
```

**방법 4: 파일을 프로젝트 디렉토리로 복사 후 자동 배포**
```bash
# VPS에서 실행
cp /tmp/db_structure.txt /root/prepmood-repo/backend/scripts/db_structure_actual.txt

# Git에 커밋/푸시하면 자동 배포됨
cd /root/prepmood-repo
git add backend/scripts/db_structure_actual.txt
git commit -m "docs: update actual DB structure snapshot"
git push
```

---

## 📝 사용 방법

마이그레이션 스크립트 작성 전:
1. `db_structure_actual.txt` 파일 열기
2. 관련 테이블 구조 확인
3. 컬럼명, 타입, NULL 허용 여부 확인
4. 마이그레이션 스크립트 작성

---

## ⚠️ 중요

- 이 파일은 **실제 DB 구조의 스냅샷**입니다
- DB 구조가 변경되면 **반드시 업데이트**해야 합니다
- 마이그레이션 실행 후 업데이트 권장

---

## 📅 업데이트 이력

- 2026-01-15: 초기 생성 (show_db_structure.sql 실행 결과)
