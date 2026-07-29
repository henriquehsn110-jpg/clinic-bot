require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runTest() {
    console.log('🧪 Iniciando Teste de Validação de Nomes e Perguntas Conversacionais...');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194'; // Clínica Modelo
    const testPhone = '5511977778888';

    // 1. Limpa sessão anterior
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);

    // Initialize session with greeting
    await conversationController.handleIncomingMessage(testPhone, "Olá", true, clinicId);

    // 2. Passo 1: Usuário clica em "Agendar p/ Outro"
    const res1 = await conversationController.handleIncomingMessage(testPhone, "Agendar p/ Outro", true, clinicId);
    console.log('  💬 Resposta ao Agendar p/ Outro:');
    console.log('  -----------------------------------');
    console.log(res1.text);
    console.log('  -----------------------------------');
    assert(res1.text.includes('nome completo'), 'Deve solicitar o nome completo');

    // 3. Passo 2: Ao invés do nome, usuário faz a pergunta "Quero saber quando falarei com o dentista"
    const res2 = await conversationController.handleIncomingMessage(testPhone, "Quero saber quando falarei com o dentista", true, clinicId);
    console.log('  💬 Resposta à pergunta do usuário:');
    console.log('  -----------------------------------');
    console.log(res2.text);
    console.log('  -----------------------------------');

    // Asserções:
    // A. A resposta NÃO pode conter "registrado no nome de Quero Saber Quando Falarei Com O Dentista"!
    assert(!res2.text.includes('Quero Saber Quando Falarei'), 'NÃO pode salvar frase/pergunta como nome do paciente!');
    
    // B. O rascunho de sessão NÃO pode ter salvado o nome contaminado!
    const draft = await db.sessions.getDraft(testPhone, clinicId);
    assert.strictEqual(draft.name, null, 'O rascunho de nome deve permanecer null quando o usuário faz uma pergunta');

    console.log('  ✅ [PASSOU]: Perguntas conversacionais filtradas com 100% de sucesso!');
    console.log('  🎉 TESTE DE PROTEÇÃO CONTRA NOMES FALSOS APROVADO! 🚀');
}

runTest().catch(err => {
    console.error('❌ FALHA NO TESTE DE VALIDAÇÃO DE NOMES:', err);
    process.exit(1);
});
