-- ==============================================================================
-- 🚀 CLINICABOT SAAS PRO (SCHEMA COMPLETO & BLINDADO V10.0)
-- Executa a criação e migração completa de todas as tabelas, índices e RLS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Tabela Principal de Clínicas (Multi-Tenant Core)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  phone_number_id VARCHAR(100),
  whatsapp_token TEXT,
  address TEXT,
  work_hours TEXT,
  eval_price NUMERIC(10,2) DEFAULT 150.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserção da Clínica Modelo padrão para testes se não existir
INSERT INTO clinics (name, slug)
VALUES ('Clínica Modelo', 'clinica-modelo')
ON CONFLICT (slug) DO NOTHING;

-- Garantia de Colunas Multi-Tenant em tabelas existentes
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(100);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_token TEXT;

-- ------------------------------------------------------------------------------
-- 1. Tabelas Existentes com Suporte Multi-Tenant & Soft Delete
-- ------------------------------------------------------------------------------
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE webhook_inbox ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- ------------------------------------------------------------------------------
-- 2. Performance Multi-Tenant: Índices Compostos (P1)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date ON appointments(clinic_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_status ON appointments(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_patient_created ON conversations(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_status_created ON webhook_inbox(status, created_at);

-- Otimiza busca excluindo registros com soft-delete
CREATE INDEX IF NOT EXISTS idx_patients_clinic_not_deleted ON patients(clinic_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 3. Auditoria de Dados Sensíveis (P2 - LGPD)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'RESTORE'
  entity_type VARCHAR(50) NOT NULL, -- 'PATIENT', 'APPOINTMENT', etc.
  entity_id UUID NOT NULL,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  changes JSONB NOT NULL,
  user_id UUID,
  ip_address INET,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_clinic_timestamp ON audit_logs(clinic_id, timestamp DESC);

-- ------------------------------------------------------------------------------
-- 4. Durabilidade de Lembretes (P5)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índice Único por Expressão de Data (Garante 1 lembrete por agendamento por dia no PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS reminder_logs_appt_date_key ON reminder_logs(appointment_id, (sent_at::date));
CREATE INDEX IF NOT EXISTS idx_reminder_clinic_date ON reminder_logs(clinic_id, (sent_at::date));

-- ------------------------------------------------------------------------------
-- 5. Atualização da RPC Multi-Tenant (Segurança P3)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_session_draft_multitenant(
  p_phone TEXT,
  p_clinic_id UUID,
  p_draft JSONB
) RETURNS void AS $$
BEGIN
  UPDATE sessions
  SET draft = COALESCE(draft, '{}'::jsonb) || p_draft,
      last_activity = NOW()
  WHERE phone = p_phone AND clinic_id = p_clinic_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 6. Unicidade de CPF por Clínica (Segurança Multi-Tenant)
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_cpf_clinic ON patients(cpf_hash, clinic_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 7. Configurações Dinâmicas de Horários e Feriados por Clínica (P14/P15)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinic_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domingo, 6=Sábado
  available_slots JSONB NOT NULL DEFAULT '["08:00","09:00","10:00","11:00","14:00","15:00","16:00","17:00"]'::jsonb,
  CONSTRAINT clinic_hours_day_key UNIQUE (clinic_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS clinic_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  reason VARCHAR(255),
  CONSTRAINT clinic_holidays_date_key UNIQUE (clinic_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_clinic_date ON clinic_holidays(clinic_id, holiday_date);

-- ------------------------------------------------------------------------------
-- 8. Ativação de RLS (Row Level Security) para Proteção de Dados (LGPD)
-- ------------------------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_holidays ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Total para o Service Role do Backend (Node.js)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access audit_logs') THEN
        CREATE POLICY "Allow service_role full access audit_logs" ON audit_logs FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access reminder_logs') THEN
        CREATE POLICY "Allow service_role full access reminder_logs" ON reminder_logs FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access clinic_hours') THEN
        CREATE POLICY "Allow service_role full access clinic_hours" ON clinic_hours FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access clinic_holidays') THEN
        CREATE POLICY "Allow service_role full access clinic_holidays" ON clinic_holidays FOR ALL USING (true);
    END IF;
END $$;
