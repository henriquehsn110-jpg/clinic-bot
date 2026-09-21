/**
 * TESTE DE REGRESSÃO DE BUGS DE AGENDAMENTO FAMILIAR & VALIDAÇÃO DE CPF
 * 
 * Valida que:
 * 1. Recusa de nome/CPF no agendamento familiar ("Não quero informar", "Desisti") cancela o fluxo familiar,
 *    reseta draft.is_family_booking = false e retorna botões de escape ["Agendar para mim", "Falar com atendente", "Cancelar agendamento"].
 * 2. Informar o próprio CPF de titular durante agendamento familiar é REJEITADO (Regra 17) pedindo o CPF específico do dependente.
 * 3. Informar um CPF pertencente a outro telefone aciona o Handoff Humano de Segurança LGPD (CPF_CONFLICT / transferToHuman: true).
 */
require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    let d2 = [...n, d1].reduce((total, num, i) => total + num * (11 - i), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    return `${n.slice(0,3).join('')}.${n.slice(3,6).join('')}.${n.slice(6,9).join('')}-${d1}${d2}`;
}

async function run() {
    console.log('🧪 [TEST_FAMILY_BOOKING_FIXES] Iniciando testes de regressão dos bugs de agendamento familiar e CPF...');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // ── TESTE 1: Recusa de Nome no Agendamento Familiar ("Não quero informar") ──────────────
    console.log('\n[Cenário 1/3] Testando recusa de nome no agendamento familiar...');
    const phoneRefusal = '5511999990099';
    await db.sessions.set(phoneRefusal, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phoneRefusal, null, clinicId).catch(() => {});

    // Inicia agendamento familiar
    await conversationController.handleIncomingMessage({
        phone: phoneRefusal,
        messageText: 'Quero agendar para minha esposa',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draftAfterStart = await db.sessions.getDraft(phoneRefusal, clinicId);
    assert.strictEqual(draftAfterStart?.is_family_booking, true, 'Deveria ter ativado is_family_booking');

    // Envia recusa ("Não quero informar")
    const respRefusal = await conversationController.handleIncomingMessage({
        phone: phoneRefusal,
        messageText: 'Não quero informar',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draftAfterRefusal = await db.sessions.getDraft(phoneRefusal, clinicId);
    assert.strictEqual(Boolean(draftAfterRefusal?.is_family_booking), false, 'FALHA: Recusa deveria ter resetado is_family_booking para false');
    assert.strictEqual(Object.keys(draftAfterRefusal || {}).length, 0, 'FALHA: Draft no banco deve estar completamente vazio {} após reset');
    assert.strictEqual(respRefusal.buttons.includes('Agendar para mim'), true, 'FALHA: Deveria oferecer botão Agendar para mim na recusa');
    console.log('  ✅ PASS: Recusa de nome cancela agendamento familiar, reseta rascunho e retorna botões de escape!');


    // ── TESTE 2: Rejeição Estrita do CPF do Titular e Aceitação de CPF Próprio do Dependente ──
    console.log('\n[Cenário 2/3] Testando rejeição do CPF do titular no agendamento de dependente...');
    const phoneTitular = '5511999990088';
    const titularCpf = '266.390.128-80';

    await db.patients.findOrCreate(phoneTitular, clinicId);
    await db.sessions.set(phoneTitular, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phoneTitular, null, clinicId).catch(() => {});
    await db.patients.updateCpf(phoneTitular, titularCpf, clinicId).catch(() => {});

    // Inicia agendamento para o filho "Lucas Amaral"
    await conversationController.handleIncomingMessage({
        phone: phoneTitular,
        messageText: 'Quero agendar uma consulta para meu filho Lucas Amaral',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    // Envia o CPF do titular (266.390.128-80) para o filho Lucas Amaral -> DEVE SER REJEITADO
    const respSameCpf = await conversationController.handleIncomingMessage({
        phone: phoneTitular,
        messageText: '26639012880',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draftAfterRejectedCpf = await db.sessions.getDraft(phoneTitular, clinicId);
    assert.strictEqual(Boolean(draftAfterRejectedCpf?.dependentCpf), false, 'FALHA: Não deveria aceitar o CPF do titular no dependentCpf');
    assert.strictEqual(respSameCpf.text.includes('Identifiquei que este é o seu próprio CPF de titular'), true, 'FALHA: Deveria informar que o CPF é do titular');
    assert.strictEqual(respSameCpf.buttons.includes('Agendar para mim'), true, 'FALHA: Deveria oferecer botões de escape');
    console.log('  ✅ PASS: CPF do titular é rejeitado no agendamento do dependente!');

    // Agora envia um CPF exclusivo e válido para o dependente
    const uniqueDepCpf = '529.982.247-25';
    const respUniqueCpf = await conversationController.handleIncomingMessage({
        phone: phoneTitular,
        messageText: uniqueDepCpf,
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    const draftAfterUniqueCpf = await db.sessions.getDraft(phoneTitular, clinicId);
    assert.strictEqual(Boolean(draftAfterUniqueCpf?.dependentCpf), true, 'FALHA: Deveria registrar o CPF único no draft.dependentCpf');
    assert.strictEqual(respUniqueCpf.showProceduresList, true, 'FALHA: Deveria disparar a lista interativa de procedimentos');
    assert.strictEqual(draftAfterUniqueCpf.step, null, 'FALHA: draft.step deveria ser null');
    console.log('  ✅ PASS: CPF exclusivo do dependente é aceito e aciona a lista interativa de procedimentos!');


    // ── TESTE 3: Detecção de Conflito de CPF com Outro Telefone (LGPD) ─────────────────────
    console.log('\n[Cenário 3/3] Testando conflito de CPF cadastrado com outro telefone...');
    const phoneA = '5511988880001';
    const phoneB = '5511988880002';
    const conflictCpf = generateValidCpf();

    await db.patients.findOrCreate(phoneA, clinicId);
    await db.sessions.set(phoneA, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phoneA, null, clinicId).catch(() => {});
    const resA = await db.patients.updateCpf(phoneA, conflictCpf, clinicId);
    console.log('  [DEBUG] phoneA updateCpf result:', resA ? resA.cpf : 'NULL');

    await db.patients.findOrCreate(phoneB, clinicId);
    await db.sessions.set(phoneB, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phoneB, null, clinicId).catch(() => {});

    // Telefone B inicia um agendamento
    await conversationController.handleIncomingMessage({
        phone: phoneB,
        messageText: 'Quero agendar uma consulta',
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    // Telefone B envia o CPF que já pertence ao Telefone A
    const respConflict = await conversationController.handleIncomingMessage({
        phone: phoneB,
        messageText: conflictCpf,
        phoneNumberId: '5511979992719',
        isSimulation: true
    });

    console.log('  [DEBUG] respConflict:', respConflict);
    assert.strictEqual(respConflict.transferToHuman, true, 'FALHA: Conflito de CPF deveria ter acionado Handoff Humano LGPD');
    console.log('  ✅ PASS: Conflito de CPF com outro telefone aciona Handoff Humano de Segurança LGPD!');

    console.log('\n================================================================');
    console.log('🎉 SUÍTE DE REGRESSÃO DE AGENDAMENTO FAMILIAR & CPF 100% APROVADA!');
    console.log('================================================================\n');
}

run().then(() => process.exit(0)).catch(err => {
    console.error('❌ FAIL:', err.message, err.stack);
    process.exit(1);
});
