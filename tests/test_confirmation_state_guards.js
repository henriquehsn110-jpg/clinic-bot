/**
 * TESTE FASE 1: GUARDAS DE ESTADO DE CONFIRMAÇÃO E INVALIDAÇÃO DE TOKEN
 * 
 * 1. "Confirmar" sem rascunho ativo -> Deve responder que não há agendamento pendente sem tocar em agendamentos
 * 2. "Alterar" durante confirmação -> Invalida token e reseta data/hora
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.staging') });

const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    n.push(d1);
    let d2 = n.reduce((total, num, i) => total + num * (11 - i), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    n.push(d2);
    return n.join('');
}

async function runGuardsTest() {
    console.log('================================================================');
    console.log('🧪 TESTE FASE 1: GUARDAS DE CONFIRMAÇÃO E TOKEN (STAGING)');
    console.log('================================================================\n');

    const testPhone = '5511999993344';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // 1. Limpeza de rascunho
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);

    // Teste A: Enviar "Confirmar" sem nenhum agendamento pendente
    console.log('1. Testando "Confirmar" sem rascunho ativo...');
    const resNoDraft = await conversationController.handleIncomingMessage(testPhone, 'Confirmar', true, clinicId, '999888777');
    console.log('   Resposta do bot:', resNoDraft.text.replace(/\n+/g, ' '));
    console.log('   Botões:', resNoDraft.buttons);

    if (!resNoDraft.text.includes('Não há um agendamento pendente para confirmar')) {
        throw new Error(`Esperava aviso de ausência de agendamento pendente, obteve: '${resNoDraft.text}'`);
    }
    if (!resNoDraft.buttons.includes('Agendar Consulta')) {
        throw new Error(`Esperava botão 'Agendar Consulta'`);
    }
    console.log('   ✅ Guarda contra Confirmar fora de contexto aprovada!');

    // Teste B: Criar um rascunho e testar "Alterar"
    console.log('\n2. Criando rascunho de agendamento e testando "Alterar"...');
    await conversationController.handleIncomingMessage(testPhone, 'Quero agendar uma Limpeza', true, clinicId, '999888777');
    await conversationController.handleIncomingMessage(testPhone, '03/09/2026', true, clinicId, '999888777');
    await conversationController.handleIncomingMessage(testPhone, '09:00', true, clinicId, '999888777');
    
    let draft = await db.sessions.getDraft(testPhone, clinicId);
    console.log('   Draft antes de alterar:', JSON.stringify(draft));

    console.log('   Enviando: "Alterar"');
    const resAlter = await conversationController.handleIncomingMessage(testPhone, 'Alterar', true, clinicId, '999888777');
    draft = await db.sessions.getDraft(testPhone, clinicId);

    if (draft.confirmation_token !== null) {
        throw new Error(`confirmation_token deve ser invalidado (null) após 'Alterar'`);
    }
    if (!resAlter.buttons.includes('Alterar Data/Horário')) {
        throw new Error(`Esperava opções de alteração nos botões`);
    }
    console.log('   ✅ confirmation_token invalidado com sucesso após Alterar!');

    console.log('\n================================================================');
    console.log('🎉 TODOS OS TESTES DE GUARDAS DA FASE 1 PASSARAM COM SUCESSO!');
    console.log('================================================================\n');
}

runGuardsTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE DE GUARDAS:', err);
    process.exit(1);
});
