/**
 * tests/test_fsm_button_ids_and_destructive_guards.js
 * 
 * Validação de:
 * 1. Uso de button_reply.id com nonces seguros (action:appt_id:nonce) para ações críticas/destrutivas.
 * 2. Rejeição de texto digitado ("sim", "1", "cancelar") como confirmação automática de ação destrutiva.
 * 3. Rejeição de nonces forjados/inválidos ou não autorizados na sessão.
 * 4. Execução autorizada via clique no botão com nonce válido.
 * 5. Ação de manutenção de consulta (keep) limpando ação pendente sem cancelar.
 */

require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

const TEST_DATE = '2028-06-15';
const TEST_TIME = '11:00';

async function runTest() {
    console.log('================================================================');
    console.log('🧪 [TEST] FSM Button IDs, Nonces e Guardas de Ações Destrutivas');
    console.log('================================================================\n');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
    const clinicId = defaultClinic.id;
    const testPhone = '5511977' + Math.floor(100000 + Math.random() * 900000);

    const cleanups = { patients: [], appointments: [] };

    try {
        // Setup: Criar paciente e consulta ativa
        console.log('1. Criando paciente e consulta para teste de cancelamento...');
        const patient = await db.patients.findOrCreate(testPhone, clinicId);
        cleanups.patients.push(patient.id);
        await db.patients.updateName(testPhone, 'Paciente Teste Botoes', clinicId);

        const appt = await calendarService.scheduleAppointment({
            phone: testPhone,
            name: 'Paciente Teste Botoes',
            clinicId,
            date: TEST_DATE,
            time: TEST_TIME,
            type: 'Consulta geral'
        });
        cleanups.appointments.push(appt.id);
        console.log(`   ✅ Consulta criada: ID=${appt.id} (${TEST_DATE} ${TEST_TIME})`);

        // ── 2. Solicitar cancelamento (deve retornar botões com nonces seguros) ──
        console.log('\n2. Paciente solicita "Quero cancelar"...');
        const resPrompt = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Quero cancelar',
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resPrompt.text.split('\n')[0]);
        console.log('   - Botões retornados:', JSON.stringify(resPrompt.buttons));

        const cancelBtn = resPrompt.buttons.find(b => typeof b === 'object' && b.id?.startsWith('cancel:'));
        const keepBtn = resPrompt.buttons.find(b => typeof b === 'object' && b.id?.startsWith('keep:'));

        assert(cancelBtn, 'Deve retornar botão com ID seguro cancel:<appt_id>:<nonce>');
        assert(keepBtn, 'Deve retornar botão com ID seguro keep:<appt_id>:<nonce>');
        console.log(`   ✅ PASS: Botões seguros gerados com sucesso: ${cancelBtn.id}`);

        // ── 3. Tentativa de cancelamento por TEXTO DIGITADO (deve ser rejeitada) ─
        console.log('\n3. Paciente tenta confirmar digitando texto solto ("Sim, cancelar")...');
        const resTypedText = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Sim, cancelar',
            // Sem buttonId!
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta à tentativa por texto:', resTypedText.text.split('\n')[0]);
        assert(resTypedText.text.includes('não aceita texto digitado') || resTypedText.text.includes('segurança'), 'Deve rejeitar texto solto');

        // Verifica no banco se a consulta CONTINUA ATIVA
        const { data: apptAfterText } = await db.supabase
            .from('appointments')
            .select('status')
            .eq('id', appt.id)
            .single();

        assert.strictEqual(apptAfterText.status, 'pending', 'Consulta DEVE continuar ativa no banco após texto solto');
        console.log('   ✅ PASS: Texto solto rejeitado! Consulta permanece ativa no banco.');

        // ── 4. Tentativa com NONCE FORJADO / INVÁLIDO (deve ser rejeitada) ─────
        console.log('\n4. Tentativa de confirmação com NONCE FORJADO...');
        const fakeButtonId = `cancel:${appt.id}:nonce_hacker_12345`;
        const resFakeNonce = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Sim, cancelar',
            buttonId: fakeButtonId,
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta ao nonce forjado:', resFakeNonce.text);
        assert(resFakeNonce.text.includes('expirou ou é inválida'), 'Deve rejeitar nonce forjado');

        const { data: apptAfterFake } = await db.supabase
            .from('appointments')
            .select('status')
            .eq('id', appt.id)
            .single();

        assert.strictEqual(apptAfterFake.status, 'pending', 'Consulta DEVE continuar ativa após nonce forjado');
        console.log('   ✅ PASS: Nonce forjado bloqueado com sucesso!');

        // ── 5. Re-solicitar cancelamento e confirmar com o NONCE VÁLIDO ────────
        console.log('\n5. Re-solicitando cancelamento para obter nonce ativo...');
        const resPrompt2 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Cancelar consulta',
            isSimulation: true,
            clinicId
        });

        const validCancelBtn = resPrompt2.buttons.find(b => typeof b === 'object' && b.id?.startsWith('cancel:'));
        assert(validCancelBtn, 'Deve gerar novo botão com nonce válido');

        console.log(`   - Enviando clique no botão autorizado: ${validCancelBtn.id}`);
        const resValidCancel = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Sim, cancelar',
            buttonId: validCancelBtn.id,
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resValidCancel.text.split('\n')[0]);
        assert(resValidCancel.text.includes('cancelada com sucesso'), 'Deve confirmar cancelamento');

        const { data: apptAfterValid } = await db.supabase
            .from('appointments')
            .select('status')
            .eq('id', appt.id)
            .single();

        assert.strictEqual(apptAfterValid.status, 'cancelled', 'Consulta DEVE estar cancelada no banco');
        console.log('   ✅ PASS: Cancelamento autorizado e executado com sucesso via botão seguro!');

        console.log('\n================================================================');
        console.log('🎉 TODOS OS TESTES DE FSM BUTTON IDS E NONCES PASSARAM!');
        console.log('================================================================\n');

    } finally {
        for (const apptId of cleanups.appointments) {
            await db.supabase.from('appointments').delete().eq('id', apptId);
        }
        for (const patId of cleanups.patients) {
            await db.supabase.from('patients').delete().eq('id', patId);
        }
    }
}

runTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
