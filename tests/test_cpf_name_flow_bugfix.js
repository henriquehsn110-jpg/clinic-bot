require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function testCpfNameFlowBugfix() {
    console.log('\n================================================================');
    console.log('🧪 TESTE DE INTEGRAÇÃO — CORREÇÃO DO FLUXO CPF -> NOME -> CONFIRMAÇÃO');
    console.log('================================================================\n');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo');
    if (!defaultClinic) {
        console.error('❌ ERRO: Clínica "clinica-modelo" não encontrada no BD.');
        process.exit(1);
    }

    const clinicId = defaultClinic.id;
    const testPhone = '5511988889999';

    // Limpa sessão e paciente de teste
    await db.sessions.delete(testPhone, clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);

    console.log('🔹 [Passo 1/4] Simulando seleção de procedimento e data/horário...');
    // 1. Mensagem 1: Agendar Consulta
    await conversationController.handleIncomingMessage(testPhone, 'Agendar Consulta', true, clinicId, 'phone_test');
    
    // 2. Mensagem 2: Consulta geral
    await conversationController.handleIncomingMessage(testPhone, 'Consulta geral', true, clinicId, 'phone_test');
    
    // 3. Mensagem 3: Data 2026-08-05
    await conversationController.handleIncomingMessage(testPhone, '2026-08-05', true, clinicId, 'phone_test');

    // 4. Mensagem 4: Horário 14:00
    const resHorario = await conversationController.handleIncomingMessage(testPhone, '14:00', true, clinicId, 'phone_test');
    console.log('  💬 Bot pediu CPF:', resHorario.text);

    // 5. Mensagem 5: Envia CPF válido
    console.log('\n🔹 [Passo 2/4] Enviando CPF válido sem ter nome cadastrado...');
    const resCpf = await conversationController.handleIncomingMessage(testPhone, '40332421805', true, clinicId, 'phone_test');
    console.log('  💬 Resposta do Bot após CPF:', resCpf.text);
    console.log('  🔘 Botões retornados após CPF:', JSON.stringify(resCpf.buttons));

    if (resCpf.buttons && resCpf.buttons.length > 0) {
        console.error('❌ FAIL: O Bot retornou botões ao solicitar o nome! Os botões deveriam estar VAZIOS.');
        process.exit(1);
    }
    console.log('  ✅ PASS: Bot solicitou o nome SEM enviar botões de confirmação indevidos.');

    // 6. Mensagem 6: Tenta enviar "Confirmar" antes de informar o nome
    console.log('\n🔹 [Passo 3/4] Enviando "Confirmar" antes de digitar o nome...');
    const resConfirmPremature = await conversationController.handleIncomingMessage(testPhone, 'Confirmar', true, clinicId, 'phone_test');
    console.log('  💬 Resposta do Bot para tentativa de confirmação prematura:\n', resConfirmPremature.text);

    if (resConfirmPremature.text.includes('confirmado') || resConfirmPremature.text.includes('Google Agenda')) {
        console.error('❌ FAIL: O agendamento foi confirmado sem o nome do paciente!');
        process.exit(1);
    }
    console.log('  ✅ PASS: O agendamento foi BARRADO e o Bot exigiu o nome completo antes de confirmar!');

    // 7. Mensagem 7: Envia o Nome Completo
    console.log('\n🔹 [Passo 4/4] Enviando o nome completo do paciente...');
    const resNome = await conversationController.handleIncomingMessage(testPhone, 'João da Silva Sauro', true, clinicId, 'phone_test');
    console.log('  💬 Resposta do Bot após receber o nome:\n', resNome.text);
    console.log('  🔘 Botões para confirmação final:', JSON.stringify(resNome.buttons));

    // 8. Mensagem 8: Agora envia "Confirmar"
    const resConfirmFinal = await conversationController.handleIncomingMessage(testPhone, 'Confirmar', true, clinicId, 'phone_test');
    console.log('  💬 Resposta Final de Confirmação:\n', resConfirmFinal.text);

    if (!resConfirmFinal.text.includes('confirmado')) {
        console.error('❌ FAIL: Falha ao confirmar agendamento após informar o nome.');
        process.exit(1);
    }

    console.log('\n================================================================');
    console.log('🎉 TESTE DO FLUXO CPF -> NOME -> CONFIRMAÇÃO 100% APROVADO!');
    console.log('================================================================\n');

    // Limpeza final
    await db.sessions.delete(testPhone, clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);
}

testCpfNameFlowBugfix().catch(err => {
    console.error('❌ Exceção no teste:', err);
    process.exit(1);
});
