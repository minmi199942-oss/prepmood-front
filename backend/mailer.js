// MailerSend 이메일 서비스
const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');
const Logger = require('./logger');
require('dotenv').config();

// MailerSend 초기화
const mailerSend = new MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY
});

// 이메일 전송 함수
const sendVerificationEmail = async (to, verificationCode) => {
    try {
        Logger.log('📧 MailerSend 이메일 전송 시작...');
        Logger.log(`📬 수신자: ${to}`);
        Logger.log(`🔐 인증 코드: ${verificationCode}`);

        // 디버깅: .env 값들 출력
        Logger.log('🔍 디버깅 정보:');
        Logger.log(`📋 MAILERSEND_API_KEY: ${process.env.MAILERSEND_API_KEY ? '설정됨' : '설정되지 않음'}`);
        Logger.log(`📋 MAILERSEND_FROM_EMAIL: ${process.env.MAILERSEND_FROM_EMAIL}`);
        Logger.log(`📋 TO_EMAIL: ${to}`);

        // API 키 확인
        if (!process.env.MAILERSEND_API_KEY) {
            Logger.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
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
        Logger.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);
        
        // 디버깅: response 정보 출력
        Logger.log('🔍 MailerSend Response 디버깅:');
        Logger.log(`📋 Status Code: ${response.statusCode}`);
        Logger.log(`📋 Response Body:`, JSON.stringify(response.body, null, 2));
        Logger.log(`📋 Full Response:`, JSON.stringify(response, null, 2));
        
        // Message ID 확인
        const messageId = response.body?.message_id || response.messageId;
        Logger.log(`📧 Message ID: ${messageId}`);
        
        // Status Code 확인
        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}, Body: ${JSON.stringify(response.body)}`;
            Logger.error('❌ MailerSend API 오류 발생:');
            Logger.error(`📋 Status Code: ${response.statusCode}`);
            Logger.error(`📋 Response Body:`, JSON.stringify(response.body, null, 2));
            Logger.error(`📋 Error Details:`, response.body?.errors || 'No error details');
            throw new Error(errorMessage);
        }
        
        Logger.log('✅ MailerSend 이메일 전송 성공!');
        Logger.log(`📧 Message ID: ${messageId}`);
        
        return { 
            success: true, 
            messageId: messageId,
            service: 'mailersend'
        };
        
    } catch (error) {
        Logger.error('❌ MailerSend 이메일 전송 실패:');
        Logger.error('📋 에러 상세:', JSON.stringify(error, null, 2));
        Logger.error('🔍 에러 메시지:', error.message);
        Logger.error('📍 에러 스택:', error.stack);
        
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
        Logger.log('🔍 MailerSend 연결 테스트 시작...');
        
        if (!process.env.MAILERSEND_API_KEY) {
            Logger.log('⚠️ MAILERSEND_API_KEY가 설정되지 않았습니다.');
            Logger.log('💡 .env 파일에 MAILERSEND_API_KEY를 설정해주세요.');
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

        Logger.log('📤 테스트 이메일 전송 중...');
        const response = await mailerSend.email.send(testEmail);
        
        Logger.log('✅ MailerSend 연결 테스트 성공!');
        Logger.log(`📧 테스트 Message ID: ${response.messageId}`);
        return true;
        
    } catch (error) {
        Logger.error('❌ MailerSend 연결 테스트 실패:');
        Logger.error('📋 에러 상세:', JSON.stringify(error, null, 2));
        Logger.error('🔍 에러 메시지:', error.message);
        return false;
    }
};

/**
 * 문의 답변 이메일 발송
 * @param {String} to - 수신자 이메일
 * @param {Object} data - { customerName, inquiryNumber, replyMessage }
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
const sendInquiryReplyEmail = async (to, { customerName, inquiryNumber, replyMessage }) => {
    try {
        Logger.log('📧 문의 답변 이메일 전송 시작...');
        Logger.log(`📬 수신자: ${to}`);
        Logger.log(`📋 접수번호: ${inquiryNumber}`);

        if (!process.env.MAILERSEND_API_KEY) {
            Logger.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
            return { 
                success: false, 
                error: 'MAILERSEND_API_KEY가 설정되지 않았습니다.',
                service: 'mailersend'
            };
        }

        const sentFrom = new Sender(process.env.MAILERSEND_FROM_EMAIL, "Pre.p Mood");
        const recipients = [new Recipient(to, customerName || to)];

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setReplyTo(sentFrom)
            .setSubject(`[Pre.p Mood] 문의 답변 - ${inquiryNumber}`)
            .setHtml(`
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #333; margin: 0;">Pre.p Mood</h1>
                        <p style="color: #666; margin: 5px 0;">Timeless lines, Refined Vibes</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">문의 답변</h2>
                        <p style="color: #666; margin-bottom: 10px;">
                            ${customerName || '고객'}님, 문의해주신 내용에 대한 답변을 드립니다.
                        </p>
                        <p style="color: #999; font-size: 14px; margin-bottom: 30px;">
                            접수번호: ${inquiryNumber}
                        </p>
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007bff;">
                            <div style="white-space: pre-wrap; color: #333; line-height: 1.6;">
                                ${replyMessage.replace(/\n/g, '<br>')}
                            </div>
                        </div>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-top: 20px;">
                            <p style="color: #856404; margin: 0; font-size: 14px;">
                                <strong>안내:</strong> 추가 문의사항이 있으시면 고객센터로 연락해주세요.
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
Pre.p Mood - 문의 답변

${customerName || '고객'}님, 문의해주신 내용에 대한 답변을 드립니다.

접수번호: ${inquiryNumber}

답변 내용:
${replyMessage}

추가 문의사항이 있으시면 고객센터로 연락해주세요.

Pre.p Mood
Timeless lines, Refined Vibes
            `);

        Logger.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);

        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}`;
            Logger.error('❌ MailerSend API 오류 발생:', errorMessage);
            return { 
                success: false, 
                error: errorMessage,
                service: 'mailersend'
            };
        }

        Logger.log('✅ 문의 답변 이메일 전송 성공!');
        return { 
            success: true,
            service: 'mailersend'
        };
    } catch (error) {
        Logger.error('❌ 문의 답변 이메일 전송 실패:', error);
        return { 
            success: false, 
            error: error.message || '이메일 전송 중 오류가 발생했습니다.',
            service: 'mailersend'
        };
    }
};

/**
 * 양도 요청 이메일 발송
 * @param {String} to - 수신자 이메일
 * @param {Object} data - { transferCode, transferLink, warrantyPublicId }
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
const sendTransferRequestEmail = async (to, { transferCode, transferLink, warrantyPublicId }) => {
    try {
        Logger.log('📧 양도 요청 이메일 전송 시작...');
        Logger.log(`📬 수신자: ${to}`);
        Logger.log(`🔐 양도 코드: ${transferCode}`);

        if (!process.env.MAILERSEND_API_KEY) {
            Logger.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
            return { 
                success: false, 
                error: 'MAILERSEND_API_KEY가 설정되지 않았습니다.',
                service: 'mailersend'
            };
        }

        const sentFrom = new Sender(process.env.MAILERSEND_FROM_EMAIL, "Pre.p Mood");
        const recipients = [new Recipient(to, to)];

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setReplyTo(sentFrom)
            .setSubject('[Pre.p Mood] 보증서 양도 요청')
            .setHtml(`
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #333; margin: 0;">Pre.p Mood</h1>
                        <p style="color: #666; margin: 5px 0;">Timeless lines, Refined Vibes</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">보증서 양도 요청</h2>
                        <p style="color: #666; margin-bottom: 20px;">
                            보증서 소유자가 귀하에게 보증서를 양도하고자 합니다.
                        </p>
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #007bff;">
                            <p style="color: #333; margin: 0 0 10px 0; font-weight: bold;">양도 코드:</p>
                            <h1 style="color: #007bff; font-size: 28px; letter-spacing: 3px; margin: 0; font-family: 'Courier New', monospace;">
                                ${transferCode}
                            </h1>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${transferLink}" 
                               style="display: inline-block; background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                양도 수락하기
                            </a>
                        </div>
                        
                        <p style="color: #999; font-size: 14px; margin-top: 20px;">
                            이 링크는 72시간 동안 유효합니다.
                        </p>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-top: 20px;">
                            <p style="color: #856404; margin: 0; font-size: 14px;">
                                <strong>보안 안내:</strong> 이 코드를 다른 사람과 공유하지 마세요. 양도 수락 후 보증서 소유권이 이전됩니다.
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
Pre.p Mood - 보증서 양도 요청

안녕하세요!

보증서 소유자가 귀하에게 보증서를 양도하고자 합니다.

양도 코드: ${transferCode}

양도 수락하기: ${transferLink}

이 링크는 72시간 동안 유효합니다.

보안 안내: 이 코드를 다른 사람과 공유하지 마세요. 양도 수락 후 보증서 소유권이 이전됩니다.

Pre.p Mood
Timeless lines, Refined Vibes
            `);

        Logger.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);

        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}`;
            Logger.error('❌ MailerSend API 오류 발생:', errorMessage);
            return { 
                success: false, 
                error: errorMessage,
                service: 'mailersend'
            };
        }

        Logger.log('✅ 양도 요청 이메일 전송 성공!');
        return { 
            success: true,
            service: 'mailersend'
        };
    } catch (error) {
        Logger.error('❌ 양도 요청 이메일 전송 실패:', error);
        return { 
            success: false, 
            error: error.message || '이메일 전송 중 오류가 발생했습니다.',
            service: 'mailersend'
        };
    }
};

/**
 * 주문 확인 이메일 발송
 * @param {String} to - 수신자 이메일
 * @param {Object} data - { orderNumber, orderDate, totalAmount, items, orderLink, isGuest }
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
const sendOrderConfirmationEmail = async (to, { orderNumber, orderDate, totalAmount, items, orderLink, isGuest = false, customerName = null, logoUrl = null }) => {
    try {
        Logger.log('📧 주문 확인 이메일 전송 시작...');
        Logger.log(`📬 수신자: ${to}`);
        Logger.log(`📦 주문번호: ${orderNumber}`);

        if (!process.env.MAILERSEND_API_KEY) {
            Logger.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
            return { 
                success: false, 
                error: 'MAILERSEND_API_KEY가 설정되지 않았습니다.',
                service: 'mailersend'
            };
        }

        const sentFrom = new Sender(process.env.MAILERSEND_FROM_EMAIL, "Pre.p Mood");
        const recipients = [new Recipient(to, to)];

        // 고객 이름 설정
        const displayName = customerName || 'Customer';
        
        // 주문일시 포맷팅 (예: "16 January 2025")
        let formattedDate = '-';
        if (orderDate) {
            const date = new Date(orderDate);
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
            formattedDate = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
        }

        // 로고 URL 설정 (절대 URL)
        const baseUrl = process.env.FRONTEND_URL || 'https://prepmood.kr';
        const logoImageUrl = logoUrl || `${baseUrl}/image/prepmoodlogo.jpg`;

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setReplyTo(sentFrom)
            .setSubject(`[Pre.pMood] Order Confirmation · ${orderNumber}`)
            .setHtml(`
                <div style="max-width: 600px; margin: 0 auto; padding: 60px 50px; font-family: Arial, Helvetica, sans-serif; color: #333; line-height: 1.8; font-weight: bold;">
                    <!-- 제목 및 로고 (테이블 레이아웃으로 변경 - 이메일 호환성) -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                        <tr>
                            <td style="vertical-align: middle;">
                                <h1 style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">
                                    [Pre.pMood] Order Confirmation · ${escapeHtml(orderNumber)}
                                </h1>
                            </td>
                            <td style="vertical-align: middle; text-align: right; width: 120px;">
                                <img src="${logoImageUrl}" alt="Pre.pMood" style="height: 120px; max-width: 120px; object-fit: contain;">
                            </td>
                        </tr>
                    </table>
                    
                    <!-- 인사말 -->
                    <p style="margin: 0 0 7px 0; font-size: 16px; font-weight: bold;">
                        Hello <strong>${escapeHtml(displayName)}</strong>
                    </p>
                    
                    <p style="margin: 0 0 20px 0; font-size: 16px; font-weight: bold;">
                        Your order has been successfully confirmed.<br>
                        Your purchase is now securely recorded with Pre.pMood.
                    </p>
                    
                    <!-- 구분선 -->
                    <div style="border-top: 1px solid #ddd; margin: 15px 0;"></div>
                    
                    <!-- Order Reference -->
                    <div style="margin: 20px 0;">
                        <p style="margin: 0 0 7px 0; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0px;">
                            Order Reference
                        </p>
                        <p style="margin: 0px 0; font-size: 16px; font-weight: bold;">
                            <strong>${escapeHtml(orderNumber)}</strong>
                        </p>
                        <p style="margin: 0px 0; font-size: 16px; font-weight: bold;">
                            ${formattedDate}
                        </p>
                    </div>
                    
                    <!-- 구분선 -->
                    <div style="border-top: 1px solid #ddd; margin: 15px 0;"></div>
                    
                    <!-- Digital Records -->
                    <div style="margin: 20px 0;">
                        <p style="margin: 0 0 7px 0; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0px;">
                            Digital Records
                        </p>
                        <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">
                            The following digital documents have been issued and activated:
                        </p>
                        <p style="margin: 0px 0; font-size: 16px; font-weight: bold;">
                            ✔ Digital Invoice
                        </p>
                        <p style="margin: 0px 0; font-size: 16px; font-weight: bold;">
                            ✔ Digital Warranty & Authenticity Certificate
                        </p>
                        <p style="margin: 10px 0 10px 0; font-size: 16px; font-weight: bold;">
                            Access your order details and digital documents via the secure link below:
                        </p>
                        <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">
                            👉 View Order & Digital Documents
                        </p>
                        <p style="margin: 5px 0;">
                            <a href="${orderLink}" style="color: #000000; text-decoration: underline; font-size: 16px; font-style: italic; font-weight: bold;">
                                ${orderLink}
                            </a>
                        </p>
                    </div>
                    
                    <!-- 구분선 -->
                    <div style="border-top: 1px solid #ddd; margin: 15px 0;"></div>
                    
                    <!-- 배송 안내 -->
                    <p style="margin: 20px 0 10px 0; font-size: 16px; font-weight: bold;">
                        Shipping updates and tracking details will be sent to this email once your order is dispatched.
                    </p>
                    
                    <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">
                        For assistance, please contact<br>
                        <a href="mailto:support@prepmood.com" style="color: #333; text-decoration: underline; font-weight: bold;">
                            support@prepmood.com
                        </a>
                    </p>
                    
                    <!-- 푸터 -->
                    <p style="margin: 10px 0 10px 0; font-size: 16px; font-weight: bold;">
                        Warm regards,<br>
                        <strong>Pre.pMood</strong><br>
                        <span style="font-style: italic; font-weight: bold;">The Art of Modern Heritage</span>
                    </p>
                </div>
            `)
            .setText(`
[Pre.pMood] Order Confirmation · ${orderNumber}

Hello ${displayName}

Your order has been successfully confirmed.
Your purchase is now securely recorded with Pre.pMood.

________________________________________

Order Reference
${orderNumber}
${formattedDate}

________________________________________

Digital Records
The following digital documents have been issued and activated:
✔ Digital Invoice
✔ Digital Warranty & Authenticity Certificate

Access your order details and digital documents via the secure link below:
👉 View Order & Digital Documents
${orderLink}

________________________________________

Shipping updates and tracking details will be sent to this email once your order is dispatched.

For assistance, please contact
support@prepmood.com

Warm regards,
Pre.pMood
The Art of Modern Heritage
            `);

        Logger.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);

        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}`;
            Logger.error('❌ MailerSend API 오류 발생:', errorMessage);
            return { 
                success: false, 
                error: errorMessage,
                service: 'mailersend'
            };
        }

        Logger.log('✅ 주문 확인 이메일 전송 성공!');
        return { 
            success: true,
            service: 'mailersend'
        };
    } catch (error) {
        Logger.error('❌ 주문 확인 이메일 전송 실패:', error);
        return { 
            success: false, 
            error: error.message || '이메일 전송 중 오류가 발생했습니다.',
            service: 'mailersend'
        };
    }
};

/**
 * 인보이스 이메일 발송
 * @param {String} to - 수신자 이메일
 * @param {Object} data - { invoiceNumber, invoiceId, invoiceLink, orderNumber, customerName, logoUrl }
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
const sendInvoiceEmail = async (to, { invoiceNumber, invoiceId, invoiceLink, orderNumber, customerName = null, logoUrl = null }) => {
    try {
        Logger.log('📧 인보이스 이메일 전송 시작...');
        Logger.log(`📬 수신자: ${to}`);
        Logger.log(`📋 인보이스 번호: ${invoiceNumber}`);

        if (!process.env.MAILERSEND_API_KEY) {
            Logger.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
            return { 
                success: false, 
                error: 'MAILERSEND_API_KEY가 설정되지 않았습니다.',
                service: 'mailersend'
            };
        }

        const sentFrom = new Sender(process.env.MAILERSEND_FROM_EMAIL, "Pre.p Mood");
        const recipients = [new Recipient(to, to)];

        // 고객 이름 설정
        const displayName = customerName || 'Customer';

        // 로고 URL 설정 (절대 URL)
        const baseUrl = process.env.FRONTEND_URL || 'https://prepmood.kr';
        const logoImageUrl = logoUrl || `${baseUrl}/image/prepmoodlogo.jpg`;

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setReplyTo(sentFrom)
            .setSubject(`[Pre.pMood] Digital Invoice · ${invoiceNumber}`)
            .setHtml(`
                <div style="max-width: 600px; margin: 0 auto; padding: 60px 50px; font-family: Arial, Helvetica, sans-serif; color: #333; line-height: 1.8; font-weight: bold;">
                    <!-- 제목 및 로고 (테이블 레이아웃으로 변경 - 이메일 호환성) -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                        <tr>
                            <td style="vertical-align: middle;">
                                <h1 style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">
                                    [Pre.pMood] Digital Invoice · ${escapeHtml(invoiceNumber)}
                                </h1>
                            </td>
                            <td style="vertical-align: middle; text-align: right; width: 120px;">
                                <img src="${logoImageUrl}" alt="Pre.pMood" style="height: 120px; max-width: 120px; object-fit: contain;">
                            </td>
                        </tr>
                    </table>
                    
                    <!-- 인사말 -->
                    <p style="margin: 0 0 7px 0; font-size: 16px; font-weight: bold;">
                        Hello <strong>${escapeHtml(displayName)}</strong>
                    </p>
                    
                    <p style="margin: 0 0 20px 0; font-size: 16px; font-weight: bold;">
                        Your digital invoice has been issued.<br>
                        This document represents your purchase and ownership record.
                    </p>
                    
                    <!-- 구분선 -->
                    <div style="border-top: 1px solid #ddd; margin: 15px 0;"></div>
                    
                    <!-- Invoice Reference -->
                    <div style="margin: 20px 0;">
                        <p style="margin: 0 0 7px 0; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0px;">
                            Invoice Reference
                        </p>
                        <p style="margin: 0px 0; font-size: 16px; font-weight: bold;">
                            <strong>${escapeHtml(invoiceNumber)}</strong>
                        </p>
                        ${orderNumber ? `<p style="margin: 5px 0; font-size: 14px; font-weight: bold; color: #666;">
                            Order: ${escapeHtml(orderNumber)}
                        </p>` : ''}
                    </div>
                    
                    <!-- 구분선 -->
                    <div style="border-top: 1px solid #ddd; margin: 15px 0;"></div>
                    
                    <!-- Digital Invoice Access -->
                    <div style="margin: 20px 0;">
                        <p style="margin: 0 0 7px 0; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0px;">
                            Digital Invoice
                        </p>
                        <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">
                            Access your digital invoice via the secure link below:
                        </p>
                        <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">
                            👉 View Digital Invoice
                        </p>
                        <p style="margin: 5px 0;">
                            <a href="${invoiceLink}" style="color: #000000; text-decoration: underline; font-size: 16px; font-style: italic; font-weight: bold;">
                                ${invoiceLink}
                            </a>
                        </p>
                        <p style="margin: 10px 0; font-size: 14px; font-weight: bold; color: #666;">
                            This digital invoice is securely stored and can be accessed anytime.
                        </p>
                    </div>
                    
                    <!-- 구분선 -->
                    <div style="border-top: 1px solid #ddd; margin: 15px 0;"></div>
                    
                    <!-- 안내 -->
                    <p style="margin: 20px 0 10px 0; font-size: 16px; font-weight: bold;">
                        This digital invoice serves as your official purchase record and can be used for warranty claims and ownership verification.
                    </p>
                    
                    <p style="margin: 10px 0; font-size: 16px; font-weight: bold;">
                        For assistance, please contact<br>
                        <a href="mailto:support@prepmood.com" style="color: #333; text-decoration: underline; font-weight: bold;">
                            support@prepmood.com
                        </a>
                    </p>
                    
                    <!-- 푸터 -->
                    <p style="margin: 10px 0 10px 0; font-size: 16px; font-weight: bold;">
                        Warm regards,<br>
                        <strong>Pre.pMood</strong><br>
                        <span style="font-style: italic; font-weight: bold;">The Art of Modern Heritage</span>
                    </p>
                </div>
            `)
            .setText(`
[Pre.pMood] Digital Invoice · ${invoiceNumber}

Hello ${displayName}

Your digital invoice has been issued.
This document represents your purchase and ownership record.

________________________________________

Invoice Reference
${invoiceNumber}
${orderNumber ? `Order: ${orderNumber}` : ''}

________________________________________

Digital Invoice
Access your digital invoice via the secure link below:
👉 View Digital Invoice
${invoiceLink}

This digital invoice is securely stored and can be accessed anytime.

________________________________________

This digital invoice serves as your official purchase record and can be used for warranty claims and ownership verification.

For assistance, please contact
support@prepmood.com

Warm regards,
Pre.pMood
The Art of Modern Heritage
            `);

        Logger.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);

        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}`;
            Logger.error('❌ MailerSend API 오류 발생:', errorMessage);
            return { 
                success: false, 
                error: errorMessage,
                service: 'mailersend'
            };
        }

        Logger.log('✅ 인보이스 이메일 전송 성공!');
        return { 
            success: true,
            service: 'mailersend'
        };
    } catch (error) {
        Logger.error('❌ 인보이스 이메일 전송 실패:', error);
        return { 
            success: false, 
            error: error.message || '이메일 전송 중 오류가 발생했습니다.',
            service: 'mailersend'
        };
    }
};

// HTML 이스케이프 헬퍼 함수
function escapeHtml(text) {
    if (text == null) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

module.exports = {
    sendVerificationEmail,
    sendInquiryReplyEmail,
    testConnection,
    sendTransferRequestEmail,
    sendOrderConfirmationEmail,
    sendInvoiceEmail
};