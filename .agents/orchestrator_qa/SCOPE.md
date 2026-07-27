# Scope: ClinicaBot SaaS Pro QA & Production-Readiness Evaluation

## Architecture & System Scope
- Backend: Node.js / Express (`clinic-bot-backend/server.js`)
- Database: Supabase PostgreSQL (Multi-tenant RLS)
- Webhook / Bot / AI: Meta WhatsApp Cloud API / Gemini 2.0/1.5 Flash ("Ana")
- Reception Frontend: `dashboard.html` / `dashboardController.js`
- Security & Encryption: AES-256-GCM CPF encryption, HMAC SHA-256 Webhook signatures

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Security & LGPD Privacy Audit | Static & runtime check for XSS, CSV Injection, Webhook HMAC bypass, LGPD/CPF masking, Supabase multi-tenant RLS isolation | None | DONE |
| 2 | Conversational Logic & BRT Timezone | State machine, prompt injection resilience, hallucination prevention, BRT timezone (`America/Sao_Paulo`) consistency | M1 | DONE |
| 3 | Concurrency & Database Resilience | Verification of atomic locks (`claim_webhook_inbox`), running existing overnight and stress test suites (`tests/overnight_test_suite.js`, `tests/stress_test.js`) | M1, M2 | IN_PROGRESS |
| 4 | Final Adversarial Hardening & Report | Malformed payloads / adversarial inputs testing, audit verification, generation of `QA_AUDIT_FINAL_REPORT.md` | M1, M2, M3 | IN_PROGRESS |

## Interface & Security Contracts
- All dynamic HTML in dashboard must use `esc()` and dataset event delegation.
- CSV exports must prepend single quotes to formulas (`=`, `+`, `-`, `@`, `\t`, `\r`).
- Webhooks must reject invalid HMAC (`X-Hub-Signature-256`) with 403.
- Dashboard endpoints (`/api/dashboard/data`) must return `cpfMasked` and omit raw `cpf`.
- Supabase queries must maintain RLS multi-tenant isolation (`tenant_id`).
- All dates sent/displayed in BRT format `DD/MM/YYYY`.
