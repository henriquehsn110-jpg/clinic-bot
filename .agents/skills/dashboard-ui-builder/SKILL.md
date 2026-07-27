---
name: dashboard-ui-builder
description: Guia de UI/UX e desenvolvimento frontend Vanilla CSS/JS para o Dashboard do ClinicaBot SaaS Pro, baseado nos princípios do Impeccable Design (Anti-AI Slop) e proteção XSS/LGPD.
---

# 🎨 ClinicaBot — Dashboard UI Builder & Impeccable Design System (`dashboard-ui-builder`)

Esta skill estabelece os padrões de design de alta fidelidade (**Impeccable Design Framework por Paul Bakaus**), componentes visuais intencionais e desenvolvimento frontend Vanilla JS/CSS para o painel da recepção (`dashboard.html`).

---

## 1. 🚫 Princípios Anti-AI Slop (Impeccable Design Guidelines)

Para evitar a estética clichê de interfaces geradas genericamente por IAs ("AI Slop" — fontes genéricas soltas, cards vazios dentro de cards, gradientes roxo-azul padrão), todas as telas do **ClinicaBot** DEVEM seguir:

### 1.1 Tipografia Expressiva e Intencional
- **Títulos & Métricas:** `Outfit` (Geométrica, moderna e com forte autoridade visual).
- **Dados Técnicos, Horários e Datas:** `JetBrains Mono` (Monospaçada refinada para alinhar números e tabelas).
- **Corpo de Texto & Tabelas:** `Plus Jakarta Sans` ou `Outfit` com pesos calculados (`500` para leitura regular, `600`/`700` para destaque).
- **Proibido:** Usar fontes padrão do sistema ou misturar mais de 3 famílias tipográficas.

### 1.2 Paleta de Cores HSL Curada (Médico-Tecnológica)
Evite cores primárias brutas (`red`, `blue`). Utilize variáveis CSS tokenizadas:
```css
:root {
    --bg-base: #07090e;                  /* Escuro Profundo Obsidian */
    --bg-surface: #0f172a;               /* Superfície Eletrônica Slate */
    --bg-card: rgba(30, 41, 59, 0.7);    /* Glassmorphism translúcido */
    --border-glow: rgba(56, 189, 248, 0.25); /* Resplendor Neon Cyan */

    --primary-cyan: #00f2fe;             /* Neon Cyan de Destaque */
    --accent-success: #10b981;           /* Esmeralda Confirmação */
    --accent-warning: #f59e0b;           /* Âmbar Pendência/Secretária */
    --accent-danger: #ef4444;            /* Coral Cancelamento/Alerta */
    --accent-purple: #8b5cf6;            /* Roxo IA / Automação */
}
```

### 1.3 Acabamento Visual & Micro-Interações
- **Glassmorphism com Propósito:** Aplique `backdrop-filter: blur(16px)` e bordas sutis `1px solid rgba(255, 255, 255, 0.08)` para criar profundidade de camadas reais.
- **Micro-Animations Reativas:** Transições suaves de hover (`all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`).
- **Indicadores Pulsantes em Tempo Real:** Status de conexões e sincronização devem utilizar animação CSS `@keyframes pulse-animation` discreta.

---

## 2. 🔐 Regras Fundamentais de Código & Segurança Frontend

1. **Proteção contra XSS:** Todas as variáveis dinâmicas interpoladas em template literals HTML DEVEM obrigatoriamente passar por `esc(valor)`.
2. **Event Delegation via Dataset:** Nunca utilize atributos inline `onclick="fn('${id}')"`. Utilize ouvintes no container pai inspecionando `e.target.closest('[data-id]')` e atributos `data-action`.
3. **Privacidade LGPD:** Exiba exclusivamente o campo mascarado `cpfMasked`. Nunca exponha o CPF bruto no DOM.
4. **Proteção CSV Formula Injection:** A função `exportAppointmentsCSV()` deve prefixar células iniciando com `=`, `+`, `-`, `@`, `\t`, `\r` com aspas simples (`'`).
5. **Segurança de Links Externos:** Todo link com `target="_blank"` deve conter `rel="noopener noreferrer"`.

---

## 3. 📂 Localização do Código Principal

- **Painel de Recepção:** [dashboard.html](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/clinic-bot-backend/public/dashboard.html)

