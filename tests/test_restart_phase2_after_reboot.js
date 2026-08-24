/**
 * FASE 2 DO TESTE DE REINÍCIO REAL DE PROCESSO
 * Executa as etapas 4 a 8 em um NOVO processo Node.js completamente isolado.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const db = require('../services/databaseService');
const conversationController = require('../controllers/conversationController');

async function runPhase2() {
    console.log('================================================================');
    console.log('🟢 [PROCESSO 2 — PID:', process.pid, '] INICIANDO EM NOVO PROCESSO ISOLADO');
    console.log('================================================================\n');

    const stateFile = path.resolve(__dirname, '../scratch/restart_test_state.json');
    if (!fs.existsSync(stateFile)) {
        throw new Error(`Arquivo de estado não encontrado em ${stateFile}. Execute a Fase 1 primeiro.`);
    }

    const { testPhone, testCpf, testName, clinicId } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    console.log(`[Processo 2] Retomando conversa do paciente: ${testPhone}...`);

    // Inspeciona se o draft sobreviveu no Supabase e pode ser lido pelo Processo 2
    const draftLoaded = await db.sessions.getDraft(testPhone, clinicId);
    console.log('\n📊 ESTADO RESTAURADO DO SUPABASE PELO PROCESSO 2:');
    console.log(`   - draft.type: ${draftLoaded.type}`);
    console.log(`   - draft.date: ${draftLoaded.date}`);
    console.log(`   - draft.step: ${draftLoaded.step || 'time'}`);

    assert.strictEqual(draftLoaded.type, 'Limpeza', 'draft.type deve ter sobrevivido intacto no Supabase');
    assert.strictEqual(draftLoaded.date, '2027-11-25', 'draft.date deve ter sobrevivido intacto no Supabase');

    // Turno 4
    console.log('\n[Processo 2] Turno 4: Paciente envia horário "10:00"...');
    const res4 = await conversationController.handleIncomingMessage(testPhone, '10:00', true, clinicId);
    console.log(`   Bot: "${res4.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // Turno 5
    console.log('\n[Processo 2] Turno 5: Paciente envia CPF...');
    const res5 = await conversationController.handleIncomingMessage(testPhone, testCpf, true, clinicId);
    console.log(`   Bot: "${res5.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // Turno 6
    console.log('\n[Processo 2] Turno 6: Paciente envia "Confirmar"...');
    const res6 = await conversationController.handleIncomingMessage(testPhone, 'Confirmar', true, clinicId);
    console.log(`   Bot: "${res6.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // Turno 7
    console.log('\n[Processo 2] Turno 7: Paciente informa nome completo...');
    const res7 = await conversationController.handleIncomingMessage(testPhone, testName, true, clinicId);
    console.log(`   Bot: "${res7.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // Turno 8
    console.log('\n[Processo 2] Turno 8: Paciente finaliza com "Confirmar"...');
    const res8 = await conversationController.handleIncomingMessage(testPhone, 'Confirmar', true, clinicId);
    console.log(`   Bot:\n${res8.text}`);
    assert(res8.text.includes('Agendamento confirmado') && res8.text.includes('25/11/2027') && res8.text.includes('10:00'), 'Agendamento deve ser confirmado com data e hora exatas');

    // Validação no Supabase
    console.log('\n[Processo 2] Verificando se a consulta foi gravada no Supabase...');
    const { data: apts, error: aptErr } = await db.supabase
        .from('appointments')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', '2027-11-25')
        .eq('appointment_time', '10:00:00')
        .eq('status', 'pending');

    assert(!aptErr && apts && apts.length >= 1, 'Consulta deve existir no Supabase!');
    console.log(`   ✅ SUCESSO: Consulta encontrada no banco (ID: ${apts[0].id}, Data: ${apts[0].appointment_date}, Hora: ${apts[0].appointment_time})`);

    // Limpeza
    await db.supabase.from('appointments').delete().eq('id', apts[0].id);
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);
    fs.unlinkSync(stateFile);

    console.log('\n================================================================');
    console.log('🎉 [PASS] SOBREVIVÊNCIA A REINÍCIO REAL DE PROCESSO 100% VALIDADA!');
    console.log('================================================================');
}

runPhase2().catch(err => {
    console.error('❌ Erro no Processo 2:', err);
    process.exit(1);
});
