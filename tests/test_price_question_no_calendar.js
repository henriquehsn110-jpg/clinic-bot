/**
 * TESTE DE REGRESSÃO BUG 1: Pergunta de Preço vs Seleção Explícita de Procedimento
 * Valida que:
 * 1. Pergunta de Preço ("Quanto custa um implante?") NUNCA popula draft.type e NUNCA exibe calendário (showCalendar = false).
 * 2. Seleção Explícita ("Quero agendar um implante dental") POPULA draft.type = "Implante" e ativa calendário (showCalendar = true).
 */
require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function run() {
    console.log('🧪 [TEST_BUG1_PRICE_QUESTION] Executando Teste de Regressão Bug 1...');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // ── TESTE 1A: Pergunta Informativa de Preço ─────────────────────────────
    const phoneA = '5511999990001';
    await db.sessions.set(phoneA, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phoneA, null, clinicId).catch(() => {});

    const respA = await conversationController.handleIncomingMessage({
        phone: phoneA,
        messageText: 'Quanto custa exatamente um implante dental completo, sem contar a consulta de avaliação?',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    assert.strictEqual(respA.showCalendar, false, 'FALHA [Caso A]: Pergunta de preço não deveria abrir o calendário');
    assert.strictEqual(respA.showProceduresList, false, 'FALHA [Caso A]: Pergunta de preço não deveria abrir a lista de procedimentos');

    const draftA = await db.sessions.getDraft(phoneA, clinicId);
    assert.strictEqual(draftA && draftA.type ? draftA.type : null, null, 'FALHA [Caso A]: Pergunta de preço não deve popular draft.type');

    console.log('  ✅ PASS [Caso A]: Pergunta de preço responde em texto, NUNCA ativa componente visual e NUNCA escreve draft.type.');

    // ── TESTE 1B: Seleção Normal de Agendamento (Sem palavra de preço) ─────────
    const phoneB = '5511999990003';
    await db.sessions.set(phoneB, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phoneB, null, clinicId).catch(() => {});

    const respB = await conversationController.handleIncomingMessage({
        phone: phoneB,
        messageText: 'Quero agendar um implante dental',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draftB = await db.sessions.getDraft(phoneB, clinicId);
    assert.strictEqual(draftB?.type, 'Implante', 'FALHA [Caso B]: Seleção direta de agendamento DEVE popular draft.type com "Implante"');
    assert.strictEqual(respB.showCalendar, true, 'FALHA [Caso B]: Seleção direta de agendamento DEVE abrir o calendário visual (showCalendar = true)');

    console.log('  ✅ PASS [Caso B]: Seleção direta ("Quero agendar um implante") popula draft.type="Implante" e ativa o calendário normalmente.');

    process.exit(0);
}

run().catch(err => {
    console.error('❌ FAIL:', err.message, err.stack);
    process.exit(1);
});
