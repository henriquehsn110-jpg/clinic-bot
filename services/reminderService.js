
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
     * Retorna a data atual no formato YYYY-MM-DD em fuso America/Sao_Paulo
     */
    getTodayBrtDateStr() {
        const brtDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const brtObj = new Date(brtDateStr);
        return `${brtObj.getFullYear()}-${String(brtObj.getMonth() + 1).padStart(2, '0')}-${String(brtObj.getDate()).padStart(2, '0')}`;
    }

    /**
     * Processa a fila de agendamentos do dia e envia lembretes por WhatsApp.
     * Retorna estatísticas da execução.
     * 
     * @param {boolean} isSimulation - Se true, não faz chamadas à API da Meta
     * @returns {Object} { totalToday, sent, skipped, failed }
     */
    async processDailyReminders(isSimulation = false) {
        const todayStr = this.getTodayBrtDateStr();
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
