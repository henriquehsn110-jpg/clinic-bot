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
            const todayAppts = await calendarService.getTodayAppointments();
            stats.totalToday = todayAppts ? todayAppts.length : 0;

            if (!todayAppts || todayAppts.length === 0) {
                logger.info('REMINDERS', 'Nenhum agendamento encontrado para o dia de hoje.');
                return stats;
            }

            for (const appt of todayAppts) {
                const reminderKey = `${appt.id}_${todayStr}`;

                // Evita disparo duplicado no mesmo dia
                if (this.processedReminders.has(reminderKey)) {
                    stats.skipped++;
                    stats.details.push({ id: appt.id, status: 'skipped', reason: 'Já enviado hoje' });
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

                const reminderMsg = `Olá, ${patientName}! 😊 Passando para lembrar da sua consulta de *${procType}* agendada para hoje às *${time}* na clínica.\n\nPor favor, responda *CONFIRMAR* se puder comparecer ou digite *REMARCAR* caso precise alterar seu horário.`;

                try {
                    if (!isSimulation) {
                        await whatsappService.sendTextMessage(phone, reminderMsg);
                    }

                    this.processedReminders.add(reminderKey);
                    stats.sent++;
                    stats.details.push({ id: appt.id, phone, time, status: 'sent' });
                    logger.info('REMINDER_SENT', `Lembrete enviado com sucesso para [${phone}] - consulta ${time}`);

                } catch (sendErr) {
                    stats.failed++;
                    stats.details.push({ id: appt.id, phone, status: 'failed', error: sendErr.message });
                    logger.error('REMINDER_FAILED', `Falha ao enviar lembrete para [${phone}]: ${sendErr.message}`, sendErr.stack);
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
