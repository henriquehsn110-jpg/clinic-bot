## 2026-07-22T10:20:50Z
You are Worker Remediation 1 for ClinicaBot SaaS Pro.
Your working directory is `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\teamwork_preview_worker_remediation_1`.
Create your working directory state files (`BRIEFING.md`, `progress.md`) upon initialization.

### MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### OBJECTIVE
Execute all 5 remediation tasks based on the Explorer's plan in `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\teamwork_preview_explorer_remediation_1\handoff.md`:

1. **Fix Financial Math in `docs/marketing/MATRIZ_PRECIFICACAO_FINANCIAL_SAAS.md`**:
   - Lines 467-477 (Consolidated Box): Update ARPU to `R$ 362,00 BRL`, Lucro Bruto Mensal to `R$ 298,65 BRL`, LTV to `R$ 10.305,00 BRL`, Razão LTV / CAC to `34,35x`.
   - Line 486: Update ARPU calculation sum result to `R$ 362,00 BRL`.
   - Line 489: Update Lucro Bruto Mensal calculation to `362,00 * 0,825 = R$ 298,65 BRL`.
   - Lines 492-493: Update LTV calculation to `(33,33 * 298,65) + 350,00 = 9.955,00 + 350,00 = R$ 10.305,00 BRL`.
   - Line 496: Update Razão LTV / CAC calculation to `10.305,00 / 300,00 = 34,35x`.
   - Line 498: Update text reference from `32,76x` to `34,35x`.

2. **Fix Pricing Tiers in `docs/marketing/COPY_LANDING_PAGE_LGPD.md`**:
   - Section 8 (Lines 249-253): Update pricing table to Starter `R$ 197 / mês` (Até 400 conversas/mês), Pro `R$ 397 / mês` (Até 1.200 conversas/mês), Enterprise `R$ 697 / mês` (Até 2.800 conversas/mês).

3. **Fix Pricing Tiers in `docs/marketing/MATRIZ_POSICIONAMENTO_E_FUNIL.md`**:
   - Section 4.3.C (Lines 228-230): Update plan list to Starter `R$ 197,00/mês` (Até 400 conversas/mês), Pro `R$ 397,00/mês` (Até 1.200 conversas/mês), Enterprise `R$ 697,00/mês` (Até 2.800 conversas/mês).

4. **Fix DOM Alignment in `clinic-bot-simulator/index.html`**:
   - Line 339: Add `id="header-name"` to `<h2 id="header-name">Clínica Modelo</h2>`.
   - Lines 656 & 679: Update JS selector to `const h2 = document.getElementById('header-name') || document.querySelector('.header-info h2');`.

5. **Fix Placeholder in `docs/sales/SCRIPTS_PROSPECAO_OUTBOUND.md`**:
   - Line 104: Replace `[ Inserir Link do Simulador ou GIF curto ]` with `👉 [Simulador Interativo: https://clinicabot.com.br/simulador]`.

### VERIFICATION
After making all edits:
- Run test scripts:
  - `node tests/overnight_test_suite.js`
  - `node tests/test_reminders.js`
  - `node tests/stress_test.js`
- Verify all tests pass with 0 errors.

Write your handoff report to `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\teamwork_preview_worker_remediation_1\handoff.md` with documented build/test outputs, and send a completion message back to parent.
