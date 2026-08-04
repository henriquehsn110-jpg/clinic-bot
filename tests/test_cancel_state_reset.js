/**
 * TEST: Reset de Estado de Cancelamento ao Mudar de Assunto
 * Valida que o paciente NUNCA fica preso na pendência de cancelamento se enviar "Oi" ou "Quero agendar".
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runTest() {
    console.log('🧪 [TEST_CANCEL_RESET] Iniciando Teste de Reset do Estado de Cancelamento...');

    let passed = 0;
    let failed = 0;

    function assert(name, condition, extra = '') {
        if (condition) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name} ${extra}`);
            failed++;
        }
    }

    try {
        const { data: clinic } = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').maybeSingle();
        const clinicId = clinic ? clinic.id : 'e8f24abe-381d-499d-9596-252507b32194';
        const testPhone = '5511966665555';

        await db.patients.findOrCreate(testPhone, clinicId);
        await db.sessions.set(testPhone, [
            { role: 'user', parts: [{ text: 'Quero cancelar' }] },
            { role: 'model', parts: [{ text: 'Qual consulta deseja cancelar?' }] }
        ], clinicId);

        // Define rascunho com cancelamento pendente
        await db.sessions.setDraft(testPhone, {
            pending_cancel_selection: true
        }, clinicId);

        // 1. Paciente envia "Quero agendar uma consulta" enquanto estava na pendência de cancelamento
        const resAgendar = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Quero agendar uma consulta',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        const draft1 = await db.sessions.getDraft(testPhone, clinicId);
        assert('Reset de Cancelamento — Desativa pending_cancel_selection', draft1.pending_cancel_selection === false);
        assert('Reset de Cancelamento — Exibe lista de procedimentos ao invés de menu de cancelamento', resAgendar.showProceduresList === true);

        // 2. Define cancelamento pendente e envia "Oi"
        await db.sessions.setDraft(testPhone, {
            pending_cancel_selection: true
        }, clinicId);

        const resOi = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Oi',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        const draft2 = await db.sessions.getDraft(testPhone, clinicId);
        assert('Reset de Cancelamento via "Oi" — Desativa pending_cancel_selection', draft2.pending_cancel_selection === false);
        assert('Reset de Cancelamento via "Oi" — Responde com sucesso sem menu de cancelamento', resOi && resOi.text && !resOi.text.includes('cancelar'));

        console.log('================================================================');
        console.log(`📊 RESULTADO DO TESTE: ${passed} PASS, ${failed} FAIL`);
        console.log('================================================================');

        if (failed > 0) process.exit(1);
        process.exit(0);
    } catch (err) {
        console.error('❌ ERRO NO TESTE:', err.message, err.stack);
        process.exit(1);
    }
}

runTest();
