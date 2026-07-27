---
name: lgpd-security-auditor
description: Instruções completas para auditoria de conformidade LGPD, mascaramento de CPF (cpfMasked) e validação de criptografia AES-256 no ClinicaBot SaaS Pro.
---

# 🔒 ClinicaBot — LGPD & Security Audit Skill (`lgpd-security-auditor`)

Esta skill orienta agentes e desenvolvedores na auditoria contínua de segurança, proteção de dados de saúde e conformidade com a LGPD no **ClinicaBot SaaS Pro**.

---

## 1. Regras Fundamentais de Segurança & LGPD

### 1.1 Mascaramento Estrito de CPF
- **Regra de Ouro**: A API pública ou do Dashboard (`/api/dashboard/data`) **NUNCA** deve retornar o campo `cpf` em texto puro.
- **Formato Obrigatório**: Deve retornar apenas `cpfMasked` no padrão `•••.•••.•••-••` (ou `123.•••.•••-45` quando visibilidade for parcial).
- **Criptografia**: Todos os CPFs gravados no banco Supabase devem ser criptografados via AES-256-GCM com a chave `process.env.CPF_ENCRYPTION_KEY` e indexados via Blind Index (`cpf_hash` com HMAC-SHA256).

### 1.2 Sanitização Contra XSS
- Toda interpolação dinâmica no HTML do Dashboard (`dashboard.html`) deve utilizar a função sanitizadora `esc(str)`.
- **Proibição de Onclick Inline**: Não utilize atributos `onclick="fn('${var}')"`. Utilize dataset `data-*` e **Event Delegation**.
- **Links Externos**: Adicione obrigatoriamente `rel="noopener noreferrer"` em links com `target="_blank"`.

### 1.3 Proteção Contra CSV Formula Injection
- Ao exportar relatórios para CSV, sanitize qualquer célula que inicie com `=`, `+`, `-`, `@`, `\t` ou `\r`, prefixando com aspa simples `'`.

### 1.4 Webhook HMAC Signature
- As rotas `/webhook` e `/api/webhook` devem validar a assinatura `X-Hub-Signature-256` enviada pela Meta via `crypto.timingSafeEqual`.

---

## 2. Comandos de Verificação

```bash
# Executa a auditoria de mascaramento de CPF e segredos no código
node clinic-bot-backend/check_cpf_presence.js

# Executa a suíte completa de auditoria de segurança (20 testes)
node clinic-bot-backend/tests/overnight_test_suite.js
```
