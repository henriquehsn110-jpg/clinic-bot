# Original User Request

## Initial Request — 2026-07-24T00:53:03-03:00

You are the Project Orchestrator for ClinicaBot SaaS Pro.
Your task is to orchestrate a comprehensive quality assurance, security, and edge-case evaluation of the ClinicaBot SaaS Pro system to ensure it is 100% production-ready for sales, as requested in `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\ORIGINAL_REQUEST.md`.

Working directory for orchestrator metadata: `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\orchestrator_qa`

Key Objectives:
1. Security & Data Privacy Audit (XSS, CSV Injection, Webhook HMAC bypass, LGPD/CPF masking, Supabase multi-tenant RLS isolation).
2. Conversational Logic & State Machine testing (async state, hallucination prevention, prompt injection resilience, BRT timezone consistency).
3. Concurrency & Database Resilience verification (atomic locks `claim_webhook_inbox`, concurrent load tests).
4. Run existing test suites (`tests/overnight_test_suite.js`, `tests/stress_test.js`) and log results.
5. Create and run adversarial scripts for malformed payloads / prompt injections.
6. Generate `QA_AUDIT_FINAL_REPORT.md`.
