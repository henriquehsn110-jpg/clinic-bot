require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

function cleanEnvVar(val) {
    if (val == null) return '';
    let str = String(val).trim();
    let prev;
    do { prev = str; str = str.trim().replace(/^["']+|["']+$|^[`]+|[`]+$/g, '').trim(); } while (str !== prev);
    return str;
}

const supabaseUrl = cleanEnvVar(process.env.SUPABASE_URL);
const supabaseKey = cleanEnvVar(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeConversations() {
    console.log('================================================================');
    console.log('📊 CLINICABOT — ANÁLISE E AVALIAÇÃO DE CONVERSAS RECENTES');
    console.log('================================================================\n');

    // 1. Buscar as sessões no Supabase
    const { data: sessions, error: sessErr } = await supabase
        .from('sessions')
        .select('*')
        .limit(20);

    if (sessErr) {
        console.error('❌ Erro ao buscar sessões do Supabase:', sessErr.message);
        return;
    }

    console.log(`📋 Encontradas ${sessions ? sessions.length : 0} sessões de conversa no banco de dados.\n`);

    let totalTurns = 0;
    let completedBookings = 0;
    let handoffTransfers = 0;
    let familyBookingsCount = 0;
    let conversationsSummary = [];

    if (sessions && sessions.length > 0) {
        for (let i = 0; i < sessions.length; i++) {
            const sess = sessions[i];
            const history = Array.isArray(sess.history) ? sess.history : [];
            const turnCount = history.length;
            totalTurns += turnCount;

            const draft = sess.draft || {};
            const isFamily = !!(draft.is_family_booking || draft.dependentName);
            if (isFamily) familyBookingsCount++;

            // Verificar se resultou em agendamento
            const userMsgs = history.filter(h => h.role === 'user').map(h => h.parts?.[0]?.text || '');
            const botMsgs = history.filter(h => h.role === 'model').map(h => h.parts?.[0]?.text || '');

            const isConfirmed = botMsgs.some(m => /confirmad[ao]|sucesso|agendamento realizado/i.test(m));
            const isHandoff = botMsgs.some(m => /atendente|humano|transfer/i.test(m));

            if (isConfirmed) completedBookings++;
            if (isHandoff) handoffTransfers++;

            conversationsSummary.push({
                index: i + 1,
                phone: sess.phone ? sess.phone.replace(/(\d{4})\d{4}(\d{4})/, '$1****$2') : 'Desconhecido',
                clinicId: sess.clinic_id,
                created_at: sess.created_at || 'N/A',
                turns: turnCount,
                isFamilyBooking: isFamily,
                dependentName: draft.dependentName || null,
                procedure: draft.type || 'N/A',
                date: draft.date || 'N/A',
                time: draft.time || 'N/A',
                status: isConfirmed ? '🟢 AGENDADO' : (isHandoff ? '🟠 HANDOFF HUMANO' : '🔵 EM ANDAMENTO / INATIVO'),
                lastUserMsg: userMsgs.length > 0 ? userMsgs[userMsgs.length - 1] : 'N/A',
                lastBotMsg: botMsgs.length > 0 ? botMsgs[botMsgs.length - 1].substring(0, 120) + '...' : 'N/A',
                history: history
            });
        }
    }

    // 2. Exibir relatório detalhado das 10 primeiras sessões
    console.log('--- 🔎 DETALHAMENTO DAS SESSÕES RECENTES (1 a 10) ---');
    conversationsSummary.slice(0, 10).forEach(c => {
        console.log(`\n[Sessão #${c.index}] Telefone: ${c.phone} | Criado: ${c.created_at}`);
        console.log(`   Turnos: ${c.turns} | Status: ${c.status} | Familiar: ${c.isFamilyBooking ? `Sim (${c.dependentName})` : 'Não'}`);
        console.log(`   Rascunho: Procedimento=${c.procedure}, Data=${c.date}, Hora=${c.time}`);
        console.log(`   Última msg do Paciente: "${c.lastUserMsg}"`);
        console.log(`   Última msg da Ana: "${c.lastBotMsg}"`);
        
        if (c.history && c.history.length > 0) {
            console.log(`   📜 Transcrição Resumida:`);
            c.history.forEach((h, idx) => {
                const role = h.role === 'user' ? '👤 Paciente' : '👩‍⚕️ Ana';
                const txt = (h.parts?.[0]?.text || '').replace(/\n/g, ' ');
                console.log(`      (${idx + 1}) ${role}: "${txt.substring(0, 100)}${txt.length > 100 ? '...' : ''}"`);
            });
        }
    });

    // 3. Buscar agendamentos
    const { data: appts } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, type, status, created_at, clinic_id')
        .limit(10);

    console.log('\n================================================================');
    console.log('📅 AGENDAMENTOS REGISTRADOS NO BANCO');
    console.log('================================================================');
    if (appts && appts.length > 0) {
        appts.forEach((a, idx) => {
            console.log(`   ${idx + 1}. ID: ${a.id.substring(0, 8)}... | Data: ${a.appointment_date} ${a.appointment_time} | Tipo: ${a.type || 'Consulta'} | Status: ${a.status}`);
        });
    } else {
        console.log('   Nenhum agendamento encontrado.');
    }

    // 4. Métricas
    const totalSess = sessions ? sessions.length : 0;
    const avgTurns = totalSess > 0 ? (totalTurns / totalSess).toFixed(1) : 0;

    console.log('\n================================================================');
    console.log('📊 MÉTRICAS GERAIS & AVALIAÇÃO DE CONVERSAÇÃO');
    console.log('================================================================');
    console.log(`   Total de Conversas Analisadas: ${totalSess}`);
    console.log(`   Média de Turnos por Conversa: ${avgTurns}`);
    console.log(`   Agendamentos Concluídos: ${completedBookings} (${totalSess > 0 ? ((completedBookings / totalSess) * 100).toFixed(1) : 0}%)`);
    console.log(`   Transbordos para Atendimento Humano: ${handoffTransfers}`);
    console.log(`   Agendamentos Familiares/Terceiros: ${familyBookingsCount}`);
    console.log('================================================================\n');
}

analyzeConversations().then(() => process.exit(0)).catch(err => {
    console.error('❌ Erro na análise:', err);
    process.exit(1);
});
