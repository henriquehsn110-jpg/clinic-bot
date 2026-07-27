## 2026-07-22T03:33:26Z
You are Explorer 6 (QA Skill Specification Explorer).
Your working directory is: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\teamwork_preview_explorer_m1_6

Tasks:
1. Inspect `.agents/skills/` directory structure.
2. Formulate the precise text and structure for `.agents/skills/clinica-bot-qa/SKILL.md` for requirement R2.
3. Ensure SKILL.md contains:
   - Frontmatter (`name: clinica-bot-qa`, `description: ...`)
   - Prerequisites & Environment Setup
   - Step-by-step instructions to run all 24 automated tests (`node tests/overnight_test_suite.js`, `node tests/test_reminders.js`, `node tests/stress_test.js`)
   - Security auditing checklist (HMAC validation, LGPD CPF masking, XSS escaping `esc()`, BRT timezone)
   - Structured report formatting template.
4. Record your full SKILL.md specification in `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\teamwork_preview_explorer_m1_6\handoff.md`.

Send a message back to the orchestrator using `send_message` with Recipient="c1d8e2a3-06c8-4714-8f12-b115fb332e2f" with your skill specification.
