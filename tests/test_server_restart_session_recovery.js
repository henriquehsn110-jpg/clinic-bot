/**
 * TESTE DE RECUPERAÇÃO DE SESSÃO APÓS REINÍCIO DO PROCESSO (RENDER CRASH / DEPLOY RESTART)
 * Valida se a sessão e o draft sobrevivem à destruição total da memória do processo
 * e se a nova instância do servidor retoma o fluxo do ponto exato no Supabase.
 */
require('dotenv').config();
const assert = require('assert');
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

async function runTest() {
    console.log('================================================================');
    console.log('🔄 [TEST_RESTART_RECOVERY] Teste de Sobrevivência de Sessão');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194'; // Clínica Modelo
    const testPhone = '5511999' + Math.floor(100000 + Math.random() * 900000);
    const testCpf = generateValidCpf();
    const testName = 'Leonardo DiCaprio Silva';

    // 0. Preparação e Limpeza
    console.log(`[Etapa 0] Preparando paciente titular ${testPhone}...`);
    await db.patients.findOrCreate(testPhone, clinicId, testName).catch(() => {});
    await db.sessions.set(testPhone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

    // Carrega a primeira instância do Controller
    let conversationController = require('../controllers/conversationController');

    // 1. Turno 1: Início do fluxo
    console.log('\n[Etapa 1] Turno 1 na Instância A: Paciente inicia conversa...');
    const res1 = await conversationController.handleIncomingMessage(testPhone, 'Olá, quero agendar uma consulta', true, clinicId);
    console.log(`   Bot: "${res1.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // 2. Turno 2: Escolha de procedimento (Limpeza)
    console.log('\n[Etapa 2] Turno 2 na Instância A: Paciente escolhe "Limpeza"...');
    const res2 = await conversationController.handleIncomingMessage(testPhone, 'Limpeza', true, clinicId);
    console.log(`   Bot: "${res2.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // 3. Turno 3: Escolha de data (2027-11-25)
    console.log('\n[Etapa 3] Turno 3 na Instância A: Paciente escolhe a data "2027-11-25"...');
    const res3 = await conversationController.handleIncomingMessage(testPhone, 'Selecionei a data: 2027-11-25', true, clinicId);
    console.log(`   Bot: "${res3.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // Inspeciona o estado gravado no Supabase ANTES da queda
    const draftBeforeCrash = await db.sessions.getDraft(testPhone, clinicId);
    console.log('\n📊 ESTADO PERSISTIDO NO SUPABASE ANTES DA MORTE DO PROCESSO:');
    console.log(`   - draft.type: ${draftBeforeCrash.type}`);
    console.log(`   - draft.date: ${draftBeforeCrash.date}`);
    console.log(`   - draft.step: ${draftBeforeCrash.step || 'time'}`);

    // ─────────────────────────────────────────────────────────────────────────
    // 💥 SIMULAÇÃO DE RESTART / CRASH / REDEPLOY DO SERVIDOR
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n💥💥💥 [SIMULAÇÃO DE RESTART DO RENDER] MATANDO PROCESSO E LIMPANDO MEMÓRIA RAM 💥💥💥');
    
    // Deleta os módulos em cache do Node para garantir isolamento 100% novo de memória
    delete require.cache[require.resolve('../controllers/conversationController')];
    delete require.cache[require.resolve('../services/calendarService')];
    delete require.cache[require.resolve('../services/databaseService')];

    // Carrega uma instância completamente nova (Instância B pós-restart)
    const freshDb = require('../services/databaseService');
    const freshController = require('../controllers/conversationController');
    console.log('🟢 [NOVA INSTÂNCIA INICIALIZADA] Servidor subiu do zero com memória limpa.\n');

    // 4. Turno 4: Paciente manda horário ("10:00") na nova instância
    console.log('[Etapa 4] Turno 4 na Instância B: Paciente envia horário "10:00"...');
    const res4 = await freshController.handleIncomingMessage(testPhone, '10:00', true, clinicId);
    console.log(`   Bot: "${res4.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // 5. Turno 5: Paciente fornece CPF na nova instância
    console.log('\n[Etapa 5] Turno 5 na Instância B: Paciente envia CPF...');
    const res5 = await freshController.handleIncomingMessage(testPhone, testCpf, true, clinicId);
    console.log(`   Bot: "${res5.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // 6. Turno 6: Paciente clica em "Confirmar" na nova instância
    console.log('\n[Etapa 6] Turno 6 na Instância B: Paciente envia "Confirmar"...');
    const res6 = await freshController.handleIncomingMessage(testPhone, 'Confirmar', true, clinicId);
    console.log(`   Bot: "${res6.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // 7. Turno 7: Paciente informa o Nome completo
    console.log('\n[Etapa 7] Turno 7 na Instância B: Paciente informa nome completo...');
    const res7 = await freshController.handleIncomingMessage(testPhone, testName, true, clinicId);
    console.log(`   Bot: "${res7.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // 8. Turno 8: Paciente finaliza a confirmação
    console.log('\n[Etapa 8] Turno 8 na Instância B: Paciente finaliza com "Confirmar"...');
    const res8 = await freshController.handleIncomingMessage(testPhone, 'Confirmar', true, clinicId);
    console.log(`   Bot:\n${res8.text}`);
    assert(res8.text.includes('Agendamento confirmado') && res8.text.includes('25/11/2027') && res8.text.includes('10:00'), 'Agendamento deve ser confirmado com data e hora exatas');

    // 9. Verificação no Banco de Dados Supabase
    console.log('\n[Etapa 9] Verificando se a consulta foi gravada com sucesso no Supabase...');
    const { data: apts, error: aptErr } = await freshDb.supabase
        .from('appointments')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', '2027-11-25')
        .eq('appointment_time', '10:00:00')
        .eq('status', 'pending');

    assert(!aptErr && apts && apts.length >= 1, 'Consulta deve existir no Supabase!');
    console.log(`   ✅ SUCESSO: Consulta encontrada no banco (ID: ${apts[0].id}, Data: ${apts[0].appointment_date}, Hora: ${apts[0].appointment_time})`);

    // Limpeza
    await freshDb.supabase.from('appointments').delete().eq('id', apts[0].id);
    await freshDb.sessions.setDraft(testPhone, null, clinicId);
    await freshDb.sessions.set(testPhone, [], clinicId);

    console.log('\n================================================================');
    console.log('🎉 [PASS] RECUPERAÇÃO DE SESSÃO PÓS-RESTART 100% VALIDADA!');
    console.log('================================================================');
}

runTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA:', err);
    process.exit(1);
});
