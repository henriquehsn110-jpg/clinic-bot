/**
 * tests/test_multi_doctor_slots_and_concurrency.js
 * 
 * Validação rigorosa de slots multi-médico e constraints físicas no banco:
 * 1. Prova que Dr. A e Dr. B podem atender no mesmo horário (sem colisão).
 *    FALHA IMEDIATAMENTE se a constraint legada uq_appointments_clinic_active_slot estiver presente.
 * 2. Prova que o mesmo médico NÃO pode ter duas consultas ativas no mesmo horário.
 * 3. Prova que "qualquer médico" (doctor_id nulo/omitido) é resolvido para um doctor_id concreto antes do INSERT.
 * 4. Prova que o agendamento persistido no banco nunca fica com doctor_id NULL.
 * 5. Consulta e exibe a definição do índice/constraint instalado no Supabase.
 */

require('dotenv').config();
const assert = require('assert');
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

const TEST_DATE = '2028-03-10'; // Sexta-feira
const TIME_1 = '14:00';

async function runTest() {
    console.log('================================================================');
    console.log('🧪 [TEST] Multi-Médico: Validação Física de Constraint e Slots');
    console.log('================================================================\n');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
    const clinicId = defaultClinic.id;
    console.log(`🏥 Clínica: ${defaultClinic.name} (${clinicId})\n`);

    const doctors = await db.doctors.findByClinic(clinicId);
    console.log(`👨‍⚕️ Médicos ativos encontrados: ${doctors.length}`);
    doctors.forEach(d => console.log(`   - ${d.name} (${d.id})`));

    assert(doctors.length >= 2, 'O teste requer pelo menos 2 médicos ativos na clínica');
    const docA = doctors[0];
    const docB = doctors[1];

    const cleanups = { patients: [], appointments: [] };

    try {
        // Limpeza preventiva da data de teste
        const { data: existingAppts } = await db.supabase
            .from('appointments')
            .select('id')
            .eq('clinic_id', clinicId)
            .eq('appointment_date', TEST_DATE);

        if (existingAppts && existingAppts.length > 0) {
            for (const a of existingAppts) {
                await db.supabase.from('appointments').delete().eq('id', a.id);
            }
        }

        // ── 1. Prova no banco: Dr. A e Dr. B atendendo no mesmo horário ───────
        console.log('\n--- 1. Prova: Dois médicos distintos no mesmo horário ---');
        const phoneA = '551199' + Math.floor(1000000 + Math.random() * 9000000);
        const pA = await db.patients.findOrCreate(phoneA, clinicId);
        cleanups.patients.push(pA.id);

        console.log(`   Agendando Doc A (${docA.name}) para ${TEST_DATE} às ${TIME_1}...`);
        const apptA = await calendarService.scheduleAppointment({
            phone: phoneA,
            name: 'Paciente Teste Doc A',
            clinicId,
            doctorId: docA.id,
            date: TEST_DATE,
            time: TIME_1,
            type: 'Consulta geral'
        });
        cleanups.appointments.push(apptA.id);
        console.log(`   ✅ Consulta Doc A criada com sucesso: ID=${apptA.id}`);

        const phoneB = '551198' + Math.floor(1000000 + Math.random() * 9000000);
        const pB = await db.patients.findOrCreate(phoneB, clinicId);
        cleanups.patients.push(pB.id);

        console.log(`   Agendando Doc B (${docB.name}) para O MESMO horário ${TEST_DATE} às ${TIME_1}...`);
        // Esta chamada DEVE ter sucesso se a constraint multi-médico estiver ativa.
        // Se falhar com uq_appointments_clinic_active_slot, o teste FALHA expressamente!
        const apptB = await calendarService.scheduleAppointment({
            phone: phoneB,
            name: 'Paciente Teste Doc B',
            clinicId,
            doctorId: docB.id,
            date: TEST_DATE,
            time: TIME_1,
            type: 'Consulta geral'
        });
        cleanups.appointments.push(apptB.id);
        console.log(`   ✅ Consulta Doc B criada com sucesso no mesmo horário: ID=${apptB.id}`);

        assert(apptA.id && apptB.id, 'Ambos os agendamentos devem coexistir no banco no mesmo horário');
        console.log('   ✅ PASS (a): Dr. A e Dr. B podem atender no mesmo horário simultaneamente.');

        // ── 2. Prova no banco: O mesmo médico NÃO pode ter 2 consultas no mesmo horário
        console.log('\n--- 2. Prova: Mesmo médico não pode ter 2 consultas no mesmo horário ---');
        const phoneDup = '551197' + Math.floor(1000000 + Math.random() * 9000000);
        const pDup = await db.patients.findOrCreate(phoneDup, clinicId);
        cleanups.patients.push(pDup.id);

        let dupBlocked = false;
        try {
            const apptDup = await calendarService.scheduleAppointment({
                phone: phoneDup,
                name: 'Paciente Teste Colisão',
                clinicId,
                doctorId: docA.id, // Mesmo Doc A que já está ocupado em TIME_1!
                date: TEST_DATE,
                time: TIME_1,
                type: 'Consulta geral'
            });
            cleanups.appointments.push(apptDup.id);
        } catch (err) {
            dupBlocked = true;
            console.log(`   Bloqueio confirmado como esperado: ${err.message || err.code}`);
            assert(err.message === 'SLOT_OCCUPIED' || err.code === 'SLOT_OCCUPIED' || err.code === '23505', 
                'Erro deve indicar conflito de slot ocupado');
        }
        assert.strictEqual(dupBlocked, true, 'Agendamento duplicado para o mesmo médico DEVE ser bloqueado');
        console.log('   ✅ PASS (b): Mesmo médico não pode ter dois agendamentos ativos no mesmo horário.');

        // ── 3. Prova: "Qualquer médico" resolvido para doctor_id concreto antes do INSERT
        console.log('\n--- 3. Prova: "Qualquer médico" resolvido para doctor_id concreto ---');
        const phoneAny = '551196' + Math.floor(1000000 + Math.random() * 9000000);
        const pAny = await db.patients.findOrCreate(phoneAny, clinicId);
        cleanups.patients.push(pAny.id);

        const TIME_FREE = '16:00';
        console.log(`   Agendando com doctorId = null em ${TEST_DATE} às ${TIME_FREE}...`);
        const apptAny = await calendarService.scheduleAppointment({
            phone: phoneAny,
            name: 'Paciente Teste Qualquer Médico',
            clinicId,
            doctorId: null, // "Qualquer médico"
            date: TEST_DATE,
            time: TIME_FREE,
            type: 'Consulta geral'
        });
        cleanups.appointments.push(apptAny.id);

        console.log(`   Agendamento criado com doctor_id: ${apptAny.doctor_id}`);
        assert(apptAny.doctor_id !== null && apptAny.doctor_id !== undefined, 
            'doctor_id DEVE ser resolvido para um valor concreto antes do INSERT');
        const isDocFromClinic = doctors.some(d => d.id === apptAny.doctor_id);
        assert(isDocFromClinic, 'O doctor_id atribuído deve pertencer a um médico ativo da clínica');
        console.log('   ✅ PASS (c): "Qualquer médico" é resolvido para um doctor_id concreto antes do INSERT.');

        // ── 4. Prova: O agendamento persistido nunca fica com doctor_id NULL no banco
        console.log('\n--- 4. Prova: Registro no Supabase não possui doctor_id NULL ---');
        const { data: dbRecord, error: dbErr } = await db.supabase
            .from('appointments')
            .select('id, doctor_id, clinic_id, appointment_date, appointment_time, status')
            .eq('id', apptAny.id)
            .single();

        if (dbErr) throw dbErr;
        assert.strictEqual(dbRecord.id, apptAny.id);
        assert(dbRecord.doctor_id !== null, 'doctor_id persistido no banco NÃO pode ser NULL');
        console.log(`   Registro persistido no banco: ID=${dbRecord.id}, doctor_id=${dbRecord.doctor_id}`);
        console.log('   ✅ PASS (d): O appointment persistido nunca fica com doctor_id NULL.');

        // ── 5. Inspeção do índice ativo no Supabase ─────────────────────────
        console.log('\n--- 5. Definição do Índice/Constraint Instalado no Supabase ---');
        const { data: indexData, error: indexErr } = await db.supabase.rpc('check_active_slot_indexes');
        if (!indexErr && indexData) {
            console.log('   Índices retornados pela função check_active_slot_indexes():');
            indexData.forEach(idx => {
                console.log(`   - ${idx.indexname}: ${idx.indexdef}`);
            });
        } else {
            console.log('   (check_active_slot_indexes RPC não disponível ou não instalado no banco)');
        }

        console.log('\n================================================================');
        console.log('🎉 TODOS OS TESTES FÍSICOS MULTI-MÉDICO PASSARAM COM SUCESSO!');
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
    console.error('\n❌ ERRO NO TESTE:', err.message || err);
    process.exit(1);
});
