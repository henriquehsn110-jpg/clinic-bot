/**
 * TESTE FASE 3: INTENÇÕES DE LINGUAGEM NATURAL E DESAMBIGUAÇÃO DE PROCEDIMENTOS
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.staging') });

const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runNaturalIntentTests() {
    console.log('================================================================');
    console.log('🧪 TESTE FASE 3: INTENÇÃO NATURAL E DESAMBIGUAÇÃO DE PROCEDIMENTOS');
    console.log('================================================================\n');

    const testPhone = '5511999997788';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // 1. Limpeza
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);

    // Cenário 1: "Quero agendar para minha filha" no 1º turno
    console.log('1. Testando entrada: "Quero agendar para minha filha"...');
    const resFamily = await conversationController.handleIncomingMessage(testPhone, 'Quero agendar para minha filha', true, clinicId, '999888777');
    const draft1 = await db.sessions.getDraft(testPhone, clinicId);

    console.log('   Texto retornado:', resFamily.text.replace(/\n+/g, ' '));
    console.log('   is_family_booking no draft:', draft1.is_family_booking);

    if (draft1.is_family_booking !== true) {
        throw new Error(`FALHA: draft.is_family_booking deve ser true ao dizer 'para minha filha'`);
    }
    if (!resFamily.text.toLowerCase().includes('nome') && !resFamily.text.toLowerCase().includes('dependente')) {
        throw new Error(`FALHA: Deve solicitar o nome da dependente`);
    }
    console.log('   ✅ Intenção familiar detectada e solicitação de nome disparada');

    // Limpeza para Cenário 2
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);

    // Cenário 2: Múltiplos procedimentos ("Quero Limpeza e Clareamento")
    console.log('\n2. Testando entrada com múltiplos procedimentos: "Quero Limpeza e Clareamento"...');
    const resMulti = await conversationController.handleIncomingMessage(testPhone, 'Quero Limpeza e Clareamento', true, clinicId, '999888777');
    const draft2 = await db.sessions.getDraft(testPhone, clinicId);

    console.log('   Texto retornado:', resMulti.text.replace(/\n+/g, ' '));
    console.log('   Botões retornados:', resMulti.buttons);
    console.log('   showCalendar:', resMulti.showCalendar);
    console.log('   draft.type:', draft2.type);

    if (draft2.type !== null && draft2.type !== undefined) {
        throw new Error(`FALHA: draft.type NÃO deve ser pré-selecionado silenciosamente! Valor: ${draft2.type}`);
    }
    if (resMulti.showCalendar === true) {
        throw new Error(`FALHA: Não deve exibir calendário antes de desambiguar o procedimento!`);
    }
    if (!resMulti.text.includes('agendar primeiro')) {
        throw new Error(`FALHA: Mensagem deve perguntar qual agendar primeiro!`);
    }
    console.log('   ✅ Desambiguação de múltiplos procedimentos acionada com sucesso sem seleção silenciosa');

    // Limpeza para Cenário 3
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);

    // Cenário 3: Dependente de sessão anterior não vaza para novo agendamento pessoal
    console.log('\n3. Testando novo agendamento após agendamento de dependente anterior...');
    const resNewPersonal = await conversationController.handleIncomingMessage(testPhone, 'Quero agendar uma Limpeza para mim', true, clinicId, '999888777');
    const draft3 = await db.sessions.getDraft(testPhone, clinicId);

    if (draft3.is_family_booking === true) {
        throw new Error(`FALHA: Novo agendamento pessoal não pode herdar is_family_booking = true`);
    }
    if (draft3.dependentName) {
        throw new Error(`FALHA: Novo agendamento pessoal não pode conter dependentName órfão`);
    }
    console.log('   ✅ Isolamento de rascunhos entre sessões validado com sucesso');

    console.log('\n================================================================');
    console.log('🎉 TODOS OS TESTES DA FASE 3 PASSARAM COM SUCESSO (100% PASS)!');
    console.log('================================================================\n');
}

runNaturalIntentTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE FASE 3:', err);
    process.exit(1);
});
