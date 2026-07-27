## 2026-07-24T00:51:28Z

Your identity: teamwork_preview_worker
Your working directory: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_1
Parent orchestrator conversation ID: 3e5d1055-92ab-4d98-b800-6b2a935d48f1

Skills to read & follow:
- `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\skills\dashboard-ui-builder\SKILL.md`
- `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\skills\lgpd-security-auditor\SKILL.md`
- `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\skills\whatsapp-flow-simulator\SKILL.md`
- `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\skills\clinica-bot-qa\SKILL.md`

Objective:
Remediate all issues identified in Milestone 1 audit across `index.html` (root), `clinic-bot-backend/public/index.html`, and `DOSSIE_PROSPECCAO_ICP_CLINICABOT.md`. Ensure that `index.html` and `clinic-bot-backend/public/index.html` remain 100% byte-for-byte identical after all edits.

Detailed Implementation Requirements:
1. **Typo Fix**:
   - Fix line 818 spelling error `"Sobregarregar"` in Hero headline of `index.html` to `"Sobrecarregar"` (or `"sem Aumentar o Trabalho da Recepção"` per COPY_LANDING_PAGE_LGPD.md).

2. **Add Missing Copy Sections from `COPY_LANDING_PAGE_LGPD.md`**:
   - **Section 4 (In-Page Simulator)**: Insert dedicated Section 4 *"Teste Agora Mesmo o Atendimento da IA 'Ana' no Seu WhatsApp"* into the main page HTML body flow (between Step 3 and Security/LGPD section), with an interactive simulator container.
   - **Section 7 (Testimonials)**: Insert Section 7 *"O que dizem os Médicos e Gestores de Clínicas"* with 3 testimonials (Dr. Eduardo Ramos, Dra. Vanessa Camargo, Dra. Juliana Mendes) per COPY_LANDING_PAGE_LGPD.md lines 223-236.
   - **ROI Closing Callout**: Insert the closing callout box *"Se o ClinicaBot recuperar APENAS 2 CONSULTAS no mês todo, o sistema JÁ SE PAGOU..."* right below the ROI Calculator.
   - **14-Day Guarantee Box**: Insert the *"Garantia Incondicional de 14 Dias de Teste"* box inside/below the Plans & Pricing section per COPY_LANDING_PAGE_LGPD.md lines 262-265.

3. **Responsive Mobile Navigation**:
   - Add a mobile hamburger menu toggle button in `<header>` and JS toggle script so mobile users (width <= 1024px) can expand/collapse `.nav-links`.

4. **Refactor Event Handlers to Event Delegation (Rule 5)**:
   - Remove inline `onclick` and `oninput` attributes from buttons, inputs, and accordion triggers (`openSimulatorModal`, `updateCalculator`, `toggleFaq`, `simReply`).
   - Replace with `data-action` attributes (e.g. `data-action="open-simulator"`, `data-action="toggle-faq"`) and register clean `document.addEventListener('click', ...)` and `addEventListener('input', ...)` handlers.
   - Ensure dynamic HTML interpolation uses XSS sanitizer `esc()`.

5. **Accessibility & ARIA**:
   - Add `role="button"`, `tabindex="0"`, and `aria-expanded="false"`/`"true"` attributes to FAQ accordion triggers and keyboard EventListener (`Enter`/`Space` key support).

6. **WhatsApp Simulator Enhancement**:
   - Add chat reset logic when re-opening simulator.
   - Ensure Ana persona ("Ana 😊") and BRT date format (`DD/MM/YYYY`) are preserved.

7. **Pricing & Commercial Dossier Alignment**:
   - Verify pricing grid and ROI calculator remain Starter R$ 197/mês (Setup R$ 297), Pro R$ 397/mês (Setup R$ 397), Enterprise R$ 697/mês (Setup R$ 497).
   - In `DOSSIE_PROSPECCAO_ICP_CLINICABOT.md` (Section 4.5), update legacy setup fee (R$ 1.500) and legacy monthly fee (R$ 497) to match the approved 3-tier pricing matrix.

8. **File Synchronization**:
   - Both `index.html` at root and `clinic-bot-backend/public/index.html` MUST be updated identically.

9. **Build & Test Verification**:
   - After completing code changes, run test suite `node clinic-bot-backend/tests/overnight_test_suite.js` (or `npm test` from `clinic-bot-backend`) to ensure 0 failures and all 24 tests + 100 concurrent requests pass.
