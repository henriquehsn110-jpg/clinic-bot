/**
 * test_family_booking_exit_resets.js
 * 
 * Bateria de Testes Automatizados para Cobertura de Reset de is_family_booking
 * e Limpeza de Draft em Todos os Pontos de Saída / Troca de Intent.
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
    const resp1a = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Agendar p/ Outro', phoneNumberId, isSimulation: true
    });
    const draft1a = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft1a.is_family_booking, true, 'is_family_booking deve ser true');
    console.log('  ✓ Passo 1: Fluxo familiar iniciado (is_family_booking = true)');

    // Turno 2: Usuário clica "Cancelar agendamento" / "desisti"
    const resp1b = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Cancelar agendamento', phoneNumberId, isSimulation: true
    });
    const draft1b = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft1b?.is_family_booking || false, false, 'is_family_booking deve ser false após cancelamento');
    assert.strictEqual(draft1b?.type || null, null, 'type deve ser null');
    assert.strictEqual(draft1b?.dependentName || null, null, 'dependentName deve ser null');
    console.log('  ✓ Passo 2: Cancelamento explícito executado (draft limpo)');

    // Turno 3: Usuário inicia novo agendamento
    const resp1c = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Quero agendar uma consulta', phoneNumberId, isSimulation: true
    });
    const draft1c = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft1c?.is_family_booking || false, false, 'is_family_booking deve permanecer false no novo agendamento');
    assert.strictEqual(draft1c?.dependentName || null, null, 'dependentName deve ser null');
    assert.strictEqual(draft1c?.dependentCpf || null, null, 'dependentCpf deve ser null');
    assert.strictEqual(resp1c.showProceduresList, true, 'Deve exibir a lista de procedimentos');
    console.log('  ✅ PASS: Cenário 1 (Gate 1 -> Cancelar agendamento -> Novo agendamento) 100% isolado!');

    // --------------------------------------------------------------------------
    // CENÁRIO 2: Iniciar fluxo de família (Gate 2 - CPF) -> CANCELAR ("não quero")
    //            -> Iniciar novo agendamento -> Validar reset completo de draft
    // --------------------------------------------------------------------------
    console.log('\n[Cenário 2/5] Iniciar agendamento familiar -> Informar Nome -> Cancelar no Gate 2 (CPF)');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Agendar p/ Outro', phoneNumberId, isSimulation: true
    });
    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'O nome é Carlos Eduardo da Silva', phoneNumberId, isSimulation: true
    });

    const draft2a = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft2a.is_family_booking, true, 'is_family_booking deve ser true');
    assert.strictEqual(draft2a.dependentName, 'Carlos Eduardo da Silva', 'dependentName deve estar gravado');

    // Usuário desiste de fornecer o CPF
    const resp2b = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'não quero informar o cpf', phoneNumberId, isSimulation: true
    });
    const draft2b = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft2b?.is_family_booking || false, false, 'is_family_booking deve ser resetado');
    assert.strictEqual(draft2b?.dependentName || null, null, 'dependentName deve ser resetado para null');
    assert.strictEqual(draft2b?.dependentCpf || null, null, 'dependentCpf deve ser resetado para null');
    console.log('  ✅ PASS: Cenário 2 (Gate 2 CPF -> Recusa/Cancelamento) 100% resetado!');

    // --------------------------------------------------------------------------
    // CENÁRIO 3: Fluxo de Família no meio -> Usuário diz "Remarcar Consulta"
    // --------------------------------------------------------------------------
    console.log('\n[Cenário 3/5] Fluxo familiar ativo -> Usuário envia "Remarcar"');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, { is_family_booking: true, dependentName: 'Pedro Santos', type: 'Limpeza' }, clinicId);

    const resp3 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Remarcar consulta', phoneNumberId, isSimulation: true
    });
    const draft3 = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft3?.is_family_booking || false, false, 'is_family_booking deve ser resetado ao remarcar');
    assert.strictEqual(draft3?.dependentName || null, null, 'dependentName deve ser null');
    assert.strictEqual(resp3.showProceduresList, true, 'Deve exibir opções de procedimentos para novo agendamento');
    console.log('  ✅ PASS: Cenário 3 (Remarcar reseta is_family_booking e limpa draft) 100% aprovado!');

    // --------------------------------------------------------------------------
    // CENÁRIO 4: Fluxo de Família no meio -> Usuário envia "Cancelar" geral
    // --------------------------------------------------------------------------
    console.log('\n[Cenário 4/5] Fluxo familiar ativo -> Usuário envia comando "cancelar"');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, { is_family_booking: true, dependentName: 'Lucas Lima', date: '2026-10-10' }, clinicId);

    const resp4 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'cancelar', phoneNumberId, isSimulation: true
    });
    const draft4 = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft4?.is_family_booking || false, false, 'is_family_booking deve ser false');
    assert.strictEqual(draft4?.dependentName || null, null, 'dependentName deve ser null');
    assert.strictEqual(draft4?.date || null, null, 'date deve ser null');
    console.log('  ✅ PASS: Cenário 4 (Comando cancelar reseta is_family_booking e limpa draft) 100% aprovado!');

    // --------------------------------------------------------------------------
    // CENÁRIO 5: Fluxo de Família -> Handoff Humano ("Falar com atendente")
    // --------------------------------------------------------------------------
    console.log('\n[Cenário 5/5] Fluxo familiar ativo -> Usuário envia "Falar com atendente" (Handoff)');
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, { is_family_booking: true, dependentName: 'Mariana Costa' }, clinicId);

    const resp5 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Falar com atendente', phoneNumberId, isSimulation: true
    });
    const draft5 = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(resp5.transferToHuman, true, 'Deve transferir para atendente humano');
    assert.strictEqual(draft5?.is_family_booking || false, false, 'is_family_booking deve ser false após transbordo');
    assert.strictEqual(draft5?.dependentName || null, null, 'dependentName deve ser null');
    console.log('  ✅ PASS: Cenário 5 (Transbordo humano reseta draft e is_family_booking) 100% aprovado!');

    console.log('\n================================================================');
    console.log('🎉 SUÍTE DE COBERTURA DE RESET DE is_family_booking 100% APROVADA!');
    console.log('================================================================\n');
}

run().catch(err => {
    console.error('❌ ERRO NO TESTE DE RESET DE FAMILY BOOKING:', err);
    process.exit(1);
});
