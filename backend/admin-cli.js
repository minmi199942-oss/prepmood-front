#!/usr/bin/env node

/**
 * 관리자 CLI 도구
 * 
 * 사용법:
 *   node admin-cli.js warranty:transfer --token=TOKEN --from=EMAIL --to=EMAIL
 *   node admin-cli.js token:lookup --token=TOKEN
 *   node admin-cli.js token:block --token=TOKEN
 *   node admin-cli.js warranty:delete --token=TOKEN
 */

const { Command } = require('commander');
const mysql = require('mysql2/promise');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const program = new Command();

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// 관리자 이메일 확인
const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.toLowerCase().trim())
    .filter(email => email.length > 0);

/**
 * 이메일로 user_id 조회
 */
async function getUserIdByEmail(connection, email) {
    const [rows] = await connection.execute(
        'SELECT user_id, email, first_name, last_name FROM users WHERE email = ?',
        [email.toLowerCase().trim()]
    );
    
    if (rows.length === 0) {
        throw new Error(`사용자를 찾을 수 없습니다: ${email}`);
    }
    
    return rows[0];
}

/**
 * 토큰 정보 조회
 */
async function lookupToken(connection, token) {
    // token_master 조회
    const [tokenRows] = await connection.execute(
        'SELECT * FROM token_master WHERE token = ?',
        [token]
    );
    
    if (tokenRows.length === 0) {
        throw new Error(`토큰을 찾을 수 없습니다: ${token}`);
    }
    
    const tokenMaster = tokenRows[0];
    
    // 소유주 정보 조회
    let ownerInfo = null;
    if (tokenMaster.owner_user_id) {
        const [userRows] = await connection.execute(
            'SELECT user_id, email, first_name, last_name FROM users WHERE user_id = ?',
            [tokenMaster.owner_user_id]
        );
        if (userRows.length > 0) {
            ownerInfo = userRows[0];
        }
    }
    
    // warranties 조회
    const [warrantyRows] = await connection.execute(
        'SELECT * FROM warranties WHERE token = ? AND deleted_at IS NULL',
        [token]
    );
    
    // scan_logs 조회 (최근 5개)
    const [scanLogs] = await connection.execute(
        `SELECT id, user_id, warranty_public_id, event_type, country_name, ip_address, created_at 
         FROM scan_logs 
         WHERE token = ? 
         ORDER BY id DESC 
         LIMIT 5`,
        [token]
    );
    
    return {
        token_master: tokenMaster,
        owner: ownerInfo,
        warranty: warrantyRows.length > 0 ? warrantyRows[0] : null,
        scan_logs: scanLogs
    };
}

/**
 * 사용자 확인 프롬프트
 */
function promptConfirmation(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase().trim() === 'yes' || answer.toLowerCase().trim() === 'y');
        });
    });
}

/**
 * 보증서 양도
 */
async function transferWarranty(token, fromEmail, toEmail, reason = null, dryRun = false, skipConfirm = false) {
    let connection = null;
    
    try {
        connection = await mysql.createConnection(dbConfig);
        
        await connection.beginTransaction();
        
        // 1. 이메일로 user_id 조회
        const fromUser = await getUserIdByEmail(connection, fromEmail);
        const toUser = await getUserIdByEmail(connection, toEmail);
        const adminUser = adminEmails.length > 0 
            ? await getUserIdByEmail(connection, adminEmails[0])
            : null;
        
        console.log(`\n📋 양도 정보:`);
        console.log(`   토큰: ${token}`);
        console.log(`   현재 소유주: ${fromUser.email} (user_id: ${fromUser.user_id})`);
        console.log(`   새 소유주: ${toUser.email} (user_id: ${toUser.user_id})`);
        console.log(`   관리자: ${adminUser ? adminUser.email : '시스템'}`);
        
        // 2. 현재 보증서 상태 확인
        const [warrantyRows] = await connection.execute(
            'SELECT public_id, user_id FROM warranties WHERE token = ? AND deleted_at IS NULL',
            [token]
        );
        
        if (warrantyRows.length === 0) {
            throw new Error(`보증서를 찾을 수 없습니다: ${token}`);
        }
        
        const warranty = warrantyRows[0];
        
        if (warranty.user_id !== fromUser.user_id) {
            throw new Error(`소유주가 일치하지 않습니다. 현재 소유주: user_id ${warranty.user_id}`);
        }
        
        // 3. token_master 확인
        const [tokenRows] = await connection.execute(
            'SELECT owner_user_id FROM token_master WHERE token = ?',
            [token]
        );
        
        if (tokenRows.length === 0) {
            throw new Error(`토큰을 찾을 수 없습니다: ${token}`);
        }
        
        if (tokenRows[0].owner_user_id !== fromUser.user_id) {
            throw new Error(`token_master의 소유주가 일치하지 않습니다.`);
        }
        
        // dry-run 모드: 실제 업데이트 없이 미리보기만
        if (dryRun) {
            console.log(`\n🔍 [DRY-RUN] 다음 작업이 실행될 예정입니다:`);
            console.log(`   1. warranties.user_id: ${fromUser.user_id} → ${toUser.user_id}`);
            console.log(`   2. token_master.owner_user_id: ${fromUser.user_id} → ${toUser.user_id}`);
            console.log(`   3. transfer_logs 기록 추가`);
            console.log(`\n⚠️  실제로는 변경되지 않습니다. (--dry-run 모드)`);
            return;
        }
        
        // 확인 프롬프트
        if (!skipConfirm) {
            const confirmed = await promptConfirmation(`\n⚠️  정말 양도하시겠습니까? (yes/no): `);
            if (!confirmed) {
                console.log(`\n❌ 양도가 취소되었습니다.`);
                return;
            }
        }
        
        // 4. warranties 업데이트
        const [warrantyUpdate] = await connection.execute(
            'UPDATE warranties SET user_id = ? WHERE token = ? AND user_id = ? AND deleted_at IS NULL',
            [toUser.user_id, token, fromUser.user_id]
        );
        
        if (warrantyUpdate.affectedRows === 0) {
            throw new Error('warranties 업데이트 실패');
        }
        
        // 5. token_master 업데이트
        const [tokenUpdate] = await connection.execute(
            'UPDATE token_master SET owner_user_id = ?, updated_at = NOW() WHERE token = ? AND owner_user_id = ?',
            [toUser.user_id, token, fromUser.user_id]
        );
        
        if (tokenUpdate.affectedRows === 0) {
            throw new Error('token_master 업데이트 실패');
        }
        
        // 6. transfer_logs 기록
        const transferReason = reason || `관리자 수동 양도: ${fromUser.email} → ${toUser.email}`;
        
        await connection.execute(
            `INSERT INTO transfer_logs (
                warranty_public_id,
                token,
                from_user_id,
                to_user_id,
                admin_user_id,
                reason,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [
                warranty.public_id,
                token,
                fromUser.user_id,
                toUser.user_id,
                adminUser ? adminUser.user_id : null,
                transferReason
            ]
        );
        
        await connection.commit();
        
        console.log(`\n✅ 양도 완료!`);
        console.log(`   새 소유주: ${toUser.email} (user_id: ${toUser.user_id})`);
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error(`\n❌ 양도 실패: ${error.message}`);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

/**
 * 토큰 차단
 */
async function blockToken(token, reason = null, dryRun = false, skipConfirm = false) {
    let connection = null;
    
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // dry-run 모드
        if (dryRun) {
            const [tokenRows] = await connection.execute(
                'SELECT is_blocked FROM token_master WHERE token = ?',
                [token]
            );
            
            if (tokenRows.length === 0) {
                throw new Error(`토큰을 찾을 수 없습니다: ${token}`);
            }
            
            console.log(`\n🔍 [DRY-RUN] 다음 작업이 실행될 예정입니다:`);
            console.log(`   token_master.is_blocked: ${tokenRows[0].is_blocked} → 1`);
            if (reason) {
                console.log(`   사유: ${reason}`);
            }
            console.log(`\n⚠️  실제로는 변경되지 않습니다. (--dry-run 모드)`);
            return;
        }
        
        // 확인 프롬프트
        if (!skipConfirm) {
            const confirmed = await promptConfirmation(`\n⚠️  정말 토큰을 차단하시겠습니까? (yes/no): `);
            if (!confirmed) {
                console.log(`\n❌ 차단이 취소되었습니다.`);
                return;
            }
        }
        
        const [result] = await connection.execute(
            'UPDATE token_master SET is_blocked = 1, updated_at = NOW() WHERE token = ?',
            [token]
        );
        
        if (result.affectedRows === 0) {
            throw new Error(`토큰을 찾을 수 없습니다: ${token}`);
        }
        
        console.log(`\n✅ 토큰 차단 완료: ${token}`);
        if (reason) {
            console.log(`   사유: ${reason}`);
        }
        
    } catch (error) {
        console.error(`\n❌ 토큰 차단 실패: ${error.message}`);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

/**
 * 토큰 차단 해제
 */
async function unblockToken(token) {
    let connection = null;
    
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [result] = await connection.execute(
            'UPDATE token_master SET is_blocked = 0, updated_at = NOW() WHERE token = ?',
            [token]
        );
        
        if (result.affectedRows === 0) {
            throw new Error(`토큰을 찾을 수 없습니다: ${token}`);
        }
        
        console.log(`\n✅ 토큰 차단 해제 완료: ${token}`);
        
    } catch (error) {
        console.error(`\n❌ 토큰 차단 해제 실패: ${error.message}`);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

/**
 * CSV 파일 파싱 (간단한 구현, 쉼표 안의 값은 처리하지 않음)
 * 
 * 주의사항:
 * - CSV는 UTF-8 인코딩으로 저장해야 함
 * - 헤더: token,from,to,reason (순서 고정 권장)
 * - 쉼표가 포함된 값은 따옴표로 감싸지 않아도 됨 (간단한 파서)
 * - 복잡한 CSV는 외부 라이브러리(csv-parse) 사용 권장
 */
function parseCSV(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim().length > 0);
        
        if (lines.length < 2) {
            throw new Error('CSV 파일에 헤더와 최소 1개 행의 데이터가 필요합니다.');
        }
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // 필수 헤더 확인
        const requiredHeaders = ['token', 'from', 'to'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            throw new Error(`필수 헤더가 없습니다: ${missingHeaders.join(', ')}`);
        }
        
        const results = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length !== headers.length) {
                console.warn(`⚠️  ${i + 1}번째 행: 컬럼 수 불일치 (헤더: ${headers.length}, 데이터: ${values.length}) - 건너뜀`);
                continue;
            }
            
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            // 필수 필드 확인
            if (!row.token || !row.from || !row.to) {
                console.warn(`⚠️  ${i + 1}번째 행: 필수 필드 누락 (token, from, to) - 건너뜀`);
                continue;
            }
            
            results.push(row);
        }
        
        return results;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`CSV 파일을 찾을 수 없습니다: ${filePath}`);
        }
        throw error;
    }
}

/**
 * 일괄 양도 (CSV)
 */
async function transferBatch(csvPath, dryRun = false, skipConfirm = false) {
    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV 파일을 찾을 수 없습니다: ${csvPath}`);
    }
    
    const rows = parseCSV(csvPath);
    
    if (rows.length === 0) {
        throw new Error('CSV 파일에 데이터가 없습니다.');
    }
    
    console.log(`\n📋 일괄 양도 작업:`);
    console.log(`   총 ${rows.length}건의 양도 작업이 예정되어 있습니다.`);
    
    if (dryRun) {
        console.log(`\n🔍 [DRY-RUN] 다음 작업들이 실행될 예정입니다:\n`);
        rows.forEach((row, index) => {
            console.log(`   ${index + 1}. ${row.token}: ${row.from} → ${row.to}`);
        });
        console.log(`\n⚠️  실제로는 변경되지 않습니다. (--dry-run 모드)`);
        return;
    }
    
    if (!skipConfirm) {
        const confirmed = await promptConfirmation(`\n⚠️  정말 ${rows.length}건을 일괄 양도하시겠습니까? (yes/no): `);
        if (!confirmed) {
            console.log(`\n❌ 일괄 양도가 취소되었습니다.`);
            return;
        }
    }
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const token = row.token || row.TOKEN;
        const from = row.from || row.FROM;
        const to = row.to || row.TO;
        const reason = row.reason || row.REASON || null;
        
        if (!token || !from || !to) {
            errors.push(`${i + 1}번째 행: 필수 필드 누락 (token, from, to 필요)`);
            failCount++;
            continue;
        }
        
        try {
            await transferWarranty(token, from, to, reason, false, true); // skipConfirm = true (이미 확인함)
            successCount++;
            console.log(`✅ [${i + 1}/${rows.length}] ${token}: 양도 완료`);
        } catch (error) {
            failCount++;
            errors.push(`${i + 1}번째 행 (${token}): ${error.message}`);
            console.error(`❌ [${i + 1}/${rows.length}] ${token}: 양도 실패 - ${error.message}`);
        }
    }
    
    console.log(`\n📊 일괄 양도 결과:`);
    console.log(`   성공: ${successCount}건`);
    console.log(`   실패: ${failCount}건`);
    
    if (errors.length > 0) {
        console.log(`\n❌ 실패 상세:`);
        errors.forEach(err => console.log(`   - ${err}`));
    }
}

/**
 * 보증서 삭제 (soft delete)
 */
async function deleteWarranty(token, reason = null, dryRun = false, skipConfirm = false) {
    let connection = null;
    
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // dry-run 모드
        if (dryRun) {
            const [warrantyRows] = await connection.execute(
                'SELECT public_id, user_id FROM warranties WHERE token = ? AND deleted_at IS NULL',
                [token]
            );
            
            if (warrantyRows.length === 0) {
                throw new Error(`보증서를 찾을 수 없습니다: ${token}`);
            }
            
            console.log(`\n🔍 [DRY-RUN] 다음 작업이 실행될 예정입니다:`);
            console.log(`   1. warranties.deleted_at: NULL → NOW()`);
            console.log(`   2. warranties.delete_reason: "${reason || '관리자 수동 삭제'}"`);
            console.log(`   3. token_master.is_blocked: 0 → 1`);
            console.log(`\n⚠️  실제로는 변경되지 않습니다. (--dry-run 모드)`);
            return;
        }
        
        // 확인 프롬프트
        if (!skipConfirm) {
            const confirmed = await promptConfirmation(`\n⚠️  정말 보증서를 삭제하시겠습니까? (yes/no): `);
            if (!confirmed) {
                console.log(`\n❌ 삭제가 취소되었습니다.`);
                return;
            }
        }
        
        await connection.beginTransaction();
        
        // warranties soft delete
        const [warrantyResult] = await connection.execute(
            `UPDATE warranties 
             SET deleted_at = NOW(), 
                 delete_reason = ?,
                 deleted_by = (SELECT user_id FROM users WHERE email = ? LIMIT 1)
             WHERE token = ? AND deleted_at IS NULL`,
            [
                reason || '관리자 수동 삭제',
                adminEmails.length > 0 ? adminEmails[0] : null,
                token
            ]
        );
        
        if (warrantyResult.affectedRows === 0) {
            throw new Error(`보증서를 찾을 수 없거나 이미 삭제되었습니다: ${token}`);
        }
        
        // token_master 차단
        await connection.execute(
            'UPDATE token_master SET is_blocked = 1, updated_at = NOW() WHERE token = ?',
            [token]
        );
        
        await connection.commit();
        
        console.log(`\n✅ 보증서 삭제 완료: ${token}`);
        if (reason) {
            console.log(`   사유: ${reason}`);
        }
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error(`\n❌ 보증서 삭제 실패: ${error.message}`);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// CLI 명령어 정의
program
    .name('admin-cli')
    .description('Pre.p Mood 관리자 CLI 도구')
    .version('1.0.0');

// warranty:transfer - 보증서 양도
program
    .command('warranty:transfer')
    .description('보증서 소유주 양도')
    .requiredOption('--token <token>', '토큰')
    .requiredOption('--from <email>', '현재 소유주 이메일')
    .requiredOption('--to <email>', '새 소유주 이메일')
    .option('--reason <reason>', '양도 사유')
    .option('--dry-run', '실제 변경 없이 미리보기만 (실수 방지)')
    .option('--yes', '확인 프롬프트 건너뛰기 (자동화용)')
    .action(async (options) => {
        await transferWarranty(options.token, options.from, options.to, options.reason, options.dryRun, options.yes);
    });

// token:search - 토큰 검색
async function searchTokens(connection, searchTerm) {
    // 이메일로 검색
    const [emailUsers] = await connection.execute(
        'SELECT user_id FROM users WHERE email LIKE ?',
        [`%${searchTerm}%`]
    );
    
    const userIds = emailUsers.map(u => u.user_id);
    
    let query = `
        SELECT 
            tm.token,
            tm.product_name,
            tm.internal_code,
            tm.is_blocked,
            tm.scan_count,
            tm.owner_user_id,
            u.email as owner_email,
            tm.first_scanned_at,
            tm.last_scanned_at
        FROM token_master tm
        LEFT JOIN users u ON tm.owner_user_id = u.user_id
        WHERE 
            tm.token LIKE ? OR
            tm.product_name LIKE ? OR
            tm.internal_code LIKE ?
    `;
    
    const params = [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`];
    
    if (userIds.length > 0) {
        query += ` OR tm.owner_user_id IN (${userIds.map(() => '?').join(',')})`;
        params.push(...userIds);
    }
    
    query += ' ORDER BY tm.last_scanned_at DESC LIMIT 50';
    
    const [rows] = await connection.execute(query, params);
    return rows;
}

// token:lookup - 토큰 조회
program
    .command('token:lookup')
    .description('토큰 정보 조회')
    .option('--token <token>', '토큰 (정확히 일치)')
    .option('--search <term>', '검색어 (토큰, 제품명, 내부코드, 이메일로 검색)')
    .action(async (options) => {
        if (!options.token && !options.search) {
            console.error('❌ --token 또는 --search 옵션이 필요합니다.');
            process.exit(1);
        }
        
        let connection = null;
        try {
            connection = await mysql.createConnection(dbConfig);
            
            if (options.search) {
                // 검색 모드
                const results = await searchTokens(connection, options.search);
                
                if (results.length === 0) {
                    console.log(`\n❌ 검색 결과가 없습니다: ${options.search}`);
                    process.exit(1);
                }
                
                console.log(`\n📋 검색 결과 (${results.length}개, 최대 50개):`);
                results.forEach((row, index) => {
                    console.log(`\n${index + 1}. 토큰: ${row.token}`);
                    console.log(`   제품명: ${row.product_name}`);
                    console.log(`   내부코드: ${row.internal_code}`);
                    console.log(`   상태: ${row.is_blocked ? '차단됨' : '정상'}`);
                    console.log(`   스캔횟수: ${row.scan_count}회`);
                    console.log(`   소유주: ${row.owner_email || '없음'}`);
                    console.log(`   최종 스캔: ${row.last_scanned_at || '없음'}`);
                });
                
                if (results.length === 50) {
                    console.log(`\n⚠️  결과가 50개로 제한되었습니다. 더 구체적인 검색어를 사용하세요.`);
                }
                
                return;
            }
            
            // 단일 토큰 조회 모드
        let connection = null;
        try {
            connection = await mysql.createConnection(dbConfig);
            const info = await lookupToken(connection, options.token);
            
            console.log('\n📋 토큰 정보:');
            console.log(`   토큰: ${info.token_master.token}`);
            console.log(`   제품명: ${info.token_master.product_name}`);
            console.log(`   내부코드: ${info.token_master.internal_code}`);
            console.log(`   차단여부: ${info.token_master.is_blocked ? '차단됨' : '정상'}`);
            console.log(`   스캔횟수: ${info.token_master.scan_count}회`);
            console.log(`   최초 스캔: ${info.token_master.first_scanned_at || '없음'}`);
            console.log(`   최종 스캔: ${info.token_master.last_scanned_at || '없음'}`);
            
            if (info.owner) {
                console.log(`\n👤 소유주 정보:`);
                console.log(`   user_id: ${info.owner.user_id}`);
                console.log(`   이메일: ${info.owner.email}`);
                console.log(`   이름: ${info.owner.first_name || ''} ${info.owner.last_name || ''}`);
            } else {
                console.log(`\n👤 소유주: 없음`);
            }
            
            if (info.warranty) {
                console.log(`\n📄 보증서 정보:`);
                console.log(`   public_id: ${info.warranty.public_id}`);
                console.log(`   생성일: ${info.warranty.created_at}`);
                console.log(`   인증일: ${info.warranty.verified_at}`);
            } else {
                console.log(`\n📄 보증서: 없음`);
            }
            
            if (info.scan_logs.length > 0) {
                console.log(`\n📊 최근 스캔 이력 (최근 ${info.scan_logs.length}개):`);
                info.scan_logs.forEach((log, index) => {
                    console.log(`   ${index + 1}. ${log.event_type} - ${log.country_name || 'N/A'} - ${log.created_at}`);
                });
            }
            
        } catch (error) {
            console.error(`\n❌ 조회 실패: ${error.message}`);
            process.exit(1);
        } finally {
            if (connection) {
                await connection.end();
            }
        }
    });

// token:search - 토큰 검색 (별도 명령어)
program
    .command('token:search')
    .description('토큰 검색 (토큰, 제품명, 내부코드, 이메일로 검색)')
    .requiredOption('--term <term>', '검색어')
    .action(async (options) => {
        let connection = null;
        try {
            connection = await mysql.createConnection(dbConfig);
            const results = await searchTokens(connection, options.term);
            
            if (results.length === 0) {
                console.log(`\n❌ 검색 결과가 없습니다: ${options.term}`);
                process.exit(1);
            }
            
            console.log(`\n📋 검색 결과 (${results.length}개, 최대 50개):`);
            results.forEach((row, index) => {
                console.log(`\n${index + 1}. 토큰: ${row.token}`);
                console.log(`   제품명: ${row.product_name}`);
                console.log(`   내부코드: ${row.internal_code}`);
                console.log(`   상태: ${row.is_blocked ? '차단됨' : '정상'}`);
                console.log(`   스캔횟수: ${row.scan_count}회`);
                console.log(`   소유주: ${row.owner_email || '없음'}`);
                console.log(`   최종 스캔: ${row.last_scanned_at || '없음'}`);
            });
            
            if (results.length === 50) {
                console.log(`\n⚠️  결과가 50개로 제한되었습니다. 더 구체적인 검색어를 사용하세요.`);
            }
            
        } catch (error) {
            console.error(`\n❌ 검색 실패: ${error.message}`);
            process.exit(1);
        } finally {
            if (connection) {
                await connection.end();
            }
        }
    });

// token:block - 토큰 차단
program
    .command('token:block')
    .description('토큰 차단')
    .requiredOption('--token <token>', '토큰')
    .option('--reason <reason>', '차단 사유')
    .option('--dry-run', '실제 변경 없이 미리보기만')
    .option('--yes', '확인 프롬프트 건너뛰기')
    .action(async (options) => {
        await blockToken(options.token, options.reason, options.dryRun, options.yes);
    });

// token:unblock - 토큰 차단 해제
program
    .command('token:unblock')
    .description('토큰 차단 해제')
    .requiredOption('--token <token>', '토큰')
    .action(async (options) => {
        await unblockToken(options.token);
    });

// warranty:transfer-batch - 일괄 양도 (CSV)
program
    .command('warranty:transfer-batch')
    .description('보증서 일괄 양도 (CSV 파일)')
    .requiredOption('--file <path>', 'CSV 파일 경로')
    .option('--dry-run', '실제 변경 없이 미리보기만')
    .option('--yes', '확인 프롬프트 건너뛰기')
    .action(async (options) => {
        await transferBatch(options.file, options.dryRun, options.yes);
    });

// warranty:delete - 보증서 삭제
program
    .command('warranty:delete')
    .description('보증서 삭제 (soft delete)')
    .requiredOption('--token <token>', '토큰')
    .option('--reason <reason>', '삭제 사유')
    .option('--dry-run', '실제 변경 없이 미리보기만')
    .option('--yes', '확인 프롬프트 건너뛰기')
    .action(async (options) => {
        await deleteWarranty(options.token, options.reason, options.dryRun, options.yes);
    });

// 프로그램 실행
program.parse();

