/**
 * ClinicaBot SaaS Pro — Stress & Load Testing Suite
 * Simula 100 requisições assíncronas concorrentes no backend local
 * para medir latência, taxa de erros HTTP e estabilidade de conexão com o banco.
 */

require('dotenv').config();
const path = require('path');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TOTAL_REQUESTS = 100;
let serverProcess = null;

async function ensureServerRunning() {
    try {
        await axios.get(`${BASE_URL}/health`, { timeout: 1500 });
        console.log("  ℹ️ Servidor HTTP online em http://localhost:3000.");
    } catch (err) {
        console.log("  🚀 Servidor offline. Iniciando server.js na porta 3000...");
        const { spawn } = require('child_process');
        serverProcess = spawn('node', [path.join(__dirname, '../server.js')], {
            cwd: path.join(__dirname, '..'),
            stdio: 'ignore'
        });

        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                await axios.get(`${BASE_URL}/health`, { timeout: 1000 });
                console.log("  ✅ Servidor auto-iniciado e pronto.");
                return;
            } catch (e) {}
        }
        throw new Error("Não foi possível iniciar o servidor na porta 3000.");
    }
}

async function runStressTest() {
    console.log(`\n================================================================`);
    console.log(`⚡ INICIANDO TESTE DE CARGA (STRESS TEST) — ${TOTAL_REQUESTS} REQUISIÇÕES CONCORRENTES`);
    console.log(`================================================================\n`);

    try {
        await ensureServerRunning();
    } catch (bootErr) {
        console.error(`🚨 ERRO CRÍTICO DE INICIALIZAÇÃO: ${bootErr.message}`);
        process.exit(1);
    }

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    const latencies = [];

    // Autentica para obter token do Dashboard
    let token = '';
    try {
        const loginRes = await axios.post(`${BASE_URL}/api/dashboard/auth/login`, {
            email: 'admin@clinicamodelo.com.br',
            password: '123456',
            clinicSlug: 'clinica-modelo'
        });
        token = loginRes.data.token;
    } catch (e) {
        console.error('Falha ao autenticar para teste de carga:', e.message);
        if (serverProcess) serverProcess.kill();
        process.exit(1);
    }

    const promises = [];

    for (let i = 0; i < TOTAL_REQUESTS; i++) {
        const phone = `5511988${String(i).padStart(6, '0')}`;
        const pStart = Date.now();

        // 50% requisições para /api/simulate e 50% requisições para /api/dashboard/data
        const p = (i % 2 === 0)
            ? axios.post(`${BASE_URL}/api/simulate`, { phone, text: 'Olá, gostaria de saber os horários' })
            : axios.get(`${BASE_URL}/api/dashboard/data`, { headers: { Authorization: `Bearer ${token}` } });

        promises.push(
            p.then(res => {
                const elapsed = Date.now() - pStart;
                latencies.push(elapsed);
                if (res.status === 200) successCount++;
                else errorCount++;
            }).catch(err => {
                const elapsed = Date.now() - pStart;
                latencies.push(elapsed);
                errorCount++;
            })
        );
    }

    await Promise.all(promises);
    const totalDuration = Date.now() - startTime;

    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const rps = (TOTAL_REQUESTS / (totalDuration / 1000)).toFixed(2);

    console.log(`📊 MÉTRICAS DE PERFORMANCE & STRESS TEST:`);
    console.log(`  --------------------------------------------------`);
    console.log(`  Total de Requisições:   ${TOTAL_REQUESTS}`);
    console.log(`  Sucesso (HTTP 200):     ${successCount} (${((successCount/TOTAL_REQUESTS)*100).toFixed(1)}%)`);
    console.log(`  Falhas/Erros:           ${errorCount}`);
    console.log(`  Tempo Total:            ${totalDuration} ms`);
    console.log(`  Vazão (Throughput):     ${rps} req/segundo`);
    console.log(`  Latência Média:         ${avgLatency} ms`);
    console.log(`  Latência Mínima:        ${minLatency} ms`);
    console.log(`  Latência Máxima:        ${maxLatency} ms`);
    console.log(`  --------------------------------------------------\n`);

    // Limpeza automática dos dados de teste criados no Supabase
    try {
        const db = require('../services/databaseService');
        const { data: dummyPatients } = await db.supabase.from('patients').select('id').or('phone.like.5511988%,phone.eq.5511994703641');
        const dummyIds = (dummyPatients || []).map(p => p.id);
        if (dummyIds.length > 0) {
            await db.supabase.from('appointments').delete().in('patient_id', dummyIds);
            await db.supabase.from('patients').delete().in('id', dummyIds);
            console.log(`  🧹 ${dummyIds.length} pacientes de teste limpos do banco com sucesso.`);
        }
    } catch (cleanErr) {
        console.warn('  ⚠️ Aviso: Limpeza automática de dados de teste ignorada:', cleanErr.message);
    }

    if (serverProcess) {
        console.log("  🧹 Encerrando processo do servidor auto-iniciado...");
        serverProcess.kill();
    }

    if (errorCount === 0) {
        console.log(`🎉 TESTE DE CARGA APROVADO COM ZERO FALHAS E ALTA ESTABILIDADE!`);
    } else {
        console.log(`⚠️ ALERTA: ${errorCount} requisições falharam durante o estresse.`);
        process.exit(1);
    }
}

runStressTest();
