/**
 * Teste Empírico de Validação dos Bugs Conversacionais do WhatsApp
 * 
 * 1. Bug #1: Frases ("Quero saber quando falarei com o dentista") NÃO podem virar nome do paciente.
 * 2. Bug #2: Saudações ("Boa noite", "Olá") não travam em loop "informe seu nome completo".
 * 3. Bug #3: Xingamentos ("Vai se lascar") não viram nome e disparam transbordo polido silencioso.
 * 4. Bug #4: Respostas como "Decide você" ou "Jurandir mole" ao pedido de nome NÃO viram nome do paciente.
 */

require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runBugfixTests() {
    console.log(`================================================================`);
    console.log(`🧪 TESTE EMPÍRICO — BUGS CONVERSACIONAIS E ANTI-ALUCINAÇÃO DE NOME`);
    console.log(`================================================================\n`);

    const testPhone = '5511977776666';
    let defaultClinic = await db.clinics.findBySlug('clinica-modelo');
    if (!defaultClinic) {
        const clinics = await db.clinics.getAll();
        defaultClinic = clinics[0];
    }
    const clinicId = defaultClinic.id;

    // Garante limpeza de sessões/pacientes de testes anteriores
    const existingP = await db.supabase.from('patients').select('id').eq('phone', testPhone).maybeSingle();
    if (existingP.data) {
        await db.appointments.deleteByPatient(existingP.data.id, clinicId).catch(() => {});
        await db.supabase.from('patients').delete().eq('id', existingP.data.id);
    }
    await db.sessions.delete(testPhone, clinicId);

    // -------------------------------------------------------------
    // TESTE 1: Frase operacional não vira nome de paciente
    // -------------------------------------------------------------
    console.log(`[TESTE 1/5] Frase 'Quero saber quando falarei com o dentista'...`);
    const res1 = await conversationController.handleIncomingMessage(testPhone, "Quero saber quando falarei com o dentista", true, clinicId);
    
    const p1 = await db.patients.findByPhone(testPhone, clinicId);
    if (p1 && (p1.name === "Quero Saber Quando Falarei Com O Dentista" || p1.name?.includes("Dentista"))) {
        console.error(`❌ FAIL: Frase operacional foi gravada como nome no banco: '${p1.name}'`);
        process.exit(1);
    } else {
        console.log(`  ✅ PASS: Frase de dúvida não foi salva como nome. Nome no banco: ${p1?.name || 'null'}`);
    }

    // -------------------------------------------------------------
    // TESTE 2: Insulto / Xingamento ("Vai se lascar") dispara Handoff Polido Silencioso sem virar nome
    // -------------------------------------------------------------
    console.log(`\n[TESTE 2/5] Insulto 'Vai se lascar'...`);
    const res2 = await conversationController.handleIncomingMessage(testPhone, "Vai se lascar", true, clinicId);

    const p2 = await db.patients.findByPhone(testPhone, clinicId);
    if (p2 && p2.name?.includes("Lascar")) {
        console.error(`❌ FAIL: Xingamento foi gravado como nome do paciente no banco: '${p2.name}'`);
        process.exit(1);
    }

    if (res2.transferToHuman && res2.text.includes("Vou transferir você para um de nossos atendentes") && !res2.text.includes("Vai Se Lascar")) {
        console.log(`  ✅ PASS: Transbordo polido ativado sem repetir o xingamento e sem salvar no banco!`);
        console.log(`     Mensagem enviada: "${res2.text}"`);
    } else {
        console.error(`❌ FAIL: Transbordo não foi ativado ou mensagem repetiu insulto: "${res2.text}"`);
        process.exit(1);
    }

    // -------------------------------------------------------------
    // TESTE 3: Saudação ("Boa noite") após conversa antiga não cai no loop de pedir nome
    // -------------------------------------------------------------
    console.log(`\n[TESTE 3/5] Saudação 'Boa noite' após encerramento do fluxo...`);
    await db.sessions.delete(testPhone, clinicId);
    
    const res3 = await conversationController.handleIncomingMessage(testPhone, "Boa noite", true, clinicId);
    if (res3.text.includes("por favor me informe o seu nome completo")) {
        console.error(`❌ FAIL: Bot caiu no loop de pedir nome completo ao receber 'Boa noite'!`);
        process.exit(1);
    } else {
        console.log(`  ✅ PASS: 'Boa noite' respondeu normalmente sem travar no pedido de nome!`);
        console.log(`     Resposta: "${res3.text.substring(0, 80)}..."`);
    }

    // -------------------------------------------------------------
    // TESTE 4: "Decide você" ao ser pedido o nome NÃO vira nome do paciente
    // -------------------------------------------------------------
    console.log(`\n[TESTE 4/5] Resposta 'Decide você' ao pedido de nome...`);
    await db.sessions.delete(testPhone, clinicId);
    // Simula que a mensagem anterior do modelo pediu o nome
    const historyWithNameReq = [
        { role: 'user', parts: [{ text: "Quero agendar uma consulta" }] },
        { role: 'model', parts: [{ text: "Qual é o seu nome completo?" }] }
    ];
    await db.sessions.set(testPhone, historyWithNameReq, clinicId);

    const res4 = await conversationController.handleIncomingMessage(testPhone, "Decide você", true, clinicId);
    const p4 = await db.patients.findByPhone(testPhone, clinicId);
    if (p4 && (p4.name === "Decide Você" || p4.name?.includes("Decide"))) {
        console.error(`❌ FAIL: 'Decide você' foi alucinado e gravado como nome no banco: '${p4.name}'`);
        process.exit(1);
    } else {
        console.log(`  ✅ PASS: 'Decide você' NÃO foi gravado como nome do paciente! Nome no banco: ${p4?.name || 'null'}`);
    }

    // -------------------------------------------------------------
    // TESTE 5: "Jurandir mole" ao ser pedido o nome NÃO vira nome do paciente
    // -------------------------------------------------------------
    console.log(`\n[TESTE 5/5] Resposta 'Jurandir mole' ao pedido de nome...`);
    await db.sessions.delete(testPhone, clinicId);
    await db.sessions.set(testPhone, historyWithNameReq, clinicId);

    const res5 = await conversationController.handleIncomingMessage(testPhone, "Jurandir mole", true, clinicId);
    const p5 = await db.patients.findByPhone(testPhone, clinicId);
    if (p5 && (p5.name === "Jurandir Mole" || p5.name?.includes("Mole"))) {
        console.error(`❌ FAIL: 'Jurandir mole' foi gravado como nome no banco: '${p5.name}'`);
        process.exit(1);
    } else {
        console.log(`  ✅ PASS: 'Jurandir mole' NÃO foi gravado como nome do paciente! Nome no banco: ${p5?.name || 'null'}`);
    }

    // Limpeza final
    const finalP = await db.supabase.from('patients').select('id').eq('phone', testPhone).maybeSingle();
    if (finalP.data) {
        await db.supabase.from('patients').delete().eq('id', finalP.data.id);
    }
    await db.sessions.delete(testPhone, clinicId);

    console.log(`\n================================================================`);
    console.log(`🎉 TODOS OS TESTES ANTI-ALUCINAÇÃO DE NOME FORAM APROVADOS!`);
    console.log(`================================================================`);
    process.exit(0);
}

runBugfixTests().catch(err => {
    console.error('Erro na execução do teste de bugfixes:', err);
    process.exit(1);
});
