-- ============================================================================
-- CLINICABOT SAAS — ESQUEMA MULTI-TENANT PARA ESCALABILIDADE DE MÚLTIPLAS CLÍNICAS
-- ============================================================================
-- Este script adiciona a estrutura de Multi-Tenancy (Multi-Clínicas) no Supabase,
-- permitindo isolamento de dados 100% seguro entre clínicas parceiras.

-- 1. TABELA DE CLÍNICAS (TENANTS)
CREATE TABLE IF NOT EXISTS public.clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    phone_number_id VARCHAR(100) UNIQUE NOT NULL,
    whatsapp_phone VARCHAR(50),
    business_hours JSONB DEFAULT '{"start":"08:00", "end":"18:00"}'::jsonb,
    procedures JSONB DEFAULT '["Consulta Geral / Avaliação", "Limpeza Dental", "Tratamento de Canal", "Implante Dental", "Clareamento Dental", "Ortodontia / Aparelho"]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insere Clínica Modelo Inicial (Dev/Demo)
INSERT INTO public.clinics (name, slug, phone_number_id, whatsapp_phone)
VALUES ('Clínica Modelo Odontológica', 'clinica-modelo', '1240708369119720', '5511979992719')
ON CONFLICT (slug) DO NOTHING;

-- 2. ADICIONA A COLUNA `clinic_id` EM TODAS AS TABELAS DO SISTEMA

-- Tabela Patients
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='clinic_id') THEN
        ALTER TABLE public.patients ADD COLUMN clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Tabela Appointments
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='clinic_id') THEN
        ALTER TABLE public.appointments ADD COLUMN clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Tabela Sessions
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='clinic_id') THEN
        ALTER TABLE public.sessions ADD COLUMN clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Tabela Webhook Inbox
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='webhook_inbox' AND column_name='clinic_id') THEN
        ALTER TABLE public.webhook_inbox ADD COLUMN clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. VINCULA REGISTROS EXISTENTES À CLÍNICA MODELO PADRÃO
UPDATE public.patients 
SET clinic_id = (SELECT id FROM public.clinics WHERE slug = 'clinica-modelo' LIMIT 1)
WHERE clinic_id IS NULL;

UPDATE public.appointments 
SET clinic_id = (SELECT id FROM public.clinics WHERE slug = 'clinica-modelo' LIMIT 1)
WHERE clinic_id IS NULL;

UPDATE public.sessions 
SET clinic_id = (SELECT id FROM public.clinics WHERE slug = 'clinica-modelo' LIMIT 1)
WHERE clinic_id IS NULL;

-- 4. ÍNDICES DE PERFORMANCE MULTI-TENANT
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON public.patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON public.appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_sessions_clinic_id ON public.sessions(clinic_id);
