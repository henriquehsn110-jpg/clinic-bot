-- ════════════════════════════════════════════════════════════════════════════════
-- MIGRATION V19: DISTRIBUTED SESSION LOCKS, WEBHOOK IDEMPOTENCY & EXTERNAL EFFECTS
-- ════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1: TABELA SESSION_LOCKS, SESSIONS MULTI-TENANT E RPCs DE SESSÃO
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_locks (
    clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    phone text NOT NULL,
    lock_id uuid NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clinic_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_session_locks_expires_at
ON public.session_locks (expires_at);

-- RLS & Hardening de Segurança em session_locks
ALTER TABLE public.session_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.session_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.session_locks TO service_role;

DROP POLICY IF EXISTS "service_role_session_locks" ON public.session_locks;
CREATE POLICY "service_role_session_locks" ON public.session_locks
    FOR ALL USING (auth.role() = 'service_role');

-- Prepara a tabela Sessions para o ON CONFLICT multi-tenant e updated_at
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_phone_key;
DROP INDEX IF EXISTS public.sessions_phone_key;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.sessions
        WHERE clinic_id IS NULL
    ) THEN
        RAISE EXCEPTION 'V19 abortada: existem sessions com clinic_id NULL';
    END IF;
END;
$$;

ALTER TABLE public.sessions
ALTER COLUMN clinic_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_clinic_phone ON public.sessions (clinic_id, phone);

-- 1.1 Aquisição atômica de lock de sessão
CREATE OR REPLACE FUNCTION public.acquire_session_lock(
    p_clinic_id uuid,
    p_phone text,
    p_lock_id uuid,
    p_ttl_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_acquired_id uuid;
BEGIN
    IF p_lock_id IS NULL THEN RAISE EXCEPTION 'p_lock_id não pode ser NULL'; END IF;
    IF p_ttl_seconds < 5 OR p_ttl_seconds > 300 THEN RAISE EXCEPTION 'p_ttl_seconds entre 5 e 300'; END IF;

    INSERT INTO public.session_locks (clinic_id, phone, lock_id, expires_at, created_at, updated_at)
    VALUES (p_clinic_id, p_phone, p_lock_id, clock_timestamp() + make_interval(secs => p_ttl_seconds), now(), now())
    ON CONFLICT (clinic_id, phone) DO UPDATE
    SET lock_id    = p_lock_id,
        expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
        updated_at = now()
    WHERE public.session_locks.expires_at < clock_timestamp()
    RETURNING public.session_locks.lock_id INTO v_acquired_id;

    RETURN (v_acquired_id = p_lock_id);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_session_lock(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_session_lock(uuid, text, uuid, integer) TO service_role;

-- 1.2 Renovação atômica (Heartbeat) de lock de sessão
CREATE OR REPLACE FUNCTION public.renew_session_lock(
    p_clinic_id uuid,
    p_phone text,
    p_lock_id uuid,
    p_ttl_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_lock_id IS NULL THEN RAISE EXCEPTION 'p_lock_id não pode ser NULL'; END IF;
    IF p_ttl_seconds < 5 OR p_ttl_seconds > 300 THEN RAISE EXCEPTION 'p_ttl_seconds entre 5 e 300'; END IF;

    UPDATE public.session_locks
    SET expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
        updated_at = now()
    WHERE clinic_id = p_clinic_id
      AND phone    = p_phone
      AND lock_id  = p_lock_id
      AND expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_session_lock(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_session_lock(uuid, text, uuid, integer) TO service_role;

-- 1.3 Liberação segura de lock de sessão
CREATE OR REPLACE FUNCTION public.release_session_lock(
    p_clinic_id uuid,
    p_phone text,
    p_lock_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_lock_id IS NULL THEN RAISE EXCEPTION 'p_lock_id não pode ser NULL'; END IF;

    DELETE FROM public.session_locks
    WHERE clinic_id = p_clinic_id
      AND phone    = p_phone
      AND lock_id  = p_lock_id;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.release_session_lock(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_session_lock(uuid, text, uuid) TO service_role;

-- 1.4 Persistência atômica do estado da FSM (Anti-TOCTOU com FOR UPDATE)
CREATE OR REPLACE FUNCTION public.persist_session_state_if_lock_owned(
    p_clinic_id uuid,
    p_phone text,
    p_lock_id uuid,
    p_history jsonb,
    p_draft jsonb,
    p_last_activity timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lock_row public.session_locks%ROWTYPE;
BEGIN
    IF p_lock_id IS NULL THEN RAISE EXCEPTION 'p_lock_id não pode ser NULL'; END IF;

    SELECT * INTO v_lock_row
    FROM public.session_locks
    WHERE clinic_id = p_clinic_id
      AND phone    = p_phone
    FOR UPDATE;

    IF NOT FOUND OR v_lock_row.lock_id != p_lock_id OR v_lock_row.expires_at < clock_timestamp() THEN
        RETURN false;
    END IF;

    INSERT INTO public.sessions (clinic_id, phone, history, draft, last_activity, updated_at)
    VALUES (p_clinic_id, p_phone, p_history, p_draft, p_last_activity, now())
    ON CONFLICT (clinic_id, phone) DO UPDATE
    SET history       = p_history,
        draft         = p_draft,
        last_activity = p_last_activity,
        updated_at    = now(),
        deleted_at    = NULL;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_session_state_if_lock_owned(uuid, text, uuid, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_session_state_if_lock_owned(uuid, text, uuid, jsonb, jsonb, timestamptz) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: WEBHOOK_LOGS COM FENCING TOKEN, LEASE, RETRY & ANTI-CRASH-LOOP
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.webhook_logs
ADD COLUMN IF NOT EXISTS status varchar(30) NOT NULL DEFAULT 'received',
ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS processing_token uuid,
ADD COLUMN IF NOT EXISTS processing_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
ADD COLUMN IF NOT EXISTS error_log text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_status_retry
ON public.webhook_logs (status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_processing_token
ON public.webhook_logs (processing_token) WHERE processing_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_processing_expires
ON public.webhook_logs (processing_expires_at) WHERE status = 'processing';

-- Preserva a semântica legada:
-- qualquer registro existente em webhook_logs já era considerado processado.
UPDATE public.webhook_logs
SET
    status = 'completed',
    completed_at = COALESCE(completed_at, created_at, now()),
    updated_at = COALESCE(updated_at, created_at, now()),
    attempt_count = GREATEST(attempt_count, 1)
WHERE status = 'received'
  AND processing_token IS NULL
  AND processing_expires_at IS NULL;

-- 2.1 Claim de mensagem de webhook com proteção contra loop de crash
CREATE OR REPLACE FUNCTION public.claim_webhook_message(
    p_message_id text,
    p_clinic_id uuid,
    p_phone text,
    p_processing_token uuid,
    p_max_retries integer DEFAULT 3,
    p_processing_ttl_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.webhook_logs%ROWTYPE;
BEGIN
    IF p_processing_token IS NULL THEN RAISE EXCEPTION 'p_processing_token não pode ser NULL'; END IF;
    IF p_max_retries < 1 OR p_max_retries > 20 THEN RAISE EXCEPTION 'p_max_retries entre 1 e 20'; END IF;
    IF p_processing_ttl_seconds < 5 OR p_processing_ttl_seconds > 300 THEN RAISE EXCEPTION 'p_processing_ttl entre 5 e 300'; END IF;

    -- Primeira tentativa atômica (INSERT ON CONFLICT DO NOTHING)
    INSERT INTO public.webhook_logs
        (message_id, clinic_id, phone, status, processing_token, processing_expires_at, attempt_count, retry_count, updated_at)
    VALUES
        (p_message_id, p_clinic_id, p_phone, 'processing', p_processing_token, clock_timestamp() + make_interval(secs => p_processing_ttl_seconds), 1, 0, now())
    ON CONFLICT (message_id) DO NOTHING;

    IF FOUND THEN
        RETURN jsonb_build_object('status', 'CLAIMED', 'processing_token', p_processing_token);
    END IF;

    -- Linha já existe: bloqueia com FOR UPDATE para evitar race condition
    SELECT * INTO v_row FROM public.webhook_logs WHERE message_id = p_message_id FOR UPDATE;

    IF v_row.status = 'completed' THEN
        RETURN jsonb_build_object('status', 'ALREADY_COMPLETED', 'processing_token', null);
    END IF;

    IF v_row.status = 'failed' THEN
        RETURN jsonb_build_object('status', 'ALREADY_FAILED', 'processing_token', null);
    END IF;

    -- Se estiver sendo processado por outro worker com lease ativo
    IF v_row.status = 'processing' AND v_row.processing_expires_at IS NOT NULL AND v_row.processing_expires_at >= clock_timestamp() THEN
        RETURN jsonb_build_object('status', 'ALREADY_PROCESSING', 'processing_token', null);
    END IF;

    -- Verificação de limite de tentativas (Crash Loop / Max Retries)
    IF v_row.attempt_count >= p_max_retries OR v_row.retry_count >= p_max_retries THEN
        UPDATE public.webhook_logs
        SET status = 'failed',
            updated_at = now(),
            processing_token = NULL,
            processing_expires_at = NULL,
            error_log = COALESCE(error_log, '') || ' [MAX_RETRIES_EXCEEDED]'
        WHERE message_id = p_message_id;

        RETURN jsonb_build_object('status', 'DEAD_LETTER', 'processing_token', null);
    END IF;

    -- Se estiver em backoff de retry
    IF v_row.status = 'deferred' AND v_row.next_retry_at IS NOT NULL AND v_row.next_retry_at > clock_timestamp() THEN
        RETURN jsonb_build_object('status', 'RETRY_NOT_READY', 'processing_token', null);
    END IF;

    -- Takeover / Re-claim bem sucedido: incrementa attempt_count
    UPDATE public.webhook_logs
    SET status = 'processing',
        attempt_count = attempt_count + 1,
        processing_token = p_processing_token,
        processing_expires_at = clock_timestamp() + make_interval(secs => p_processing_ttl_seconds),
        updated_at = now()
    WHERE message_id = p_message_id;

    RETURN jsonb_build_object('status', 'CLAIMED', 'processing_token', p_processing_token);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_webhook_message(text, uuid, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_message(text, uuid, text, uuid, integer, integer) TO service_role;

-- 2.2 Renovação de lease do webhook (Heartbeat)
CREATE OR REPLACE FUNCTION public.renew_webhook_claim(
    p_message_id text,
    p_processing_token uuid,
    p_ttl_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_processing_token IS NULL THEN RAISE EXCEPTION 'p_processing_token não pode ser NULL'; END IF;
    IF p_ttl_seconds < 5 OR p_ttl_seconds > 300 THEN RAISE EXCEPTION 'p_ttl_seconds entre 5 e 300'; END IF;

    UPDATE public.webhook_logs
    SET processing_expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
        updated_at = now()
    WHERE message_id = p_message_id
      AND processing_token = p_processing_token
      AND status = 'processing'
      AND processing_expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_webhook_claim(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_webhook_claim(text, uuid, integer) TO service_role;

-- 2.3 Conclusão do processamento de mensagem de webhook
CREATE OR REPLACE FUNCTION public.complete_webhook_message(
    p_message_id text,
    p_processing_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_processing_token IS NULL THEN RAISE EXCEPTION 'p_processing_token não pode ser NULL'; END IF;

    UPDATE public.webhook_logs
    SET status = 'completed',
        completed_at = now(),
        updated_at = now(),
        error_log = NULL,
        processing_token = NULL,
        processing_expires_at = NULL
    WHERE message_id = p_message_id
      AND processing_token = p_processing_token
      AND status = 'processing'
      AND processing_expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_webhook_message(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_webhook_message(text, uuid) TO service_role;

-- 2.4 Adiamento (Defer) de processamento de webhook
CREATE OR REPLACE FUNCTION public.defer_webhook_message(
    p_message_id text,
    p_processing_token uuid,
    p_error_log text,
    p_backoff_seconds integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_processing_token IS NULL THEN RAISE EXCEPTION 'p_processing_token não pode ser NULL'; END IF;
    IF p_backoff_seconds < 1 OR p_backoff_seconds > 3600 THEN RAISE EXCEPTION 'p_backoff_seconds entre 1 e 3600'; END IF;

    UPDATE public.webhook_logs
    SET status = 'deferred',
        retry_count = retry_count + 1,
        next_retry_at = clock_timestamp() + make_interval(secs => p_backoff_seconds),
        error_log = p_error_log,
        updated_at = now(),
        processing_token = NULL,
        processing_expires_at = NULL
    WHERE message_id = p_message_id
      AND processing_token = p_processing_token
      AND status = 'processing'
      AND processing_expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.defer_webhook_message(text, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_webhook_message(text, uuid, text, integer) TO service_role;

-- 2.5 Falha terminal de mensagem de webhook
CREATE OR REPLACE FUNCTION public.fail_webhook_message(
    p_message_id text,
    p_processing_token uuid,
    p_error_log text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_processing_token IS NULL THEN RAISE EXCEPTION 'p_processing_token não pode ser NULL'; END IF;

    UPDATE public.webhook_logs
    SET status = 'failed',
        error_log = p_error_log,
        updated_at = now(),
        processing_token = NULL,
        processing_expires_at = NULL
    WHERE message_id = p_message_id
      AND processing_token = p_processing_token
      AND status = 'processing'
      AND processing_expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_webhook_message(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_webhook_message(text, uuid, text) TO service_role;


-- ════════════════════════════════════════════════════════════════════════════════
-- PARTE 3: IDEMPOTÊNCIA DE EFEITOS EXTERNOS COM LEASE & FENCING
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.message_effects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id text NOT NULL,
    effect_type varchar(50) NOT NULL,
    effect_key text NOT NULL DEFAULT '',
    status varchar(20) NOT NULL DEFAULT 'pending', -- pending | processing | executed | failed | deferred
    effect_token uuid,
    effect_expires_at timestamptz,
    attempt_count integer NOT NULL DEFAULT 0,
    next_retry_at timestamptz,
    last_error text,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    executed_at timestamptz,
    UNIQUE (message_id, effect_type, effect_key)
);

CREATE INDEX IF NOT EXISTS idx_message_effects_message_id ON public.message_effects (message_id);

-- RLS & Hardening de Segurança em message_effects
ALTER TABLE public.message_effects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.message_effects FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.message_effects TO service_role;

DROP POLICY IF EXISTS "service_role_message_effects" ON public.message_effects;
CREATE POLICY "service_role_message_effects" ON public.message_effects
    FOR ALL USING (auth.role() = 'service_role');

-- 3.1 Claim de efeito de mensagem
CREATE OR REPLACE FUNCTION public.claim_message_effect(
    p_message_id text,
    p_effect_type varchar(50),
    p_effect_key text,
    p_effect_token uuid,
    p_ttl_seconds integer DEFAULT 30,
    p_max_retries integer DEFAULT 3,
    p_payload jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.message_effects%ROWTYPE;
BEGIN
    IF p_effect_token IS NULL THEN RAISE EXCEPTION 'p_effect_token não pode ser NULL'; END IF;
    IF p_max_retries < 1 OR p_max_retries > 20 THEN RAISE EXCEPTION 'p_max_retries entre 1 e 20'; END IF;
    IF p_ttl_seconds < 5 OR p_ttl_seconds > 300 THEN RAISE EXCEPTION 'p_ttl_seconds entre 5 e 300'; END IF;

    INSERT INTO public.message_effects
        (message_id, effect_type, effect_key, status, effect_token, effect_expires_at, attempt_count, payload, created_at, updated_at)
    VALUES
        (p_message_id, p_effect_type, p_effect_key, 'processing', p_effect_token, clock_timestamp() + make_interval(secs => p_ttl_seconds), 1, p_payload, now(), now())
    ON CONFLICT (message_id, effect_type, effect_key) DO NOTHING;

    IF FOUND THEN
        RETURN jsonb_build_object('status', 'CLAIMED', 'effect_token', p_effect_token);
    END IF;

    SELECT * INTO v_row
    FROM public.message_effects
    WHERE message_id = p_message_id
      AND effect_type = p_effect_type
      AND effect_key = p_effect_key
    FOR UPDATE;

    IF v_row.status = 'executed' THEN
        RETURN jsonb_build_object('status', 'ALREADY_EXECUTED', 'effect_token', null);
    END IF;

    IF v_row.status = 'failed' THEN
        RETURN jsonb_build_object('status', 'ALREADY_FAILED', 'effect_token', null);
    END IF;

    IF v_row.status = 'processing' AND v_row.effect_expires_at IS NOT NULL AND v_row.effect_expires_at >= clock_timestamp() THEN
        RETURN jsonb_build_object('status', 'ALREADY_PROCESSING', 'effect_token', null);
    END IF;

    IF v_row.attempt_count >= p_max_retries THEN
        UPDATE public.message_effects
        SET status = 'failed',
            updated_at = now(),
            effect_token = NULL,
            effect_expires_at = NULL,
            last_error = COALESCE(v_row.last_error, '') || ' [MAX_RETRIES]'
        WHERE message_id = p_message_id
          AND effect_type = p_effect_type
          AND effect_key = p_effect_key;

        RETURN jsonb_build_object('status', 'DEAD_LETTER', 'effect_token', null);
    END IF;

    IF v_row.status = 'deferred' AND v_row.next_retry_at IS NOT NULL AND v_row.next_retry_at > clock_timestamp() THEN
        RETURN jsonb_build_object('status', 'RETRY_NOT_READY', 'effect_token', null);
    END IF;

    UPDATE public.message_effects
    SET status = 'processing',
        attempt_count = attempt_count + 1,
        effect_token = p_effect_token,
        effect_expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
        updated_at = now()
    WHERE message_id = p_message_id
      AND effect_type = p_effect_type
      AND effect_key = p_effect_key;

    RETURN jsonb_build_object('status', 'CLAIMED', 'effect_token', p_effect_token);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_message_effect(text, varchar, text, uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_message_effect(text, varchar, text, uuid, integer, integer, jsonb) TO service_role;

-- 3.2 Marcar efeito como executado com sucesso
CREATE OR REPLACE FUNCTION public.mark_effect_executed(
    p_message_id text,
    p_effect_type varchar(50),
    p_effect_key text,
    p_effect_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_effect_token IS NULL THEN RAISE EXCEPTION 'p_effect_token não pode ser NULL'; END IF;

    UPDATE public.message_effects
    SET status = 'executed',
        executed_at = now(),
        updated_at = now(),
        effect_token = NULL,
        effect_expires_at = NULL,
        last_error = NULL
    WHERE message_id = p_message_id
      AND effect_type = p_effect_type
      AND effect_key = p_effect_key
      AND effect_token = p_effect_token
      AND status = 'processing'
      AND effect_expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_effect_executed(text, varchar, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_effect_executed(text, varchar, text, uuid) TO service_role;

-- 3.3 Renovação de lease de efeito (Heartbeat)
CREATE OR REPLACE FUNCTION public.renew_message_effect_claim(
    p_message_id text,
    p_effect_type varchar(50),
    p_effect_key text,
    p_effect_token uuid,
    p_ttl_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_effect_token IS NULL THEN RAISE EXCEPTION 'p_effect_token não pode ser NULL'; END IF;
    IF p_ttl_seconds < 5 OR p_ttl_seconds > 300 THEN RAISE EXCEPTION 'p_ttl_seconds entre 5 e 300'; END IF;

    UPDATE public.message_effects
    SET effect_expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
        updated_at = now()
    WHERE message_id = p_message_id
      AND effect_type = p_effect_type
      AND effect_key = p_effect_key
      AND effect_token = p_effect_token
      AND status = 'processing'
      AND effect_expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_message_effect_claim(text, varchar, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_message_effect_claim(text, varchar, text, uuid, integer) TO service_role;

-- 3.4 Adiamento (Defer) de efeito
CREATE OR REPLACE FUNCTION public.defer_effect(
    p_message_id text,
    p_effect_type varchar(50),
    p_effect_key text,
    p_effect_token uuid,
    p_error_log text,
    p_backoff_seconds integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_effect_token IS NULL THEN RAISE EXCEPTION 'p_effect_token não pode ser NULL'; END IF;
    IF p_backoff_seconds < 1 OR p_backoff_seconds > 3600 THEN RAISE EXCEPTION 'p_backoff_seconds entre 1 e 3600'; END IF;

    UPDATE public.message_effects
    SET status = 'deferred',
        next_retry_at = clock_timestamp() + make_interval(secs => p_backoff_seconds),
        last_error = p_error_log,
        updated_at = now(),
        effect_token = NULL,
        effect_expires_at = NULL
    WHERE message_id = p_message_id
      AND effect_type = p_effect_type
      AND effect_key = p_effect_key
      AND effect_token = p_effect_token
      AND status = 'processing'
      AND effect_expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.defer_effect(text, varchar, text, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_effect(text, varchar, text, uuid, text, integer) TO service_role;

-- 3.5 Falha terminal de efeito
CREATE OR REPLACE FUNCTION public.fail_effect(
    p_message_id text,
    p_effect_type varchar(50),
    p_effect_key text,
    p_effect_token uuid,
    p_error_log text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_effect_token IS NULL THEN RAISE EXCEPTION 'p_effect_token não pode ser NULL'; END IF;

    UPDATE public.message_effects
    SET status = 'failed',
        last_error = p_error_log,
        updated_at = now(),
        effect_token = NULL,
        effect_expires_at = NULL
    WHERE message_id = p_message_id
      AND effect_type = p_effect_type
      AND effect_key = p_effect_key
      AND effect_token = p_effect_token
      AND status = 'processing'
      AND effect_expires_at >= clock_timestamp();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_effect(text, varchar, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_effect(text, varchar, text, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
