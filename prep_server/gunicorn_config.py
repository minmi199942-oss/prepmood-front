# Gunicorn 설정 파일
import multiprocessing
import os

# 서버 소켓
bind = "127.0.0.1:5000"  # 내부 포트만 (Nginx가 프록시)
backlog = 2048

# Worker 프로세스
# CPU 코어 수 * 2 + 1 (일반적인 공식)
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"
worker_connections = 1000
timeout = 30
keepalive = 2

# 로깅
log_dir = "/var/log/prepmood"
os.makedirs(log_dir, exist_ok=True)

accesslog = os.path.join(log_dir, "gunicorn_access.log")
errorlog = os.path.join(log_dir, "gunicorn_error.log")
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# 프로세스 이름
proc_name = "prepmood_auth"

# 데몬 모드 (systemd가 관리하므로 False)
daemon = False

# Graceful timeout
graceful_timeout = 30

# Max requests (메모리 누수 방지)
max_requests = 1000
max_requests_jitter = 50








