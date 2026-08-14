/**
 * TESTE DE REGRESSÃO: INTERPRETAÇÃO DE TEXTO LIVRE VS LISTA DE PROCEDIMENTOS
 * 
 * Cobre os 4 cenários obrigatórios do Prompt 2:
 * 1. Match único: "quero implante" -> aceita "Implante" e avança para o calendário.
 * 2. Match ambíguo: "limpeza" com 2+ opções -> NÃO escolhe sozinho, re-pergunta exibindo apenas as opções ambíguas.
 * 3. Sem match: "quero uma coisa" -> re-envia a lista completa (gate intacto).
 * 4. Caso do log real: "Eu sou o Henrique e já escolhi o procedimento" -> NÃO gera falso-positivo, re-exibe a lista.
 */
require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function run() {
    console.log('🧪 [TEST_FREE_TEXT_PROCEDURE_MATCH] Iniciando testes de interpretação de texto livre...');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // --------------------------------------------------------------------------
    // TESTE 1: Match Único ("quero implante" -> "Implante")
    // --------------------------------------------------------------------------
    console.log('\n[Teste 1/4] Match Único: Usuário digita "quero implante"');
    const phone1 = '5511999991111';
    await db.sessions.set(phone1, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone1, null, clinicId).catch(() => {});

    // Inicia agendamento
    await conversationController.handleIncomingMessage({
        phone: phone1,
        clinicId: clinicId,
        messageText: 'Quero agendar uma consulta',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    // Envia texto livre com match único
    const resp1 = await conversationController.handleIncomingMessage({
        phone: phone1,
        clinicId: clinicId,
        messageText: 'quero implante',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draft1 = await db.sessions.getDraft(phone1, clinicId);
    assert.ok(draft1?.type && draft1.type.includes('Implante'), 'FALHA: draft.type deveria ter sido inferido como Implante!');
    assert.strictEqual(resp1.showCalendar, true, 'FALHA: Bot deveria avançar para o calendário ao obter match único!');
    console.log(`  ✅ PASS: Match único aceito ("quero implante" -> "${draft1.type}") e avançou para o calendário!`);

    // --------------------------------------------------------------------------
    // TESTE 2: Match Ambíguo (2+ opções para "limpeza")
    // --------------------------------------------------------------------------
    console.log('\n[Teste 2/4] Match Ambíguo: Usuário digita "limpeza" em clínica com múltiplas limpezas');
    const phone2 = '5511999992222';
    await db.sessions.set(phone2, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone2, null, clinicId).catch(() => {});

    // Simula clínica com procedimentos customizados ambíguos: "Limpeza Simples" e "Limpeza Profunda"
    const clinicSettingsMock = { procedures: 'Limpeza Simples, Limpeza Profunda, Implante' };

    await conversationController.handleIncomingMessage({
        phone: phone2,
        clinicId: clinicId,
        messageText: 'Quero agendar uma consulta',
        phoneNumberId: '5511979992719',
        isSimulation: true,
        clinicSettings: clinicSettingsMock
    });

    const resp2 = await conversationController.handleIncomingMessage({
        phone: phone2,
        clinicId: clinicId,
        messageText: 'limpeza',
        phoneNumberId: '5511979992719',
        isSimulation: true,
        clinicSettings: clinicSettingsMock
    });

    const draft2 = await db.sessions.getDraft(phone2, clinicId);
    assert.strictEqual(draft2?.type || null, null, 'FALHA DE SEGURANÇA: Bot NÃO pode escolher sozinho quando há ambiguidade!');
    assert.strictEqual(resp2.showCalendar, false, 'FALHA: Bot NÃO pode avançar para o calendário em cenário ambíguo!');
    assert.strictEqual(resp2.showProceduresList, true, 'FALHA: Bot deve re-solicitar a lista de procedimentos!');
    assert.strictEqual(Array.isArray(resp2.procedures), true, 'FALHA: procedimentos devem ser retornados como Array');
    assert.strictEqual(resp2.procedures.length, 2, 'FALHA: Deve retornar EXATAMENTE as 2 opções ambíguas!');
    assert.deepStrictEqual(resp2.procedures.sort(), ['Limpeza Profunda', 'Limpeza Simples'].sort(), 'FALHA: As opções ambíguas devem ser "Limpeza Simples" e "Limpeza Profunda"!');
    console.log('  ✅ PASS: Ambiguidade tratada com segurança! Bot não escolheu sozinho e re-apresentou apenas as 2 opções conflitantes!');

    // --------------------------------------------------------------------------
    // TESTE 3: Sem Match ("quero uma coisa") -> Gate intacto
    // --------------------------------------------------------------------------
    console.log('\n[Teste 3/4] Sem Match: Usuário digita "quero uma coisa"');
    const phone3 = '5511999993333';
    await db.sessions.set(phone3, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone3, null, clinicId).catch(() => {});

    await conversationController.handleIncomingMessage({
        phone: phone3,
        clinicId: clinicId,
        messageText: 'Quero agendar uma consulta',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const resp3 = await conversationController.handleIncomingMessage({
        phone: phone3,
        clinicId: clinicId,
        messageText: 'quero uma coisa',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draft3 = await db.sessions.getDraft(phone3, clinicId);
    assert.strictEqual(draft3?.type || null, null, 'FALHA: draft.type deve ser null quando não há match!');
    assert.strictEqual(resp3.showCalendar, false, 'FALHA: Bot NÃO pode exibir calendário sem match!');
    assert.strictEqual(resp3.showProceduresList, true, 'FALHA: Bot deve re-exibir a lista completa (gate do Prompt 1)!');
    console.log('  ✅ PASS: Sem match mantido com segurança! Lista completa re-enviada sem escolha inventada!');

    // --------------------------------------------------------------------------
    // TESTE 4: Caso Exato do Log de Produção ("Eu sou o Henrique e já escolhi o procedimento")
    // --------------------------------------------------------------------------
    console.log('\n[Teste 4/4] Caso Exato do Log: "Eu sou o Henrique e já escolhi o procedimento"');
    const phone4 = '5511999994444';
    await db.sessions.set(phone4, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone4, null, clinicId).catch(() => {});

    await conversationController.handleIncomingMessage({
        phone: phone4,
        clinicId: clinicId,
        messageText: 'Quero agendar uma consulta',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const resp4 = await conversationController.handleIncomingMessage({
        phone: phone4,
        clinicId: clinicId,
        messageText: 'Eu sou o Henrique e já escolhi o procedimento',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draft4 = await db.sessions.getDraft(phone4, clinicId);
    assert.strictEqual(draft4?.type || null, null, 'FALHA: Texto do log do Henrique NÃO pode gerar match falso-positivo!');
    assert.strictEqual(resp4.showCalendar, false, 'FALHA: Calendário NÃO pode ser exibido para o texto do Henrique!');
    assert.strictEqual(resp4.showProceduresList, true, 'FALHA: Bot deve re-solicitar a lista de procedimentos!');
    console.log('  ✅ PASS: Caso do log do Henrique validado 100%! Zero falsos positivos, gate mantido!');

    console.log('\n================================================================');
    console.log('🎉 SUÍTE DE INTERPRETAÇÃO DE TEXTO LIVRE 100% APROVADA!');
    console.log('================================================================\n');
}

run().then(() => process.exit(0)).catch(err => {
    console.error('❌ FAIL:', err.message, err.stack);
    process.exit(1);
});
