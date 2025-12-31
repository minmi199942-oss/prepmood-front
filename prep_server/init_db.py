"""
DB 초기화 스크립트
Gunicorn 실행 전에 한 번만 실행하거나, systemd 서비스 시작 시 실행
"""

import os
import sys

# app.py의 init_database 함수 import
sys.path.insert(0, os.path.dirname(__file__))
from app import init_database

if __name__ == '__main__':
    print("=" * 50)
    print("Pre.p Mood 정품 인증 DB 초기화")
    print("=" * 50)
    init_database()
    print("초기화 완료!")








