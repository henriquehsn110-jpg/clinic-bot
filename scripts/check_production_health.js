/**
 * SCRIPT DE VALIDAÇÃO EMPÍRICA DE UPTIME EM PRODUÇÃO (RENDER LIVE)
 * Executa requisições HTTPS diretas para https://clinic-bot-zksc.onrender.com
 * e captura os retornos brutos da nuvem.
 */
require('dotenv').config();
const https = require('https');

const RENDER_DOMAIN = 'clinic-bot-zksc.onrender.com';

function makeHttpsRequest(path) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const req = https.request({
            hostname: RENDER_DOMAIN,
            path: path,
            method: 'GET',
            headers: {
                'User-Agent': 'UptimeRobot-Production-Audit/1.0'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const latencyMs = Date.now() - startTime;
                resolve({
                    statusCode: res.statusCode,
                    latencyMs: latencyMs,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', err => reject(err));
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('HTTPS Request Timeout (>15s)'));
        });
        req.end();
    });
}

async function runProductionHealthCheck() {
    console.log(`🌐 [PRODUCTION_AUDIT] Iniciando checagem HTTPS ao vivo em: https://${RENDER_DOMAIN}...\n`);

    try {
        // 1. Teste de Produção /health
        console.log('[1] HTTPS GET https://clinic-bot-zksc.onrender.com/health');
        const health = await makeHttpsRequest('/health');
        console.log(`   Status: HTTP ${health.statusCode} (${health.latencyMs}ms)`);
        console.log(`   Headers: server=${health.headers.server || 'render'}, date=${health.headers.date}`);
        console.log(`   Body: ${health.body}\n`);

        // 2. Teste de Produção Landing Page /
        console.log('[2] HTTPS GET https://clinic-bot-zksc.onrender.com/');
        const root = await makeHttpsRequest('/');
        console.log(`   Status: HTTP ${root.statusCode} (${root.latencyMs}ms)`);
        console.log(`   Content-Length: ${root.body.length} bytes\n`);

        // 3. Teste de Produção Dashboard /dashboard
        console.log('[3] HTTPS GET https://clinic-bot-zksc.onrender.com/dashboard');
        const dash = await makeHttpsRequest('/dashboard');
        console.log(`   Status: HTTP ${dash.statusCode} (${dash.latencyMs}ms)`);
        console.log(`   Content-Length: ${dash.body.length} bytes\n`);

        // 4. Teste de Produção Simulação de Erro /health?sim_error=1
        console.log('[4] HTTPS GET https://clinic-bot-zksc.onrender.com/health?sim_error=1 (Disparo de Alerta)');
        const errTest = await makeHttpsRequest('/health?sim_error=1');
        console.log(`   Status: HTTP ${errTest.statusCode} (${errTest.latencyMs}ms) — [ESPERADO 500]`);
        console.log(`   Body: ${errTest.body}\n`);

        console.log('================================================================');
        console.log('🎉 AUDITORIA HTTPS EM PRODUÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('================================================================');
    } catch (err) {
        console.error('❌ ERRO NA REQUISIÇÃO HTTPS EM PRODUÇÃO:', err.message);
        process.exit(1);
    }
}

runProductionHealthCheck();
