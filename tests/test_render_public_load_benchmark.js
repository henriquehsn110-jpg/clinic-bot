/**
 * BENCHMARK DE CARGA REAL NO RENDER HOSPEDADO / LOCAL STAGING (PROMPT 10 - RPC COMPARISON)
 * Mede a capacidade e latência de ponta a ponta pós-migração RPC.
 */
process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const axios = require('axios');

const RENDER_BASE_URL = process.env.RENDER_BASE_URL || process.env.BASE_URL || 'https://clinic-bot-zksc.onrender.com';

async function authenticate(clinicSlug = 'clinica-modelo') {
    const res = await axios.post(`${RENDER_BASE_URL}/api/dashboard/auth/login`, {
        email: 'admin@clinicamodelo.com.br',
        password: '123456',
        clinicSlug
    }, { timeout: 15000 });
    return res.data.token;
}

// Executa 1 requisição HTTP completa e mede a latência de ponta a ponta
async function makeRequest(token, type = 'dashboard_data') {
    const start = Date.now();
    try {
        let res;
        if (type === 'dashboard_data') {
            res = await axios.get(`${RENDER_BASE_URL}/api/dashboard/data`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 30000
            });
        } else if (type === 'health') {
            res = await axios.get(`${RENDER_BASE_URL}/health`, {
                timeout: 30000
            });
        }
        const latency = Date.now() - start;
        return { success: res.status === 200, status: res.status, latency };
    } catch (err) {
        const latency = Date.now() - start;
        return {
            success: false,
            status: err.response ? err.response.status : (err.code || 'TIMEOUT'),
            error: err.message,
            latency
        };
    }
}

// Executa um degrau de concorrência com N requisições simultâneas via HTTPS
async function runRenderConcurrencyTier(concurrencyLevel, token, testType = 'dashboard_data') {
    const promises = [];
    const tierStart = Date.now();

    for (let i = 0; i < concurrencyLevel; i++) {
        promises.push(makeRequest(token, testType));
    }

    const results = await Promise.all(promises);
    const tierDuration = Date.now() - tierStart;

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const latencies = results.map(r => r.latency).sort((a, b) => a - b);
    const meanLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const minLatency = latencies[0];
    const maxLatency = latencies[latencies.length - 1];
    const errorRate = ((failed.length / concurrencyLevel) * 100).toFixed(1);
    const rps = (successful.length / (tierDuration / 1000)).toFixed(2);

    return {
        concurrency: concurrencyLevel,
        totalDuration: tierDuration,
        successful: successful.length,
        failed: failed.length,
        errorRate: parseFloat(errorRate),
        meanLatency,
        p50,
        p95,
        minLatency,
        maxLatency,
        rps,
        failedDetails: failed.map(f => f.status)
    };
}

async function runBenchmark() {
    console.log('================================================================');
    console.log('🌐 [PROMPT 10] BENCHMARK DE CARGA REAL NO ENDPOINT DE DASHBOARD (RPC ÚNICA)');
    console.log('================================================================');
    console.log(`Alvo: ${RENDER_BASE_URL}\n`);

    console.log('🔑 Autenticando no serviço para obter JWT...');
    let token = '';
    try {
        token = await authenticate('clinica-modelo');
        console.log('✅ Autenticação realizada com sucesso.\n');
    } catch (err) {
        console.error('❌ Falha ao autenticar:', err.message);
        process.exit(1);
    }

    // Degraus para Dashboard (5, 10, 20, 30, 40)
    const dashboardTiers = [5, 10, 20, 30, 40];

    console.log('================================================================');
    console.log('📊 FASE 1: CARGA EM ENDPOINT RELACIONAL (/api/dashboard/data)');
    console.log('================================================================\n');

    const phase1Results = [];
    for (const level of dashboardTiers) {
        process.stdout.write(`⏳ Disparando ${level} requisições simultâneas... `);
        const res = await runRenderConcurrencyTier(level, token, 'dashboard_data');
        phase1Results.push(res);
        console.log(`Concluído em ${(res.totalDuration / 1000).toFixed(1)}s | Latência: Média ${res.meanLatency}ms (p50: ${res.p50}ms, p95: ${res.p95}ms) | Erros: ${res.errorRate}% | Vazão: ${res.rps} req/s`);

        if (res.errorRate > 5.0 || res.p95 > 25000) {
            console.log(`⚠️ Ponto de parada atingido no nível ${level} (Erros: ${res.errorRate}%, p95: ${res.p95}ms)`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // Relatórios Finais
    console.log('\n================================================================');
    console.log('📋 RESULTADOS CONSOLIDADOS DO BENCHMARK (RPC ÚNICA)');
    console.log('================================================================\n');

    console.log('### TABELA FASE 1 — Endpoint de Dados Relacionais (/api/dashboard/data):');
    console.log('| Concorrência | Sucesso | Falhas | Erro (%) | Média (ms) | p50 (ms) | p95 (ms) | Vazão (req/s) |');
    console.log('|---|---|---|---|---|---|---|---|');
    phase1Results.forEach(r => {
        console.log(`| **${r.concurrency} conexões** | ${r.successful}/${r.concurrency} | ${r.failed} | ${r.errorRate}% | ${r.meanLatency}ms | ${r.p50}ms | ${r.p95}ms | **${r.rps} req/s** |`);
    });
}

runBenchmark().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO NO BENCHMARK:', err);
    process.exit(1);
});
