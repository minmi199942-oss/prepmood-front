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
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
require('dotenv').config();

// 배포 웹훅 로그 파일 경로 (backend 디렉토리 내부 - 권한 문제 방지)
const DEPLOY_LOG_FILE = path.join(__dirname, 'deploy-webhook.log');

// 로그 파일에 기록하는 헬퍼 함수
function logToFile(message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message} ${JSON.stringify(data)}\n`;
    try {
        fs.appendFileSync(DEPLOY_LOG_FILE, logEntry, { flag: 'a' });
    } catch (error) {
        // 로그 파일 쓰기 실패해도 배포는 계속 진행
        console.error('[DEPLOY] 로그 파일 쓰기 실패:', error.message);
    }
}

/**
 * POST /api/deploy/webhook
 * 
 * GitHub webhook 수신 엔드포인트
 * - push 이벤트 시 자동 배포 실행
 */
router.post('/deploy/webhook', async (req, res) => {
    try {
        // 웹훅 수신 기록 (파일 로그)
        logToFile('웹훅 수신', { ip: req.ip, event: req.headers['x-github-event'] });

        // 1. Secret 검증
        const secret = process.env.DEPLOY_WEBHOOK_SECRET;
        if (!secret) {
            logToFile('❌ DEPLOY_WEBHOOK_SECRET이 설정되지 않음');
            Logger.log('[DEPLOY] ❌ DEPLOY_WEBHOOK_SECRET이 설정되지 않음');
            return res.status(500).json({ error: 'Webhook secret not configured' });
        }

        const signature = req.headers['x-hub-signature-256'];
        if (!signature) {
            logToFile('❌ 웹훅 서명 없음', { ip: req.ip });
            Logger.log('[DEPLOY] ❌ 웹훅 서명 없음', { ip: req.ip });
            return res.status(401).json({ error: 'Missing signature' });
        }

        // GitHub webhook signature 검증
        const payload = JSON.stringify(req.body);
        const hmac = crypto.createHmac('sha256', secret);
        const digest = 'sha256=' + hmac.update(payload).digest('hex');

        if (signature !== digest) {
            logToFile('❌ 웹훅 서명 검증 실패', { ip: req.ip });
            Logger.log('[DEPLOY] ❌ 웹훅 서명 검증 실패', { ip: req.ip });
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // 2. Push 이벤트 확인
        const event = req.headers['x-github-event'];
        if (event !== 'push') {
            logToFile('⚠️ Push 이벤트가 아님', { event, ip: req.ip });
            Logger.log('[DEPLOY] ⚠️ Push 이벤트가 아님', { event, ip: req.ip });
            return res.status(200).json({ message: 'Not a push event, ignored' });
        }

        // 3. main 브랜치 확인
        const ref = req.body.ref;
        if (ref !== 'refs/heads/main') {
            logToFile('⚠️ main 브랜치가 아님', { ref, ip: req.ip });
            Logger.log('[DEPLOY] ⚠️ main 브랜치가 아님', { ref, ip: req.ip });
            return res.status(200).json({ message: 'Not main branch, ignored' });
        }

        // 4. 배포 스크립트 실행 (비동기로 실행, 응답은 즉시 반환)
        const commitInfo = {
            commit: req.body.head_commit?.id?.substring(0, 7),
            message: req.body.head_commit?.message,
            author: req.body.head_commit?.author?.name
        };
        
        logToFile('🚀 자동 배포 시작', commitInfo);
        console.log('[DEPLOY] 🚀 자동 배포 시작', commitInfo);

        // 배포 실행 로그 파일 경로 (deploy.sh의 stdout/stderr를 여기에 저장)
        const DEPLOY_RUN_LOG = path.join(__dirname, 'deploy-run.log');
        
        // 경로 검증 (보안: command injection 방지)
        if (!DEPLOY_RUN_LOG || !DEPLOY_RUN_LOG.startsWith(__dirname) || DEPLOY_RUN_LOG.includes('..')) {
            logToFile('❌ 잘못된 로그 파일 경로', { path: DEPLOY_RUN_LOG });
            return res.status(500).json({ error: 'Invalid log path' });
        }
        
        // 배포 스크립트 경로 검증
        const DEPLOY_SCRIPT = '/root/prepmood-repo/deploy.sh';
        if (!fs.existsSync(DEPLOY_SCRIPT)) {
            logToFile('❌ 배포 스크립트 없음', { path: DEPLOY_SCRIPT });
            return res.status(500).json({ error: 'Deploy script not found' });
        }
        
        // 배포 스크립트를 완전히 분리된 프로세스로 실행
        // spawn + detached: true를 사용하여 PM2 재시작의 영향을 받지 않도록 함
        // stdout/stderr를 파일로 리다이렉트
        // nohup을 사용하여 부모 프로세스 종료 후에도 계속 실행되도록 함
        
        // 로그 파일 디스크립터 열기 (append 모드)
        const logFd = fs.openSync(DEPLOY_RUN_LOG, 'a');
        
        // spawn을 사용하여 완전히 분리된 프로세스로 실행
        // detached: true로 부모 프로세스와 완전히 분리
        // stdio를 파일 디스크립터로 리다이렉트하여 로그 저장
        const deployProcess = spawn('bash', ['-x', DEPLOY_SCRIPT], {
            cwd: '/root',
            detached: true,  // 부모 프로세스와 완전히 분리
            stdio: ['ignore', logFd, logFd],  // stdin 무시, stdout/stderr는 파일로
            env: { ...process.env, PATH: process.env.PATH }
        });
        
        // 파일 디스크립터를 닫지 않음 (자식 프로세스가 사용 중이므로)

        // 프로세스를 완전히 분리 (부모 프로세스가 종료되어도 계속 실행)
        deployProcess.unref();

        // 프로세스 시작 로그
        logToFile('📤 deploy.sh 실행 요청 (분리된 프로세스)', { 
            pid: deployProcess.pid,
            logFile: DEPLOY_RUN_LOG
        });
        console.log('[DEPLOY] 📤 deploy.sh 실행 요청 (분리된 프로세스)', { 
            pid: deployProcess.pid,
            logFile: DEPLOY_RUN_LOG
        });

        // 프로세스 이벤트 리스너 (선택적, 분리된 프로세스이므로 실행되지 않을 수 있음)
        deployProcess.on('error', (error) => {
            logToFile('❌ 배포 프로세스 실행 오류 (이벤트)', { error: error.message });
            console.error('[DEPLOY] ❌ 배포 프로세스 실행 오류 (이벤트)', error);
        });

        // 즉시 응답 반환 (GitHub webhook 타임아웃 방지)
        res.status(200).json({
            success: true,
            message: 'Deployment started',
            commit: req.body.head_commit?.id?.substring(0, 7)
        });

    } catch (error) {
        logToFile('❌ 웹훅 처리 오류', {
            error: error.message,
            stack: error.stack
        });
        Logger.log('[DEPLOY] ❌ 웹훅 처리 오류', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

