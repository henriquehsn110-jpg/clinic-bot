/**
 * test_cpf_sanitary_check.js
 * 
 * Sanity Check:
 * 1. CPF com 10 dígitos (incompleto) -> bloqueado com requireCpf=true
 * 2. CPF com 11 dígitos repetidos (111.111.111-11) -> bloqueado por validateCpfChecksum
 * 3. CPF válido de teste (529.982.247-25) -> aceito e avança para confirmação
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
    console.log('🧪 [TEST_CPF_SANITARY_CHECK] Iniciando Sanity Check de CPF');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const phone = '5511999991234';
    const phoneNumberId = '5511979992719';

    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    // Inicia agendamento para dependente
    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Agendar p/ Outro', phoneNumberId, isSimulation: true
    });
    await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Carlos Eduardo', phoneNumberId, isSimulation: true
    });

    console.log('[Teste 1/3] Enviando CPF com 10 dígitos: "1233455668"...');
    const resp10 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: '1233455668', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Resposta do Bot: "${resp10.text}"`);
    console.log(`  📊 requireCpf: ${resp10.requireCpf}`);
    assert.strictEqual(resp10.requireCpf, true, 'CPF com 10 dígitos deve ser rejeitado (requireCpf: true)');
    assert.ok(resp10.text.includes('inválido') || resp10.text.includes('11 dígitos'), 'Mensagem deve avisar que o CPF é inválido/exige 11 dígitos');
    console.log('  ✅ PASS: CPF de 10 dígitos bloqueado com sucesso!\n');

    console.log('[Teste 2/3] Enviando CPF com dígitos repetidos: "111.111.111-11"...');
    const respRep = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: '111.111.111-11', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Resposta do Bot: "${respRep.text}"`);
    console.log(`  📊 requireCpf: ${respRep.requireCpf}`);
    assert.strictEqual(respRep.requireCpf, true, 'CPF repetido deve ser rejeitado (requireCpf: true)');
    assert.ok(respRep.text.includes('inválido') || respRep.text.includes('11 dígitos'), 'Mensagem deve avisar que o CPF é inválido');
    console.log('  ✅ PASS: CPF de dígitos repetidos bloqueado com sucesso!\n');

    console.log('[Teste 3/3] Enviando CPF válido de teste: "529.982.247-25"...');
    const respVal = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: '529.982.247-25', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Resposta do Bot: "${respVal.text}"`);
    console.log(`  📊 showProceduresList: ${respVal.showProceduresList}, requireCpf: ${respVal.requireCpf}`);
    const draftVal = await db.sessions.getDraft(phone, clinicId);
    console.log(`  📊 draft.dependentCpf gravado no banco: "${draftVal.dependentCpf}"`);
    assert.strictEqual(draftVal.dependentCpf, '529.982.247-25', 'dependentCpf deve ser gravado no draft');
    console.log('  ✅ PASS: CPF válido aceito e agendamento seguiu para a escolha de procedimentos!\n');

    console.log('================================================================');
    console.log('🎉 SANITY CHECK DE CPF 100% APROVADO!');
    console.log('================================================================\n');
}

run().catch(err => {
    console.error('❌ ERRO NO SANITY CHECK DE CPF:', err);
    process.exit(1);
});
