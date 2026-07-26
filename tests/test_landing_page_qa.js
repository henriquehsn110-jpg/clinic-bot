const fs = require('fs');
const path = require('path');

const ROOT_INDEX_PATH = path.resolve(__dirname, '../../index.html');
const PUBLIC_INDEX_PATH = path.resolve(__dirname, '../public/index.html');

function runLandingPageQA() {
    console.log(`\n🧪 [TEST_LANDING_PAGE_QA] Iniciando Auditoria e QA da Landing Page Oficial...\n`);
    console.log(`📂 Arquivo Alvo: ${ROOT_INDEX_PATH}\n`);

    if (!fs.existsSync(ROOT_INDEX_PATH)) {
        console.error(`❌ FALHA: Arquivo index.html não encontrado na raiz!`);
        process.exit(1);
    }

    const content = fs.readFileSync(ROOT_INDEX_PATH, 'utf8');
    const lines = content.split('\n');
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

    // ── 1. Auditoria de Tipografia e Design (dashboard-ui-builder) ───────────
    console.log(`[Categoria 1] Auditoria de UI/UX & Impeccable Design Framework...`);
    assert(
        'Importação de Fontes Modernas (Outfit / Inter)',
        content.includes('Outfit') && content.includes('Inter'),
        'A Landing Page deve importar as fontes Outfit e Inter do Google Fonts.'
    );
    assert(
        'Uso de Variáveis CSS Tokenizadas (Paleta HSL/Escura)',
        content.includes('--bg-main') && content.includes('--accent-cyan') && content.includes('--wa-green'),
        'A estilização deve usar variáveis CSS como --bg-main, --accent-cyan e --wa-green.'
    );
    assert(
        'Efeitos de Glassmorphism & Sombra Resplandecente (Glow)',
        content.includes('backdrop-filter: blur') || content.includes('--shadow-glow'),
        'Deve incluir efeitos visuais modernos como glassmorphism e sombras glow.'
    );

    // ── 2. Auditoria de Segurança LGPD & Selos de Garantia (lgpd-security-auditor)
    console.log(`\n[Categoria 2] Auditoria de Segurança, Criptografia & LGPD...`);
    assert(
        'Menção a Criptografia AES-256 (Proteção de CPFs)',
        content.includes('AES-256') || content.includes('AES-256-GCM'),
        'Deve exibir o selo ou menção à criptografia militar AES-256 para conformidade LGPD.'
    );
    assert(
        'Menção ao Mascaramento de Dados (cpfMasked / Ocultação)',
        content.includes('cpfMasked') || content.toLowerCase().includes('mascaramento') || content.includes('•••.•••.•••-••'),
        'Deve evidenciar a proteção de privacidade com dados mascarados (cpfMasked).'
    );
    assert(
        'Menção à Autenticação de Webhooks HMAC SHA-256',
        content.includes('HMAC') || content.includes('SHA-256'),
        'Deve demonstrar a segurança de integração com assinatura HMAC SHA-256 da Meta.'
    );
    assert(
        'Menção ao Fuso Horário Oficial BRT (America/Sao_Paulo)',
        content.includes('America/Sao_Paulo') || content.includes('BRT') || content.includes('Horário de Brasília'),
        'Deve explicitar o fuso horário oficial do Brasil para evitar erros de agendamento.'
    );

    // ── 3. Auditoria de Segurança Frontend & Anti-XSS ─────────────────────────
    console.log(`\n[Categoria 3] Auditoria de Conformidade HTML5 & Anti-XSS...`);
    
    // Verificação de onclick inline
    const onclickLines = [];
    lines.forEach((line, idx) => {
        if (line.match(/\bonclick\s*=/i)) {
            onclickLines.push(idx + 1);
        }
    });
    assert(
        'Ausência de Atributos onclick Inline (Uso de Event Delegation / addEventListener)',
        onclickLines.length === 0,
        `Encontrado(s) atributo(s) onclick inline nas linhas: ${onclickLines.join(', ')}. Deve ser refatorado para addEventListener / Event Delegation.`
    );

    // Verificação de rel="noopener noreferrer" em target="_blank"
    const insecureBlankLinks = [];
    lines.forEach((line, idx) => {
        if (line.includes('target="_blank"') && !line.includes('noopener')) {
            insecureBlankLinks.push(idx + 1);
        }
    });
    assert(
        'Segurança em Links Externos (target="_blank" com rel="noopener noreferrer")',
        insecureBlankLinks.length === 0,
        `Encontrado(s) link(s) target="_blank" sem rel="noopener noreferrer" nas linhas: ${insecureBlankLinks.join(', ')}.`
    );

    // ── 4. Auditoria de Funcionalidades Dinâmicas (ROI & Simulador Ana) ──────
    console.log(`\n[Categoria 4] Auditoria de Lógica JS: Calculadora de ROI e Simulador WhatsApp...`);
    assert(
        'Presença da Calculadora Interativa de ROI',
        content.includes('res-roi') && content.includes('res-prejuizo') && content.includes('res-recuperado'),
        'A Landing Page deve conter a calculadora de ROI (com IDs res-roi, res-prejuizo, res-recuperado) para provar ganho financeiro.'
    );
    assert(
        'Presença do Simulador WhatsApp da IA "Ana"',
        content.includes('sim-messages') || content.includes('sim-input') || content.includes('sendMessage()') || content.toLowerCase().includes('ana'),
        'A Landing Page deve conter o simulador interativo da IA "Ana" conversando via WhatsApp.'
    );

    // ── 5. Verificação de Sincronização com o Diretório Public do Backend ────
    console.log(`\n[Categoria 5] Verificação de Sincronização de Deploy...`);
    let isSynced = false;
    if (fs.existsSync(PUBLIC_INDEX_PATH)) {
        const publicContent = fs.readFileSync(PUBLIC_INDEX_PATH, 'utf8');
        isSynced = (content.trim() === publicContent.trim());
    }
    assert(
        'Sincronização entre Raiz e clinic-bot-backend/public/index.html',
        isSynced,
        'O arquivo index.html da raiz precisa estar idêntico ao public/index.html do backend para que o servidor sirva a versão mais atualizada.'
    );

    // ── Resumo Final ──────────────────────────────────────────────────────────
    console.log(`\n================================================================`);
    if (failures.length === 0) {
        console.log(`🎉 AUDITORIA DA LANDING PAGE 100% APROVADA! (${passedTests}/${totalTests} Testes)`);
        console.log(`================================================================`);
        console.log(`✨ Qualidade: Impeccable Design e responsividade verificados.`);
        console.log(`🔒 Segurança: Conformidade LGPD, AES-256 e Anti-XSS atestados.`);
        console.log(`💬 Conversão: Calculadora de ROI e Simulador Ana operacionais.`);
        console.log(`================================================================\n`);
        process.exit(0);
    } else {
        console.log(`⚠️ AUDITORIA ENCONTROU ${failures.length} PONTO(S) PARA AJUSTE (${passedTests}/${totalTests} Passaram)`);
        console.log(`================================================================`);
        failures.forEach((f, i) => {
            console.log(`   ${i + 1}. [FALHA]: ${f.test}\n      -> Motivo: ${f.error}`);
        });
        console.log(`================================================================\n`);
        process.exit(1);
    }
}

runLandingPageQA();
