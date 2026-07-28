process.env.NODE_ENV = 'test';
require('dotenv').config();
const conversationController = require('../controllers/conversationController');

const CLINIC_ID = 'e8f24abe-381d-499d-9596-252507b32194';

function getUniquePhone(prefix) {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `55119${prefix}${randomDigits}`;
}

function generateValidCpf() {
    const n = Array.from({length: 9}, () => Math.floor(Math.random() * 10));
    let d1 = n.reduce((s, v, i) => s + v * (10 - i), 0);
    d1 = 11 - (d1 % 11);
    if (d1 >= 10) d1 = 0;
    let d2 = n.concat(d1).reduce((s, v, i) => s + v * (11 - i), 0);
    d2 = 11 - (d2 % 11);
    if (d2 >= 10) d2 = 0;
    return n.join('') + d1 + d2;
}

async function runScenarioTests() {
    console.log("================================================================");
    console.log("🧪 CLINICABOT — SUÍTE DE SIMULAÇÃO DE PERSONAS E CASOS DE BORDA (100% PERFEITA)");
    console.log("================================================================\n");

    let totalPassed = 0;
    let totalFailed = 0;

    async function assertStep(persona, phone, message, checkFn) {
        try {
            const resp = await conversationController.handleIncomingMessage(phone, message, true, CLINIC_ID);
            const pass = checkFn(resp);
            if (pass) {
                console.log(`  ✅ [${persona}] Msg: "${message.substring(0, 35)}..." -> PASS`);
                return true;
            } else {
                console.log(`  ❌ [${persona}] Msg: "${message}" -> FAIL. Response text:`, resp.text);
                totalFailed++;
                return false;
            }
        } catch (err) {
            console.log(`  ❌ [${persona}] Msg: "${message}" -> EXCEPTION:`, err.message);
            totalFailed++;
            return false;
        }
    }

    const p1Cpf = generateValidCpf();
    const p3Cpf = generateValidCpf();

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 1: O Paciente Rápido (Happy Path Completo)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 1] Paciente Rápido (Happy Path Completo)");
    const p1 = getUniquePhone('10');
    let p1Ok = true;
    p1Ok = await assertStep("Persona 1", p1, "Olá", r => r.buttons && r.buttons.includes("Agendar Consulta")) && p1Ok;
    p1Ok = await assertStep("Persona 1", p1, "Agendar Consulta", r => r.showProceduresList && r.procedures.includes("Limpeza")) && p1Ok;
    p1Ok = await assertStep("Persona 1", p1, "Limpeza", r => r.showCalendar) && p1Ok;
    p1Ok = await assertStep("Persona 1", p1, "08/08/2026", r => r.showTimeSlots && r.availableSlots.length > 0) && p1Ok;
    p1Ok = await assertStep("Persona 1", p1, "10:00", r => r.requireCpf) && p1Ok;
    p1Ok = await assertStep("Persona 1", p1, p1Cpf, r => r.text.includes("nome completo")) && p1Ok;
    p1Ok = await assertStep("Persona 1", p1, "Carlos da Silva", r => r.buttons && r.buttons.includes("Confirmar")) && p1Ok;
    p1Ok = await assertStep("Persona 1", p1, "Confirmar", r => r.text.includes("Agendamento confirmado") && r.buttons.length === 0) && p1Ok;
    if (p1Ok) { console.log("  🎉 Persona 1 100% APROVADA!\n"); totalPassed++; }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 2: O Paciente Indeciso (Dúvidas de Preço & Convênio antes de Agendar)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 2] Paciente Indeciso (Dúvidas sobre Convênio & Escolha de Médico)");
    const p2 = getUniquePhone('20');
    let p2Ok = true;
    p2Ok = await assertStep("Persona 2", p2, "Olá", r => r.buttons.length > 0) && p2Ok;
    p2Ok = await assertStep("Persona 2", p2, "Boa noite, vocês aceitam convênio Bradesco?", r => r.text.length > 10) && p2Ok;
    p2Ok = await assertStep("Persona 2", p2, "Quero agendar consulta geral", r => r.showDoctorList || r.showCalendar) && p2Ok;
    p2Ok = await assertStep("Persona 2", p2, "Dra. Juliana Mendes", r => r.showCalendar || r.showTimeSlots) && p2Ok;
    if (p2Ok) { console.log("  🎉 Persona 2 100% APROVADA!\n"); totalPassed++; }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 3: Paciente com Erro de Digitação de CPF (Recuperação Graciosa)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 3] Paciente com Erro de CPF (Validação & Recuperação)");
    const p3 = getUniquePhone('30');
    let p3Ok = true;
    p3Ok = await assertStep("Persona 3", p3, "Olá", r => r.buttons.length > 0) && p3Ok;
    p3Ok = await assertStep("Persona 3", p3, "Agendar Consulta", r => r.showProceduresList) && p3Ok;
    p3Ok = await assertStep("Persona 3", p3, "Limpeza", r => r.showCalendar) && p3Ok;
    p3Ok = await assertStep("Persona 3", p3, "08/08/2026", r => r.showTimeSlots) && p3Ok;
    p3Ok = await assertStep("Persona 3", p3, "14:00", r => r.requireCpf) && p3Ok;
    p3Ok = await assertStep("Persona 3", p3, "111.111.111-11", r => r.text.includes("inválido") && r.requireCpf) && p3Ok;
    p3Ok = await assertStep("Persona 3", p3, p3Cpf, r => r.text.includes("nome completo")) && p3Ok;
    if (p3Ok) { console.log("  🎉 Persona 3 100% APROVADA!\n"); totalPassed++; }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 3.5: Paciente Usando CPF de Outro Número (Trava de Segurança LGPD)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 3.5] Paciente Usando CPF de Outro Telefone (Bloqueio LGPD & Handoff)");
    const p35 = getUniquePhone('35');
    let p35Ok = true;
    p35Ok = await assertStep("Persona 3.5", p35, "Olá", r => r.buttons.length > 0) && p35Ok;
    p35Ok = await assertStep("Persona 3.5", p35, "Agendar Consulta", r => r.showProceduresList) && p35Ok;
    p35Ok = await assertStep("Persona 3.5", p35, "Limpeza", r => r.showCalendar) && p35Ok;
    p35Ok = await assertStep("Persona 3.5", p35, "08/08/2026", r => r.showTimeSlots) && p35Ok;
    p35Ok = await assertStep("Persona 3.5", p35, "15:00", r => r.requireCpf) && p35Ok;
    p35Ok = await assertStep("Persona 3.5", p35, p1Cpf, r => r.transferToHuman && r.text.includes("segurança")) && p35Ok;
    if (p35Ok) { console.log("  🎉 Persona 3.5 100% APROVADA!\n"); totalPassed++; }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 4: Paciente com Emergência / Dor Insuportável (Triagem para Handoff)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 4] Paciente com Emergência (Triagem & Handoff)");
    const p4 = getUniquePhone('40');
    let p4Ok = true;
    p4Ok = await assertStep("Persona 4", p4, "Olá", r => r.buttons.length > 0) && p4Ok;
    p4Ok = await assertStep("Persona 4", p4, "Estou com uma dor insuportável no dente e sangrando muito! Preciso de um médico agora!", r => r.transferToHuman || r.text.toLowerCase().includes("atendente") || r.text.toLowerCase().includes("humano")) && p4Ok;
    if (p4Ok) { console.log("  🎉 Persona 4 100% APROVADA!\n"); totalPassed++; }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 5: Pedido Direto de Falar com Atendente Humano
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 5] Pedido Direto de Atendente Humano");
    const p5 = getUniquePhone('50');
    let p5Ok = true;
    p5Ok = await assertStep("Persona 5", p5, "Olá", r => r.buttons.length > 0) && p5Ok;
    p5Ok = await assertStep("Persona 5", p5, "Quero falar com uma pessoa da recepção", r => r.transferToHuman || r.text.toLowerCase().includes("atendente")) && p5Ok;
    if (p5Ok) { console.log("  🎉 Persona 5 100% APROVADA!\n"); totalPassed++; }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 6: Procedimento 'Outro' com Descrição Customizada
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 6] Procedimento 'Outro' com Descrição Personalizada");
    const p6 = getUniquePhone('60');
    let p6Ok = true;
    p6Ok = await assertStep("Persona 6", p6, "Olá", r => r.buttons.length > 0) && p6Ok;
    p6Ok = await assertStep("Persona 6", p6, "Agendar Consulta", r => r.showProceduresList) && p6Ok;
    p6Ok = await assertStep("Persona 6", p6, "Outro", r => r.text.toLowerCase().includes("descreva") || r.text.toLowerCase().includes("sentindo")) && p6Ok;
    p6Ok = await assertStep("Persona 6", p6, "Tenho um dente da frente quebrou e preciso de faceta estética", r => r.showCalendar || r.text.toLowerCase().includes("data")) && p6Ok;
    if (p6Ok) { console.log("  🎉 Persona 6 100% APROVADA!\n"); totalPassed++; }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 7: Troca de Médico Durante a Seleção
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 7] Troca de Médico Durante a Escolha");
    const p7 = getUniquePhone('70');
    let p7Ok = true;
    p7Ok = await assertStep("Persona 7", p7, "Olá", r => r.buttons.length > 0) && p7Ok;
    p7Ok = await assertStep("Persona 7", p7, "Consulta geral", r => r.showDoctorList || r.showCalendar) && p7Ok;
    p7Ok = await assertStep("Persona 7", p7, "Dr. Carlos Eduardo", r => r.showCalendar) && p7Ok;
    p7Ok = await assertStep("Persona 7", p7, "Mudei de ideia, prefiro com a Dra. Juliana Mendes", r => r.text.includes("Juliana") || r.showCalendar || r.showTimeSlots) && p7Ok;
    if (p7Ok) { console.log("  🎉 Persona 7 100% APROVADA!\n"); totalPassed++; }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONA 8: Mensagem Aleatória / Fora de Contexto
    // ─────────────────────────────────────────────────────────────────────────
    console.log("🔹 [Persona 8] Digitação Aleatória / Fora de Contexto");
    const p8 = getUniquePhone('80');
    let p8Ok = true;
    p8Ok = await assertStep("Persona 8", p8, "Olá", r => r.buttons.length > 0) && p8Ok;
    p8Ok = await assertStep("Persona 8", p8, "xyzw1239999", r => r.text.length > 10 && !r.transferToHuman) && p8Ok;
    if (p8Ok) { console.log("  🎉 Persona 8 100% APROVADA!\n"); totalPassed++; }

    console.log("================================================================");
    console.log(`📊 RESUMO FINAL DE TESTES DE SIMULAÇÃO: ${totalPassed}/9 PERSONAS APROVADAS COM 100% DE SUCESSO`);
    console.log("================================================================\n");

    if (totalFailed > 0) {
        process.exit(1);
    }
}

runScenarioTests();
