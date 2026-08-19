/**
 * TESTE DE REGRESSÃO: FIX DO LOOPING DE SELEÇÃO DE PROCEDIMENTOS (PROD BUG 16/08)
 * 
 * Cenário:
 * Em clínicas onde 'work_hours' possui customProcedures com casing diferente (ex: "Consulta Geral")
 * e o backend possui PROCEDURES_LIST com "Consulta geral", o usuário selecionava "Consulta geral"
 * e o bot ficava preso em loop infinito exibindo:
 * "Encontrei mais de uma opção correspondente ao seu pedido. Por favor, escolha qual delas você deseja:"
 * 
 * Validação:
 * 1. Deduplicação insensível a maiúsculas/minúsculas de procedimentos da clínica.
 * 2. "Consulta geral" e "Consulta Geral" resolvem deterministicamente para 1 único procedimento sem ambiguidade.
 * 3. A FSM avança imediatamente para a seleção de calendário/médicos (draft.type != null).
 */
require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function run() {
    console.log('================================================================');
    console.log('🧪 [TEST] Validação do Fix de Looping de Procedimentos em Produção');
    console.log('================================================================');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const testPhone = '5511979992719';

    // 1. Limpa sessão anterior e garante paciente
    await db.patients.findOrCreate(testPhone, clinicId, 'Henrique Silva');
    await db.sessions.set(testPhone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

    // ── Cenário 1: Replay fiel do log de produção (Agendar p/ Outro -> É pra mim mesmo -> Consulta geral) ──
    console.log('\n[Cenário 1/2] Replay do fluxo de produção de 16/08...');
    
    // Turno 1: Agendar p/ Outro
    const respOutro = await conversationController.handleIncomingMessage({
        phone: testPhone,
        messageText: 'Agendar p/ Outro',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });
    console.log('   1. Bot pergunta nome dependente:', respOutro.text.substring(0, 60) + '...');

    // Turno 2: "É pra mim mesmo, Henrique Silva do Nascimento"
    const respPersonal = await conversationController.handleIncomingMessage({
        phone: testPhone,
        messageText: 'É pra mim mesmo, Henrique Silva do Nascimento',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });
    console.log('   2. Bot exibe lista de procedimentos:', respPersonal.text);
    assert.strictEqual(respPersonal.showProceduresList, true, 'Deveria exibir a lista de procedimentos');

    // Turno 3: Usuário escolhe "Consulta geral"
    const respProc = await conversationController.handleIncomingMessage({
        phone: testPhone,
        messageText: 'Consulta geral',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    console.log('   3. Resposta do bot após "Consulta geral":', respProc.text);
    console.log('      - Mostra Calendário?', respProc.showCalendar);
    console.log('      - Mostra Médicos?', respProc.showDoctorList);

    const draftAfterProc = await db.sessions.getDraft(testPhone, clinicId);
    console.log('      - Draft.type no banco:', draftAfterProc?.type);

    // Validações determinísticas
    assert.notStrictEqual(draftAfterProc?.type, null, 'FALHA: draft.type não pode ser nulo após escolher Consulta geral');
    assert.strictEqual(/mais de uma opção/i.test(respProc.text), false, 'FALHA: Não pode acusar ambiguidade para Consulta geral');
    assert.strictEqual(respProc.showCalendar || respProc.showDoctorList, true, 'FALHA: Deveria avançar para calendário ou médico');

    console.log('  ✅ PASS: Cenário de produção destravado e avançando perfeitamente!');

    // ── Cenário 2: Fluxo padrão (Agendar Consulta -> Consulta Geral) ──
    console.log('\n[Cenário 2/2] Testando fluxo direto de agendamento com casing "Consulta Geral"...');
    await db.sessions.set(testPhone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

    await conversationController.handleIncomingMessage({
        phone: testPhone,
        messageText: 'Agendar consulta',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const respDirect = await conversationController.handleIncomingMessage({
        phone: testPhone,
        messageText: 'Consulta Geral',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draftDirect = await db.sessions.getDraft(testPhone, clinicId);
    assert.notStrictEqual(draftDirect?.type, null, 'FALHA: draft.type deve estar preenchido');
    assert.strictEqual(/mais de uma opção/i.test(respDirect.text), false, 'FALHA: Não pode acusar ambiguidade');
    console.log('  ✅ PASS: "Consulta Geral" direto selecionado com sucesso!');

    // Limpeza
    await db.sessions.set(testPhone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});
    console.log('\n🧹 Limpeza de teste concluída.');

    console.log('\n================================================================');
    console.log('🎉 [PASS] Fix de looping de procedimentos 100% VALIDADO!');
    console.log('================================================================');
}

run().then(() => process.exit(0)).catch(err => {
    console.error('\n❌ FAIL:', err.message, err.stack);
    process.exit(1);
});
