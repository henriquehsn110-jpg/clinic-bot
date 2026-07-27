# Original User Request

## 2026-07-24T03:51:30Z

<USER_REQUEST>
Automatizar a prospecção comercial (Outbound) e estruturar o processo de onboarding técnico (criação de tenants, configuração de webhooks) dos novos clientes no Supabase.

Working directory: c:\Users\letic\OneDrive\Desktop\ClinicaBot
Integrity mode: development

## Requirements

### R1. Automação de Prospecção (Outbound)
Desenvolver o script/ferramenta que processa a lista de clínicas (ICP) do dossiê de prospecção e automatiza (ou simula com logs detalhados) o fluxo de contato multicanal (WhatsApp, E-mail) aplicando os roteiros e gatilhos definidos.

### R2. Onboarding Técnico & Supabase Multi-Tenant
Criar o processo automatizado (scripts SQL/Node.js) para provisionar novos clientes no Supabase, garantindo a separação de dados via `tenant_id`, criação das políticas de segurança RLS (Row Level Security) e geração das credenciais/webhooks individuais de cada clínica.

## Acceptance Criteria

### Automação de Prospecção
- [ ] O script de automação deve realizar um "dry-run" (simulação) bem-sucedido lendo pelo menos 5 clínicas do dossiê e gerando um log do fluxo de mensagens.

### Onboarding e Banco de Dados
- [ ] O script de setup deve provisionar com sucesso pelo menos 2 ambientes de teste independentes no Supabase.
- [ ] Um teste automatizado deve provar de forma programática que os dados são isolados (A Clínica A não pode acessar os dados da Clínica B devido às políticas RLS).
- [ ] Um teste deve comprovar a injeção e validação de Webhooks com autenticação HMAC SHA-256 para os novos clientes gerados.
</USER_REQUEST>

## 2026-07-26T19:12:20Z

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Fix the `TypeError: db.supabase.from(...).update(...).eq(...).catch is not a function` in `server.js` during webhook inbox processing, and audit the entire backend to eliminate any other invalid Promise chain method calls on Supabase PostgREST query builders.

Working directory: c:\Users\letic\OneDrive\Desktop\ClinicaBot
Integrity mode: development

## Requirements

### R1. Fix PostgREST Query Builder Error in Webhook Inbox
In `server.js` (around line 173), remove the invalid `.catch(() => {})` method call attached directly to the Supabase PostgREST builder (`db.supabase.from('clinics').update(...).eq(...)`). Replace it with standard Supabase error destructuring (`const { error } = await ...`) or wrap the `await` in a `try/catch` block so that errors are handled without causing a `TypeError`.

### R2. Global Audit for Invalid Supabase Promise Chaining
Scan all files in `clinic-bot-backend/` (especially `server.js`, `services/databaseService.js`, and `controllers/`) for any other instances where `.catch()` or `.finally()` is chained directly onto a Supabase query builder instead of a native Promise or awaited result. Refactor any found instances to ensure robust error handling.

## Acceptance Criteria

### Verification & Quality Assurance
- [ ] Run `node tests/test_tenant_rls_isolation.js` and verify 100% pass rate.
- [ ] Run `node tests/overnight_test_suite.js` and verify all tests pass without unhandled rejections or TypeErrors.
- [ ] Commit and push the fix to `origin/main` (`git commit -m "fix(webhook): remove .catch() invalido do builder supabase em server.js"`).
- [ ] Verify via live endpoint or logs that webhook inbox items process without `TypeError: ...catch is not a function`.
</USER_REQUEST>


