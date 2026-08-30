/**
 * INSTRUMENTAÇÃO REAL DE CHAMADAS HTTP AO POSTGREST DO SUPABASE VIA FETCH
 */
process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const db = require('../services/databaseService');

let httpCallsMiddleware = [];
let httpCallsController = [];
let currentPhase = 'setup';

// Intercepta o globalThis.fetch nativo utilizado pelo SDK do Supabase
const origFetch = globalThis.fetch;
globalThis.fetch = async function(...args) {
    const targetUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown');
    const method = args[1]?.method || 'GET';
    const start = Date.now();
    try {
        const response = await origFetch.apply(this, args);
        const elapsed = Date.now() - start;
        const entry = { url: targetUrl, method, status: response.status, elapsed };
        if (currentPhase === 'middleware') httpCallsMiddleware.push(entry);
        if (currentPhase === 'controller') httpCallsController.push(entry);
        return response;
    } catch (err) {
        const elapsed = Date.now() - start;
        const entry = { url: targetUrl, method, status: 'ERROR: ' + err.message, elapsed };
        if (currentPhase === 'middleware') httpCallsMiddleware.push(entry);
        if (currentPhase === 'controller') httpCallsController.push(entry);
        throw err;
    }
};

async function instrumentDashboard() {
    const dashboardController = require('../controllers/dashboardController');
    const { data: clinic } = await db.supabase.from('clinics').select('id, slug').limit(1).maybeSingle();
    
    console.log('--- 1. Executando Middleware resolveClinicId ---');
    currentPhase = 'middleware';
    const reqMock = {
        user: { email: 'admin@clinicamodelo.com.br', clinicId: clinic.slug, role: 'admin' },
        query: {}
    };
    const resMock = { status: (c) => ({ json: (d) => console.log('Res status:', c, d) }) };
    
    await new Promise((resolve) => dashboardController.resolveClinicId(reqMock, resMock, resolve));
    
    console.log('--- 2. Executando Controller getDashboardData ---');
    currentPhase = 'controller';
    const dashboardResult = await new Promise((resolve) => {
        dashboardController.getDashboardData(reqMock, { json: resolve, status: () => ({ json: resolve }) });
    });
    
    console.log('\n📊 RELATÓRIO R2 — INSTRUMENTAÇÃO DE CHAMADAS HTTP AO POSTGREST:');
    console.log(`\n[A] Chamadas no Middleware resolveClinicId: ${httpCallsMiddleware.length}`);
    httpCallsMiddleware.forEach((call, i) => {
        console.log(`    [#${i+1}] [${call.method}] ${call.status} (${call.elapsed}ms) -> ${call.url}`);
    });

    console.log(`\n[B] Chamadas no Controller getDashboardData (após migração RPC): ${httpCallsController.length}`);
    httpCallsController.forEach((call, i) => {
        console.log(`    [#${i+1}] [${call.method}] ${call.status} (${call.elapsed}ms) -> ${call.url}`);
    });

    console.log(`\n[TOTAL DO CICLO DA ROTA GET /api/dashboard/data]: ${httpCallsMiddleware.length + httpCallsController.length} chamadas HTTP`);
}

instrumentDashboard().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
