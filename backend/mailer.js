// MailerSend 이메일 서비스
const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');
require('dotenv').config();

// MailerSend 초기화
const mailerSend = new MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY
});

// 이메일 전송 함수
const sendVerificationEmail = async (to, verificationCode) => {
    try {
        console.log('📧 MailerSend 이메일 전송 시작...');
        console.log(`📬 수신자: ${to}`);
        console.log(`🔐 인증 코드: ${verificationCode}`);

        // 디버깅: .env 값들 출력
        console.log('🔍 디버깅 정보:');
        console.log(`📋 MAILERSEND_API_KEY: ${process.env.MAILERSEND_API_KEY ? '설정됨' : '설정되지 않음'}`);
        console.log(`📋 MAILERSEND_FROM_EMAIL: ${process.env.MAILERSEND_FROM_EMAIL}`);
        console.log(`📋 TO_EMAIL: ${to}`);

        // API 키 확인
        if (!process.env.MAILERSEND_API_KEY) {
            console.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
            return { 
                success: false, 
                error: 'MAILERSEND_API_KEY가 설정되지 않았습니다.',
                service: 'mailersend'
            };
        }

        // 발신자 설정 (MailerSend에 등록된 도메인)
        const sentFrom = new Sender(process.env.MAILERSEND_FROM_EMAIL, "Pre.p Mood");
        
        // 수신자 설정
        const recipients = [new Recipient(to, to)];

        // 이메일 파라미터 설정
        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setReplyTo(sentFrom)
            .setSubject('[Pre.p Mood] 이메일 인증 코드')
            .setHtml(`
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
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #007bff;">
                            <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 0; font-family: 'Courier New', monospace;">
                                ${verificationCode}
                            </h1>
                        </div>
                        
                        <p style="color: #999; font-size: 14px; margin-top: 20px;">
                            이 코드는 10분간 유효합니다.
                        </p>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-top: 20px;">
                            <p style="color: #856404; margin: 0; font-size: 14px;">
                                <strong>보안 안내:</strong> 이 코드를 다른 사람과 공유하지 마세요.
                            </p>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
                        <p>본 메일은 발신전용입니다. 문의사항은 고객센터를 이용해주세요.</p>
                        <p>&copy; 2025 Pre.p Mood. All rights reserved.</p>
                    </div>
                </div>
            `)
            .setText(`
Pre.p Mood - 이메일 인증

안녕하세요!

회원가입을 완료하기 위해 아래 인증 코드를 입력해주세요.

인증 코드: ${verificationCode}

이 코드는 10분간 유효합니다.

보안 안내: 이 코드를 다른 사람과 공유하지 마세요.

Pre.p Mood
Timeless lines, Refined Vibes
            `);

        // 이메일 전송
        console.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);
        
        // 디버깅: response 정보 출력
        console.log('🔍 MailerSend Response 디버깅:');
        console.log(`📋 Status Code: ${response.statusCode}`);
        console.log(`📋 Response Body:`, JSON.stringify(response.body, null, 2));
        console.log(`📋 Full Response:`, JSON.stringify(response, null, 2));
        
        // Message ID 확인
        const messageId = response.body?.message_id || response.messageId;
        console.log(`📧 Message ID: ${messageId}`);
        
        // Status Code 확인
        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}, Body: ${JSON.stringify(response.body)}`;
            console.error('❌ MailerSend API 오류 발생:');
            console.error(`📋 Status Code: ${response.statusCode}`);
            console.error(`📋 Response Body:`, JSON.stringify(response.body, null, 2));
            console.error(`📋 Error Details:`, response.body?.errors || 'No error details');
            throw new Error(errorMessage);
        }
        
        console.log('✅ MailerSend 이메일 전송 성공!');
        console.log(`📧 Message ID: ${messageId}`);
        
        return { 
            success: true, 
            messageId: messageId,
            service: 'mailersend'
        };
        
    } catch (error) {
        console.error('❌ MailerSend 이메일 전송 실패:');
        console.error('📋 에러 상세:', JSON.stringify(error, null, 2));
        console.error('🔍 에러 메시지:', error.message);
        console.error('📍 에러 스택:', error.stack);
        
        return { 
            success: false, 
            error: error.message,
            service: 'mailersend'
        };
    }
};

// MailerSend 연결 테스트 함수
const testConnection = async () => {
    try {
        console.log('🔍 MailerSend 연결 테스트 시작...');
        
        if (!process.env.MAILERSEND_API_KEY) {
            console.log('⚠️ MAILERSEND_API_KEY가 설정되지 않았습니다.');
            console.log('💡 .env 파일에 MAILERSEND_API_KEY를 설정해주세요.');
            return false;
        }

        // 간단한 테스트 이메일 전송
        const sentFrom = new Sender(process.env.MAILERSEND_FROM_EMAIL, "Pre.p Mood Test");
        const recipients = [new Recipient(process.env.MAILERSEND_FROM_EMAIL, "Test")];
        
        const testEmail = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setSubject('MailerSend 연결 테스트')
            .setText('MailerSend 연결이 성공적으로 설정되었습니다.')
            .setHtml('<p>MailerSend 연결이 성공적으로 설정되었습니다.</p>');

        console.log('📤 테스트 이메일 전송 중...');
        const response = await mailerSend.email.send(testEmail);
        
        console.log('✅ MailerSend 연결 테스트 성공!');
        console.log(`📧 테스트 Message ID: ${response.messageId}`);
        return true;
        
    } catch (error) {
        console.error('❌ MailerSend 연결 테스트 실패:');
        console.error('📋 에러 상세:', JSON.stringify(error, null, 2));
        console.error('🔍 에러 메시지:', error.message);
        return false;
    }
};

module.exports = {
    sendVerificationEmail,
    testConnection
};