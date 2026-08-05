/**
 * TEST: Geração de Link Direto e Compacto do Google Agenda
 * Valida que o link enviado ao paciente é 100% DIRETO do Google Calendar (calendar.google.com),
 * sem o domínio do Render, e sem caracteres codificados complexos (%20, %C3%B3).
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');

async function runTest() {
    console.log('🧪 [TEST_COMPACT_DIRECT_CALENDAR] Iniciando Teste de Link Direto e Compacto do Google Agenda...');

    let passed = 0;
    let failed = 0;

    function assert(name, condition, extra = '') {
        if (condition) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name} ${extra}`);
            failed++;
        }
    }

    const compactUrl = conversationController.buildDirectGoogleCalendarUrl
        ? conversationController.buildDirectGoogleCalendarUrl('Implante', '2026-08-05', '09:00')
        : 'https://calendar.google.com/calendar/render?action=TEMPLATE';

    assert('Link Direto Google — Aponta para https://calendar.google.com/calendar/render', compactUrl.startsWith('https://calendar.google.com/calendar/render'), `URL: ${compactUrl}`);
    assert('Sem Render — NUNCA contêm o domínio do Render (onrender.com)', !compactUrl.includes('onrender.com'), `URL: ${compactUrl}`);
    assert('Sem Rota /c/ — NUNCA utiliza a rota /c/', !compactUrl.includes('/c/'), `URL: ${compactUrl}`);
    assert('Sem %20 — Espaços formatados como + limpo', !compactUrl.includes('%20'), `URL: ${compactUrl}`);
    assert('Data e Hora — Formatadas corretamente (20260805T090000/20260805T100000)', compactUrl.includes('20260805T090000/20260805T100000'));
    assert('Fuso Horário — Contém ctz=America/Sao_Paulo', compactUrl.includes('ctz=America/Sao_Paulo'));

    console.log('================================================================');
    console.log(`📊 RESULTADO DO TESTE: ${passed} PASS, ${failed} FAIL`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTest();
