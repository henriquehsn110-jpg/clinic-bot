-- ============================================================================
-- CLINICABOT SAAS PRO — MIGRATION V16: SECURITY HARDENING (SUPABASE LINTER)
-- Corrige os 10 avisos de segurança detectados pelo Consultor do Supabase:
-- 1. 6 Funções: Define `SET search_path = ''` para evitar Search Path Hijacking (lint 0011).
-- 2. 4 Políticas RLS: Altera `USING (true)` para `TO service_role USING (auth.role() = 'service_role')`
--    para evitar bypass indevido de segurança por clientes anônimos (lint 0024).
-- ============================================================================

-- 1. CORREÇÃO DE SEARCH_PATH NAS FUNÇÕES (LINT 0011)

-- 1.1 merge_session_draft_multitenant
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

-- 1.2 claim_webhook_inbox
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

-- 1.3 Funções utilitárias legadas caso existam no banco
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
        ALTER FUNCTION public.update_updated_at() SET search_path = '';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_expired_sessions') THEN
        ALTER FUNCTION public.cleanup_expired_sessions() SET search_path = '';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merge_session_draft') THEN
        ALTER FUNCTION public.merge_session_draft(text, jsonb) SET search_path = '';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_webhook_tables') THEN
        ALTER FUNCTION public.cleanup_webhook_tables() SET search_path = '';
    END IF;
END $$;

-- 2. CORREÇÃO DE POLÍTICAS RLS PERMISSIVAS (LINT 0024)

DROP POLICY IF EXISTS "Allow service_role full access audit_logs" ON public.audit_logs;
CREATE POLICY "Allow service_role full access audit_logs" ON public.audit_logs
    FOR ALL TO service_role USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access reminder_logs" ON public.reminder_logs;
CREATE POLICY "Allow service_role full access reminder_logs" ON public.reminder_logs
    FOR ALL TO service_role USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access clinic_hours" ON public.clinic_hours;
CREATE POLICY "Allow service_role full access clinic_hours" ON public.clinic_hours
    FOR ALL TO service_role USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access clinic_holidays" ON public.clinic_holidays;
CREATE POLICY "Allow service_role full access clinic_holidays" ON public.clinic_holidays
    FOR ALL TO service_role USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access doctors" ON public.doctors;
CREATE POLICY "Allow service_role full access doctors" ON public.doctors
    FOR ALL TO service_role USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access doctor_business_hours" ON public.doctor_business_hours;
CREATE POLICY "Allow service_role full access doctor_business_hours" ON public.doctor_business_hours
    FOR ALL TO service_role USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access saas_subscriptions" ON public.saas_subscriptions;
CREATE POLICY "Allow service_role full access saas_subscriptions" ON public.saas_subscriptions
    FOR ALL TO service_role USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access lgpd_deletion_logs" ON public.lgpd_deletion_logs;
CREATE POLICY "Allow service_role full access lgpd_deletion_logs" ON public.lgpd_deletion_logs
    FOR ALL TO service_role USING (auth.role() = 'service_role');
