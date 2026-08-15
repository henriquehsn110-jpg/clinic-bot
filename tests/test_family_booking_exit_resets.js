/**
 * test_family_booking_exit_resets.js
 * 
 * Bateria de Testes Automatizados para Cobertura de Reset de is_family_booking
 * e Limpeza de Draft em Todos os Pontos de Saída / Troca de Intent.
 * 
 * REGRA 11: Exibição explícita do dump JSON bruto do draft no banco
 * antes e depois de cada ponto de saída.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.staging') });
if (!process.env.SUPABASE_URL) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function run() {
    console.log('================================================================');
    console.log('🧪 [TEST_FAMILY_BOOKING_EXIT_RESETS] Iniciando Validação de Resets');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const phone = '5511999997788';
    const phoneNumberId = '5511979992719';

    // --------------------------------------------------------------------------
    // CENÁRIO 1: Iniciar fluxo de família (Gate 1 - Nome) -> CANCELAR ("Cancelar agendamento")
    //            -> Iniciar novo agendamento -> Validar reset completo de draft
    // --------------------------------------------------------------------------
    console.log('[Cenário 1/5] Iniciar agendamento familiar -> Cancelar no Gate 1 -> Iniciar agendamento normal');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    // Turno 1: Inicia Agendamento Familiar
    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Agendar p/ Outro', phoneNumberId, isSimulation: true
    });
    const draft1_before = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - ANTES] draft:', JSON.stringify(draft1_before));
    assert.strictEqual(draft1_before.is_family_booking, true, 'is_family_booking deve ser true');
    console.log('  ✓ Passo 1: Fluxo familiar iniciado com sucesso (is_family_booking = true)');

    // Turno 2: Usuário clica "Cancelar agendamento" / "desisti"
    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Cancelar agendamento', phoneNumberId, isSimulation: true
    });
    const draft1_after = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - APÓS CANCELAR] draft:', JSON.stringify(draft1_after));
    assert.strictEqual(Boolean(draft1_after.is_family_booking), false, 'is_family_booking deve ser false/undefined');
    assert.strictEqual(Object.keys(draft1_after).length, 0, 'draft no banco deve estar 100% vazio {}');
    console.log('  ✓ Passo 2: Cancelamento explícito executado (draft 100% purgado do Supabase)');

    // Turno 3: Usuário inicia novo agendamento
    const resp1c = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Quero agendar uma consulta', phoneNumberId, isSimulation: true
    });
    const draft1_new = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - NOVO AGENDAMENTO] draft:', JSON.stringify(draft1_new));
    assert.strictEqual(Boolean(draft1_new.is_family_booking), false, 'is_family_booking deve permanecer false');
    assert.strictEqual(draft1_new.dependentName || null, null, 'dependentName deve ser null');
    assert.strictEqual(resp1c.showProceduresList, true, 'Deve exibir a lista de procedimentos');
    console.log('  ✅ PASS: Cenário 1 (Gate 1 -> Cancelar agendamento -> Novo agendamento) 100% isolado!\n');

    // --------------------------------------------------------------------------
    // CENÁRIO 2: Iniciar fluxo de família (Gate 2 - CPF) -> CANCELAR ("não quero")
    //            -> Iniciar novo agendamento -> Validar reset completo de draft
    // --------------------------------------------------------------------------
    console.log('[Cenário 2/5] Iniciar agendamento familiar -> Informar Nome -> Cancelar no Gate 2 (CPF)');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Agendar p/ Outro', phoneNumberId, isSimulation: true
    });
    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Carlos Eduardo da Silva', phoneNumberId, isSimulation: true
    });

    const draft2_before = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - ANTES RECUSA CPF] draft:', JSON.stringify(draft2_before));
    assert.strictEqual(draft2_before.is_family_booking, true, 'is_family_booking deve ser true');
    assert.strictEqual(draft2_before.dependentName, 'Carlos Eduardo da Silva', 'dependentName deve estar gravado');

    // Usuário desiste de fornecer o CPF
    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'não quero informar o cpf', phoneNumberId, isSimulation: true
    });
    const draft2_after = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - APÓS RECUSA CPF] draft:', JSON.stringify(draft2_after));
    assert.strictEqual(Boolean(draft2_after.is_family_booking), false, 'is_family_booking deve ser false/undefined');
    assert.strictEqual(Object.keys(draft2_after).length, 0, 'draft no banco deve estar 100% vazio {}');
    console.log('  ✅ PASS: Cenário 2 (Gate 2 CPF -> Recusa/Cancelamento) 100% resetado!\n');

    // --------------------------------------------------------------------------
    // CENÁRIO 3: Fluxo de Família no meio -> Usuário diz "Remarcar Consulta"
    // --------------------------------------------------------------------------
    console.log('[Cenário 3/5] Fluxo familiar ativo -> Usuário envia "Remarcar"');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, { is_family_booking: true, dependentName: 'Pedro Santos', type: 'Limpeza' }, clinicId);

    const draft3_before = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - ANTES REMARCAR] draft:', JSON.stringify(draft3_before));

    const resp3 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Remarcar consulta', phoneNumberId, isSimulation: true
    });
    const draft3_after = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - APÓS REMARCAR] draft:', JSON.stringify(draft3_after));
    assert.strictEqual(Boolean(draft3_after.is_family_booking), false, 'is_family_booking deve ser resetado ao remarcar');
    assert.strictEqual(Object.keys(draft3_after).length, 0, 'draft no banco deve estar 100% vazio {}');
    assert.strictEqual(resp3.showProceduresList, true, 'Deve exibir opções de procedimentos para novo agendamento');
    console.log('  ✅ PASS: Cenário 3 (Remarcar reseta is_family_booking e limpa draft) 100% aprovado!\n');

    // --------------------------------------------------------------------------
    // CENÁRIO 4: Fluxo de Família no meio -> Usuário envia "Cancelar" geral
    // --------------------------------------------------------------------------
    console.log('[Cenário 4/5] Fluxo familiar ativo -> Usuário envia comando "cancelar"');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, { is_family_booking: true, dependentName: 'Lucas Lima', date: '2026-10-10' }, clinicId);

    const draft4_before = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - ANTES COMANDO CANCELAR] draft:', JSON.stringify(draft4_before));

    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'cancelar', phoneNumberId, isSimulation: true
    });
    const draft4_after = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - APÓS COMANDO CANCELAR] draft:', JSON.stringify(draft4_after));
    assert.strictEqual(Boolean(draft4_after.is_family_booking), false, 'is_family_booking deve ser false');
    assert.strictEqual(Object.keys(draft4_after).length, 0, 'draft no banco deve estar 100% vazio {}');
    console.log('  ✅ PASS: Cenário 4 (Comando cancelar reseta is_family_booking e limpa draft) 100% aprovado!\n');

    // --------------------------------------------------------------------------
    // CENÁRIO 5: Fluxo de Família -> Handoff Humano ("Falar com atendente")
    // --------------------------------------------------------------------------
    console.log('[Cenário 5/5] Fluxo familiar ativo -> Usuário envia "Falar com atendente" (Handoff)');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, { is_family_booking: true, dependentName: 'Mariana Costa' }, clinicId);

    const draft5_before = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - ANTES TRANSBORDO HUMANO] draft:', JSON.stringify(draft5_before));

    const resp5 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Falar com atendente', phoneNumberId, isSimulation: true
    });
    const draft5_after = await db.sessions.getDraft(phone, clinicId);
    console.log('  [DUMP BANCO - APÓS TRANSBORDO HUMANO] draft:', JSON.stringify(draft5_after));
    assert.strictEqual(resp5.transferToHuman, true, 'Deve transferir para atendente humano');
    assert.strictEqual(Boolean(draft5_after.is_family_booking), false, 'is_family_booking deve ser false após transbordo');
    assert.strictEqual(Object.keys(draft5_after).length, 0, 'draft no banco deve estar 100% vazio {}');
    console.log('  ✅ PASS: Cenário 5 (Transbordo humano reseta draft e is_family_booking) 100% aprovado!\n');

    console.log('================================================================');
    console.log('🎉 SUÍTE DE COBERTURA DE RESET DE is_family_booking 100% APROVADA!');
    console.log('================================================================\n');
}

run().catch(err => {
    console.error('❌ ERRO NO TESTE DE RESET DE FAMILY BOOKING:', err);
    process.exit(1);
});
