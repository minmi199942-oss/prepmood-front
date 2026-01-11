# products.xlsx 파일 업로드 대안 방법

## 🔍 문제: SSH 연결 거부

**증상:**
```
Connection closed by 159.223.48.239 port 22
```

**가능한 원인:**
1. SSH 서비스 미실행
2. 방화벽이 포트 22 차단
3. SSH 서버 설정 문제
4. 특정 IP만 허용

---

## ✅ 해결 방법

### 방법 1: VPS에서 직접 파일 생성 (가장 간단)

VPS에 이미 접속할 수 있다면, 로컬 파일을 VPS에서 직접 생성할 수 있습니다.

**Step 1: 로컬에서 파일 내용 확인**

```powershell
# PowerShell에서 실행
cd C:\Users\minmi\Documents\00-html-play\project-root

# 파일이 존재하는지 확인
Get-Item products.xlsx | Select-Object Length
```

**Step 2: Base64 인코딩으로 파일 내용 추출 (선택사항)**

파일이 작다면 (10KB 이하), Base64로 인코딩하여 VPS에 직접 붙여넣을 수 있습니다.

---

### 방법 2: Git을 통한 일시적 업로드 (권장)

`products.xlsx` 파일을 일시적으로 Git에 추가하여 자동 배포로 전달할 수 있습니다.

**주의:** 파일이 크면 Git에 적합하지 않을 수 있습니다.

**Step 1: .gitignore에서 products.xlsx 제외 (일시적)**

```bash
# .gitignore 파일 확인
cat .gitignore | grep products.xlsx

# products.xlsx가 .gitignore에 있으면 일시적으로 주석 처리
```

**Step 2: Git에 추가 및 푸시**

```bash
# 로컬에서 실행
cd C:\Users\minmi\Documents\00-html-play\project-root

git add products.xlsx
git commit -m "temp: add products.xlsx for VPS deployment"
git push origin main
```

**Step 3: 자동 배포 후 VPS에서 파일 이동**

```bash
# VPS에서 실행
cd /root/prepmood-repo
cp products.xlsx /var/www/html/products.xlsx

# 권한 설정
chown www-data:www-data /var/www/html/products.xlsx
chmod 644 /var/www/html/products.xlsx
```

**Step 4: Git에서 제거 (선택사항)**

```bash
# 로컬에서 실행
git rm --cached products.xlsx
git commit -m "chore: remove products.xlsx from git (use scp instead)"
git push origin main
```

---

### 방법 3: SFTP 클라이언트 사용 (WinSCP, FileZilla)

GUI 도구를 사용하면 더 쉽게 파일을 업로드할 수 있습니다.

**WinSCP 설정:**
- 호스트: `159.223.48.239`
- 사용자: `root`
- 포트: `22` (SSH가 다른 포트라면 변경)
- 프로토콜: `SFTP` 또는 `SCP`

**FileZilla 설정:**
- 호스트: `sftp://159.223.48.239`
- 사용자: `root`
- 포트: `22`

---

### 방법 4: VPS SSH 설정 확인 및 수정

VPS에 접속할 수 있다면, SSH 설정을 확인할 수 있습니다.

**Step 1: VPS에서 SSH 서비스 상태 확인**

```bash
# VPS에서 실행 (다른 방법으로 접속 가능하다면)
systemctl status sshd
# 또는
systemctl status ssh
```

**Step 2: SSH 포트 확인**

```bash
# VPS에서 실행
netstat -tlnp | grep :22
# 또는
ss -tlnp | grep :22
```

**Step 3: 방화벽 확인**

```bash
# UFW 사용 시
ufw status

# iptables 사용 시
iptables -L -n | grep 22
```

**Step 4: SSH 서비스 재시작**

```bash
# VPS에서 실행
systemctl restart sshd
# 또는
systemctl restart ssh
```

---

### 방법 5: VPS에서 직접 파일 다운로드

VPS가 인터넷에 접속 가능하다면, GitHub이나 다른 곳에서 파일을 다운로드할 수 있습니다.

**GitHub에 업로드 후:**

```bash
# VPS에서 실행
cd /var/www/html
wget https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/products.xlsx
# 또는
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/products.xlsx

# 권한 설정
chown www-data:www-data products.xlsx
chmod 644 products.xlsx
```

---

## 🎯 권장 순서

1. **방법 2 (Git을 통한 업로드)**: 가장 간단하고 안전
2. **방법 3 (SFTP 클라이언트)**: GUI 사용 가능
3. **방법 4 (SSH 설정 확인)**: 근본 원인 해결
4. **방법 1 (직접 생성)**: 파일이 작다면 가능

---

## 📝 참고사항

- `products.xlsx` 파일 크기 확인: 약 10KB (43행)
- Git에 추가하기 적합한 크기
- 자동 배포 시스템을 통해 전달 가능
