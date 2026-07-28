-- ==============================================================================
-- 🚀 CLINICABOT SAAS PRO (SCHEMA COMPLETO V11.0)
-- Atualizações de Agendas Multi-Profissionais e Customizações de UI do WhatsApp
-- ==============================================================================

-- 1. Customização do Título de Lista do WhatsApp
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_list_title VARCHAR(50) DEFAULT 'Tratamentos';

-- 2. Tabela de Profissionais (Médicos/Dentistas)
CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Grades de Horário Individuais por Profissional
CREATE TABLE IF NOT EXISTS doctor_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  available_slots JSONB NOT NULL DEFAULT '["08:00","09:00","10:00","11:00","14:00","15:00","16:00","17:00"]'::jsonb,
  CONSTRAINT doctor_hours_day_key UNIQUE (doctor_id, day_of_week)
);

-- 4. Vínculo do Médico ao Agendamento
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES doctors(id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);

-- 5. RLS para as novas tabelas
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_business_hours ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access doctors') THEN
        CREATE POLICY "Allow service_role full access doctors" ON doctors FOR ALL USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access doctor_business_hours') THEN
        CREATE POLICY "Allow service_role full access doctor_business_hours" ON doctor_business_hours FOR ALL USING (true);
    END IF;
END $$;
