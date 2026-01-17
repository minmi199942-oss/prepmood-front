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

/**
 * 문의 답변 이메일 발송
 * @param {String} to - 수신자 이메일
 * @param {Object} data - { customerName, inquiryNumber, replyMessage }
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
const sendInquiryReplyEmail = async (to, { customerName, inquiryNumber, replyMessage }) => {
    try {
        console.log('📧 문의 답변 이메일 전송 시작...');
        console.log(`📬 수신자: ${to}`);
        console.log(`📋 접수번호: ${inquiryNumber}`);

        if (!process.env.MAILERSEND_API_KEY) {
            console.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
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

        console.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);

        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}`;
            console.error('❌ MailerSend API 오류 발생:', errorMessage);
            return { 
                success: false, 
                error: errorMessage,
                service: 'mailersend'
            };
        }

        console.log('✅ 문의 답변 이메일 전송 성공!');
        return { 
            success: true,
            service: 'mailersend'
        };
    } catch (error) {
        console.error('❌ 문의 답변 이메일 전송 실패:', error);
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
        console.log('📧 양도 요청 이메일 전송 시작...');
        console.log(`📬 수신자: ${to}`);
        console.log(`🔐 양도 코드: ${transferCode}`);

        if (!process.env.MAILERSEND_API_KEY) {
            console.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
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

        console.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);

        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}`;
            console.error('❌ MailerSend API 오류 발생:', errorMessage);
            return { 
                success: false, 
                error: errorMessage,
                service: 'mailersend'
            };
        }

        console.log('✅ 양도 요청 이메일 전송 성공!');
        return { 
            success: true,
            service: 'mailersend'
        };
    } catch (error) {
        console.error('❌ 양도 요청 이메일 전송 실패:', error);
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
const sendOrderConfirmationEmail = async (to, { orderNumber, orderDate, totalAmount, items, orderLink, isGuest = false }) => {
    try {
        console.log('📧 주문 확인 이메일 전송 시작...');
        console.log(`📬 수신자: ${to}`);
        console.log(`📦 주문번호: ${orderNumber}`);

        if (!process.env.MAILERSEND_API_KEY) {
            console.error('❌ MAILERSEND_API_KEY가 설정되지 않았습니다.');
            return { 
                success: false, 
                error: 'MAILERSEND_API_KEY가 설정되지 않았습니다.',
                service: 'mailersend'
            };
        }

        const sentFrom = new Sender(process.env.MAILERSEND_FROM_EMAIL, "Pre.p Mood");
        const recipients = [new Recipient(to, to)];

        // 주문 항목 HTML 생성
        const itemsHtml = items.map(item => `
            <tr style="border-bottom: 1px solid #dee2e6;">
                <td style="padding: 12px; text-align: left;">${escapeHtml(item.product_name || '-')}</td>
                <td style="padding: 12px; text-align: center;">${item.size || '-'} / ${item.color || '-'}</td>
                <td style="padding: 12px; text-align: center;">${item.quantity || 1}</td>
                <td style="padding: 12px; text-align: right;">${Number(item.subtotal || item.unit_price || 0).toLocaleString('ko-KR')}원</td>
            </tr>
        `).join('');

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setReplyTo(sentFrom)
            .setSubject(`[Pre.p Mood] 주문 확인 - ${orderNumber}`)
            .setHtml(`
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #333; margin: 0;">Pre.p Mood</h1>
                        <p style="color: #666; margin: 5px 0;">Timeless lines, Refined Vibes</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 10px;">
                        <h2 style="color: #333; margin-bottom: 20px;">주문이 완료되었습니다</h2>
                        <p style="color: #666; margin-bottom: 30px;">
                            주문해주셔서 감사합니다. 주문이 성공적으로 접수되었습니다.
                        </p>
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #333; margin-top: 0; margin-bottom: 15px;">주문 정보</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0; color: #666; width: 120px;">주문번호:</td>
                                    <td style="padding: 8px 0; color: #333; font-weight: bold;">${escapeHtml(orderNumber)}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #666;">주문일시:</td>
                                    <td style="padding: 8px 0; color: #333;">${orderDate ? new Date(orderDate).toLocaleString('ko-KR') : '-'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #666;">주문 금액:</td>
                                    <td style="padding: 8px 0; color: #333; font-weight: bold; font-size: 18px;">${Number(totalAmount).toLocaleString('ko-KR')}원</td>
                                </tr>
                            </table>
                        </div>

                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #333; margin-top: 0; margin-bottom: 15px;">주문 상품</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                        <th style="padding: 12px; text-align: left; font-weight: bold;">상품명</th>
                                        <th style="padding: 12px; text-align: center; font-weight: bold;">옵션</th>
                                        <th style="padding: 12px; text-align: center; font-weight: bold;">수량</th>
                                        <th style="padding: 12px; text-align: right; font-weight: bold;">금액</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="3" style="padding: 12px; text-align: right; font-weight: bold; border-top: 2px solid #dee2e6;">총 주문 금액:</td>
                                        <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 18px; border-top: 2px solid #dee2e6;">${Number(totalAmount).toLocaleString('ko-KR')}원</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${orderLink}" 
                               style="display: inline-block; background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                ${isGuest ? '주문 상세 보기' : '주문 내역 보기'}
                            </a>
                        </div>
                        
                        ${isGuest ? `
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-top: 20px;">
                            <p style="color: #856404; margin: 0; font-size: 14px;">
                                <strong>비회원 주문 안내:</strong> 주문 상세 보기 링크는 90일간 유효합니다. 계정에 연동하시면 언제든지 주문 내역을 확인하실 수 있습니다.
                            </p>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
                        <p>본 메일은 발신전용입니다. 문의사항은 고객센터를 이용해주세요.</p>
                        <p>&copy; 2025 Pre.p Mood. All rights reserved.</p>
                    </div>
                </div>
            `)
            .setText(`
Pre.p Mood - 주문 확인

안녕하세요!

주문이 성공적으로 접수되었습니다.

주문번호: ${orderNumber}
주문일시: ${orderDate ? new Date(orderDate).toLocaleString('ko-KR') : '-'}
주문 금액: ${Number(totalAmount).toLocaleString('ko-KR')}원

주문 상품:
${items.map(item => `- ${item.product_name || '-'} (${item.size || '-'} / ${item.color || '-'}) x ${item.quantity || 1} = ${Number(item.subtotal || item.unit_price || 0).toLocaleString('ko-KR')}원`).join('\n')}

주문 내역 보기: ${orderLink}

${isGuest ? '\n비회원 주문 안내: 주문 상세 보기 링크는 90일간 유효합니다. 계정에 연동하시면 언제든지 주문 내역을 확인하실 수 있습니다.\n' : ''}

Pre.p Mood
Timeless lines, Refined Vibes
            `);

        console.log('📤 MailerSend API 호출 중...');
        const response = await mailerSend.email.send(emailParams);

        if (response.statusCode !== 202) {
            const errorMessage = `MailerSend API 오류: Status Code ${response.statusCode}`;
            console.error('❌ MailerSend API 오류 발생:', errorMessage);
            return { 
                success: false, 
                error: errorMessage,
                service: 'mailersend'
            };
        }

        console.log('✅ 주문 확인 이메일 전송 성공!');
        return { 
            success: true,
            service: 'mailersend'
        };
    } catch (error) {
        console.error('❌ 주문 확인 이메일 전송 실패:', error);
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
    sendOrderConfirmationEmail
};