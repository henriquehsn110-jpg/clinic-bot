---
name: clinica-bot-qa
description: Comprehensive instructions for executing, auditing, and reporting the 24 automated tests and stress testing for ClinicaBot SaaS Pro.
---

# ClinicaBot SaaS Pro — QA & Security Audit Skill (`clinica-bot-qa`)

This skill defines the complete instructions, execution steps, security standards, and reporting guidelines for quality assurance, automated test suite execution, and security auditing for **ClinicaBot SaaS Pro**.

---

## 1. Overview of Automated Test Suites (Total: 24 Automated Tests + Stress Test)

### 1.1 Overnight Test Suite (`tests/overnight_test_suite.js` - 20 Tests)
### 1.2 Reminders Test Suite (`tests/test_reminders.js` - 4 Tests)
### 1.3 Stress & Load Testing Suite (`tests/stress_test.js` - 100 Requests)
- Simulates 100 concurrent asynchronous HTTP requests (50% `/api/simulate` and 50% `/api/dashboard/data`).
- Evaluates HTTP 200 success rate (must be 100%), total execution duration, request throughput (req/sec), average latency, and database pool stability under load.

---

## 2. Execution Protocol

```bash
node tests/stress_test.js
```
