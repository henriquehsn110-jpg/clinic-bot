# 🧠 Proposta de Aprendizado (/learn) — ClinicaBot SaaS Pro

Com base na nossa resolução recente e no comando `/learn`, mapeamos uma nova regra de arquitetura para ser perpetuada no projeto:

---

## 📌 Nova Regra Proposta para o `AGENTS.md`

### Classificação: **Regra de Arquitetura & Roteamento (Core Rule)**

**Motivação:** No Express.js, ao usar `express.static('public')` mapeado em `/dashboard`, a requisição `http://localhost:3000/dashboard/` abria automaticamente o `index.html` (Landing Page) em vez de `dashboard.html` (Painel da Clínica).

**Proposta de Adição ao `AGENTS.md`:**
```markdown
10. **Roteamento Explícito de Arquivos Estáticos:** No `server.js`, rotas de páginas SPA/HTML (`/` vs `/dashboard`) DEVEM ser declaradas com rotas HTTP explícitas `app.get()`, evitando que middlewares de `express.static` redirecionem requisições com barra final (`/dashboard/`) para o `index.html` da Landing Page.
```

---

## 🛠️ O que Eu (Antigravity AI) posso fazer no seu Projeto?

Como seu assistente autônomo de Pair Programming e Engenharia de IA, aqui está o inventário completo do que posso realizar:

### 1. ⚙️ Engenharia Fullstack & Arquitetura (Node.js & Supabase)
- **Backend Express:** Criação e manutenção de APIs REST, Webhooks da Meta WhatsApp, autenticação JWT, validação HMAC SHA-256 e resiliência de filas inbox.
- **Banco de Dados Supabase:** Migrações SQL Multi-Tenant, Row Level Security (RLS), funções RPC e auditoria LGPD (criptografia AES-256-GCM).

### 2. 🎨 Frontend & Design System (Impeccable UI)
- **Vanilla CSS/JS:** Desenvolvimento do [dashboard.html](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-backend/public/dashboard.html) e do [simulador index.html](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-simulator/index.html) sem "AI Slop", com Glassmorphism, temas HSL médicos e tipografia calculada (`Outfit`, `Plus Jakarta Sans`, `JetBrains Mono`).
- **Segurança XSS:** Aplicação estrita de sanitização `esc()` e Event Delegation via `dataset`.

### 3. 🧪 Qualidade, Segurança & Testes Automatizados
- **Audit & Stress Test:** Execução de 24+ testes automatizados (`overnight_test_suite.js`) e testes de carga concorrente com 100 requisições simultâneas (`stress_test.js`).
- **Auto-Healing:** Detecção empírica de falhas via logs e aplicação automática de correções de código.

### 4. 💼 Negócios, Vendas & Go-to-Market (Skills Especialistas)
- 🎤 **`pitch-deck-generator`:** Roteiros de apresentações comerciais e propostas de ROI (recuperação de no-show).
- 📢 **`landing-page-copywriter`:** Copys de vendas, estrutura de landing pages e prompts para imagens promocionais.
- 📊 **`gtm-market-analyzer`:** Inteligência de mercado no Brasil, precificação SaaS (R$ 297 a R$ 897+/mês) e diferenciais competitivos.
- 😈 **`critico-rigido-advogado-diabo`:** Modo de auditoria sem adulação (anti-sycophancy) para desconstruir falhas no projeto.

### 5. 🤖 Modos Autônomos de Execução
- **/goal:** Trabalhar de forma autônoma contínua até concluir uma meta complexa com testes 100% aprovados.
- **/schedule:** Programar verificações e testes periódicos em background.
- **Subagentes:** Delegar tarefas paralelas (pesquisa de web, auditoria de segurança, criação de assets).
