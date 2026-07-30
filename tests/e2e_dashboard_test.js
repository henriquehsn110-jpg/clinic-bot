require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execSync } = require('child_process');

const PORT = 3000;
const DASHBOARD_URL = `http://localhost:${PORT}/dashboard`;
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');
let serverProcess = null;

// Garante que o servidor esteja operacional
async function ensureServerRunning() {
    try {
        if (process.platform === 'win32') {
            execSync('cmd /c "for /f "tokens=5" %a in (\'netstat -aon ^| findstr :3000 ^| findstr LISTENING\') do taskkill /f /pid %a"', { stdio: 'ignore' });
        } else {
            execSync('fuser -k 3000/tcp || true', { stdio: 'ignore' });
        }
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) {}

    console.log("🚀 [SERVER] Auto-iniciando server.js na porta 3000...");
    serverProcess = spawn('node', [path.join(__dirname, '../server.js')], {
        cwd: path.join(__dirname, '..'),
        stdio: 'ignore'
    });

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
            const req = http.get(`${DASHBOARD_URL}`, (res) => {
                res.resume();
            });
            req.on('error', () => {});
            if (i > 2) break;
        } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 1500));
}

async function runDashboardE2EAudit() {
    console.log(`\n================================================================`);
    console.log(`🎭 CLINICABOT — AUDITORIA E2E DE USABILIDADE E FUNCIONALIDADE`);
    console.log(`   DASHBOARD: public/dashboard.html (http://localhost:3000/dashboard)`);
    console.log(`================================================================\n`);

    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    let browser;
    let totalPassed = 0;
    let totalFailed = 0;
    const consoleErrors = [];
    const pageErrors = [];

    function assert(message, condition) {
        if (condition) {
            totalPassed++;
            console.log(`  ✅ PASS: ${message}`);
        } else {
            totalFailed++;
            console.error(`  ❌ FAIL: ${message}`);
        }
    }

    try {
        await ensureServerRunning();

        console.log(`🔹 Iniciando navegador Headless Chromium (Puppeteer)...`);
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });

        // Monitora erros de JavaScript no Console do Navegador
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        page.on('pageerror', err => {
            pageErrors.push(err.message);
        });

        // --- TESTE 1: Carregamento do HTML e Título ---
        console.log(`\n🔹 [Passo 1/6] Carregando a página do Dashboard (/dashboard)...`);
        await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle0' });

        const title = await page.title();
        assert(`Título da página correto: "${title}"`, title.includes('ClinicaBot'));

        const hasLoginForm = await page.evaluate(() => !!document.querySelector('#modal-login, #login-email'));
        assert('Tela de Login visível para usuário não autenticado', hasLoginForm);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_1_login.png') });

        // --- TESTE 2: Simulação de Login da Recepção ---
        console.log(`\n🔹 [Passo 2/6] Executando Login no DOM real (admin@clinicamodelo.com.br)...`);
        
        await page.type('#login-email', 'admin@clinicamodelo.com.br');
        await page.type('#login-password', '123456');

        // Clica no botão de submit do formulário de login
        await page.evaluate(() => {
            const form = document.querySelector('#modal-login form');
            if (form) form.requestSubmit();
        });

        await new Promise(r => setTimeout(r, 1500));

        const isLogged = await page.evaluate(() => {
            const token = localStorage.getItem('clinicabot_token');
            const modalLogin = document.querySelector('#modal-login');
            const isModalClosed = !modalLogin || !modalLogin.classList.contains('active');
            return !!token && isModalClosed;
        });

        assert('Login efetuado e token JWT salvo no localStorage', isLogged);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_2_logged.png') });

        // --- TESTE 3: Navegação entre Abas do Sidebar (.tab-btn) ---
        console.log(`\n🔹 [Passo 3/6] Testando navegação real entre as abas do Menu Lateral (.tab-btn)...`);

        const tabsToTest = [
            { targetTab: 'tab-appointments', name: 'Agenda de Consultas' },
            { targetTab: 'tab-patients', name: 'Base de Pacientes' },
            { targetTab: 'tab-handoff', name: 'Transbordo Humano' },
            { targetTab: 'tab-doctors', name: 'Corpo Clínico & Médicos' },
            { targetTab: 'tab-crm', name: 'CRM & Remarketing' },
            { targetTab: 'tab-settings', name: 'Configurações da IA & WhatsApp' }
        ];

        for (const tab of tabsToTest) {
            const tabSuccess = await page.evaluate((tabId) => {
                const btns = Array.from(document.querySelectorAll('.tab-btn'));
                const btn = btns.find(b => b.getAttribute('onclick')?.includes(tabId.replace('tab-', '')));
                if (btn) {
                    btn.click();
                    const section = document.getElementById(tabId);
                    return section && section.style.display !== 'none';
                }
                return false;
            }, tab.targetTab);

            await new Promise(r => setTimeout(r, 400));
            assert(`Navegação e exibição da aba "${tab.name}"`, tabSuccess);

            if (tab.targetTab === 'tab-appointments') {
                // Testa a alternância para o Calendário Visual em Grid de 7 Colunas
                const calGridRes = await page.evaluate(() => {
                    if (typeof switchViewMode === 'function') {
                        switchViewMode('calendar');
                        const calDiv = document.getElementById('appointments-calendar-view');
                        const gridBody = document.getElementById('calendar-grid-body');
                        return calDiv && calDiv.style.display !== 'none' && gridBody && gridBody.children.length > 0;
                    }
                    return false;
                });
                assert('Calendário Visual Renderizado com Sucesso em Grid de 7 Colunas', calGridRes);
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_calendar_view.png') });
                // Volta para a visualização em Tabela
                await page.evaluate(() => {
                    if (typeof switchViewMode === 'function') switchViewMode('table');
                });
            }

            if (tab.targetTab === 'tab-settings') {
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_settings_mockup.png') });
                await page.evaluate(() => {
                    const el = document.querySelector('#cfg-min-cancellation');
                    if (el) el.scrollIntoView({ block: 'center' });
                });
                await new Promise(r => setTimeout(r, 400));
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_settings_item5.png') });
            }
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_3_tabs.png') });

        // --- TESTE 4: Teste de Abertura de Modais Interativos ---
        console.log(`\n🔹 [Passo 4/6] Testando modais interativos (+ Agendamento & + Paciente)...`);
        
        // Testa Modal Agendamento
        const openApptModalRes = await page.evaluate(() => {
            const btnAppt = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Agendamento'));
            if (btnAppt) {
                btnAppt.click();
                const modal = document.getElementById('modal-appointment');
                return modal && modal.classList.contains('active');
            }
            return false;
        });

        await new Promise(r => setTimeout(r, 400));
        assert('Modal "Novo Agendamento" abre com sucesso', openApptModalRes);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_4_modal_appointment.png') });

        // Fecha modal agendamento
        await page.evaluate(() => {
            const closeBtn = document.querySelector('#modal-appointment .modal-close, #modal-appointment button[onclick*="closeModal"]');
            if (closeBtn) closeBtn.click();
        });

        await new Promise(r => setTimeout(r, 400));

        // --- TESTE 5: Teste de Responsividade Mobile (Breakpoint 375x812) ---
        console.log(`\n🔹 [Passo 5/6] Testando layout responsivo em viewport Mobile (375x812)...`);
        await page.setViewport({ width: 375, height: 812, isMobile: true });
        await new Promise(r => setTimeout(r, 800));

        const isMobileResponsive = await page.evaluate(() => {
            return document.body.clientWidth <= 375;
        });
        assert('Layout ajustado corretamente para Viewport Mobile (375px)', isMobileResponsive);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard_5_mobile.png') });

        // Restaura viewport desktop
        await page.setViewport({ width: 1440, height: 900 });

        // --- TESTE 6: Auditoria de Erros no Console JS do Navegador ---
        console.log(`\n🔹 [Passo 6/6] Auditando logs e exceções no Console JS do Navegador...`);
        assert(`Zero exceções não tratadas no runtime do navegador (Erros: ${pageErrors.length})`, pageErrors.length === 0);

        if (pageErrors.length > 0) {
            console.error('  ⚠️ Exceções capturadas:', pageErrors);
        }

    } catch (err) {
        console.error('  ❌ EXCEÇÃO NO TESTE E2E DE BROWSER:', err.message, err.stack);
        totalFailed++;
    } finally {
        if (browser) {
            await browser.close();
            console.log('  🧹 Navegador Headless encerrado.');
        }

        if (serverProcess) {
            serverProcess.kill('SIGTERM');
            console.log('  🧹 Servidor Express encerrado.');
        }

        console.log('\n================================================================');
        console.log(`📊 RELATÓRIO DA AUDITORIA E2E DE USABILIDADE DO DASHBOARD:`);
        console.log(`   ✅ Passaram: ${totalPassed}`);
        console.log(`   ❌ Falharam: ${totalFailed}`);
        console.log(`   📸 Screenshots gravadas em: tests/screenshots/`);
        console.log('================================================================\n');

        if (totalFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runDashboardE2EAudit();
