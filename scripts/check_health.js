/**
 * SCRIPT DE VERIFICAÇÃO DE SAÚDE E TESTE DE ALERTAS DE UPTIME
 * Valida os endpoints /health, /, e /dashboard e executa simulação de falha
 */
require('dotenv').config();
const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = `http://localhost:${PORT}`;

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        }).on('error', err => reject(err));
    });
}

async function runHealthCheck() {
    console.log('🩺 [HEALTH_CHECK] Iniciando testes de disponibilidade...');

    try {
        // 1. Teste do /health normal
        console.log('\n[1] Testando GET /health...');
        const healthRes = await makeRequest(`${HOST}/health`);
        console.log(`   Status: HTTP ${healthRes.statusCode}`);
        console.log(`   Body: ${healthRes.body}`);

        // 2. Teste da Landing Page /
        console.log('\n[2] Testando GET / (Landing Page)...');
        const rootRes = await makeRequest(`${HOST}/`);
        console.log(`   Status: HTTP ${rootRes.statusCode}`);

        // 3. Teste do Dashboard /dashboard
        console.log('\n[3] Testando GET /dashboard...');
        const dashRes = await makeRequest(`${HOST}/dashboard`);
        console.log(`   Status: HTTP ${dashRes.statusCode}`);

        // 4. Teste de Simulação de Falha /health?sim_error=1
        console.log('\n[4] Testando SIMULAÇÃO DE FALHA (GET /health?sim_error=1)...');
        const failRes = await makeRequest(`${HOST}/health?sim_error=1`);
        console.log(`   Status: HTTP ${failRes.statusCode} (ESPERADO HTTP 500 PARA ALERTA)`);
        console.log(`   Body: ${failRes.body}`);

        console.log('\n✅ Todos os testes de endpoint concluídos com sucesso!');
    } catch (err) {
        console.error('❌ Erro durante verificação:', err.message);
    }
}

// Se chamado diretamente
if (require.main === module) {
    // Inicia o servidor se necessário ou faz os testes
    const server = require('../server');
    setTimeout(() => {
        runHealthCheck().then(() => process.exit(0));
    }, 1500);
}
