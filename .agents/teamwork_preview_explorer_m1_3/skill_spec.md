---
name: clinica-bot-qa
description: Executes and audits ClinicaBot SaaS Pro automated test suites (24 unit/integration tests + 100-request stress test), verifying XSS prevention, LGPD compliance, HMAC webhook security, and BRT timezone handling.
---

# ClinicaBot QA & Security Audit Skill (`clinica-bot-qa`)

This skill provides comprehensive instructions, execution commands, audit checklists, and reporting guidelines for running QA and security verification on **ClinicaBot SaaS Pro**.

---

## 1. Environment & Pre-Requisites

Before executing tests, ensure the local backend server is initialized or configured to handle test connections:
- Working directory: `clinic-bot-backend`
- Environment variables configured in `clinic-bot-backend/.env`:
  - `CPF_ENCRYPTION_KEY`: 64-character hexadecimal string.
  - `SUPABASE_URL` & `SUPABASE_SERVICE_KEY`: Valid Supabase credentials.
  - `META_WEBHOOK_VERIFY_TOKEN` & `META_APP_SECRET`: Webhook validation credentials.
  - `PORT`: Default `3000`.

---

## 2. Test Execution Suite (24 Tests + Stress Test)

Run all test suites sequentially from the root directory or inside `clinic-bot-backend/`:

### A. Overnight Automated QA Suite (20 Tests)
Command:
```bash
node clinic-bot-backend/tests/overnight_test_suite.js
```
**Coverage Breakdown (20 Tests Total):**
1. **Categoria A — Auditoria Frontend (`dashboard.html`) [8 Tests]:**
   - **A1:** `apiRequest` throws Error on non-2xx HTTP response (no mock fallback).
   - **A2:** `handleLogin` aborts flow if login request fails.
   - **A3:** `innerHTML` dynamic string interpolations 100% escaped with `esc()`.
   - **A4:** Zero inline `onclick` attributes with interpolation (uses `data-*` + event delegation).
   - **A5:** `fetchLiveDashboardData` utilizes `pollTimeoutId` to prevent duplicate polling loops.
   - **A6:** CSV export function (`exportAppointmentsCSV`) sanitizes strings starting with `=,+,-,@,\t,\r` to prevent Formula Injection.
   - **A7:** Every `target="_blank"` link includes `rel="noopener noreferrer"`.
   - **A8:** Table formatting functions safely handle `null`/`undefined` phone and name fields.

2. **Categoria B — Auditoria Backend & Regras de Negócio [8 Tests]:**
   - **B1:** Webhook HMAC validation (`X-Hub-Signature-256`) rejects invalid signatures with HTTP 403.
   - **B2:** Batch webhook messages isolated in individual `try/catch` blocks.
   - **B3:** `CPF_ENCRYPTION_KEY` validation (must be 64 hexadecimal characters).
   - **B4:** Confirmation text matching ('confirmar' exact match vs AI NLU routing).
   - **B5:** `calendarService.getTodayAppointments` standardized to `America/Sao_Paulo` timezone.
   - **B6:** Atomic lock via RPC `claim_webhook_inbox` and unique constraint `23505` on `webhook_logs`.
   - **B7:** `WEBHOOK_MESSAGE_LOST` pattern logged without interrupting the main webhook loop.
   - **B8:** `reminderService` automated reminder module integrated in backend.

3. **Categoria C — Segurança Geral, CORS & LGPD [4 Tests]:**
   - **C1:** Dependency audit (0 vulnerabilities).
   - **C2:** Secrets scanning (no hardcoded service keys in code files like `migrate_cpf.js`).
   - **C3:** LGPD masking — `/api/dashboard/data` endpoint returns `cpfMasked` and omits raw `cpf`.
   - **C4:** Protected API endpoint returns HTTP 401 when accessed without Bearer token.

---

### B. Reminder Service Suite (4 Tests)
Command:
```bash
node clinic-bot-backend/tests/test_reminders.js
```
**Coverage Breakdown (4 Tests Total):**
- **Test 1:** Verification of BRT date calculation format (`YYYY-MM-DD`).
- **Test 2:** Execution of `processDailyReminders(true)` in simulation mode returning status stats (`sent`, `skipped`).
- **Test 3:** Idempotency test (preventing duplicate reminder sending within the same day).
- **Test 4:** Clean execution without uncaught errors or process crash.

---

### C. Stress & Load Testing Suite (100 Concurrent Requests)
Command:
```bash
node clinic-bot-backend/tests/stress_test.js
```
**Metrics Evaluated:**
- **Concurrency:** 100 parallel asynchronous HTTP requests (50% `/api/simulate` + 50% `/api/dashboard/data`).
- **Success Criteria:** 100/100 HTTP 200 responses (0% error rate).
- **Performance Metrics:** Throughput (RPS), Total Duration (ms), Latency (Min, Max, Average ms).

---

## 3. Security & Compliance Checklist

When conducting QA analysis, verify the following core security principles:

| Rule | Requirement | Verification Method |
|---|---|---|
| **XSS Prevention** | All dynamic values in `innerHTML` must use `esc(str)` | Scan HTML/JS for unescaped `${var}` |
| **Event Delegation** | No inline `onclick="${id}"` | Ensure `data-*` datasets are used |
| **Tabnabbing Protection** | `target="_blank"` links require `rel="noopener noreferrer"` | Scan `a` tags in UI components |
| **Formula Injection** | Prepend `'` to CSV values starting with `=,+,-,@,\t,\r` | Check CSV generator utility |
| **Webhook Security** | Reject forged HMAC `X-Hub-Signature-256` with HTTP 403 | Test `/api/webhook` with invalid signature |
| **LGPD Masking** | API responses must omit raw `cpf` and return `cpfMasked` | Inspect `/api/dashboard/data` payload |
| **CPF Encryption** | Stored CPFs must use AES-256-GCM with valid 64-hex key | Validate `CPF_ENCRYPTION_KEY` format |
| **BRT Timezone** | Date functions must use `America/Sao_Paulo` timezone | Ensure `toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })` |

---

## 4. QA Report Formatting Structure

When generating a QA Audit Report, format the output as follows:

```markdown
# 🧪 ClinicaBot QA & Security Audit Report

**Audit Timestamp:** [YYYY-MM-DD HH:mm:ss BRT]  
**Environment:** [Development / Staging / Production]  
**Overall Result:** 🟢 PASS / 🔴 FAIL  

## 1. Test Execution Summary

| Test Suite | Total Tests | Passed | Failed | Status |
|---|---|---|---|---|
| Overnight QA Suite | 20 | [X] | [Y] | 🟢 / 🔴 |
| Reminder Service Suite | 4 | [X] | [Y] | 🟢 / 🔴 |
| Stress & Load Test | 100 reqs | [X] | [Y] | 🟢 / 🔴 |
| **TOTAL** | **24 tests + Load** | **[X]** | **[Y]** | **🟢 / 🔴** |

## 2. Load Test Benchmark Metrics
- **Total Requests:** 100
- **Success Rate:** [X]% (HTTP 200)
- **Total Duration:** [X] ms
- **Throughput:** [X] req/sec
- **Average Latency:** [X] ms (Min: [X] ms, Max: [X] ms)

## 3. Security & Compliance Verification
- [ ] **XSS Sanitization:** `esc()` applied across all UI components
- [ ] **Event Delegation:** Zero inline `onclick` attributes
- [ ] **Webhook HMAC:** HTTP 403 enforced on invalid signatures
- [ ] **LGPD Privacy:** `cpfMasked` returned; raw `cpf` excluded from responses
- [ ] **BRT Timezone:** Date calculations use `America/Sao_Paulo`

## 4. Identified Vulnerabilities / Discrepancies
[Detail any failed tests, security flaws, or performance bottlenecks, or state "None."]

## 5. Recommendation & Next Steps
[Actionable recommendations for deployment or remediation]
```
