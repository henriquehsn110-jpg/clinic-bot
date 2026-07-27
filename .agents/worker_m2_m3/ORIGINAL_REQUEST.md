## 2026-07-24T04:00:17Z

Your identity: teamwork_preview_worker
Your working directory: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3
Parent orchestrator conversation ID: 3e5d1055-92ab-4d98-b800-6b2a935d48f1

Skills to read & follow:
- `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\skills\supabase-db-migrator\SKILL.md`
- `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\skills\whatsapp-flow-simulator\SKILL.md`
- `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\skills\lgpd-security-auditor\SKILL.md`
- `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\skills\clinica-bot-qa\SKILL.md`

Objective:
Implement all code, scripts, data, and test files required for Milestone 2 (R1 Outbound Prospecting) and Milestone 3 (R2 Technical Onboarding & Supabase Multi-Tenant).

Detailed Requirements:

1. **R1: Outbound Prospecting Data & Automation (`clinic-bot-backend/data/prospect_dossier.json` & `clinic-bot-backend/scripts/outbound_prospector.js`)**:
   - Extract lead data from `DOSSIE_PROSPECCAO_ICP_CLINICABOT.md` for at least 18 clinics (including Tier 1: Instituto Oralis, Instituto Anália Franco, Hospital Olhos Yano, Clinipampa, Dra. Fernanda Chauvin) into `clinic-bot-backend/data/prospect_dossier.json`.
   - Create `clinic-bot-backend/scripts/outbound_prospector.js` supporting `--dry-run` and `--limit=5`.
   - The script must parse the JSON dossier, simulate multichannel campaign outreach (WhatsApp script & Email script) using Ana's persona ("Ana 😊"), BRT timezone (`America/Sao_Paulo`), and Brazilian date formatting (`DD/MM/YYYY`).
   - The script must generate a detailed log file `clinic-bot-backend/logs/prospecting_dry_run_log.json` capturing the full message flow and contact details for at least 5 Tier 1 clinics.

2. **R2: Supabase Multi-Tenant Onboarding Script (`clinic-bot-backend/scripts/onboard_tenant.js`)**:
   - Create `clinic-bot-backend/scripts/onboard_tenant.js` to automate provisioning of new clinic tenants.
   - Must provision at least 2 independent test tenants (e.g. `Clínica Odonto Teste A` and `Clínica Estética Teste B`) with `tenant_id`/`clinic_id`, business hours, webhook secret, and initial configuration.
   - Log provisioning details cleanly to console/log file.

3. **R2: Programmatic RLS Isolation Test (`clinic-bot-backend/tests/test_tenant_rls_isolation.js`)**:
   - Create `clinic-bot-backend/tests/test_tenant_rls_isolation.js`.
   - Must programmatically test and verify that data between Clinic A and Clinic B is 100% isolated under Supabase Row Level Security (RLS) policies (e.g. Clinic A service role/jwt cannot read or mutate Clinic B's patients or appointments).
   - Must exit with code 0 on pass and throw descriptive error on failure.

4. **R2: HMAC SHA-256 Webhook Injection & Signature Validation Test (`clinic-bot-backend/tests/test_hmac_webhook_injection.js`)**:
   - Create `clinic-bot-backend/tests/test_hmac_webhook_injection.js`.
   - Must test injecting both valid HMAC SHA-256 signed webhook payloads (`x-hub-signature-256` = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`) and invalid/tampered signatures into the webhook endpoint `/webhook` or `/api/webhook`.
   - Verifies valid signatures are accepted (HTTP 200) and invalid signatures are rejected (HTTP 401/403).
   - Must exit with code 0 on pass.

5. **Test Suite Integration & Verification**:
   - Integrate the new tests (`test_tenant_rls_isolation.js` and `test_hmac_webhook_injection.js`) into `clinic-bot-backend/tests/overnight_test_suite.js` or execute them alongside it.
   - Run the scripts and test suites to verify 100% pass rate with 0 failures!

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Output instructions:
Write your detailed report to `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3\changes.md` and handoff report to `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3\handoff.md` with complete command outputs and test results. When finished, send a message to parent orchestrator.
