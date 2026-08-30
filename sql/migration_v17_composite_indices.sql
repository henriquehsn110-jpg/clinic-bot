-- =====================================================================
-- MIGRATION V17 — ÍNDICES COMPOSTOS DE COBERTURA PARA DASHBOARD (PROMPT 8)
-- Ambiente: STAGING (eywcowvwgccslqfnxaws)
-- =====================================================================

-- 1. Pré-voo: Verificar índices existentes em created_at
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('appointments', 'patients') 
  AND indexdef LIKE '%created_at%';

-- 2. Criação do Índice Composto de Agendamentos (Filtro clinic_id + Ordenação created_at DESC)
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_created_desc 
ON public.appointments (clinic_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- 3. Criação do Índice Composto de Pacientes (Filtro clinic_id + Ordenação created_at DESC)
CREATE INDEX IF NOT EXISTS idx_patients_clinic_created_desc 
ON public.patients (clinic_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- 4. Confirmação pós-criação
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE indexname IN ('idx_appointments_clinic_created_desc', 'idx_patients_clinic_created_desc');
