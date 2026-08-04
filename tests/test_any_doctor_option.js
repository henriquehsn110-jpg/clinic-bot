/**
 * TEST: Opção "Tanto Faz / Qualquer Disponível" na Seleção de Médicos
 * Valida que o paciente pode escolher "Tanto faz" e o sistema libera o agendamento
 * sem travar em um médico específico.
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runTest() {
    console.log('🧪 [TEST_ANY_DOCTOR] Iniciando Teste da Opção "Tanto Faz / Qualquer Disponível"...');

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
        const testPhone = '5511977776666';

        await db.patients.findOrCreate(testPhone, clinicId);
        await db.sessions.set(testPhone, [
            { role: 'user', parts: [{ text: 'Consulta geral' }] },
            { role: 'model', parts: [{ text: 'Com qual médico você prefere se consultar?' }] }
        ], clinicId);

        await db.sessions.setDraft(testPhone, {
            type: 'Consulta geral',
            needs_doctor: true,
            available_doctors: [
                { id: 'be0fbdfa-49d2-4a64-84ba-ab57e205f89e', name: 'Dr. Carlos Eduardo' },
                { id: '11111111-2222-3333-4444-555555555555', name: 'Dra. Juliana Mendes' }
            ]
        }, clinicId);

        // 1. Testa seleção "Tanto faz"
        const resTantoFaz = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Tanto faz',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        const draft1 = await db.sessions.getDraft(testPhone, clinicId);
        assert('Opção "Tanto faz" — Desativa a exigência de médico específico (needs_doctor = false)', draft1.needs_doctor === false);
        assert('Opção "Tanto faz" — doctor_id fica null para abrir agenda geral', draft1.doctor_id === null);
        assert('Opção "Tanto faz" — Exibe o componente de calendário visual', resTantoFaz.showCalendar === true);

        // 2. Limpa e testa seleção por ID doc_any (botão do WhatsApp)
        await db.sessions.setDraft(testPhone, {
            type: 'Consulta geral',
            needs_doctor: true,
            available_doctors: [
                { id: 'be0fbdfa-49d2-4a64-84ba-ab57e205f89e', name: 'Dr. Carlos Eduardo' }
            ]
        }, clinicId);

        const resDocAny = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'doc_any',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        const draft2 = await db.sessions.getDraft(testPhone, clinicId);
        assert('Botão doc_any — Desativa exigência de médico (needs_doctor = false)', draft2.needs_doctor === false);

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
