## 2026-07-22T10:13:44Z
You are Worker 2b (Implementation & Remediation Worker).
Your working directory is: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\teamwork_preview_worker_m2_2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Fix test facade assertions in `clinic-bot-backend/tests/overnight_test_suite.js`:
   - B2: Implement genuine code/logic test for webhook error isolation.
   - B6: Implement genuine test for DB RPC `claim_webhook_inbox` and lock retry handling.
   - B7: Implement genuine test verifying production logger `WEBHOOK_MESSAGE_LOST`.
   - C1: Implement genuine dynamic `npm audit` execution checking 0 high/critical vulnerabilities.
   - Server lifecycle: Add auto-start check for `server.js` on port 3000 if not listening.

2. Fix BRT Date formatting in `clinic-bot-backend/services/databaseService.js:292`:
   - Replace `.toISOString().split('T')[0]` with BRT component formatting (`${brtObj.getFullYear()}-${String(brtObj.getMonth()+1).padStart(2,'0')}-${String(brtObj.getDate()).padStart(2,'0')}`) per AGENTS.md Rule 1.

3. Fix Dashboard authentication security in `clinic-bot-backend/controllers/dashboardController.js`:
   - Require valid credentials check on `login()`, returning HTTP 401 on invalid attempt.

4. Implement Requirement R1 (Automatic Reminder Cron):
   - Run `npm install node-cron` in `clinic-bot-backend/`.
   - In `clinic-bot-backend/server.js`, import `node-cron` and activate daily schedule at 08:00 AM America/Sao_Paulo (`cron.schedule('0 8 * * *', ..., { timezone: 'America/Sao_Paulo' })`) for `reminderService.processDailyReminders(process.env.NODE_ENV !== 'production')` inside `app.listen()`, wrapped in try/catch for non-blocking boot.

5. Implement Requirement R2 (Custom QA Agent Skill):
   - Create `.agents/skills/clinica-bot-qa/SKILL.md` with:
     - Frontmatter: `name: clinica-bot-qa`, `description: Comprehensive instructions for executing, auditing, and reporting the 24 automated tests and stress testing for ClinicaBot SaaS Pro.`
     - Complete guide for running and auditing `overnight_test_suite.js` (20 tests), `test_reminders.js` (4 tests), `stress_test.js` (100 requests).
     - Security audit guidelines (HMAC, LGPD CPF masking, XSS escaping, BRT timezone).
     - Report output format.

6. Run all automated test suites:
   - `node tests/overnight_test_suite.js`
   - `node tests/test_reminders.js`
   - `node tests/stress_test.js`
   Confirm 100% pass across all tests.

7. Write your handoff report to `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\teamwork_preview_worker_m2_2\handoff.md`.

Send a message back to the orchestrator using `send_message` with Recipient="c1d8e2a3-06c8-4714-8f12-b115fb332e2f" with your execution report.
