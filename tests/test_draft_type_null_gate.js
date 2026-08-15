/**
 * TESTE DE REGRESSÃO DE FSM GATE: draft.type NULL
 * 
 * Reproduz o cenário real do log de produção (13/08/2026):
 * 1. Bot exibe a lista de procedimentos.
 * 2. Usuário envia texto livre não reconhecido ("Eu sou o Henrique e já escolhi o procedimento").
 * 3. Valida que o bot NÃO avança para exibição de calendário com draft.type null e RE-SOLICITA o procedimento (showProceduresList: true).
 * 4. Usuário envia "Selecionei a data: 2026-08-14".
 * 5. Valida que o bot NÃO fica em silêncio nem avança, mas re-exibe a lista de procedimentos exigindo o procedimento primeiro.
 * 6. Usuário finalmente seleciona "Limpeza". Bot grava draft.type = "Limpeza" e avança para showCalendar: true.
 */
require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function run() {
    console.log('🧪 [TEST_DRAFT_TYPE_NULL_GATE] Iniciando teste de regressão do Gate draft.type...');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const phone = '5511999990077';

    // Limpa sessão anterior
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    // Turno 1: Usuário pede agendamento
    console.log('\n[Turno 1] Usuário: "Quero agendar uma consulta"');
    const resp1 = await conversationController.handleIncomingMessage({
        phone,
        messageText: 'Quero agendar uma consulta',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draft1 = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft1?.type || null, null, 'draft.type deveria ser null no início');
    assert.strictEqual(resp1.showProceduresList, true, 'Deveria exibir a lista de procedimentos no Turno 1');
    console.log('  ✅ PASS: Bot exibiu a lista de procedimentos!');

    // Turno 2: Texto livre não reconhecido (Exatamente a frase do log de produção)
    console.log('\n[Turno 2] Usuário: "Eu sou o Henrique e já escolhi o procedimento"');
    const resp2 = await conversationController.handleIncomingMessage({
        phone,
        messageText: 'Eu sou o Henrique e já escolhi o procedimento',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draft2 = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft2?.type || null, null, 'FALHA: draft.type deveria continuar null!');
    assert.strictEqual(resp2.showCalendar, false, 'FALHA: Bot NÃO pode exibir calendário se draft.type é null!');
    assert.strictEqual(resp2.showProceduresList, true, 'FALHA: Bot deve re-solicitar o procedimento (showProceduresList: true)!');
    assert.strictEqual(resp2.text.includes('escolha um dos procedimentos'), true, 'FALHA: Mensagem deve orientar a escolher o procedimento!');
    console.log('  ✅ PASS: Bot bloqueou avanço indevido para calendário e re-solicitou o procedimento!');

    // Turno 3: Envio de data com draft.type null
    console.log('\n[Turno 3] Usuário: "Selecionei a data: 2026-08-14" (tentando pular procedimento)');
    const resp3 = await conversationController.handleIncomingMessage({
        phone,
        messageText: 'Selecionei a data: 2026-08-14',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draft3 = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft3?.type || null, null, 'FALHA: draft.type deve continuar null!');
    assert.strictEqual(draft3?.date || null, null, 'FALHA: draft.date NÃO pode ser gravado enquanto draft.type for null!');
    assert.strictEqual(resp3.showTimeSlots, false, 'FALHA: Bot NÃO pode exibir horários com draft.type null!');
    assert.strictEqual(resp3.showProceduresList, true, 'FALHA: Bot deve re-solicitar procedimento em vez de silenciar!');
    console.log('  ✅ PASS: Bot não gravou data orfã e re-exibiu a lista de procedimentos (sem silêncio)!');

    // Turno 4: Seleção válida de procedimento ("Limpeza")
    console.log('\n[Turno 4] Usuário finalmente seleciona: "Limpeza"');
    const resp4 = await conversationController.handleIncomingMessage({
        phone,
        messageText: 'Limpeza',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draft4 = await db.sessions.getDraft(phone, clinicId);
    assert.ok(draft4?.type && draft4.type.includes('Limpeza'), 'draft.type deveria ter sido gravado com o procedimento de Limpeza');
    assert.strictEqual(resp4.showCalendar, true, 'Bot AGORA SIM deve exibir o calendário de datas!');
    console.log(`  ✅ PASS: Seleção de procedimento gravou draft.type = "${draft4.type}" e avançou para o calendário!`);

    console.log('\n================================================================');
    console.log('🎉 TESTE DE REGRESSÃO FSM GATE (draft.type NULL) 100% APROVADO!');
    console.log('================================================================\n');
}

run().then(() => process.exit(0)).catch(err => {
    console.error('❌ FAIL:', err.message, err.stack);
    process.exit(1);
});
