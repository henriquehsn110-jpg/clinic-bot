-- ════════════════════════════════════════════════════════════════════════════════
-- CLINICABOT SAAS PRO — MIGRATION V19.1: HARDENING RLS DAS QUATRO TABELAS
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Tabelas-alvo:
-- 1. public.audit_logs
-- 2. public.clinic_holidays
-- 3. public.clinic_hours
-- 4. public.reminder_logs
--
-- Justificativa & Princípio do Menor Privilégio:
-- Todas as 4 tabelas são de uso estritamente interno do backend (databaseService,
-- calendarService, reminderService). Nenhuma operação de frontend anon ou authenticated
-- necessita ou deve possuir permissão direta via PostgREST.
--
-- Estratégia de Defesa em Profundidade (Defense in Depth):
-- 1. Nível DAC (PostgreSQL Privileges):
--    REVOKE ALL ON TABLE ... FROM anon, authenticated, public;
--    GRANT ALL ON TABLE ... TO service_role;
-- 2. Nível Tabela (RLS Enforcement):
--    ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
--    ALTER TABLE ... FORCE ROW LEVEL SECURITY;
-- 3. Nível Política (RLS Explicit Predicates):
--    DROP POLICY antigas/permissivas.
--    CREATE POLICY ... FOR ALL TO service_role
--    USING (auth.role() = 'service_role')
--    WITH CHECK (auth.role() = 'service_role');
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. public.audit_logs
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated, public;
GRANT ALL ON TABLE public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "service_role_all_access_audit_logs" ON public.audit_logs;

CREATE POLICY "service_role_all_access_audit_logs" ON public.audit_logs
    FOR ALL
    TO service_role
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- 2. public.clinic_holidays
REVOKE ALL ON TABLE public.clinic_holidays FROM anon, authenticated, public;
GRANT ALL ON TABLE public.clinic_holidays TO service_role;
ALTER TABLE public.clinic_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_holidays FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access clinic_holidays" ON public.clinic_holidays;
DROP POLICY IF EXISTS "service_role_all_access_clinic_holidays" ON public.clinic_holidays;

CREATE POLICY "service_role_all_access_clinic_holidays" ON public.clinic_holidays
    FOR ALL
    TO service_role
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- 3. public.clinic_hours
REVOKE ALL ON TABLE public.clinic_hours FROM anon, authenticated, public;
GRANT ALL ON TABLE public.clinic_hours TO service_role;
ALTER TABLE public.clinic_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_hours FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access clinic_hours" ON public.clinic_hours;
DROP POLICY IF EXISTS "service_role_all_access_clinic_hours" ON public.clinic_hours;

CREATE POLICY "service_role_all_access_clinic_hours" ON public.clinic_hours
    FOR ALL
    TO service_role
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- 4. public.reminder_logs
REVOKE ALL ON TABLE public.reminder_logs FROM anon, authenticated, public;
GRANT ALL ON TABLE public.reminder_logs TO service_role;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access reminder_logs" ON public.reminder_logs;
DROP POLICY IF EXISTS "service_role_all_access_reminder_logs" ON public.reminder_logs;

CREATE POLICY "service_role_all_access_reminder_logs" ON public.reminder_logs
    FOR ALL
    TO service_role
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- Recarregar cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
