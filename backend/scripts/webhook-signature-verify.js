/**
 * 웹훅 시그니처 검증 작동 확인 스크립트
 *
 * WEBHOOK_SHARED_SECRET 설정 후, 서버가 (1) 서명 없는 요청을 거부하고
 * (2) 올바른 서명이 있으면 통과하는지 확인합니다.
 *
 * 사용법 (백엔드 서버가 켜져 있어야 함):
 *   cd backend && node scripts/webhook-signature-verify.js
 *   BASE_URL=https://your-server.com node scripts/webhook-signature-verify.js
 *
 * .env는 backend/ 또는 프로젝트 루트에 두고, 같은 디렉터리에서 실행하세요.
 */

const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WEBHOOK_URL = BASE_URL + '/api/payments/webhook';
const secret = process.env.WEBHOOK_SHARED_SECRET;

const sampleBody = {
  eventType: 'PAYMENT_STATUS_CHANGED',
  data: {
    orderId: 'VERIFY-TEST-001',
    paymentKey: 'test_key_verify',
    status: 'DONE'
  },
  timestamp: new Date().toISOString()
};

function computeSignature(body, secretKey) {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(bodyString);
  return hmac.digest('base64');
}

async function run() {
  console.log('=== 웹훅 시그니처 검증 테스트 ===');
  console.log('WEBHOOK_URL:', WEBHOOK_URL);
  console.log('WEBHOOK_SHARED_SECRET 설정 여부:', secret ? '예' : '아니오');
  if (!secret) {
    console.log('\n.env에 WEBHOOK_SHARED_SECRET이 없습니다. 테스트를 건너뜁니다.');
    process.exit(1);
  }

  const bodyStr = JSON.stringify(sampleBody);

  // 1) 서명 없이 요청
  console.log('\n[1] 서명 없이 POST ...');
  try {
    const res1 = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr
    });
    const data1 = await res1.json().catch(function () { return {}; });
    console.log('    상태:', res1.status, '응답:', JSON.stringify(data1));
    if (res1.status === 200 && data1.received === true) {
      console.log('    -> 서명 없음 요청 거부됨. 서버 로그에 "[payments][webhook] 시그니처 검증 실패" 확인.');
    }
  } catch (e) {
    console.log('    오류:', e.message);
  }

  // 2) 올바른 서명과 함께 요청
  console.log('\n[2] 올바른 x-toss-signature와 함께 POST ...');
  const validSig = computeSignature(sampleBody, secret);
  try {
    const res2 = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-toss-signature': validSig
      },
      body: bodyStr
    });
    const data2 = await res2.json().catch(function () { return {}; });
    console.log('    상태:', res2.status, '응답:', JSON.stringify(data2));
    if (res2.status === 200 && data2.received === true && !data2.success) {
      console.log('    -> 서명 통과, 주문 없어 처리만 안 됨. 서버 로그에 "웹훅 수신 - 이벤트 분기 처리" 확인.');
    } else if (res2.status === 200) {
      console.log('    -> 서명 검증 통과. 서버 로그로 처리 여부 확인.');
    }
  } catch (e) {
    console.log('    오류:', e.message);
  }

  console.log('\n=== 확인 요약 ===');
  console.log('1) 서버 로그에서 [payments][webhook] 메시지 확인.');
  console.log('2) 서명 없음: "시그니처 검증 실패 — 요청 거부" 또는 hasSignature: false');
  console.log('3) 서명 있음: "웹훅 수신 - 이벤트 분기 처리" 나오면 검증 통과.');
}

run().catch(function (e) {
  console.error(e);
  process.exit(1);
});
