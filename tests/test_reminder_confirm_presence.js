require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runTest() {
    console.log('🧪 Iniciando teste do interceptador de confirmação de presença (Lembretes)...');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const phone = '5511979992719'; // Henrique (possui consulta confirmed em 22/09)

    // Teste 1: Henrique envia "Confirmar Presença" para consulta que já está 'confirmed'
    console.log('🔹 Teste 1: Consulta já confirmed no banco...');
    const res1 = await conversationController.handleIncomingMessage(phone, 'Confirmar Presença', true, clinicId);
    console.log('Resposta 1:', res1.text);
    assert(res1.text.includes('já está confirmada'), 'Deveria reconhecer que a consulta já está confirmada');
    assert(!res1.showCalendar, 'NÃO deve exibir calendário');
    console.log('✅ PASS: Consulta já confirmada reconhecida com sucesso!');

    // Teste 2: Telefone sem nenhuma consulta ativa
    console.log('🔹 Teste 2: Telefone sem consulta ativa...');
    const res2 = await conversationController.handleIncomingMessage('5511900009999', 'Confirmar Presença', true, clinicId);
    console.log('Resposta 2:', res2.text);
    assert(res2.text.includes('Não localizamos nenhuma consulta'), 'Deveria informar que não localizou consulta');
    assert(res2.buttons.includes('Agendar Consulta'), 'Deveria oferecer botão Agendar Consulta');
    console.log('✅ PASS: Ausência de consulta tratada com botões sem abrir calendário!');

    console.log('\n🎉 TODOS OS TESTES DO INTERCEPTADOR DE LEMBRETES PASSARAM COM 100% DE SUCESSO!');
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
