require('dotenv').config();
const http = require('http');
const path = require('path');
const { spawn, execSync } = require('child_process');
const db = require('../services/databaseService');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
let serverProcess = null;

// Garante que o servidor Express esteja rodando na porta 3000
async function ensureServerRunning() {
    try {
        if (process.platform === 'win32') {
            execSync('cmd /c "for /f "tokens=5" %a in (\'netstat -aon ^| findstr :3000 ^| findstr LISTENING\') do taskkill /f /pid %a"', { stdio: 'ignore' });
        } else {
            execSync('fuser -k 3000/tcp || true', { stdio: 'ignore' });
        }
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) {}

    console.log("  🚀 Auto-iniciando server.js na porta 3000...");
    serverProcess = spawn('node', [path.join(__dirname, '../server.js')], {
        cwd: path.join(__dirname, '..'),
        stdio: 'ignore'
    });

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
            const res = await makeRequest('/health', 'GET');
            if (res.status === 200 || res.status === 404) {
                console.log("  ✅ Servidor Express pronto e operacional na porta 3000.");
                return;
            }
        } catch (e) {}
    }
    throw new Error("Não foi possível iniciar o servidor na porta 3000 após 10 segundos.");
}

// Função utilitária para requisições HTTP locais
function makeRequest(reqPath, method = 'GET', body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(reqPath, BASE_URL);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(url, { method, headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runIntegrationTest() {
    console.log('\n================================================================');
    console.log('🔄 CLINICABOT — TESTE DE INTEGRAÇÃO E2E (CHAT ↔ DASHBOARD)');
    console.log('================================================================\n');

    let passedTests = 0;
    let failedTests = 0;
    const testPhone = '5511988887777';
    let testClinicId = null;
    let testPatientId = null;
    let testApptId = null;
    let dashboardToken = null;

    try {
        await ensureServerRunning();

        // 1. Obter clínica "Clínica Modelo" do Supabase
        const { data: clinic } = await db.supabase.from('clinics').select('id, slug').eq('slug', 'clinica-modelo').single();
        if (clinic && clinic.id) {
            testClinicId = clinic.id;
        } else {
            const { data: fallback } = await db.supabase.from('clinics').select('id').limit(1).single();
            testClinicId = fallback.id;
        }

        // --- ETAPA 1: Login no Dashboard ---
        console.log('\n🔹 [Passo 1/5] Testando autenticação da recepção no Dashboard (/api/dashboard/auth/login)...');
        const loginRes = await makeRequest('/api/dashboard/auth/login', 'POST', {
            email: 'admin@clinicamodelo.com.br',
            password: '123456'
        });

        if (loginRes.status === 200 && loginRes.body.token) {
            dashboardToken = loginRes.body.token;
            console.log('  ✅ PASS: Login efetuado com sucesso. Token JWT gerado.');
            passedTests++;
        } else {
            console.error('  ❌ FAIL: Falha no login do Dashboard:', loginRes.body);
            failedTests++;
        }

        // --- ETAPA 2: Criação de paciente e agendamento via Chat ---
        console.log('\n🔹 [Passo 2/5] Criando agendamento pelo Chat (Simulando fluxo do WhatsApp)...');
        const patient = await db.patients.findOrCreate(testPhone, testClinicId);
        testPatientId = patient.id;
        await db.patients.updateName(testPhone, 'Paciente Teste Integração', testClinicId);

        const testDate = '2026-08-15';
        const testTime = '11:00';

        // Garante que o slot anterior não existe para o teste ser limpo
        await db.supabase.from('appointments').delete().eq('patient_id', testPatientId).eq('clinic_id', testClinicId);

        const appt = await db.appointments.create({
            patient_id: testPatientId,
            clinic_id: testClinicId,
            appointment_date: testDate,
            appointment_time: testTime,
            type: 'Consulta geral',
            notes: 'Criado via Teste de Integração Chat'
        });
        testApptId = appt.id;

        if (testApptId) {
            console.log(`  ✅ PASS: Agendamento criado via Chat com ID: ${testApptId} (Status: pending).`);
            passedTests++;
        } else {
            console.error('  ❌ FAIL: Não foi possível criar o agendamento via Chat.');
            failedTests++;
        }

        // --- ETAPA 3: Sincronização em tempo real no Dashboard ---
        console.log('\n🔹 [Passo 3/5] Verificando se o agendamento do Chat aparece no Dashboard (/api/dashboard/data)...');
        const dashDataRes = await makeRequest('/api/dashboard/data', 'GET', null, dashboardToken);

        if (dashDataRes.status === 200 && dashDataRes.body.appointments) {
            const foundInDash = dashDataRes.body.appointments.find(a => a.id === testApptId);
            if (foundInDash) {
                console.log(`  ✅ PASS: Agendamento ID ${testApptId} sincronizado com sucesso no Dashboard!`);
                console.log(`     Informações: Paciente: "${foundInDash.patients?.name || 'Carregado'}", Data: ${foundInDash.appointment_date}, Horário: ${foundInDash.appointment_time}`);
                passedTests++;
            } else {
                console.error(`  ❌ FAIL: Agendamento ID ${testApptId} NÃO foi localizado na resposta do Dashboard.`);
                failedTests++;
            }
        } else {
            console.error('  ❌ FAIL: Erro ao buscar dados do Dashboard:', dashDataRes.body);
            failedTests++;
        }

        // --- ETAPA 4: Ação no Dashboard (Confirmar Consulta) ---
        console.log('\n🔹 [Passo 4/5] Confirmando a consulta pelo Dashboard (/api/dashboard/appointments/:id)...');
        const updateRes = await makeRequest(`/api/dashboard/appointments/${testApptId}`, 'POST', {
            status: 'confirmed'
        }, dashboardToken);

        if (updateRes.status === 200 && updateRes.body.success) {
            // Verifica no banco Supabase se o status mudou
            const { data: checkAppt } = await db.supabase.from('appointments').select('status').eq('id', testApptId).single();
            if (checkAppt && checkAppt.status === 'confirmed') {
                console.log('  ✅ PASS: Status alterado para "confirmed" no banco de dados após ação do Dashboard!');
                passedTests++;
            } else {
                console.error('  ❌ FAIL: Status no banco não foi atualizado para "confirmed".');
                failedTests++;
            }
        } else {
            console.error('  ❌ FAIL: Falha ao atualizar status pelo Dashboard:', updateRes.body);
            failedTests++;
        }

        // --- ETAPA 5: Teste de Transição Handoff Humano ---
        console.log('\n🔹 [Passo 5/5] Testando solicitação de Atendimento Humano (Handoff)...');
        const handoffHistory = [
            { role: 'user', parts: [{ text: 'Falar com atendente' }] },
            { role: 'model', parts: [{ text: 'Encaminhando você para um atendente humano...\n[SISTEMA: conversa transferida para atendente humano]' }] }
        ];

        await db.sessions.set(testPhone, handoffHistory, testClinicId);
        
        const recheckDash = await makeRequest('/api/dashboard/data', 'GET', null, dashboardToken);
        if (recheckDash.status === 200 && recheckDash.body.handoffs) {
            const hasHandoff = recheckDash.body.handoffs.some(s => s.phone === testPhone);
            if (hasHandoff) {
                console.log(`  ✅ PASS: Sessão de handoff para [${testPhone}] exibida no painel de Atendimento Humano do Dashboard!`);
                passedTests++;
            } else {
                console.error('  ❌ FAIL: Sessão de handoff não localizada no Dashboard.');
                failedTests++;
            }
        } else {
            console.error('  ❌ FAIL: Falha ao re-checar handoffs no Dashboard.');
            failedTests++;
        }

    } catch (err) {
        console.error('  ❌ EXCEÇÃO NO TESTE DE INTEGRAÇÃO:', err.message, err.stack);
        failedTests++;
    } finally {
        // --- LIMPEZA DE DADOS DE TESTE ---
        console.log('\n🧹 Limpando dados de teste do banco Supabase...');
        try {
            if (testApptId) await db.supabase.from('appointments').delete().eq('id', testApptId);
            if (testPatientId) await db.supabase.from('patients').delete().eq('id', testPatientId);
            await db.supabase.from('sessions').delete().eq('phone', testPhone);
            console.log('  ✅ Limpeza concluída com sucesso.');
        } catch (cleanErr) {
            console.warn('  ⚠️ Alerta na limpeza:', cleanErr.message);
        }

        if (serverProcess) {
            console.log('  🧹 Encerrando processo do servidor Express auto-iniciado...');
            serverProcess.kill('SIGTERM');
        }

        console.log('\n================================================================');
        console.log(`📊 RESULTADO FINAL DO TESTE DE INTEGRAÇÃO CHAT ↔ DASHBOARD:`);
        console.log(`   ✅ Passaram: ${passedTests}`);
        console.log(`   ❌ Falharam: ${failedTests}`);
        console.log('================================================================\n');

        if (failedTests > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runIntegrationTest();
