/**
 * TESTE DE REGRESSÃO BUG 1: Pergunta de Preço não dispara calendário visual (showCalendar = false)
 */
require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function run() {
    console.log('🧪 [TEST_BUG1_PRICE_QUESTION] Executando Teste de Regressão Bug 1...');

    const phone = '5511999990001';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    const response = await conversationController.handleIncomingMessage({
        phone: phone,
        messageText: 'Quanto custa exatamente um implante dental completo, sem contar a consulta de avaliação?',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    assert.strictEqual(response.showCalendar, false, 'FALHA: Pergunta de preço não deveria abrir o calendário (showCalendar deve ser false)');
    assert.strictEqual(response.showProceduresList, false, 'FALHA: Pergunta de preço não deveria abrir a lista de procedimentos');

    console.log('  ✅ PASS: Pergunta de preço responde em texto e NUNCA ativa componente visual de agendamento (showCalendar = false).');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ FAIL:', err.message, err.stack);
    process.exit(1);
});
