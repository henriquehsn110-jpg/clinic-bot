require('dotenv').config();
const assert = require('assert');
const db = require('../services/databaseService');
const conversationController = require('../controllers/conversationController');

async function runTest() {
    console.log('🧪 Iniciando Teste de Verificação do Nome do Médico nas Consultas...');

    const testPhone = '5511979992719';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // 1. Busca e atualiza paciente com nome e CPF para simular paciente cadastrado
    const patient = await db.patients.findOrCreate(testPhone, clinicId);
    await db.patients.updateName(testPhone, 'Henrique Silva', clinicId);
    await db.patients.updateCpf(testPhone, '12345678900', clinicId).catch(() => {});

    // 2. Limpa o rascunho e inicia sessão com 1 turno prévio
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [
        { role: 'user', parts: [{ text: 'Olá' }] },
        { role: 'model', parts: [{ text: 'Olá Henrique! Como posso ajudar você hoje?' }] }
    ], clinicId);

    // 3. Busca consultas ativas do paciente para verificação
    const appts = await db.appointments.findByPatient(patient.id, clinicId);
    console.log(`✅ ${appts.length} agendamentos encontrados no banco de dados.`);

    const apptWithDoctor = appts.find(a => a.doctors?.name || a.doctor_name);
    console.log('Exemplo de agendamento no banco com médico:', {
        id: apptWithDoctor?.id,
        type: apptWithDoctor?.type,
        date: apptWithDoctor?.appointment_date,
        time: apptWithDoctor?.appointment_time,
        doctor: apptWithDoctor?.doctors?.name || apptWithDoctor?.doctor_name
    });

    // 4. Pergunta à IA o nome do médico da consulta agendada (isSimulation = false)
    const response = await conversationController.handleIncomingMessage(
        testPhone,
        'Qual é o nome do médico da minha consulta agendada?',
        false,
        clinicId
    );

    console.log('\n🤖 Resposta gerada pela IA:');
    console.log(response.text);

    // 5. Validações estritas
    assert(!response.text.includes('Profissional da Clínica'), 'NÃO deve usar a string genérica Profissional da Clínica quando o médico existe no banco');
    const hasDoctorName = /Juliana|Carlos|Roberto|Dr/i.test(response.text);
    assert(hasDoctorName, `A resposta DEVE conter o nome do médico do agendamento. Resposta recebida: "${response.text}"`);

    console.log('\n🎉 TESTE DE VERIFICAÇÃO DO NOME DO MÉDICO APROVADO 100% COM SUCESSO!');
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
