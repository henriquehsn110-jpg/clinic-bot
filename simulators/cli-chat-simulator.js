require('dotenv').config();
const readline = require('readline');
const conversationController = require('../clinic-bot-backend/controllers/conversationController');
const databaseService = require('../clinic-bot-backend/services/databaseService');

const TEST_PHONE = '5511999998888';
const CLINIC_ID = 'e8f24abe-381d-499d-9596-252507b32194';
const PHONE_NUMBER_ID = '1240708369119720';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log(`
================================================================
🤖 CLINICABOT — SIMULADOR CLI DE ATENDIMENTO WHATSAPP (ANA)
================================================================
📱 Telefone de Teste: ${TEST_PHONE}
🏥 Clínica: Clínica Modelo Odontológica [UUID: ${CLINIC_ID}]
💡 Digite suas mensagens no terminal e pressione ENTER.
   (Digite 'sair' para encerrar ou 'reiniciar' para resetar a sessão)
================================================================
`);

async function promptUser() {
    rl.question('👤 Paciente > ', async (input) => {
        const text = input.trim();

        if (text.toLowerCase() === 'sair') {
            console.log('\n👋 Simulador encerrado com sucesso.\n');
            rl.close();
            process.exit(0);
        }

        if (text.toLowerCase() === 'reiniciar') {
            await databaseService.sessions.clear(TEST_PHONE, CLINIC_ID);
            await databaseService.sessions.setDraft(TEST_PHONE, null, CLINIC_ID);
            console.log('\n🔄 Sessão e rascunho de agendamento resetados com sucesso!\n');
            promptUser();
            return;
        }

        try {
            const resp = await conversationController.handleIncomingMessage(
                TEST_PHONE,
                text,
                true, // Modo Simulação (NÃO envia SMS/WhatsApp real)
                CLINIC_ID,
                PHONE_NUMBER_ID
            );

            console.log(`\n🤖 Ana (ClinicaBot) > ${resp.text}\n`);

            if (resp.buttons && resp.buttons.length > 0) {
                console.log(`   🔘 Botões de Opção: [ ${resp.buttons.join(' | ')} ]`);
            }

            if (resp.showProceduresList && resp.procedures) {
                console.log(`   📋 Procedimentos: [ ${resp.procedures.join(' | ')} ]`);
            }

            if (resp.showCalendar) {
                console.log(`   📅 [SISTEMA: Calendário visual de datas ativado no aplicativo]`);
            }

            if (resp.showTimeSlots && resp.availableSlots) {
                console.log(`   ⏰ Horários Disponíveis: [ ${resp.availableSlots.join(' | ')} ]`);
            }

            console.log('');
        } catch (err) {
            console.error('\n❌ Erro ao processar mensagem:', err.message, '\n');
        }

        promptUser();
    });
}

promptUser();
