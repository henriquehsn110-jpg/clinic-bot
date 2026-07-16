const db = require('./databaseService');

// Grade de horários da clínica — ajuste conforme o horário real de atendimento
const CLINIC_SLOTS = ['08:00', '09:00', '10:00', '10:30', '11:00',
                      '14:00', '14:30', '15:00', '16:00', '17:00'];

class CalendarService {

    /**
     * Retorna os horários disponíveis para uma data.
     * Subtrai os horários já ocupados da grade fixa da clínica.
     *
     * @param {string} dateStr - formato "YYYY-MM-DD"
     * @returns {string[]} - ex: ["09:00", "14:30", "16:00"]
     */
    async getAvailableSlots(dateStr) {
        const occupied = await db.appointments.getOccupiedSlots(dateStr);
        return CLINIC_SLOTS.filter(slot => !occupied.includes(slot));
    }

    /**
     * Cria o agendamento no banco após coleta dos dados pelo bot.
     *
     * @param {Object} patientData - { phone, name, date, time, type }
     * @returns {Object} - agendamento criado
     */
    async scheduleAppointment(patientData) {
        // Garante que o paciente existe e pega o ID
        const patient = await db.patients.findOrCreate(patientData.phone);

        // Atualiza o nome se foi coletado durante a conversa
        if (patientData.name) {
            await db.patients.updateName(patientData.phone, patientData.name);
        }

        // Cria o agendamento
        return db.appointments.create({
            patient_id:       patient.id,
            appointment_date: patientData.date,   // "2025-12-20"
            appointment_time: patientData.time,   // "09:00"
            type:             patientData.type,   // "Limpeza"
            notes:            patientData.notes || null
        });
    }

    /**
     * Lista agendamentos do dia (para disparo de lembretes ou painel).
     */
    async getTodayAppointments() {
        const today = new Date().toISOString().split('T')[0];
        return db.appointments.findByDate(today);
    }
}

module.exports = new CalendarService();
