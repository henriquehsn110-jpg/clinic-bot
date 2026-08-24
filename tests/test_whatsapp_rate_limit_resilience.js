/**
 * TESTE DE AUDITORIA DE RATE LIMIT & RESILIÊNCIA DA API DO WHATSAPP CLOUD (PROMPT 3)
 * Ambiente: STAGING / SIMULADOR (Não dispara contra a Meta real)
 * Valida o comportamento do withRetry, backoff exponencial e pacing de disparos em massa.
 */
require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');
const axios = require('axios');
const whatsappService = require('../services/whatsappService');
const reminderService = require('../services/reminderService');
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

async function runWhatsAppRateLimitAudit() {
    console.log('================================================================');
    console.log('🧪 [PROMPT 3] AUDITORIA DE RESILIÊNCIA A RATE LIMIT (WHATSAPP CLOUD API)');
    console.log('================================================================\n');

    const originalPost = axios.post;

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 1: Erro 429 Transitório da Meta (Rate Limit Hit) com Auto-Recuperação
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔥 [TESTE 1] Simulando Erro 429 Transitório (#130429 Rate limit hit) na 1ª tentativa...');

    let attemptCount = 0;
    const testPhone = '5511999887766';

    // Mock explícito de axios.post:
    // - Tentativa 1: Rejeita com HTTP 429 e corpo oficial da Meta (#130429 Rate limit hit)
    // - Tentativa 2: Sucesso (HTTP 200)
    axios.post = async (url, data, config) => {
        attemptCount++;
        if (attemptCount === 1) {
            console.log(`   ⏳ [MOCK AXIOS] Tentativa ${attemptCount}: Meta respondeu HTTP 429 Too Many Requests`);
            const metaError = new Error('Request failed with status code 429');
            metaError.response = {
                status: 429,
                data: {
                    error: {
                        message: '(#130429) Rate limit hit',
                        type: 'OAuthException',
                        code: 130429,
                        error_subcode: 130429,
                        fbtrace_id: 'EzFakeMetaTraceId123'
                    }
                }
            };
            throw metaError;
        }

        console.log(`   ⚡ [MOCK AXIOS] Tentativa ${attemptCount}: Meta respondeu HTTP 200 OK (Mensagem Aceita)`);
        return {
            status: 200,
            data: {
                messaging_product: 'whatsapp',
                contacts: [{ input: testPhone, wa_id: testPhone }],
                messages: [{ id: 'wamid.HBgLMDU1MTE5OTk4ODc3NjYVAgARGBI1RkFLRU1FVEE=' }]
            }
        };
    };

    const startTime1 = Date.now();
    const result1 = await whatsappService.sendTextMessage(
        testPhone,
        'Teste de recuperação sob Rate Limit 429',
        '100000000000000',
        'EAABfakeToken'
    );
    const elapsed1 = Date.now() - startTime1;

    console.log(`\n⏱️ TEMPO TOTAL ATÉ A RECUPERAÇÃO DO 429: ${elapsed1}ms`);
    console.log(`📊 STATUS DO RESULTADO: HTTP 200 recebido após ${attemptCount} tentativas.`);

    assert.strictEqual(attemptCount, 2, 'Deve ter tentado exatamente 2 vezes (1 falha 429 + 1 sucesso)');
    assert(elapsed1 >= 280, `Deve ter respeitado o delay de backoff do withRetry (obtido: ${elapsed1}ms)`);
    console.log('   ✅ PASS: Erro 429 transitório recuperado com sucesso via backoff exponencial!');

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 2: Erro 429 Persistente (Esgotamento de Retries e Fallback Seguro)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n🔥 [TESTE 2] Simulando Erro 429 Persistente em Todas as Tentativas...');

    let persistentAttempts = 0;
    axios.post = async () => {
        persistentAttempts++;
        console.log(`   ⏳ [MOCK AXIOS] Tentativa ${persistentAttempts}: Meta respondeu HTTP 429 (#130429)`);
        const metaError = new Error('Request failed with status code 429');
        metaError.response = {
            status: 429,
            data: {
                error: {
                    message: '(#130429) Rate limit hit',
                    type: 'OAuthException',
                    code: 130429,
                    error_subcode: 130429
                }
            }
        };
        throw metaError;
    };

    let caughtError = null;
    try {
        await whatsappService.sendTextMessage(
            testPhone,
            'Mensagem que esgota retries',
            '100000000000000',
            'EAABfakeToken'
        );
    } catch (err) {
        caughtError = err;
    }

    console.log(`\n📊 RESULTADO DO 429 PERSISTENTE:`);
    console.log(`   - Tentativas executadas: ${persistentAttempts}`);
    console.log(`   - Erro capturado: ${caughtError ? caughtError.message : 'Nenhum'}`);

    assert.strictEqual(persistentAttempts, 3, 'Deve ter esgotado as 3 tentativas do withRetry');
    assert(caughtError && caughtError.response.status === 429, 'Deve lançar erro 429 após esgotar retries');
    console.log('   ✅ PASS: 429 persistente tratado com limite estrito de 3 retries e log de auditoria!');

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 3: Disparo em Lote de Lembretes & Pacing Buffer (Anti-Burst 80 MPS)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n🛡️ [TESTE 3] Testando Pacing e Limitação de Taxa no Disparo de Lembretes em Lote...');

    // Restaura o mock de sucesso para medição do pacing
    let bulkSendCount = 0;
    axios.post = async () => {
        bulkSendCount++;
        return {
            status: 200,
            data: {
                messaging_product: 'whatsapp',
                messages: [{ id: `wamid.msg_${bulkSendCount}` }]
            }
        };
    };

    const originalGetClinics = db.clinics.getAll.bind(db.clinics);
    const originalGetTodayAppts = calendarService.getTodayAppointments;

    const fakeClinicId = crypto.randomUUID();
    db.clinics.getAll = async () => [
        { id: fakeClinicId, slug: 'clinica-modelo', whatsapp_token: 'fake', phone_number_id: 'fake' }
    ];

    calendarService.getTodayAppointments = async () => {
        const fakeAppts = [];
        for (let i = 1; i <= 20; i++) {
            fakeAppts.push({
                id: crypto.randomUUID(),
                phone: `551199000${String(i).padStart(4, '0')}`,
                appointment_time: `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:00:00`,
                type: 'Consulta Avaliação',
                patients: { name: `Paciente Teste ${i}`, phone: `551199000${String(i).padStart(4, '0')}` }
            });
        }
        return fakeAppts;
    };

    console.log('   Disparando ciclo de 20 lembretes automáticos com medição de MPS...');
    const startBulkTime = Date.now();
    const stats = await reminderService.processDailyReminders(false);
    const bulkElapsedMs = Date.now() - startBulkTime;

    const messagesPerSec = (stats.sent / (bulkElapsedMs / 1000)).toFixed(2);
    console.log(`\n⏱️ TEMPO TOTAL PARA 20 LEMBRETES: ${bulkElapsedMs}ms`);
    console.log(`📊 TAXA DE ENVIO MEDIDA: ${messagesPerSec} mensagens/segundo`);
    console.log(`📈 ESTATÍSTICAS: Total: ${stats.totalToday}, Enviados: ${stats.sent}, Falhas: ${stats.failed}`);

    // Validações
    assert(bulkElapsedMs >= 950, `O buffer de pacing de 50ms por item deve garantir que 20 itens levem pelo menos ~1.000ms (obtido: ${bulkElapsedMs}ms)`);
    assert(parseFloat(messagesPerSec) < 80, `A taxa de disparo (${messagesPerSec} MPS) deve ser estritamente INFERIOR ao limite de 80 MPS da Meta`);
    assert.strictEqual(stats.sent, 20, 'Todos os 20 lembretes devem ter sido disparados com sucesso');

    console.log('   ✅ PASS: Pacing de lembretes validado! Taxa controlada dentro dos limites da Meta!');

    // Restaura métodos originais
    axios.post = originalPost;
    db.clinics.getAll = originalGetClinics;
    calendarService.getTodayAppointments = originalGetTodayAppts;

    console.log('\n================================================================');
    console.log('🎉 [PASS] AUDITORIA DE RATE LIMIT DO WHATSAPP 100% APROVADA!');
    console.log('================================================================');
}

runWhatsAppRateLimitAudit().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE DE RATE LIMIT:', err);
    process.exit(1);
});
