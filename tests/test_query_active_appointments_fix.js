/**
 * TEST: Interceptador Direto de Consulta de Agendamentos Ativos
 * Valida que perguntas como "Quais consultas eu tenho agendada?", "Quero saber quais consultas eu tenho agendadas"
 * ou "Tenho alguma consulta?" respondem imediatamente na 1ª mensagem sem cair nas boas-vindas nem no Frustration Guard.
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runTest() {
    console.log('🧪 [TEST_QUERY_ACTIVE_APPTS] Iniciando Teste de Consulta de Agendamentos Ativos...');

    let passed = 0;
    let failed = 0;

    function assert(name, condition, extra = '') {
        if (condition) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name} ${extra}`);
            failed++;
        }
    }

    try {
        const { data: clinic } = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').maybeSingle();
        const clinicId = clinic ? clinic.id : 'e8f24abe-381d-499d-9596-252507b32194';
        const testPhone = '5511944443333';
        const testDate = '2028-11-15';
        const testTime = '14:30';

        // 1. Prepara paciente e limpa agendamento no slot de teste se existir
        const patient = await db.patients.findOrCreate(testPhone, clinicId, 'Paciente Teste Consulta');
        await db.supabase.from('appointments').delete().eq('clinic_id', clinicId).eq('appointment_date', testDate).eq('appointment_time', testTime);
        await db.supabase.from('appointments').delete().eq('patient_id', patient.id);

        // Insere agendamento ativo de teste
        await db.appointments.create({
            patient_id: patient.id,
            clinic_id: clinicId,
            appointment_date: testDate,
            appointment_time: testTime,
            type: 'Limpeza Dental',
            status: 'confirmed'
        });

        // Limpa histórico de sessão para simular 1ª mensagem pós-agendamento (histLen: 0)
        await db.sessions.set(testPhone, [], clinicId);
        await db.sessions.setDraft(testPhone, null, clinicId);

        // 2. Paciente envia "Quais consultas eu tenho agendada?" com histLen: 0
        const res1 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Quais consultas eu tenho agendada?',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        assert('Pergunta "Quais consultas eu tenho agendada?" — Responde de PRIMEIRA', res1.text.includes('Sua consulta de Limpeza Dental já está confirmada'), `Texto: ${res1.text}`);
        assert('Pergunta "Quais consultas eu tenho agendada?" — NUNCA cai nas boas-vindas', !res1.text.includes('Antes de começarmos'), `Texto: ${res1.text}`);
        assert('Pergunta "Quais consultas eu tenho agendada?" — NUNCA faz transbordo humano', res1.transferToHuman !== true);

        // 3. Testa variação "Quero saber quais consultas eu tenho agendadas ?"
        await db.sessions.set(testPhone, [], clinicId);
        const res2 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: 'Quero saber quais consultas eu tenho agendadas ?',
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        assert('Variação "Quero saber quais consultas eu tenho agendadas ?" — Responde com dados da consulta', res2.text.includes('15/11/2028 às 14:30'));

        // Limpeza dos dados de teste
        await db.supabase.from('appointments').delete().eq('patient_id', patient.id);
        await db.supabase.from('patients').delete().eq('id', patient.id);

        console.log('================================================================');
        console.log(`📊 RESULTADO DO TESTE: ${passed} PASS, ${failed} FAIL`);
        console.log('================================================================');

        if (failed > 0) process.exit(1);
        process.exit(0);
    } catch (err) {
        console.error('❌ ERRO NO TESTE:', err.message, err.stack);
        process.exit(1);
    }
}

runTest();
