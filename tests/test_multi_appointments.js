require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function testMultipleAppointmentsScenario() {
    console.log('🧪 Iniciando Teste de Múltiplas Consultas Agendadas...');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194'; // Clínica Modelo
    const testPhone = '5511999887766';

    // 1. Cria ou recupera paciente de teste
    const patient = await db.patients.findOrCreate(testPhone, clinicId);
    assert(patient && patient.id, 'Paciente de teste deve ser criado');

    // 2. Limpa agendamentos anteriores do telefone de teste se houver
    const oldAppts = await db.appointments.findByPatient(patient.id, clinicId).catch(() => []);
    for (const a of oldAppts) {
        if (a.status !== 'cancelled') {
            await db.appointments.updateStatus(a.id, 'cancelled', clinicId);
        }
    }

    // 3. Cria 2 consultas ativas para este paciente em datas diferentes
    const appt1 = await db.appointments.create({
        clinic_id: clinicId,
        patient_id: patient.id,
        appointment_date: '2026-08-10',
        appointment_time: '10:00',
        type: 'Limpeza Dental',
        status: 'confirmed'
    });

    const appt2 = await db.appointments.create({
        clinic_id: clinicId,
        patient_id: patient.id,
        appointment_date: '2026-08-15',
        appointment_time: '14:30',
        type: 'Consulta Geral',
        status: 'confirmed'
    });

    console.log(`  ✅ Criadas 2 consultas ativas no banco: ID1=${appt1.id}, ID2=${appt2.id}`);

    // 4. Simula o paciente enviando a mensagem: "quais consultas eu tenho agendadas?"
    const result = await conversationController.handleIncomingMessage(
        testPhone,
        "Quais consultas eu tenho agendadas?",
        true, // isSimulation
        clinicId
    );

    console.log('  💬 Resposta da IA Ana:');
    console.log('  -----------------------------------');
    console.log(result.text);
    console.log('  -----------------------------------');

    // 5. Asserções de Validação: A resposta DEVE citar ambas as datas e procedimentos!
    assert(result.text.includes('10/08/2026') || result.text.includes('Limpeza'), 'Deve citar a 1ª consulta (10/08)');
    assert(result.text.includes('15/08/2026') || result.text.includes('Geral'), 'Deve citar a 2ª consulta (15/08)');
    
    console.log('  🎉 TESTE DE MÚLTIPLAS CONSULTAS APROVADO COM SUCESSO! 🚀');

    // Limpeza final
    await db.appointments.updateStatus(appt1.id, 'cancelled', clinicId);
    await db.appointments.updateStatus(appt2.id, 'cancelled', clinicId);
}

testMultipleAppointmentsScenario().catch(err => {
    console.error('❌ FALA NO TESTE DE MÚLTIPLAS CONSULTAS:', err);
    process.exit(1);
});
