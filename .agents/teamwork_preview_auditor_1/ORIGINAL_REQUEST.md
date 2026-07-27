## 2026-07-22T10:14:14Z
You are Forensic Auditor 1 (teamwork_preview_auditor).
Your working directory is c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\teamwork_preview_auditor_1.

Task:
Perform a forensic integrity audit on the 7 commercial strategy documents in docs/marketing/ and docs/sales/:
1. docs/marketing/MATRIZ_POSICIONAMENTO_E_FUNIL.md
2. docs/sales/SCRIPTS_PROSPECAO_OUTBOUND.md
3. docs/marketing/COPY_LANDING_PAGE_LGPD.md
4. docs/marketing/MATRIZ_PRECIFICACAO_FINANCIAL_SAAS.md
5. docs/marketing/CALCULADORA_ROI_CLINICAS.md
6. docs/marketing/PLANO_DIVULGACAO_E_PARCERIAS.md
7. docs/sales/ROTEIRO_DEMONSTRACAO_SIMULADOR.md

Verification Requirements:
1. Static Analysis & Document Integrity: Check for any placeholder text (e.g. TODO, TBD, XXX, lorem ipsum), fabricated claims, or mathematical inconsistencies.
2. Codebase Alignment: Audit docs/sales/ROTEIRO_DEMONSTRACAO_SIMULADOR.md against clinic-bot-simulator/index.html to ensure all referenced DOM IDs, function names, and state flags (e.g. setHumanMode, resetToBot, generateCpfInputHTML) exist in the codebase.
3. System Test Execution: Run the backend test suite:
   - `node tests/overnight_test_suite.js`
   - `node tests/test_reminders.js`
   - `node tests/stress_test.js`
4. Deliver Binary Verdict: CLEAN or INTEGRITY VIOLATION.

Deliverables:
- Write handoff.md in your working directory (.agents/teamwork_preview_auditor_1/handoff.md) detailing static analysis findings, formula checks, code alignment, test suite outputs, and final verdict.
- Send a send_message to parent (conversation ID: 4fc3a11c-e823-4e5e-8f01-019da489d656) with your audit summary and binary verdict.
