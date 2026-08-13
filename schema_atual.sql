-- ============================================================================
-- CLINICABOT SAAS PRO — SCHEMA COMPLETO DO BANCO DE DADOS (ESTRUTURA COMPLETA)
-- Pode ser executado diretamente no SQL Editor do Supabase para criar o ambiente Staging
-- ============================================================================

-- 1. TABELA PRINCIPAL DE CLÍNICAS (TENANTS)
CREATE TABLE IF NOT EXISTS public.clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    phone_number_id VARCHAR(100),
    whatsapp_token TEXT,
    whatsapp_phone VARCHAR(50),
    address TEXT,
    work_hours TEXT,
    business_hours JSONB DEFAULT '{"start":"08:00", "end":"18:00"}'::jsonb,
    procedures JSONB DEFAULT '["Consulta Geral / Avaliação", "Limpeza Dental", "Tratamento de Canal", "Implante Dental", "Clareamento Dental", "Ortodontia / Aparelho"]'::jsonb,
    eval_price NUMERIC(10,2) DEFAULT 150.00,
    whatsapp_list_title VARCHAR(50) DEFAULT 'Tratamentos',
    plan_type VARCHAR(50) DEFAULT 'pro',
    subscription_status VARCHAR(50) DEFAULT 'active',
    monthly_booking_limit INT DEFAULT 500,
    monthly_booking_count INT DEFAULT 0,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    whatsapp_status VARCHAR(50) DEFAULT 'connected',
    last_billing_date TIMESTAMP WITH TIME ZONE,
    terms_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA DE PACIENTES
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    phone VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    cpf TEXT,
    cpf_hash TEXT,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    lgpd_purged_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE PROFISSIONAIS (MÉDICOS/DENTISTAS)
CREATE TABLE IF NOT EXISTS public.doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABELA DE AGENDAMENTOS
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABELA DE SESSÕES DO WHATSAPP (ESTADO FSM)
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    phone VARCHAR(50) NOT NULL,
    history JSONB DEFAULT '[]'::jsonb,
    draft JSONB DEFAULT '{}'::jsonb,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABELAS DE CONFIGURAÇÃO DE HORÁRIOS DA CLÍNICA E PROFISSIONAIS
CREATE TABLE IF NOT EXISTS public.clinic_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    available_slots JSONB NOT NULL DEFAULT '["08:00","09:00","10:00","11:00","14:00","15:00","16:00","17:00"]'::jsonb,
    CONSTRAINT clinic_hours_day_key UNIQUE (clinic_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.doctor_business_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    available_slots JSONB NOT NULL DEFAULT '["08:00","09:00","10:00","11:00","14:00","15:00","16:00","17:00"]'::jsonb,
    CONSTRAINT doctor_hours_day_key UNIQUE (doctor_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.clinic_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    reason VARCHAR(255),
    CONSTRAINT clinic_holidays_date_key UNIQUE (clinic_id, holiday_date)
);

-- 7. TABELAS DE AUDITORIA, LOGS E SEGURANÇA
CREATE TABLE IF NOT EXISTS public.reminder_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
    message_id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    error_log TEXT,
    processing_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(20) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    changes JSONB NOT NULL,
    user_id UUID,
    ip_address INET,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    result TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    stripe_invoice_id VARCHAR(255),
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'BRL',
    status VARCHAR(50) NOT NULL,
    plan_type VARCHAR(50) NOT NULL,
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lgpd_deletion_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    patient_phone_masked VARCHAR(50) NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    anonymized_at TIMESTAMPTZ DEFAULT NOW(),
    audit_hash VARCHAR(255) NOT NULL
);

-- 8. ÍNDICES DE PERFORMANCE E UNICIDADE
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON public.patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_not_deleted ON public.patients(clinic_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_cpf_clinic ON public.patients(cpf_hash, clinic_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON public.appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date ON public.appointments(clinic_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_status ON public.appointments(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_clinic_id ON public.sessions(clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS reminder_logs_appt_date_key ON public.reminder_logs(appointment_id, (sent_at::date));
CREATE INDEX IF NOT EXISTS idx_reminder_clinic_date ON public.reminder_logs(clinic_id, (sent_at::date));
CREATE INDEX IF NOT EXISTS idx_holidays_clinic_date ON public.clinic_holidays(clinic_id, holiday_date);
CREATE INDEX IF NOT EXISTS idx_saas_subs_clinic ON public.saas_subscriptions(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lgpd_deletion_clinic ON public.lgpd_deletion_logs(clinic_id, anonymized_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_status_created ON public.webhook_inbox(status, created_at);

-- 9. FUNÇÕES / RPCs DO SISTEMA (COM SEARCH_PATH PROTEGIDO - LINT 0011)
CREATE OR REPLACE FUNCTION public.merge_session_draft_multitenant(
    p_phone TEXT,
    p_clinic_id UUID,
    p_draft JSONB
) RETURNS void
SET search_path = ''
AS $$
BEGIN
    UPDATE public.sessions
    SET draft = COALESCE(draft, '{}'::jsonb) || p_draft,
        last_activity = NOW()
    WHERE phone = p_phone AND clinic_id = p_clinic_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.claim_webhook_inbox(p_limit INT DEFAULT 10)
RETURNS SETOF public.webhook_inbox
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.webhook_inbox
    SET status = 'processing',
        processing_at = NOW()
    WHERE id IN (
        SELECT id
        FROM public.webhook_inbox
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- 10. ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO PROTEGIDAS (LINT 0024)
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgpd_deletion_logs ENABLE ROW LEVEL SECURITY;

-- Desativa RLS para tabelas administrativas internas (acesso exclusivo service_role/admin)
ALTER TABLE public.admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log DISABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS RESTRITAS AO SERVICE_ROLE
DO $$
BEGIN
    -- 1. Base Tenant Tables
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_access' AND tablename = 'patients') THEN
        CREATE POLICY "service_role_full_access" ON public.patients FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_access' AND tablename = 'appointments') THEN
        CREATE POLICY "service_role_full_access" ON public.appointments FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_access' AND tablename = 'sessions') THEN
        CREATE POLICY "service_role_full_access" ON public.sessions FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;

    -- 2. Audit & Logs Tables
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access audit_logs' AND tablename = 'audit_logs') THEN
        CREATE POLICY "Allow service_role full access audit_logs" ON public.audit_logs FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access reminder_logs' AND tablename = 'reminder_logs') THEN
        CREATE POLICY "Allow service_role full access reminder_logs" ON public.reminder_logs FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;

    -- 3. Settings & Schedules Tables
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access clinic_hours' AND tablename = 'clinic_hours') THEN
        CREATE POLICY "Allow service_role full access clinic_hours" ON public.clinic_hours FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access clinic_holidays' AND tablename = 'clinic_holidays') THEN
        CREATE POLICY "Allow service_role full access clinic_holidays" ON public.clinic_holidays FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;

    -- 4. Doctors & Schedules Tables
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access doctors' AND tablename = 'doctors') THEN
        CREATE POLICY "Allow service_role full access doctors" ON public.doctors FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access doctor_business_hours' AND tablename = 'doctor_business_hours') THEN
        CREATE POLICY "Allow service_role full access doctor_business_hours" ON public.doctor_business_hours FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;

    -- 5. SaaS & Compliance Tables
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access saas_subscriptions' AND tablename = 'saas_subscriptions') THEN
        CREATE POLICY "Allow service_role full access saas_subscriptions" ON public.saas_subscriptions FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access lgpd_deletion_logs' AND tablename = 'lgpd_deletion_logs') THEN
        CREATE POLICY "Allow service_role full access lgpd_deletion_logs" ON public.lgpd_deletion_logs FOR ALL TO service_role USING (auth.role() = 'service_role');
    END IF;
END $$;
