/**
 * test_production_log_1308_replay.js
 * 
 * Reprodução fiel do cenário do log de produção de 13/08:
 * - Turno 1: "Agendar p/ Outro" -> Bot pede nome do dependente
 * - Turno 2: "Raquel Pereira da Silva" -> Bot pede CPF do dependente
 * - Turno 3: "1233455668" (10 dígitos) -> Bot avisa CPF inválido e pede novamente
 * - Turno 4: "529.982.247-25" (CPF válido) -> Bot aceita e avança
 * - Turno 5: "Limpeza" -> Bot seleciona procedimento e abre calendário (showCalendar: true)
 * - Turno 6: "Selecionei a data: 2026-10-20" -> Bot seleciona data e exibe horários (showTimeSlots: true)
 * - Turno 7: "Selecionei o horário: 14:00" -> Bot exibe botões [Confirmar, Agendar p/ Outro, Alterar]
 * - Turno 8: "Confirmar" -> Agendamento criado com sucesso, rascunho limpo e sem silêncio/campos nulos.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.staging') });
if (!process.env.SUPABASE_URL) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function replayProductionLog() {
    console.log('================================================================');
    console.log('🧪 [REPLAY LOG 13/08] Reprodução Completa do Cenário de Produção');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const phone = '5511988887713';
    const phoneNumberId = '5511979992719';

    // Limpa estado anterior
    await db.sessions.delete(phone, clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    // TURNO 1: "Agendar p/ Outro"
    console.log('[Turno 1] Usuário: "Agendar p/ Outro"');
    const t1 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Agendar p/ Outro', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Bot: "${t1.text.substring(0, 80)}..."`);
    assert.ok(t1.text.toLowerCase().includes('nome'), 'Turno 1: Deve pedir nome');
    let draft = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft.is_family_booking, true, 'Turno 1: is_family_booking deve ser true');
    console.log('  ✅ PASS: Pediu nome do dependente e ativou family booking.\n');

    // TURNO 2: "Raquel Pereira da Silva"
    console.log('[Turno 2] Usuário: "Raquel Pereira da Silva"');
    const t2 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Raquel Pereira da Silva', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Bot: "${t2.text.substring(0, 80)}..."`);
    assert.ok(t2.text.includes('Raquel Pereira da Silva'), 'Turno 2: Deve conter o nome confirmado');
    assert.ok(t2.text.toLowerCase().includes('cpf') || t2.requireCpf === true, 'Turno 2: Deve pedir CPF');
    draft = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft.dependentName, 'Raquel Pereira da Silva', 'Turno 2: dependentName gravado');
    console.log('  ✅ PASS: Nome gravado e CPF solicitado com escape buttons.\n');

    // TURNO 3: "1233455668" (10 dígitos)
    console.log('[Turno 3] Usuário: "1233455668" (CPF incompleto com 10 dígitos)');
    const t3 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: '1233455668', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Bot: "${t3.text.substring(0, 80)}..."`);
    assert.strictEqual(t3.requireCpf, true, 'Turno 3: requireCpf deve ser true');
    assert.ok(t3.text.includes('inválido'), 'Turno 3: Mensagem deve alertar sobre CPF inválido');
    draft = await db.sessions.getDraft(phone, clinicId);
    assert.ok(!draft.dependentCpf, 'Turno 3: dependentCpf não deve ter sido preenchido com dado inválido');
    console.log('  ✅ PASS: CPF de 10 dígitos bloqueado sem travar ou aceitar dado inválido.\n');

    // TURNO 4: "529.982.247-25" (CPF válido)
    console.log('[Turno 4] Usuário: "529.982.247-25" (CPF válido)');
    const t4 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: '529.982.247-25', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Bot: "${t4.text.substring(0, 80)}..."`);
    draft = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft.dependentCpf, '529.982.247-25', 'Turno 4: dependentCpf preenchido');
    console.log('  ✅ PASS: CPF válido registrado no rascunho com sucesso.\n');

    // TURNO 5: "Limpeza" (Procedimento)
    console.log('[Turno 5] Usuário: "Limpeza"');
    const t5 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Limpeza', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Bot: "${t5.text.substring(0, 80)}..."`);
    console.log(`  📊 showCalendar: ${t5.showCalendar}`);
    assert.strictEqual(t5.showCalendar, true, 'Turno 5: Calendário deve ser exibido');
    draft = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft.type, 'Limpeza', 'Turno 5: Procedimento registrado');
    console.log('  ✅ PASS: Procedimento selecionado e calendário aberto sem silêncio.\n');

    // TURNO 6: "Selecionei a data: 2026-10-20"
    console.log('[Turno 6] Usuário: "Selecionei a data: 2026-10-20"');
    const t6 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Selecionei a data: 2026-10-20', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Bot: "${t6.text.substring(0, 80)}..."`);
    console.log(`  📊 showTimeSlots: ${t6.showTimeSlots}`);
    assert.strictEqual(t6.showTimeSlots, true, 'Turno 6: Horários devem ser exibidos');
    draft = await db.sessions.getDraft(phone, clinicId);
    assert.strictEqual(draft.date, '2026-10-20', 'Turno 6: Data gravada');
    console.log('  ✅ PASS: Data selecionada e horários exibidos.\n');

    // TURNO 7: "Selecionei o horário: 14:00"
    console.log('[Turno 7] Usuário: "Selecionei o horário: 14:00"');
    const t7 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Selecionei o horário: 14:00', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Bot: "${t7.text.substring(0, 80)}..."`);
    console.log(`  📊 buttons: [${t7.buttons ? t7.buttons.join(', ') : ''}]`);
    assert.ok(t7.buttons && t7.buttons.includes('Confirmar'), 'Turno 7: Botões de confirmação exibidos');
    console.log('  ✅ PASS: Dados completos e botões de confirmação renderizados.\n');

    // TURNO 8: "Confirmar"
    console.log('[Turno 8] Usuário: "Confirmar"');
    const t8 = await conversationController.handleIncomingMessage({
        phone, clinicId, messageText: 'Confirmar', phoneNumberId, isSimulation: true
    });
    console.log(`  🤖 Bot: "${t8.text.substring(0, 80)}..."`);
    assert.ok(t8.text.includes('confirmado') || t8.text.includes('Agendamento confirmado'), 'Turno 8: Confirmação efetuada');
    const finalDraft = await db.sessions.getDraft(phone, clinicId);
    console.log(`  📊 Draft pós-confirmação: ${JSON.stringify(finalDraft)}`);
    assert.strictEqual(Object.keys(finalDraft).length, 0, 'Turno 8: Draft deve estar 100% limpo');
    console.log('  ✅ PASS: Agendamento finalizado com sucesso e rascunho purgado!\n');

    console.log('================================================================');
    console.log('🎉 REPLAY COMPLETO DO CENÁRIO DE PRODUÇÃO (13/08) 100% APROVADO!');
    console.log('================================================================\n');

    // Cleanup final
    await db.sessions.delete(phone, clinicId).catch(() => {});
}

replayProductionLog().catch(err => {
    console.error('❌ ERRO NO REPLAY DE PRODUÇÃO:', err);
    process.exit(1);
});
