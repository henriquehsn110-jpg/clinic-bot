/**
 * TEST: Geração de Link Direto para o Google Agenda
 * Valida que o link enviado ao paciente aponta DIRETO para https://calendar.google.com
 * sem passar por nenhum redirecionamento intermediário no Render.
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');

async function runTest() {
    console.log('🧪 [TEST_DIRECT_CALENDAR] Iniciando Teste de Link Direto do Google Agenda...');

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

    const directUrl = conversationController.buildDirectGoogleCalendarUrl
        ? conversationController.buildDirectGoogleCalendarUrl('Consulta geral', '2026-08-10', '14:30', 'Clínica Modelo', 'Av. Paulista, 1000')
        : 'https://calendar.google.com/calendar/render?action=TEMPLATE';

    assert('Link Direto — Inicia com https://calendar.google.com/calendar/render', directUrl.startsWith('https://calendar.google.com/calendar/render'), `URL: ${directUrl}`);
    assert('Link Direto — NUNCA utiliza o domínio do Render (onrender.com)', !directUrl.includes('onrender.com'), `URL: ${directUrl}`);
    assert('Link Direto — NUNCA utiliza a rota /c/', !directUrl.includes('/c/'), `URL: ${directUrl}`);
    assert('Parâmetros de Agenda — Contém action=TEMPLATE', directUrl.includes('action=TEMPLATE'));
    assert('Parâmetros de Agenda — Contém data/hora formatada (20260810T143000)', directUrl.includes('20260810T143000'));
    assert('Parâmetros de Agenda — Contém fuso horário America/Sao_Paulo', directUrl.includes('ctz=America%2FSao_Paulo') || directUrl.includes('ctz=America/Sao_Paulo'));

    console.log('================================================================');
    console.log(`📊 RESULTADO DO TESTE: ${passed} PASS, ${failed} FAIL`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTest();
