-- ==============================================================================
-- 🚀 CLINICABOT SAAS PRO — SCHEMA MIGRATION V12 (BILLING, SUBSCRIPTIONS & LGPD)
-- Suporte a planos, controle de assinaturas, gateway de pagamento e LGPD Art. 18
-- ==============================================================================

-- 1. Expansão da Tabela de Clínicas com Campos de Assinatura & Cotas
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50) DEFAULT 'pro';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS monthly_booking_limit INT DEFAULT 500;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS monthly_booking_count INT DEFAULT 0;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_status VARCHAR(50) DEFAULT 'connected';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS last_billing_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Tabela de Histórico de Assinaturas & Cobranças SaaS
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  stripe_invoice_id VARCHAR(255),
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'BRL',
  status VARCHAR(50) NOT NULL, -- 'paid', 'open', 'failed', 'refunded'
  plan_type VARCHAR(50) NOT NULL,
  billing_period_start TIMESTAMP WITH TIME ZONE,
  billing_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_subs_clinic ON saas_subscriptions(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_subs_status ON saas_subscriptions(status);

-- 3. Tabela de Logs de Auditoria do Direito ao Esquecimento (LGPD Art. 18)
CREATE TABLE IF NOT EXISTS lgpd_deletion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,
  patient_phone_masked VARCHAR(50) NOT NULL,
  requested_by VARCHAR(255) NOT NULL, -- 'patient_chat' ou 'dashboard_user'
  anonymized_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  audit_hash VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lgpd_deletion_clinic ON lgpd_deletion_logs(clinic_id, anonymized_at DESC);

-- 4. RLS para as novas tabelas
ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_deletion_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access saas_subscriptions') THEN
        CREATE POLICY "Allow service_role full access saas_subscriptions" ON saas_subscriptions FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access lgpd_deletion_logs') THEN
        CREATE POLICY "Allow service_role full access lgpd_deletion_logs" ON lgpd_deletion_logs FOR ALL USING (true);
    END IF;
END $$;
