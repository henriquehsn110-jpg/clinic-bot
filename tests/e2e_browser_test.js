const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const INDEX_URL = 'file://' + path.resolve(__dirname, '../../index.html').replace(/\\/g, '/');
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');

async function runE2EBrowserTests() {
    console.log(`\n🎭 [E2E_BROWSER_TEST] Iniciando Suíte E2E Headless Browser (Chromium)...`);
    console.log(`📂 Alvo: ${INDEX_URL}\n`);

    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    let browser;
    let totalTests = 0;
    let passedTests = 0;
    const failures = [];

    function assert(name, condition, errorMsg) {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`   ✅ PASS [Test #${totalTests}]: ${name}`);
        } else {
            failures.push({ test: name, error: errorMsg });
            console.error(`   ❌ FAIL [Test #${totalTests}]: ${name} -> ${errorMsg}`);
        }
    }

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // ── 1. Validação de Links dos Planos de Assinatura ────────────────────
        console.log(`[Categoria 1] Validação E2E dos Links dos Planos (Starter, Pro, Enterprise)...`);
        await page.goto(INDEX_URL, { waitUntil: 'load' });

        const planLinks = await page.evaluate(() => {
            const cards = document.querySelectorAll('.price-card');
            const links = [];
            cards.forEach(card => {
                const title = card.querySelector('h3')?.innerText.trim() || '';
                const a = card.querySelector('a');
                if (a) {
                    links.push({
                        title,
                        href: a.getAttribute('href'),
                        target: a.getAttribute('target'),
                        rel: a.getAttribute('rel')
                    });
                }
            });
            return links;
        });

        const starterLink = planLinks.find(l => l.title === 'Starter');
        const proLink = planLinks.find(l => l.title === 'Pro');
        const enterpriseLink = planLinks.find(l => l.title === 'Enterprise');

        assert(
            'Link do Plano Starter Aponta para WhatsApp Comercial com Texto Correto',
            starterLink && starterLink.href.includes('wa.me') && starterLink.href.includes('Starter'),
            `Esperado link wa.me com Starter, obtido: ${starterLink ? starterLink.href : 'não encontrado'}`
        );

        assert(
            'Link do Plano Pro Aponta para WhatsApp Comercial com Texto Correto',
            proLink && proLink.href.includes('wa.me') && proLink.href.includes('Pro'),
            `Esperado link wa.me com Pro, obtido: ${proLink ? proLink.href : 'não encontrado'}`
        );

        assert(
            'Link do Plano Enterprise Aponta para WhatsApp Consultor',
            enterpriseLink && enterpriseLink.href.includes('wa.me') && enterpriseLink.href.includes('Enterprise'),
            `Esperado link wa.me com Enterprise, obtido: ${enterpriseLink ? enterpriseLink.href : 'não encontrado'}`
        );

        assert(
            'Segurança em Links de Vendas (target="_blank" & rel="noopener noreferrer")',
            planLinks.every(l => l.target === '_blank' && l.rel && l.rel.includes('noopener')),
            'Todos os links de contratação devem possuir target="_blank" e rel="noopener noreferrer".'
        );

        // ── 2. Validação Interativa E2E do Simulador da IA Ana (Clique Real DOM) ───
        console.log(`\n[Categoria 2] Validação E2E da Interatividade do Simulador WhatsApp da Ana...`);
        
        // Abrir Simulador
        await page.click('#btn-header-demo');
        await page.waitForSelector('#modal-simulator.active', { visible: true, timeout: 3000 });
        assert('Modal do Simulador Abre Corretamente no DOM', true, '');

        // Clicar em "Agendar Nova Consulta"
        const btnAgendar = await page.waitForSelector('[data-reply="NovoAgendamento"]', { visible: true, timeout: 3000 });
        await btnAgendar.click();
        await new Promise(r => setTimeout(r, 700)); // Esperar resposta da Ana

        // Verificar que a Ana respondeu com botões de especialidade
        const btnEspMedica = await page.$('[data-reply="EspMedica"]');
        assert(
            'Clique em "Agendar Nova Consulta" Avança para Seleção de Especialidades',
            btnEspMedica !== null,
            'Após clicar em Agendar Nova Consulta, o DOM deve exibir as opções de especialidade (Medicina, Odontologia, Estética).'
        );

        // Clicar na Especialidade Médica
        if (btnEspMedica) {
            await btnEspMedica.click();
            await new Promise(r => setTimeout(r, 700));
        }

        // Verificar que a Ana respondeu com botões de médicos/horários
        const btnHora10 = await page.$('[data-reply="Hora10"]');
        assert(
            'Clique na Especialidade Avança para Escolha de Horário/Médico',
            btnHora10 !== null,
            'O DOM deve apresentar a lista de médicos e horários livres.'
        );

        // Clicar no Horário
        if (btnHora10) {
            await btnHora10.click();
            await new Promise(r => setTimeout(r, 700));
        }

        // Verificar botão de finalizar cadastro LGPD
        const btnFinalizar = await page.$('[data-reply="FinalizarAgendamento"]');
        assert(
            'Clique no Horário Solicita Cadastro LGPD',
            btnFinalizar !== null,
            'O DOM deve apresentar o botão para confirmar reserva e cadastro LGPD.'
        );

        // Clicar em Finalizar
        if (btnFinalizar) {
            await btnFinalizar.click();
            await new Promise(r => setTimeout(r, 700));
        }

        // Verificar mensagem de confirmação final com CPF mascarado
        const chatText = await page.$eval('#wa-chat-body', el => el.innerText);
        assert(
            'Jornada Final de Agendamento Exibe Confirmação e CPF Mascarado (LGPD)',
            chatText.includes('CONSULTA AGENDADA COM SUCESSO') && chatText.includes('123.***.***-45'),
            'O chat do DOM deve conter o texto de confirmação final e o CPF mascarado.'
        );

        // ── 3. Inspeção Visual em Múltiplos Breakpoints (Screenshots de Controle) ──
        console.log(`\n[Categoria 3] Captura de Screenshots de Controle Visual (Mobile, Tablet, Laptop, Desktop)...`);
        
        const viewports = [
            { name: 'mobile_375.png', width: 375, height: 812 },
            { name: 'tablet_768.png', width: 768, height: 1024 },
            { name: 'laptop_1180.png', width: 1180, height: 800 },
            { name: 'desktop_1440.png', width: 1440, height: 900 }
        ];

        for (const vp of viewports) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.goto(INDEX_URL, { waitUntil: 'load' });
            const shotPath = path.join(SCREENSHOT_DIR, vp.name);
            await page.screenshot({ path: shotPath, fullPage: false });
            assert(`Screenshot Gerado: ${vp.name} (${vp.width}x${vp.height}px)`, fs.existsSync(shotPath), '');
        }

        await browser.close();

        // ── Resumo Final ──────────────────────────────────────────────────────
        console.log(`\n================================================================`);
        if (failures.length === 0) {
            console.log(`🎉 TESTES E2E HEADLESS BROWSER 100% APROVADOS! (${passedTests}/${totalTests} Testes)`);
            console.log(`================================================================`);
            console.log(`✨ Links de Vendas: 100% validados apontando para o WhatsApp.`);
            console.log(`💬 DOM Interativo: Cliques em botões e navegação da Ana verificados.`);
            console.log(`📸 Inspeção Visual: 4 Screenshots de controle gerados em ${SCREENSHOT_DIR}`);
            console.log(`================================================================\n`);
            process.exit(0);
        } else {
            console.log(`⚠️ FALHA NOS TESTES E2E BROWSER (${passedTests}/${totalTests} Passaram)`);
            failures.forEach((f, i) => console.log(`   ${i + 1}. [FALHA]: ${f.test} -> ${f.error}`));
            console.log(`================================================================\n`);
            process.exit(1);
        }

    } catch (err) {
        console.error(`❌ ERRO NA EXECUÇÃO DO PUPPETEER E2E:`, err);
        if (browser) await browser.close();
        process.exit(1);
    }
}

runE2EBrowserTests();
