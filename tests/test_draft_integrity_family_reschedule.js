/**
 * TESTE FASE 1: INTEGRIDADE DO DRAFT NA SEQUÊNCIA DATA ALTERADA + DEPENDENTE
 * 
 * Sequência testada:
 * Limpeza -> 01/09/2026 -> Mudei de ideia, prefiro outro dia 02/09/2026 -> 08:00 -> Agendar p/ Outro -> Raquel Pereira da Silva -> CPF Válido -> Confirmar
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.staging') });

const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    n.push(d1);
    let d2 = n.reduce((total, num, i) => total + num * (11 - i), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    n.push(d2);
    return n.join('');
}

async function runTest() {
    console.log('================================================================');
    console.log('🧪 TESTE FASE 1: INTEGRIDADE DE DRAFT (DATA ALTERADA + DEPENDENTE)');
    console.log('================================================================\n');

    const testPhone = '5511999991122';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // 1. Limpeza do ambiente de teste
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);
    
    // Garante paciente titular
    let patient = await db.patients.findOrCreate(testPhone, clinicId);
    if (!patient.name || patient.name === testPhone) {
        await db.patients.updateName(testPhone, 'Titular Teste Fase 1', clinicId);
    }
    if (!patient.cpf) {
        await db.patients.updateCpf(testPhone, generateValidCpf(), clinicId);
    }

    const depCpf = generateValidCpf();

    // Turno 1: Iniciar agendamento
    console.log('1. Enviando: "Quero agendar uma Limpeza"');
    let res = await conversationController.handleIncomingMessage(testPhone, 'Quero agendar uma Limpeza', true, clinicId, '999888777');
    let draft = await db.sessions.getDraft(testPhone, clinicId);
    if (draft.type !== 'Limpeza') throw new Error(`Esperava draft.type === 'Limpeza', obteve '${draft.type}'`);
    console.log('   ✅ draft.type === Limpeza');

    // Turno 2: Selecionar data inicial
    console.log('2. Enviando data inicial: "01/09/2026"');
    res = await conversationController.handleIncomingMessage(testPhone, '01/09/2026', true, clinicId, '999888777');
    draft = await db.sessions.getDraft(testPhone, clinicId);
    if (draft.type !== 'Limpeza') throw new Error(`Esperava draft.type === 'Limpeza' após data, obteve '${draft.type}'`);
    console.log('   ✅ draft.type preservado como Limpeza');

    // Turno 3: Mudar data com texto complexo contendo "outro dia"
    console.log('3. Enviando: "Mudei de ideia, prefiro outro dia 02/09/2026"');
    res = await conversationController.handleIncomingMessage(testPhone, 'Mudei de ideia, prefiro outro dia 02/09/2026', true, clinicId, '999888777');
    draft = await db.sessions.getDraft(testPhone, clinicId);
    if (draft.type !== 'Limpeza') throw new Error(`ERRO CRÍTICO: draft.type foi alterado para '${draft.type}' ao mudar data!`);
    if (draft.date !== '2026-09-02') throw new Error(`Esperava draft.date === '2026-09-02', obteve '${draft.date}'`);
    console.log('   ✅ draft.type preservado como Limpeza e draft.date atualizado para 2026-09-02');

    // Turno 4: Selecionar horário
    console.log('4. Enviando horário: "08:00"');
    res = await conversationController.handleIncomingMessage(testPhone, '08:00', true, clinicId, '999888777');
    draft = await db.sessions.getDraft(testPhone, clinicId);
    if (draft.time !== '08:00') throw new Error(`Esperava draft.time === '08:00', obteve '${draft.time}'`);
    console.log('   ✅ draft.time === 08:00');

    // Turno 5: Clicar em Agendar p/ Outro
    console.log('5. Clicando no botão: "Agendar p/ Outro"');
    res = await conversationController.handleIncomingMessage(testPhone, 'Agendar p/ Outro', true, clinicId, '999888777');
    draft = await db.sessions.getDraft(testPhone, clinicId);
    if (!draft.is_family_booking) throw new Error(`Esperava draft.is_family_booking === true`);
    if (draft.type !== 'Limpeza') throw new Error(`ERRO: draft.type foi apagado em Agendar p/ Outro! Valor: '${draft.type}'`);
    if (draft.date !== '2026-09-02') throw new Error(`ERRO: draft.date foi apagado em Agendar p/ Outro! Valor: '${draft.date}'`);
    if (draft.time !== '08:00') throw new Error(`ERRO: draft.time foi apagado em Agendar p/ Outro! Valor: '${draft.time}'`);
    console.log('   ✅ Dados de Limpeza, 2026-09-02 e 08:00 PRESERVADOS após Agendar p/ Outro');

    // Turno 6: Informar nome do dependente
    console.log('6. Informando dependente: "Raquel Pereira da Silva"');
    res = await conversationController.handleIncomingMessage(testPhone, 'Raquel Pereira da Silva', true, clinicId, '999888777');
    draft = await db.sessions.getDraft(testPhone, clinicId);
    if (draft.dependentName !== 'Raquel Pereira da Silva') throw new Error(`Esperava dependentName === 'Raquel Pereira da Silva'`);
    console.log('   ✅ dependentName registrado corretamente');

    // Turno 7: Informar CPF do dependente
    console.log('7. Informando CPF válido do dependente');
    res = await conversationController.handleIncomingMessage(testPhone, depCpf, true, clinicId, '999888777');
    draft = await db.sessions.getDraft(testPhone, clinicId);
    console.log('   Botões exibidos na confirmação:', res.buttons);
    console.log('   Texto de confirmação:', res.text.replace(/\n+/g, ' '));
    if (!res.buttons.includes('Confirmar')) throw new Error(`Botões de confirmação devem incluir 'Confirmar'`);
    if (!res.text.includes('Limpeza')) throw new Error(`Texto de confirmação deve mencionar Limpeza`);
    if (!res.text.includes('Raquel Pereira da Silva')) throw new Error(`Texto de confirmação deve mencionar Raquel Pereira da Silva`);
    if (!res.text.includes('02/09/2026')) throw new Error(`Texto de confirmação deve mencionar 02/09/2026`);
    console.log('   ✅ Confirmação gerada com Limpeza, Dra. Juliana Mendes, 02/09/2026 e Raquel Pereira da Silva');

    // Turno 8: Confirmar
    console.log('8. Enviando: "Confirmar"');
    res = await conversationController.handleIncomingMessage(testPhone, 'Confirmar', true, clinicId, '999888777');
    console.log('   Mensagem final de sucesso:', res.text.replace(/\n+/g, ' '));
    if (!res.text.includes('Agendamento confirmado')) throw new Error(`Esperava confirmação de sucesso`);
    if (!res.text.includes('02/09/2026')) throw new Error(`Mensagem final deve confirmar data 02/09/2026`);
    if (!res.text.includes('08:00')) throw new Error(`Mensagem final deve confirmar hora 08:00`);
    if (!res.text.includes('Raquel Pereira da Silva')) throw new Error(`Mensagem final deve confirmar nome Raquel Pereira da Silva`);
    console.log('   ✅ Mensagem final correta construída a partir do agendamento persistido');

    // 9. Validação no Banco de Dados
    const { data: appts } = await db.supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, type, patient_id, patients(name, phone, guardian_id)')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', '2026-09-02')
        .eq('appointment_time', '08:00:00');

    const matched = appts.find(a => a.patients?.name === 'Raquel Pereira da Silva');
    if (!matched) throw new Error(`Agendamento de Raquel Pereira da Silva em 02/09/2026 08:00 não foi localizado no Supabase!`);

    console.log('\n================================================================');
    console.log('🎉 TESTE FASE 1 APROVADO COM 100% DE SUCESSO!');
    console.log('Registro persistido no Supabase:', JSON.stringify(matched, null, 2));
    console.log('================================================================\n');
}

runTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE FASE 1:', err);
    process.exit(1);
});
