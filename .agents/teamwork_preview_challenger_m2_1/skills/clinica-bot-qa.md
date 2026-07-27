---
name: clinica-bot-qa
description: Comprehensive instructions for executing, auditing, and reporting the 24 automated tests and stress testing for ClinicaBot SaaS Pro.
---

# ClinicaBot SaaS Pro — QA & Security Audit Skill (`clinica-bot-qa`)

This skill defines the complete instructions, execution steps, security standards, and reporting guidelines for quality assurance, automated test suite execution, and security auditing for **ClinicaBot SaaS Pro**.

---

## 1. Overview of Automated Test Suites (Total: 24 Automated Tests + Stress Test)

### 1.1 Overnight Test Suite (`tests/overnight_test_suite.js` - 20 Tests)
- Category A: Frontend & Security Audit (`dashboard.html`) - 8 tests (A1-A8)
- Category B: Backend & Business Logic Rules - 8 tests (B1-B8)
- Category C: Security, Secrets & LGPD Compliance - 4 tests (C1-C4)

### 1.2 Reminders Test Suite (`tests/test_reminders.js` - 4 Tests)
- R1-R4

### 1.3 Stress & Load Testing Suite (`tests/stress_test.js` - 100 Requests)
