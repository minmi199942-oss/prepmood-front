const nodemailer = require('nodemailer');
require('dotenv').config();

// 네이버 SMTP 설정
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// 이메일 전송 함수
const sendVerificationEmail = async (to, verificationCode) => {
    try {
        const mailOptions = {
            from: `"Pre.p Mood" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: '[Pre.p Mood] 이메일 인증 코드',
            html: `
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #333; margin: 0;">Pre.p Mood</h1>
                        <p style="color: #666; margin: 5px 0;">Timeless lines, Refined Vibes</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
                        <h2 style="color: #333; margin-bottom: 20px;">이메일 인증</h2>
                        <p style="color: #666; margin-bottom: 30px;">
                            회원가입을 완료하기 위해 아래 인증 코드를 입력해주세요.
                        </p>
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 0;">
                                ${verificationCode}
                            </h1>
                        </div>
                        
                        <p style="color: #999; font-size: 14px; margin-top: 20px;">
                            이 코드는 10분간 유효합니다.
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
                        <p>본 메일은 발신전용입니다. 문의사항은 고객센터를 이용해주세요.</p>
                        <p>&copy; 2025 Pre.p Mood. All rights reserved.</p>
                    </div>
                </div>
            `
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('✅ 이메일 전송 성공:', result.messageId);
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        console.error('❌ 이메일 전송 실패:', error);
        return { success: false, error: error.message };
    }
};

// 연결 테스트 함수
const testConnection = async () => {
    try {
        await transporter.verify();
        console.log('✅ SMTP 서버 연결 성공!');
        return true;
    } catch (error) {
        console.error('❌ SMTP 서버 연결 실패:', error);
        return false;
    }
};

module.exports = {
    sendVerificationEmail,
    testConnection
};
