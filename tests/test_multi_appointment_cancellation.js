require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runMultiApptCancelTest() {
    console.log('🧪 Iniciando Teste de Cancelamento de Múltiplas Consultas...');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194'; // Clínica Modelo
    const testPhone = '5511988889999';

    // 1. Cria ou recupera paciente de teste
    const patient = await db.patients.findOrCreate(testPhone, clinicId);
    assert(patient && patient.id, 'Paciente de teste deve ser criado');

    // 2. Limpa agendamentos anteriores do paciente
    const oldAppts = await db.appointments.findByPatient(patient.id, clinicId).catch(() => []);
    for (const a of oldAppts) {
        if (a.status !== 'cancelled') {
            await db.appointments.updateStatus(a.id, 'cancelled', clinicId);
        }
    }

    // 3. Cria 1 consulta no passado (ontem) e 2 consultas futuras (amanhã e depois de amanhã)
    const nowBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const tomorrow = new Date(nowBRT);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(nowBRT);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const yesterday = new Date(nowBRT);
    yesterday.setDate(yesterday.getDate() - 1);

    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const pastAppt = await db.appointments.create({
        clinic_id: clinicId,
        patient_id: patient.id,
        appointment_date: '2026-01-10',
        appointment_time: '09:15',
        type: 'Consulta Geral Passada',
        status: 'confirmed'
    });

    const futureAppt1 = await db.appointments.create({
        clinic_id: clinicId,
        patient_id: patient.id,
        appointment_date: '2026-11-25',
        appointment_time: '11:45',
        type: 'Limpeza Futura 1',
        status: 'confirmed'
    });

    const futureAppt2 = await db.appointments.create({
        clinic_id: clinicId,
        patient_id: patient.id,
        appointment_date: '2026-11-26',
        appointment_time: '15:15',
        type: 'Clareamento Futuro 2',
        status: 'confirmed'
    });

    console.log(`  ✅ Criadas 3 consultas: 1 passada (${pastAppt.id}) e 2 futuras (${futureAppt1.id}, ${futureAppt2.id})`);

    // Initialize session with greeting
    await conversationController.handleIncomingMessage(testPhone, "Olá", true, clinicId);

    // 4. Teste 1: Paciente envia "Quais consultas eu tenho agendadas?"
    const res1 = await conversationController.handleIncomingMessage(testPhone, "Quais consultas eu tenho agendadas?", true, clinicId);
    console.log('  💬 Resposta da lista de consultas:');
    console.log('  -----------------------------------');
    console.log(res1.text);
    console.log('  -----------------------------------');

    // Asserção: NÃO deve incluir a consulta passada de ontem!
    assert(!res1.text.includes('Consulta Geral Passada') && !res1.text.includes('10/01/2026'), 'Consulta passada de ontem NÃO pode aparecer na lista de consultas ativas');
    assert(res1.text.includes('Limpeza'), 'Deve listar a 1ª consulta futura');
    assert(res1.text.includes('Clareamento'), 'Deve listar a 2ª consulta futura');
    console.log('  ✅ [Teste 1 PASSOU]: Consultas passadas ignoradas com sucesso!');

    // 5. Teste 2: Paciente solicita cancelamento
    const res2 = await conversationController.handleIncomingMessage(testPhone, "Quero cancelar", true, clinicId);
    console.log('  💬 Resposta ao pedir cancelamento:');
    console.log('  -----------------------------------');
    console.log(res2.text);
    console.log('  -----------------------------------');
    assert(res2.buttons.includes('Opção 1'), 'Deve exibir botão para Opção 1');
    assert(res2.buttons.includes('Opção 2'), 'Deve exibir botão para Opção 2');
    console.log('  ✅ [Teste 2 PASSOU]: Botões de seleção por opção exibidos corretamente!');

    // 6. Teste 3: Paciente escolhe "Opção 1"
    const res3 = await conversationController.handleIncomingMessage(testPhone, "Opção 1", true, clinicId);
    console.log('  💬 Resposta após selecionar Opção 1:');
    console.log('  -----------------------------------');
    console.log(res3.text);
    console.log('  -----------------------------------');
    assert(res3.text.includes('Clareamento Futuro 2') && res3.text.includes('cancelada com sucesso'), 'Deve confirmar o cancelamento da Opção 1');
    assert(res3.text.includes('Limpeza Futura 1'), 'Deve avisar que a consulta #2 continua confirmada');

    // 7. Verifica no banco de dados se a consulta escolhida (Clareamento Futuro 2) foi cancelada e a outra (Limpeza Futura 1) permanece confirmada
    const checkAppts = await db.appointments.findByPatient(patient.id, clinicId);
    const updated1 = checkAppts.find(a => a.id === futureAppt1.id);
    const updated2 = checkAppts.find(a => a.id === futureAppt2.id);

    assert.strictEqual(updated2.status, 'cancelled', 'FutureAppt2 (Opção 1) deve estar cancelada');
    // 8. Teste 4: Teste de Seleção Múltipla simultânea ("1 e 2")
    const futureAppt3 = await db.appointments.create({
        clinic_id: clinicId, patient_id: patient.id, appointment_date: '2026-12-01', appointment_time: '10:00', type: 'Consulta A', status: 'confirmed'
    });
    const futureAppt4 = await db.appointments.create({
        clinic_id: clinicId, patient_id: patient.id, appointment_date: '2026-12-02', appointment_time: '11:00', type: 'Consulta B', status: 'confirmed'
    });

    await conversationController.handleIncomingMessage(testPhone, "Quero cancelar", true, clinicId);
    const resMulti = await conversationController.handleIncomingMessage(testPhone, "1 e 2", true, clinicId);
    console.log('  💬 Resposta após enviar "1 e 2":');
    console.log('  -----------------------------------');
    console.log(resMulti.text);
    console.log('  -----------------------------------');
    assert(resMulti.text.includes('Suas 2 consultas foram canceladas com sucesso'), 'Deve confirmar cancelamento duplo de 1 e 2');

    console.log('  🎉 TESTE DE CANCELAMENTO INTERATIVO MULTI-CONSULTAS 100% APROVADO! 🚀');

    // Limpeza final
    await db.appointments.updateStatus(futureAppt2.id, 'cancelled', clinicId);
    await db.appointments.updateStatus(futureAppt3.id, 'cancelled', clinicId);
    await db.appointments.updateStatus(futureAppt4.id, 'cancelled', clinicId);
}

runMultiApptCancelTest().catch(err => {
    console.error('❌ FALHA NO TESTE DE CANCELAMENTO MULTI-CONSULTAS:', err);
    process.exit(1);
});
