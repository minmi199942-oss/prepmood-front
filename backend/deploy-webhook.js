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
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
require('dotenv').config();

const execAsync = promisify(exec);

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
        
        // 배포 스크립트를 백그라운드로 실행 (stdout/stderr를 파일로 리다이렉트)
        // 주의: pm2 restart로 인해 이 프로세스가 재시작될 수 있으므로,
        // 완료 로그는 deploy-run.log에서 확인해야 함
        const deployCommand = `/root/deploy.sh >> ${DEPLOY_RUN_LOG} 2>&1`;
        const deployProcess = exec(deployCommand, {
            cwd: '/root',
            env: { ...process.env, PATH: process.env.PATH },
            maxBuffer: 10 * 1024 * 1024 // 10MB 버퍼
        }, (error, stdout, stderr) => {
            // 주의: pm2 restart로 인해 이 콜백이 실행되지 않을 수 있음
            // 실제 배포 결과는 deploy-run.log에서 확인
            if (error) {
                logToFile('❌ 배포 프로세스 오류 (콜백)', {
                    error: error.message,
                    code: error.code,
                    signal: error.signal
                });
                console.log('[DEPLOY] ❌ 배포 프로세스 오류 (콜백)', {
                    error: error.message,
                    code: error.code
                });
            } else {
                // 성공해도 이 콜백은 실행되지 않을 가능성이 높음 (pm2 restart 때문)
                logToFile('✅ 배포 완료 (콜백)', {
                    stdoutLength: stdout ? stdout.length : 0
                });
                console.log('[DEPLOY] ✅ 배포 완료 (콜백)', {
                    stdoutLength: stdout ? stdout.length : 0
                });
            }
        });

        // 프로세스 시작 로그 (이건 재시작 전에 기록됨)
        logToFile('📤 deploy.sh 실행 요청', { 
            pid: deployProcess.pid,
            logFile: DEPLOY_RUN_LOG
        });
        console.log('[DEPLOY] 📤 deploy.sh 실행 요청', { 
            pid: deployProcess.pid,
            logFile: DEPLOY_RUN_LOG
        });

        // 프로세스 이벤트 리스너 (디버깅용, 실행되지 않을 수 있음)
        deployProcess.on('close', (code) => {
            logToFile('📋 배포 프로세스 종료 (이벤트)', { exitCode: code });
            console.log('[DEPLOY] 📋 배포 프로세스 종료 (이벤트)', { exitCode: code });
        });

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

