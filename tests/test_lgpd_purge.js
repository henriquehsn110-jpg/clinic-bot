require('dotenv').config();
const db = require('../services/databaseService');
const crypto = require('crypto');

async function runTest() {
    console.log("=== INICIANDO TESTE DE PURGA LGPD ===");
    
    // 1. Obter clínica de teste
    const clinics = await db.clinics.getAll();
    const testClinic = clinics[0];
    if (!testClinic) {
        console.error("Nenhuma clínica encontrada para o teste.");
        process.exit(1);
    }
    const clinicId = testClinic.id;
    
    // Usar um telefone aleatório para não colidir
    const randomSuffix = Math.floor(Math.random() * 10000);
    const testPhone = `55119999${randomSuffix}`;
    const testCpf = `123456789${String(randomSuffix).substring(0,2)}`;

    try {
        console.log(`\n[1] Criando paciente de teste... Phone: ${testPhone}`);
        let patient = await db.patients.findOrCreate(testPhone, clinicId);
        
        console.log(`[1] Atualizando nome e CPF...`);
        patient = await db.patients.updateName(testPhone, 'Paciente LGPD Teste', clinicId);
        patient = await db.patients.updateCpf(testPhone, testCpf, clinicId);
        
        const randomHour = String(Math.floor(Math.random() * (17 - 8 + 1) + 8)).padStart(2, '0');
        const randomMinute = Math.random() > 0.5 ? '00' : '30';
        const randomYear = 2030 + Math.floor(Math.random() * 50);
        const randomMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
        const randomDay = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
        
        console.log(`[1] Inserindo agendamento de teste...`);
        const appointment = await db.appointments.create({
            patient_id: patient.id,
            clinic_id: clinicId,
            appointment_date: `${randomYear}-${randomMonth}-${randomDay}`,
            appointment_time: `${randomHour}:${randomMinute}:00`,
            type: 'Consulta Teste',
            notes: 'Anotação confidencial do paciente.'
        });
        
        console.log(`[1] Adicionando histórico de sessão...`);
        await db.sessions.set(testPhone, [{ role: 'user', content: 'Oi, quero agendar' }], clinicId);
        
        console.log(`[1] Adicionando log de conversa...`);
        await db.conversations.log(patient.id, 'user', 'Mensagem confidencial de teste LGPD');

        console.log(`\n[2] Executando Purga LGPD para o paciente ID: ${patient.id}...`);
        await db.patients.purgePatient(patient.id, clinicId);
        console.log(`[2] Purga concluída com sucesso.`);
        
        console.log(`\n[3] Validando anonimização...`);
        const rawPurgedPatient = await db.patients.findByPhone(testPhone, clinicId);
        // O findByPhone não vai achar o antigo pq foi ofuscado, e o findOrCreate do purge ofusca, então buscamos pelo banco direto
        const { data: dbCheck } = await require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
            .from('patients').select('*').eq('id', patient.id).single();
            
        if (dbCheck && dbCheck.lgpd_purged_at) {
            console.log(`[3] Paciente purgado encontrado pelo ID diretamente no banco:`);
            console.log(`    Nome: ${dbCheck.name}`);
            console.log(`    CPF: ${dbCheck.cpf}`);
            console.log(`    Telefone: ${dbCheck.phone}`);
            console.log(`    Purged At: ${dbCheck.lgpd_purged_at}`);
        } else {
            console.log(`[3] AVISO: Paciente purgado não validado no banco.`);
        }

        const oldPhoneCheck = await db.patients.findByPhone(testPhone, clinicId);
        console.log(`[3] Busca pelo telefone antigo (${testPhone}): ${oldPhoneCheck ? 'FALHOU (Ainda existe)' : 'SUCESSO (Não encontrado)'}`);

        const purgedAppt = await db.appointments.findByPatient(patient.id, clinicId);
        console.log(`[3] Notas do agendamento: ${purgedAppt[0]?.notes}`);

        console.log(`\n[4] Simulando novo contato com o mesmo telefone (${testPhone})...`);
        const newPatient = await db.patients.findOrCreate(testPhone, clinicId);
        console.log(`[4] Novo paciente retornado ID: ${newPatient.id}`);
        if (newPatient.id !== patient.id) {
            console.log(`[4] SUCESSO: O bot criou um cadastro novo (ID diferente).`);
        } else {
            console.error(`[4] FALHA: O bot reativou o paciente purgado!`);
            process.exit(1);
        }

        console.log("\n=== TESTE LGPD CONCLUÍDO ===");
        process.exit(0);

    } catch (err) {
        console.error("\n[ERRO NO TESTE LGPD]:", err.message);
        process.exit(1);
    }
}

runTest();
