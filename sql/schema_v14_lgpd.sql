-- ============================================================================
-- CLINICABOT SAAS — UPGRADE V14: LGPD PURGE & DIREITO AO ESQUECIMENTO
-- ============================================================================

-- Adiciona a coluna lgpd_purged_at na tabela patients
-- Quando preenchida, indica que o paciente exerceu seu direito ao esquecimento
-- e seus dados foram anonimizados irreversivelmente.

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='lgpd_purged_at') THEN
        ALTER TABLE public.patients ADD COLUMN lgpd_purged_at TIMESTAMPTZ DEFAULT NULL;
    END IF;
END $$;
