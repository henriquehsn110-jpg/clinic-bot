/**
 * TESTE DE DISPARO REAL DE LEMBRETE VIA WHATSAPP (PRODUÇÃO)
 */
require('dotenv').config();
const reminderService = require('../services/reminderService');
const db = require('../services/databaseService');

async function testSend() {
    console.log('================================================================');
    console.log('🧪 TESTE DE DISPARO DE LEMBRETE VIA WHATSAPP (META API)');
    console.log('================================================================\n');

    console.log('1. Buscando agendamentos no banco de produção...');
    const { data: appts, error } = await db.supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, status, type, patient_id, clinic_id, patients(name, phone)')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Erro ao buscar:', error);
        process.exit(1);
    }

    console.log('Agendamentos recentes encontrados:', appts.map(a => ({
        id: a.id,
        data: a.appointment_date,
        hora: a.appointment_time,
        paciente: a.patients?.name,
        telefone: a.patients?.phone
    })));

    // Forçar simulação = false para enviar mensagem real pelo WhatsApp
    console.log('\n2. Testando disparo forçado de lembrete H-2 (isSimulation: false, forceCurrentMinutes: 360 para consulta das 08:00)...');
    // Para consulta das 08:00 (480 minutos), se passarmos forceCurrentMinutes = 360 (06:00), diffMinutes = 120 (dentro da janela de 2 horas)
    const result = await reminderService.processTwoHourReminders(false, 360);
    console.log('\nResultado do processamento:', JSON.stringify(result, null, 2));
}

testSend().then(() => process.exit(0)).catch(err => {
    console.error('Erro no teste:', err);
    process.exit(1);
});
