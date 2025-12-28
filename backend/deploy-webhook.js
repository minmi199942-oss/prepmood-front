/**
 * deploy-webhook.js - 자동 배포 웹훅 엔드포인트
 * 
 * 보안:
 * - GitHub webhook secret으로 검증
 * - 내부에서만 실행 (외부 직접 접근 불가)
 * - 로그 기록
 * 
 * 사용법:
 * 1. GitHub 저장소 → Settings → Webhooks → Add webhook
 * 2. Payload URL: https://prepmood.kr/api/deploy/webhook
 * 3. Secret: .env의 DEPLOY_WEBHOOK_SECRET 값
 * 4. Events: Just the push event
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const Logger = require('./logger');
require('dotenv').config();

const execAsync = promisify(exec);

/**
 * POST /api/deploy/webhook
 * 
 * GitHub webhook 수신 엔드포인트
 * - push 이벤트 시 자동 배포 실행
 */
router.post('/deploy/webhook', async (req, res) => {
    try {
        // 1. Secret 검증
        const secret = process.env.DEPLOY_WEBHOOK_SECRET;
        if (!secret) {
            Logger.log('[DEPLOY] ❌ DEPLOY_WEBHOOK_SECRET이 설정되지 않음');
            return res.status(500).json({ error: 'Webhook secret not configured' });
        }

        const signature = req.headers['x-hub-signature-256'];
        if (!signature) {
            Logger.log('[DEPLOY] ❌ 웹훅 서명 없음', { ip: req.ip });
            return res.status(401).json({ error: 'Missing signature' });
        }

        // GitHub webhook signature 검증
        const payload = JSON.stringify(req.body);
        const hmac = crypto.createHmac('sha256', secret);
        const digest = 'sha256=' + hmac.update(payload).digest('hex');

        if (signature !== digest) {
            Logger.log('[DEPLOY] ❌ 웹훅 서명 검증 실패', { ip: req.ip });
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // 2. Push 이벤트 확인
        const event = req.headers['x-github-event'];
        if (event !== 'push') {
            Logger.log('[DEPLOY] ⚠️ Push 이벤트가 아님', { event, ip: req.ip });
            return res.status(200).json({ message: 'Not a push event, ignored' });
        }

        // 3. main 브랜치 확인
        const ref = req.body.ref;
        if (ref !== 'refs/heads/main') {
            Logger.log('[DEPLOY] ⚠️ main 브랜치가 아님', { ref, ip: req.ip });
            return res.status(200).json({ message: 'Not main branch, ignored' });
        }

        // 4. 배포 스크립트 실행 (비동기로 실행, 응답은 즉시 반환)
        Logger.log('[DEPLOY] 🚀 자동 배포 시작', {
            commit: req.body.head_commit?.id?.substring(0, 7),
            message: req.body.head_commit?.message,
            author: req.body.head_commit?.author?.name
        });

        // 배포 스크립트를 백그라운드로 실행 (응답 블로킹 방지)
        exec('/root/deploy.sh', {
            cwd: '/root',
            env: { ...process.env, PATH: process.env.PATH }
        }, (error, stdout, stderr) => {
            if (error) {
                Logger.log('[DEPLOY] ❌ 배포 실패', {
                    error: error.message,
                    stderr: stderr.substring(0, 500)
                });
            } else {
                Logger.log('[DEPLOY] ✅ 배포 완료', {
                    stdout: stdout.substring(0, 500)
                });
            }
        });

        // 즉시 응답 반환 (GitHub webhook 타임아웃 방지)
        res.status(200).json({
            success: true,
            message: 'Deployment started',
            commit: req.body.head_commit?.id?.substring(0, 7)
        });

    } catch (error) {
        Logger.log('[DEPLOY] ❌ 웹훅 처리 오류', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

