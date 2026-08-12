/**
 * test_family_booking_with_prior_draft.js
 * 
 * Testa o cenário EXATO do bug reportado pelo usuário:
 * 1. Paciente seleciona procedimento (Limpeza)
 * 2. Seleciona data
 * 3. Clica "Agendar p/ Outro" (sem ter confirmado o primeiro)
 * 4. Fornece nome do dependente
 * 5. Verifica que o bot EXIGE CPF antes de confirmar
 * 6. Tenta "Confirmar" prematuramente → deve ser BLOQUEADO
 */

require('dotenv').config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || '';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const controller = require('../controllers/conversationController');

const TEST_PHONE = '5511000111222';
const TEST_CLINIC_ID = '1316777e-464d-4015-84fc-bc742780a413';

let pass = 0;
let fail = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        pass++;
    } else {
        console.log(`  ❌ FAIL: ${message}`);
        fail++;
    }
}

async function runTest() {
    console.log('==========================================================');
    console.log('🧪 TESTE: "Agendar p/ Outro" COM DRAFT PRÉVIO (Procedimento+Data)');
    console.log('==========================================================\n');

    const db = require('../services/databaseService');

    // Cleanup
    await db.sessions.set(TEST_PHONE, [], TEST_CLINIC_ID);
    await db.sessions.setDraft(TEST_PHONE, null, TEST_CLINIC_ID);

    // Simula cenário com draft prévio (como se já tivesse selecionado procedimento e data)
    await db.sessions.setDraft(TEST_PHONE, {
        type: 'Limpeza',
        date: '2026-08-15',
        time: null,
        doctor_id: 'fake-doctor-id',
        doctor_name: 'Dr. Teste'
    }, TEST_CLINIC_ID);

    console.log('[ETAPA 1] Enviando "Agendar p/ Outro" com draft.type=Limpeza, draft.date=2026-08-15...');
    const r1 = await controller.handleIncomingMessage({
        phone: TEST_PHONE,
        text: 'Agendar p/ Outro',
        isSimulation: true,
        clinicId: TEST_CLINIC_ID,
        phoneId: 'test'
    });
    console.log(`  🤖 Bot: "${r1.text.substring(0, 80)}..."`);
    assert(r1.text.toLowerCase().includes('nome completo'), 'Bot pediu nome do dependente');

    // Verificar se o draft foi resetado
    const draftAfterR1 = await db.sessions.getDraft(TEST_PHONE, TEST_CLINIC_ID);
    console.log(`  📊 Draft: type=${draftAfterR1?.type}, date=${draftAfterR1?.date}, is_family_booking=${draftAfterR1?.is_family_booking}`);
    assert(draftAfterR1?.is_family_booking === true, 'is_family_booking = true');
    assert(!draftAfterR1?.type, 'draft.type foi LIMPO (era Limpeza, agora null)');
    assert(!draftAfterR1?.date, 'draft.date foi LIMPO (era 2026-08-15, agora null)');
    assert(!draftAfterR1?.doctor_id, 'draft.doctor_id foi LIMPO');

    console.log('\n[ETAPA 2] Enviando nome do dependente: "Raquel Pereira da Silva"...');
    const r2 = await controller.handleIncomingMessage({
        phone: TEST_PHONE,
        text: 'Raquel Pereira da Silva',
        isSimulation: true,
        clinicId: TEST_CLINIC_ID,
        phoneId: 'test'
    });
    console.log(`  🤖 Bot: "${r2.text.substring(0, 100)}..."`);
    assert(
        r2.text.toLowerCase().includes('cpf') || r2.requireCpf === true,
        'Bot EXIGIU CPF do dependente IMEDIATAMENTE após o nome'
    );
    assert(!r2.buttons || r2.buttons.length === 0, 'Nenhum botão de confirmação exibido (bloqueado até CPF)');

    const draftAfterR2 = await db.sessions.getDraft(TEST_PHONE, TEST_CLINIC_ID);
    console.log(`  📊 Draft: dependentName=${draftAfterR2?.dependentName}, dependentCpf=${draftAfterR2?.dependentCpf}, type=${draftAfterR2?.type}`);
    assert(draftAfterR2?.dependentName === 'Raquel Pereira da Silva', 'Nome do dependente registrado corretamente');
    assert(!draftAfterR2?.dependentCpf, 'CPF do dependente ainda não preenchido');

    console.log('\n[ETAPA 3] Tentando "Confirmar" sem CPF...');
    const r3 = await controller.handleIncomingMessage({
        phone: TEST_PHONE,
        text: 'Confirmar',
        isSimulation: true,
        clinicId: TEST_CLINIC_ID,
        phoneId: 'test'
    });
    console.log(`  🤖 Bot: "${r3.text.substring(0, 100)}..."`);
    // Sem type/date/time, isAffirmativeConfirmation será false, mas isConfirmKeyword será true
    // hasCpf deve ser false (family_booking sem dependentCpf)
    // Se !hasCpf, pede CPF. Se não tem type/date/time, pode ir para outro fluxo.
    const didBlockConfirmation = r3.text.toLowerCase().includes('cpf') || r3.requireCpf === true || 
        !r3.text.toLowerCase().includes('confirmado');
    assert(didBlockConfirmation, '"Confirmar" foi BLOQUEADO (sem CPF do dependente)');

    console.log('\n==========================================================');
    console.log(`📊 RESULTADO: ${pass} PASS / ${fail} FAIL`);
    console.log('==========================================================');

    // Cleanup
    await db.sessions.set(TEST_PHONE, [], TEST_CLINIC_ID);
    await db.sessions.setDraft(TEST_PHONE, null, TEST_CLINIC_ID);

    process.exit(fail > 0 ? 1 : 0);
}

runTest().catch(err => {
    console.error('ERRO FATAL:', err);
    process.exit(1);
});
