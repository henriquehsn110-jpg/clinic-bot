-- ====================================================================
-- CLINICABOT SAAS PRO — SCHEMA V13: ADMIN SYSTEM & AUDIT LOGS
-- ====================================================================

-- 1. Tabela de Administradores do Sistema (Isolados dos Tenants)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Auditoria de Ações Administrativas (Restart, Rollback, Login)
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL, -- 'RESTART', 'ROLLBACK', 'LOGIN', '2FA_SETUP'
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    result TEXT NOT NULL, -- 'SUCCESS', 'FAILURE'
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. Tabela de Logs de Erros do Sistema (Observabilidade sem PII)
CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    context TEXT NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices de Performance para Consultas de Logs e Auditoria
CREATE INDEX IF NOT EXISTS idx_admin_audit_timestamp ON public.admin_audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_error_timestamp ON public.system_error_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users (email);

-- Desativar RLS para Admin (Acesso restrito ao Service Role / Admin Endpoints)
ALTER TABLE public.admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_error_logs DISABLE ROW LEVEL SECURITY;
