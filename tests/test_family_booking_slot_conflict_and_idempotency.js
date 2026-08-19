/**
 * tests/test_family_booking_slot_conflict_and_idempotency.js
 * 
 * Validação de:
 * 1. Ocupação de horários entre médico nulo e médico específico (getAvailableSlots).
 * 2. Prevenção de falso positivo de idempotência entre titular e dependente no mesmo slot.
 * 3. Idempotência real: reentrega da confirmação pelo mesmo paciente/dependente.
 */

require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    let d2 = [...n, d1].reduce((total, num, i) => total + num * (11 - i), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    return `${n.slice(0,3).join('')}.${n.slice(3,6).join('')}.${n.slice(6,9).join('')}-${d1}${d2}`;
}

const TEST_PHONE = '5511995' + Math.floor(100000 + Math.random() * 900000);
const TITULAR_NAME = 'Henrique Silva do Nascimento';
const TITULAR_CPF = generateValidCpf();

const DEPENDENT_NAME = 'Raquel Pereira da Silva';
const DEPENDENT_CPF = generateValidCpf();

const TEST_DATE = '2027-09-15';
const TEST_TIME_CONFLICT = '08:00';
const TEST_TIME_VALID = '10:00';

async function runTest() {
    console.log('================================================================');
    console.log('🧪 [TEST] Conflito de Slot Médico Nulo vs Específico & Idempotência de Dependentes');
    console.log('================================================================\n');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
    const clinicId = defaultClinic.id;
    console.log(`🏥 Clínica: ${defaultClinic.name} (${clinicId})\n`);

    const createdCleanups = { patients: [], appointments: [] };

    try {
        // ── 0. Limpeza preventiva de dados de teste ──────────────────────────
        const existingTitularCpf = await db.patients.findByCpf(TITULAR_CPF, clinicId).catch(() => null);
        if (existingTitularCpf) {
            await db.supabase.from('appointments').delete().eq('patient_id', existingTitularCpf.id);
            await db.supabase.from('patients').delete().eq('id', existingTitularCpf.id);
        }
        const existingDepCpf = await db.patients.findByCpf(DEPENDENT_CPF, clinicId).catch(() => null);
        if (existingDepCpf) {
            await db.supabase.from('appointments').delete().eq('patient_id', existingDepCpf.id);
            await db.supabase.from('patients').delete().eq('id', existingDepCpf.id);
        }

        // ── 1. Setup: Criar Titular e Consulta no Horário de Conflito ─────────
        console.log('1. Criando paciente titular e consulta em 2027-09-15 08:00 (doctor_id: null)...');
        const titular = await db.patients.findOrCreate(TEST_PHONE, clinicId);
        createdCleanups.patients.push(titular.id);
        await db.patients.updateName(TEST_PHONE, TITULAR_NAME, clinicId);
        await db.patients.updateCpf(TEST_PHONE, TITULAR_CPF, clinicId);

        const titularAppt = await db.appointments.create({
            patient_id: titular.id,
            clinic_id: clinicId,
            doctor_id: null,
            appointment_date: TEST_DATE,
            appointment_time: TEST_TIME_CONFLICT,
            type: 'Consulta geral'
        });
        createdCleanups.appointments.push(titularAppt.id);
        console.log(`   ✅ Consulta do Titular criada: ID=${titularAppt.id} [${TEST_DATE} ${TEST_TIME_CONFLICT}] (doctor_id: null)`);

        // ── 2. Cenário 1: getAvailableSlots para Dra. Juliana Mendes no mesmo dia
        console.log('\n2. Verificando getAvailableSlots para Dra. Juliana Mendes em 2027-09-15...');
        const docJulianaId = 'be0fbdfa-49d2-4a64-84ba-ab57e205f89e';
        const availableSlots = await calendarService.getAvailableSlots(TEST_DATE, clinicId, docJulianaId, 'Consulta geral');
        console.log(`   - Vagas retornadas para Dra. Juliana:`, availableSlots.slice(0, 6));

        assert(!availableSlots.includes(TEST_TIME_CONFLICT), `O horário ocupado ${TEST_TIME_CONFLICT} NÃO deve aparecer nas vagas livres da Dra. Juliana`);
        console.log(`   ✅ PASS: Horário ${TEST_TIME_CONFLICT} devidamente filtrado da grade da Dra. Juliana Mendes!`);

        // ── 3. Cenário 2: Dependente tenta confirmar no horário ocupado pelo titular
        console.log('\n3. Dependente tenta confirmar consulta no horário ocupado (2027-09-15 08:00)...');
        await db.sessions.setDraft(TEST_PHONE, {
            type: 'Consulta geral',
            date: TEST_DATE,
            time: TEST_TIME_CONFLICT,
            doctor_id: docJulianaId,
            is_family_booking: true,
            dependentName: DEPENDENT_NAME,
            dependentCpf: DEPENDENT_CPF
        }, clinicId);

        const resConflict = await conversationController.handleIncomingMessage({
            phone: TEST_PHONE,
            text: 'Confirmar',
            isSimulation: true,
            clinicId: clinicId
        });

        console.log('   - Resposta do bot ao conflito:', resConflict.text);
        console.log('   - showCalendar retornado:', resConflict.showCalendar);
        assert.strictEqual(resConflict.showCalendar, true, 'Deve reabrir o calendário em caso de conflito');
        assert(resConflict.text.includes('preenchido por outro paciente'), 'Deve alertar que o horário está ocupado');

        // Confirma que NÃO criou consulta duplicada para o dependente no slot ocupado
        const apptsConflictSlot = await db.supabase
            .from('appointments')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('appointment_date', TEST_DATE)
            .in('appointment_time', [`${TEST_TIME_CONFLICT}:00`, TEST_TIME_CONFLICT]);

        console.log(`   - Total de agendamentos no banco em ${TEST_TIME_CONFLICT}:`, apptsConflictSlot.data?.length);
        assert.strictEqual(apptsConflictSlot.data?.length, 1, 'Deve existir apenas 1 agendamento (do titular) no slot');
        console.log('   ✅ PASS: Conflito bloqueado com sucesso sem duplicatas!');

        // ── 4. Cenário 3: Dependente agenda em horário livre (2027-09-15 10:00)
        console.log('\n4. Dependente agenda em horário livre (2027-09-15 10:00)...');
        await db.sessions.setDraft(TEST_PHONE, {
            type: 'Consulta geral',
            date: TEST_DATE,
            time: TEST_TIME_VALID,
            doctor_id: docJulianaId,
            is_family_booking: true,
            dependentName: DEPENDENT_NAME,
            dependentCpf: DEPENDENT_CPF
        }, clinicId);

        const resValid = await conversationController.handleIncomingMessage({
            phone: TEST_PHONE,
            text: 'Confirmar',
            isSimulation: true,
            clinicId: clinicId
        });

        console.log('   - Resposta do bot:', resValid.text);
        assert(resValid.text.includes('Agendamento confirmado'), 'Deve confirmar agendamento');

        // Busca a consulta criada para o dependente
        const dependents = await db.patients.findDependentsByGuardian(titular.id, clinicId);
        assert.strictEqual(dependents.length, 1, 'Deve existir 1 dependente cadastrado');
        const dependent = dependents[0];
        createdCleanups.patients.push(dependent.id);

        const depAppts = await db.appointments.findByPatient(dependent.id, clinicId);
        assert.strictEqual(depAppts.length, 1, 'Dependente deve ter 1 consulta criada');
        const depAppt = depAppts[0];
        createdCleanups.appointments.push(depAppt.id);

        assert.strictEqual(depAppt.patient_id, dependent.id, 'patient_id deve ser do dependente, NÃO do titular');
        assert.strictEqual(depAppt.appointment_time.substring(0, 5), TEST_TIME_VALID);
        console.log(`   ✅ PASS: Consulta do dependente criada com sucesso no ID ${depAppt.id}!`);

        // ── 5. Cenário 4: Idempotência real — Reentrega da confirmação pelo dependente
        console.log('\n5. Testando idempotência real (reentrega do mesmo agendamento pelo dependente)...');
        const replayedAppt = await calendarService.scheduleAppointment({
            clinicId,
            phone: TEST_PHONE,
            is_family_booking: true,
            dependentName: DEPENDENT_NAME,
            dependentCpf: DEPENDENT_CPF,
            dependent_id: dependent.id,
            date: TEST_DATE,
            time: TEST_TIME_VALID,
            type: 'Consulta geral',
            doctor_id: docJulianaId
        });

        console.log(`   - ID retornado na reentrega: ${replayedAppt.id}`);
        assert.strictEqual(replayedAppt.id, depAppt.id, 'Idempotência deve retornar o mesmo ID de agendamento sem erro');
        console.log('   ✅ PASS: Idempotência real do dependente validada com sucesso!');

        console.log('\n================================================================');
        console.log('🎉 [PASS] Bateria completa de testes de idempotência e conflitos APROVADA!');
        console.log('================================================================\n');

    } finally {
        console.log('🧹 Limpando dados de teste...');
        for (const apptId of createdCleanups.appointments) {
            try { await db.supabase.from('appointments').delete().eq('id', apptId); } catch (_) {}
        }
        for (const patId of createdCleanups.patients) {
            try { await db.supabase.from('patients').delete().eq('id', patId); } catch (_) {}
        }
        await db.sessions.set(TEST_PHONE, [], clinicId).catch(() => {});
        await db.sessions.setDraft(TEST_PHONE, null, clinicId).catch(() => {});
        console.log('✅ Base limpa.');
    }
}

runTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
