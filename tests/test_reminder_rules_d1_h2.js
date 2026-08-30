/**
 * ClinicaBot SaaS Pro — Teste de Validação das Regras de Lembrete D-1 (Véspera) e H-2 (2 Horas Antes)
 * 
 * Valida:
 * 1. Disparo de Lembrete D-1 (1 dia antes / Véspera) com data em DD/MM/YYYY e botões interativos
 * 2. Idempotência do Lembrete D-1 (Zero duplicação)
 * 3. Disparo de Lembrete H-2 (2 horas antes) respeitando a janela de tolerância
 * 4. Não-disparo para consultas fora da janela de 2h
 * 5. Idempotência do Lembrete H-2
 */

require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const db = require('../services/databaseService');
const reminderService = require('../services/reminderService');

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((acc, val, idx) => acc + val * (10 - idx), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    n.push(d1);
    let d2 = n.reduce((acc, val, idx) => acc + val * (11 - idx), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    n.push(d2);
    return n.join('');
}

async function runReminderTestSuite() {
    console.log('================================================================');
    console.log('🧪 TESTE AUTOMATIZADO DE LEMBRETES MULTI-NÍVEL (D-1 & H-2)');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;
    const testPhone = '5511999887766';
    const testCpf = generateValidCpf();
    let clinic = null;
    let patient = null;
    let apptD1 = null;
    let apptH2 = null;
    let apptFar = null;

    try {
        // 1. Obter clínica de teste
        const clinics = await db.clinics.getAll();
        clinic = clinics[0];
        if (!clinic) throw new Error('Nenhuma clínica encontrada no banco para testes.');
        console.log(`🏥 Clínica selecionada: ${clinic.name} (${clinic.slug})`);

        // 2. Criar ou obter paciente de teste
        patient = await db.patients.findOrCreate(testPhone, clinic.id);
        patient = await db.patients.updateName(testPhone, 'Paciente Teste Lembretes', clinic.id);
        patient = await db.patients.updateCpf(testPhone, testCpf, clinic.id);
        console.log(`👤 Paciente de teste: ${patient.name} (${patient.phone})\n`);

        // ================================================================
        // TESTE 1: Lembrete D-1 (1 dia antes / Véspera)
        // ================================================================
        console.log('--- [TESTE 1] Validando Lembrete de Véspera (D-1) ---');
        const tomorrowStr = reminderService.getTodayBrtDateStr(1);
        const tomorrowFormatted = reminderService.formatBrtDate(tomorrowStr);

        // Criar agendamento para amanhã às 14:30
        apptD1 = await db.appointments.create({
            patient_id: patient.id,
            clinic_id: clinic.id,
            appointment_date: tomorrowStr,
            appointment_time: '14:30:00',
            type: 'Limpeza Dental',
            status: 'confirmed'
        });
        console.log(`📅 Agendamento D-1 criado: Data ${tomorrowStr} (${tomorrowFormatted}) às 14:30 (ID: ${apptD1.id})`);

        // Reset do cache em memória do serviço
        reminderService.processedReminders.clear();

        // Executar disparo D-1 em simulação
        const resD1 = await reminderService.processEveReminders(true);
        console.log(`📊 Resultado D-1: Total ${resD1.totalTomorrow}, Enviados: ${resD1.sent}, Ignorados: ${resD1.skipped}`);

        const sentD1 = resD1.details.find(d => d.id === apptD1.id);
        if (sentD1 && sentD1.status === 'sent') {
            console.log('  ✅ PASS: Lembrete D-1 identificado e enviado com sucesso!');
            passed++;
        } else {
            console.error('  ❌ FAIL: Lembrete D-1 não foi enviado.', resD1);
            failed++;
        }

        // ================================================================
        // TESTE 2: Idempotência do Lembrete D-1 (Sem Reenvio)
        // ================================================================
        console.log('\n--- [TESTE 2] Validando Idempotência do Lembrete D-1 ---');
        const resD1Repeat = await reminderService.processEveReminders(true);
        const skippedD1 = resD1Repeat.details.find(d => d.id === apptD1.id);
        if (skippedD1 && skippedD1.status === 'skipped') {
            console.log('  ✅ PASS: Idempotência D-1 validada! Consulta não foi duplicada no reenvio.');
            passed++;
        } else {
            console.error('  ❌ FAIL: Lembrete D-1 foi duplicado indevidamente.', resD1Repeat);
            failed++;
        }

        // ================================================================
        // TESTE 3: Lembrete H-2 (2 Horas Antes) — Janela de Tolerância
        // ================================================================
        console.log('\n--- [TESTE 3] Validando Lembrete de Antecedência Imediata (H-2) ---');
        const todayStr = reminderService.getTodayBrtDateStr(0);
        
        // Simulação determinística: 10:00 AM (minuto 600) -> Consulta às 12:00 (minuto 720, diff = 120 min)
        const simNowMinutes = 600; // 10:00 AM
        const h2TimeStr = '12:00:00'; // 12:00 PM (exatamente 2h à frente)
        const farTimeStr = '16:00:00'; // 16:00 PM (6h à frente, fora da janela)

        apptH2 = await db.appointments.create({
            patient_id: patient.id,
            clinic_id: clinic.id,
            appointment_date: todayStr,
            appointment_time: h2TimeStr,
            type: 'Avaliação Geral',
            status: 'confirmed'
        });
        console.log(`⏰ Agendamento H-2 criado: Hoje ${todayStr} às ${h2TimeStr.substring(0, 5)} (Simulando relógio às 10:00)`);

        apptFar = await db.appointments.create({
            patient_id: patient.id,
            clinic_id: clinic.id,
            appointment_date: todayStr,
            appointment_time: farTimeStr,
            type: 'Ortodontia',
            status: 'confirmed'
        });
        console.log(`⏰ Agendamento Distante (+6h) criado: Hoje ${todayStr} às ${farTimeStr.substring(0, 5)}`);

        // Reset do cache em memória
        reminderService.processedReminders.clear();

        // Executar disparo H-2 passando relógio simulado de 10:00 AM
        const resH2 = await reminderService.processTwoHourReminders(true, simNowMinutes);
        console.log(`📊 Resultado H-2: Total Hoje: ${resH2.totalToday}, Enviados: ${resH2.sent}, Ignorados: ${resH2.skipped}`);

        const sentH2 = resH2.details.find(d => d.id === apptH2.id);
        const sentFar = resH2.details.find(d => d.id === apptFar.id);

        if (sentH2 && sentH2.status === 'sent') {
            console.log('  ✅ PASS: Lembrete H-2 (2 horas antes) disparado com sucesso!');
            passed++;
        } else {
            console.error('  ❌ FAIL: Lembrete H-2 não disparou para consulta dentro da janela.', resH2);
            failed++;
        }

        if (!sentFar) {
            console.log('  ✅ PASS: Consulta distante (+6h) NÃO recebeu lembrete H-2 indevido!');
            passed++;
        } else {
            console.error('  ❌ FAIL: Consulta fora da janela recebeu lembrete indevido.', sentFar);
            failed++;
        }

        // ================================================================
        // TESTE 4: Idempotência do Lembrete H-2
        // ================================================================
        console.log('\n--- [TESTE 4] Validando Idempotência do Lembrete H-2 ---');
        const resH2Repeat = await reminderService.processTwoHourReminders(true, simNowMinutes);
        const skippedH2 = resH2Repeat.details.find(d => d.id === apptH2.id);
        if (skippedH2 && skippedH2.status === 'skipped') {
            console.log('  ✅ PASS: Idempotência H-2 validada! Consulta de 2 horas não foi reenviada.');
            passed++;
        } else {
            console.error('  ❌ FAIL: Lembrete H-2 foi duplicado.', resH2Repeat);
            failed++;
        }

    } catch (err) {
        console.error('❌ Erro inesperado durante os testes de lembrete:', err.message, err.stack);
        failed++;
    } finally {
        // Limpeza dos dados de teste
        console.log('\n🧹 Limpando agendamentos e pacientes de teste do banco...');
        try {
            if (apptD1?.id) await db.supabase.from('appointments').delete().eq('id', apptD1.id);
            if (apptH2?.id) await db.supabase.from('appointments').delete().eq('id', apptH2.id);
            if (apptFar?.id) await db.supabase.from('appointments').delete().eq('id', apptFar.id);
            if (patient?.id) await db.supabase.from('patients').delete().eq('id', patient.id);
            console.log('✅ Dados de teste limpos com sucesso.');
        } catch (cleanErr) {
            console.warn('⚠️ Aviso ao limpar dados:', cleanErr.message);
        }
    }

    console.log('\n================================================================');
    console.log(`📊 RESULTADO FINAL DOS TESTES DE LEMBRETE (D-1 & H-2):`);
    console.log(`   ✅ Passaram: ${passed}`);
    console.log(`   ❌ Falharam: ${failed}`);
    console.log('================================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    runReminderTestSuite();
}

module.exports = runReminderTestSuite;
