-- Google 소셜 로그인을 위한 users 테이블 수정

-- google_id 컬럼 추가 (Google 사용자 고유 ID)
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;

-- profile_picture 컬럼 추가 (프로필 이미지 URL)
ALTER TABLE users ADD COLUMN profile_picture TEXT;

-- email_verified 컬럼 추가 (이메일 인증 상태)
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;

-- google_id에 대한 인덱스 생성 (빠른 검색을 위해)
CREATE INDEX idx_users_google_id ON users(google_id);

-- 기존 이메일 인증 시스템과의 호환성을 위해 email_verified 기본값 설정
UPDATE users SET email_verified = TRUE WHERE email IS NOT NULL;

-- 테이블 구조 확인
DESCRIBE users;
