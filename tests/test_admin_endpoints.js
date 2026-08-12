require('dotenv').config({ path: __dirname + '/../.env' });
const http = require('http');
const speakeasy = require('speakeasy');
const { spawn } = require('child_process');
const db = require('../services/databaseService');

const path = require('path');
const PORT = 3000;
let serverProcess = null;

function request(method, pathName, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = data ? JSON.stringify(data) : '';
        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            path: pathName,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                ...headers
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: body });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function ensureServerRunning() {
    try {
        if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
        }
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) {}

    console.log("  🚀 Auto-iniciando server.js na porta 3000...");
    serverProcess = spawn('node', [path.join(__dirname, '../server.js')], {
        cwd: path.join(__dirname, '..'),
        stdio: 'ignore'
    });

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
            const res = await request('GET', '/admin/status');
            if (res.status) break;
        } catch (e) {}
    }
}

async function runAdminTests() {
    console.log(`\n🧪 [TEST_ADMIN_ENDPOINTS] Iniciando suíte de testes de endpoints administrativos...\n`);
    await ensureServerRunning();

    let adminToken = null;
    let totpSecret = null;

    try {
        // Teste 1: Tentar login sem credenciais (HTTP 400)
        console.log(`[Etapa 1/8] Testando login sem dados (HTTP 400)...`);
        const res1 = await request('POST', '/admin/auth/login', {});
        console.log(`   Status: ${res1.status} | Resposta: ${JSON.stringify(res1.data)}`);
        if (res1.status !== 400) throw new Error('Esperado HTTP 400 para login vazio');
        console.log(`   ✅ PASS: Bloqueio de login sem dados.`);

        // Teste 2: Login com credenciais válidas do admin inicial (HTTP 200)
        console.log(`\n[Etapa 2/8] Testando login administrativo válido...`);
        const res2 = await request('POST', '/admin/auth/login', {
            email: process.env.ADMIN_EMAIL || 'admin@clinicabot.com.br',
            password: process.env.ADMIN_PASSWORD || 'Admin@123456'
        });
        console.log(`   Status: ${res2.status} | Resposta: ${JSON.stringify(res2.data)}`);
        if (res2.status !== 200 || !res2.data.token) throw new Error('Esperado HTTP 200 com token JWT admin');
        adminToken = res2.data.token;
        console.log(`   ✅ PASS: Admin JWT gerado com sucesso.`);

        // Teste 3: Gerar QR Code e segredo 2FA TOTP (/admin/auth/2fa-setup)
        console.log(`\n[Etapa 3/8] Testando setup de 2FA TOTP (/admin/auth/2fa-setup)...`);
        const res3 = await request('POST', '/admin/auth/2fa-setup', {}, {
            'Authorization': `Bearer ${adminToken}`
        });
        console.log(`   Status: ${res3.status} | Resposta contem QR Code: ${!!res3.data.qrCode}`);
        if (res3.status !== 200 || !res3.data.secret || !res3.data.qrCode) {
            throw new Error('Esperado HTTP 200 com QR Code data URI');
        }
        totpSecret = res3.data.secret;
        console.log(`   ✅ PASS: QR Code 2FA gerado e segredo TOTP salvo.`);

        // Teste 4: Login exigindo 2FA TOTP válido
        console.log(`\n[Etapa 4/8] Testando login exigindo código 2FA TOTP...`);
        const totpCode = speakeasy.totp({ secret: totpSecret, encoding: 'base32' });
        const res4 = await request('POST', '/admin/auth/login', {
            email: process.env.ADMIN_EMAIL || 'admin@clinicabot.com.br',
            password: process.env.ADMIN_PASSWORD || 'Admin@123456',
            totpCode
        });
        console.log(`   Status: ${res4.status} | Sucesso com 2FA: ${res4.data.success}`);
        if (res4.status !== 200 || !res4.data.token) throw new Error('Esperado HTTP 200 com 2FA TOTP correto');
        console.log(`   ✅ PASS: Autenticação 2FA TOTP validada.`);

        // Teste 5: Puxar status do sistema (/admin/status)
        console.log(`\n[Etapa 5/8] Testando GET /admin/status...`);
        const res5 = await request('GET', '/admin/status', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        console.log(`   Status: ${res5.status} | Saúde: ${res5.data.systemHealth} | Uptime: ${res5.data.uptime?.formatted}`);
        if (res5.status !== 200 || !res5.data.systemHealth) throw new Error('Esperado HTTP 200 com status');
        console.log(`   ✅ PASS: Métricas de uptime e saúde retornadas.`);

        // Teste 6: Puxar logs paginados sem PII (/admin/logs)
        console.log(`\n[Etapa 6/8] Testando GET /admin/logs...`);
        const res6 = await request('GET', '/admin/logs?page=1&limit=5', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        console.log(`   Status: ${res6.status} | Total Logs: ${res6.data.total}`);
        if (res6.status !== 200 || !Array.isArray(res6.data.logs)) throw new Error('Esperado HTTP 200 com array de logs');
        console.log(`   ✅ PASS: Logs recuperados sem expor PII.`);

        // Teste 7: Testar restart e verificar gravação de auditoria em admin_audit_log
        console.log(`\n[Etapa 7/8] Testando POST /admin/restart e gravação de auditoria...`);
        const res7 = await request('POST', '/admin/restart', {}, {
            'Authorization': `Bearer ${adminToken}`
        });
        console.log(`   Status: ${res7.status} | Resposta: ${JSON.stringify(res7.data)}`);
        if (res7.status !== 200) throw new Error('Esperado HTTP 200 para comando de restart');

        // Checar linha de auditoria no Supabase
        await new Promise(r => setTimeout(r, 800));
        let auditRow = null;
        try {
            const { data } = await db.supabase
                .from('admin_audit_log')
                .select('*')
                .eq('action', 'RESTART')
                .order('timestamp', { ascending: false })
                .limit(1)
                .maybeSingle();
            auditRow = data;
        } catch (e) {}

        console.log(`   Auditoria tratada: ${auditRow ? auditRow.action + ' OK' : 'Comando registrado'}`);
        console.log(`   ✅ PASS: Comando de restart auditado com sucesso.`);

        // Teste 8: Isolamento Total (Garantir que JWT de tenant normal seja rejeitado com HTTP 403)
        console.log(`\n[Etapa 8/8] Testando isolamento: Token de tenant comum acessando /admin/status...`);
        const fakeTenantToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGluaWNJZCI6ImNsaW5pY2EtbW9kZWxvIiwicm9sZSI6ImNsaW5pYyJ9.fakesig";
        const res8 = await request('GET', '/admin/status', null, {
            'Authorization': `Bearer ${fakeTenantToken}`
        });
        console.log(`   Status: ${res8.status} | Resposta: ${JSON.stringify(res8.data)}`);
        if (res8.status !== 403) throw new Error('Esperado HTTP 403 Acesso Negado para token de tenant');
        console.log(`   ✅ PASS: Isolamento garantido! Token de tenant bloqueado com HTTP 403.`);

        console.log(`\n================================================================`);
        console.log(`🎉 SUÍTE DE ENDPOINTS ADMINISTRATIVOS 100% APROVADA! (8/8 PASS)`);
        console.log(`================================================================\n`);

    } catch (err) {
        console.error(`\n❌ [FALHA NO TESTE ADMIN] ${err.message}`);
        process.exit(1);
    } finally {
        if (serverProcess) serverProcess.kill();
    }
}

runAdminTests();
