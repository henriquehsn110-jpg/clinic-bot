/**
 * BENCHMARK DE CARGA REAL NO RENDER HOSPEDADO (PROMPT 5 - STARTER COMPARISON)
 * Alvo: https://clinic-bot-zksc.onrender.com (URL Pública Real no Render)
 * Mede a capacidade e latência de ponta a ponta pós-upgrade (0.5 vCPU dedicada / 1 GB RAM).
 */
require('dotenv').config();
const axios = require('axios');

const RENDER_BASE_URL = 'https://clinic-bot-zksc.onrender.com';

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
    console.log('🌐 [PROMPT 5] BENCHMARK DE CARGA REAL NO RENDER (PÓS-UPGRADE STARTER)');
    console.log('================================================================');
    console.log(`Alvo: ${RENDER_BASE_URL} | Plano: Starter (0.5 CPU, 1 GB RAM)\n`);

    console.log('🔑 Autenticando no serviço do Render para obter JWT...');
    let token = '';
    try {
        token = await authenticate('clinica-modelo');
        console.log('✅ Autenticação realizada com sucesso no Render.\n');
    } catch (err) {
        console.error('❌ Falha ao autenticar no Render:', err.message);
        process.exit(1);
    }

    // Degraus para Dashboard (incluindo 30 e 40)
    const dashboardTiers = [5, 10, 20, 30, 40];
    const healthTiers = [5, 10, 20, 40, 80];

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 1: Carga Real em Endpoint Relacional Pesado (/api/dashboard/data)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('================================================================');
    console.log('📊 FASE 1: CARGA HTTPS EM ENDPOINT RELACIONAL (/api/dashboard/data)');
    console.log('================================================================\n');

    const phase1Results = [];
    for (const level of dashboardTiers) {
        process.stdout.write(`⏳ Disparando ${level} requisições HTTPS simultâneas contra o Render... `);
        const res = await runRenderConcurrencyTier(level, token, 'dashboard_data');
        phase1Results.push(res);
        console.log(`Concluído em ${(res.totalDuration / 1000).toFixed(1)}s | Latência: Média ${res.meanLatency}ms (p50: ${res.p50}ms, p95: ${res.p95}ms) | Erros: ${res.errorRate}% | Vazão: ${res.rps} req/s`);

        if (res.errorRate > 5.0 || res.p95 > 25000) {
            console.log(`⚠️ Ponto de parada atingido no nível ${level} (Erros: ${res.errorRate}%, p95: ${res.p95}ms)`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 2: Carga HTTPS em Endpoint de Health & DB Ping (/health)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('📊 FASE 2: CARGA HTTPS EM ENDPOINT DE INFRAESTRUTURA (/health)');
    console.log('================================================================\n');

    const phase2Results = [];
    for (const level of healthTiers) {
        process.stdout.write(`⏳ Disparando ${level} requisições HTTPS simultâneas contra o Render... `);
        const res = await runRenderConcurrencyTier(level, token, 'health');
        phase2Results.push(res);
        console.log(`Concluído em ${(res.totalDuration / 1000).toFixed(1)}s | Latência: Média ${res.meanLatency}ms (p50: ${res.p50}ms, p95: ${res.p95}ms) | Erros: ${res.errorRate}% | Vazão: ${res.rps} req/s`);

        if (res.errorRate > 5.0 || res.p95 > 20000) {
            console.log(`⚠️ Ponto de parada atingido no nível ${level} (Erros: ${res.errorRate}%, p95: ${res.p95}ms)`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // Relatórios Finais
    console.log('\n================================================================');
    console.log('📋 RESULTADOS CONSOLIDADOS DO BENCHMARK NO RENDER STARTER');
    console.log('================================================================\n');

    console.log('### TABELA FASE 1 — Endpoint de Dados Relacionais (/api/dashboard/data):');
    console.log('| Concorrência | Sucesso | Falhas | Erro (%) | Média (ms) | p50 (ms) | p95 (ms) | Vazão (req/s) |');
    console.log('|---|---|---|---|---|---|---|---|');
    phase1Results.forEach(r => {
        console.log(`| **${r.concurrency} conexões** | ${r.successful}/${r.concurrency} | ${r.failed} | ${r.errorRate}% | ${r.meanLatency}ms | ${r.p50}ms | ${r.p95}ms | **${r.rps} req/s** |`);
    });

    console.log('\n### TABELA FASE 2 — Endpoint de Health & DB Ping (/health):');
    console.log('| Concorrência | Sucesso | Falhas | Erro (%) | Média (ms) | p50 (ms) | p95 (ms) | Vazão (req/s) |');
    console.log('|---|---|---|---|---|---|---|---|');
    phase2Results.forEach(r => {
        console.log(`| **${r.concurrency} conexões** | ${r.successful}/${r.concurrency} | ${r.failed} | ${r.errorRate}% | ${r.meanLatency}ms | ${r.p50}ms | ${r.p95}ms | **${r.rps} req/s** |`);
    });
}

runBenchmark().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO NO BENCHMARK DO RENDER:', err);
    process.exit(1);
});
