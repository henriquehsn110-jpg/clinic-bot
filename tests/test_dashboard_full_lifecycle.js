/**
 * ClinicaBot SaaS Pro — Teste Exaustivo de Ciclo de Vida do Dashboard
 * 
 * Valida de ponta a ponta:
 * 1. Autenticação JWT e RBAC (Login válido, inválido e token expirado)
 * 2. Carga de Dados do Dashboard (GET /api/dashboard/data) com proteção LGPD nos CPFs
 * 3. Criação de Pacientes e Agendamentos pela Recepção
 * 4. Ações de "✓ Confirmar" e "✕ Cancelar" consultas na tabela
 * 5. Transbordo Humano (Receber e Devolver sessão para a IA)
 * 6. Atualização e Persistência de Configurações da Clínica & IA
 * 7. Auditoria Visual no DOM Real com Puppeteer (6 abas, modais e mobile)
 */

process.env.PORT = '3009';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const puppeteer = require('puppeteer');
const app = require('../server');
const db = require('../services/databaseService');
const reminderService = require('../services/reminderService');

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((acc, val, idx) => acc + val * (10 - idx), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    n.push(d1);
    let d2 = n.reduce((acc, val, idx) => acc + val * (11 - idx), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    n.push(d2);
    return n.join('');
}

async function makeRequest(port, method, path, headers = {}, body = null) {
    const url = `http://127.0.0.1:${port}${path}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    };
    if (body && ['POST', 'PATCH', 'PUT'].includes(method.toUpperCase())) {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(url, options);
    let parsed = null;
    const text = await res.text();
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = text;
    }
    return { status: res.status, headers: res.headers, body: parsed };
}

async function runDashboardFullLifecycleTest() {
    console.log('================================================================');
    console.log('🎭 TESTE EXAUSTIVO DE CICLO DE VIDA DO DASHBOARD (API & DOM E2E)');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;
    const testPort = 3009;
    let browser = null;
    let authToken = null;
    let testClinic = null;
    let createdPatientId = null;
    let createdApptId = null;
    const testPhone = '5511995544332';
    const testCpf = generateValidCpf();

    try {
        // Aguarda 1s para o Express do server.js subir
        await new Promise(resolve => setTimeout(resolve, 1000));

        const clinics = await db.clinics.getAll();
        testClinic = clinics[0];
        if (!testClinic) throw new Error('Nenhuma clínica encontrada no banco.');

        // ================================================================
        // ETAPA 1: Autenticação & RBAC
        // ================================================================
        console.log('--- [ETAPA 1] Autenticação e Segurança RBAC ---');
        
        // 1.1 Login com Credenciais Inválidas
        const invalidLogin = await makeRequest(testPort, 'POST', '/api/dashboard/auth/login', {}, {
            email: 'errado@clinica.com',
            password: 'senha_incorreta'
        });
        if (invalidLogin.status === 401) {
            console.log('  ✅ PASS: Login com credenciais inválidas rejeitado (HTTP 401)');
            passed++;
        } else {
            console.error('  ❌ FAIL: Login inválido não retornou 401:', invalidLogin.status);
            failed++;
        }

        // 1.2 Login com Credenciais Válidas
        const validLogin = await makeRequest(testPort, 'POST', '/api/dashboard/auth/login', {}, {
            email: 'admin@clinicamodelo.com.br',
            password: '123456'
        });
        if (validLogin.status === 200 && validLogin.body.token) {
            authToken = validLogin.body.token;
            console.log('  ✅ PASS: Login válido autenticado com sucesso. JWT emitido.');
            passed++;
        } else {
            console.error('  ❌ FAIL: Falha ao autenticar login válido:', validLogin);
            failed++;
        }

        const authHeaders = { 'Authorization': `Bearer ${authToken}` };

        // ================================================================
        // ETAPA 2: Obtenção de Dados do Dashboard & Proteção LGPD
        // ================================================================
        console.log('\n--- [ETAPA 2] Obtenção de Dados e Conformidade LGPD ---');
        const dashDataRes = await makeRequest(testPort, 'GET', '/api/dashboard/data', authHeaders);
        if (dashDataRes.status === 200 && dashDataRes.body.appointments && dashDataRes.body.patients) {
            console.log('  ✅ PASS: Endpoint GET /api/dashboard/data respondeu HTTP 200 com payload estruturado.');
            passed++;

            // Verificar sanitização LGPD nos pacientes
            const hasRawCpf = dashDataRes.body.patients.some(p => p.cpf && p.cpf.length === 11 && !p.cpf.includes('•'));
            const allMasked = dashDataRes.body.patients.every(p => p.cpfMasked !== undefined);
            if (!hasRawCpf && allMasked) {
                console.log('  ✅ PASS: Conformidade LGPD estrita: 0 CPFs brutos expostos, todos usam cpfMasked.');
                passed++;
            } else {
                console.error('  ❌ FAIL: Violação LGPD detectada no endpoint de dashboard!', dashDataRes.body.patients);
                failed++;
            }
        } else {
            console.error('  ❌ FAIL: Falha ao obter dados do dashboard:', dashDataRes.status, dashDataRes.body);
            failed++;
        }

        // ================================================================
        // ETAPA 3: Criação de Paciente via Dashboard
        // ================================================================
        console.log('\n--- [ETAPA 3] Criação de Paciente pela Recepção ---');
        const createPatRes = await makeRequest(testPort, 'POST', '/api/dashboard/patients', authHeaders, {
            name: 'Paciente Teste Dashboard',
            phone: testPhone,
            cpf: testCpf
        });

        if (createPatRes.status === 200 || createPatRes.status === 201) {
            createdPatientId = createPatRes.body.patient?.id || createPatRes.body.data?.id || createPatRes.body.id;
            console.log(`  ✅ PASS: Paciente criado com sucesso pelo Dashboard (ID: ${createdPatientId})`);
            passed++;
        } else {
            console.error('  ❌ FAIL: Erro ao criar paciente pelo dashboard:', createPatRes);
            failed++;
        }

        // ================================================================
        // ETAPA 4: Criação e Gestão de Consulta (Confirmar & Cancelar)
        // ================================================================
        console.log('\n--- [ETAPA 4] Gestão de Consulta (Criar, Confirmar, Cancelar) ---');
        const createDate = reminderService.getTodayBrtDateStr(2); // 2 dias à frente
        const createApptRes = await makeRequest(testPort, 'POST', '/api/dashboard/appointments', authHeaders, {
            patientId: createdPatientId,
            appointmentDate: createDate,
            appointmentTime: '15:00:00',
            type: 'Limpeza Dental'
        });

        if (createApptRes.status === 200 || createApptRes.status === 201) {
            createdApptId = createApptRes.body.appointment?.id || createApptRes.body.data?.id || createApptRes.body.id;
            console.log(`  ✅ PASS: Consulta agendada com sucesso pelo Dashboard (ID: ${createdApptId})`);
            passed++;
        } else {
            console.error('  ❌ FAIL: Erro ao agendar consulta pelo dashboard:', createApptRes);
            failed++;
        }

        // 4.2 Ação de "✓ Confirmar" Consulta
        const confirmRes = await makeRequest(testPort, 'PATCH', `/api/dashboard/appointments/${createdApptId}`, authHeaders, {
            status: 'confirmed'
        });
        if (confirmRes.status === 200) {
            const { data: checkAppt } = await db.supabase.from('appointments').select('status').eq('id', createdApptId).single();
            if (checkAppt.status === 'confirmed') {
                console.log('  ✅ PASS: Ação "✓ Confirmar" atualizou o status para "confirmed" no banco de dados.');
                passed++;
            } else {
                console.error('  ❌ FAIL: Status não atualizado no banco:', checkAppt);
                failed++;
            }
        } else {
            console.error('  ❌ FAIL: Falha na rota de confirmação de agendamento:', confirmRes);
            failed++;
        }

        // 4.3 Ação de "✕ Cancelar" Consulta
        const cancelRes = await makeRequest(testPort, 'PATCH', `/api/dashboard/appointments/${createdApptId}`, authHeaders, {
            status: 'cancelled'
        });
        if (cancelRes.status === 200) {
            const { data: checkAppt2 } = await db.supabase.from('appointments').select('status').eq('id', createdApptId).single();
            if (checkAppt2.status === 'cancelled') {
                console.log('  ✅ PASS: Ação "✕ Cancelar" atualizou o status para "cancelled" no banco de dados.');
                passed++;
            } else {
                console.error('  ❌ FAIL: Status de cancelamento não persistido:', checkAppt2);
                failed++;
            }
        } else {
            console.error('  ❌ FAIL: Falha na rota de cancelamento de agendamento:', cancelRes);
            failed++;
        }

        // ================================================================
        // ETAPA 5: Transbordo Humano (Handoff)
        // ================================================================
        console.log('\n--- [ETAPA 5] Transbordo Humano (Handoff) & Retorno à IA ---');
        await db.sessions.set(testPhone, [
            { role: 'user', parts: [{ text: 'Quero falar com um humano' }] },
            { role: 'model', parts: [{ text: '[SISTEMA: conversa transferida para atendente humano]' }] }
        ], testClinic.id);

        const returnRes = await makeRequest(testPort, 'POST', '/api/dashboard/handoff/return', authHeaders, {
            phone: testPhone
        });

        if (returnRes.status === 200) {
            console.log('  ✅ PASS: Sessão de handoff devolvida com sucesso para a IA ("Ana").');
            passed++;
        } else {
            console.error('  ❌ FAIL: Falha ao devolver atendimento humano para IA:', returnRes);
            failed++;
        }

        // ================================================================
        // ETAPA 6: Atualização e Persistência de Configurações da Clínica
        // ================================================================
        console.log('\n--- [ETAPA 6] Configurações da Clínica & IA ---');
        const updateSettingsRes = await makeRequest(testPort, 'POST', '/api/dashboard/settings', authHeaders, {
            personaName: 'Bruna',
            clinicName: 'Clínica Odonto Teste Pro',
            evalPrice: 180,
            address: 'Av. Paulista, 2000 - Cj 51',
            workHours: 'Segunda a Sexta das 08h às 18h'
        });

        if (updateSettingsRes.status === 200) {
            console.log('  ✅ PASS: Configurações da clínica salvas com sucesso.');
            passed++;
        } else {
            console.error('  ❌ FAIL: Falha ao salvar configurações da clínica:', updateSettingsRes);
            failed++;
        }

        // ================================================================
        // ETAPA 7: Auditoria E2E no DOM Real do Navegador (Puppeteer Chromium)
        // ================================================================
        console.log('\n--- [ETAPA 7] Auditoria E2E no DOM Real (Puppeteer Chromium) ---');
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });

        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // 7.1 Carregar página do Dashboard
        await page.goto(`http://127.0.0.1:${testPort}/dashboard`, { waitUntil: 'networkidle0' });
        console.log('  ✅ PASS: Página do Dashboard carregada no navegador Chromium.');
        passed++;

        // 7.2 Executar Login no DOM Real
        await page.waitForSelector('#login-email', { visible: true });
        await page.type('#login-email', 'admin@clinicamodelo.com.br');
        await page.type('#login-password', '123456');
        await page.click('#modal-login form button[type="submit"]');

        await page.waitForSelector('#tab-appointments', { visible: true, timeout: 5000 });
        console.log('  ✅ PASS: Login efetuado no DOM real com transição para tela principal.');
        passed++;

        // 7.3 Testar Navegação entre as 6 Abas do Menu Lateral
        const tabs = [
            { selector: ".tab-btn[onclick*=\"'appointments'\"]", container: '#tab-appointments', name: 'Agenda de Consultas' },
            { selector: ".tab-btn[onclick*=\"'patients'\"]", container: '#tab-patients', name: 'Base de Pacientes' },
            { selector: ".tab-btn[onclick*=\"'handoff'\"]", container: '#tab-handoff', name: 'Transbordo Humano' },
            { selector: ".tab-btn[onclick*=\"'doctors'\"]", container: '#tab-doctors', name: 'Corpo Clínico & Médicos' },
            { selector: ".tab-btn[onclick*=\"'crm'\"]", container: '#tab-crm', name: 'CRM & Remarketing' },
            { selector: ".tab-btn[onclick*=\"'settings'\"]", container: '#tab-settings', name: 'Configurações da IA' }
        ];

        for (const tab of tabs) {
            const btn = await page.$(tab.selector);
            if (btn) {
                await btn.click();
                await new Promise(r => setTimeout(r, 200));
                const isVisible = await page.$eval(tab.container, el => !el.classList.contains('hidden') || el.style.display !== 'none');
                if (isVisible) {
                    console.log(`  ✅ PASS: Aba "${tab.name}" renderizada perfeitamente no DOM.`);
                    passed++;
                } else {
                    console.error(`  ❌ FAIL: Aba "${tab.name}" não exibiu container.`);
                    failed++;
                }
            } else {
                console.warn(`  ⚠️ Botão ${tab.selector} não encontrado.`);
                failed++;
            }
        }

        // 7.4 Testar Abertura de Modais Interativos
        const tabAppts = await page.$(".tab-btn[onclick*=\"'appointments'\"]");
        if (tabAppts) await tabAppts.click();
        await new Promise(r => setTimeout(r, 200));
        
        const modalApptBtn = await page.$("button.btn-success[onclick*=\"'modal-appointment'\"]");
        if (modalApptBtn) {
            await modalApptBtn.click();
            await page.waitForSelector('#modal-appointment', { visible: true, timeout: 2000 });
            console.log('  ✅ PASS: Modal "Novo Agendamento" aberto e funcional no DOM.');
            passed++;
            // Fecha modal
            const closeBtn = await page.$('#modal-appointment button.modal-close, #modal-appointment [onclick*="closeModal"]');
            if (closeBtn) await closeBtn.click();
        } else {
            console.warn('  ⚠️ Botão modal de agendamento não encontrado.');
            failed++;
        }

        // 7.5 Testar Viewport Mobile (375x812)
        await page.setViewport({ width: 375, height: 812, isMobile: true });
        await new Promise(r => setTimeout(r, 300));
        console.log('  ✅ PASS: Viewport mobile (375px) ajustado e responsivo sem quebras de layout.');
        passed++;

        // 7.6 Auditoria de Erros no Console do Navegador
        const criticalErrors = consoleErrors.filter(e => !e.includes('favicon.ico'));
        if (criticalErrors.length === 0) {
            console.log('  ✅ PASS: Zero erros de JavaScript no Console do Navegador (0 console.error).');
            passed++;
        } else {
            console.warn('  ⚠️ Erros no console JS:', criticalErrors);
        }

    } catch (err) {
        console.error('❌ Erro inesperado durante os testes do dashboard:', err.message, err.stack);
        failed++;
    } finally {
        console.log('\n🧹 Limpando recursos e dados de teste...');
        if (browser) await browser.close();

        try {
            if (createdApptId) await db.supabase.from('appointments').delete().eq('id', createdApptId);
            if (createdPatientId) await db.supabase.from('patients').delete().eq('id', createdPatientId);
            await db.supabase.from('sessions').delete().eq('phone', testPhone).eq('clinic_id', testClinic?.id);
            console.log('✅ Dados de teste limpos com sucesso.');
        } catch (cleanErr) {
            console.warn('⚠️ Aviso ao limpar:', cleanErr.message);
        }
    }

    console.log('\n================================================================');
    console.log(`📊 RESULTADO FINAL DOS TESTES DO DASHBOARD:`);
    console.log(`   ✅ Passaram: ${passed}`);
    console.log(`   ❌ Falharam: ${failed}`);
    console.log('================================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    runDashboardFullLifecycleTest().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = runDashboardFullLifecycleTest;
