/**
 * TESTE DE REGRESSÃO BUG 2: Agendamento Familiar não reutiliza o nome do titular do telefone
 */
require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function run() {
    console.log('🧪 [TEST_BUG2_FAMILY_BOOKING] Executando Teste de Regressão Bug 2...');

    const phone = '5511999990002';
    const { data: clinic } = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').maybeSingle();
    const clinicId = clinic ? clinic.id : 'e8f24abe-381d-499d-9596-252507b32194';

    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    // Titular já possui nome "Henrique Silva" gravado no cadastro anterior
    await db.patients.findOrCreate(phone, clinicId, 'Henrique Silva');
    await db.patients.updateName(phone, 'Henrique Silva', clinicId);

    const r1 = await conversationController.handleIncomingMessage({
        phone: phone,
        messageText: 'Quero agendar pro meu pai, o CPF dele é 123.456.789-00.',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    // A resposta NÃO deve tratar o titular "Henrique Silva" como se fosse o pai
    assert.strictEqual(r1.text.includes('Henrique Silva'), false, 'FALHA: Resposta usou o nome do titular do telefone ("Henrique Silva") para o familiar');
    
    console.log('  ✅ PASS: Agendamento familiar não contamina o nome do dependente com o nome do titular do telefone.');

    // Limpeza dos dados do teste
    await db.supabase.from('patients').delete().eq('phone', phone).eq('clinic_id', clinicId);
    process.exit(0);
}

run().catch(err => {
    console.error('❌ FAIL:', err.message, err.stack);
    process.exit(1);
});
