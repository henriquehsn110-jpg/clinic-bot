/**
 * TESTE DE CONCORRÊNCIA DIRETO CONTRA O POSTGREST DO SUPABASE
 * Mede se o Supabase Free enfileira chamadas simultâneas
 */
process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const axios = require('axios');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`
};

async function fireConcurrentPostgrest(count) {
    const targetUrl = `${url}/rest/v1/patients?select=id,name,phone,cpf,created_at&deleted_at=is.null&order=created_at.desc&offset=0&limit=50&clinic_id=eq.${clinicId}`;
    const t0 = Date.now();
    const promises = [];
    for (let i = 0; i < count; i++) {
        promises.push(axios.get(targetUrl, { headers, timeout: 30000 }).then(r => Date.now() - t0).catch(e => -1));
    }
    const results = await Promise.all(promises);
    const totalElapsed = Date.now() - t0;
    const successes = results.filter(r => r > 0);
    const avgLatency = successes.length ? (successes.reduce((a, b) => a + b, 0) / successes.length).toFixed(0) : 0;
    const sorted = [...successes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const throughput = (successes.length / (totalElapsed / 1000)).toFixed(2);

    return { count, totalElapsed, avgLatency, p50, p95, successes: successes.length, throughput };
}

async function runBenchmark() {
    console.log('================================================================');
    console.log('🔬 [PROMPT 7 - R3] TESTE DE CARGA DIRETO NO POSTGREST DO SUPABASE');
    console.log('================================================================');
    console.log(`Supabase URL: ${url}`);

    const levels = [1, 5, 10, 20, 40, 60, 80];
    const table = [];

    for (const lvl of levels) {
        process.stdout.write(`⏳ Testando ${lvl} chamadas HTTP simultâneas ao Supabase... `);
        const res = await fireConcurrentPostgrest(lvl);
        console.log(`Concluído em ${(res.totalElapsed/1000).toFixed(1)}s | Média: ${res.avgLatency}ms | p95: ${res.p95}ms | Vazão: ${res.throughput} req/s`);
        table.push(res);
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n================================================================');
    console.log('📊 TABELA DE DEGRADAÇÃO DO POSTGREST/SUPABASE SOB CONCORRÊNCIA');
    console.log('================================================================');
    console.table(table.map(t => ({
        'Concorrência Direta': `${t.count} HTTP reqs`,
        'Média (ms)': `${t.avgLatency}ms`,
        'p50 (ms)': `${t.p50}ms`,
        'p95 (ms)': `${t.p95}ms`,
        'Vazão Real': `${t.throughput} req/s`,
        'Sucessos': `${t.successes}/${t.count}`
    })));
}

runBenchmark().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
