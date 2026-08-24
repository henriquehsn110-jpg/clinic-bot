/**
 * DIAGNÓSTICO PROFUNDO DAS QUERIES DO DASHBOARD (PROMPT 5 - R3)
 * Mede tempos individuais, contagem de dados, payloads e identifica gargalos de N+1 e falta de filtros.
 */
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging') });
const db = require('../services/databaseService');

async function runDashboardQueryInspection() {
    console.log('================================================================');
    console.log('🔬 [PROMPT 5 - R3] DIAGNÓSTICO E PERFILAMENTO DAS QUERIES DO DASHBOARD');
    console.log('================================================================');
    console.log(`Supabase URL: ${process.env.SUPABASE_URL}\n`);

    const clinic = await db.clinics.findBySlug('clinica-modelo');
    const clinicId = clinic.id;
    console.log(`Clínica Alvo: ${clinic.name} (${clinicId})\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // Query 1: Resolução de Slug no Middleware (resolveClinicId)
    // ─────────────────────────────────────────────────────────────────────────
    const t0 = Date.now();
    const { data: q1Data, error: q1Err } = await db.supabase
        .from('clinics')
        .select('id')
        .eq('slug', 'clinica-modelo')
        .maybeSingle();
    const t1 = Date.now() - t0;
    console.log(`1. [Middleware] Query clinics por slug: ${t1}ms | Retorno: ${JSON.stringify(q1Data)}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Query 2: Dados de Configuração da Clínica (clinicQuery)
    // ─────────────────────────────────────────────────────────────────────────
    const t2_0 = Date.now();
    const { data: q2Data, error: q2Err } = await db.supabase
        .from('clinics')
        .select('id, name, slug, whatsapp_list_title, work_hours, address, eval_price')
        .eq('id', clinicId)
        .maybeSingle();
    const t2 = Date.now() - t2_0;
    console.log(`2. [Controller] Query dados da clínica: ${t2}ms | Payload: ${JSON.stringify(q2Data).length} bytes`);

    // ─────────────────────────────────────────────────────────────────────────
    // Query 3: Agendamentos com Join em Patients + Count Exact (apptsQuery)
    // ─────────────────────────────────────────────────────────────────────────
    const t3_0 = Date.now();
    const { data: q3Data, count: q3Count, error: q3Err } = await db.supabase
        .from('appointments')
        .select('*, patients(id, name, phone, cpf)', { count: 'exact' })
        .is('deleted_at', null)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .range(0, 49);
    const t3 = Date.now() - t3_0;
    const q3Bytes = Buffer.byteLength(JSON.stringify(q3Data || {}));
    console.log(`3. [Controller] Query appointments (JOIN + count exact): ${t3}ms | Linhas: ${q3Data?.length} (Total banco: ${q3Count}) | Payload: ${q3Bytes} bytes`);

    // ─────────────────────────────────────────────────────────────────────────
    // Query 4: Pacientes + Count Exact (patientsQuery)
    // ─────────────────────────────────────────────────────────────────────────
    const t4_0 = Date.now();
    const { data: q4Data, count: q4Count, error: q4Err } = await db.supabase
        .from('patients')
        .select('id, name, phone, cpf, created_at', { count: 'exact' })
        .is('deleted_at', null)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .range(0, 49);
    const t4 = Date.now() - t4_0;
    const q4Bytes = Buffer.byteLength(JSON.stringify(q4Data || {}));
    console.log(`4. [Controller] Query patients (count exact): ${t4}ms | Linhas: ${q4Data?.length} (Total banco: ${q4Count}) | Payload: ${q4Bytes} bytes`);

    // ─────────────────────────────────────────────────────────────────────────
    // Query 5: TODAS as Sessões da Clínica SEM LIMIT/PAGINAÇÃO (sessionsQuery)
    // ─────────────────────────────────────────────────────────────────────────
    const t5_0 = Date.now();
    const { data: q5Data, error: q5Err } = await db.supabase
        .from('sessions')
        .select('*')
        .is('deleted_at', null)
        .eq('clinic_id', clinicId);
    const t5 = Date.now() - t5_0;
    const q5Bytes = Buffer.byteLength(JSON.stringify(q5Data || {}));
    console.log(`5. [Controller] Query sessions (SELECT * FULL TABLE, SEM LIMIT): ${t5}ms | Linhas: ${q5Data?.length} | Payload: ${q5Bytes} bytes`);

    // Análise de Handoffs no Node
    const handoffs = (q5Data || []).filter(s => {
        const history = s.history || [];
        const lastMsg = history[history.length - 1];
        return lastMsg && lastMsg.parts && lastMsg.parts[0] && lastMsg.parts[0].text && lastMsg.parts[0].text.includes('[SISTEMA: conversa transferida para atendente humano]');
    });
    console.log(`   └─ Handoffs filtrados em memória: ${handoffs.length} de ${q5Data?.length} sessões baixadas integralmente.`);

    console.log('\n================================================================');
    console.log('📊 RESUMO DO TEMPO DE BANCO POR REQUISIÇÃO (SEQUENCIAL VS PARALELO)');
    console.log('================================================================');
    console.log(`• Tempo Middleware (Query 1): ${t1}ms`);
    console.log(`• Tempo Controller (Queries 2-5 em Promise.all): Max(${t2}, ${t3}, ${t4}, ${t5}) = ${Math.max(t2, t3, t4, t5)}ms`);
    console.log(`• Soma de I/O de Rede ao Supabase: ${t1 + t2 + t3 + t4 + t5}ms`);
    console.log(`• Total de chamadas HTTP ao PostgREST por requisição de dashboard: 5 chamadas!`);
    console.log(`• Sob 20 requisições concorrentes de dashboard: 20 × 5 = 100 conexões HTTP simultâneas ao Supabase!`);
}

runDashboardQueryInspection().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO:', err);
    process.exit(1);
});
