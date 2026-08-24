/**
 * TESTE DE CARGA DE WEBHOOKS ASSINADOS (HMAC SHA-256) CONTRA O RENDER REAL
 * Alvo: https://clinic-bot-zksc.onrender.com/webhook
 */
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const RENDER_BASE_URL = 'https://clinic-bot-zksc.onrender.com';
const APP_SECRET = process.env.APP_SECRET || 'a8f4c2e1b7d39e50f612a4b8c0d9e7f123456789abcdef0123456789abcdef01';

function createSignedWebhookPayload(phone, text) {
    const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
            id: '123456',
            changes: [{
                value: {
                    messaging_product: 'whatsapp',
                    metadata: { phone_number_id: '9990001' },
                    messages: [{
                        from: phone,
                        id: `wamid.${Date.now()}.${Math.random()}`,
                        timestamp: String(Math.floor(Date.now() / 1000)),
                        text: { body: text },
                        type: 'text'
                    }]
                },
                field: 'messages'
            }]
        }]
    });

    const hmac = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');
    return { payload, hmac };
}

async function sendWebhook(phone, text) {
    const { payload, hmac } = createSignedWebhookPayload(phone, text);
    const start = Date.now();
    try {
        const res = await axios.post(`${RENDER_BASE_URL}/webhook`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-hub-signature-256': hmac
            },
            timeout: 15000
        });
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

async function runWebhookTier(concurrencyLevel, tierIndex) {
    const promises = [];
    const tierStart = Date.now();

    for (let i = 0; i < concurrencyLevel; i++) {
        const phone = `5511988${String(tierIndex).padStart(2, '0')}${String(i).padStart(4, '0')}`;
        promises.push(sendWebhook(phone, 'Olá, gostaria de agendar uma consulta'));
    }

    const results = await Promise.all(promises);
    const tierDuration = Date.now() - tierStart;

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const latencies = results.map(r => r.latency).sort((a, b) => a - b);
    const meanLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
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
        rps
    };
}

async function runAll() {
    console.log('================================================================');
    console.log('📨 [PROMPT 4] CARGA HTTPS EM WEBHOOKS ASSINADOS NO RENDER');
    console.log('================================================================\n');

    const tiers = [5, 10, 20, 40, 80];
    const results = [];

    for (let idx = 0; idx < tiers.length; idx++) {
        const level = tiers[idx];
        process.stdout.write(`⏳ Disparando ${level} webhooks HTTPS simultâneos contra o Render... `);
        const res = await runWebhookTier(level, idx + 1);
        results.push(res);
        console.log(`Concluído em ${(res.totalDuration / 1000).toFixed(1)}s | Latência: Média ${res.meanLatency}ms (p50: ${res.p50}ms, p95: ${res.p95}ms) | Erros: ${res.errorRate}% | Vazão: ${res.rps} req/s`);

        if (res.errorRate > 5.0 || res.p95 > 10000) {
            console.log(`⚠️ Ponto de parada atingido no nível ${level} (Erros: ${res.errorRate}%, p95: ${res.p95}ms)`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n### TABELA FASE 3 — Ingestão de Webhooks da Meta (/webhook no Render):');
    console.log('| Concorrência | Sucesso | Falhas | Erro (%) | Média (ms) | p50 (ms) | p95 (ms) | Vazão (req/s) |');
    console.log('|---|---|---|---|---|---|---|---|');
    results.forEach(r => {
        console.log(`| **${r.concurrency} webhooks** | ${r.successful}/${r.concurrency} | ${r.failed} | ${r.errorRate}% | ${r.meanLatency}ms | ${r.p50}ms | ${r.p95}ms | **${r.rps} req/s** |`);
    });
}

runAll().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO:', err);
    process.exit(1);
});
