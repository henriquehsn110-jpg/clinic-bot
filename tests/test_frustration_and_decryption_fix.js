/**
 * TEST: Guardião Anti-Looping, Detector de Frustração e Fallback de Descriptografia
 * Valida que:
 *   1) DecryptData não retorna null quando a chave é diferente, usando o dado legado.
 *   2) Frustração do paciente ("Está errado", "Eu já informei") aciona transbordo humano imediatamente.
 *   3) "Sim" confirma agendamento quando o rascunho possui data, hora e procedimento.
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runTest() {
    console.log('🧪 [TEST_FRUSTRATION_FIX] Iniciando Teste de Frustração e Descriptografia...');

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
        // 1. Teste de DecryptData Fallback
        const legacyData = '01234567890'; // Dados antigos não criptografados
        const decryptedLegacy = db.decryptData(legacyData);
        assert('DecryptData — Retorna dado antigo não criptografado', decryptedLegacy === legacyData);

        const invalidCipher = '123456:7890ab:abcdef1234';
        const decryptedInvalid = db.decryptData(invalidCipher);
        assert('DecryptData — Retorna fallback bruto ao invés de null em falha de chave', decryptedInvalid === invalidCipher);

        // 2. Teste de Interceptação de Frustração ("Está errado", "Eu já informei")
        const { data: clinic } = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').maybeSingle();
        const clinicId = clinic ? clinic.id : 'e8f24abe-381d-499d-9596-252507b32194';
        const testPhone = '5511988887777';

        // Garante paciente existente no banco para o teste
        await db.patients.findOrCreate(testPhone, clinicId);
        await db.sessions.set(testPhone, [], clinicId);
        await db.sessions.setDraft(testPhone, null, clinicId);

        const resErrado = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Está errado, eu já informei meu nome',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        assert('Detector de Frustração — Mensagem "Está errado" aciona transbordo humano', resErrado.transferToHuman === true);
        assert('Detector de Frustração — Resposta informa transferência ao atendente', resErrado.text.includes('transferindo'));

        const resJaInformei = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Eu já informei antes',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        assert('Detector de Frustração — Mensagem "Eu já informei" aciona transbordo humano', resJaInformei.transferToHuman === true);

        // 3. Teste de Confirmação com "Sim" quando rascunho está completo
        await db.sessions.set(testPhone, [
            { role: 'user', parts: [{ text: 'Agendar Consulta' }] },
            { role: 'model', parts: [{ text: 'Escolha o procedimento' }] }
        ], clinicId);

        await db.sessions.setDraft(testPhone, {
            type: 'Consulta Geral',
            date: '2026-08-20',
            time: '11:00',
            name: 'Paciente Teste Frustracao'
        }, clinicId);

        const resSim = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Sim',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        assert('Confirmação com "Sim" — Agendamento confirmado com sucesso', resSim.text.includes('Agendamento confirmado') || resSim.text.includes('já está confirmada'));

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
