const db = require('./databaseService');
const logger = require('./logger');

// Grade de horários padrão da clínica (fallback)
const DEFAULT_SLOTS = ['08:00', '09:00', '10:00', '10:30', '11:00',
                       '14:00', '14:30', '15:00', '16:00', '17:00'];

function generateSlotsForRange(startTime = '08:00', endTime = '18:00', lunchStart = '12:00', lunchEnd = '13:00', stepMinutes = 30) {
    const slots = [];
    
    function timeToMin(t) {
        if (!t || t === 'none') return null;
        const parts = String(t).split(':').map(Number);
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
        return parts[0] * 60 + parts[1];
    }
    
    function minToTime(m) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    }
    
    const startMin = timeToMin(startTime) ?? (8 * 60);
    const endMin = timeToMin(endTime) ?? (18 * 60);
    const lStartMin = timeToMin(lunchStart);
    const lEndMin = timeToMin(lunchEnd);
    const step = parseInt(stepMinutes) || 30;
    
    for (let cur = startMin; cur + step <= endMin; cur += step) {
        const slotEnd = cur + step;
        // Pula slots que colidem com a pausa de almoço
        if (lStartMin !== null && lEndMin !== null) {
            if (cur < lEndMin && slotEnd > lStartMin) {
                continue;
            }
        }
        slots.push(minToTime(cur));
    }
    return slots.length > 0 ? slots : DEFAULT_SLOTS;
}

class CalendarService {

    /**
     * Retorna os horários disponíveis para uma data.
     * Suporta checagem de feriados, intervalo de almoço do médico e duração do procedimento.
     *
     * @param {string} dateStr - formato "YYYY-MM-DD"
     * @param {string} clinicId - UUID da clínica
     * @param {string|null} doctorId - UUID do médico
     * @param {string|null} procedureName - Nome do procedimento selecionado
     * @returns {string[]} - ex: ["08:00", "09:00", "10:00"]
     */
    async getAvailableSlots(dateStr, clinicId, doctorId = null, procedureName = null) {
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

            // 3. Tenta buscar a clínica para determinar o tempo do procedimento e horários de funcionamento
            let durationMinutes = 30;
            let startTime = '08:00';
            let endTime = '18:00';
            let lunchStart = '12:00';
            let lunchEnd = '13:00';

            try {
                const { data: cData } = await db.supabase.from('clinics').select('work_hours').eq('id', clinicId).maybeSingle();
                if (cData) {
                    const parsed = db.parseClinicSettings(cData);
                    if (procedureName && parsed.proceduresDuration && parsed.proceduresDuration[procedureName]) {
                        durationMinutes = parseInt(parsed.proceduresDuration[procedureName]) || 30;
                    }
                    if (parsed.workHours) {
                        const timeMatch = parsed.workHours.match(/(\d{1,2}:\d{2})\s*às\s*(\d{1,2}:\d{2})/i);
                        if (timeMatch) {
                            startTime = timeMatch[1];
                            endTime = timeMatch[2];
                        }
                    }
                }
            } catch (err) {
                logger.warn('CALENDAR', `Falha ao extrair duração de procedimento: ${err.message}`);
            }

            // 4. Tenta buscar a escala individual do médico ou da clínica
            if (doctorId) {
                try {
                    const { data: docRow } = await db.supabase.from('doctors').select('available_days').eq('id', doctorId).maybeSingle();
                    if (docRow && docRow.available_days) {
                        const doubleRange = docRow.available_days.match(/(\d{1,2})[h:]?\s*às\s*(\d{1,2})[h:]?\s*e\s*(\d{1,2})[h:]?\s*às\s*(\d{1,2})[h:]?/i);
                        const singleRange = docRow.available_days.match(/(\d{1,2})[h:]?\s*às\s*(\d{1,2})[h:]?/i);
                        if (doubleRange) {
                            startTime = String(doubleRange[1]).padStart(2, '0') + ':00';
                            lunchStart = String(doubleRange[2]).padStart(2, '0') + ':00';
                            lunchEnd = String(doubleRange[3]).padStart(2, '0') + ':00';
                            endTime = String(doubleRange[4]).padStart(2, '0') + ':00';
                        } else if (singleRange) {
                            startTime = String(singleRange[1]).padStart(2, '0') + ':00';
                            endTime = String(singleRange[2]).padStart(2, '0') + ':00';
                            lunchStart = 'none';
                            lunchEnd = 'none';
                        }
                    }
                } catch (docErr) {
                    logger.warn('CALENDAR', `Falha ao ler escala do médico ${doctorId}: ${docErr.message}`);
                }
            }

            let baseSlots = generateSlotsForRange(startTime, endTime, lunchStart, lunchEnd, durationMinutes);
            try {
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
                logger.warn('CALENDAR', `Falha ao buscar horas customizadas: ${err.message}`);
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
     * Executa revalidação atômica de concorrência antes do INSERT para impedir double-booking.
     * Suporta agendamento para familiares/dependentes vinculando guardian_id.
     */
    async scheduleAppointment(patientData) {
        const targetClinicId = patientData.clinicId || patientData.clinic_id;
        if (!targetClinicId) throw new Error('clinicId é obrigatório em scheduleAppointment');
        try {
            const titular = await db.patients.findOrCreate(patientData.phone, targetClinicId);
            
            let appointmentPatient = titular;

            if (patientData.is_family_booking || patientData.dependentName || patientData.dependentCpf || patientData.dependent_id || patientData.dependentId) {
                // Cria ou recupera a entidade do dependente vinculada ao titular (guardian_id)
                appointmentPatient = await db.patients.findOrCreateDependent({
                    guardianId: titular.id,
                    clinicId: targetClinicId,
                    name: patientData.dependentName || patientData.name || null,
                    cpf: patientData.dependentCpf || patientData.cpf || null,
                    phone: patientData.phone,
                    dependentId: patientData.dependent_id || patientData.dependentId || null
                });
            } else {
                if (patientData.name && patientData.name !== titular.name) {
                    await db.patients.updateName(patientData.phone, patientData.name, targetClinicId);
                }
            }

            // Revalidação de concorrência: verifica se o horário foi ocupado por outro paciente
            const isOccupied = await db.appointments.isSlotOccupied(
                patientData.date,
                patientData.time,
                targetClinicId,
                patientData.doctor_id || patientData.doctorId || null,
                appointmentPatient.id
            );

            if (isOccupied) {
                logger.warn('CALENDAR_CONFLICT', `Tentativa de agendamento em horário ocupado: ${patientData.date} ${patientData.time} para clínica [${targetClinicId}]`);
                const conflictErr = new Error('SLOT_OCCUPIED');
                conflictErr.code = 'SLOT_OCCUPIED';
                throw conflictErr;
            }

            return await db.appointments.create({
                patient_id:       appointmentPatient.id,
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
