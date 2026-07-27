---
name: e2e-browser-qa
description: Skill de automação E2E Headless Browser (Puppeteer/Playwright) para auditoria visual de layout, teste de cliques no DOM real e validação de links do ClinicaBot SaaS Pro.
---

# 🎭 ClinicaBot — E2E Headless Browser QA Skill (`e2e-browser-qa`)

Esta skill estabelece o protocolo de testes de ponta a ponta (E2E) em navegador headless Chromium para o **ClinicaBot SaaS Pro**. Ela simula interações humanas reais no DOM, clica em botões interativos, valida links/rotas de vendas e tira screenshots em múltiplos pontos de quebra (breakpoints).

---

## 1. 🎯 Diretrizes de Cobertura E2E

### 1.1 Teste de Clique em Elementos Dinâmicos (DOM Real)
- **Regra de Ouro**: Nenhum teste frontend deve ser declarado como aprovado baseado apenas em busca estática de strings (`html.includes`).
- **Simulação de Eventos**: Disparar `.click()` real via Puppeteer e esperar que a árvore de elementos (`#wa-chat-body`) seja atualizada dinamicamente com as novas mensagens e botões.

### 1.2 Auditoria de Links e Preços
- **Garantia de Checkout**: Verificar que o clique em cada plano ("Starter", "Pro", "Enterprise") direciona para a URL do WhatsApp Comercial contendo o parâmetro `?text=` correspondente.
- **Target Seguro**: Exigir `target="_blank"` e `rel="noopener noreferrer"` em todos os links externos.

### 1.3 Inspeção Visual de Breakpoints
- Tirar screenshots de controle nas seguintes viewports:
  - 📱 Mobile Portrait: `375 x 812` (iPhone X / 12)
  - 📱 Mobile Landscape / Tablet: `768 x 1024` (iPad)
  - 💻 Laptop Standard: `1180 x 800` (Notebooks com escalonamento)
  - 🖥️ Desktop Wide: `1440 x 900` (Monitores Full HD)

---

## 2. 🧪 Comandos de Execução da Skill

```bash
# Executa a suíte de testes E2E Headless Chromium
node clinic-bot-backend/tests/e2e_browser_test.js
```
