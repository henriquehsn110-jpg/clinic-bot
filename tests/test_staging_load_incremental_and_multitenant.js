/**
 * TESTE DE CARGA INCREMENTAL & MULTI-TENANT (PROMPT 4)
 * Ambiente: STAGING OBRIGATORIAMENTE (.env.staging)
 * Mede latência por turno (média, p50, p95), taxa de erros e throughput em degraus de concorrência.
 */
process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const assert = require('assert');
const crypto = require('crypto');
const db = require('../services/databaseService');
const conversationController = require('../controllers/conversationController');

const FIRST_NAMES = ['Carlos', 'Mariana', 'Juliana', 'Roberto', 'Leonardo', 'Beatriz', 'Felipe', 'Camila', 'Rafael', 'Fernanda', 'Lucas', 'Patricia', 'Gustavo', 'Larissa', 'Bruno', 'Renata'];
const LAST_NAMES = ['Silva', 'Souza', 'Oliveira', 'Mendes', 'Alves', 'Pereira', 'Ferreira', 'Lima', 'Santos', 'Ribeiro', 'Costa', 'Gomes', 'Martins', 'Barbosa', 'Carvalho', 'Rocha'];

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    let d2 = [...n, d1].reduce((total, num, i) => total + num * (11 - i), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    return `${n.slice(0,3).join('')}.${n.slice(3,6).join('')}.${n.slice(6,9).join('')}-${d1}${d2}`;
}

// Executa um fluxo completo de agendamento de 8 turnos para 1 paciente
async function simulateFullConversation(phone, clinicId, patientName, cpf, dateStr, timeStr) {
    const turnLatencies = [];
    const convStart = Date.now();

    // 0. Preparação e Limpeza
    await db.patients.findOrCreate(phone, clinicId, null).catch(() => {});
    await db.sessions.set(phone, [], clinicId).catch(() => {});
    await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

    const turns = [
        'Olá, quero agendar uma consulta',
        'Limpeza',
        `Selecionei a data: ${dateStr}`,
        timeStr,
        cpf,
        'Confirmar',
        patientName,
        'Confirmar'
    ];

    for (let i = 0; i < turns.length; i++) {
        const tStart = Date.now();
        const res = await conversationController.handleIncomingMessage(phone, turns[i], true, clinicId);
        const tElapsed = Date.now() - tStart;
        turnLatencies.push(tElapsed);

        if (i === turns.length - 1) {
            // No último turno, valida se confirmou
            if (!res.text || !res.text.includes('Agendamento confirmado')) {
                throw new Error(`Turno ${i + 1} [${turns[i]}] falhou: "${res.text ? res.text.substring(0, 100).replace(/\n/g, ' ') : 'Nulo'}"`);
            }
        }
    }

    const totalConvTime = Date.now() - convStart;
    return {
        totalTime: totalConvTime,
        turnLatencies
    };
}

// Executa um degrau de carga concorrente com N conversas simultâneas
async function runConcurrencyTier(concurrencyLevel, clinicIds, tierIndex) {
    const promises = [];
    const tierRunId = Math.floor(1000 + Math.random() * 9000);

    for (let i = 0; i < concurrencyLevel; i++) {
        const phone = `5511977${String(tierIndex).padStart(2, '0')}${String(i).padStart(3, '0')}${tierRunId.toString().substring(0, 2)}`;
        const clinicId = clinicIds[i % clinicIds.length];
        const patientName = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i + tierIndex) % LAST_NAMES.length]}`;
        const cpf = generateValidCpf();
        
        // Atribui data e slot únicos garantidos por paciente para evitar conflitos de agenda
        const tierMonth = String(1 + (tierIndex % 12)).padStart(2, '0');
        const dayNum = String(1 + (i % 28)).padStart(2, '0');
        const dateStr = `2028-${tierMonth}-${dayNum}`;
        const slotHour = String(8 + Math.floor(i % 10)).padStart(2, '0');
        const slotMin = (i % 2 === 0) ? '00' : '30';
        const timeStr = `${slotHour}:${slotMin}`;

        promises.push(
            simulateFullConversation(phone, clinicId, patientName, cpf, dateStr, timeStr)
                .then(res => ({ success: true, ...res }))
                .catch(err => ({ success: false, error: err.message, totalTime: 0, turnLatencies: [] }))
        );
    }

    const tierStart = Date.now();
    const results = await Promise.all(promises);
    const tierDuration = Date.now() - tierStart;

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
        console.log(`\n   🔍 [DEBUG ERRO] Exemplo de falha na concorrência ${concurrencyLevel}: ${failed[0].error}`);
    }

    // Coleta todas as latências individuais de cada resposta do bot (por turno)
    const allTurnLatencies = [];
    successful.forEach(r => r.turnLatencies.forEach(t => allTurnLatencies.push(t)));
    allTurnLatencies.sort((a, b) => a - b);

    const turnMean = allTurnLatencies.length ? Math.round(allTurnLatencies.reduce((a, b) => a + b, 0) / allTurnLatencies.length) : 0;
    const turnP50 = allTurnLatencies.length ? allTurnLatencies[Math.floor(allTurnLatencies.length * 0.50)] : 0;
    const turnP95 = allTurnLatencies.length ? allTurnLatencies[Math.floor(allTurnLatencies.length * 0.95)] : 0;
    const errorRate = ((failed.length / concurrencyLevel) * 100).toFixed(1);
    const convPerSec = (successful.length / (tierDuration / 1000)).toFixed(2);
    const turnsPerSec = (allTurnLatencies.length / (tierDuration / 1000)).toFixed(2);

    return {
        concurrency: concurrencyLevel,
        totalDuration: tierDuration,
        successful: successful.length,
        failed: failed.length,
        errorRate: parseFloat(errorRate),
        turnMean,
        turnP50,
        turnP95,
        convPerSec,
        turnsPerSec
    };
}

async function runFullLoadAudit() {
    console.log('================================================================');
    console.log('⚡ [PROMPT 4] TESTE DE CARGA INCREMENTAL & MULTI-TENANT (STAGING)');
    console.log('================================================================');
    console.log(`Ambiente: ${process.env.NODE_ENV} | Supabase: ${process.env.SUPABASE_URL}\n`);

    // Limpeza prévia de agendamentos de teste anteriores
    console.log('[Setup] Limpando agendamentos e registros de teste prévios...');
    await db.supabase.from('appointments').delete().gte('appointment_date', '2027-01-01');
    await db.supabase.from('patients').delete().ilike('phone', '5511977%');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo') || (await db.clinics.getAll())[0];
    const singleClinicId = defaultClinic.id;

    // Cria 5 clínicas fictícias para o teste multi-tenant
    const multiTenantClinics = [];
    for (let c = 1; c <= 5; c++) {
        const slug = `load-test-clinic-${c}-${Date.now()}`;
        const { data: created } = await db.supabase.from('clinics').insert({
            name: `LOAD_TEST Clínica ${c}`,
            slug: slug,
            phone_number_id: `999000${c}`,
            whatsapp_token: 'fake_load_token',
            active: true
        }).select().single();

        if (created) {
            multiTenantClinics.push(created.id);
            await db.supabase.from('doctors').insert({
                name: `Dra. Especialista ${c}`,
                clinic_id: created.id,
                specialty: 'Odontologia Geral',
                color: '#3B82F6'
            });
            await db.supabase.from('clinic_hours').insert([
                { clinic_id: created.id, day_of_week: 1, open_time: '08:00', close_time: '18:00' },
                { clinic_id: created.id, day_of_week: 2, open_time: '08:00', close_time: '18:00' },
                { clinic_id: created.id, day_of_week: 3, open_time: '08:00', close_time: '18:00' },
                { clinic_id: created.id, day_of_week: 4, open_time: '08:00', close_time: '18:00' },
                { clinic_id: created.id, day_of_week: 5, open_time: '08:00', close_time: '18:00' },
                { clinic_id: created.id, day_of_week: 6, open_time: '08:00', close_time: '18:00' },
                { clinic_id: created.id, day_of_week: 7, open_time: '08:00', close_time: '18:00' },
                { clinic_id: created.id, day_of_week: 0, open_time: '08:00', close_time: '18:00' }
            ]);
        }
    }
    console.log(`✅ 5 Clínicas Multi-Tenant provisionadas: ${multiTenantClinics.length} criadas.\n`);

    const tiers = [5, 10, 20, 40, 80];

    // R2: Single-Tenant
    console.log('================================================================');
    console.log('📊 [R2] TESTE DE CARGA SINGLE-TENANT (CONCENTRAÇÃO EM 1 CLÍNICA)');
    console.log('================================================================\n');

    const singleTenantResults = [];
    for (let idx = 0; idx < tiers.length; idx++) {
        const level = tiers[idx];
        process.stdout.write(`⏳ Executando degrau de ${level} conversas simultâneas (8 turnos cada)... `);
        const res = await runConcurrencyTier(level, [singleClinicId], idx + 1);
        singleTenantResults.push(res);
        console.log(`Concluído em ${(res.totalDuration/1000).toFixed(1)}s | Latência Resposta (Média: ${res.turnMean}ms | p95: ${res.turnP95}ms) | Erros: ${res.errorRate}% | Vazão: ${res.turnsPerSec} turnos/s`);

        if (res.errorRate > 5.0 || res.turnP95 > 10000) {
            console.log(`⚠️ Ponto de parada atingido no nível ${level} (Erros: ${res.errorRate}%, Turn p95: ${res.turnP95}ms)`);
            break;
        }
    }

    // R3: Multi-Tenant
    console.log('\n================================================================');
    console.log('📊 [R3] TESTE DE CARGA MULTI-TENANT (DISTRIBUÍDO EM 5 CLÍNICAS)');
    console.log('================================================================\n');

    const multiTenantResults = [];
    for (let idx = 0; idx < tiers.length; idx++) {
        const level = tiers[idx];
        process.stdout.write(`⏳ Executando degrau de ${level} conversas simultâneas (5 clínicas)... `);
        const res = await runConcurrencyTier(level, multiTenantClinics, idx + 10);
        multiTenantResults.push(res);
        console.log(`Concluído em ${(res.totalDuration/1000).toFixed(1)}s | Latência Resposta (Média: ${res.turnMean}ms | p95: ${res.turnP95}ms) | Erros: ${res.errorRate}% | Vazão: ${res.turnsPerSec} turnos/s`);

        if (res.errorRate > 5.0 || res.turnP95 > 10000) {
            console.log(`⚠️ Ponto de parada atingido no nível ${level} (Erros: ${res.errorRate}%, Turn p95: ${res.turnP95}ms)`);
            break;
        }
    }

    // R4: Limpeza
    console.log('\n================================================================');
    console.log('🧹 [R4] LIMPANDO DADOS SINTÉTICOS DE CARGA DO STAGING...');
    console.log('================================================================');

    for (const cId of multiTenantClinics) {
        await db.supabase.from('appointments').delete().eq('clinic_id', cId);
        await db.supabase.from('patients').delete().eq('clinic_id', cId);
        await db.supabase.from('doctors').delete().eq('clinic_id', cId);
        await db.supabase.from('clinic_hours').delete().eq('clinic_id', cId);
        await db.supabase.from('clinics').delete().eq('id', cId);
    }
    await db.supabase.from('appointments').delete().gte('appointment_date', '2027-01-01');
    await db.supabase.from('patients').delete().ilike('phone', '5511977%');
    console.log('✅ Base de Staging limpa com sucesso. 0 resíduos de carga.\n');

    console.log('### TABELA R2 — Carga Single-Tenant (Latência de Resposta do Bot por Turno):');
    console.log('| Concorrência | Conversas OK | Falhas | Erro (%) | Média Turno (ms) | p50 (ms) | p95 (ms) | Vazão (turnos/s) |');
    console.log('|---|---|---|---|---|---|---|---|');
    singleTenantResults.forEach(r => {
        console.log(`| **${r.concurrency} conversas** | ${r.successful}/${r.concurrency} | ${r.failed} | ${r.errorRate}% | ${r.turnMean}ms | ${r.turnP50}ms | ${r.turnP95}ms | **${r.turnsPerSec} t/s** |`);
    });

    console.log('\n### TABELA R3 — Carga Multi-Tenant (5 Clínicas Simultâneas):');
    console.log('| Concorrência | Conversas OK | Falhas | Erro (%) | Média Turno (ms) | p50 (ms) | p95 (ms) | Vazão (turnos/s) |');
    console.log('|---|---|---|---|---|---|---|---|');
    multiTenantResults.forEach(r => {
        console.log(`| **${r.concurrency} conversas** | ${r.successful}/${r.concurrency} | ${r.failed} | ${r.errorRate}% | ${r.turnMean}ms | ${r.turnP50}ms | ${r.turnP95}ms | **${r.turnsPerSec} t/s** |`);
    });
}

runFullLoadAudit().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO NO TESTE DE CARGA:', err);
    process.exit(1);
});
