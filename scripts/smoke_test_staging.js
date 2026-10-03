// scripts/smoke_test_staging.js — Validação E2E de Smoke Test no Render Staging
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env.staging') });
const axios = require('axios');
const crypto = require('crypto');

const STAGING_URL = process.env.STAGING_SERVICE_URL || 'https://clinic-bot-staging.onrender.com';
const APP_SECRET = process.env.APP_SECRET || 'test_secret_key_hmac_2026';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'clinica_bot_seguro_2026';

function signPayload(payload, secret) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hash = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return `sha256=${hash}`;
}

async function runStagingSmokeTest() {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🚀 SMOKE TEST E2E — CLOUD STAGING (RENDER & SUPABASE STAGING)');
    console.log(`🌐 Alvo: ${STAGING_URL}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    // ── Teste 1: Health Check ─────────────────────────────────────────
    console.log('[Etapa 1/5] Validando Health Check (/health)...');
    try {
        const res = await axios.get(`${STAGING_URL}/health`, { timeout: 15000 });
        if (res.status === 200 && res.data?.status === 'ok') {
            console.log(`  ✅ PASS: Servidor online e respondendo status 'ok' (HTTP ${res.status}).`);
            console.log(`     Uptime: ${res.data.uptime ? Math.round(res.data.uptime) + 's' : 'N/A'}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: Resposta inesperada:`, res.status, res.data);
            failed++;
        }
    } catch (err) {
        console.error(`  ❌ FAIL: Falha ao conectar no health check:`, err.response?.status || err.message);
        failed++;
    }

    // ── Teste 2: Webhook Handshake Verification (Meta Hub Challenge) ─
    console.log('\n[Etapa 2/5] Validando Verificação de Webhook (/webhook GET)...');
    try {
        const challenge = 'challenge_' + Date.now();
        const res = await axios.get(`${STAGING_URL}/webhook`, {
            params: {
                'hub.mode': 'subscribe',
                'hub.verify_token': VERIFY_TOKEN,
                'hub.challenge': challenge
            },
            timeout: 10000
        });
        if (res.status === 200 && String(res.data) === challenge) {
            console.log(`  ✅ PASS: Handshake do webhook Meta validado com sucesso (Challenge refletido).`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: Resposta do handshake incorreta:`, res.status, res.data);
            failed++;
        }
    } catch (err) {
        console.error(`  ❌ FAIL: Erro no handshake:`, err.response?.status || err.message);
        failed++;
    }

    // ── Teste 3: HMAC Security Rejection ──────────────────────────────
    console.log('\n[Etapa 3/5] Validando Rejeição de Assinatura HMAC Forjada (/webhook POST)...');
    try {
        const fakePayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
        await axios.post(`${STAGING_URL}/webhook`, fakePayload, {
            headers: {
                'Content-Type': 'application/json',
                'x-hub-signature-256': 'sha256=invalid_hash_000000000000000000000000000000000000000000000000'
            },
            timeout: 10000
        });
        console.error('  ❌ FAIL: Requisição forjada foi aceita indevidamente!');
        failed++;
    } catch (err) {
        if (err.response?.status === 403) {
            console.log('  ✅ PASS: Assinatura forjada bloqueada com HTTP 403 Forbidden.');
            passed++;
        } else {
            console.error('  ❌ FAIL: Código HTTP inesperado:', err.response?.status || err.message);
            failed++;
        }
    }

    // ── Teste 4: Webhook Mensagem V19 (RPCs & Session Locks) ───────────
    console.log('\n[Etapa 4/5] Injetando Mensagem Legítima com Assinatura HMAC Válida...');
    try {
        const testMsgId = 'wamid_smoke_' + Date.now();
        const payloadObj = {
            object: 'whatsapp_business_account',
            entry: [{
                id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
                changes: [{
                    value: {
                        messaging_product: 'whatsapp',
                        metadata: {
                            display_phone_number: '5511999999999',
                            phone_number_id: '999888777'
                        },
                        messages: [{
                            from: '5511988887777',
                            id: testMsgId,
                            timestamp: String(Math.floor(Date.now() / 1000)),
                            text: { body: 'olá' },
                            type: 'text'
                        }]
                    },
                    field: 'messages'
                }]
            }]
        };

        const rawBody = JSON.stringify(payloadObj);
        const signature = signPayload(rawBody, APP_SECRET);

        const res = await axios.post(`${STAGING_URL}/webhook`, rawBody, {
            headers: {
                'Content-Type': 'application/json',
                'x-hub-signature-256': signature
            },
            timeout: 15000
        });

        if (res.status === 200) {
            console.log(`  ✅ PASS: Webhook legítimo processado com HTTP 200.`);
            console.log(`     Mensagem ID: ${testMsgId} enfileirada e processada via V19 claim/lock.`);
            passed++;
        } else {
            console.error('  ❌ FAIL: Status inesperado ao enviar mensagem:', res.status, res.data);
            failed++;
        }
    } catch (err) {
        console.error('  ❌ FAIL: Erro ao injetar mensagem legítima:', err.response?.status, err.response?.data || err.message);
        failed++;
    }

    // ── Teste 5: Dashboard Auth & Data (RPC get_dashboard_data) ───────
    console.log('\n[Etapa 5/5] Testando Login no Dashboard e RPC get_dashboard_data...');
    try {
        const loginRes = await axios.post(`${STAGING_URL}/api/dashboard/auth/login`, {
            email: 'admin@clinicamodelo.com.br',
            password: '123456'
        }, { timeout: 10000 });

        if (loginRes.status === 200 && loginRes.data?.token) {
            console.log('  ✅ PASS: Autenticação no Dashboard efetuada com sucesso (JWT gerado).');
            const token = loginRes.data.token;

            const dataRes = await axios.get(`${STAGING_URL}/api/dashboard/data`, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 15000
            });

            if (dataRes.status === 200 && dataRes.data?.clinic) {
                console.log(`  ✅ PASS: get_dashboard_data retornou dados com sucesso!`);
                console.log(`     Clínica: ${dataRes.data.clinic.name} (${dataRes.data.clinic.slug})`);
                console.log(`     Agendamentos carregados: ${dataRes.data.appointments?.length || 0}`);
                passed++;
            } else {
                console.error('  ❌ FAIL: Falha ao carregar dados do dashboard:', dataRes.status, dataRes.data);
                failed++;
            }
        } else {
            console.error('  ❌ FAIL: Falha no login do Dashboard:', loginRes.status, loginRes.data);
            failed++;
        }
    } catch (err) {
        console.error('  ❌ FAIL: Erro na autenticação ou carregamento de dados:', err.response?.status, err.response?.data || err.message);
        failed++;
    }

    // ── Resumo Final ──────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`📊 RESUMO FINAL DO SMOKE TEST EM CLOUD STAGING:`);
    console.log(`   ✅ Passaram: ${passed}/5`);
    console.log(`   ❌ Falharam: ${failed}/5`);
    console.log('════════════════════════════════════════════════════════════════');

    if (failed > 0) {
        process.exit(1);
    }
}

runStagingSmokeTest().catch(err => {
    console.error('❌ Exceção fatal no Smoke Test:', err);
    process.exit(1);
});
