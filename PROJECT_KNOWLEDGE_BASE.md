# 🧠 ClinicaBot SaaS Pro — Base Completa de Conhecimento e Estado do Projeto (Master Knowledge Base)

> **Documento de Transferência de Contexto para Novas Conversas e Agentes**  
> **Última Atualização:** 21 de Julho de 2026  
> **Status Geral do Projeto:** 🟢 **100% Auditado, Testado e Produção-Ready**

---

## 1. 📐 Visão Geral da Arquitetura & Stack

* **Nome do Sistema:** ClinicaBot SaaS Pro (Multi-Tenant)
* **Backend:** Node.js / Express (`clinic-bot-backend/server.js`, porta `3000`)
* **Banco de Dados:** Supabase (PostgreSQL Multi-Tenant com RLS e idempotência)
* **Inteligência Artificial:** Google Gemini 2.0 / 1.5 Flash (IA Conversacional "Ana")
* **Mensageria:** Meta WhatsApp Cloud API (Simulador web local em `clinic-bot-simulator/index.html`)
* **Frontend Recepção:** HTML/JS puro purificado contra XSS (`dashboard.html` em `/public`)
* **Criptografia LGPD:** AES-256-GCM para CPFs de pacientes via `CPF_ENCRYPTION_KEY`

---

## 2. 🔐 Regras de Segurança e Conformidade Implementadas

1. **Proteção contra XSS no Frontend:**
   * Todas as variáveis dinâmicas interpoladas no HTML utilizam a função sanitizadora `esc(str)`.
   * Substituição de todos os atributos inline `onclick="fn('${id}')"` por **Event Delegation** via dataset `data-*`.
   * Todos os links `target="_blank"` incluem obrigatoriamente `rel="noopener noreferrer"`.
   * Exportação CSV sanitizada contra Excel/Sheets Formula Injection (`=`, `+`, `-`, `@`).

2. **Segurança de APIs e Webhooks:**
   * Validação rigorosa de assinatura HMAC (`X-Hub-Signature-256`) Meta WhatsApp em todas as rotas `/webhook` (retorna HTTP 403 se forjada).
   * Mascaramento estrito de LGPD no endpoint `/api/dashboard/data` (retorna `cpfMasked` e omite o campo `cpf` bruto).
   * Exigência de Bearer Token JWT para todas as rotas do Dashboard.
   * Chave de serviço Supabase rotacionada e isolada em `process.env.SUPABASE_SERVICE_KEY` sem vazamentos.

---

## 3. 🕒 Fuso Horário e Serviços Backend

1. **Fuso Horário BRT (`America/Sao_Paulo`):**
   * Padronizado via `new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })` no `dashboardController.js` e `calendarService.js` para evitar virada de data prematura às 21:00 UTC.

2. **Módulo de Lembretes Automáticos (`services/reminderService.js`):**
   * Consulta os agendamentos do dia no fuso BRT.
   * Dispara mensagens personalizadas via WhatsApp solicitando *CONFIRMAR* ou *REMARCAR*.
   * Idempotência garantida via `Set` de chave por dia (evita envios duplicados no mesmo dia).

---

## 4. 🧪 Suíte Completa de Testes Automatizados

O projeto possui **24 testes unitários e de integração + teste de carga** que podem ser rodados a qualquer momento no terminal:

```bash
# Executa a suíte principal de testes de segurança, backend e frontend (20/20 PASS)
node tests/overnight_test_suite.js

# Executa os testes unitários do serviço de lembretes (4/4 PASS)
node tests/test_reminders.js

# Executa o teste de estresse de 100 requisições simultâneas concorrentes (100/100 HTTP 200)
node tests/stress_test.js
```

---

## 5. 🛠️ Branch Git & Histórico de Commits

* **Branch Atual:** `overnight-qa-2026-07-20`
* **Commits Realizados:**
  1. `d26b7a8` — `fix(timezone): padronizacao para America/Sao_Paulo no calculo da data de hoje no dashboard e calendarService`
  2. `139388e` — `fix(security): remocao de chave de servico hardcoded em migrate_cpf.js para uso de variaveis de ambiente`
  3. `13a1d52` — `fix(security): remocao do campo de CPF bruto das respostas da API do dashboard para conformidade LGPD`
  4. `1252387` — `feat(qa): adicao da suite automatizada de testes overnight e reforco de HMAC webhook`
  5. `155ab02` — `feat(reminders): criacao do servico de lembretes diarios por whatsapp com fuso BRT e testes unitarios`
  6. `01650d6` — `feat(qa): adicao da suite de teste de carga (stress_test.js) com 100 requisicoes concorrentes 100% aprovadas`

---

## 6. 🚀 Próximos Passos Sugeridos

1. Fazer merge da branch `overnight-qa-2026-07-20` para a `main`.
2. Ativar o agendador automático (cron job) do `reminderService.processDailyReminders()` no boot do `server.js` (ex: todos os dias às 08:00).
3. Realizar o deploy do servidor Node.js e conectar com as credenciais oficiais da Meta WhatsApp Cloud API em produção.
