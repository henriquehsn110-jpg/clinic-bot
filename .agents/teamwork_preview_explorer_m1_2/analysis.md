# Global Audit Report: Supabase Query Builder Promise Fix & Codebase Scan

**Project**: ClinicaBot SaaS Pro  
**Agent**: Explorer 2 (Milestone 1 — Webhook & Global Audit Analysis)  
**Date**: 2026-07-26  
**Scope**: All JavaScript files in `clinic-bot-backend/` (`server.js`, `services/`, `controllers/`, `scripts/`, `tests/`, `routes/`, `utils/`, root helper scripts)

---

## 1. Executive Summary

A comprehensive code audit was conducted across all 64 JavaScript files in `clinic-bot-backend/` to detect invalid method chaining on Supabase PostgREST query builders (such as `.catch()` or `.finally()` attached directly to `supabase.from(...)` builder instances before `await` or native Promise conversion).

### Audit Findings Summary
- **Invalid Supabase Query Builder `.catch()` Chains Found**: 3 occurrences across 3 files (`server.js`, `services/reminderService.js`, and `apply_reminder_fixes.js`).
- **Native Promise `.catch()` Chaining (Valid JS)**: Identified across `server.js`, `controllers/conversationController.js`, `controllers/dashboardController.js`, and `services/databaseService.js` (attached to async functions returning standard Promises like `whatsappService`, `calendarService`, or `withRetry`).

---

## 2. Detailed Findings: Query Builder Anti-Pattern Occurrences

### Occurrence 1: `clinic-bot-backend/server.js` (Line 173)

- **File**: `clinic-bot-backend/server.js`
- **Line Number**: 173
- **Verbatim Code Snippet**:
  ```javascript
  await db.supabase.from('clinics').update({ phone_number_id: phoneNumberId }).eq('id', defaultClinic.id).catch(() => {});
  ```
- **Technical Assessment**:
  - `db.supabase.from('clinics').update(...).eq(...)` returns an instance of `PostgrestFilterBuilder` from `@supabase/supabase-js`.
  - `PostgrestFilterBuilder` implements the Thenable protocol (`.then()`), but does **NOT** define `.catch()` or `.finally()` on its prototype.
  - In JavaScript evaluation order, `.catch(() => {})` is invoked as a method call on the object returned by `.eq(...)` *before* `await` executes.
  - Because `.catch` is `undefined` on `PostgrestFilterBuilder`, JavaScript throws a runtime `TypeError: db.supabase.from(...).update(...).eq(...).catch is not a function` during evaluation.
- **Proposed Refactoring**:
  ```javascript
  try {
      const { error: updateErr } = await db.supabase
          .from('clinics')
          .update({ phone_number_id: phoneNumberId })
          .eq('id', defaultClinic.id);
      if (updateErr) {
          logger.warn('SERVER_SET_PHONE_ID', `Falha ao atualizar phone_number_id na clínica padrão: ${updateErr.message}`);
      }
  } catch (err) {
      logger.error('SERVER_SET_PHONE_ID', `Erro inesperado ao atualizar clínica padrão: ${err.message}`);
  }
  ```

---

### Occurrence 2: `clinic-bot-backend/services/reminderService.js` (Line 121-125)

- **File**: `clinic-bot-backend/services/reminderService.js`
- **Line Number**: 121-125
- **Verbatim Code Snippet**:
  ```javascript
  await db.supabase.from('reminder_logs').insert({
      appointment_id: appt.id,
      clinic_id: clinic.id,
      sent_at: new Date().toISOString()
  }).catch(e => logger.error('REMINDER_LOG_FAILED', e.message));
  ```
- **Technical Assessment**:
  - `db.supabase.from('reminder_logs').insert(...)` returns a Supabase `PostgrestQueryBuilder` / `PostgrestFilterBuilder` instance.
  - Attaching `.catch(...)` directly to `.insert(...)` fails at runtime with `TypeError: db.supabase.from(...).insert(...).catch is not a function`.
  - As a result, when a reminder is sent, attempting to record the log entry in `reminder_logs` fails with a runtime exception instead of catching and logging DB errors gracefully.
- **Proposed Refactoring**:
  ```javascript
  try {
      const { error: logErr } = await db.supabase
          .from('reminder_logs')
          .insert({
              appointment_id: appt.id,
              clinic_id: clinic.id,
              sent_at: new Date().toISOString()
          });
      if (logErr) {
          logger.error('REMINDER_LOG_FAILED', logErr.message);
      }
  } catch (e) {
      logger.error('REMINDER_LOG_FAILED', e.message);
  }
  ```

---

### Occurrence 3: `clinic-bot-backend/apply_reminder_fixes.js` (Line 43)

- **File**: `clinic-bot-backend/apply_reminder_fixes.js`
- **Line Number**: 43
- **Verbatim Code Snippet**:
  ```javascript
  await db.supabase.from('reminder_logs').insert({
      appointment_id: appt.id,
      clinic_id: clinic.id,
      sent_at: new Date().toISOString()
  }).catch(e => logger.error('REMINDER_LOG_FAILED', e.message));
  ```
- **Technical Assessment**:
  - This file is an automated fix script that injects code strings into `services/reminderService.js`.
  - Line 43 contains the exact string representation of the broken query builder `.catch()` anti-pattern. If this script is executed, it re-introduces the invalid `.catch()` into `services/reminderService.js`.
- **Proposed Refactoring**:
  - Update the code replacement template inside `apply_reminder_fixes.js` to use standard `try/catch` and `{ error }` destructuring matching the refactored `services/reminderService.js`.

---

## 3. Analysis of Other Promise & Supabase Usages

### A. Valid Native Promise `.catch()` Calls
The following files attach `.catch(...)` to asynchronous functions that return native ES Promises (e.g. `whatsappService.sendTextMessage()`, `calendarService.getAvailableSlots()`, `reminderService.processDailyReminders()`, `withRetry()`):
- `server.js` (lines 222, 296)
- `controllers/conversationController.js` (lines 180, 205, 233, 282, 309, 452, 516, 631, 711, 760)
- `controllers/dashboardController.js` (lines 365, 372)
- `services/databaseService.js` (line 597 — `withRetry(...).catch(...)`)

*Assessment*: These usages are syntactically valid JavaScript because they operate on native `Promise` objects returned by `async` functions.

### B. Clean Database Services & Controllers
- `services/databaseService.js`: All 713 lines follow proper Supabase JS patterns (`const { data, error } = await supabase.from(...)`). Zero builder `.catch()` chains.
- `controllers/conversationController.js`: Line 143 uses `await db.supabase.from('clinics').select(...).eq(...).maybeSingle()`.
- `controllers/dashboardController.js`: All queries use `await db.supabase.from(...)` with destructuring.
- `services/calendarService.js`: All queries use `await db.supabase.from(...)`.
- `scripts/onboard_tenant.js`: Clean `await supabase.from(...)` queries.
- `tests/test_tenant_rls_isolation.js` & `tests/test_rls.js`: Clean queries.

---

## 4. Summary Matrix of Required Changes for Milestone 2

| File Path | Line(s) | Original Pattern | Severity | Action Required for Milestone 2 |
|-----------|---------|------------------|----------|---------------------------------|
| `clinic-bot-backend/server.js` | 173 | `await db.supabase.from('clinics').update(...).eq(...).catch(() => {});` | High (Runtime TypeError in Webhook inbox loop) | Refactor to `try/catch` with `{ error }` destructuring |
| `clinic-bot-backend/services/reminderService.js` | 121-125 | `await db.supabase.from('reminder_logs').insert(...).catch(...)` | High (Runtime TypeError during reminder logging) | Refactor to `try/catch` with `{ error }` destructuring |
| `clinic-bot-backend/apply_reminder_fixes.js` | 43 | Code string template with `.insert(...).catch(...)` | Medium (Fix script template propagation) | Update injected code template in fix script |
