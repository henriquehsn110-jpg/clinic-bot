# PROJECT PLAN: ClinicaBot SaaS Pro (R1 & R2)

## Objectives
1. **R1: Automação de Prospecção (Outbound)**
   - Process ICP clinics from `DOSSIE_PROSPECCAO_ICP_CLINICABOT.md`.
   - Automate/simulate multichannel contact flow (WhatsApp, Email) with detailed logging.
   - Acceptance Criteria: Dry-run reading at least 5 clinics and generating message flow log.

2. **R2: Onboarding Técnico & Supabase Multi-Tenant**
   - Automated scripts (SQL/Node.js) provisioning new clients in Supabase (`tenant_id`, RLS policies, credentials, webhooks).
   - Acceptance Criteria: Provision at least 2 independent test environments/tenants in Supabase.
   - Acceptance Criteria: Programmatic RLS data isolation test (Clinic A cannot access Clinic B data).
   - Acceptance Criteria: Test proving Webhook injection & validation with HMAC SHA-256 signatures.

3. **QA & Forensic Verification**
   - Execute test suite (`node clinic-bot-backend/tests/overnight_test_suite.js` + new test scripts) to guarantee 0 failures.
   - Independent verification by Reviewers, Challengers, and Forensic Auditor.

## Milestones & Status
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Architecture | Discover codebase layout, dossier, Supabase scripts, RLS policies, test harness | None | DONE |
| 2 | R1 Outbound Prospecting | Multichannel prospect script reading dossier, simulation, logging, dry-run on 5+ clinics | M1 | IN_PROGRESS |
| 3 | R2 Supabase Multi-Tenant Onboarding | Onboarding scripts, tenant provisioning (2+ test tenants), RLS isolation test, HMAC SHA-256 webhook test | M1 | IN_PROGRESS |
| 4 | QA & Forensic Audit | Reviewers, Challengers, Forensic Auditor verification, overnight test suite 0 failures | M2, M3 | PLANNED |
