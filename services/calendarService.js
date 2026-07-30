const db = require('./databaseService');
const logger = require('./logger');

// Grade de horários padrão da clínica (fallback)
const DEFAULT_SLOTS = ['08:00', '09:00', '10:00', '10:30', '11:00',
                       '14:00', '14:30', '15:00', '16:00', '17:00'];

class CalendarService {

    /**
     * Retorna os horários disponíveis para uma data.
     * Suporta checagem de feriados e horários customizados por clínica (P14/P15).
     *
     * @param {string} dateStr - formato "YYYY-MM-DD"
     * @param {string} clinicId - UUID da clínica
     * @returns {string[]} - ex: ["09:00", "14:30", "16:00"]
     */
    async getAvailableSlots(dateStr, clinicId, doctorId = null) {
        if (!clinicId) throw new Error('clinicId é obrigatório em getAvailableSlots');

        try {
            // 1. Checa se a data é um feriado cadastrado para a clínica
            const { data: holiday } = await db.supabase
                .from('clinic_holidays')
                .select('id, reason')
                .eq('clinic_id', clinicId)
                .eq('holiday_date', dateStr)
                .maybeSingle();

            const isNationalHoliday = ['12-25', '01-01', '05-01', '09-07', '11-15', '11-02', '10-12'].some(h => dateStr.endsWith(h));
            if (holiday || isNationalHoliday) {
                logger.info('CALENDAR', `Data ${dateStr} é feriado. Zero slots disponíveis.`);
                return []; // Nenhum horário disponível em feriados
            }

            const dateObj = new Date(`${dateStr}T12:00:00Z`);
            const dayOfWeek = dateObj.getDay(); // 0-6 (0 = Domingo)
            if (dayOfWeek === 0) {
                logger.info('CALENDAR', `Data ${dateStr} é domingo. Sem expediente.`);
                return []; // Domingo sem expediente
            }

            // 2. Busca grade de horários ocupados no banco (considerando doctorId)
            let occupiedQuery = db.supabase
                .from('appointments')
                .select('appointment_time')
                .eq('clinic_id', clinicId)
                .eq('appointment_date', dateStr)
                .in('status', ['pending', 'confirmed'])
                .is('deleted_at', null);
            
            if (doctorId) {
                occupiedQuery = occupiedQuery.eq('doctor_id', doctorId);
            }
            
            const { data: appts } = await occupiedQuery;
            const occupied = (appts || []).map(a => a.appointment_time.substring(0, 5));

            // 3. Tenta buscar grade de horários customizados do médico ou clínica
            let baseSlots = DEFAULT_SLOTS;
            try {
                const dateObj = new Date(`${dateStr}T12:00:00Z`);
                const dayOfWeek = dateObj.getDay(); // 0-6
                
                let customHours = null;
                if (doctorId) {
                    const { data } = await db.supabase
                        .from('doctor_business_hours')
                        .select('available_slots')
                        .eq('doctor_id', doctorId)
                        .eq('day_of_week', dayOfWeek)
                        .maybeSingle();
                    customHours = data;
                }
                
                if (!customHours) {
                    const { data } = await db.supabase
                        .from('clinic_hours')
                        .select('available_slots')
                        .eq('clinic_id', clinicId)
                        .eq('day_of_week', dayOfWeek)
                        .maybeSingle();
                    customHours = data;
                }

                if (customHours && Array.isArray(customHours.available_slots) && customHours.available_slots.length > 0) {
                    baseSlots = customHours.available_slots;
                }
            } catch (err) {
                logger.warn('CALENDAR', `Falha ao buscar horas costumizadas: ${err.message}`);
            }

            return baseSlots.filter(time => !occupied.includes(time));
        } catch (err) {
            logger.error('CALENDAR', `Erro ao buscar slots disponíveis: ${err.message}`, err.stack);
            const occupied = await db.appointments.getOccupiedSlots(dateStr, clinicId);
            return DEFAULT_SLOTS.filter(slot => !occupied.includes(slot));
        }
    }

    /**
     * Cria o agendamento no banco após coleta dos dados pelo bot.
     */
    async scheduleAppointment(patientData) {
        const targetClinicId = patientData.clinicId || patientData.clinic_id;
        if (!targetClinicId) throw new Error('clinicId é obrigatório em scheduleAppointment');
        try {
            const patient = await db.patients.findOrCreate(patientData.phone, targetClinicId);
            
            if (patientData.name && patientData.name !== patient.name) {
                await db.patients.updateName(patientData.phone, patientData.name, targetClinicId);
            }

            return await db.appointments.create({
                patient_id:       patient.id,
                clinic_id:        targetClinicId,
                doctor_id:        patientData.doctor_id || patientData.doctorId || null,
                appointment_date: patientData.date,
                appointment_time: patientData.time,
                type:             patientData.type,
                notes:            patientData.notes || null
            });
        } catch (error) {
            throw error;
        }
    }

    /**
     * Lista agendamentos do dia (para disparo de lembretes ou painel).
     */
    async getTodayAppointments(clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em getTodayAppointments');
        try {
            const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const brtObj = new Date(brtString);
            const today = `${brtObj.getFullYear()}-${String(brtObj.getMonth() + 1).padStart(2, '0')}-${String(brtObj.getDate()).padStart(2, '0')}`;
            return await db.appointments.findByDate(today, clinicId);
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new CalendarService();
