function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

/**
 * ClinicaBot SaaS Pro — Módulo de Lembretes Automáticos de Consultas
 * 
 * Consulta os agendamentos marcados para o dia atual no fuso America/Sao_Paulo
 * e dispara mensagens personalizadas via WhatsApp para confirmação prévia dos pacientes.
 */

const calendarService = require('./calendarService');
const whatsappService = require('./whatsappService');
const db = require('./databaseService');
const logger = require('./logger');

class ReminderService {
    constructor() {
        this.processedReminders = new Set();
    }

    /**
     * Retorna a data atual no formato YYYY-MM-DD em fuso America/Sao_Paulo (com suporte a offset de dias)
     */
    getTodayBrtDateStr(offsetDays = 0) {
        const brtDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const brtObj = new Date(brtDateStr);
        if (offsetDays !== 0) {
            brtObj.setDate(brtObj.getDate() + offsetDays);
        }
        return `${brtObj.getFullYear()}-${String(brtObj.getMonth() + 1).padStart(2, '0')}-${String(brtObj.getDate()).padStart(2, '0')}`;
    }

    /**
     * Retorna o horário atual em BRT decomposto
     */
    getBrtTime() {
        const brtDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const brtObj = new Date(brtDateStr);
        const hours = brtObj.getHours();
        const minutes = brtObj.getMinutes();
        return {
            hours,
            minutes,
            totalMinutes: hours * 60 + minutes,
            timeStr: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
        };
    }

    /**
     * Converte data YYYY-MM-DD para DD/MM/YYYY (Regra 2)
     */
    formatBrtDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return dateStr;
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    /**
     * LEMBRETE D-1 (VÉSPERA / 1 DIA ANTES):
     * Processa consultas agendadas para o dia seguinte e envia lembrete no WhatsApp.
     * 
     * @param {boolean} isSimulation - Se true, não faz chamadas à API da Meta
     * @returns {Object} { tomorrowDate, totalTomorrow, sent, skipped, failed }
     */
    async processEveReminders(isSimulation = false) {
        const tomorrowStr = this.getTodayBrtDateStr(1);
        const tomorrowFormatted = this.formatBrtDate(tomorrowStr);
        logger.info('REMINDERS_D1', `Iniciando processamento de lembretes D-1 (Véspera) para: ${tomorrowStr} (${tomorrowFormatted})`);

        let stats = {
            tomorrowDate: tomorrowStr,
            totalTomorrow: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            details: []
        };

        try {
            const clinics = await db.clinics.getAll();

            for (const clinic of clinics) {
                const tomorrowAppts = await db.appointments.findByDate(tomorrowStr, clinic.id);
                if (!tomorrowAppts || tomorrowAppts.length === 0) continue;

                stats.totalTomorrow += tomorrowAppts.length;

                for (const appt of tomorrowAppts) {
                    const reminderKey = `${appt.id}_d1_${tomorrowStr}`;

                    // Evita disparo duplicado de véspera
                    if (this.processedReminders.has(reminderKey)) {
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Já enviado lembrete de véspera (memória)' });
                        continue;
                    }

                    const patientName = appt.patients?.name || 'Paciente';
                    const phone = appt.patients?.phone || appt.phone;
                    const time = (appt.appointment_time || '').substring(0, 5);
                    const procType = appt.type || 'Consulta';
                    const clinicName = clinic.name || 'nossa clínica';

                    if (!phone) {
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Telefone não informado' });
                        continue;
                    }

                    const reminderMsg = `Olá, ${patientName}! 😊 Passando para lembrar da sua consulta de *${procType}* agendada para amanhã (*${tomorrowFormatted}*) às *${time}* na ${clinicName}.\n\nPor favor, selecione uma das opções abaixo para confirmar sua presença ou alterar o atendimento:`;
                    const reminderButtons = ["Confirmar Presença", "Remarcar Consulta", "Cancelar Consulta"];

                    try {
                        if (!isSimulation) {
                            const clinicToken = clinic.whatsapp_token || clinic.token || null;
                            if (process.env.USE_WHATSAPP_TEMPLATES === 'true') {
                                const templateName = process.env.WHATSAPP_REMINDER_TEMPLATE || 'lembrete_consulta_clinica';
                                await whatsappService.sendTemplateMessage(phone, templateName, 'pt_BR', [patientName, procType, time], clinic.phone_number_id, clinicToken);
                            } else {
                                await whatsappService.sendButtonMessage(phone, reminderMsg, reminderButtons, clinic.phone_number_id, clinicToken);
                            }
                        }

                        this.processedReminders.add(reminderKey);
                        stats.sent++;

                        try {
                            await db.supabase.from('reminder_logs').insert({
                                appointment_id: appt.id,
                                clinic_id: clinic.id,
                                sent_at: new Date().toISOString()
                            });
                        } catch (logE) {
                            // Ignora erro de constraint única se log já existir
                        }

                        stats.details.push({ id: appt.id, phone, time, type: 'd1_eve', status: 'sent' });
                        logger.info('REMINDER_D1_SENT', `Lembrete D-1 enviado com sucesso para [${phone}] (Clínica ${clinic.slug}) - consulta amanhã às ${time}`);

                    } catch (sendErr) {
                        stats.failed++;
                        stats.details.push({ id: appt.id, phone, status: 'failed', error: sendErr.message });
                        logger.error('REMINDER_D1_FAILED', `Falha ao enviar lembrete D-1 para [${phone}]: ${sendErr.message}`);
                    }

                    // Pacing buffer de 50ms (Regra 28)
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            return stats;

        } catch (err) {
            logger.error('REMINDERS_D1_CRITICAL', `Erro no ciclo de lembretes D-1: ${err.message}`, err.stack);
            throw err;
        }
    }

    /**
     * LEMBRETE H-2 (2 HORAS ANTES):
     * Processa consultas de hoje que ocorrem dentro de 2 horas (janela de 105 a 135 minutos à frente).
     * 
     * @param {boolean} isSimulation - Se true, não faz chamadas à API da Meta
     * @param {number|null} forceCurrentMinutes - Opcional para testes e simulações
     * @returns {Object} { todayDate, totalToday, sent, skipped, failed }
     */
    async processTwoHourReminders(isSimulation = false, forceCurrentMinutes = null) {
        const todayStr = this.getTodayBrtDateStr(0);
        const brtNow = this.getBrtTime();
        const currentTotalMinutes = forceCurrentMinutes !== null ? forceCurrentMinutes : brtNow.totalMinutes;

        logger.info('REMINDERS_H2', `Iniciando verificação de lembretes H-2 para hoje ${todayStr} às ${brtNow.timeStr} (minuto ${currentTotalMinutes})`);

        let stats = {
            todayDate: todayStr,
            currentTime: brtNow.timeStr,
            totalToday: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            details: []
        };

        try {
            const clinics = await db.clinics.getAll();

            for (const clinic of clinics) {
                const todayAppts = await calendarService.getTodayAppointments(clinic.id);
                if (!todayAppts || todayAppts.length === 0) continue;

                stats.totalToday += todayAppts.length;

                for (const appt of todayAppts) {
                    const rawTime = (appt.appointment_time || '').substring(0, 5);
                    if (!rawTime || !rawTime.includes(':')) continue;

                    const [hStr, mStr] = rawTime.split(':');
                    const apptMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
                    const diffMinutes = apptMinutes - currentTotalMinutes;

                    // Janela de disparo H-2: entre 105 e 135 minutos de antecedência (2 horas ± 15 min)
                    const isWithinTwoHours = (diffMinutes >= 105 && diffMinutes <= 135);
                    if (!isWithinTwoHours) {
                        continue; // Fora da janela de 2 horas
                    }

                    const reminderKey = `${appt.id}_h2_${todayStr}_${rawTime}`;

                    // Evita disparo duplicado
                    if (this.processedReminders.has(reminderKey)) {
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Já enviado lembrete H-2 (memória)' });
                        continue;
                    }

                    const patientName = appt.patients?.name || 'Paciente';
                    const phone = appt.patients?.phone || appt.phone;
                    const procType = appt.type || 'Consulta';
                    const clinicName = clinic.name || 'nossa clínica';

                    if (!phone) {
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Telefone não informado' });
                        continue;
                    }

                    const reminderMsg = `Olá, ${patientName}! 😊 Passando para lembrar que sua consulta de *${procType}* na ${clinicName} é hoje daqui a 2 horas, às *${rawTime}*.\n\nPor favor, confirme se você já está a caminho ou se precisa de algum suporte:`;
                    const reminderButtons = ["Confirmar Presença", "Remarcar Consulta", "Cancelar Consulta"];

                    try {
                        if (!isSimulation) {
                            const clinicToken = clinic.whatsapp_token || clinic.token || null;
                            if (process.env.USE_WHATSAPP_TEMPLATES === 'true') {
                                const templateName = process.env.WHATSAPP_REMINDER_TEMPLATE || 'lembrete_consulta_clinica';
                                await whatsappService.sendTemplateMessage(phone, templateName, 'pt_BR', [patientName, procType, rawTime], clinic.phone_number_id, clinicToken);
                            } else {
                                await whatsappService.sendButtonMessage(phone, reminderMsg, reminderButtons, clinic.phone_number_id, clinicToken);
                            }
                        }

                        this.processedReminders.add(reminderKey);
                        stats.sent++;

                        try {
                            await db.supabase.from('reminder_logs').insert({
                                appointment_id: appt.id,
                                clinic_id: clinic.id,
                                sent_at: new Date().toISOString()
                            });
                        } catch (logE) {
                            // Ignora erro de constraint única se log já existir
                        }

                        stats.details.push({ id: appt.id, phone, time: rawTime, type: 'h2_immediate', status: 'sent' });
                        logger.info('REMINDER_H2_SENT', `Lembrete H-2 enviado com sucesso para [${phone}] (Clínica ${clinic.slug}) - consulta hoje às ${rawTime}`);

                    } catch (sendErr) {
                        stats.failed++;
                        stats.details.push({ id: appt.id, phone, status: 'failed', error: sendErr.message });
                        logger.error('REMINDER_H2_FAILED', `Falha ao enviar lembrete H-2 para [${phone}]: ${sendErr.message}`);
                    }

                    // Pacing buffer de 50ms (Regra 28)
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            return stats;

        } catch (err) {
            logger.error('REMINDERS_H2_CRITICAL', `Erro no ciclo de lembretes H-2: ${err.message}`, err.stack);
            throw err;
        }
    }

    /**
     * Processa a fila de agendamentos do dia e envia lembretes por WhatsApp.
     * Retorna estatísticas da execução.
     * 
     * @param {boolean} isSimulation - Se true, não faz chamadas à API da Meta
     * @returns {Object} { totalToday, sent, skipped, failed }
     */
    async processDailyReminders(isSimulation = false) {
        const todayStr = this.getTodayBrtDateStr(0);
        logger.info('REMINDERS', `Iniciando processamento de lembretes para o dia: ${todayStr}`);

        let stats = {
            todayDate: todayStr,
            totalToday: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            details: []
        };

        try {
            const clinics = await db.clinics.getAll();
            
            for (const clinic of clinics) {
                const todayAppts = await calendarService.getTodayAppointments(clinic.id);
                if (!todayAppts || todayAppts.length === 0) continue;
                
                stats.totalToday += todayAppts.length;

                for (const appt of todayAppts) {
                    const reminderKey = `${appt.id}_${todayStr}`;

                    // Evita disparo duplicado no mesmo dia
                    // 1. Check in-memory
                    if (this.processedReminders.has(reminderKey)) {
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Já enviado hoje (memória)' });
                        continue;
                    }

                    // 2. Check DB (Durabilidade P5)
                    const { data: alreadySent } = await db.supabase
                        .from('reminder_logs')
                        .select('id')
                        .eq('appointment_id', appt.id)
                        .eq('clinic_id', clinic.id)
                        .gte('sent_at', `${todayStr}T00:00:00Z`)
                        .lte('sent_at', `${todayStr}T23:59:59Z`)
                        .maybeSingle();

                    if (alreadySent) {
                        this.processedReminders.add(reminderKey); // Sync in-memory cache
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Já enviado hoje (banco)' });
                        continue;
                    }

                    const patientName = appt.patients?.name || 'Paciente';
                    const phone = appt.patients?.phone || appt.phone;
                    const time = (appt.appointment_time || '').substring(0, 5);
                    const procType = appt.type || 'Consulta';

                    if (!phone) {
                        stats.skipped++;
                        stats.details.push({ id: appt.id, status: 'skipped', reason: 'Telefone não encontrado' });
                        continue;
                    }

                    const reminderMsg = `Olá, ${patientName}! 😊 Passando para lembrar da sua consulta de *${procType}* agendada para hoje às *${time}* na clínica.\n\nPor favor, selecione uma das opções abaixo para confirmar sua presença ou alterar o atendimento:`;
                    const reminderButtons = ["Confirmar Presença", "Remarcar Consulta", "Cancelar Consulta"];

                    try {
                        if (!isSimulation) {
                            const clinicToken = clinic.whatsapp_token || clinic.token || null;
                            if (process.env.USE_WHATSAPP_TEMPLATES === 'true') {
                                const templateName = process.env.WHATSAPP_REMINDER_TEMPLATE || 'lembrete_consulta_clinica';
                                await whatsappService.sendTemplateMessage(phone, templateName, 'pt_BR', [patientName, procType, time], clinic.phone_number_id, clinicToken);
                            } else {
                                await whatsappService.sendButtonMessage(phone, reminderMsg, reminderButtons, clinic.phone_number_id, clinicToken);
                            }
                        }

                        this.processedReminders.add(reminderKey);
                        stats.sent++;
                        
                        // Grava no banco de dados para garantir que não haverá reenvio mesmo com restart
                        try {
                            const { error: logErr } = await db.supabase.from('reminder_logs').insert({
                                appointment_id: appt.id,
                                clinic_id: clinic.id,
                                sent_at: new Date().toISOString()
                            });
                            if (logErr) {
                                logger.error('REMINDER_LOG_FAILED', logErr.message);
                            }
                        } catch (e) {
                            logger.error('REMINDER_LOG_FAILED', e.message);
                        }

                        stats.details.push({ id: appt.id, phone, time, status: 'sent' });
                        logger.info('REMINDER_SENT', `Lembrete enviado com sucesso para [${phone}] (Clínica ${clinic.slug}) - consulta ${time}`);

                    } catch (sendErr) {
                        stats.failed++;
                        stats.details.push({ id: appt.id, phone, status: 'failed', error: sendErr.message });
                        logger.error('REMINDER_FAILED', `Falha ao enviar lembrete para [${phone}] (Clínica ${clinic.slug}): ${sendErr.message}`, sendErr.stack);
                    }

                    // Pacing buffer de 50ms para evitar estouro de MPS (Messages Per Second) na Meta
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            return stats;

        } catch (err) {
            logger.error('REMINDERS_CRITICAL', `Erro durante o ciclo de lembretes: ${err.message}`, err.stack);
            throw err;
        }
    }
}

module.exports = new ReminderService();
