# 📋 HISTORICO_E_CONTEXTO.md — ClinicaBot SaaS Pro
> **Documento de Consolidação de Histórico, Arquitetura, Estado Operacional e Próximos Passos**  
> **Data de Atualização:** 24 de Setembro de 2026  
> **Ambiente:** Node.js (Express) | PostgreSQL (Supabase Multi-Tenant RLS) | Google Gemini 2.0 Flash | Meta WhatsApp Cloud API  

---

## 1. 🎯 Objetivo do Chatbot & O Que Já Foi Implementado com Sucesso

### 1.1 Objetivo do Sistema
O **ClinicaBot SaaS Pro** é uma solução de software como serviço (SaaS B2B) desenvolvida para clínicas médicas e consultórios odontológicos. O sistema automatiza integralmente a recepção e o atendimento de pacientes via **WhatsApp Oficial (Meta Cloud API)**, combinando a empatia e flexibilidade de Modelos de Linguagem de Grande Porte (**Google Gemini**) com a previsibilidade, precisão e integridade de uma **Máquina de Estados Finitos (FSM) Determinística**.

Os principais pilares operacionais do bot incluem:
- Agendamento autônomo de consultas em tempo real, respeitando agendas de múltiplos profissionais, durações específicas por procedimento e pausas de almoço.
- Reagendamentos e cancelamentos com liberação atômica de slots.
- Triagem inteligente e esclarecimento de dúvidas institucionais (convênios aceitos, endereço, formas de pagamento, regras de preparo).
- Sistema de lembretes automáticos com confirmação/cancelamento em 1-clique para redução drástica de no-show.
- Transbordo humano (handoff) imediato e silencioso para a recepção física quando necessário.
- Painel Web da Recepção (Dashboard) em tempo real para controle da agenda, pacientes e configurações da clínica.
- Aplicativo Mobile Companion administrativo para monitoramento de infraestrutura, auditoria e rollback de emergência.

---

### 1.2 O Que Já Foi Implementado e Homologado com Sucesso

1. **Atendimento Humanizado com IA & Compliance Médico:**
   - Persona personalizável (padrão "Ana 😊" ou configurada pela clínica, ex: "Bruna", "Camila").
   - Guardrails estritos em conformidade com o **Conselho Federal de Medicina (CFM Resolução 2.314/2022 e 2.336/2023)** e **Conselho Federal de Odontologia (CFO)**: proibição de diagnósticos à distância e de divulgação de orçamentos fechados para tratamentos cirúrgicos/complexos sem avaliação presencial.
   - Envio de componentes nativos interativos da Meta: botões de resposta rápida (`sendButtonMessage`), listas de opções (`sendListMessage`) e botões com links seguros (`sendCtaUrlMessage` para adição ao Google Calendar via encurtador interno `/c/:shortId`).

2. **Máquina de Estados Finitos (FSM) Determinística:**
   - **Fluxo Pessoal & Fluxo Familiar (`FAMILY_BOOKING`):** Agendamento para o titular ou para terceiros/dependentes (filhos, pais, cônjuges).
   - **Validação Matemática de CPF & Blindagem LGPD:** Validação rigorosa dos dígitos verificadores (módulo 11), bloqueio de CPFs inválidos ou sequenciais e barreira anti-bypass (o CPF do titular não satisfaz a validação do dependente).
   - **Desambiguação Natural de Intenções:** Identificação e separação de múltiplos procedimentos solicitados simultaneamente (ex: *"Quero limpeza e clareamento"*).
   - **Guardião Anti-Looping & Anti-Estagnação:** Detecção e interrupção de impasses conversacionais com acionamento automático de atendimento humano.

3. **Motor de Agendamento & Multi-Profissional:**
   - Concorrência de slots no banco de dados com constraint física composta `uq_appointments_clinic_doctor_active_slot`.
   - Suporte a múltiplos médicos atendendo no mesmo horário em especialidades diferentes.
   - Opção *"Tanto faz / Qualquer médico disponível"* com resolução automática de profissional antes da gravação.
   - Duração dinâmica configurável por procedimento e bloqueio de horários de almoço.

4. **Sistema de Lembretes Automáticos Multi-Nível:**
   - Disparo automatizado em fuso BRT (`America/Sao_Paulo`):
     - **D-1:** Véspera da consulta às 18:00 BRT.
     - **D-0:** Manhã da consulta às 08:00 BRT.
     - **H-2:** Janela de 2 horas de antecedência (a cada 15 min).
   - Confirmação e cancelamento com 1-clique via WhatsApp com reflexo instantâneo no PostgreSQL e no painel da secretária.
   - Desambiguação de confirmação para pacientes com mais de uma consulta ativa.

5. **Painel Web da Recepção (Dashboard Multi-Tenant):**
   - Construído em Vanilla JavaScript, HTML5 e CSS3 (sem frameworks pesados).
   - Abas operacionais completas: *Agenda de Consultas* (modo tabela e calendário visual em grid de 7 colunas), *Base de Pacientes*, *Transbordo Humano*, *Corpo Clínico & Médicos*, *📢 CRM & Remarketing* e *Configurações da IA & WhatsApp* (com mockup reativo de smartphone iPhone com notch e balões de mensagem).
   - Sincronização em tempo real (Long Polling / Server-Sent Events).
   - Proteção estrita contra XSS (`esc()` em interpolações e event delegation via `data-*`) e sanitização de CSV contra Formula Injection.

6. **App Mobile Companion Administrativo (`admin-mobile-app-v2`):**
   - Aplicativo React Native / Expo para o gestor técnico/proprietário do SaaS.
   - Autenticação isolada com 2FA TOTP (`speakeasy`), taxa limite de 15 req/min, visualizador de saúde do servidor (🟢/🟡/🔴), leitor de logs de auditoria sem PII e ações críticas (`/restart`, `/rollback`) com dupla confirmação e registro em `admin_audit_log`.

7. **V19 Hardening Integration (Resiliência & Concorrência Distribuída):**
   - Fila de mensagens seguras via `webhook_inbox` com locks distribuídos de sessão (`withSessionLock`).
   - Heartbeat serializado com fail-closed para webhooks e efeitos externos.
   - Registro de efeitos idempotentes em `message_effects` antes de chamadas externas (`executeGuardedEffect`).
   - 100% das mensagens de WhatsApp envelopadas em `sendGuarded` com chaves semânticas e estáveis (zero PII).
   - Proteção de chamadas da IA com validação de lease pré e pós-execução e timeout de aplicação de 10s.
   - Quota de faturamento SaaS vinculada à criação efetiva da consulta (não ao loop genérico de mensagens).

---

## 2. 🏛️ Principais Decisões de Arquitetura (ADRs)

| ID | Decisão Arquitetural | Justificativa Técnica |
|---|---|---|
| **ADR-001** | **Backend Node.js + Express** | I/O assíncrono e não-bloqueante ideal para alto volume de requisições concorrentes de webhooks da Meta, banco Supabase e APIs de LLM. Simplicidade operacional e facilidade de deploy. |
| **ADR-002** | **PostgreSQL com Row Level Security (Supabase)** | Garantia de isolamento multi-tenant absoluto no nível do motor do banco de dados (RLS). Uso de constraints parciais compostas (`UNIQUE (phone, clinic_id)`) e funções stored procedures atômicas (RPCs) para locks distribuídos e idempotência. |
| **ADR-003** | **Google Gemini 2.0 / 1.5 Flash** | Menor latência do mercado (< 1.5s no primeiro byte), custo por milhão de tokens extremamente econômico para modelo SaaS e suporte a System Instructions extensas para regras de compliance. |
| **ADR-004** | **Arquitetura Híbrida: LLM + FSM Determinística** | LLMs são probabilísticas e sujeitas a alucinações de dados ou componentes. Regras críticas (verificação de slots, validação de CPF, confirmação de consulta, disparo de lembretes) são controladas rigidamente por código procedural TypeScript/JavaScript (FSM). A LLM é responsável pela empatia, compreensão contextual e resposta a dúvidas informativas. |
| **ADR-005** | **Dashboard em Vanilla JS/CSS (Anti-Framework)** | Carregamento instantâneo em máquinas modestas de recepção (< 200ms de carregamento inicial, payload total < 100KB), sem dependências pesadas (React/Vue/Angular), eliminando complexidade de build steps e vulnerabilidades de supply chain em runtime de front-end. |
| **ADR-006** | **Segurança de Webhooks com HMAC SHA-256 Meta** | Toda requisição recebida nos endpoints `/webhook` e `/api/webhook` passa por `crypto.timingSafeEqual` validando o cabeçalho `X-Hub-Signature-256` contra o `APP_SECRET` da Meta usando o buffer binário bruto (`req.rawBody`), eliminando ataques de injeção de payload forjado e man-in-the-middle. |
| **ADR-007** | **LGPD: Criptografia AES-256-GCM + Blind Indexing (HMAC)** | Dados sensíveis (CPF) são cifrados em repouso no banco com AES-256-GCM via `CPF_ENCRYPTION_KEY`. Para buscas sem necessidade de decifrar toda a tabela, é utilizado um índice cego determinístico `cpf_hash` via HMAC-SHA256. Respostas de API expõem exclusivamente `cpfMasked`. |
| **ADR-008** | **Fuso Horário Estrito BRT (`America/Sao_Paulo`)** | Servidores em nuvem (ex: Render, AWS) operam nativamente em UTC. Chamadas como `.toISOString().split('T')[0]` após as 21:00 cravam a data do dia seguinte no Brasil. Toda manipulação de data no sistema utiliza explicitamente `new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })`. |
| **ADR-009** | **Ledger de Efeitos & Distributed Locks (V19 Hardening)** | Prevenção contra duplicação de envios no WhatsApp e race conditions sob reentregas de webhooks da Meta ou múltiplos workers. O sistema obtém lease tokens no banco (`webhook_inbox` e `session_locks`), executa chamadas externas através de ledger idempotente (`message_effects`) e utiliza heartbeats fail-closed. |
| **ADR-010** | **Onboarding White-Glove via CLI (`scripts/onboard_tenant.js`)** | Foco comercial em vendas corporativas de alto ticket com onboarding assistido. Em vez de self-service suscetível a erros de configuração de WhatsApp, cada clínica é provisionada via CLI garantindo testes prévios de conexão e geração de grade de horários. |

---

## 3. ⚙️ Variáveis de Ambiente, Credenciais & Comandos Operacionais

### 3.1 Variáveis de Ambiente (`.env` e `.env.staging`)

```ini
# Configurações do Servidor
PORT=3000
NODE_ENV=production                       # 'development', 'staging' ou 'production'
APP_URL=https://clinic-bot-zksc.onrender.com

# Banco de Dados Supabase (PostgreSQL)
SUPABASE_URL=https://<tenant-id>.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...        # Chave service_role (operações de backend)
SUPABASE_ANON_KEY=eyJhbGciOi...           # Chave pública (opcional)

# Meta WhatsApp Cloud API (Oficial)
APP_SECRET=<meta_app_secret_hex>          # Validação HMAC SHA-256 de Webhooks
META_PHONE_ID=<meta_phone_number_id>      # ID do número de telefone no painel da Meta
META_WHATSAPP_TOKEN=EAA...                # Token de acesso de sistema permanente
WEBHOOK_VERIFY_TOKEN=<token_de_verificacao> # Token para handshake GET da Meta

# Inteligência Artificial (Google Gemini)
GEMINI_API_KEY=AIzaSy...                  # Chave da API Google AI Studio / Gemini

# Criptografia LGPD & Segurança
CPF_ENCRYPTION_KEY=<64_caracteres_hex>    # Chave de 256 bits para AES-256-GCM (Obrigatória no boot)
ADMIN_JWT_SECRET=<segredo_jwt_admin>      # Segredo exclusivo para rotas /admin/ e App Mobile
SESSION_TTL_MINUTES=1440                  # Tempo de vida de rascunhos (24 horas)
ADMIN_IP_ALLOWLIST=127.0.0.1,::1          # Restrição de IP para endpoints administrativos (opcional)

# Observabilidade & Telemetria
SENTRY_DSN=https://...@sentry.io/...      # Rastreamento de erros com PII redigida
```

> ⚠️ **Atenção:** Em produção, se `CPF_ENCRYPTION_KEY` ou `APP_SECRET` estiverem ausentes, o servidor aciona o **Strict Boot Guard** e encerra o processo com código 1 (`process.exit(1)`), impedindo execuções vulneráveis.

---

### 3.2 Comandos para Instalação, Execução e Testes

No ambiente Windows (PowerShell), execute scripts NPM utilizando `cmd.exe /c "npm ..."` para evitar restrições de política de execução (`UnauthorizedAccess`).

#### Instalação e Execução
```bash
# Instalar dependências
cmd.exe /c "npm install"

# Iniciar o servidor com variáveis padrão (.env)
cmd.exe /c "npm start"

# Iniciar o servidor apontando explicitamente para ambiente de Staging (.env.staging)
cmd.exe /c "set DOTENV_CONFIG_PATH=.env.staging&& node server.js"
```

#### Execução de Testes Automatizados
```bash
# 1. Suíte de Concorrência, Locks Distribuídos & Resiliência V19 (51 cenários PASS)
cmd.exe /c "set DOTENV_CONFIG_PATH=.env.staging&& node tests/test_session_distributed_lock_concurrency.js"

# 2. Suíte Noturna Integrada (QA Completo: 41 testes PASS, E2E, FSM, Stress 100 reqs)
cmd.exe /c "set DOTENV_CONFIG_PATH=.env.staging&& node tests/overnight_test_suite.js"

# 3. Teste de Isolamento Multi-Tenant RLS (Prova matemática de zero vazamento)
cmd.exe /c "set DOTENV_CONFIG_PATH=.env.staging&& node tests/test_tenant_rls_isolation.js"

# 4. Auditoria de Injeção e Segurança HMAC Webhook Meta
cmd.exe /c "set DOTENV_CONFIG_PATH=.env.staging&& node tests/test_hmac_webhook_injection.js"

# 5. Auditoria de Rotas Administrativas e 2FA TOTP
cmd.exe /c "set DOTENV_CONFIG_PATH=.env.staging&& node tests/test_admin_endpoints.js"
```

#### Provisionamento de Nova Clínica (Onboarding CLI)
```bash
node scripts/onboard_tenant.js \
  --name "Clínica Odontológica Exemplo" \
  --slug "clinica-exemplo" \
  --phone-id "123456789012345" \
  --token "EAA..." \
  --admin-email "contato@clinicaexemplo.com.br"
```

---

## 4. 🐛 Problemas e Bugs Recentes Resolvidos (Auditoria & Hardening)

### 4.1 Ciclo V19 Hardening Integration (Resolução dos 7 Bloqueadores de Auditoria)
1. **Envio de Mensagens Desprotegidas no WhatsApp:**
   - *Problema:* Havia 73 chamadas diretas a `whatsappService.send*()` em `conversationController.js`, muitas acompanhadas de `.catch(() => {})`, o que impedia o ledger de detectar falhas de rede.
   - *Solução:* 100% das 61 operações de envio no controlador foram migradas para o helper universal `sendGuarded()`, protegido por transação de efeito idempotente com chaves semânticas estruturadas (`type:entityId:seq`) e livre de PII.
2. **Proteção de Chamadas ao Gemini:**
   - *Problema:* Risco de envolvimento desnecessário do Gemini em ledgers externos de envio ou execuções sem controle de lease.
   - *Solução:* Isolamento da chamada pura com timeout de aplicação de 10s e dupla verificação `checkLeaseValid()` (antes do dispatch e após o retorno, antes do uso da resposta).
3. **Classificação de Erros de Posse (Ownership):**
   - *Problema:* Erros como `WEBHOOK_LEASE_LOST`, `SESSION_LOCK_LOST`, `SESSION_LOCK_TIMEOUT` e `EFFECT_LEASE_LOST` podiam ser tratados como erros fatais e descartar mensagens.
   - *Solução:* Classificação explícita com `isRetryable = true`, forçando o re-enfileiramento (`pending`) da mensagem no `webhook_inbox`.
4. **Heartbeat de Efeitos & Cancelamento Cooperativo:**
   - *Problema:* Execuções longas podiam perder o lease token; ausência de suporte a cancelamento.
   - *Solução:* Implementação de heartbeat serializado via `setTimeout` com política **fail-closed** em caso de exceção de rede e emissão de `AbortSignal` via `AbortController`.
5. **Cota de Cobrança SaaS (Billing):**
   - *Problema:* O método `incrementMonthlyBookings` era invocado no loop genérico de mensagens do webhook, correndo risco de contabilização duplicada em replays.
   - *Solução:* Removido do loop de mensagens e atrelado estritamente à confirmação bem-sucedida de um agendamento novo no banco (`createAppointment`).
6. **Auditoria Estática AST (Cenário H7.4) & 10 Novos Cenários de Integração:**
   - *Solução:* Adicionada validação por Abstract Syntax Tree (AST) no teste de concorrência, garantindo que nenhuma chamada a `whatsappService` exista fora do envoltório seguro.

### 4.2 Outros Bugs Críticos Sanados nas Rodadas Anteriores
- **Deadlock da Regra 17 em Menores de Idade:** Pacientes menores sem CPF ficavam presos no gate de CPF da FSM. Criado atalho determinístico *"Menor sem CPF"* que vincula o agendamento ao responsável (`guardian_id`) sem colisão de banco.
- **Desambiguação de Confirmação em Lembretes:** Pacientes com mais de uma consulta ativa futura que respondiam "Confirmar" podiam confirmar a consulta errada. O bot agora lista as opções numeradas ou botões de seleção rápida.
- **Paridade Bidirecional de Reset Pessoal ↔ Familiar:** Evitou que flags antigas de dependentes ficassem órfãs ao alternar de agendamento familiar para pessoal no meio do fluxo.
- **Conflito de Slot de Médico Geral vs Específico:** Corrigida constraint de banco e lógica de consulta para impedir que uma consulta com `doctor_id = null` permitisse agendamento duplicado no mesmo horário por outro médico geral.
- **Inversão de Data DD/MM vs MM/DD:** Datas recebidas em formato ISO do WhatsApp List eram interpretadas incorretamente por regex, trocando dia e mês (ex: 03/08 virando 08/03 do ano seguinte). Corrigido com parser determinístico prioritário.

---

## 5. 🚀 Próximos Passos Planejados

1. **Aprovação e Merge da Branch `fix/v19-hardening-integration`:**
   - Submissão de Pull Request para a branch `main` após conferência dos 4 commits finais (`f5a3581`, `33a6935`, `5133e6b`, `c655714`).
   - Verificação final do pipeline de CI/CD no GitHub Actions.

2. **Deploy e Validação em Produção (Render):**
   - Deploy automático no Render via webhook do GitHub.
   - Execução de smoke test ao vivo no endpoint de produção (`https://clinic-bot-zksc.onrender.com/health`).
   - Verificação do status de keep-alive no UptimeRobot.

3. **Material Comercial & Demonstração (Go-to-Market):**
   - Gravação de vídeo demonstrativo de 3 minutos (estilo Loom) demonstrando o fluxo completo: paciente agendando via WhatsApp + reflexo instantâneo no Dashboard da recepção + simulação de lembrete com confirmação.
   - Utilização dos scripts de vendas B2B e cadência SPIN Selling (documentados na skill `b2b-sdr-outbound-engine`).

4. **Onboarding da Primeira Clínica Piloto:**
   - Execução do script `scripts/onboard_tenant.js` com credenciais de produção do primeiro cliente pagante.
   - Treinamento da secretária/recepcionista para operação do Dashboard.

5. **Refinamento Jurídico de Retenção LGPD (Backlog Produto):**
   - Ajustar o fluxo de "exclusão de dados" para distinguir soft-delete operacional de expurgo formal LGPD, respeitando o Artigo 16 da LGPD que exige guarda de prontuários médicos e odontológicos por prazo mínimo regulatório (20 anos pelo CFM/CFO) através de anonimização de identificadores mantendo registros de histórico não-identificáveis.
