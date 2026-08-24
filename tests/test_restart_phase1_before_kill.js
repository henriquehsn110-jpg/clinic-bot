/**
 * FASE 1 DO TESTE DE REINÍCIO REAL DE PROCESSO
 * Executa as etapas 1 a 3 em um processo Node.js dedicado e morre com process.exit(0).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../services/databaseService');
const conversationController = require('../controllers/conversationController');

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    let d2 = [...n, d1].reduce((total, num, i) => total + num * (11 - i), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    return `${n.slice(0,3).join('')}.${n.slice(3,6).join('')}.${n.slice(6,9).join('')}-${d1}${d2}`;
}

async function runPhase1() {
    console.log('================================================================');
    console.log('🛑 [PROCESSO 1 — PID:', process.pid, '] INICIANDO CONVERSA ATÉ MEIO DO FLUXO');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const testPhone = '5511998' + Math.floor(100000 + Math.random() * 900000);
    const testCpf = generateValidCpf();
    const testName = 'Leonardo DiCaprio Silva';

    // 0. Preparação e Limpeza
    console.log(`[Processo 1] Preparando paciente titular ${testPhone}...`);
    await db.patients.findOrCreate(testPhone, clinicId, testName).catch(() => {});
    await db.sessions.set(testPhone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(testPhone, null, clinicId).catch(() => {});

    // Turno 1
    console.log('\n[Processo 1] Turno 1: Paciente envia "Olá, quero agendar uma consulta"...');
    const res1 = await conversationController.handleIncomingMessage(testPhone, 'Olá, quero agendar uma consulta', true, clinicId);
    console.log(`   Bot: "${res1.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // Turno 2
    console.log('\n[Processo 1] Turno 2: Paciente envia "Limpeza"...');
    const res2 = await conversationController.handleIncomingMessage(testPhone, 'Limpeza', true, clinicId);
    console.log(`   Bot: "${res2.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // Turno 3
    console.log('\n[Processo 1] Turno 3: Paciente envia "Selecionei a data: 2027-11-25"...');
    const res3 = await conversationController.handleIncomingMessage(testPhone, 'Selecionei a data: 2027-11-25', true, clinicId);
    console.log(`   Bot: "${res3.text.substring(0, 80).replace(/\n/g, ' ')}..."`);

    // Valida persistência no Supabase antes de matar o processo
    const draftInDb = await db.sessions.getDraft(testPhone, clinicId);
    console.log('\n📊 ESTADO GRAVADO NO SUPABASE PELO PROCESSO 1:');
    console.log(`   - draft.type: ${draftInDb.type}`);
    console.log(`   - draft.date: ${draftInDb.date}`);
    console.log(`   - draft.step: ${draftInDb.step || 'time'}`);

    // Salva identificadores em arquivo temporário para o Processo 2 ler
    const scratchDir = path.resolve(__dirname, '../scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    const stateFile = path.join(scratchDir, 'restart_test_state.json');
    fs.writeFileSync(stateFile, JSON.stringify({ testPhone, testCpf, testName, clinicId }), 'utf8');

    console.log(`\n💾 Estado da chave salvo em ${stateFile}`);
    console.log(`💥 ENCERRANDO PROCESSO 1 (PID: ${process.pid}) COM process.exit(0)...`);
    console.log('================================================================');
    process.exit(0);
}

runPhase1().catch(err => {
    console.error('❌ Erro no Processo 1:', err);
    process.exit(1);
});
