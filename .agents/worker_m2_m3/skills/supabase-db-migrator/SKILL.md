---
name: supabase-db-migrator
description: Diretrizes para criação, migração e auditoria do schema Multi-Tenant com Row Level Security (RLS) no Supabase para o ClinicaBot SaaS Pro.
---

# 🗄️ ClinicaBot — Supabase DB Migrator Skill (`supabase-db-migrator`)

Esta skill estabelece os procedimentos para manipulação de banco de dados PostgreSQL/Supabase, criação de tabelas multi-tenant e aplicação de políticas de **Row Level Security (RLS)** no **ClinicaBot SaaS Pro**.

---

## 1. Arquitetura Multi-Tenant & RLS

### 1.1 Tabelas Core
- **`clinics`**: ID da clínica, slug, nome e configurações de atendimento.
- **`patients`**: Registro de pacientes com `cpf_encrypted` (AES-256-GCM), `cpf_hash` e `cpf_masked`.
- **`appointments`**: Agendamentos vinculados a `clinic_id` e `patient_id` com horários padronizados em ISO/BRT.
- **`webhook_logs` & `webhook_inbox`**: Fila durável de mensagens com idempotência garantida por chave única `23505`.

### 1.2 Regras de Isolação RLS
- Toda query enviada pela API do Dashboard deve incluir o filtro por `clinic_id`.
- Nenhuma clínica pode acessar agendamentos ou pacientes de outra organização.

---

## 2. Comandos & Scripts de Banco

```bash
# Script de validação de schema e tabelas
node clinic-bot-backend/check_schema.js

# Script de migração e re-criptografia segura de CPFs
node clinic-bot-backend/migrate_cpf.js
```
