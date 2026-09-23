-- ============================================================================
-- ClinicaBot SaaS Pro — Migration v18: Multi-Doctor Active Slot Protection
-- ============================================================================

-- 1. Auditoria prévia de integridade: aborta se houver agendamentos ativos com doctor_id NULL ou colisões
DO $$
DECLARE
    null_doc_count integer;
    duplicate_count integer;
BEGIN
    SELECT count(*) INTO null_doc_count
    FROM public.appointments
    WHERE deleted_at IS NULL
      AND status IN ('pending', 'confirmed')
      AND doctor_id IS NULL;

    IF null_doc_count > 0 THEN
        RAISE EXCEPTION 'MIGRAÇÃO ABORTADA: Existem % agendamento(s) ativo(s) com doctor_id NULL. Execute o saneamento antes de aplicar a nova regra.', null_doc_count;
    END IF;

    SELECT count(*) INTO duplicate_count
    FROM (
        SELECT clinic_id, doctor_id, appointment_date, appointment_time
        FROM public.appointments
        WHERE deleted_at IS NULL
          AND status IN ('pending', 'confirmed')
          AND doctor_id IS NOT NULL
        GROUP BY clinic_id, doctor_id, appointment_date, appointment_time
        HAVING count(*) > 1
    ) dup;

    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'MIGRAÇÃO ABORTADA: Existem % colisões por (clinic_id, doctor_id, appointment_date, appointment_time).', duplicate_count;
    END IF;
END $$;

-- 2. Remove o índice/constraint antigo que bloqueava múltiplos médicos no mesmo horário
DROP INDEX IF EXISTS public.uq_appointments_clinic_active_slot;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS uq_appointments_clinic_active_slot;

-- 3. Cria a nova constraint única isolada por clínica E por profissional
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_clinic_doctor_active_slot
ON public.appointments (clinic_id, doctor_id, appointment_date, appointment_time)
WHERE deleted_at IS NULL AND status IN ('pending', 'confirmed') AND doctor_id IS NOT NULL;

-- 4. Impede que novos agendamentos ativos sejam persistidos com doctor_id NULL
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS chk_appointments_active_doctor_not_null;

ALTER TABLE public.appointments
ADD CONSTRAINT chk_appointments_active_doctor_not_null
CHECK (
    (status NOT IN ('pending', 'confirmed') OR deleted_at IS NOT NULL)
    OR doctor_id IS NOT NULL
);

-- 5. Função de inspeção para auditoria remota via PostgREST/RPC
CREATE OR REPLACE FUNCTION public.check_active_slot_indexes()
RETURNS TABLE (
    indexname name,
    indexdef text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'appointments' 
      AND (indexname LIKE '%slot%' OR indexname LIKE '%active%');
$$;

-- 6. Recarrega o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
