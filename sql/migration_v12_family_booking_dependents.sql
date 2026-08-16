-- ============================================================================
-- Migration v12: Persistência Permanente de Dependentes (FAMILY_BOOKING)
-- ClinicaBot SaaS Pro
-- ============================================================================

-- 1. Adicionar coluna guardian_id referenciando o titular na tabela patients
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS guardian_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;

-- 2. Remover constraints/índices legados de unicidade de telefone em patients
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_phone_clinic_id_key;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_phone_clinic_unique;
DROP INDEX IF EXISTS public.patients_phone_clinic_unique CASCADE;
DROP INDEX IF EXISTS public.uq_patients_phone_clinic CASCADE;
DROP INDEX IF EXISTS public.uq_patients_guardian_phone CASCADE;

-- 3. Criar índice único parcial: apenas titulares (guardian_id IS NULL) exigem telefone único por clínica
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_guardian_phone 
ON public.patients (phone, clinic_id) 
WHERE guardian_id IS NULL AND deleted_at IS NULL;

-- 4. Criar índice para busca rápida de dependentes por titular
CREATE INDEX IF NOT EXISTS idx_patients_guardian_lookup 
ON public.patients (guardian_id, clinic_id) 
WHERE guardian_id IS NOT NULL AND deleted_at IS NULL;

-- 5. Notificar PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
