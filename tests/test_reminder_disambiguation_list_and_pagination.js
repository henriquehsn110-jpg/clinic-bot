/**
 * tests/test_reminder_disambiguation_list_and_pagination.js
 * 
 * Validação de desambiguação de lembretes:
 * 1. <= 3 consultas: botões interativos com IDs semânticos (reminder_confirm:<id>).
 * 2. 4 a 10 consultas: lista interativa (sendListMessage) e seleção de 4ª+ consulta (via ID ou texto "Consulta 4").
 * 3. > 10 consultas: transição segura para atendente humano (sem truncamento silencioso).
 */

require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

const BASE_TEST_DATE = '2028-07-20';

async function runTest() {
    console.log('================================================================');
    console.log('🧪 [TEST] Desambiguação de Lembretes, IDs Semânticos e Paginação');
    console.log('================================================================\n');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
    const clinicId = defaultClinic.id;
    const testPhone = '5511988' + Math.floor(100000 + Math.random() * 900000);

    const cleanups = { patients: [], appointments: [] };

    try {
        console.log(`1. Criando paciente de teste [${testPhone}]...`);
        const patient = await db.patients.findOrCreate(testPhone, clinicId);
        cleanups.patients.push(patient.id);
        await db.patients.updateName(testPhone, 'Paciente Teste Lembretes', clinicId);

        // ─────────────────────────────────────────────────────────────────
        // CENÁRIO A: <= 3 Consultas (Botões com IDs semânticos)
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- CENÁRIO A: 2 Consultas Pendentes (<= 3, Botões com IDs semânticos) ---');
        const appt1 = await calendarService.scheduleAppointment({
            phone: testPhone,
            name: 'Paciente Teste Lembretes',
            clinicId,
            date: BASE_TEST_DATE,
            time: '09:00',
            type: 'Consulta 1'
        });
        cleanups.appointments.push(appt1.id);

        const appt2 = await calendarService.scheduleAppointment({
            phone: testPhone,
            name: 'Paciente Teste Lembretes',
            clinicId,
            date: BASE_TEST_DATE,
            time: '10:00',
            type: 'Consulta 2'
        });
        cleanups.appointments.push(appt2.id);

        console.log('   Enviando "Confirmar presença"...');
        const resA = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Confirmar presença',
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resA.text.split('\n')[0]);
        console.log('   - Botões retornados:', JSON.stringify(resA.buttons));

        assert.strictEqual(resA.buttons.length, 2, 'Deve retornar exatamente 2 botões para 2 consultas');
        assert(resA.buttons[0].id && resA.buttons[0].id.startsWith('reminder_confirm:'), 'Botão 1 deve conter ID semântico reminder_confirm:<id>');
        assert(resA.buttons[1].id && resA.buttons[1].id.startsWith('reminder_confirm:'), 'Botão 2 deve conter ID semântico reminder_confirm:<id>');
        console.log('   ✅ PASS: Botões com IDs semânticos gerados corretamente.');

        // Confirma a consulta 2 via buttonId
        console.log(`   Confirmando Consulta 2 via buttonId: ${resA.buttons[1].id}...`);
        const resConfirmA = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Consulta 2',
            buttonId: resA.buttons[1].id,
            isSimulation: true,
            clinicId
        });
        console.log('   - Resposta da confirmação:', resConfirmA.text);
        assert(resConfirmA.text.includes('confirmada com sucesso'), 'Deve confirmar com sucesso');

        const { data: appt2Data } = await db.supabase.from('appointments').select('status').eq('id', appt2.id).single();
        assert.strictEqual(appt2Data.status, 'confirmed', 'Consulta 2 deve estar confirmada no banco');
        console.log('   ✅ PASS: Consulta 2 confirmada com sucesso via ID semântico.');

        // Limpa consultas do cenário A
        await db.supabase.from('appointments').update({ status: 'cancelled' }).in('id', [appt1.id, appt2.id]);

        // ─────────────────────────────────────────────────────────────────
        // CENÁRIO B: 4 a 10 Consultas (Menu Lista e Seleção da 4ª+)
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- CENÁRIO B: 4 Consultas Pendentes (4 a 10, Lista Interativa e Paginação) ---');
        const apptsB = [];
        const timesB = ['11:00', '13:00', '14:00', '15:00'];
        for (let i = 0; i < 4; i++) {
            const a = await calendarService.scheduleAppointment({
                phone: testPhone,
                name: 'Paciente Teste Lembretes',
                clinicId,
                date: BASE_TEST_DATE,
                time: timesB[i],
                type: `Procedimento ${i + 1}`
            });
            apptsB.push(a);
            cleanups.appointments.push(a.id);
        }

        console.log('   Enviando "Confirmar presença"...');
        const resB = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Confirmar presença',
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resB.text.split('\n')[0]);
        console.log('   - Opções retornadas:', JSON.stringify(resB.buttons));
        assert.strictEqual(resB.buttons.length, 4, 'Deve listar as 4 consultas disponíveis sem truncar em 3');
        console.log('   ✅ PASS: 4 consultas listadas sem truncamento silencioso.');

        // Seleciona a 4ª consulta pelo texto digitado "Consulta 4"
        console.log('   Selecionando "Consulta 4" por texto digitado...');
        const resConfirmB = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Consulta 4',
            isSimulation: true,
            clinicId
        });
        console.log('   - Resposta:', resConfirmB.text);
        assert(resConfirmB.text.includes('confirmada com sucesso'), 'Deve confirmar Consulta 4');

        const { data: appt4Data } = await db.supabase.from('appointments').select('status').eq('id', apptsB[3].id).single();
        assert.strictEqual(appt4Data.status, 'confirmed', 'Consulta 4 deve estar com status confirmed');
        console.log('   ✅ PASS: Consulta 4 (além do limite antigo de 3) confirmada com sucesso!');

        // Limpa consultas do cenário B
        await db.supabase.from('appointments').update({ status: 'cancelled' }).in('id', apptsB.map(a => a.id));

        // ─────────────────────────────────────────────────────────────────
        // CENÁRIO C: > 10 Consultas (Transição para atendente humano)
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- CENÁRIO C: 11 Consultas Pendentes (>10, Handoff Humano Seguro) ---');
        const apptsC = [];
        const timesC = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00'];
        for (let i = 0; i < 11; i++) {
            const a = await calendarService.scheduleAppointment({
                phone: testPhone,
                name: 'Paciente Teste Lembretes',
                clinicId,
                date: '2028-07-21',
                time: timesC[i],
                type: `Consulta Massa ${i + 1}`
            });
            apptsC.push(a);
            cleanups.appointments.push(a.id);
        }

        console.log('   Enviando "Confirmar presença" com 11 consultas ativas...');
        const resC = await conversationController.handleIncomingMessage({
            phone: testPhone,
            text: 'Confirmar presença',
            isSimulation: true,
            clinicId
        });

        console.log('   - Resposta do bot:', resC.text);
        console.log('   - transferToHuman:', resC.transferToHuman);

        assert.strictEqual(resC.transferToHuman, true, 'Deve transferir para atendente humano quando > 10 consultas');
        assert(resC.text.includes('transferindo seu atendimento para a nossa equipe humana'), 'Deve conter mensagem de transição segura');
        console.log('   ✅ PASS: Mais de 10 consultas transicionadas com segurança para atendente humano!');

        console.log('\n================================================================');
        console.log('🎉 TODOS OS TESTES DE DESAMBIGUAÇÃO PASSARAM COM SUCESSO!');
        console.log('================================================================\n');

    } finally {
        console.log('🧹 Limpando dados de teste...');
        if (cleanups.appointments.length > 0) {
            await db.supabase.from('appointments').delete().in('id', cleanups.appointments);
        }
        if (cleanups.patients.length > 0) {
            await db.supabase.from('patients').delete().in('id', cleanups.patients);
        }
        await db.sessions.delete(testPhone, clinicId);
        console.log('✨ Cleanup finalizado.');
    }
}

runTest().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
