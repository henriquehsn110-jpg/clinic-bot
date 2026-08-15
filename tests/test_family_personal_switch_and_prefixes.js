require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function testFamilyPersonalSwitchAndPrefixes() {
    console.log("==================================================================");
    console.log("🧪 CLINICABOT — TESTE: FLUXO DE DEPENDENTE & TROCA PARA PESSOAL");
    console.log("==================================================================");

    const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
    const testPhone = `55119${randomDigits}`;

    const clinics = await db.clinics.getAll();
    const testClinic = clinics[0];
    if (!testClinic) {
        console.error("❌ ERRO: Nenhuma clínica encontrada.");
        process.exit(1);
    }
    const clinicId = testClinic.id;

    try {
        console.log(`\n[PREPARAÇÃO] Inicializando sessão limpa para (${testPhone})...`);
        await db.sessions.delete(testPhone, clinicId).catch(() => {});
        await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

        // ── TESTE 1: Iniciar agendamento para mãe com nome na mesma frase ──
        console.log("\n[TESTE 1] Enviando: 'Agora quero agendar para minha mãe, Raquel Pereira da Silva'...");
        const res1 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Agora quero agendar para minha mãe, Raquel Pereira da Silva",
            isSimulation: true,
            clinicId: clinicId
        });

        console.log(`  🤖 Resposta Bot: "${res1.text}"`);

        const draft1 = await db.sessions.getDraft(testPhone, clinicId);
        console.log(`  📊 Draft Check: is_family_booking=${draft1.is_family_booking}, dependentName="${draft1.dependentName}"`);

        if (!draft1.is_family_booking) {
            throw new Error("TESTE 1 FALHOU: is_family_booking deveria ser true.");
        }
        if (draft1.dependentName !== "Raquel Pereira da Silva") {
            throw new Error(`TESTE 1 FALHOU: dependentName deveria ser 'Raquel Pereira da Silva', obtido: '${draft1.dependentName}'`);
        }
        if (!res1.text.toLowerCase().includes("cpf do dependente")) {
            throw new Error("TESTE 1 FALHOU: Bot deveria ter solicitado o CPF do dependente.");
        }
        console.log("  ✅ PASS: Nome 'Raquel Pereira da Silva' extraído com sucesso na 1ª mensagem e CPF solicitado!");

        // ── TESTE 2: Troca explícita para agendamento pessoal ──
        console.log("\n[TESTE 2] Enviando troca para pessoal: 'Quero agendar pra mim agora'...");
        const res2 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Quero agendar pra mim agora",
            isSimulation: true,
            clinicId: clinicId
        });

        console.log(`  🤖 Resposta Bot: "${res2.text}"`);

        const draft2 = await db.sessions.getDraft(testPhone, clinicId);
        console.log(`  📊 Draft Check: is_family_booking=${draft2.is_family_booking}, dependentName=${draft2.dependentName}`);

        if (Boolean(draft2.is_family_booking) !== false) {
            throw new Error("TESTE 2 FALHOU: is_family_booking deveria ter sido resetado para false.");
        }
        if (draft2.dependentName) {
            throw new Error("TESTE 2 FALHOU: dependentName deveria ter sido resetado para null.");
        }
        if (!res2.showProceduresList && !res2.text.toLowerCase().includes("procedimento")) {
            throw new Error("TESTE 2 FALHOU: Bot deveria ter exibido a lista de procedimentos.");
        }
        console.log("  ✅ PASS: Fluxo trocado para agendamento pessoal com sucesso!");

        // ── TESTE 3: Extração de nome com prefixo 'Eu sou o Henrique' ──
        console.log("\n[TESTE 3] Reiniciando agendamento familiar com prefixo 'Eu sou o Henrique'...");
        await db.sessions.delete(testPhone, clinicId).catch(() => {});
        await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

        await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Agendar p/ Outro",
            isSimulation: true,
            clinicId: clinicId
        });

        const res3 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Eu sou o Henrique",
            isSimulation: true,
            clinicId: clinicId
        });

        console.log(`  🤖 Resposta Bot: "${res3.text}"`);

        const draft3 = await db.sessions.getDraft(testPhone, clinicId);
        console.log(`  📊 Draft Check: dependentName="${draft3.dependentName}"`);

        if (draft3.dependentName !== "Henrique") {
            throw new Error(`TESTE 3 FALHOU: dependentName deveria ser 'Henrique', obtido: '${draft3.dependentName}'`);
        }
        console.log("  ✅ PASS: Prefixo 'Eu sou o' removido e nome 'Henrique' extraído corretamente!");

        // ── TESTE 4: Troca de intenção mid-flow com CPF parcial/inválido de 10 dígitos ──
        console.log("\n[TESTE 4] Mid-flow reset: 'Agendar p/ Outro' -> Nome -> CPF 10 dígitos (parcial) -> 'Quero agendar pra mim agora'...");
        await db.sessions.delete(testPhone, clinicId).catch(() => {});
        await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

        await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Agendar p/ Outro",
            isSimulation: true,
            clinicId: clinicId
        });

        await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Carlos da Silva",
            isSimulation: true,
            clinicId: clinicId
        });

        // Envia CPF inválido de 10 dígitos (Gate 2 deve rejeitar)
        const resCpf10 = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "1234567890",
            isSimulation: true,
            clinicId: clinicId
        });
        console.log(`  🤖 Resposta Bot (CPF 10 dígs): "${resCpf10.text.substring(0, 70)}..."`);

        const draftCpf10 = await db.sessions.getDraft(testPhone, clinicId);
        console.log(`  📊 Draft Check (Intermediário): is_family_booking=${draftCpf10.is_family_booking}, dependentName="${draftCpf10.dependentName}"`);

        // Alterna a intenção mid-flow no Gate 2
        const resSwitchMid = await conversationController.handleIncomingMessage({
            phone: testPhone,
            messageText: "Quero agendar pra mim agora",
            isSimulation: true,
            clinicId: clinicId
        });
        console.log(`  🤖 Resposta Bot (Mid-flow Switch): "${resSwitchMid.text.substring(0, 70)}..."`);

        const draftMidWiped = await db.sessions.getDraft(testPhone, clinicId);
        console.log(`  📊 Draft Check (Wiped): is_family_booking=${draftMidWiped.is_family_booking}, dependentName=${draftMidWiped.dependentName}, dependentCpf=${draftMidWiped.dependentCpf}`);

        if (Boolean(draftMidWiped.is_family_booking) !== false) {
            throw new Error("TESTE 4 FALHOU: is_family_booking deveria ser false após troca mid-flow.");
        }
        if (draftMidWiped.dependentName) {
            throw new Error("TESTE 4 FALHOU: dependentName deveria ser null após troca mid-flow.");
        }
        if (draftMidWiped.dependentCpf) {
            throw new Error("TESTE 4 FALHOU: dependentCpf deveria ser null após troca mid-flow.");
        }
        console.log("  ✅ PASS: Estado de dependente parcialmente preenchido com CPF inválido foi 100% resetado após troca de intenção mid-flow!");

        console.log("\n==================================================================");
        console.log("🎉 TODOS OS TESTES DE TROCA E EXTRAÇÃO DE NOMES FORAM APROVADOS!");
        console.log("==================================================================");

        await db.sessions.delete(testPhone, clinicId).catch(() => {});
    } catch (err) {
        console.error(`\n❌ ERRO NO TESTE: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
}

testFamilyPersonalSwitchAndPrefixes();
