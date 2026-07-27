---
name: audit-multitenant
description: Executa a auditoria completa de segurança, isolamento multi-tenant RLS, validação HMAC, regressão de código e testes overnight do ClinicaBot SaaS Pro antes de deploys.
---

# Workflow de Auditoria Reutilizável: `/audit-multitenant`

Esta Skill executa um checklist rigoroso e automatizado para garantir que nenhuma regressão de segurança, vazamento multi-tenant ou bug de fuso horário chegue em produção.

## 🛠️ Checklist de Execução

Quando ativada ou invocada pelo usuário (ex: `/audit-multitenant`), execute sequencialmente as seguintes verificações no diretório `clinic-bot-backend`:

### 1. Auditoria de Regressão e Sintaxe Estática
Rode o script do Guardião de Regressão:
```bash
node .agents/scripts/check_regressions.js
```
Garantir que não há `.catch(() => [])` silenciosos, nem chamadas sem `clinicId`, nem uso de `toISOString` para cálculo de data BRT.

### 2. Suíte Global Overnight QA (36/36 Testes)
Execute a suíte integrada de testes noturnos:
```bash
node tests/overnight_test_suite.js
```
Esta suíte abrange:
- Validação de RLS Multi-Tenant no Supabase (`test_tenant_rls_isolation.js`)
- Auditoria de Injeção HMAC SHA-256 no Webhook (`test_hmac_webhook_injection.js`)
- Validação Matemática de CPF & Criptografia LGPD (`test_cpf.js`)
- Trava de Concorrência Anti-Overbooking (`test_race_condition.js`)
- Integração E2E Chat ↔ Dashboard (`test_chat_dashboard_integration.js`)
- Auditoria Visual DOM Headless Chromium (`e2e_dashboard_test.js`)
- Teste de Carga de 100 Requisições Concorrentes (`stress_test.js`)

### 3. Validação de Sanitização do Nome (Caso Mariana)
```bash
node tests/test_name_extraction.js
```

### 4. Auditoria de Atalhos e Executáveis
```bash
node scripts/test_all_shortcuts.js
```

## 📊 Relatório de Resultado
Após a execução de todos os passos, forneça ao usuário um resumo executivo com os totais de testes aprovados e o status final do sistema.
