"""
정품 인증 서버 (Flask + SQLite)
Phase 2: QR 코드 스캔 시 정품 인증 처리
운영 환경: Gunicorn + systemd
"""

import os
import sqlite3
import csv
import glob
from datetime import datetimeㅎㅎ
from flask import Flask, render_template, jsonify

app = Flask(__name__)

# 설정
DB_PATH = os.path.join(os.path.dirname(__file__), "prep.db")
CSV_PATTERN = os.path.join(os.path.dirname(__file__), "mapping_result_*.csv")


def init_database():
    """데이터베이스 초기화 및 CSV 데이터 로드"""
    db_exists = os.path.exists(DB_PATH)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # products 테이블 생성
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            token TEXT PRIMARY KEY,
            internal_code TEXT NOT NULL,
            product_name TEXT NOT NULL,
            status INTEGER DEFAULT 0,
            scan_count INTEGER DEFAULT 0,
            first_verified_at TEXT,
            last_verified_at TEXT
        )
    """)
    
    # DB가 이미 존재하면 CSV 로드 건너뛰기 (기존 인증 기록 유지)
    if db_exists:
        print(f"[INFO] 기존 DB 발견: {DB_PATH} - CSV 로드 건너뜀 (기존 기록 유지)")
        conn.commit()
        conn.close()
        return
    
    # CSV 파일 찾기
    csv_files = glob.glob(CSV_PATTERN)
    
    if not csv_files:
        print(f"[WARN] CSV 파일을 찾을 수 없습니다: {CSV_PATTERN}")
        conn.commit()
        conn.close()
        return
    
    # 가장 최근 CSV 파일 사용 (파일명에 타임스탬프가 있다면)
    csv_file = sorted(csv_files)[-1]
    print(f"[INFO] CSV 파일 로드: {csv_file}")
    
    # CSV 읽기 및 DB 삽입
    loaded_count = 0
    with open(csv_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            token = row.get('token', '').strip()
            internal_code = row.get('internal_code', '').strip()
            product_name = row.get('product_name', '').strip()
            
            if not token or not internal_code or not product_name:
                continue
            
            # 중복 체크 (이미 있으면 건너뛰기)
            cursor.execute("SELECT token FROM products WHERE token = ?", (token,))
            if cursor.fetchone():
                continue
            
            cursor.execute("""
                INSERT INTO products (token, internal_code, product_name, status, scan_count)
                VALUES (?, ?, ?, 0, 0)
            """, (token, internal_code, product_name))
            loaded_count += 1
    
    conn.commit()
    conn.close()
    print(f"[INFO] {loaded_count}개의 제품 데이터를 DB에 로드했습니다.")


def get_product_by_token(token):
    """토큰으로 제품 정보 조회"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 딕셔너리처럼 접근 가능
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT token, internal_code, product_name, status, scan_count, 
               first_verified_at, last_verified_at
        FROM products
        WHERE token = ?
    """, (token,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None


def update_first_verification(token):
    """첫 인증 처리 (status=0 -> 1)"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE products
        SET status = 1,
            first_verified_at = ?,
            last_verified_at = ?,
            scan_count = 1
        WHERE token = ?
    """, (now, now, token))
    
    conn.commit()
    conn.close()


def update_re_verification(token):
    """재인증 처리 (status >= 1)"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE products
        SET last_verified_at = ?,
            scan_count = scan_count + 1
        WHERE token = ?
    """, (now, token))
    
    conn.commit()
    conn.close()


@app.route('/a/<token>')
def verify_product(token):
    """
    정품 인증 라우트
    
    Case A: 토큰 없음 -> fake.html
    Case B: 첫 인증 (status=0) -> success.html
    Case C: 재인증 (status>=1) -> warning.html
    """
    product = get_product_by_token(token)
    
    # Case A: 토큰이 DB에 없음
    if not product:
        return render_template('fake.html'), 200
    
    # Case B: 첫 인증 (status = 0)
    if product['status'] == 0:
        update_first_verification(token)
        # 업데이트된 정보 다시 가져오기
        product = get_product_by_token(token)
        return render_template('success.html', 
                             product=product,
                             verified_at=product['first_verified_at']), 200
    
    # Case C: 재인증 (status >= 1)
    update_re_verification(token)
    # 업데이트된 정보 다시 가져오기
    product = get_product_by_token(token)
    return render_template('warning.html',
                         product=product,
                         first_verified_at=product['first_verified_at']), 200


@app.route('/health')
def health():
    """헬스체크 엔드포인트 (모니터링용)"""
    return jsonify({
        'status': 'ok',
        'service': 'prepmood-auth',
        'timestamp': datetime.now().isoformat()
    }), 200


@app.route('/')
def index():
    """홈페이지 (간단한 안내)"""
    return """
    <html>
        <head>
            <title>Pre.p Mood 정품 인증 서버</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
            <h1>Pre.p Mood 정품 인증 서버</h1>
            <p>QR 코드를 스캔하여 정품 인증을 진행하세요.</p>
            <p>URL 형식: <code>https://prepmood.kr/a/&lt;token&gt;</code></p>
            <p><a href="/health">헬스체크</a></p>
        </body>
    </html>
    """


# 서버 시작 시 DB 초기화
# Gunicorn에서는 worker가 시작될 때마다 호출되므로 주의
# 실제로는 별도 스크립트로 초기화하거나, 첫 요청 시 지연 로드하는 것이 좋음
if __name__ == '__main__':
    print("=" * 50)
    print("Pre.p Mood 정품 인증 서버 시작")
    print("=" * 50)
    
    # 개발 모드에서만 자동 초기화
    init_database()
    
    print("\n서버 실행 중...")
    print("접속: http://localhost:5000/a/<token>")
    print("\n종료: Ctrl+C\n")
    
    app.run(debug=False, host='127.0.0.1', port=5000)
else:
    # Gunicorn으로 실행될 때는 첫 요청 시 지연 초기화
    # 또는 별도 초기화 스크립트 사용 권장
    pass








