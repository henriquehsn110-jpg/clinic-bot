/**
 * Teste Empírico de Autorização RBAC & Isolamento Multi-Tenant em Dashboard Routes
 * 
 * Valida os 4 fixes de vulnerabilidade:
 * 1. VULN-01: Ownership check em updateAppointmentStatus (bloqueia alteração cross-tenant com HTTP 403)
 * 2. VULN-02: Fix do clinicId no returnHandoffToAI
 * 3. VULN-03: Restrição de updateSettings para role 'clinic' (retorna HTTP 403)
 * 4. VULN-04: Restrição de audit-stream para role 'clinic' (retorna HTTP 403)
 */

require('dotenv').config();
const path = require('path');
const axios = require('axios');
const db = require('../services/databaseService');

const BASE_URL = 'http://localhost:3000';
let serverProcess = null;

async function ensureServerRunning() {
    try {
        await axios.get(`${BASE_URL}/health`, { timeout: 1500 });
    } catch (err) {
        const { spawn } = require('child_process');
        serverProcess = spawn('node', [path.join(__dirname, '../server.js')], {
            cwd: path.join(__dirname, '..'),
            stdio: 'ignore'
        });
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            try {
                await axios.get(`${BASE_URL}/health`, { timeout: 1000 });
                return;
            } catch (e) {}
        }
        throw new Error("Servidor não iniciou na porta 3000");
    }
}

async function runRbacTests() {
    console.log(`================================================================`);
    console.log(`🛡️ TESTE EMPÍRICO DE AUTORIZAÇÃO RBAC & ISOLAMENTO MULTI-TENANT`);
    console.log(`================================================================\n`);

    await ensureServerRunning();

    // 1. Obter tokens para admin (clínica A) e clinic (clínica B / role restrita)
    const adminLogin = await axios.post(`${BASE_URL}/api/dashboard/auth/login`, {
        email: 'admin@clinicamodelo.com.br',
        password: '123456'
    });
    const adminToken = adminLogin.data.token;

    const clinicRoleLogin = await axios.post(`${BASE_URL}/api/dashboard/auth/login`, {
        email: 'admin@odontoriso.com.br',
        password: '123456'
    });
    const clinicRoleToken = clinicRoleLogin.data.token;

    console.log(`🔹 Tokens obtidos:`);
    console.log(`   - Admin Token (Clínica Alpha): role '${adminLogin.data.user.role}'`);
    console.log(`   - Clinic Role Token (Clínica Beta): role '${clinicRoleLogin.data.user.role}'\n`);

    // -------------------------------------------------------------
    // TESTE 1: VULN-03 — Tentar alterar /settings usando role 'clinic' (deve retornar HTTP 403)
    // -------------------------------------------------------------
    console.log(`[TESTE 1/4] VULN-03: updateSettings com role 'clinic'...`);
    try {
        await axios.post(`${BASE_URL}/api/dashboard/settings`, { name: 'Hack Clinic' }, {
            headers: { Authorization: `Bearer ${clinicRoleToken}` }
        });
        console.error(`❌ FAIL: Role 'clinic' conseguiu alterar /settings (deveria ser bloqueada com 403)`);
        process.exit(1);
    } catch (err) {
        if (err.response && err.response.status === 403) {
            console.log(`  ✅ PASS: HTTP 403 Acesso negado para role 'clinic' em /settings`);
        } else {
            console.error(`❌ FAIL: Esperado HTTP 403, recebido:`, err.response?.status || err.message);
            process.exit(1);
        }
    }

    // -------------------------------------------------------------
    // TESTE 2: VULN-04 — Tentar acessar /audit-stream usando role 'clinic' (deve retornar HTTP 403)
    // -------------------------------------------------------------
    console.log(`\n[TESTE 2/4] VULN-04: getAuditStream com role 'clinic'...`);
    try {
        await axios.get(`${BASE_URL}/api/dashboard/audit-stream`, {
            headers: { Authorization: `Bearer ${clinicRoleToken}` }
        });
        console.error(`❌ FAIL: Role 'clinic' conseguiu acessar /audit-stream (deveria ser bloqueada com 403)`);
        process.exit(1);
    } catch (err) {
        if (err.response && err.response.status === 403) {
            console.log(`  ✅ PASS: HTTP 403 Acesso negado para role 'clinic' em /audit-stream`);
        } else {
            console.error(`❌ FAIL: Esperado HTTP 403, recebido:`, err.response?.status || err.message);
            process.exit(1);
        }
    }

    // -------------------------------------------------------------
    // TESTE 3: VULN-01 — Tentativa de alteração de agendamento cross-tenant
    // -------------------------------------------------------------
    console.log(`\n[TESTE 3/4] VULN-01: Ownership check em updateAppointmentStatus (cross-tenant)...`);
    
    // Garante que Clínica Alpha e Clínica Beta existem no Supabase com UUIDs distintos
    let { data: alphaClinic } = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').maybeSingle();
    if (!alphaClinic) {
        const { data: created } = await db.supabase.from('clinics').insert({ name: 'Clínica Modelo', slug: 'clinica-modelo' }).select().single();
        alphaClinic = created;
    }
    let { data: betaClinic } = await db.supabase.from('clinics').select('id').eq('slug', 'odonto-riso').maybeSingle();
    if (!betaClinic) {
        const { data: created } = await db.supabase.from('clinics').insert({ name: 'Clínica Odonto Riso', slug: 'odonto-riso' }).select().single();
        betaClinic = created;
    }

    const alphaId = alphaClinic.id;
    const betaId = betaClinic.id;
    console.log(`   Tenants de teste: Alpha (${alphaId}), Beta (${betaId})`);

    // Limpa dados de testes anteriores se existirem
    const { data: existingDummyP } = await db.supabase.from('patients').select('id').eq('phone', '5511999990001').maybeSingle();
    if (existingDummyP) {
        await db.supabase.from('appointments').delete().eq('patient_id', existingDummyP.id);
        await db.supabase.from('patients').delete().eq('id', existingDummyP.id);
    }

    // Cria paciente dummy e agendamento dummy na clínica Alpha
    const { data: dummyPatient, error: pErr } = await db.supabase.from('patients').insert({
        phone: '5511999990001',
        name: 'Paciente Teste RBAC',
        clinic_id: alphaId
    }).select().single();

    if (pErr || !dummyPatient) {
        console.error('Falha ao criar paciente dummy:', pErr);
        process.exit(1);
    }

    const { data: dummyAppt, error: apptErr } = await db.supabase.from('appointments').insert({
        patient_id: dummyPatient.id,
        clinic_id: alphaId,
        type: 'Consulta Teste RBAC',
        appointment_date: '2026-12-01',
        appointment_time: '14:00:00',
        status: 'pending'
    }).select().single();

    if (apptErr || !dummyAppt) {
        console.error(`Falha ao criar agendamento de teste:`, apptErr);
        process.exit(1);
    }

    console.log(`   Agendamento de teste criado na Clínica Alpha (${alphaId}): ID ${dummyAppt.id}`);

    // Tenta cancelar esse agendamento usando o token da Clínica Beta (clinicRoleToken)
    try {
        await axios.patch(`${BASE_URL}/api/dashboard/appointments/${dummyAppt.id}`, { status: 'cancelled' }, {
            headers: { Authorization: `Bearer ${clinicRoleToken}` }
        });
        console.error(`❌ FAIL: Clínica Beta conseguiu alterar agendamento da Clínica Alpha! (Vulnerabilidade Multi-Tenant)`);
        await db.supabase.from('appointments').delete().eq('id', dummyAppt.id);
        process.exit(1);
    } catch (err) {
        if (err.response && err.response.status === 403) {
            console.log(`  ✅ PASS: HTTP 403 Bloqueado! "Acesso negado: este agendamento pertence a outra clínica."`);
        } else {
            console.error(`❌ FAIL: Esperado HTTP 403, recebido:`, err.response?.status, err.response?.data);
            await db.supabase.from('appointments').delete().eq('id', dummyAppt.id);
            process.exit(1);
        }
    }

    // Limpa agendamento e paciente dummy
    await db.supabase.from('appointments').delete().eq('id', dummyAppt.id);
    await db.supabase.from('patients').delete().eq('id', dummyPatient.id);

    // -------------------------------------------------------------
    // TESTE 4: VULN-02 — returnHandoffToAI (Teste Positivo + Teste Negativo Cross-Tenant)
    // -------------------------------------------------------------
    console.log(`\n[TESTE 4/5] VULN-02: returnHandoffToAI isolamento cross-tenant...`);
    const testPhone = '5511988887777';
    // 4a. Cria sessão de handoff de teste na Clínica Alpha
    await db.sessions.set(testPhone, [{ parts: [{ text: '[SISTEMA: conversa transferida para atendente humano]' }] }], alphaId);

    // 4b. TESTE NEGATIVO: Clínica Beta tenta remover a sessão de handoff da Clínica Alpha
    await axios.post(`${BASE_URL}/api/dashboard/handoff/return`, { phone: testPhone }, {
        headers: { Authorization: `Bearer ${clinicRoleToken}` }
    });

    const sessAfterBetaAttempt = await db.sessions.get(testPhone, alphaId);
    if (sessAfterBetaAttempt && sessAfterBetaAttempt.length > 0) {
        console.log(`  ✅ PASS (Negativo): Clínica Beta NÃO conseguiu deletar a sessão da Clínica Alpha! (Sessão preservada)`);
    } else {
        console.error(`❌ FAIL: Clínica Beta deletou a sessão de handoff da Clínica Alpha! (Falha de isolamento)`);
        process.exit(1);
    }

    // 4c. TESTE POSITIVO: Clínica Alpha remove sua própria sessão de handoff
    const handoffRes = await axios.post(`${BASE_URL}/api/dashboard/handoff/return`, { phone: testPhone }, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });

    if (handoffRes.data.success) {
        const sessAfterAlpha = await db.sessions.get(testPhone, alphaId);
        if (!sessAfterAlpha || sessAfterAlpha.length === 0) {
            console.log(`  ✅ PASS (Positivo): Clínica Alpha removeu sua própria sessão com sucesso.`);
        } else {
            console.error(`❌ FAIL: Sessão não foi removida pela própria clínica`);
            process.exit(1);
        }
    } else {
        console.error(`❌ FAIL: returnHandoffToAI retornou success: false`);
        process.exit(1);
    }

    // -------------------------------------------------------------
    // TESTE 5: Fail-Closed Guard — Token com slug de clínica inexistente
    // -------------------------------------------------------------
    console.log(`\n[TESTE 5/5] Fail-Closed Guard: Token com clinicId não cadastrada...`);
    const crypto = require('crypto');
    const SESSION_SECRET = process.env.APP_SECRET || 'dev_only_fallback_not_for_production';
    const fakeData = JSON.stringify({ email: 'hacker@fake.com', clinicId: 'slug-inexistente-1234', role: 'admin', exp: Date.now() + 3600000 });
    const fakeSig = crypto.createHmac('sha256', SESSION_SECRET).update(fakeData).digest('hex');
    const fakeToken = Buffer.from(fakeData).toString('base64') + '.' + fakeSig;

    try {
        await axios.get(`${BASE_URL}/api/dashboard/data`, {
            headers: { Authorization: `Bearer ${fakeToken}` }
        });
        console.error(`❌ FAIL: Token com slug inexistente conseguiu acessar /data! (Deveria retornar 403)`);
        process.exit(1);
    } catch (err) {
        if (err.response && err.response.status === 403) {
            console.log(`  ✅ PASS: HTTP 403 Bloqueado com sucesso! ("Acesso negado: clínica não cadastrada no sistema.")`);
        } else {
            console.error(`❌ FAIL: Esperado HTTP 403, recebido:`, err.response?.status, err.response?.data);
            process.exit(1);
        }
    }

    if (serverProcess) serverProcess.kill();

    console.log(`\n================================================================`);
    console.log(`🎉 TODAS AS 5 SUÍTES DE SEGURANÇA E ISOLAMENTO RBAC FORAM APROVADAS`);
    console.log(`================================================================`);
    process.exit(0);
}

runRbacTests().catch(err => {
    console.error('Erro na execução do teste RBAC:', err);
    if (serverProcess) serverProcess.kill();
    process.exit(1);
});
