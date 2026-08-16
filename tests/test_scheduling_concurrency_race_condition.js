/**
 * test_scheduling_concurrency_race_condition.js
 * 
 * Validação de Prevenção de Concorrência e Double-Booking (BACKLOG-FSM-01):
 * 1. Teste de Corrida Determinístico: 2 pacientes simultâneos no mesmo slot -> exatamente 1 sucesso e 1 SLOT_OCCUPIED.
 * 2. Teste Multi-Tenant no Mesmo Slot: Demonstração empírica de colisão no PostgreSQL por constraint legada global sem clinic_id.
 * 3. Teste de Resolução de UX na FSM: Tratamento de SLOT_OCCUPIED reabrindo opções com mensagem amigável.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env') });

const db = require('../services/databaseService');
const calendarService = require('../services/calendarService');
const conversationController = require('../controllers/conversationController');
const { onboardTenant } = require('../scripts/onboard_tenant');

async function testConcurrency() {
    console.log('================================================================');
    console.log('🔒 [TEST_CONCURRENCY] Teste de Concorrência & Double-Booking (BACKLOG-FSM-01)');
    console.log('================================================================\n');

    const clinicIdA = 'e8f24abe-381d-499d-9596-252507b32194'; // Clínica Modelo
    const testDate = '2028-10-15';
    const testTime = '14:00';

    const phonePatient1 = '5511999991111';
    const phonePatient2 = '5511999992222';
    const phonePatient3 = '5511999995555';

    // ── Limpeza Prévia Completa ──
    console.log('[Setup] Limpando agendamentos residuais de teste no banco...');
    await db.supabase.from('appointments').delete().eq('appointment_date', testDate);
    await db.supabase.from('appointments').delete().eq('appointment_date', '2028-11-20');

    await db.sessions.delete(phonePatient1, clinicIdA).catch(() => {});
    await db.sessions.delete(phonePatient2, clinicIdA).catch(() => {});
    await db.sessions.delete(phonePatient3, clinicIdA).catch(() => {});

    try {
        // ── 1. Teste de Corrida Determinístico no Mesmo Slot (Mesma Clínica) ──
        console.log('\n[Cenário 1] Disparando 2 agendamentos concorrentes via Promise.all para o MESMO horário e clínica...');
        
        const results = await Promise.allSettled([
            calendarService.scheduleAppointment({
                clinicId: clinicIdA,
                phone: phonePatient1,
                name: 'Paciente Um Concorrente',
                date: testDate,
                time: testTime,
                type: 'Limpeza'
            }),
            calendarService.scheduleAppointment({
                clinicId: clinicIdA,
                phone: phonePatient2,
                name: 'Paciente Dois Concorrente',
                date: testDate,
                time: testTime,
                type: 'Clareamento'
            })
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        console.log(`  📊 Sucessos: ${fulfilled.length}`);
        console.log(`  📊 Rejeições: ${rejected.length}`);
        if (rejected.length > 0) {
            console.log(`  📊 Código de Erro da Rejeição: ${rejected[0].reason.code || rejected[0].reason.message}`);
        }

        assert.strictEqual(fulfilled.length, 1, 'Exatamente 1 agendamento concorrente deve suceder');
        assert.strictEqual(rejected.length, 1, 'Exatamente 1 agendamento concorrente deve ser rejeitado');
        assert.strictEqual(rejected[0].reason.code, 'SLOT_OCCUPIED', 'O erro deve ter código SLOT_OCCUPIED');

        // Validação no Supabase (SELECT direto)
        const { data: dbAppts } = await db.supabase
            .from('appointments')
            .select('id, patient_id, appointment_date, appointment_time, status')
            .eq('clinic_id', clinicIdA)
            .eq('appointment_date', testDate)
            .in('status', ['pending', 'confirmed']);

        console.log('  📊 DUMP BANCO DE AGENDAMENTOS PARA O SLOT:', JSON.stringify(dbAppts, null, 2));
        assert.strictEqual(dbAppts.length, 1, 'Banco de dados deve conter exatamente 1 agendamento ativo (zero double-booking)');
        console.log('  ✅ PASS: Cenário 1 aprovado com exatamente 1 sucesso e 1 rejeição por SLOT_OCCUPIED!\n');

        // ── 2. Teste Multi-Tenant: Clínicas Diferentes no MESMO Slot Exato ──
        console.log('[Cenário 2] Testando agendamentos concorrentes no MESMO DIA E HORÁRIO para CLÍNICAS DIFERENTES...');
        const runId = Date.now();
        const clinicB = await onboardTenant({
            name: `Clínica Tenant B (${runId})`,
            slug: `tenant-b-${runId}`,
            phoneNumberId: `phone_b_${runId}`,
            whatsappToken: `token_b_${runId}`,
            address: 'Rua B, 500'
        });

        const sameDate = '2028-11-20';
        const sameTime = '10:00';

        try {
            const tenantResults = await Promise.allSettled([
                calendarService.scheduleAppointment({
                    clinicId: clinicIdA,
                    phone: '5511999993333',
                    name: 'Paciente Tenant A',
                    date: sameDate,
                    time: sameTime,
                    type: 'Avaliação'
                }),
                calendarService.scheduleAppointment({
                    clinicId: clinicB.id,
                    phone: '5511999994444',
                    name: 'Paciente Tenant B',
                    date: sameDate,
                    time: sameTime,
                    type: 'Avaliação'
                })
            ]);

            const tenantFulfilled = tenantResults.filter(r => r.status === 'fulfilled');
            const tenantRejected = tenantResults.filter(r => r.status === 'rejected');

            console.log(`  📊 Sucessos Multi-Tenant no mesmo slot: ${tenantFulfilled.length}/2`);
            console.log(`  📊 Rejeições Multi-Tenant no mesmo slot: ${tenantRejected.length}`);

            // Dump direto do banco
            const { data: multiDbRows } = await db.supabase
                .from('appointments')
                .select('id, clinic_id, appointment_date, appointment_time, status')
                .eq('appointment_date', sameDate);
            console.log('  📊 DUMP BANCO DE AGENDAMENTOS MULTI-TENANT:', JSON.stringify(multiDbRows, null, 2));

            assert.strictEqual(tenantFulfilled.length, 2, 'Ambas as clínicas independentes devem conseguir agendar no mesmo dia e horário');
            assert.strictEqual(tenantRejected.length, 0, 'Zero rejeições indevidas entre clínicas distintas');
            assert.strictEqual(multiDbRows.length, 2, 'Banco de dados deve conter ambos os agendamentos isolados por clinic_id');
            console.log('  ✅ PASS: Isolamento Multi-Tenant garantido em nível de schema e aplicação (2/2 Sucessos)!\n');
        } finally {
            await db.supabase.from('appointments').delete().eq('appointment_date', sameDate);
            await db.supabase.from('clinics').delete().eq('id', clinicB.id);
        }

        // ── 3. Teste de UX na Máquina de Estados (conversationController) ──
        console.log('[Cenário 3] Testando tratamento de UX do conversationController quando o slot já está preenchido...');
        await db.sessions.setDraft(phonePatient3, {
            date: testDate,
            time: testTime,
            type: 'Limpeza',
            name: 'Paciente UX Conflito',
            cpf: '529.982.247-25'
        }, clinicIdA);

        const fsmResponse = await conversationController.handleIncomingMessage(
            phonePatient3,
            'Confirmar',
            true,
            clinicIdA,
            'sim_phone_id'
        );

        console.log('  📊 RESPOSTA DO BOT APÓS CONFLITO DE HORÁRIO:');
        console.log(`     Texto: "${fsmResponse.text}"`);
        console.log(`     showCalendar: ${fsmResponse.showCalendar}`);

        assert.ok(fsmResponse.text.includes('acabou de ser preenchido') || fsmResponse.text.includes('outro paciente'), 'Bot deve informar que o horário foi preenchido');
        assert.strictEqual(fsmResponse.showCalendar, true, 'Bot deve reabrir calendário para nova seleção');

        const draftAfterConflict = await db.sessions.getDraft(phonePatient3, clinicIdA);
        assert.strictEqual(draftAfterConflict.time, null, 'draft.time deve ser limpo');
        assert.strictEqual(draftAfterConflict.date, null, 'draft.date deve ser limpo');
        console.log('  ✅ PASS: FSM tratou o conflito de concorrência com UX amigável e reabertura do calendário!\n');

    } finally {
        // Cleanup geral
        await db.supabase.from('appointments').delete().eq('appointment_date', testDate);
        await db.supabase.from('appointments').delete().eq('appointment_date', '2028-11-20');
        await db.sessions.delete(phonePatient1, clinicIdA).catch(() => {});
        await db.sessions.delete(phonePatient2, clinicIdA).catch(() => {});
        await db.sessions.delete(phonePatient3, clinicIdA).catch(() => {});
    }

    console.log('================================================================');
    console.log('🎉 AUDITORIA DE CONCORRÊNCIA E DOUBLE-BOOKING 100% APROVADA!');
    console.log('================================================================\n');
}

testConcurrency().catch(err => {
    console.error('❌ ERRO NO TESTE DE CONCORRÊNCIA:', err);
    process.exit(1);
});
