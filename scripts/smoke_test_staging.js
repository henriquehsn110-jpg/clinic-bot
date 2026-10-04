// scripts/smoke_test_staging.js — Validação E2E de Smoke Test no Render Staging
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env.staging') });
const axios = require('axios');
const crypto = require('crypto');
const db = require('../services/databaseService');

// ── 1. Validação Estrita de Variáveis de Ambiente (Sem Fallbacks Hardcoded) ──
if (!process.env.APP_SECRET) {
    console.error('❌ ERRO CRÍTICO: APP_SECRET não está definido. Forneça via .env.staging ou variável de ambiente.');
    process.exit(1);
}
const APP_SECRET = process.env.APP_SECRET;

if (!process.env.VERIFY_TOKEN) {
    console.error('❌ ERRO CRÍTICO: VERIFY_TOKEN não está definido. Forneça via .env.staging ou variável de ambiente.');
    process.exit(1);
}
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

if (!process.env.STAGING_ADMIN_EMAIL) {
    console.error('❌ ERRO CRÍTICO: STAGING_ADMIN_EMAIL não está definido. Forneça via .env.staging ou variável de ambiente.');
    process.exit(1);
}
const STAGING_ADMIN_EMAIL = process.env.STAGING_ADMIN_EMAIL;

if (!process.env.STAGING_ADMIN_PASSWORD) {
    console.error('❌ ERRO CRÍTICO: STAGING_ADMIN_PASSWORD não está definido. Forneça via .env.staging ou variável de ambiente.');
    process.exit(1);
}
const STAGING_ADMIN_PASSWORD = process.env.STAGING_ADMIN_PASSWORD;

const STAGING_URL = process.env.STAGING_SERVICE_URL || 'https://clinic-bot-staging.onrender.com';

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

    // ── Teste 4: Webhook Mensagem V19 (RPCs & Polling Físico no Banco) ─
    console.log('\n[Etapa 4/5] Injetando Mensagem Legítima com Assinatura HMAC Válida...');
    try {
        // Validação física de clinic e phone_number_id antes do envio
        console.log('  🔍 Consultando clínicas cadastradas no Supabase Staging...');
        const clinics = await db.clinics.getAll();
        const targetClinic = clinics.find(c => c.phone_number_id && c.phone_number_id.trim() !== '');

        if (!targetClinic) {
            throw new Error('Nenhuma clínica no Supabase Staging possui phone_number_id válido configurado.');
        }

        const validPhoneNumberId = targetClinic.phone_number_id;
        console.log(`  ✅ phone_number_id validado: "${validPhoneNumberId}" (Clínica: ${targetClinic.name} - ${targetClinic.slug})`);

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
                            phone_number_id: validPhoneNumberId
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

        if (res.status !== 200) {
            throw new Error(`Status HTTP inesperado na recepção do webhook: ${res.status}`);
        }
        console.log(`  ✅ Webhook HTTP 200 recebido para [${testMsgId}].`);

        // Polling físico no banco de dados Staging para verificar execução assíncrona completa
        console.log(`  ⏳ Polling no Supabase Staging para validar conclusão assíncrona da V19 (máx 30s)...`);
        const maxWaitMs = 30000;
        const startTime = Date.now();
        let logRecord = null;
        let lastLoggedStatus = null;

        while (Date.now() - startTime < maxWaitMs) {
            await new Promise(r => setTimeout(r, 1500));
            const { data, error } = await db.supabase
                .from('webhook_logs')
                .select('message_id, status, error_log, completed_at, updated_at')
                .eq('message_id', testMsgId)
                .maybeSingle();

            if (error) {
                console.warn(`  ⚠️ Consulta webhook_logs: ${error.message}`);
                continue;
            }

            if (data) {
                logRecord = data;
                if (data.status !== lastLoggedStatus) {
                    console.log(`     Status atual no webhook_logs: "${data.status}"`);
                    lastLoggedStatus = data.status;
                }

                if (data.status === 'completed') {
                    break;
                }
                if (['failed', 'dead_letter'].includes(data.status)) {
                    throw new Error(`Processamento do webhook falhou com status '${data.status}'. Erro: ${data.error_log}`);
                }
            }
        }

        if (!logRecord || logRecord.status !== 'completed') {
            throw new Error(`Timeout: Mensagem [${testMsgId}] não concluiu o ciclo V19 em 30s. Status final: ${logRecord?.status || 'não encontrado'}. Erro: ${logRecord?.error_log || 'nenhum'}`);
        }

        // Validação estrita em message_effects (V19)
        console.log(`  🔍 Validando efeitos colaterais registrados na tabela message_effects...`);
        const { data: effects, error: effErr } = await db.supabase
            .from('message_effects')
            .select('id, effect_type, effect_key, status, executed_at, error_log')
            .eq('message_id', testMsgId);

        if (effErr) {
            throw new Error(`Erro ao consultar message_effects para [${testMsgId}]: ${effErr.message}`);
        }

        // 1. Deve haver efeitos registrados
        if (!effects || effects.length === 0) {
            throw new Error(`Falha de integridade V19: nenhum efeito colateral registrado em message_effects para [${testMsgId}].`);
        }

        // 4. Falhar se houver qualquer status failed ou dead_letter
        const failedEffects = effects.filter(e => ['failed', 'dead_letter'].includes(e.status));
        if (failedEffects.length > 0) {
            const errDetails = failedEffects.map(e => `[tipo=${e.effect_type}, key=${e.effect_key}, status=${e.status}, erro=${e.error_log}]`).join(', ');
            throw new Error(`Efeito colateral com falha detectado em message_effects: ${errDetails}`);
        }

        // 2 & 3. Exigir pelo menos o efeito esperado (effect_type = 'whatsapp_message') com status 'executed'
        const executedWhatsAppEffects = effects.filter(e => e.effect_type === 'whatsapp_message' && e.status === 'executed');
        if (executedWhatsAppEffects.length === 0) {
            const currentEffects = effects.map(e => `[tipo=${e.effect_type}, status=${e.status}]`).join(', ');
            throw new Error(`Efeito obrigatório de WhatsApp não foi executado com sucesso. Efeitos encontrados: ${currentEffects}`);
        }

        // Exibir evidência detalhada de cada efeito executado
        for (const eff of effects) {
            console.log(`     Efeito registrado: tipo="${eff.effect_type}", chave="${eff.effect_key}", status="${eff.status}", executado_em="${eff.executed_at}".`);
        }

        console.log(`  ✅ PASS: Mensagem [${testMsgId}] e todos os efeitos colaterais (message_effects status='executed') confirmados com sucesso!`);
        passed++;
    } catch (err) {
        console.error('  ❌ FAIL: Erro na validação de mensagem V19:', err.message);
        failed++;
    }

    // ── Teste 5: Dashboard Auth & Data (RPC get_dashboard_data) ───────
    console.log('\n[Etapa 5/5] Testando Login no Dashboard e RPC get_dashboard_data...');
    try {
        const loginRes = await axios.post(`${STAGING_URL}/api/dashboard/auth/login`, {
            email: STAGING_ADMIN_EMAIL,
            password: STAGING_ADMIN_PASSWORD
        }, { timeout: 10000 });

        if (loginRes.status === 200 && loginRes.data?.token) {
            console.log(`  ✅ PASS: Autenticação no Dashboard efetuada com sucesso para ${STAGING_ADMIN_EMAIL} (JWT gerado).`);
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
