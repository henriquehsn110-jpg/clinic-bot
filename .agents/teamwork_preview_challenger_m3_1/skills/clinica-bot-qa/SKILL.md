---
name: clinica-bot-qa
description: Comprehensive instructions for executing, auditing, and reporting the 24 automated tests and stress testing for ClinicaBot SaaS Pro.
---

# ClinicaBot SaaS Pro — QA & Security Audit Skill (`clinica-bot-qa`)

This skill defines the complete instructions, execution steps, security standards, and reporting guidelines for quality assurance, automated test suite execution, and security auditing for **ClinicaBot SaaS Pro**.

---

## 1. Overview of Automated Test Suites (Total: 24 Automated Tests + Stress Test)

### 1.1 Overnight Test Suite (`tests/overnight_test_suite.js` - 20 Tests)
- Category A: Frontend & Security Audit (`dashboard.html`)
- Category B: Backend & Business Logic Rules
- Category C: Security, Secrets & LGPD Compliance

### 1.2 Reminders Test Suite (`tests/test_reminders.js` - 4 Tests)
- R1: BRT Date format
- R2: Simulation mode
- R3: Idempotency check
- R4: Automatic reminder schedule

### 1.3 Stress & Load Testing Suite (`tests/stress_test.js` - 100 Requests)
- 100 concurrent asynchronous HTTP requests

---

## 2. Execution Protocol

```bash
node tests/test_tenant_rls_isolation.js
node tests/overnight_test_suite.js
node tests/stress_test.js
```
