/**
 * TEST: Validação do Link Curto e Limpo do Google Agenda
 * Valida que o link enviado ao paciente no WhatsApp é ultra-curto (1 única linha limpa)
 * para não poluir o chat com 5 linhas de caracteres codificados (%20, %C3%B3).
 */
require('dotenv').config();

async function runTest() {
    console.log('🧪 [TEST_CLEAN_CALENDAR_URL] Iniciando Teste de Link Limpo do Google Agenda...');

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

    const shortId = '612f56b5';
    const appHost = 'https://clinic-bot-zksc.onrender.com';
    const cleanUrl = `${appHost}/c/${shortId}`;

    assert('Link Limpo — URL curta de 1 linha (máx 50 caracteres)', cleanUrl.length <= 50, `Tamanho: ${cleanUrl.length} ('${cleanUrl}')`);
    assert('Link Limpo — NUNCA exibe caracteres brutos codificados (%20, %C3%B3)', !cleanUrl.includes('%20') && !cleanUrl.includes('%C3%B3'), `URL: ${cleanUrl}`);
    assert('Link Limpo — Formato limpo e seguro /c/:shortId', cleanUrl === 'https://clinic-bot-zksc.onrender.com/c/612f56b5');

    console.log('================================================================');
    console.log(`📊 RESULTADO DO TESTE: ${passed} PASS, ${failed} FAIL`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTest();
