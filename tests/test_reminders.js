/**
 * Testes Unitários e de Integração — ReminderService (Lembretes WhatsApp)
 */

require('dotenv').config();
const reminderService = require('../services/reminderService');
const calendarService = require('../services/calendarService');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        passed++;
        console.log(`  ✅ PASS: ${msg}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${msg}`);
    }
}

async function testReminderService() {
    console.log(`\n--- Testando ReminderService ---`);

    // Teste 1: Fuso Horário BRT
    const dateStr = reminderService.getTodayBrtDateStr();
    assert(/^\d{4}-\d{2}-\d{2}$/.test(dateStr), `getTodayBrtDateStr retorna formato YYYY-MM-DD (${dateStr})`);

    // Teste 2: Processamento em Modo Simulação (sem chamadas Meta)
    try {
        const stats = await reminderService.processDailyReminders(true);
        assert(stats !== null && typeof stats.totalToday === 'number', `processDailyReminders roda em simulação retornando estatísticas`);
        assert(typeof stats.sent === 'number' && typeof stats.skipped === 'number', `Estatísticas contêm sent (${stats.sent}) e skipped (${stats.skipped})`);
    } catch (err) {
        assert(false, `Erro ao processar lembretes: ${err.message}`);
    }

    // Teste 3: Prevenção de Envio Duplicado (Idempotência de Lembretes)
    try {
        const statsRun2 = await reminderService.processDailyReminders(true);
        if (statsRun2.totalToday > 0) {
            assert(statsRun2.skipped === statsRun2.totalToday, `Segunda execução no mesmo dia pula ${statsRun2.skipped} lembretes já enviados`);
        } else {
            assert(true, `Zero agendamentos hoje para testar idempotência na 2ª chamada`);
        }
    } catch (err) {
        assert(false, `Erro no teste de idempotência: ${err.message}`);
    }

    console.log(`\nResultado Lembretes: ${passed} Passando, ${failed} Falhando.`);
    if (failed > 0) process.exit(1);
}

testReminderService();
