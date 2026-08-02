require('dotenv').config();
const assert = require('assert');
const db = require('../services/databaseService');
const conversationController = require('../controllers/conversationController');

async function runTest() {
    console.log('🧪 Iniciando Teste de Reseta do Rascunho pending_cancel_selection...');

    const testPhone = '5511979992719';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // 1. Prepara paciente
    const patient = await db.patients.findOrCreate(testPhone, clinicId);
    await db.patients.updateName(testPhone, 'Henrique Silva', clinicId);

    // 2. Simula estado inicial de cancelamento pendente
    await db.sessions.setDraft(testPhone, { pending_cancel_selection: true }, clinicId);

    // 3. Paciente clica em Remarcar Consulta
    const res1 = await conversationController.handleIncomingMessage(
        testPhone,
        'Remarcar Consulta',
        false,
        clinicId
    );
    console.log('Resposta ao clicar em Remarcar Consulta:');
    console.log(res1.text);

    // 4. Paciente clica em "Limpeza"
    const res2 = await conversationController.handleIncomingMessage(
        testPhone,
        'Limpeza',
        false,
        clinicId
    );
    console.log('\nResposta ao escolher Limpeza:');
    console.log(res2.text);

    // 5. Valida se a resposta NÂO foi de cancelamento
    assert(!res2.text.includes('cancelar'), 'A escolha "Limpeza" NÃO deve acionar o fluxo de cancelamento');
    assert(res2.showCalendar || res2.text.includes('data') || res2.text.includes('horário') || res2.text.includes('Limpeza'), 'Deverá avançar para o agendamento de Limpeza');

    console.log('\n🎉 TESTE DE RESET DE CANCELAMENTO PENDENTE APROVADO 100% COM SUCESSO!');
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
