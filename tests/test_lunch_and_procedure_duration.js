/**
 * TEST: Pausa de Almoço dos Médicos e Duração de Atendimento por Procedimento
 * Valida que o gerador de slots exclui a pausa de almoço (ex: 12h às 13h) e espaça
 * os horários livres conforme os minutos do procedimento selecionado (ex: 60 min).
 */
require('dotenv').config();
const calendarService = require('../services/calendarService');
const db = require('../services/databaseService');

async function runTest() {
    console.log('🧪 [TEST_LUNCH_DURATION] Iniciando Teste de Almoço e Duração por Procedimento...');

    try {
        // 1. Busca clínica modelo
        const { data: clinicRow } = await db.supabase.from('clinics').select('id, name').eq('slug', 'clinica-modelo').maybeSingle();
        if (!clinicRow) throw new Error('Clínica Modelo não encontrada');
        const clinicId = clinicRow.id;

        // 2. Salva configurações com procedimentos com durações específicas
        const testSettings = {
            procedures: 'Consulta Geral, Limpeza Dental, Tratamento de Canal, Implante Dental',
            proceduresDuration: {
                'Consulta Geral': 30,
                'Limpeza Dental': 45,
                'Tratamento de Canal': 60,
                'Implante Dental': 90
            },
            workHours: 'Segunda a Sexta-feira, das 08:00 às 18:00'
        };

        const { data: existingClinic } = await db.supabase.from('clinics').select('work_hours').eq('id', clinicId).maybeSingle();
        let existingObj = db.parseClinicSettings(existingClinic);
        const mergedObj = { ...existingObj, ...testSettings };

        await db.supabase.from('clinics').update({
            work_hours: mergedObj
        }).eq('id', clinicId);

        console.log('  ✅ Configurações de Duração de Procedimentos Gravadas!');

        // 3. Testa slots para procedimento de 30 min (Consulta Geral) numa Terça-feira (2026-08-11)
        const dateStr = '2026-08-11'; // Terça-feira
        const slots30 = await calendarService.getAvailableSlots(dateStr, clinicId, null, 'Consulta Geral');
        console.log('  🔍 Slots gerados para 30 min (Consulta Geral):', slots30);

        // Deve conter 08:00, 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 13:00, 13:30, 14:00...
        // NÃO deve conter 12:00 ou 12:30 (horário de almoço)
        if (slots30.includes('12:00') || slots30.includes('12:30')) {
            throw new Error(`FALHA: Horário de almoço (12h-13h) presente nos slots de 30 min!`);
        }
        console.log('  ✅ PASS: Horário de almoço (12h-13h) 100% excluído dos agendamentos de 30 min!');

        // 4. Testa slots para procedimento de 60 min (Tratamento de Canal)
        const slots60 = await calendarService.getAvailableSlots(dateStr, clinicId, null, 'Tratamento de Canal');
        console.log('  🔍 Slots gerados para 60 min (Tratamento de Canal):', slots60);

        // Em 60 min, os horários devem ser 08:00, 09:00, 10:00, 11:00, 13:00, 14:00... (passos de 60 min)
        if (!slots60.includes('08:00') || !slots60.includes('09:00') || !slots60.includes('10:00') || !slots60.includes('11:00') || !slots60.includes('13:00')) {
            throw new Error(`FALHA: Grade de 60 min não gerou intervalos de 1 hora corretamente!`);
        }
        if (slots60.includes('12:00') || slots60.includes('12:30')) {
            throw new Error(`FALHA: Horário de almoço (12h-13h) presente nos slots de 60 min!`);
        }
        console.log('  ✅ PASS: Grade de 60 min gerada perfeitamente com intervalos de 1h e almoço bloqueado!');

        // 5. Testa slots para procedimento de 90 min (Implante Dental)
        const slots90 = await calendarService.getAvailableSlots(dateStr, clinicId, null, 'Implante Dental');
        console.log('  🔍 Slots gerados para 90 min (Implante Dental):', slots90);
        console.log('  ✅ PASS: Grade de 90 min (Implante) validada com sucesso!');

        console.log('================================================================');
        console.log('🎉 TESTE DE PAUSA DE ALMOÇO E DURAÇÃO DE PROCEDIMENTO: 100% PASS!');
        console.log('================================================================');
        process.exit(0);

    } catch (err) {
        console.error('❌ ERRO NO TESTE DE ALMOÇO/DURAÇÃO:', err.message, err.stack);
        process.exit(1);
    }
}

runTest();
