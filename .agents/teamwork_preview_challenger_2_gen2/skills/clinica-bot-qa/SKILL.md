---
name: clinica-bot-qa
description: Suíte completa de testes automatizados, auditoria de segurança XSS/LGPD/HMAC e estresse de carga para ClinicaBot SaaS Pro. Use para rodar a validação completa do sistema.
---

# 🧪 ClinicaBot QA & Security Test Suite

Esta skill permite executar e analisar a suíte de 24 testes automatizados do **ClinicaBot SaaS Pro**.

## 🚀 Comandos de Execução

### 1. Suíte Principal de Testes (20 Testes de Backend & Segurança)
Testa rotas de API, sanitização contra XSS (`esc()`), proteção contra CSV Formula Injection, validação HMAC da Meta e mascaramento de CPF (`cpfMasked`) exigido pela LGPD.

```bash
node tests/overnight_test_suite.js
```

### 2. Testes Unitários de Lembretes (4 Testes)
Valida a lógica de envio de lembretes diários via WhatsApp no fuso `America/Sao_Paulo` (BRT) e a garantia de idempotência.

```bash
node tests/test_reminders.js
```

### 3. Teste de Carga e Estresse (100 Requisições Concorrentes)
Valida a resiliência do servidor sob carga de 100 requisições simultâneas sem perdas de mensagens.

```bash
node tests/stress_test.js
```

## 📋 Critérios de Aceite
- Todos os 24 testes devem retornar **PASS** (100% de sucesso).
- Fuso horário deve ser obrigatoriamente `America/Sao_Paulo`.
- Respostas da API `/api/dashboard/data` nunca devem conter o CPF em texto puro.
