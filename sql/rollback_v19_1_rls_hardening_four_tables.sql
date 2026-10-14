-- ════════════════════════════════════════════════════════════════════════════════
-- CLINICABOT SAAS PRO — ROLLBACK V19.1: HARDENING RLS DAS QUATRO TABELAS
-- ════════════════════════════════════════════════════════════════════════════════
-- Reverte as alterações de hardening RLS aplicadas em migration_v19_1_rls_hardening_four_tables.sql
-- Restaura o estado anterior homologado (V16):
-- - Remove a obrigatoriedade FORCE ROW LEVEL SECURITY (retorna a NO FORCE)
-- - Restaura a política anterior para service_role (USING (auth.role() = 'service_role'))
-- - Preserva service_role com acesso total operacional
-- - NÃO concede privilégios amplos desnecessários para anon ou authenticated
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. public.audit_logs
DROP POLICY IF EXISTS "service_role_all_access_audit_logs" ON public.audit_logs;
ALTER TABLE public.audit_logs NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role full access audit_logs" ON public.audit_logs;
CREATE POLICY "Allow service_role full access audit_logs" ON public.audit_logs
    FOR ALL TO service_role USING (auth.role() = 'service_role');
GRANT ALL ON TABLE public.audit_logs TO service_role;

-- 2. public.clinic_holidays
DROP POLICY IF EXISTS "service_role_all_access_clinic_holidays" ON public.clinic_holidays;
ALTER TABLE public.clinic_holidays NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role full access clinic_holidays" ON public.clinic_holidays;
CREATE POLICY "Allow service_role full access clinic_holidays" ON public.clinic_holidays
    FOR ALL TO service_role USING (auth.role() = 'service_role');
GRANT ALL ON TABLE public.clinic_holidays TO service_role;

-- 3. public.clinic_hours
DROP POLICY IF EXISTS "service_role_all_access_clinic_hours" ON public.clinic_hours;
ALTER TABLE public.clinic_hours NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role full access clinic_hours" ON public.clinic_hours;
CREATE POLICY "Allow service_role full access clinic_hours" ON public.clinic_hours
    FOR ALL TO service_role USING (auth.role() = 'service_role');
GRANT ALL ON TABLE public.clinic_hours TO service_role;

-- 4. public.reminder_logs
DROP POLICY IF EXISTS "service_role_all_access_reminder_logs" ON public.reminder_logs;
ALTER TABLE public.reminder_logs NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service_role full access reminder_logs" ON public.reminder_logs;
CREATE POLICY "Allow service_role full access reminder_logs" ON public.reminder_logs
    FOR ALL TO service_role USING (auth.role() = 'service_role');
GRANT ALL ON TABLE public.reminder_logs TO service_role;

-- Recarregar cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
