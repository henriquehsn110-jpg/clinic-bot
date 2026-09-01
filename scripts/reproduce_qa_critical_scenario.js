/**
 * FASE 0: SCRIPT DE REPRODUÇÃO E DIAGNÓSTICO DO CENÁRIO CRÍTICO DE QA
 * Executa contra clinicabot-staging usando .env.staging
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.staging') });

const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');
const logger = require('../services/logger');

// Gerador dinâmico de CPF válido (Regra 25)
function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    n.push(d1);
    let d2 = n.reduce((total, num, i) => total + num * (11 - i), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    n.push(d2);
    return n.join('');
}

async function runDiagnosis() {
    console.log('================================================================');
    console.log('🧪 FASE 0: DIAGNÓSTICO DO CENÁRIO CRÍTICO EM STAGING');
    console.log('================================================================\n');

    const testPhone = '5511999990099';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194'; // Clinica Modelo Staging

    // 1. Limpeza de estado anterior do telefone de teste
    console.log('1. Limpando sessão e agendamentos anteriores do telefone de teste...');
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);
    
    // Busca ou cria paciente titular de teste
    const titularCpf = generateValidCpf();
    let patient = await db.patients.findByPhone(testPhone, clinicId);
    if (!patient) {
        patient = await db.patients.create({
            phone: testPhone,
            name: 'Paciente Titular Teste',
            cpf: titularCpf,
            clinic_id: clinicId
        });
    }

    const steps = [
        { desc: 'Turno 1: Iniciar agendamento', input: 'Quero agendar uma Limpeza' },
        { desc: 'Turno 2: Selecionar data inicial', input: '01/09/2026' },
        { desc: 'Turno 3: Mudar data com texto complexo', input: 'Mudei de ideia, prefiro outro dia 02/09/2026' },
        { desc: 'Turno 4: Selecionar horário', input: '08:00' },
        { desc: 'Turno 5: Clicar em Agendar p/ Outro', input: 'Agendar p/ Outro' },
        { desc: 'Turno 6: Informar nome do dependente', input: 'Raquel Pereira da Silva' },
        { desc: 'Turno 7: Informar CPF do dependente', input: generateValidCpf() },
        { desc: 'Turno 8: Confirmar agendamento', input: 'Confirmar' }
    ];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`\n------------------------------------------------------------`);
        console.log(`▶️ [PASSO ${i + 1}] ${step.desc}`);
        console.log(`👤 Input do Usuário: "${step.input.length === 11 ? '***CPF***' : step.input}"`);

        const draftBefore = await db.sessions.getDraft(testPhone, clinicId);
        console.log(`📋 Draft ANTES:`, JSON.stringify(draftBefore));

        const response = await conversationController.handleIncomingMessage(
            testPhone,
            step.input,
            true, // isSimulation
            clinicId,
            '999888777'
        );

        const draftAfter = await db.sessions.getDraft(testPhone, clinicId);
        console.log(`🤖 Resposta do Bot: "${response.text ? response.text.replace(/\n+/g, ' ') : ''}"`);
        console.log(`🔘 Botões exibidos:`, response.buttons || []);
        console.log(`📋 Draft DEPOIS:`, JSON.stringify(draftAfter));
    }

    console.log('\n================================================================');
    console.log('🔍 VERIFICAÇÃO DOS REGISTROS PERSISTIDOS NO SUPABASE (STAGING)');
    console.log('================================================================');

    const { data: savedAppts } = await db.supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, type, doctor_id, patient_id, status, created_at, patients(name, phone)')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(3);

    console.log('Últimos agendamentos no banco:', JSON.stringify(savedAppts, null, 2));
}

runDiagnosis().then(() => process.exit(0)).catch(err => {
    console.error('❌ Erro no diagnóstico:', err);
    process.exit(1);
});
