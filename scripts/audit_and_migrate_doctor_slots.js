require('dotenv').config();
const db = require('../services/databaseService');

async function auditAndMigrateDoctorSlots() {
    console.log('================================================================');
    console.log('🔍 AUDITORIA DE SLOTS E MIGRAÇÃO MULTI-MÉDICO');
    console.log('================================================================\n');

    // 1. Busca todos os agendamentos ativos
    const { data: allActive, error: errAll } = await db.supabase
        .from('appointments')
        .select('id, clinic_id, doctor_id, appointment_date, appointment_time, type, status')
        .is('deleted_at', null)
        .in('status', ['pending', 'confirmed']);

    if (errAll) {
        console.error('Erro ao buscar agendamentos:', errAll);
        process.exit(1);
    }

    const total = allActive.length;
    const withDoc = allActive.filter(a => a.doctor_id !== null);
    const withoutDoc = allActive.filter(a => a.doctor_id === null);

    console.log(`📊 Agendamentos ativos totais: ${total}`);
    console.log(`   - Com doctor_id concreto:  ${withDoc.length}`);
    console.log(`   - Com doctor_id NULL:      ${withoutDoc.length}\n`);

    // 2. Se houver agendamentos ativos com doctor_id NULL, resolve com médicos da clínica
    if (withoutDoc.length > 0) {
        console.log('⚠️  Resolvendo doctor_id para agendamentos ativos sem profissional...');
        for (const appt of withoutDoc) {
            const { data: doctors } = await db.supabase
                .from('doctors')
                .select('id, name')
                .eq('clinic_id', appt.clinic_id)
                .eq('is_active', true);

            if (doctors && doctors.length > 0) {
                // Atribui o primeiro médico disponível da clínica
                const assignedDoc = doctors[0];
                const { error: updErr } = await db.supabase
                    .from('appointments')
                    .update({ doctor_id: assignedDoc.id })
                    .eq('id', appt.id);

                if (updErr) {
                    console.error(`   ❌ Falha ao atribuir médico para agendamento ${appt.id}:`, updErr.message);
                } else {
                    console.log(`   ✅ Agendamento ${appt.id} (${appt.appointment_date} ${appt.appointment_time}) vinculado a ${assignedDoc.name} [${assignedDoc.id}]`);
                }
            } else {
                console.warn(`   ⚠️  Nenhum médico ativo encontrado para clínica ${appt.clinic_id}`);
            }
        }
    } else {
        console.log('✅ Nenhum agendamento ativo com doctor_id NULL encontrado.');
    }

    // 3. Verificação de unicidade
    const { data: rechecked } = await db.supabase
        .from('appointments')
        .select('id, clinic_id, doctor_id, appointment_date, appointment_time')
        .is('deleted_at', null)
        .in('status', ['pending', 'confirmed']);

    const seen = new Set();
    let duplicates = 0;
    for (const a of (rechecked || [])) {
        const key = `${a.clinic_id}_${a.doctor_id}_${a.appointment_date}_${a.appointment_time}`;
        if (seen.has(key)) {
            console.error(`❌ DUPLICATA ENCONTRADA: ${key} (ID: ${a.id})`);
            duplicates++;
        } else {
            seen.add(key);
        }
    }

    if (duplicates === 0) {
        console.log('\n✅ Base 100% íntegra! Nenhuma colisão por (clinic_id, doctor_id, data, hora).');
    } else {
        console.warn(`\n⚠️  Encontradas ${duplicates} colisões que precisam de saneamento manual.`);
    }

    console.log('\n================================================================');
    console.log('📜 SCRIPT DDL RECOMENDADO PARA O SUPABASE SQL EDITOR');
    console.log('================================================================');
    console.log(`
-- 1. Remove a constraint antiga que bloqueava múltiplos médicos no mesmo horário
DROP INDEX IF EXISTS uq_appointments_clinic_active_slot;

-- 2. Cria a nova constraint única isolada por clínica E por profissional
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_clinic_doctor_active_slot 
ON public.appointments (clinic_id, doctor_id, appointment_date, appointment_time) 
WHERE deleted_at IS NULL AND status IN ('pending', 'confirmed') AND doctor_id IS NOT NULL;

-- 3. Notifica o PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
`);
    console.log('================================================================\n');
}

auditAndMigrateDoctorSlots().then(() => process.exit(0)).catch(err => {
    console.error('ERRO FATAL:', err);
    process.exit(1);
});
