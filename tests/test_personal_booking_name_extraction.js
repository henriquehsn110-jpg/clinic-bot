/**
 * tests/test_personal_booking_name_extraction.js
 * 
 * Validação de atualização do nome do titular quando informado em atalhos pessoais:
 * "É para mim mesmo, Henrique Silva do Nascimento"
 */

require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

const TEST_PHONE = '5511999' + Math.floor(100000 + Math.random() * 900000);
const TEST_CPF = '529.982.247-25';
const OLD_NAME = 'Jurandir Amaral';
const NEW_NAME = 'Henrique Silva do Nascimento';

async function runTest() {
    console.log('================================================================');
    console.log('🧪 [TEST] Extração & Atualização de Nome do Titular ("É para mim mesmo, [Nome]")');
    console.log('================================================================\n');

    let clinicId = null;
    const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
    clinicId = defaultClinic.id;
    console.log(`🏥 Clínica: ${defaultClinic.name} (${clinicId})\n`);

    let patientId = null;

    try {
        // Setup: cria paciente inicial com nome antigo e CPF válido
        const created = await db.patients.findOrCreate(TEST_PHONE, clinicId);
        patientId = created.id;
        await db.patients.updateName(TEST_PHONE, OLD_NAME, clinicId);
        await db.patients.updateCpf(TEST_PHONE, TEST_CPF, clinicId);
        await db.sessions.set(TEST_PHONE, [], clinicId);
        await db.sessions.setDraft(TEST_PHONE, null, clinicId);

        let p = await db.patients.findByPhone(TEST_PHONE, clinicId);
        console.log(`1. Paciente inicial configurado: ${p.name} (${p.phone}, CPF: ${p.cpf})`);
        assert.strictEqual(p.name, OLD_NAME, 'Nome inicial deve ser Jurandir Amaral');

        // Turno 1: Usuário envia "Agendar p/ Outro"
        console.log('\n2. Usuário envia "Agendar p/ Outro"...');
        const res1 = await conversationController.handleIncomingMessage({
            phone: TEST_PHONE,
            text: 'Agendar p/ Outro',
            isSimulation: false,
            clinicId: clinicId
        });
        console.log('   - Resposta do bot:', res1.text);

        // Turno 2: Usuário envia "A consulta é para mim mesmo, Henrique Silva do Nascimento" (caso exato de produção)
        console.log('\n3. Usuário corrige: "A consulta é para mim mesmo, Henrique Silva do Nascimento"...');
        const res2 = await conversationController.handleIncomingMessage({
            phone: TEST_PHONE,
            text: `A consulta é para mim mesmo, ${NEW_NAME}`,
            isSimulation: false,
            clinicId: clinicId
        });
        console.log('   - Resposta do bot:', res2.text);
        assert.strictEqual(res2.showProceduresList, true, 'Deve abrir lista de procedimentos');

        // Verifica se o banco e o draft foram atualizados
        p = await db.patients.findByPhone(TEST_PHONE, clinicId);
        console.log(`   - Nome no banco de dados após atalho: "${p.name}"`);
        assert.strictEqual(p.name, NEW_NAME, 'Nome no banco DEVE ser atualizado para Henrique Silva do Nascimento');

        const draft = await db.sessions.getDraft(TEST_PHONE, clinicId);
        console.log(`   - Nome no rascunho (draft): "${draft.name}"`);
        assert.strictEqual(draft.name, NEW_NAME, 'draft.name DEVE ser Henrique Silva do Nascimento');
        assert.strictEqual(draft.is_family_booking, false, 'is_family_booking deve ser false');

        // Turno 3: Usuário escolhe "Limpeza"
        console.log('\n4. Usuário escolhe "Limpeza"...');
        const res3 = await conversationController.handleIncomingMessage({
            phone: TEST_PHONE,
            text: 'Limpeza',
            isSimulation: false,
            clinicId: clinicId
        });
        console.log('   - Resposta do bot (mostra calendário):', res3.showCalendar);

        // Turno 4: Usuário escolhe "Selecionei a data: 2026-11-25"
        console.log('\n5. Usuário escolhe data "2026-11-25"...');
        const res4 = await conversationController.handleIncomingMessage({
            phone: TEST_PHONE,
            text: 'Selecionei a data: 2026-11-25',
            isSimulation: false,
            clinicId: clinicId
        });
        console.log('   - Resposta do bot (mostra horários):', res4.showTimeSlots);

        // Turno 5: Usuário escolhe horário "09:00"
        console.log('\n6. Usuário escolhe horário "09:00"...');
        const res5 = await conversationController.handleIncomingMessage({
            phone: TEST_PHONE,
            text: '09:00',
            isSimulation: false,
            clinicId: clinicId
        });
        console.log('   - Resposta do bot (Confirmação):', res5.text);
        console.log('   - Botões retornados:', res5.buttons);

        // Validação estrita: O texto de confirmação DEVE citar "Henrique Silva do Nascimento" e NUNCA "Jurandir Amaral"
        assert(res5.text.includes(NEW_NAME), `A mensagem de confirmação deve citar "${NEW_NAME}"`);
        assert(!res5.text.includes(OLD_NAME), `A mensagem de confirmação NÃO deve conter "${OLD_NAME}"`);
        assert.deepStrictEqual(res5.buttons, ["Confirmar", "Agendar p/ Outro", "Alterar"], 'Deve conter os 3 botões de confirmação');

        console.log('\n================================================================');
        console.log('🎉 [PASS] Teste de extração e atualização de nome pessoal 100% APROVADO!');
        console.log('================================================================\n');

    } finally {
        // Limpeza
        await db.sessions.set(TEST_PHONE, [], clinicId);
        await db.sessions.setDraft(TEST_PHONE, null, clinicId);
        if (patientId) {
            await db.supabase.from('appointments').delete().eq('patient_id', patientId);
            await db.supabase.from('patients').delete().eq('id', patientId);
        }
        console.log('🧹 Limpeza de teste concluída.');
    }
}

runTest().catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
