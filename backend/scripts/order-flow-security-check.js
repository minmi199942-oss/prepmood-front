/**
 * 주문·결제 흐름 보안 검증 스크립트 (최소 가이드라인)
 *
 * === "보안이 실제로 작동하는지" 테스트하는 방법 (초보자용) ===
 * 1. 백엔드 서버를 로컬에서 켠다 (예: 포트 3000).
 * 2. 터미널에서 아래처럼 실행한다 (BASE_URL에 본인 서버 주소 넣기):
 *      BASE_URL=http://localhost:3000 node backend/scripts/order-flow-security-check.js
 * 3. "API 검사" 항목이 나온다. 각 항목은 "잘못된 요청을 보냈을 때 서버가 막는지" 확인하는 것이다.
 *    - body 없음 → 400: 요청 본문이 비어 있으면 거부되는지
 *    - checkoutSessionKey 없음 → 400: 세션 키 없으면 거부되는지
 *    - amount 0 → 400: 금액이 0이면 거부되는지
 *    - 존재하지 않는 주문번호 → 404: 없는 주문이면 거부되는지
 * 4. 전부 통과하면, "그런 잘못된 요청들은 우리 서버가 실제로 막고 있다"는 뜻이다.
 *
 * ⚠️ 한계 (Gemini/시니어 리뷰 반영):
 * - 정규식 검사는 "키워드 존재"만 보며, 문맥·로직 정합성 증명이 아님.
 * - 보안은 "동적 상태 전이의 정합성"(DB·세션·멱등)에서 나오며, 이 스크립트만으로는 검증 불가.
 * - CI에서 "최소 가이드라인" 용도로만 사용하고, "보안 검증 완료" 근거로 삼지 말 것.
 * - 실보안 검증: 통합 테스트(Jest/Mocha + 테스트 DB) + 롤백/멱등/상태 검증 권장.
 *
 * 1) 정적 검사: 필수 패턴·순서 존재 여부 (fail-fast: 파일 누락 시 즉시 throw).
 * 2) (선택) API 검사: BASE_URL 설정 시 서버에 요청 보내서 "막히는지" 확인. 반드시 테스트/로컬만 사용.
 *
 * 사용법:
 *   node backend/scripts/order-flow-security-check.js
 *   BASE_URL=http://localhost:3000 node backend/scripts/order-flow-security-check.js
 *
 * 전제: 프로젝트 루트 또는 backend에서 실행 (경로가 backend/... 기준).
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BACKEND = path.join(PROJECT_ROOT, 'backend');

/**
 * 필수 파일 읽기. 없으면 즉시 throw (fail-fast). 에러 삼키지 않음.
 */
function readFile(filePath) {
    const full = path.isAbsolute(filePath) ? filePath : path.join(BACKEND, filePath);
    if (!fs.existsSync(full)) {
        throw new Error(`[CRITICAL] 필수 검증 파일 누락: ${filePath} (경로: ${full})`);
    }
    const content = fs.readFileSync(full, 'utf8');
    if (content.length === 0) {
        throw new Error(`[CRITICAL] 파일이 비어 있음: ${filePath}`);
    }
    return content;
}

function staticChecks() {
    const results = [];
    const paymentsRoutes = readFile('payments-routes.js');
    const processor = readFile('utils/paid-order-processor.js');
    const wrapper = readFile('utils/payment-wrapper.js');
    const paidEventCreator = readFile('utils/paid-event-creator.js');

    const checks = [
        {
            name: 'confirm 금액 검증 (Zero-Trust)',
            pass: /serverAmount|clientAmount|Math\.abs\s*\(\s*serverAmount\s*-\s*clientAmount\s*\)/.test(paymentsRoutes),
            file: 'payments-routes.js'
        },
        {
            name: '"이미 완료" = pep.status success JOIN',
            pass: /pep\.status\s*=\s*['"]success['"]|status = 'success'/.test(paymentsRoutes) && /paid_event_processing.*pep/.test(paymentsRoutes),
            file: 'payments-routes.js'
        },
        {
            name: '§C failed CAS (UPDATE pep ... status=failed)',
            pass: /UPDATE paid_event_processing SET status = 'processing'/.test(paymentsRoutes) && /event_id = \? AND status = 'failed'/.test(paymentsRoutes) && /failedRow/.test(paymentsRoutes),
            file: 'payments-routes.js'
        },
        {
            name: '§C INSUFFICIENT_STOCK 시 환불 분기',
            pass: /retryErr\.code === 'INSUFFICIENT_STOCK'|INSUFFICIENT_STOCK/.test(paymentsRoutes) && /executeRefundFn|AUTO_REFUNDED/.test(paymentsRoutes),
            file: 'payments-routes.js'
        },
        {
            name: 'updateProcessingStatus 사용 (§C·실패 시 상태 기록)',
            pass: /updateProcessingStatus\s*\(/.test(paymentsRoutes),
            file: 'payments-routes.js'
        },
        {
            name: 'processPaidOrder Early Return (status=success)',
            pass: /status === 'success'/.test(processor) && /alreadyProcessed/.test(processor),
            file: 'utils/paid-order-processor.js'
        },
        {
            name: 'processPaidOrder Double-Check (락 직후 재확인)',
            pass: /Double-Check|pepRows2|락 획득 후/.test(processor),
            file: 'utils/paid-order-processor.js'
        },
        {
            name: 'processPaidOrder Double-Check 순서 (orders 락 이후에만 2차 검사)',
            pass: (() => {
                const idxLock = processor.indexOf('FOR UPDATE');
                const idxDoubleCheck = processor.indexOf('Double-Check');
                return idxLock !== -1 && idxDoubleCheck !== -1 && idxLock < idxDoubleCheck;
            })(),
            file: 'utils/paid-order-processor.js'
        },
        {
            name: 'processPaidOrder 재고 부족 시 INSUFFICIENT_STOCK',
            pass: /err\.code\s*=\s*['"]INSUFFICIENT_STOCK['"]|code.*INSUFFICIENT_STOCK/.test(processor),
            file: 'utils/paid-order-processor.js'
        },
        {
            name: 'payment-wrapper PG 응답 금액/orderId 대조 (ZERO_TRUST_VIOLATION)',
            pass: /ZERO_TRUST_VIOLATION|respOrderId|respAmount|pgOrderId/.test(wrapper),
            file: 'utils/payment-wrapper.js'
        },
        {
            name: 'getSafeConnection 고아 커넥션 회수',
            pass: /releaseOrphanConnection|고아/.test(wrapper),
            file: 'utils/payment-wrapper.js'
        },
        {
            name: 'paid-event-creator Promise.race 제거 (풀 누수 방지)',
            pass: !/Promise\.race\s*\(/.test(paidEventCreator) && /pool\.getConnection/.test(paidEventCreator),
            file: 'utils/paid-event-creator.js'
        },
        {
            name: 'paid-event-creator alreadyExists (ER_DUP_ENTRY)',
            pass: /alreadyExists|ER_DUP_ENTRY/.test(paidEventCreator),
            file: 'utils/paid-event-creator.js'
        }
    ];

    checks.forEach(c => {
        results.push({ name: c.name, pass: c.pass, file: c.file });
    });
    return results;
}

/**
 * GET 한 번 보내서 CSRF 쿠키·헤더 값 획득 (confirm 등 POST 시 403 방지)
 */
async function getCsrfToken(baseUrl) {
    const base = baseUrl.replace(/\/$/, '');
    const url = base + '/api/health';
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return null;
    const m = setCookie.match(/xsrf-token=([^;]+)/);
    if (!m) return null;
    return { cookie: `xsrf-token=${m[1]}`, token: m[1] };
}

async function apiChecks(baseUrl) {
    const results = [];
    const api = (path) => `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;

    // 보안 "실제 동작" 테스트: 잘못된 요청이 400/404로 막히는지 확인
    const csrf = await getCsrfToken(baseUrl);
    if (!csrf) {
        results.push({ name: '(사전) CSRF 토큰 발급', pass: false, error: 'GET 응답에서 xsrf-token 쿠키를 찾을 수 없음' });
        return results;
    }
    const confirmHeaders = {
        'Content-Type': 'application/json',
        'Cookie': csrf.cookie,
        'X-XSRF-TOKEN': csrf.token
    };

    const tests = [
        {
            name: 'confirm body 없음 → 400 (검증 단계에서 막힘)',
            run: async () => {
                const res = await fetch(api('/api/payments/confirm'), {
                    method: 'POST',
                    headers: confirmHeaders,
                    body: JSON.stringify({})
                });
                return res.status === 400;
            }
        },
        {
            name: 'confirm checkoutSessionKey 없음 → 400',
            run: async () => {
                const res = await fetch(api('/api/payments/confirm'), {
                    method: 'POST',
                    headers: confirmHeaders,
                    body: JSON.stringify({
                        orderNumber: 'PM-ORD-TEST-001',
                        paymentKey: 'test_key',
                        amount: 10000
                    })
                });
                return res.status === 400;
            }
        },
        {
            name: 'confirm amount 0 → 400 (금액 검증)',
            run: async () => {
                const res = await fetch(api('/api/payments/confirm'), {
                    method: 'POST',
                    headers: confirmHeaders,
                    body: JSON.stringify({
                        orderNumber: 'PM-ORD-TEST-001',
                        paymentKey: 'test_key',
                        amount: 0,
                        checkoutSessionKey: 'valid-key-placeholder'
                    })
                });
                return res.status === 400;
            }
        },
        {
            name: 'confirm 존재하지 않는 주문번호 → 404 (주문 소유권/존재 검증)',
            run: async () => {
                const res = await fetch(api('/api/payments/confirm'), {
                    method: 'POST',
                    headers: confirmHeaders,
                    body: JSON.stringify({
                        orderNumber: 'PM-ORD-NONEXISTENT-99999',
                        paymentKey: 'test_key',
                        amount: 10000,
                        checkoutSessionKey: '00000000-0000-0000-0000-000000000000'
                    })
                });
                return res.status === 404;
            }
        }
    ];

    for (const t of tests) {
        try {
            const pass = await t.run();
            results.push({ name: t.name, pass });
        } catch (e) {
            results.push({ name: t.name, pass: false, error: e.message });
        }
    }
    return results;
}

async function main() {
    console.log('=== 주문·결제 흐름 보안 검증 ===\n');

    const staticResults = staticChecks();
    console.log('--- 정적 검사 (필수 패턴 존재 여부) ---');
    let staticPass = 0;
    staticResults.forEach(r => {
        const ok = r.pass;
        if (ok) staticPass++;
        console.log(ok ? '  ✅' : '  ❌', r.name, `(${r.file})`);
    });
    console.log(`\n정적 검사: ${staticPass}/${staticResults.length} 통과\n`);

    const baseUrl = process.env.BASE_URL;
    if (baseUrl) {
        console.log('--- API 검사 (BASE_URL 설정됨) ---');
        if (!/localhost|127\.0\.0\.1|^https?:\/\/test\./i.test(baseUrl)) {
            console.warn('  ⚠️  운영(production) URL일 수 있습니다. API 검사는 테스트/로컬 환경에서만 실행하세요.\n');
        }
        const apiResults = await apiChecks(baseUrl);
        let apiPass = 0;
        apiResults.forEach(r => {
            const ok = r.pass;
            if (ok) apiPass++;
            console.log(ok ? '  ✅' : '  ❌', r.name, r.error ? `- ${r.error}` : '');
        });
        console.log(`\nAPI 검사: ${apiPass}/${apiResults.length} 통과\n`);
    } else {
        console.log('--- API 검사 생략 (BASE_URL 미설정) ---');
        console.log('  서버 기동 후 BASE_URL=http://localhost:PORT node backend/scripts/order-flow-security-check.js 로 검증 가능.\n');
    }

    const allStaticOk = staticPass === staticResults.length;
    process.exit(allStaticOk ? 0 : 1);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
