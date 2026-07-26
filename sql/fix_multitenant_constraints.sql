-- 1. Remover as constraints antigamente globais
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_phone_key;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_phone_key;

-- 2. Adicionar as novas constraints isoladas por clínica (Multi-Tenant)
ALTER TABLE patients ADD CONSTRAINT patients_phone_clinic_id_key UNIQUE (phone, clinic_id);
ALTER TABLE sessions ADD CONSTRAINT sessions_phone_clinic_id_key UNIQUE (phone, clinic_id);
