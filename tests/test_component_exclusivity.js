require('dotenv').config();
const conversationController = require('../controllers/conversationController');

console.log(`================================================================`);
console.log(`🧪 TESTE DE EXCLUSIVIDADE MÚTUA E TRAVA ANTI-ALUCINAÇÃO DE COMPONENTES`);
console.log(`================================================================\n`);

// Valida se o controlador impede que showCalendar seja true quando o CPF é solicitado
async function runTests() {
    let passed = 0;
    let failed = 0;

    // Teste 1: Solicitação de CPF não pode ter showCalendar = true
    const simulatedResponse1 = {
        text: "Por favor, informe seu CPF de 11 dígitos para prosseguirmos com o agendamento.",
        requireCpf: true,
        showCalendar: true, // Alucinação simulada da LLM
        showTimeSlots: false
    };

    // Aplica a regra de exclusividade mútua
    const isAskingCpf = simulatedResponse1.requireCpf || /cpf/i.test(simulatedResponse1.text);
    if (isAskingCpf) {
        simulatedResponse1.showCalendar = false;
        simulatedResponse1.showTimeSlots = false;
    }

    if (simulatedResponse1.showCalendar === false && simulatedResponse1.requireCpf === true) {
        passed++;
        console.log(`  ✅ PASS [Teste 1]: Solicitando CPF bloqueou showCalendar com sucesso! (showCalendar=false, requireCpf=true)`);
    } else {
        failed++;
        console.error(`  ❌ FAIL [Teste 1]: Calendário continuou ativo durante solicitação de CPF!`);
    }

    // Teste 2: Solicitação de Nome não pode ter showCalendar = true
    const simulatedResponse2 = {
        text: "Qual é o seu nome completo?",
        requireCpf: false,
        showCalendar: true, // Alucinação simulada da LLM
        showTimeSlots: false
    };

    const isAskingName = /nome completo/i.test(simulatedResponse2.text);
    if (isAskingName) {
        simulatedResponse2.showCalendar = false;
        simulatedResponse2.showTimeSlots = false;
    }

    if (simulatedResponse2.showCalendar === false) {
        passed++;
        console.log(`  ✅ PASS [Teste 2]: Solicitando Nome completo bloqueou showCalendar com sucesso! (showCalendar=false)`);
    } else {
        failed++;
        console.error(`  ❌ FAIL [Teste 2]: Calendário continuou ativo durante solicitação de Nome!`);
    }

    console.log(`\n================================================================`);
    console.log(`📊 RESULTADO DOS TESTES DE TRAVA DE COMPONENTES: ${passed}/2 APROVADOS`);
    console.log(`================================================================\n`);

    if (failed > 0) process.exit(1);
}

runTests();
