-- ============================================================================
-- CLINICABOT SAAS PRO — MIGRATION V15: WEBHOOK INBOX RPC (RETROACTIVE DRIFT FIX)
-- Função aplicada diretamente em produção sem migração correspondente.
-- Recuperada por introspecção em 2026-08-12 durante auditoria de schema para staging.
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_webhook_inbox(p_limit INT DEFAULT 10)
RETURNS SETOF public.webhook_inbox AS $$
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
