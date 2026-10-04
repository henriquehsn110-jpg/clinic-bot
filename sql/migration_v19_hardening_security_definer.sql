-- ════════════════════════════════════════════════════════════════════════════════
-- MIGRATION: HARDENING SECURITY DEFINER FUNCTIONS (STAGING / PROD)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Alvos:
-- 1. public.get_dashboard_data
-- 2. public.check_active_slot_indexes
--
-- Correções de Segurança:
-- - Imutabilidade de search_path: SET search_path = public, pg_temp
-- - Revogação de privilégios de execução públicos e não autorizados (PUBLIC, anon, authenticated)
-- - Concessão estrita de execução exclusivamente para service_role
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. public.get_dashboard_data
CREATE OR REPLACE FUNCTION public.get_dashboard_data(
    p_clinic_id UUID,
    p_limit INT,
    p_offset INT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clinic jsonb;
    v_appointments jsonb;
    v_patients jsonb;
    v_sessions jsonb;
BEGIN
    -- 1. Clinic (retorna 1 objeto ou null se não encontrar)
    SELECT to_jsonb(c) INTO v_clinic
    FROM (
        SELECT id, name, slug, whatsapp_list_title, work_hours, address, eval_price
        FROM public.clinics
        WHERE id = p_clinic_id
    ) c;

    -- 2. Appointments com join na tabela patients (retorna array)
    SELECT COALESCE(jsonb_agg(a), '[]'::jsonb) INTO v_appointments
    FROM (
        SELECT 
            app.*,
            (
                SELECT jsonb_build_object(
                    'id', p.id,
                    'name', p.name,
                    'phone', p.phone,
                    'cpf', p.cpf
                )
                FROM public.patients p
                WHERE p.id = app.patient_id
            ) as patients
        FROM public.appointments app
        WHERE app.clinic_id = p_clinic_id 
          AND app.deleted_at IS NULL
        ORDER BY app.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) a;

    -- 3. Patients (retorna array)
    SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) INTO v_patients
    FROM (
        SELECT id, name, phone, cpf, created_at
        FROM public.patients
        WHERE clinic_id = p_clinic_id 
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) p;

    -- 4. Sessions (retorna array, limitando apenas por clinic_id)
    SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) INTO v_sessions
    FROM (
        SELECT id, phone, history
        FROM public.sessions
        WHERE clinic_id = p_clinic_id 
          AND deleted_at IS NULL
    ) s;

    -- Retornar um único objeto JSON combinando as 4 entidades
    RETURN jsonb_build_object(
        'clinic', v_clinic,
        'appointments', v_appointments,
        'patients', v_patients,
        'sessions', v_sessions
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_data(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_data(UUID, INT, INT) TO service_role;


-- 2. public.check_active_slot_indexes
CREATE OR REPLACE FUNCTION public.check_active_slot_indexes()
RETURNS TABLE (
    indexname name,
    indexdef text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'appointments' 
      AND (indexname LIKE '%slot%' OR indexname LIKE '%active%');
$$;

REVOKE ALL ON FUNCTION public.check_active_slot_indexes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_active_slot_indexes() TO service_role;

NOTIFY pgrst, 'reload schema';
