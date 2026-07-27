## 2026-07-24T06:02:51Z
You are Worker 1 (Gen 2) for ClinicaBot SaaS Pro implementing Milestone 2 (R1 Outbound Prospecting) and Milestone 3 (R2 Supabase Multi-Tenant Onboarding & Security Tests).

Working directory: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3_gen2\

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

CRITICAL RULES:
- Read `AGENTS.md` and `PROJECT_KNOWLEDGE_BASE.md` before writing code.
- Respect BRT timezone (`America/Sao_Paulo`), Brazilian date format (`DD/MM/YYYY`), LGPD rules (`cpfMasked`, AES-256 encryption, HMAC SHA-256 webhook security, XSS protection with `esc()`).

Your Tasks:

Task 1: R1 — Automação de Prospecção (Outbound)
1. Parse the prospect dossier from `DOSSIE_PROSPECCAO_ICP_CLINICABOT.md` and save structured JSON to `clinic-bot-backend/data/prospect_dossier.json` (include 18 clinics mapped across Tiers 1-4 with name, tier, niche, score, city, phone, email, contact_person, pitch_hooks).
2. Create `clinic-bot-backend/scripts/outbound_prospector.js`:
   - Command-line tool supporting `--dry-run`, `--limit=<n>`, `--channel=<whatsapp|email|all>`.
   - Formats dates in BRT (`America/Sao_Paulo`) as `DD/MM/YYYY`.
   - Generates personalized multichannel outreach messages (WhatsApp copy with Ana persona / professional email pitch) customized per niche and tier.
   - Logs complete message flow execution to console and writes JSON log to `clinic-bot-backend/logs/prospecting_dry_run_log.json`.
3. Execute dry-run processing at least 5 clinics from the dossier (Tier 1 clinics) and verify log output exists and is non-empty.

Task 2: R2 — Onboarding Técnico & Supabase Multi-Tenant
1. Create `clinic-bot-backend/scripts/onboard_tenant.js`:
   - Automated script/module to provision new clinic tenants in Supabase/PostgreSQL.
   - Inserts tenant into `clinics` table with `tenant_id` (UUID), `name`, `slug`, `phone_number_id`, `whatsapp_token`, `address`, `work_hours`, `eval_price`, `webhook_secret`.
   - Provisions default hours in `clinic_hours`.
   - Automatically provisions at least 2 independent test environments/tenants in Supabase (e.g. `Clinica Alfa Teste - Spas & Dermato` and `Clinica Beta Teste - Odonto Premium`).
2. Create `clinic-bot-backend/tests/test_tenant_rls_isolation.js`:
   - Automated test proving 100% RLS data isolation between Clinic A (`tenant_id_a`) and Clinic B (`tenant_id_b`).
   - Inserts data under Clinic A and Clinic B, queries under Clinic A's context, and asserts Clinic B's data is never accessible.
3. Create `clinic-bot-backend/tests/test_hmac_webhook_injection.js`:
   - Automated test verifying Meta WhatsApp Webhook security.
   - Injects valid HMAC SHA-256 signed payloads (`x-hub-signature-256`) -> expects HTTP 200/202.
   - Injects invalid/tampered HMAC payloads -> expects HTTP 403 Forbidden.

Task 3: Verification & Test Suite Execution
1. Integrate the new test scripts into `clinic-bot-backend/tests/overnight_test_suite.js`.
2. Run all tests via terminal:
   - `node clinic-bot-backend/scripts/outbound_prospector.js --dry-run --limit=5`
   - `node clinic-bot-backend/scripts/onboard_tenant.js`
   - `node clinic-bot-backend/tests/test_tenant_rls_isolation.js`
   - `node clinic-bot-backend/tests/test_hmac_webhook_injection.js`
   - `node clinic-bot-backend/tests/overnight_test_suite.js`
3. Document all test commands, output, and verification results in your handoff report at `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3_gen2\handoff.md`.
4. Send a message to parent (`240c3fc3-0182-4ad1-942e-81049e96686b`) with summary of completed work and verification results.
