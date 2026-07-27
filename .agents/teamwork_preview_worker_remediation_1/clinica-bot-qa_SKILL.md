# ClinicaBot SaaS Pro — QA & Security Audit Skill (`clinica-bot-qa`)

This skill defines the complete instructions, execution steps, security standards, and reporting guidelines for quality assurance, automated test suite execution, and security auditing for **ClinicaBot SaaS Pro**.

---

## 1. Overview of Automated Test Suites (Total: 24 Automated Tests + Stress Test)

### 1.1 Overnight Test Suite (`tests/overnight_test_suite.js` - 20 Tests)
The overnight test suite covers full-stack verification divided into three categories:

- **Category A: Frontend & Security Audit (`dashboard.html`)**
  - **A1**: `apiRequest` throws an Error on HTTP non-2xx response status (no silent fallback).
  - **A2**: `handleLogin` aborts flow if HTTP authentication fails.
  - **A3**: Dynamic string interpolation in `innerHTML` is 100% protected using `esc()`.
  - **A4**: Zero inline `onclick` handlers with template string interpolation (uses `data-*` + event delegation).
  - **A5**: Polling loop employs `pollTimeoutId` anti-duplication lock to prevent memory leaks or overlapping fetches.
  - **A6**: CSV export applies formula injection sanitization (prefixing `=`, `+`, `-`, `@`, `\t`, `\r` with single quote `'`).
  - **A7**: All external links with `target="_blank"` include `rel="noopener noreferrer"`.
  - **A8**: Table rendering functions safely handle `null`/`undefined` phone and name fields without throwing TypeError on `.replace()`.

- **Category B: Backend & Business Logic Rules**
  - **B1**: Webhook rejects invalid HMAC signatures with HTTP 403 in all environments.
  - **B2**: Batch message ingestion wraps each individual message in a `try/catch` block to isolate failures without aborting the batch.
  - **B3**: `CPF_ENCRYPTION_KEY` is present in environment variables and validated as a 64-character hex string.
  - **B4**: Direct appointment confirmation text matches `"confirmar"` directly; ambiguous NLU text routes to Gemini AI.
  - **B5**: `calendarService.getTodayAppointments` standardizes date calculations in `America/Sao_Paulo` (BRT) timezone.
  - **B6**: Concurrent webhook inbox processor uses atomic `claim_webhook_inbox` RPC and database unique constraint `23505` on `webhook_logs`.
  - **B7**: Unhandled message processing errors log `WEBHOOK_MESSAGE_LOST` to production logger without crashing background loops.
  - **B8**: Automatic appointment reminder module (`reminderService`) is fully integrated into server background tasks.

- **Category C: Security, Secrets & LGPD Compliance**
  - **C1**: Dynamic `npm audit` execution confirms 0 high or critical vulnerabilities across project dependencies.
  - **C2**: Codebase secret scanner verifies zero hardcoded Supabase service secrets in utility scripts (`migrate_cpf.js`).
  - **C3**: `/api/dashboard/data` endpoint sanitizes patient records, stripping raw `cpf` strings and returning `cpfMasked` (`•••.•••.•••-••`).
  - **C4**: Dashboard endpoints require valid `Authorization: Bearer <token>` header, returning HTTP 401 on missing or invalid tokens.

### 1.2 Reminders Test Suite (`tests/test_reminders.js` - 4 Tests)
- **R1**: `getTodayBrtDateStr()` returns current date formatted as `YYYY-MM-DD` under `America/Sao_Paulo` timezone.
- **R2**: `processDailyReminders(true)` executes in simulation mode without calling Meta API, returning execution statistics (`totalToday`, `sent`, `skipped`, `failed`).
- **R3**: Idempotency check: running `processDailyReminders(true)` twice on the same day skips previously sent reminders.
- **R4**: Automatic reminder schedule is activated daily at 08:00 AM America/Sao_Paulo via `node-cron` inside `server.js`.

### 1.3 Stress & Load Testing Suite (`tests/stress_test.js` - 100 Requests)
- Simulates 100 concurrent asynchronous HTTP requests (50% `/api/simulate` and 50% `/api/dashboard/data`).
- Evaluates HTTP 200 success rate (must be 100%), total execution duration, request throughput (req/sec), average latency, and database pool stability under load.

---

## 2. Execution Protocol

To run all automated test suites and verify system readiness, execute the following commands in sequence within `clinic-bot-backend`:

```bash
# 1. Run Overnight Test Suite (20 tests)
node tests/overnight_test_suite.js

# 2. Run Reminder Integration Test Suite (4 tests)
node tests/test_reminders.js

# 3. Run Stress Test Suite (100 concurrent requests)
node tests/stress_test.js
```

### Server Lifecycle Auto-Start Rule
All test scripts must check whether `http://localhost:3000/health` is responsive before firing requests. If port 3000 is not listening, the test runner auto-spawns `server.js` in background, waits for health check confirmation, and terminates the spawned process upon suite completion.
