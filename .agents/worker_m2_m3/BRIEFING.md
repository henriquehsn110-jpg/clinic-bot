# BRIEFING — 2026-07-24T04:00:00Z

## Mission
Implement all code, scripts, data, and test files required for Milestone 2 (R1 Outbound Prospecting) and Milestone 3 (R2 Technical Onboarding & Supabase Multi-Tenant).

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3
- Original parent: 3e5d1055-92ab-4d98-b800-6b2a935d48f1
- Milestone: Milestone 2 & Milestone 3

## 🔒 Key Constraints
- Must extract lead data for at least 18 clinics from DOSSIE_PROSPECCAO_ICP_CLINICABOT.md into clinic-bot-backend/data/prospect_dossier.json.
- Create outbound_prospector.js supporting --dry-run and --limit=5 using Ana's persona ("Ana 😊"), BRT timezone, DD/MM/YYYY formatting, logging to logs/prospecting_dry_run_log.json.
- Create onboard_tenant.js provisioning at least 2 independent test tenants (Clínica Odonto Teste A, Clínica Estética Teste B).
- Create test_tenant_rls_isolation.js testing 100% RLS isolation between tenants.
- Create test_hmac_webhook_injection.js testing valid and invalid HMAC SHA-256 signatures on /webhook or /api/webhook endpoint.
- Integrate new tests into overnight_test_suite.js and verify 100% pass rate.
- NO CHEATING, no hardcoding, maintain genuine logic.

## Current Parent
- Conversation ID: 3e5d1055-92ab-4d98-b800-6b2a935d48f1
- Updated: 2026-07-24T04:00:00Z

## Task Summary
- **What to build**: M2 outbound prospecting scripts/data, M3 tenant onboarding script, RLS isolation test, HMAC signature test, and integration into test suite.
- **Success criteria**: 100% pass rate on all automated tests, clean logs, exact requirements met.
- **Interface contracts**: AGENTS.md, PROJECT_KNOWLEDGE_BASE.md
- **Code layout**: clinic-bot-backend/

## Change Tracker
- **Files modified**: None yet
- **Build status**: TBD
- **Pending issues**: None

## Quality Status
- **Build/test result**: TBD
- **Lint status**: TBD
- **Tests added/modified**: TBD

## Loaded Skills
- `supabase-db-migrator`: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3\skills\supabase-db-migrator\SKILL.md
- `whatsapp-flow-simulator`: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3\skills\whatsapp-flow-simulator\SKILL.md
- `lgpd-security-auditor`: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3\skills\lgpd-security-auditor\SKILL.md
- `clinica-bot-qa`: c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\worker_m2_m3\skills\clinica-bot-qa\SKILL.md

## Key Decisions Made
- Initial setup

## Artifact Index
- ORIGINAL_REQUEST.md — Original task prompt
- BRIEFING.md — Persistent context index
