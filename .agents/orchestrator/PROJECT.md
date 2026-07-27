# Project: ClinicaBot SaaS Pro - Supabase Query Builder Promise Fix & Global Audit

## Architecture
- Backend Node.js / Express server (`clinic-bot-backend/server.js`)
- Services: `clinic-bot-backend/services/databaseService.js`, `reminderService.js`, `aiService.js`, etc.
- Controllers: `clinic-bot-backend/controllers/`
- Supabase PostgREST query builders vs native Promises: PostgREST builder objects in `@supabase/supabase-js` (PostgrestFilterBuilder / PostgrestTransformBuilder) are Promise-like (thenable) but DO NOT inherit directly from standard `Promise.prototype` in all versions or contexts when chained directly before awaiting. Specifically, chaining `.catch()` directly onto `.from().update().eq()` without `await` or wrapping raises `TypeError: ...catch is not a function`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Webhook & Global Audit Analysis | Investigate `server.js` line 173 and scan `clinic-bot-backend/` for invalid Supabase `.catch()` / `.finally()` method chaining | none | DONE |
| 2 | Implementation & Refactoring | Refactor `server.js` line 173, `services/reminderService.js` line 125, and `apply_reminder_fixes.js` line 43 to standard `try/catch` or `{ data, error } = await` destructuring | M1 | DONE |
| 3 | Verification & QA Testing | Execute test suites (`test_tenant_rls_isolation.js`, `overnight_test_suite.js`), audit code integrity, verify git status & commit fix (`7be8806`) | M2 | DONE |

## Code Layout
- `clinic-bot-backend/server.js`
- `clinic-bot-backend/services/reminderService.js`
- `clinic-bot-backend/apply_reminder_fixes.js`
- `clinic-bot-backend/controllers/`
- `clinic-bot-backend/tests/`
