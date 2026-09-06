/**
 * TESTE DE REGRESSÃO E FIX DOS BUGS IDENTIFICADOS NOS LOGS REAIS
 * 1. Sanitização e Alinhamento Estrito do Histórico para Gemini SDK
 * 2. Precedência de Match Exato em matchProcedureFromText (anti-falso-positivo em Implante Dental)
 * 3. Tolerância a Formatações Móveis de CPF em extractAndNormalizeCpf (ex: 128.617.928.92)
 * 4. Determinismo e Completude no Passo 4 (Solicitação de CPF sem truncamento)
 */
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env.staging') });
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const aiService = require('../services/aiService');
const db = require('../services/databaseService');

async function runBugfixesTest() {
    console.log('================================================================');
    console.log('🧪 SUÍTE DE TESTES: CORREÇÕES DOS BUGS IDENTIFICADOS NOS LOGS REAIS');
    console.log('================================================================\n');

    // ── TESTE 1: SANITIZADOR DE HISTÓRICO PARA O GEMINI SDK ──────────────────
    console.log('1. Testando Sanitização e Alinhamento de Histórico para Gemini SDK...');
    const malformedHistory = [
        { role: 'model', parts: [{ text: 'Mensagem de modelo no início (inválida para SDK)' }] },
        { role: 'model', parts: [{ text: 'Segunda mensagem consecutiva do modelo' }] },
        { role: 'user', parts: [{ text: 'Olá, quero agendar' }] },
        { role: 'model', parts: [{ text: 'Qual procedimento?' }] },
        { role: 'user', parts: [{ text: 'Limpeza' }] },
        { role: 'user', parts: [{ text: '02/09/2026' }] }
    ];

    const sanitized = aiService.sanitizeHistoryForGemini(malformedHistory, 10);
    assert.ok(sanitized.length > 0, 'Histórico sanitizado não deve ser vazio');
    assert.strictEqual(sanitized[0].role, 'user', 'Histórico deve começar obrigatoriamente com user');
    
    // Verifica alternância estrita
    for (let i = 1; i < sanitized.length; i++) {
        assert.notStrictEqual(sanitized[i].role, sanitized[i - 1].role, `Papéis não devem ser iguais em turnos adjacentes (idx ${i})`);
    }
    // Verifica que a última mensagem do histórico sanitizado é 'model'
    assert.strictEqual(sanitized[sanitized.length - 1].role, 'model', 'Última mensagem do histórico deve ser model');
    console.log('   ✅ Sanitizador de histórico garante 100% de conformidade com Gemini SDK');

    // ── TESTE 2: EXTRAÇÃO DE CPF COM FORMATOS MÓVEIS VARIADOS ────────────────
    console.log('\n2. Testando Tolerância a Formatações de CPF em Teclados Móveis...');
    const testPhone = '5511999998877';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // Gerador de CPF válido
    function generateValidCpf() {
        const rnd = () => Math.floor(Math.random() * 9);
        const d = Array.from({ length: 9 }, rnd);
        let s1 = 0; for (let i = 0; i < 9; i++) s1 += d[i] * (10 - i);
        let r1 = 11 - (s1 % 11); if (r1 >= 10) r1 = 0;
        d.push(r1);
        let s2 = 0; for (let i = 0; i < 10; i++) s2 += d[i] * (11 - i);
        let r2 = 11 - (s2 % 11); if (r2 >= 10) r2 = 0;
        d.push(r2);
        return d.join('');
    }

    const rawDigits = generateValidCpf();
    const dotsFormat = `${rawDigits.slice(0,3)}.${rawDigits.slice(3,6)}.${rawDigits.slice(6,9)}.${rawDigits.slice(9,11)}`; // ex: 128.617.928.92
    const expectedFormatted = `${rawDigits.slice(0,3)}.${rawDigits.slice(3,6)}.${rawDigits.slice(6,9)}-${rawDigits.slice(9,11)}`;

    // Reseta sessão para teste e limpa paciente
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);
    let patient = await db.patients.findByPhone(testPhone, clinicId);
    if (patient) {
        await db.supabase.from('patients').update({ name: 'Lucas Andrade', cpf: null, cpf_hash: null }).eq('id', patient.id);
    } else {
        await db.patients.findOrCreate(testPhone, clinicId);
        await db.patients.updateName(testPhone, 'Lucas Andrade', clinicId);
    }

    // Avança o fluxo naturalmente até o pedido de CPF
    await conversationController.handleIncomingMessage(testPhone, 'Quero agendar uma Limpeza', true, clinicId, '999888777');
    await conversationController.handleIncomingMessage(testPhone, '10/09/2026', true, clinicId, '999888777');
    const resTime = await conversationController.handleIncomingMessage(testPhone, '14:00', true, clinicId, '999888777');
    assert.strictEqual(resTime.requireCpf, true, 'Deve solicitar CPF no Passo 4');

    // Envia CPF com pontos móveis (ex: 128.617.928.92)
    const resCpfDots = await conversationController.handleIncomingMessage(testPhone, dotsFormat, true, clinicId, '999888777');
    const draftAfterDots = await db.sessions.getDraft(testPhone, clinicId);
    assert.strictEqual(draftAfterDots.cpf, expectedFormatted, `Esperava CPF formatado '${expectedFormatted}', obteve '${draftAfterDots.cpf}'`);
    assert.ok(resCpfDots.text.includes('Confirmando o seu agendamento') || resCpfDots.text.includes('nome completo'), 'Deve avançar no fluxo pós-CPF');
    console.log(`   ✅ CPF com formato de múltiplos pontos móveis (${dotsFormat}) aceito e formatado para '${expectedFormatted}'`);

    // ── TESTE 3: DESAMBIGUAÇÃO vs MATCH EXATO DE PROCEDIMENTOS ────────────────
    console.log('\n3. Testando Precedência de Match Exato e Anti-Falso-Positivo...');
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);

    // Usuário diz: "Quero agendar um implante dental"
    // Não deve abrir lista de desambiguação ("Qual você gostaria: Limpeza Dental ou Implante...")
    const resExactProc = await conversationController.handleIncomingMessage(testPhone, 'Quero agendar um implante dental', true, clinicId, '999888777');
    const draftExact = await db.sessions.getDraft(testPhone, clinicId);
    assert.ok(draftExact.type === 'Implante' || draftExact.type === 'Implante Dental', `Esperava draft.type Implante/Implante Dental, obteve '${draftExact.type}'`);
    assert.strictEqual(draftExact.ambiguous_procedures, null, 'Não deve ter procedimentos ambíguos em match exato');
    console.log(`   ✅ "Quero agendar um implante dental" selecionou "${draftExact.type}" sem desambiguação indevida`);

    // Usuário diz: "Quero Limpeza e Clareamento" (intenção genuína dupla)
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);
    const resMultiProc = await conversationController.handleIncomingMessage(testPhone, 'Quero Limpeza e Clareamento', true, clinicId, '999888777');
    const draftMulti = await db.sessions.getDraft(testPhone, clinicId);
    assert.strictEqual(draftMulti.type, null, 'draft.type deve ser null em intenção múltipla');
    assert.ok(resMultiProc.text.includes('Qual você gostaria de agendar primeiro'), 'Deve solicitar desambiguação em intenção múltipla real');
    console.log('   ✅ "Quero Limpeza e Clareamento" solicitou desambiguação determinística');

    // ── TESTE 4: COMPLETUDE E DETERMINISMO NO PASSO 4 (SOLICITAÇÃO DE CPF) ────
    console.log('\n4. Testando Determinismo da Mensagem de Solicitação de CPF (Passo 4)...');
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.supabase.from('patients').update({ cpf: null, cpf_hash: null }).eq('phone', testPhone);

    await conversationController.handleIncomingMessage(testPhone, 'Quero agendar uma Limpeza', true, clinicId, '999888777');
    await conversationController.handleIncomingMessage(testPhone, '15/09/2026', true, clinicId, '999888777');
    const resStep4 = await conversationController.handleIncomingMessage(testPhone, '13:00', true, clinicId, '999888777');
    assert.strictEqual(resStep4.requireCpf, true, 'requireCpf deve ser true');
    assert.deepStrictEqual(resStep4.buttons, [], 'Botões devem ser vazios na coleta de CPF');
    assert.ok(resStep4.text.includes('informe o seu CPF (11 dígitos)'), `Texto não deve estar truncado. Obteve: '${resStep4.text}'`);
    console.log('   ✅ Mensagem do Passo 4 emitida deterministicamente e sem truncamento');

    console.log('\n================================================================');
    console.log('🎉 TODOS OS 4 TESTES DE CORREÇÃO DOS LOGS PASSARAM COM SUCESSO (100% PASS)!');
    console.log('================================================================\n');
}

runBugfixesTest()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ FALHA NO TESTE:', err);
        process.exit(1);
    });
