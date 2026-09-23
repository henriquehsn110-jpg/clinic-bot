/**
 * tests/test_stale_reminder_confirmation.js
 * 
 * Validação de confirmação condicional estrita de lembretes:
 * 1. Rejeição de consultas no passado (stale date/time).
 * 2. Rejeição de consultas já canceladas ou com deleted_at preenchido.
 * 3. Identificação e resposta correta para consultas já confirmadas.
 * 4. Confirmação atômica bem-sucedida apenas para consultas válidas e confirmáveis.
 */

require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

async function runTest() {
    console.log('================================================================');
    console.log('🧪 [TEST] Confirmação Condicional Estrita de Lembretes (Stale Appts)');
    console.log('================================================================\n');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
    const clinicId = defaultClinic.id;
    const testPhone = '5511989' + Math.floor(100000 + Math.random() * 900000);

    const cleanups = { patients: [], appointments: [] };

    try {
        console.log(`1. Criando paciente de teste [${testPhone}]...`);
        const patient = await db.patients.findOrCreate(testPhone, clinicId);
        cleanups.patients.push(patient.id);
        await db.patients.updateName(testPhone, 'Paciente Teste Stale', clinicId);

        // ─────────────────────────────────────────────────────────────────
        // CENÁRIO 1: Consulta no passado (Stale Date/Time)
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- CENÁRIO 1: Consulta no Passado (Não confirmável) ---');
        const { data: pastAppt, error: pastErr } = await db.supabase
            .from('appointments')
            .insert({
                patient_id: patient.id,
                clinic_id: clinicId,
                appointment_date: '2020-01-15',
                appointment_time: '10:00',
                type: 'Consulta Antiga',
                status: 'pending'
            })
            .select()
            .single();

        if (pastErr) throw pastErr;
        cleanups.appointments.push(pastAppt.id);

        console.log('   Enviando "Confirmar presença" para consulta do passado...');
        const resPast = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Confirmar presença',
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resPast.text);
        assert(resPast.text.includes('Não localizamos nenhuma consulta pendente') || resPast.text.includes('já passou'), 
            'Deve rejeitar consulta do passado');

        // Confere no banco: DEVE continuar pending, NUNCA confirmed
        const { data: pastDbCheck } = await db.supabase.from('appointments').select('status').eq('id', pastAppt.id).single();
        assert.strictEqual(pastDbCheck.status, 'pending', 'Consulta do passado não pode ter status alterado para confirmed');
        console.log('   ✅ PASS: Consulta do passado não foi confirmada.');

        // ─────────────────────────────────────────────────────────────────
        // CENÁRIO 2: Consulta Cancelada / Deleted_at preenchido
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- CENÁRIO 2: Consulta Já Cancelada ou Excluída ---');
        const { data: cancelledAppt, error: cancErr } = await db.supabase
            .from('appointments')
            .insert({
                patient_id: patient.id,
                clinic_id: clinicId,
                appointment_date: '2028-09-10',
                appointment_time: '14:00',
                type: 'Consulta Cancelada',
                status: 'cancelled'
            })
            .select()
            .single();

        if (cancErr) throw cancErr;
        cleanups.appointments.push(cancelledAppt.id);

        console.log('   Tentando confirmar consulta cancelada via ID direto...');
        const resCanc = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Consulta 1',
            buttonId: `reminder_confirm:${cancelledAppt.id}`,
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resCanc.text);
        assert(resCanc.text.includes('cancelada'), 'Deve informar que a consulta consta como cancelada');

        const { data: cancDbCheck } = await db.supabase.from('appointments').select('status').eq('id', cancelledAppt.id).single();
        assert.strictEqual(cancDbCheck.status, 'cancelled', 'Status deve continuar cancelled');
        console.log('   ✅ PASS: Tentativa de confirmação de consulta cancelada foi barrada e informada.');

        // ─────────────────────────────────────────────────────────────────
        // CENÁRIO 3: Consulta Já Confirmada
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- CENÁRIO 3: Consulta Já Confirmada ---');
        const { data: alreadyConfirmedAppt, error: confErr } = await db.supabase
            .from('appointments')
            .insert({
                patient_id: patient.id,
                clinic_id: clinicId,
                appointment_date: '2028-09-15',
                appointment_time: '16:00',
                type: 'Consulta Já Confirmada',
                status: 'confirmed'
            })
            .select()
            .single();

        if (confErr) throw confErr;
        cleanups.appointments.push(alreadyConfirmedAppt.id);

        console.log('   Enviando "Confirmar presença" com consulta já confirmada...');
        const resAlready = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Confirmar presença',
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resAlready.text);
        assert(resAlready.text.includes('já está confirmada') || resAlready.text.includes('já foi confirmada'), 
            'Deve informar que a consulta já está confirmada');
        console.log('   ✅ PASS: Consulta já confirmada tratada com mensagem de estado atual.');

        // ─────────────────────────────────────────────────────────────────
        // CENÁRIO 4: Consulta Válida Futura (Confirmação Atômica)
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- CENÁRIO 4: Consulta Válida Futura ---');
        const validAppt = await calendarService.scheduleAppointment({
            phone: testPhone,
            name: 'Paciente Teste Stale',
            clinicId,
            date: '2028-09-20',
            time: '11:00',
            type: 'Consulta Válida'
        });
        cleanups.appointments.push(validAppt.id);

        console.log('   Enviando "Confirmar presença" para consulta válida...');
        const resValid = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Confirmar presença',
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resValid.text);
        assert(resValid.text.includes('confirmada com sucesso'), 'Deve confirmar consulta válida com sucesso');

        const { data: validDbCheck } = await db.supabase.from('appointments').select('status').eq('id', validAppt.id).single();
        assert.strictEqual(validDbCheck.status, 'confirmed', 'Consulta válida deve estar com status confirmed');
        console.log('   ✅ PASS: Consulta futura confirmada atomicamente com sucesso!');

        console.log('\n================================================================');
        console.log('🎉 TODOS OS TESTES DE CONFIRMAÇÃO CONDICIONAL PASSARAM!');
        console.log('================================================================\n');

    } finally {
        console.log('🧹 Limpando dados de teste...');
        if (cleanups.appointments.length > 0) {
            await db.supabase.from('appointments').delete().in('id', cleanups.appointments);
        }
        if (cleanups.patients.length > 0) {
            await db.supabase.from('patients').delete().in('id', cleanups.patients);
        }
        await db.sessions.delete(testPhone, clinicId);
        console.log('✨ Cleanup finalizado.');
    }
}

runTest().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
