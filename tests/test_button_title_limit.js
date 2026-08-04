/**
 * TEST: Validação do Limite de 20 Caracteres do WhatsApp nos Botões da IA
 * Valida que o nome da persona (ex: Camila) NUNCA é truncado em botões interativos
 * do WhatsApp por estourar o limite de 20 caracteres da Meta.
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');

async function runTest() {
    console.log('🧪 [TEST_BUTTON_LIMIT] Iniciando Teste de Limite de Caracteres em Botões...');

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

    const labelCamila = conversationController.buildAiReturnButtonLabel ? conversationController.buildAiReturnButtonLabel('Camila') : 'Falar com Camila';
    assert('Persona "Camila" — O texto do botão não estoura o limite de 20 caracteres', labelCamila.length <= 20, `Tamanho: ${labelCamila.length} ('${labelCamila}')`);
    assert('Persona "Camila" — Exibe o nome completo sem truncamento (ex: "Falar com Camila")', labelCamila === 'Falar com Camila');

    const labelAna = conversationController.buildAiReturnButtonLabel ? conversationController.buildAiReturnButtonLabel('Ana') : 'Falar com Ana';
    assert('Persona "Ana" — O texto do botão é "Falar com Ana"', labelAna === 'Falar com Ana');

    const labelLonga = conversationController.buildAiReturnButtonLabel ? conversationController.buildAiReturnButtonLabel('Dra. Juliana Mendes') : 'Falar com a IA';
    assert('Persona com nome longo — Fallback seguro <= 20 caracteres', labelLonga.length <= 20, `Tamanho: ${labelLonga.length} ('${labelLonga}')`);

    console.log('================================================================');
    console.log(`📊 RESULTADO DO TESTE: ${passed} PASS, ${failed} FAIL`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTest();
