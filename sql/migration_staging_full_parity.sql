-- ================================================================
-- MIGRATION DE PARIDADE COMPLETA PARA STAGING (CLINICABOT SAAS PRO)
-- Projeto: clinicabot-staging (eywcowvwgccslqfnxaws)
-- ================================================================

-- 1. FIX DE CONCORRÊNCIA E ÍNDICE PARCIAL DE APPOINTMENTS (MULTI-TENANT ISOLATION)
DROP INDEX IF EXISTS public.appointments_active_slot_unique CASCADE;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_active_slot_unique CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_clinic_active_slot 
ON public.appointments (clinic_id, appointment_date, appointment_time) 
WHERE deleted_at IS NULL AND status IN ('pending', 'confirmed');

-- 2. SUPORTE A DEPENDENTES E VÍNCULO FAMILIAR (FAMILY_BOOKING / GUARDIAN_ID)
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS guardian_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.patients_phone_clinic_unique CASCADE;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_phone_clinic_unique CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_guardian_phone 
ON public.patients (phone, clinic_id) 
WHERE guardian_id IS NULL AND deleted_at IS NULL;

-- 3. RECARREGA CACHE DE SCHEMA NO POSTGREST
NOTIFY pgrst, 'reload schema';
