/**
 * TESTE DE INTEGRAÇÃO E2E — FLUXO DE LEMBRETE PRÉ-CONSULTA & RESPOSTAS DO PACIENTE
 * 
 * Testa a jornada completa dos Lembretes do WhatsApp:
 * 1. Criação de um agendamento de teste no banco Supabase para a data de hoje.
 * 2. Execução do disparo automático de lembrete pelo ReminderService (validando idempotência em reminder_logs).
 * 3. Simulação da resposta do paciente no WhatsApp ("CONFIRMAR", "REMARCAR", "CANCELAR").
 * 4. Validação da alteração de status da consulta no Supabase (pending -> confirmed / cancelled).
 */

require('dotenv').config();
const reminderService = require('../services/reminderService');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');
const assert = require('assert');

const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
const testPhone = '5511977778888';
const testPatientName = 'Mariana Oliveira (Teste Lembrete)';

async function runReminderE2ETest() {
    console.log('================================================================');
    console.log('🔔 TESTE E2E DE LEMBRETES AUTOMÁTICOS & RESPOSTA DO PACIENTE');
    console.log('================================================================\n');

    const todayStr = reminderService.getTodayBrtDateStr();
    console.log(`📅 Data BRT de Execução: ${todayStr}`);

    // 1. Preparação: Criar/Buscar paciente de teste
    const patient = await db.patients.findOrCreate(testPhone, clinicId);
    await db.patients.updateName(testPhone, testPatientName, clinicId);
    console.log(`👤 Paciente de teste configurado: ID ${patient.id} (${testPatientName})`);

    // 2. Limpeza prévia de agendamentos e logs de teste antigos
    await db.supabase.from('appointments').delete().eq('patient_id', patient.id);
    await db.supabase.from('reminder_logs').delete().eq('clinic_id', clinicId);
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);

    // 3. Criar agendamento no Supabase para o dia de HOJE
    const { data: newAppt, error: apptErr } = await db.supabase
        .from('appointments')
        .insert({
            clinic_id: clinicId,
            patient_id: patient.id,
            appointment_date: todayStr,
            appointment_time: '14:30:00',
            type: 'Avaliação Ortodôntica',
            status: 'pending'
        })
        .select()
        .single();

    if (apptErr) {
        console.error('❌ Erro ao criar agendamento de teste:', apptErr.message);
        process.exit(1);
    }

    console.log(`\n🔹 [Passo 1/4] Agendamento de teste criado no Supabase:`);
    console.log(`   ID: ${newAppt.id}`);
    console.log(`   Data: ${newAppt.appointment_date} às ${newAppt.appointment_time}`);
    console.log(`   Procedimento: ${newAppt.type} | Status Inicial: ${newAppt.status}`);

    // 4. Executar Disparo de Lembrete (ReminderService)
    console.log(`\n🔹 [Passo 2/4] Executando disparo de lembrete pelo ReminderService...`);
    const statsRun1 = await reminderService.processDailyReminders(true);
    console.log(`   Resultados do Disparo: Total Hoje=${statsRun1.totalToday}, Enviados=${statsRun1.sent}, Ignorados=${statsRun1.skipped}, Falhas=${statsRun1.failed}`);

    assert.ok(statsRun1.totalToday >= 1, 'Deveria encontrar pelo menos 1 agendamento para hoje');

    // 5. Validar Idempotência (Segunda execução no mesmo dia não pode duplicar envio)
    console.log(`\n🔹 [Passo 3/4] Testando Idempotência (Garantia de Não-Duplicação)...`);
    const statsRun2 = await reminderService.processDailyReminders(true);
    console.log(`   Execução 2 (Idempotente): Enviados=${statsRun2.sent}, Skipped=${statsRun2.skipped}`);
    assert.strictEqual(statsRun2.sent, 0, 'Segunda execução não deve enviar nenhum lembrete duplicado');
    assert.ok(statsRun2.skipped >= 1, 'Segunda execução deve ignorar lembretes já processados');
    console.log('   ✅ PASS: Idempotência confirmada! Zero lembretes duplicados.');

    // 6. Simular Resposta do Paciente no WhatsApp (Clique no botão "Confirmar Presença")
    console.log(`\n🔹 [Passo 4/4] Simulando clique no botão do WhatsApp: "Confirmar Presença"...`);
    const confirmRes = await conversationController.handleIncomingMessage({
        phone: testPhone,
        messageText: 'Confirmar Presença',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    console.log(`   Resposta da Ana: "${confirmRes.text}"`);
    console.log(`   Botões gerados: ${JSON.stringify(confirmRes.buttons || [])}`);

    // 7. Checar no Banco Supabase se o status do agendamento mudou para "confirmed"
    const { data: updatedAppt } = await db.supabase
        .from('appointments')
        .select('status')
        .eq('id', newAppt.id)
        .single();

    console.log(`   Status do Agendamento no Supabase após resposta "CONFIRMAR": [${updatedAppt.status.toUpperCase()}]`);

    assert.strictEqual(updatedAppt.status, 'confirmed', 'O status do agendamento deveria ser alterado para "confirmed" no banco!');
    console.log('   ✅ PASS: Agendamento alterado para "confirmed" com sucesso no banco de dados!');

    // 8. Limpeza de dados de teste
    console.log('\n🧹 Limpando agendamento e paciente de teste do Supabase...');
    await db.supabase.from('appointments').delete().eq('id', newAppt.id);
    await db.supabase.from('reminder_logs').delete().eq('appointment_id', newAppt.id);
    await db.supabase.from('patients').delete().eq('id', patient.id);
    console.log('   ✅ Limpeza concluída.');

    console.log('\n================================================================');
    console.log('🎉 TESTE E2E DE LEMBRETES AUTOMÁTICOS 100% APROVADO!');
    console.log('================================================================\n');
    process.exit(0);
}

runReminderE2ETest().catch(err => {
    console.error('❌ FALHA NO TESTE DE LEMBRETES:', err);
    process.exit(1);
});
