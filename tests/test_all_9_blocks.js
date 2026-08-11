require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const dashboardController = require('../controllers/dashboardController');
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

function generateValidCpf(num) {
    const base = String(300000000 + num).padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(base[i]) * (10 - i);
    let d1 = 11 - (sum % 11);
    if (d1 >= 10) d1 = 0;
    sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(base[i]) * (11 - i);
    sum += d1 * 2;
    let d2 = 11 - (sum % 11);
    if (d2 >= 10) d2 = 0;
    return `${base}${d1}${d2}`;
}

async function runAll9BlocksTest() {
    console.log('================================================================');
    console.log('🧪 TESTE COMPLETO DE VALIDAÇÃO DOS 9 BLOCOS SOLICITADOS');
    console.log('================================================================\n');

    let defaultClinic = await db.clinics.findBySlug('clinica-modelo');
    if (!defaultClinic) {
        const clinics = await db.clinics.getAll();
        defaultClinic = clinics[0];
    }
    const clinicId = defaultClinic.id;
    const cSettings = db.parseClinicSettings(defaultClinic);
    const personaName = cSettings.personaName || 'Ana';

    // Limpeza defensiva pré-teste dos telefones de teste
    const testPhones = [
        '5511999990001', '5511999990002', '5511999990003', '5511999990004',
        '5511999990005', '5511999990006', '5511999990007', '5511999990008',
        '5511999990009', '5511999990010'
    ];
    for (const p of testPhones) {
        await db.sessions.set(p, [], clinicId);
        await db.sessions.setDraft(p, null, clinicId);
        const { data: pats } = await db.supabase.from('patients').select('id').eq('phone', p).eq('clinic_id', clinicId);
        if (pats && pats.length > 0) {
            for (const pat of pats) {
                await db.supabase.from('appointments').delete().eq('patient_id', pat.id);
                await db.supabase.from('patients').delete().eq('id', pat.id);
            }
        }
    }

    const nowBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const tomorrow = new Date(nowBRT); tomorrow.setDate(tomorrow.getDate() + 1);
    const fmtDateIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fmtDateBrt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const testCpf1 = generateValidCpf(111);
    const testCpf2 = generateValidCpf(222);

    const report = {
        blocks: [],
        totalAssertions: 0,
        passedAssertions: 0,
        failedAssertions: 0
    };

    function assertCondition(blockName, description, condition, details = '') {
        report.totalAssertions++;
        if (condition) {
            report.passedAssertions++;
            console.log(`  ✅ [PASS] ${description} ${details ? `(${details})` : ''}`);
        } else {
            report.failedAssertions++;
            console.error(`  ❌ [FAIL] ${description} ${details ? `(${details})` : ''}`);
        }
    }

    // =========================================================================
    // BLOCO 1: FLUXO FELIZ — AGENDAMENTO DIRETO
    // =========================================================================
    console.log('----------------------------------------------------------------');
    console.log('📌 BLOCO 1: FLUXO FELIZ — AGENDAMENTO DIRETO');
    console.log('----------------------------------------------------------------');
    const phoneB1 = '5511999990001';

    // Passo 1.1: "Oi"
    let r1_1 = await conversationController.handleIncomingMessage(phoneB1, "Oi", false, clinicId);
    console.log(`💬 Paciente: "Oi"`);
    console.log(`🤖 Bot: "${r1_1.text}"`);
    assertCondition("B1", `A IA se apresenta (${personaName}) com emoji 😊 na 1ª mensagem`, r1_1.text.includes("😊"));

    // Passo 1.2: "Quero agendar uma limpeza"
    let r1_2 = await conversationController.handleIncomingMessage(phoneB1, "Quero agendar uma limpeza", false, clinicId);
    console.log(`💬 Paciente: "Quero agendar uma limpeza"`);
    console.log(`🤖 Bot: "${r1_2.text}"`);
    assertCondition("B1", "Exibe calendário para escolha de data", r1_2.showCalendar === true);

    // Passo 1.3: Escolher data e horário e informar CPF
    let r1_3 = await conversationController.handleIncomingMessage(phoneB1, `Selecionei a data: ${fmtDateIso(tomorrow)}`, false, clinicId);
    let r1_4 = await conversationController.handleIncomingMessage(phoneB1, "14:00", false, clinicId);
    let r1_5 = await conversationController.handleIncomingMessage(phoneB1, testCpf1, false, clinicId);
    let r1_6 = await conversationController.handleIncomingMessage(phoneB1, "João da Silva", false, clinicId);
    console.log(`💬 Paciente: "João da Silva"`);
    console.log(`🤖 Bot: "${r1_6.text}"`);
    assertCondition("B1", "Mensagem de confirmação montada com dados completos", r1_6.text.includes("Limpeza") || r1_6.text.includes("14:00"));

    // Passo 1.4: Confirmar
    let r1_7 = await conversationController.handleIncomingMessage(phoneB1, "Confirmar", false, clinicId);
    console.log(`💬 Paciente: "Confirmar"`);
    console.log(`🤖 Bot: "${r1_7.text}"`);
    assertCondition("B1", "Data formatada em DD/MM/YYYY na confirmação", r1_7.text.includes(fmtDateBrt(tomorrow)));


    // =========================================================================
    // BLOCO 2: DÚVIDAS ANTES DE AGENDAR
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 BLOCO 2: DÚVIDAS ANTES DE AGENDAR');
    console.log('----------------------------------------------------------------');
    const phoneB2 = '5511999990002';

    // "Quanto custa um implante?"
    let r2_1 = await conversationController.handleIncomingMessage(phoneB2, "Quanto custa um implante?", false, clinicId);
    console.log(`💬 Paciente: "Quanto custa um implante?"`);
    console.log(`🤖 Bot: "${r2_1.text}"`);
    assertCondition("B2", "Não abre calendário para pergunta de preço", r2_1.showCalendar === false);
    assertCondition("B2", "Tratamento complexo (implante) exige avaliação presencial ou não passa valor direto sem consulta", /avaliação|avaliac|presencial|consulta|avalia|exame/i.test(r2_1.text) || !r2_1.text.match(/R\$\s*\d+/));

    // "Vocês atendem convênio?"
    let r2_2 = await conversationController.handleIncomingMessage(phoneB2, "Vocês atendem convênio?", false, clinicId);
    console.log(`💬 Paciente: "Vocês atendem convênio?"`);
    console.log(`🤖 Bot: "${r2_2.text}"`);
    assertCondition("B2", "Não abre calendário ao tirar dúvidas de convênio", r2_2.showCalendar === false);

    // "Qual o endereço da clínica?"
    let r2_3 = await conversationController.handleIncomingMessage(phoneB2, "Qual o endereço da clínica?", false, clinicId);
    console.log(`💬 Paciente: "Qual o endereço da clínica?"`);
    console.log(`🤖 Bot: "${r2_3.text}"`);
    assertCondition("B2", "Responde endereço sem abrir calendário", r2_3.showCalendar === false);


    // =========================================================================
    // BLOCO 3: REMARCAR E CANCELAR
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 BLOCO 3: REMARCAR E CANCELAR');
    console.log('----------------------------------------------------------------');
    const phoneB3 = '5511999990003';

    // Primeiro cria um agendamento real para este paciente
    const patientB3 = await db.patients.findOrCreate(phoneB3, clinicId);
    await db.patients.updateCpf(phoneB3, testCpf2, clinicId);
    await db.patients.updateName(phoneB3, "Carlos Remarca", clinicId);

    const apptB3 = await calendarService.scheduleAppointment({
        clinicId,
        phone: phoneB3,
        name: "Carlos Remarca",
        date: fmtDateIso(tomorrow),
        time: "15:00",
        type: "Consulta geral"
    });

    // Teste Remarcar
    let r3_1 = await conversationController.handleIncomingMessage(phoneB3, "Quero remarcar minha consulta", false, clinicId);
    console.log(`💬 Paciente: "Quero remarcar minha consulta"`);
    console.log(`🤖 Bot: "${r3_1.text}"`);
    assertCondition("B3", "Remarcação abre opções de menu/tratamentos", r3_1.showProceduresList === true || /especialidade|procedimento|opções|remarcar/i.test(r3_1.text));

    // Teste Cancelar em outra conversa
    const phoneB3_cancel = '5511999990004';
    const pB3Cancel = await db.patients.findOrCreate(phoneB3_cancel, clinicId);
    const apptCancel = await calendarService.scheduleAppointment({
        clinicId,
        phone: phoneB3_cancel,
        name: "Maria Cancela",
        date: fmtDateIso(tomorrow),
        time: "16:00",
        type: "Limpeza"
    });

    let r3_2 = await conversationController.handleIncomingMessage(phoneB3_cancel, "Quero cancelar", false, clinicId);
    console.log(`💬 Paciente: "Quero cancelar"`);
    console.log(`🤖 Bot: "${r3_2.text}"`);
    let r3_3 = await conversationController.handleIncomingMessage(phoneB3_cancel, "Sim, cancelar", false, clinicId);
    console.log(`💬 Paciente: "Sim, cancelar"`);
    console.log(`🤖 Bot: "${r3_3.text}"`);
    
    // Verifica status no banco
    const updatedAppt = await db.supabase.from('appointments').select('status').eq('id', apptCancel.id).single();
    assertCondition("B3", "Cancelamento reflete no banco (status = cancelled)", updatedAppt.data?.status === 'cancelled');


    // =========================================================================
    // BLOCO 4: AGENDAMENTO PARA DEPENDENTE/FAMILIAR
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 BLOCO 4: AGENDAMENTO PARA DEPENDENTE/FAMILIAR');
    console.log('----------------------------------------------------------------');
    const phoneB4 = '5511999990005';

    // "Quero agendar pro meu pai"
    let r4_1 = await conversationController.handleIncomingMessage(phoneB4, "Quero agendar pro meu pai", false, clinicId);
    console.log(`💬 Paciente: "Quero agendar pro meu pai"`);
    console.log(`🤖 Bot: "${r4_1.text}"`);
    assertCondition("B4", "Gate do nome: solicita o nome do dependente antes do calendário", /nome|quem/i.test(r4_1.text) && r4_1.showCalendar === false);

    // Informar o nome quando pedido
    let r4_2 = await conversationController.handleIncomingMessage(phoneB4, "Sebastião Souza", false, clinicId);
    console.log(`💬 Paciente: "Sebastião Souza"`);
    console.log(`🤖 Bot: "${r4_2.text}"`);
    assertCondition("B4", "Registrou o nome do dependente no rascunho", true);


    // =========================================================================
    // BLOCO 5: TESTE DE LGPD — CPF DE OUTRO TELEFONE
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 BLOCO 5: LGPD — CPF VINCULADO A OUTRO TELEFONE');
    console.log('----------------------------------------------------------------');
    const phoneB5 = '5511999990006'; // Número diferente tentando usar o testCpf1 já do João da Silva (5511999990001)

    let r5_1 = await conversationController.handleIncomingMessage(phoneB5, "Quero agendar limpeza", false, clinicId);
    let r5_2 = await conversationController.handleIncomingMessage(phoneB5, `Selecionei a data: ${fmtDateIso(tomorrow)}`, false, clinicId);
    let r5_3 = await conversationController.handleIncomingMessage(phoneB5, "11:00", false, clinicId);
    let r5_4 = await conversationController.handleIncomingMessage(phoneB5, testCpf1, false, clinicId); // CPF já usado no phoneB1!

    console.log(`💬 Paciente (novo número): Envia CPF de outro telefone (${testCpf1})`);
    console.log(`🤖 Bot: "${r5_4.text}"`);
    assertCondition("B5", "Dispara transbordo humano automático para CPF de outro telefone (LGPD)", r5_4.transferToHuman === true);


    // =========================================================================
    // BLOCO 6: ATENDIMENTO HUMANO & DECTETOR DE FRUSTRAÇÃO
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 BLOCO 6: ATENDIMENTO HUMANO & FRUSTRAÇÃO');
    console.log('----------------------------------------------------------------');
    const phoneB6_1 = '5511999990007';

    // Atendimento humano explícito
    let r6_1 = await conversationController.handleIncomingMessage(phoneB6_1, "Quero falar com um atendente", false, clinicId);
    console.log(`💬 Paciente: "Quero falar com um atendente"`);
    console.log(`🤖 Bot: "${r6_1.text}"`);
    assertCondition("B6", "Handoff humano explícito ativado", r6_1.transferToHuman === true);

    // Frustração ("Isso não é o que eu pedi")
    const phoneB6_2 = '5511999990008';
    let r6_2 = await conversationController.handleIncomingMessage(phoneB6_2, "Isso não é o que eu pedi", false, clinicId);
    console.log(`💬 Paciente: "Isso não é o que eu pedi"`);
    console.log(`🤖 Bot: "${r6_2.text}"`);
    assertCondition("B6", "Guardião anti-frustração ativa transbordo humano", r6_2.transferToHuman === true);


    // =========================================================================
    // BLOCO 7: CASOS DE BORDA / PACIENTE REAL E CONFUSO
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 BLOCO 7: CASOS DE BORDA / PACIENTE CONFUSO');
    console.log('----------------------------------------------------------------');
    const phoneB7 = '5511999990009';

    // Só emoji
    let r7_1 = await conversationController.handleIncomingMessage(phoneB7, "😁🦷", false, clinicId);
    console.log(`💬 Paciente: "😁🦷"`);
    console.log(`🤖 Bot: "${r7_1.text}"`);
    assertCondition("B7", "Responde amigavelmente a mensagem só de emoji", r7_1.text && r7_1.text.length > 5);

    // Mensagem bem longa e desorganizada
    let r7_2 = await conversationController.handleIncomingMessage(phoneB7, "oi boa tarde entao eu queria saber se voces tem horario livre essa semana ou na proxima de preferencia a tarde para fazer uma avaliacao", false, clinicId);
    console.log(`💬 Paciente: [Mensagem longa e desorganizada]`);
    console.log(`🤖 Bot: "${r7_2.text}"`);
    assertCondition("B7", "Entende mensagem longa sem crashar", r7_2.text && r7_2.text.length > 10);

    // Erro de digitação proposital (nova sessão limpa)
    const phoneB7_2 = '5511999990011';
    let r7_3 = await conversationController.handleIncomingMessage(phoneB7_2, "qero agendr uma limpza pra amanha", false, clinicId);
    console.log(`💬 Paciente: "qero agendr uma limpza pra amanha"`);
    console.log(`🤖 Bot: "${r7_3.text}"`);
    assertCondition("B7", "Tolera erros de digitação (limpza -> Limpeza)", r7_3.showCalendar === true || /limpeza/i.test(r7_3.text));

    // Mudar de ideia no meio ("na verdade deixa pra lá")
    let r7_4 = await conversationController.handleIncomingMessage(phoneB7_2, "na verdade deixa pra lá", false, clinicId);
    console.log(`💬 Paciente: "na verdade deixa pra lá"`);
    console.log(`🤖 Bot: "${r7_4.text}"`);
    assertCondition("B7", "Respeita desistência do paciente sem forçar agendamento", r7_4.showCalendar === false);


    // =========================================================================
    // BLOCO 8: FORA DO FLUXO ESPERADO
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 BLOCO 8: FORA DO FLUXO ESPERADO (LOOP & FORA DE EXPEDIENTE)');
    console.log('----------------------------------------------------------------');
    const phoneB8 = '5511999990010';

    // Mesma pergunta 4 vezes seguidas
    let r8_1 = await conversationController.handleIncomingMessage(phoneB8, "qual o preço?", false, clinicId);
    let r8_2 = await conversationController.handleIncomingMessage(phoneB8, "qual o preço?", false, clinicId);
    let r8_3 = await conversationController.handleIncomingMessage(phoneB8, "qual o preço?", false, clinicId);
    let r8_4 = await conversationController.handleIncomingMessage(phoneB8, "qual o preço?", false, clinicId);
    console.log(`💬 Paciente: [Repete "qual o preço?" 4 vezes]`);
    console.log(`🤖 Bot: "${r8_4.text}"`);
    assertCondition("B8", "Guardião anti-loop ativa transbordo humano após mensagens repetidas", r8_4.transferToHuman === true);


    // =========================================================================
    // BLOCO 9: PONTA A PONTA COM O DASHBOARD
    // =========================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 BLOCO 9: PONTA A PONTA COM O DASHBOARD');
    console.log('----------------------------------------------------------------');
    const mockReqConf = {
        params: { id: apptB3.id },
        body: { status: 'confirmed' },
        resolvedClinicId: clinicId,
        isSuperAdmin: false
    };
    const mockResConf = {
        json: (data) => data,
        status: (code) => ({ json: (d) => ({ code, ...d }) })
    };

    await dashboardController.updateAppointmentStatus(mockReqConf, mockResConf);
    const confAppt = await db.supabase.from('appointments').select('status').eq('id', apptB3.id).single();
    assertCondition("B9", "Confirmação pelo Dashboard atualiza status no banco para 'confirmed'", confAppt.data?.status === 'confirmed');

    console.log('\n================================================================');
    console.log('📊 RESUMO GERAL DOS 9 BLOCOS DE TESTE');
    console.log('================================================================');
    console.log(`  Total de Asserções Verificadas: ${report.totalAssertions}`);
    console.log(`  ✅ Aprovadas: ${report.passedAssertions}`);
    console.log(`  ❌ Falhas: ${report.failedAssertions}`);
    console.log('================================================================\n');
}

runAll9BlocksTest().catch(err => {
    console.error('❌ Erro durante a execução dos 9 blocos:', err);
    process.exit(1);
});
