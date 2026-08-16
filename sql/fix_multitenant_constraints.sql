-- 1. Remover as constraints antigamente globais
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_phone_key;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_phone_key;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_active_slot_unique;

-- 2. Adicionar as novas constraints isoladas por clínica (Multi-Tenant)
ALTER TABLE patients ADD CONSTRAINT patients_phone_clinic_id_key UNIQUE (phone, clinic_id);
ALTER TABLE sessions ADD CONSTRAINT sessions_phone_clinic_id_key UNIQUE (phone, clinic_id);

-- 3. Criar índice único parcial multi-tenant para agendamentos ativos
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_clinic_active_slot 
ON public.appointments (clinic_id, appointment_date, appointment_time) 
WHERE deleted_at IS NULL AND status IN ('pending', 'confirmed');

-- 4. Notificar PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
