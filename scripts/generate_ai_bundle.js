const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');
const backendDir = path.resolve(__dirname, '../');

const filesToBundle = [
    { label: 'AGENTS.md (Regras Invioláveis do Sistema)', path: path.join(rootDir, 'AGENTS.md') },
    { label: 'MEMORY.md (Lições e Edge Cases v11.0)', path: path.join(rootDir, 'MEMORY.md') },
    { label: 'STATE.md (Estado Atual e Tarefas Concluídas)', path: path.join(rootDir, 'STATE.md') },
    { label: 'PROJECT_KNOWLEDGE_BASE.md (Multi-Tenant & RLS)', path: path.join(rootDir, 'PROJECT_KNOWLEDGE_BASE.md') },
    { label: 'server.js (Servidor Principal & Roteamento Estático)', path: path.join(backendDir, 'server.js') },
    { label: 'controllers/conversationController.js (Motor da IA Ana)', path: path.join(backendDir, 'controllers/conversationController.js') },
    { label: 'controllers/dashboardController.js (Painel de Gestão e Horários)', path: path.join(backendDir, 'controllers/dashboardController.js') },
    { label: 'services/databaseService.js (Camada Supabase & RLS)', path: path.join(backendDir, 'services/databaseService.js') },
    { label: 'services/whatsappService.js (Integração Meta WhatsApp API)', path: path.join(backendDir, 'services/whatsappService.js') },
    { label: 'services/calendarService.js (Gestão de Agenda e Conflitos)', path: path.join(backendDir, 'services/calendarService.js') },
    { label: 'simulators/whatsapp-web/index.html (Simulador Ultra-Realista com Botões Clicáveis)', path: path.join(rootDir, 'simulators/whatsapp-web/index.html') },
    { label: 'public/dashboard.html (Frontend Recepção com LGPD & XSS Protection)', path: path.join(backendDir, 'public/dashboard.html') }
];

let bundleContent = `# 🚀 ClinicaBot SaaS Pro — Código Completo & Memória Mestra v11.0 (Produção-Ready)\n> **Data de Atualização:** ${new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })} (Fuso BRT)\n> **Versão:** v11.0 (100% Auditado, Multi-Tenant RLS, LGPD, XSS/CSV Sanitized, 26/26 Testes Aprovados)\n\n---\n\n## 📌 INSTRUÇÕES DE LEITURA PARA A INTELIGÊNCIA ARTIFICIAL (Claude, ChatGPT, Cursor, etc.)\n1. **NUNCA peça ao usuário para fazer ou confirmar algo que já está marcado como concluído [x] no STATE.md ou detalhado no MEMORY.md.**\n2. Este projeto já possui:\n   - Conexão oficial Meta WhatsApp Cloud API ativa e validada.\n   - Banco Supabase com Row Level Security (RLS) e isolamento Multi-Tenant por UUID (\`clinic_id\`).\n   - Simulador WhatsApp Web Ultra-Realista completo (com botões clicáveis para escolha de Procedimentos, Datas e Horários).\n   - Roteamento estático configurado no Express (\`server.js\`), diferenciando a Landing Page (\`/\`) do Painel da Clínica (\`/dashboard\`).\n   - Suíte de QA Overnight, Stress Test (100 req concorrentes), Testes E2E (Chromium Headless) e Auditoria LGPD/HMAC SHA-256 100% aprovados.\n3. Respeite sempre as regras de fuso BRT (\`America/Sao_Paulo\`), datas em \`DD/MM/YYYY\`, persona "Ana" e mascaramento de CPF (\`cpfMasked\`).\n\n---\n`;

filesToBundle.forEach(file => {
    if (fs.existsSync(file.path)) {
        const ext = path.extname(file.path).replace('.', '') || 'txt';
        const lang = ext === 'md' ? 'markdown' : (ext === 'js' ? 'javascript' : ext);
        const content = fs.readFileSync(file.path, 'utf8');
        bundleContent += `\n## 📄 ${file.label}\n\`\`\`${lang}\n${content}\n\`\`\`\n\n---\n`;
        console.log(`✅ Adicionado: ${file.label}`);
    } else {
        console.warn(`⚠️ Arquivo não encontrado: ${file.path}`);
    }
});

const outPath1 = 'C:\\\\Users\\\\letic\\\\Downloads\\\\CODE_COMPLEMENT_FOR_CLAUDE.md';
const outPath2 = 'C:\\\\Users\\\\letic\\\\Downloads\\\\CODE_COMPLEMENT_FOR_CLAUDE_V11.md';
const outPath3 = path.join(rootDir, 'CODE_COMPLEMENT_FOR_CLAUDE.md');

fs.writeFileSync(outPath1, bundleContent, 'utf8');
fs.writeFileSync(outPath2, bundleContent, 'utf8');
fs.writeFileSync(outPath3, bundleContent, 'utf8');

console.log(`\n🎉 Pacote v11.0 gerado com sucesso nos caminhos:\n👉 ${outPath1}\n👉 ${outPath2}\n👉 ${outPath3}`);
