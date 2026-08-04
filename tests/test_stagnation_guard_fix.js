/**
 * TEST: Prevenção de Falso Positivo no Detector de Estagnação (Guardião Anti-Looping)
 * Valida que o clique no botão "Agendar Consulta" em conversas com histórico longo (>20 msgs)
 * NUNCA aciona o transbordo humano por erro de estagnação.
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runTest() {
    console.log('🧪 [TEST_STAGNATION_FIX] Iniciando Teste de Prevenção de Falso Positivo...');

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
        const testPhone = '5511955554444';

        await db.patients.findOrCreate(testPhone, clinicId);
        
        // Simula histórico longo acumulado de 24 mensagens (onde 24 % 4 === 0)
        const longHistory = Array(24).fill(0).map((_, i) => ({
            role: i % 2 === 0 ? 'user' : 'model',
            parts: [{ text: `Mensagem antiga ${i}` }]
        }));

        await db.sessions.set(testPhone, longHistory, clinicId);
        await db.sessions.setDraft(testPhone, null, clinicId);

        // 1. Paciente clica em "Agendar Consulta" com histórico de 24 msgs e sem rascunho
        const res = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Agendar Consulta',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        assert('Clique em "Agendar Consulta" — NUNCA aciona transbordo humano', res.transferToHuman !== true);
        assert('Clique em "Agendar Consulta" — Exibe a lista de procedimentos', res.showProceduresList === true);
        assert('Clique em "Agendar Consulta" — NUNCA envia mensagem de desculpas/impasse', !res.text.includes('impasse') && !res.text.includes('transtorno'));

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
