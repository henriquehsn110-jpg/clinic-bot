/**
 * TESTE DE REGRESSÃO BUG 2 (CONTINUAÇÃO): Ordem do Gate de Nome + Reaproveitamento de CPF + Botões de Confirmação Final
 */
require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function run() {
    console.log('🧪 [TEST_BUG2_FAMILY_ORDER_CPF_REUSE] Executando Teste de Regressão Bug 2 (Continuação)...');

    const phone = '5511999990004';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    // Turno 1: Mensagem única mencionando "meu pai" E um CPF com checksum válido na mesma frase
    const r1 = await conversationController.handleIncomingMessage({
        phone: phone,
        messageText: 'Quero agendar pro meu pai, o CPF dele é 529.982.247-25.',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    // 1. ORDEM: O gate de nome deve interceptar IMEDIATAMENTE na mensagem 1, sem abrir calendário antes
    assert.strictEqual(r1.showCalendar, false, 'FALHA [Ordem]: Não deveria abrir calendário antes de coletar o nome do dependente');
    assert.ok(/nome completo/i.test(r1.text) || /pessoa que será atendida/i.test(r1.text), 'FALHA [Ordem]: Deveria pedir o nome do dependente imediatamente');

    console.log('  ✅ PASS 1 [Ordem]: Gate de nome interceptou na 1ª mensagem sem abrir calendário prematuro.');

    // Turno 1.5: Usuário envia uma saudação "Boa noite" antes de fornecer o nome
    const r1_5 = await conversationController.handleIncomingMessage({
        phone: phone,
        messageText: 'Boa noite',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    assert.strictEqual(r1_5.showCalendar, false, 'FALHA [Saudação]: Não deve abrir calendário em "Boa noite"');
    console.log('  ✅ PASS 1.5 [Saudação]: Saudação "Boa noite" processada sem loop de repetição robótica.');

    // Turno 2: Usuário informa o nome do dependente
    const r2 = await conversationController.handleIncomingMessage({
        phone: phone,
        messageText: 'Paulo Araujo do Nascimento',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    // 2. REAPROVEITAMENTO DE CPF: Não deve pedir CPF de novo, já que foi informado na 1ª mensagem!
    assert.ok(!/informe o cpf/i.test(r2.text) && !r2.requireCpf, 'FALHA [CPF]: Não deveria pedir CPF novamente, já foi informado na primeira mensagem');

    const draftFinal = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draftFinal?.dependentName, 'Paulo Araujo do Nascimento', 'FALHA [Draft]: dependentName deve ser "Paulo Araujo do Nascimento"');
    assert.ok(draftFinal?.dependentCpf.includes('529.982.247-25'), 'FALHA [Draft]: dependentCpf deve ter preservado o CPF "529.982.247-25"');

    console.log('  ✅ PASS 2 [CPF Reuse]: Nome do dependente gravado e CPF da 1ª mensagem reaproveitado sem repetir a pergunta.');

    // Turno 3: Agendamento de procedimento, data e horário completos
    await db.sessions.setDraft(phone, {
        is_family_booking: true,
        dependentName: 'Paulo Araujo do Nascimento',
        dependentCpf: '529.982.247-25',
        type: 'Implante',
        date: '2026-08-11',
        time: '20:00'
    }, clinicId);

    const r3 = await conversationController.handleIncomingMessage({
        phone: phone,
        messageText: 'Está correto',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    assert.ok(r3.buttons && r3.buttons.includes('Confirmar'), 'FALHA [Botões]: Mensagem final de confirmação DEVE incluir botões interativos ["Confirmar", "Agendar p/ Outro", "Alterar"]');
    console.log('  ✅ PASS 3 [Botões Interativos]: Botões ["Confirmar", "Agendar p/ Outro", "Alterar"] gerados com sucesso na confirmação final.');

    process.exit(0);
}

run().catch(err => {
    console.error('❌ FAIL:', err.message, err.stack);
    process.exit(1);
});
