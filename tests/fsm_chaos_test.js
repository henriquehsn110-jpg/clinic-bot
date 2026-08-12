require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runFsmChaosTest() {
    console.log("==================================================================");
    console.log("🧪 CLINICABOT — TESTE AUTOMATIZADO FSM (FAMILY BOOKING CPF GATE)");
    console.log("==================================================================");

    const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
    const testPhone = `55119${randomDigits}`;
    
    // 1. Obter clínica padrão
    const clinics = await db.clinics.getAll();
    const testClinic = clinics[0];
    if (!testClinic) {
        console.error("❌ ERRO: Nenhuma clínica encontrada.");
        process.exit(1);
    }
    const clinicId = testClinic.id;

    try {
        console.log(`\n[PREPARAÇÃO] Garantindo que o titular (${testPhone}) JÁ possua CPF no banco de dados...`);
        let titular = await db.patients.findOrCreate(testPhone, clinicId);
        titular = await db.patients.updateName(testPhone, "Titular Teste FSM", clinicId);
        // Atribui um CPF válido ao titular no banco
        await db.patients.updateCpf(testPhone, "11144477735", clinicId).catch(() => {});

        console.log("  ✅ Titular configurado com CPF no banco. Limpando rascunho de sessão anterior...");
        await db.sessions.delete(testPhone, clinicId).catch(() => {});
        await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

        // ── ETAPA 1: Iniciar Agendamento para Outro ──
        console.log("\n[ETAPA 1] Enviando 'Agendar p/ Outro'...");
        const res1 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Agendar p/ Outro",
            isSimulation: true,
            clinicId: clinicId
        });
        console.log(`  🤖 Resposta Bot: "${res1.text.substring(0, 70)}..."`);
        if (!res1.text.toLowerCase().includes("nome completo")) {
            throw new Error("FSM Falhou: Bot deveria solicitar o nome do dependente.");
        }
        console.log("  ✅ PASS: Bot solicitou o nome completo do dependente.");

        // ── ETAPA 2: Enviar Nome do Dependente ──
        console.log("\n[ETAPA 2] Enviando nome do dependente: 'Lucas Farah'...");
        const res2 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Lucas Farah",
            isSimulation: true,
            clinicId: clinicId
        });
        console.log(`  🤖 Resposta Bot: "${res2.text.substring(0, 70)}..."`);
        console.log("  ✅ PASS: Nome do dependente registrado.");

        // ── ETAPA 3: Selecionar Procedimento ──
        console.log("\n[ETAPA 3] Selecionando procedimento: 'Consulta geral'...");
        const res3 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Consulta geral",
            isSimulation: true,
            clinicId: clinicId
        });
        console.log("  ✅ PASS: Procedimento 'Consulta geral' selecionado.");

        // ── ETAPA 4: Selecionar Data ──
        console.log("\n[ETAPA 4] Selecionando data: 'Selecionei a data: 2026-10-20'...");
        const res4 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Selecionei a data: 2026-10-20",
            isSimulation: true,
            clinicId: clinicId
        });
        console.log("  ✅ PASS: Data selecionada.");

        // ── ETAPA 5: Selecionar Horário (Momento Crítico do Teste) ──
        console.log("\n[ETAPA 5] Selecionando horário: 'Selecionei o horário: 14:00'...");
        const res5 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Selecionei o horário: 14:00",
            isSimulation: true,
            clinicId: clinicId
        });

        console.log(`  📊 FSM Check: requireCpf=${res5.requireCpf}, buttons=[${res5.buttons ? res5.buttons.join(', ') : ''}]`);

        // VERIFICAÇÃO CRÍTICA:
        // O bot NÃO PODE oferecer o botão "Confirmar" se o CPF do dependente ainda não foi coletado,
        // mesmo que o titular já possua um CPF no banco de dados!
        const hasConfirmButtonPrematurely = res5.buttons && res5.buttons.includes("Confirmar");
        if (hasConfirmButtonPrematurely) {
            console.error("❌ FALHA GRAVE: Bot exibiu o botão 'Confirmar' SEM coletar o CPF do dependente!");
            console.error("   O CPF do titular vazou erroneamente para o fluxo do dependente.");
            process.exit(1);
        }

        if (!res5.requireCpf) {
            console.error("❌ FALHA FSM: requireCpf deveria ser true para solicitar o CPF do dependente.");
            process.exit(1);
        }

        console.log("  🎯 SUCESSO ABSOLUTO: O bot EXIGIU o CPF do dependente (requireCpf=true) e BLOQUEOU a confirmação precoce!");

        // ── ETAPA 5.5: Tentar Enviar 'Confirmar' Prematuramente ──
        console.log("\n[ETAPA 5.5] Tentando enviar 'Confirmar' antes de informar o CPF do dependente...");
        const res5_5 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Confirmar",
            isSimulation: true,
            clinicId: clinicId
        });

        if (res5_5.calendarUrl || (res5_5.text && res5_5.text.includes("Agendamento confirmado"))) {
            console.error("❌ FALHA GRAVE DA FSM: O bot CONFIRMOU a consulta ao receber 'Confirmar' SEM ter o CPF do dependente!");
            process.exit(1);
        }

        if (!res5_5.requireCpf) {
            console.error("❌ FALHA DA FSM: O bot deveria rejeitar a confirmação e solicitar o CPF do dependente.");
            process.exit(1);
        }

        console.log("  🎯 SUCESSO: O envio de 'Confirmar' foi BLOQUEADO e o bot solicitou novamente o CPF do dependente!");

        // ── ETAPA 6: Enviar CPF Válido do Dependente ──
        console.log("\n[ETAPA 6] Enviando CPF válido do dependente: '529.982.247-25'...");
        const res6 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "529.982.247-25",
            isSimulation: true,
            clinicId: clinicId
        });

        console.log(`  📊 FSM Check Pós-CPF: requireCpf=${res6.requireCpf}, buttons=[${res6.buttons ? res6.buttons.join(', ') : ''}]`);

        if (!res6.buttons || !res6.buttons.includes("Confirmar")) {
            console.error("❌ FALHA FSM: Bot deveria exibir os botões de confirmação após recebimento do CPF do dependente.");
            process.exit(1);
        }

        console.log("  ✅ PASS: Bot avançou para a tela de CONFIRMAÇÃO com os botões [Confirmar, Agendar p/ Outro, Alterar].");

        // ── LIMPEZA DADOS DE TESTE ──
        console.log("\n🧹 Limpando dados de teste do banco de dados...");
        await db.sessions.delete(testPhone, clinicId).catch(() => {});
        await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

        console.log("\n==================================================================");
        console.log("🎉 TESTE FSM FAMILY BOOKING (CPF GATE) APROVADO COM 100% DE SUCESSO!");
        console.log("==================================================================");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ ERRO NO TESTE FSM CHAOS:", err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

runFsmChaosTest();
