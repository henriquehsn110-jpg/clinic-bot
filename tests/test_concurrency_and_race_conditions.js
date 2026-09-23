/**
 * tests/test_concurrency_and_race_conditions.js
 * 
 * Validação de concorrência e race condition de agendamento de slots:
 * - Dois pacientes distintos disputam o mesmo slot (mesmo médico, mesma data e hora) simultaneamente.
 * - Utiliza Promise.allSettled para disparar requisições em paralelo.
 * - Valida que exatamente 1 agendamento tem sucesso e o outro é rejeitado com SLOT_OCCUPIED.
 * - Valida integridade no banco de dados (exatamente 1 registro persistido).
 */

require('dotenv').config();
const assert = require('assert');
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

const RACE_DATE = '2028-11-20';
const RACE_TIME = '14:30';

async function runTest() {
    console.log('================================================================');
    console.log('🧪 [TEST] Concorrência Real: Disputa de Slot com Promise.all');
    console.log('================================================================\n');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
    const clinicId = defaultClinic.id;

    // Busca um médico da clínica
    const doctors = await db.doctors.findByClinic(clinicId);
    let targetDoctorId = null;
    if (doctors && doctors.length > 0) {
        targetDoctorId = doctors[0].id;
        console.log(`👨‍⚕️ Médico selecionado para o teste: ${doctors[0].name} (${targetDoctorId})`);
    } else {
        console.log('⚠️ Nenhum médico cadastrado na clínica, teste rodará sem doctorId específico.');
    }

    const phoneA = '5511991' + Math.floor(100000 + Math.random() * 900000);
    const phoneB = '5511992' + Math.floor(100000 + Math.random() * 900000);

    const cleanups = { patients: [], appointments: [] };

    try {
        console.log(`1. Criando Paciente A [${phoneA}] e Paciente B [${phoneB}]...`);
        const patientA = await db.patients.findOrCreate(phoneA, clinicId);
        cleanups.patients.push(patientA.id);
        await db.patients.updateName(phoneA, 'Paciente Concorrente A', clinicId);

        const patientB = await db.patients.findOrCreate(phoneB, clinicId);
        cleanups.patients.push(patientB.id);
        await db.patients.updateName(phoneB, 'Paciente Concorrente B', clinicId);

        console.log(`\n2. Disparando agendamento simultâneo para o slot [${RACE_DATE} ${RACE_TIME}] via Promise.allSettled...`);
        
        const [resultA, resultB] = await Promise.allSettled([
            calendarService.scheduleAppointment({
                phone: phoneA,
                name: 'Paciente Concorrente A',
                clinicId,
                doctorId: targetDoctorId,
                date: RACE_DATE,
                time: RACE_TIME,
                type: 'Consulta Concorrente A'
            }),
            calendarService.scheduleAppointment({
                phone: phoneB,
                name: 'Paciente Concorrente B',
                clinicId,
                doctorId: targetDoctorId,
                date: RACE_DATE,
                time: RACE_TIME,
                type: 'Consulta Concorrente B'
            })
        ]);

        console.log('\n3. Resultados da disputa:');
        console.log('   - Resultado Paciente A:', resultA.status, resultA.status === 'fulfilled' ? `(ID: ${resultA.value.id})` : `(Erro: ${resultA.reason?.message || resultA.reason?.code})`);
        console.log('   - Resultado Paciente B:', resultB.status, resultB.status === 'fulfilled' ? `(ID: ${resultB.value.id})` : `(Erro: ${resultB.reason?.message || resultB.reason?.code})`);

        if (resultA.status === 'fulfilled') cleanups.appointments.push(resultA.value.id);
        if (resultB.status === 'fulfilled') cleanups.appointments.push(resultB.value.id);

        // Exatamente um deve ter sucesso e exatamente um deve ser rejeitado
        const fulfilledCount = (resultA.status === 'fulfilled' ? 1 : 0) + (resultB.status === 'fulfilled' ? 1 : 0);
        const rejectedCount = (resultA.status === 'rejected' ? 1 : 0) + (resultB.status === 'rejected' ? 1 : 0);

        assert.strictEqual(fulfilledCount, 1, 'Exatamente 1 agendamento deve ter sucesso');
        assert.strictEqual(rejectedCount, 1, 'Exatamente 1 agendamento deve ser rejeitado');

        const rejectedResult = resultA.status === 'rejected' ? resultA : resultB;
        const isSlotOccupied = rejectedResult.reason?.message === 'SLOT_OCCUPIED' || 
                               rejectedResult.reason?.code === 'SLOT_OCCUPIED' ||
                               rejectedResult.reason?.code === '23505' ||
                               rejectedResult.reason?.message?.includes('SLOT_OCCUPIED');

        assert(isSlotOccupied, `A requisição rejeitada deve falhar por SLOT_OCCUPIED. Motivo recebido: ${rejectedResult.reason?.message}`);
        console.log('   ✅ PASS: Exatamente 1 obteve sucesso e o concorrente foi rejeitado por SLOT_OCCUPIED.');

        // 4. Validação no Banco de Dados
        console.log('\n4. Verificando integridade no Supabase...');
        let query = db.supabase
            .from('appointments')
            .select('id, patient_id, appointment_date, appointment_time, doctor_id, status')
            .eq('clinic_id', clinicId)
            .eq('appointment_date', RACE_DATE)
            .eq('appointment_time', RACE_TIME)
            .is('deleted_at', null)
            .in('status', ['pending', 'confirmed']);

        if (targetDoctorId) {
            query = query.eq('doctor_id', targetDoctorId);
        }

        const { data: dbRecords, error: dbErr } = await query;
        if (dbErr) throw dbErr;

        console.log(`   Registros encontrados no banco para o slot: ${dbRecords.length}`);
        assert.strictEqual(dbRecords.length, 1, 'Deve existir exatamente 1 registro ativo no banco para o slot');
        console.log('   ✅ PASS: Integridade garantida! Zero overbooking no banco de dados.');

        console.log('\n================================================================');
        console.log('🎉 TESTE DE CONCORRÊNCIA E RACE CONDITIONS PASSOU COM SUCESSO!');
        console.log('================================================================\n');

    } finally {
        console.log('🧹 Limpando dados de teste...');
        if (cleanups.appointments.length > 0) {
            await db.supabase.from('appointments').delete().in('id', cleanups.appointments);
        }
        if (cleanups.patients.length > 0) {
            await db.supabase.from('patients').delete().in('id', cleanups.patients);
        }
        await db.sessions.delete(phoneA, clinicId);
        await db.sessions.delete(phoneB, clinicId);
        console.log('✨ Cleanup finalizado.');
    }
}

runTest().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
