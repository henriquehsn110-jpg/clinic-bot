# 🧠 ClinicaBot SaaS Pro — Mapa Mestre de Regras e Arquitetura (v11.0 Master Knowledge Base)

> **Documento Canônico de Conhecimento e Regras de Negócio Invioláveis**  
> **Última Atualização:** 26 de Julho de 2026  
> **Status Geral do Sistema:** 🟢 **v11.0 — Multi-Tenant RLS Aprovado & Blindado contra Injeções**

---

## 1. 📐 Visão Geral da Arquitetura & Stack Tecnológica

* **Nome do Sistema:** ClinicaBot SaaS Pro (Arquitetura Multi-Tenant)
* **Backend:** Node.js / Express (`clinic-bot-backend/server.js`, porta `3000`)
* **Banco de Dados:** Supabase (PostgreSQL Multi-Tenant com RLS, constraint composta e idempotência)
* **Inteligência Artificial:** Google Gemini 2.0 / 1.5 Flash (IA Conversacional "Ana")
* **Mensageria:** Meta WhatsApp Cloud API (Credenciais ativas em `.env` + suporte a múltiplos tokens por clínica)
* **Servidor de Produção Nuvem:** Render (`https://clinic-bot-zksc.onrender.com`) — Status: 🟢 Live
* **URL do Webhook Meta WhatsApp:** `https://clinic-bot-zksc.onrender.com/api/webhook`
* **URL do Dashboard de Recepção:** `https://clinic-bot-zksc.onrender.com/dashboard`
* **URL do Health Check:** `https://clinic-bot-zksc.onrender.com/health`
* **Criptografia LGPD:** AES-256-GCM para CPFs via `CPF_ENCRYPTION_KEY` + HMAC-SHA256 Blind Indexing (`cpf_hash`)

---

## 2. 🛡️ Regras de Negócio & Diretrizes Invioláveis (Core Rules)

1. **Persona "Ana" & Recepção:**
   * Apresentar-se como "Ana" acompanhada do emoji `😊` na 1ª mensagem de cada atendimento.
   * Tom empático, profissional e resolutivo. Preços exatos de procedimentos complexos não são revelados sem avaliação (Regra CFO).

2. **Fuso Horário BRT (`America/Sao_Paulo`):**
   * **NUNCA** utilizar `.toISOString().split('T')[0]` para cálculos de datas locais.
   * Usar padronização explícita: `new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })`.
   * Toda data apresentada ao paciente deve estar obrigatoriamente no formato brasileiro `DD/MM/YYYY`.

3. **Sincronização Dashboard → WhatsApp:**
   * Qualquer alteração de status feita pela secretária no Dashboard (Confirmar / Cancelar / Reagendar) deve disparar notificação automática via WhatsApp ao paciente.

4. **Conformidade LGPD & Criptografia:**
   * **NUNCA** expor CPF bruto em respostas de APIs públicas ou do Dashboard. O endpoint `/api/dashboard/data` retorna exclusivamente `cpfMasked` (`•••.•••.•••-••`).
   * CPFs de terceiros fornecidos sob o mesmo telefone exigem Handoff Humano imediato.

5. **Validação de Webhooks & Segurança Meta:**
   * Todas as rotas `/webhook` e `/api/webhook` executam obrigatoriamente `verifySignature(req)` via `crypto.timingSafeEqual` contra `APP_SECRET`.
   * Rejeita payloads forjados com HTTP 403 Forbidden.

6. **Frontend & Prevenção XSS / Formula Injection:**
   * Toda interpolação dinâmica em `innerHTML` passa obrigatoriamente por `esc(str)`.
   * Proibição de `onclick` inline interpolado — uso exclusivo de `data-*` + Event Delegation.
   * Todos os links `target="_blank"` contêm `rel="noopener noreferrer"`.
   * Exportação CSV sanitizada prefixando `=`, `+`, `-`, `@`, `\t`, `\r` com aspas simples (`'`).

---

## 3. 🏢 Arquitetura Multi-Tenant & Provisionamento de Clínicas

1. **Constraint de Banco de Dados (`patients_phone_clinic_unique`):**
   * A tabela `patients` utiliza a constraint composta `UNIQUE (phone, clinic_id)`.
   * Garante que o mesmo telefone pode ser cadastrado em clínicas diferentes mantendo o isolamento total.

2. **Provisionamento Automatizado de Tenants (`scripts/onboard_tenant.js`):**
   * Permite cadastrar novas clínicas via CLI ou módulo Node.js:
   ```bash
   node scripts/onboard_tenant.js --name "Clínica Exemplo" --slug "clinica-exemplo" --phone-id "ID_META" --token "TOKEN_META"
   ```
   * Provisiona a clínica na tabela `clinics` e gera automaticamente a grade de horários padrão em `clinic_hours`.

3. **Isolamento de Dados (RLS):**
   * Todas as consultas a `patients`, `appointments` e `clinic_hours` são filtradas por `clinic_id`.
   * Teste de RLS (`tests/test_tenant_rls_isolation.js`) comprova vazamento 0 entre organizações.

---

## 4. 🧪 Suíte Completa de Testes & Auditorias Automatizadas

Para validar a integridade do sistema a qualquer momento, execute no diretório `clinic-bot-backend`:

```bash
# 1. Suíte Principal Overnight (20 testes de segurança, frontend e backend)
node tests/overnight_test_suite.js

# 2. Testes de Lembretes Automáticos e Fuso BRT (4 testes)
node tests/test_reminders.js

# 3. Teste de Isolamento RLS Multi-Tenant (Prova de 0 vazamentos)
node tests/test_tenant_rls_isolation.js

# 4. Auditoria Red-Team do Webhook HMAC SHA-256 (6 cenários de ataque)
node tests/test_hmac_webhook_injection.js

# 5. Teste de Carga e Estresse (100 requisições simultâneas concorrentes)
node tests/stress_test.js
```

---

## 5. 📂 Estrutura de Arquivos Principais

* **[server.js](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-backend/server.js):** Ponto de entrada, rotas do servidor, validação HMAC e cron de lembretes.
* **[databaseService.js](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-backend/services/databaseService.js):** Camada de dados Supabase com suporte RLS, AES-256 e Blind Indexing.
* **[aiService.js](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-backend/services/aiService.js):** Integração Gemini IA (Persona Ana, prompts e contexto).
* **[conversationController.js](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-backend/controllers/conversationController.js):** Máquina de estados conversacional do bot.
* **[dashboard.html](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-backend/public/dashboard.html):** Painel da recepção em Vanilla JS/CSS com proteção XSS e Long Polling.
* **[onboard_tenant.js](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-backend/scripts/onboard_tenant.js):** Script de onboarding de novas clínicas.

---

## 6. 🚀 Diretrizes e Melhores Práticas do Google Antigravity 2.0

### 📐 6.1 Transição Arquitetural e Operação Desacoplada
- **Ambiente Desacoplado:** O Antigravity 2.0 atua como plataforma desktop autônoma e centro de comando independente do IDE, permitindo orquestração síncrona e assíncrona de múltiplos agentes paralelos.
- **Superfícies de Operação:** 
  1. *Desktop App:* Orquestração principal de projetos, agendamento de tarefas e permissões granulares.
  2. *Antigravity IDE:* Edição de código e entendimento contextual profundo.
  3. *CLI (`agy`):* Interface TUI de alto desempenho para comandos rápidos no terminal.
  4. *Python SDK:* Integração programática em pipelines de CI/CD e avaliação.

### 🌳 6.2 Modos de Trabalho e Isolamento por Projeto
- **Local Mode:** Atua diretamente na diretoria ativa e checkout Git atual. Recomendado para refatorações rápidas, correções pontuais e pair-programming.
- **New Worktree Mode:** Cria automaticamente uma *Git Worktree* isolada para cada conversa/tarefa complexa. **Prática recomendada para tarefas paralelas e subagentes**, pois previne conflitos na branch principal e preserva o ambiente de desenvolvimento.
- **Scratch Folder:** Pasta temporária com isolamento absoluto fora da estrutura de repositórios do utilizador.

### 🛡️ 6.3 Motor de Permissões & Terminal Sandbox
- **Hierarquia Estrita de Precedência:**  
  `Deny` *(Bloqueio imediato imutável)* **>** `Ask` *(Interrupção para autorização no cartão interativo)* **>** `Allow` *(Execução autônoma)*.
- **Sintaxe de Qualificadores:** `read_file`, `write_file`, `read_url`, `execute_url`, `command`, `unsandboxed`, `mcp`. `write_file` concede automaticamente autorização de leitura para o mesmo caminho.
- **Terminal Sandbox:** Contenção em container no nível do OS (AppContainer no Windows, nsjail no Linux, sandbox-exec no macOS). Impedimento ativo contra exfiltração não autorizada de dados ou acesso indevido à rede.

### 🤖 6.4 Arquitetura de Subagentes & Orquestração Dinâmica
- **Preservação de Context Window:** Tarefas extensas (pesquisas na base de código, suites de teste, navegação web) devem ser delegadas a subagentes via `invoke_subagent`. O subagente é inicializado com janela de contexto totalmente limpa.
- **Modos de Alocação:** `inherit` (mesmo repositório), `branch` (nova Worktree isolada), `share` (diretório compartilhado).
- **Subagentes Nativos:** `research` (pesquisa sintática no código/web), `browser` (automação e inspeção de DOM via Chrome DevTools MCP com gravação webm), `self` (réplica idêntica do agente pai).
- **Subagentes Customizados:** Definidos em `.agents/agents/<nome>.md` com YAML Frontmatter + system prompt. Limite estrito de aninhamento de **até 10 níveis**.

### 🧩 6.5 Extensibilidade: Skills & Model Context Protocol (MCP)
- **Skills (`.agents/skills/<nome>/SKILL.md`):** Pacotes declarativos de procedimentos e utilitários.
- **Padrão de Divulgação Progressiva (Progressive Disclosure):**  
  *Discovery* (leitura inicial de nome/descrição) ➔ *Activation* (leitura do SKILL.md completo quando o contexto for compatível) ➔ *Execution* (aplicação de diretrizes e execução de scripts auxiliares).
- **Tratamento de Scripts Auxiliares:** Os scripts em `scripts/` devem ser tratados como "caixas-pretas" (executar com `--help` antes de tentar ler o código-fonte).
- **Model Context Protocol (MCP):** Conecta a ferramentas e bancos externos via `mcp_config.json` (`command` stdio ou `serverUrl` remoto para SSE/HTTP).

### ⚓ 6.6 Ciclo de Vida & Intercepção com JSON Hooks (`.agents/hooks.json`)
- **PreInvocation:** Injeta avisos/passos no contexto antes da inferência da LLM.
- **PreToolUse:** Suporta matcher regex para interceptar ferramentas e alterar autorização (`allow`, `deny`, `ask`, `force_ask`).
- **PostToolUse:** Acionado após execução de ferramentas (ex: formatação automatica via linters/testes).
- **PostInvocation:** Avalia resultados e define `terminationBehavior` (`force_continue` ou `terminate`).
- **Stop:** Ao responder com `"decision": "continue"`, cancela o encerramento da sessão e força o agente a reentrar no ciclo até que todas as validações passem.

### 🎯 6.7 Metodologia de Prompting & Ciclos de Verificação Fechados
- **Fluxo em 3 Fases:**  
  1. *Exploração:* Analisar arquitetura existente e mapear arquivos.  
  2. *Planejamento:* Gerar e aprovar o *Implementation Plan*.  
  3. *Execução:* Modificar código e validar.
- **Ciclo de Verificação (Verification Loop):** Toda alteração de código DEVE ser acompanhada da execução de suites de teste locais (ex: `npm test` ou `node tests/overnight_test_suite.js`) até a confirmação de 100% de sucesso.
- **Slash Commands Utilizáveis:**  
  - `/goal`: Execução 100% autônoma até o objetivo final.  
  - `/grill-me`: Alinhamento prévio via entrevista interativa.  
  - `/schedule`: Agendamento de cronômetros e tarefas recorrentes.  
  - `/browser`: Subagente de navegação web.  
  - `Ctrl+M`: Transcrição de voz em tempo real.
- **Memória de Regras (`AGENTS.md` / `PROJECT_KNOWLEDGE_BASE.md`):** Regras de estilo, segurança, LGPD e fuso horário são carregadas automaticamente ao iniciar.

---
*Este documento é a referência única da verdade para todos os agentes e desenvolvedores do ClinicaBot SaaS Pro.*
