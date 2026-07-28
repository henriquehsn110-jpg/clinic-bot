const db = require('../services/databaseService');
const calendarService = require('../services/calendarService');
const whatsappService = require('../services/whatsappService');
const logger = require('../services/logger');
const crypto = require('crypto');

// Chave secreta interna para assinar tokens de sessão simples do dashboard
const SESSION_SECRET = process.env.APP_SECRET || 'clinicabot_secure_session_secret_2026';

// Simulação de banco de credenciais de clínicas para demonstração segura
const CLINIC_CREDENTIALS = {
    'admin@clinicamodelo.com.br': {
        passwordHash: crypto.createHash('sha256').update('123456').digest('hex'),
        clinicId: 'clinica-modelo',
        clinicName: 'Clínica Modelo Odontológica',
        phone: '5511972008720',
        role: 'admin'
    },
    'admin@odontoriso.com.br': {
        passwordHash: crypto.createHash('sha256').update('123456').digest('hex'),
        clinicId: 'odonto-riso',
        clinicName: 'Clínica Odonto Riso',
        role: 'clinic'
    },
    'master@clinicabot.com.br': {
        passwordHash: crypto.createHash('sha256').update('master123').digest('hex'),
        clinicId: 'all',
        clinicName: 'Super Admin SaaS',
        role: 'superadmin'
    }
};

// Gerador de Token de Sessão Assinado
function generateToken(payload) {
    const data = JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 });
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
    return Buffer.from(data).toString('base64') + '.' + signature;
}

// Validador de Token
function verifyToken(tokenString) {
    if (!tokenString) return null;
    const parts = tokenString.replace('Bearer ', '').split('.');
    if (parts.length !== 2) return null;

    const dataRaw = Buffer.from(parts[0], 'base64').toString('utf8');
    const signature = parts[1];

    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(dataRaw).digest('hex');
    if (signature !== expectedSig) return null;

    try {
        const payload = JSON.parse(dataRaw);
        if (payload.exp < Date.now()) return null; // Token expirado
        return payload;
    } catch {
        return null;
    }
}

class DashboardController {

    // Middleware para proteção de rotas da API do Dashboard
    authenticate(req, res, next) {
        const authHeader = req.headers['authorization'];
        const user = verifyToken(authHeader);

        if (!user) {
            return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
        }

        req.user = user;
        next();
    }

    // Login seguro da Clínica / Secretária
    async login(req, res) {
        try {
            const { email, password } = req.body || {};

            if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
                return res.status(401).json({ error: 'E-mail e senha são obrigatórios.' });
            }

            const normalizedEmail = email.toLowerCase().trim();
            const userAccount = CLINIC_CREDENTIALS[normalizedEmail];

            if (!userAccount) {
                return res.status(401).json({ error: 'Credenciais inválidas.' });
            }

            const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
            if (passwordHash !== userAccount.passwordHash) {
                return res.status(401).json({ error: 'Credenciais inválidas.' });
            }

            const token = generateToken({
                email: normalizedEmail,
                clinicId: userAccount.clinicId,
                clinicName: userAccount.clinicName,
                role: userAccount.role
            });

            logger.info('DASHBOARD_AUTH', `Login efetuado com sucesso: ${normalizedEmail} (${userAccount.clinicName})`);

            res.json({
                success: true,
                token,
                user: {
                    email: normalizedEmail,
                    clinicId: userAccount.clinicId,
                    clinicName: userAccount.clinicName,
                    role: userAccount.role
                }
            });
        } catch (err) {
            logger.error('DASHBOARD_AUTH', `Erro no login: ${err.message}`);
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }
    }

    // Retorna dados da clínica com suporte à Paginação e Isolamento Multi-Tenant (P8)
    async getDashboardData(req, res) {
        try {
            const { clinicId, role } = req.user || {};
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
            const offset = (page - 1) * limit;

            // Resolve slug de clínica para UUID caso o login tenha retornado o slug (ex: 'clinica-modelo')
            let targetClinicId = clinicId;
            if (clinicId && clinicId !== 'all' && role !== 'superadmin') {
                // Verifica se clinicId já é UUID válido ou se é slug
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId);
                if (!isUuid) {
                    const { data: cRow } = await db.supabase.from('clinics').select('id').eq('slug', clinicId).maybeSingle();
                    if (cRow) targetClinicId = cRow.id;
                }
            }

            let apptsQuery = db.supabase.from('appointments').select('*, patients(id, name, phone, cpf)', { count: 'exact' }).is('deleted_at', null).order('appointment_date', { ascending: true }).range(offset, offset + limit - 1);
            let patientsQuery = db.supabase.from('patients').select('id, name, phone, cpf, created_at', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
            let sessionsQuery = db.supabase.from('sessions').select('*').is('deleted_at', null);

            if (targetClinicId && targetClinicId !== 'all' && role !== 'superadmin') {
                apptsQuery = apptsQuery.eq('clinic_id', targetClinicId);
                patientsQuery = patientsQuery.eq('clinic_id', targetClinicId);
                sessionsQuery = sessionsQuery.eq('clinic_id', targetClinicId);
            }

            const [apptsRes, patientsRes, sessionsRes] = await Promise.all([
                apptsQuery,
                patientsQuery,
                sessionsQuery
            ]);

            let appts = apptsRes.data || [];
            let patientsList = patientsRes.data || [];
            let sessionsList = sessionsRes.data || [];

            // Sanitização LGPD de CPFs para exibição no frontend (mascara os números e remove CPF bruto)
            const safePatients = (patientsList || []).map(p => {
                const { cpf, ...rest } = p;
                return {
                    ...rest,
                    cpfMasked: cpf ? '•••.•••.•••-•• (Protegido LGPD)' : 'Não informado'
                };
            });

            // Filtra sessões em Handoff Humano
            const humanHandoffs = (sessionsList || []).filter(s => {
                const history = s.history || [];
                const lastMsg = history[history.length - 1];
                return lastMsg && lastMsg.parts && lastMsg.parts[0] && lastMsg.parts[0].text && lastMsg.parts[0].text.includes('[SISTEMA: conversa transferida para atendente humano]');
            });

            const brtDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const brtObj = new Date(brtDateStr);
            const todayStr = `${brtObj.getFullYear()}-${String(brtObj.getMonth() + 1).padStart(2, '0')}-${String(brtObj.getDate()).padStart(2, '0')}`;
            const todayAppts = (appts || []).filter(a => a.appointment_date === todayStr);
            const confirmedAppts = (appts || []).filter(a => a.status === 'confirmed');

            const doctorsList = [
                { id: 'doc_1', name: 'Dr. Carlos Eduardo', specialty: 'Ortodontia & Aparelhos', cro: 'CRO-SP 112233', available_days: 'Seg, Qua, Sex (08h às 18h)', status: 'Ativo', avatar: '👨‍⚕️' },
                { id: 'doc_2', name: 'Dra. Juliana Mendes', specialty: 'Odontopediatria & Limpeza', cro: 'CRO-SP 445566', available_days: 'Ter, Qui, Sáb (08h às 18h)', status: 'Ativo', avatar: '👩‍⚕️' },
                { id: 'doc_3', name: 'Dr. Roberto Alves', specialty: 'Implantes & Próteses', cro: 'CRO-SP 778899', available_days: 'Seg, Ter, Qui (08h às 18h)', status: 'Ativo', avatar: '👨‍⚕️' }
            ];

            res.json({
                pagination: {
                    page,
                    limit,
                    totalAppts: apptsRes.count || appts.length,
                    totalPatients: patientsRes.count || safePatients.length
                },
                kpis: {
                    todayCount: todayAppts.length,
                    confirmedCount: confirmedAppts.length,
                    patientsCount: safePatients.length,
                    handoffCount: humanHandoffs.length
                },
                appointments: appts || [],
                patients: safePatients,
                handoffs: humanHandoffs,
                doctors: doctorsList
            });

        } catch (err) {
            logger.error('DASHBOARD_DATA', `Erro ao buscar dados do dashboard: ${err.message}`, err.stack);
            res.status(500).json({ error: 'Falha interna ao carregar dados do painel.' });
        }
    }

    // Cadastro seguro de paciente pela Recepção (com Criptografia de CPF)
    async createPatient(req, res) {
        try {
            const { name, phone, cpf } = req.body;
            const { clinicId } = req.user;

            if (!name || !phone) {
                return res.status(400).json({ error: 'Nome e telefone do paciente são obrigatórios.' });
            }

            let targetClinicId = clinicId;
            if (clinicId && clinicId !== 'all' && req.user?.role !== 'superadmin') {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId);
                if (!isUuid) {
                    const { data: cRow } = await db.supabase.from('clinics').select('id').eq('slug', clinicId).maybeSingle();
                    if (cRow) targetClinicId = cRow.id;
                }
            } else if (!targetClinicId || targetClinicId === 'all') {
                const { data: firstClinic } = await db.supabase.from('clinics').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
                if (firstClinic) targetClinicId = firstClinic.id;
            }

            if (!targetClinicId || targetClinicId === 'all') {
                return res.status(400).json({ error: 'É necessário estar associado a uma clínica para cadastrar pacientes.' });
            }

            const cleanPhone = String(phone).trim();
            const patient = await db.patients.findOrCreate(cleanPhone, targetClinicId);
            await db.patients.updateName(cleanPhone, name, targetClinicId);

            if (cpf && cpf.replace(/\D/g, '').length === 11) {
                await db.patients.updateCpf(cleanPhone, cpf, targetClinicId);
            }

            logger.info('DASHBOARD_PATIENT', `Paciente cadastrado manualmente via recepção: ${name} (${cleanPhone}) na clínica ${targetClinicId}`);
            res.json({ success: true, patient });

        } catch (err) {
            logger.error('DASHBOARD_PATIENT', `Erro ao criar paciente: ${err.message}`, err.stack);
            res.status(500).json({ error: 'Erro ao cadastrar paciente.' });
        }
    }

    // Agendamento manual de consulta via Recepção (com validação de conflito de horário)
    async createAppointment(req, res) {
        try {
            const { patientId, patientName, patientPhone, type, appointmentDate, appointmentTime } = req.body;
            const { clinicId } = req.user;
            let targetClinicId = clinicId;
            if (clinicId && clinicId !== 'all') {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId);
                if (!isUuid) {
                    const { data: cRow } = await db.supabase.from('clinics').select('id').eq('slug', clinicId).maybeSingle();
                    if (cRow) targetClinicId = cRow.id;
                }
            }

            let targetPatientId = (patientId && typeof patientId === 'string' && patientId.trim().length > 10) ? patientId.trim() : null;

            // Se o usuário digitou o nome/telefone diretamente no formulário
            if (!targetPatientId && patientPhone && String(patientPhone).trim()) {
                const cleanPhone = String(patientPhone).trim();
                const p = await db.patients.findOrCreate(cleanPhone, targetClinicId);
                if (patientName && String(patientName).trim()) {
                    await db.patients.updateName(cleanPhone, String(patientName).trim(), targetClinicId);
                }
                if (p && p.id) {
                    targetPatientId = p.id;
                }
            }

            if (!targetPatientId || !type || !appointmentDate || !appointmentTime) {
                return res.status(400).json({ error: 'Nome/Telefone do paciente, procedimento, data e horário são obrigatórios.' });
            }

            // Checa disponibilidade de horário no calendarService
            const availableSlots = await calendarService.getAvailableSlots(appointmentDate, targetClinicId);
            // Formata horário HH:MM
            const cleanTime = appointmentTime.substring(0, 5);

            const isAvailable = availableSlots.includes(cleanTime);
            if (!isAvailable) {
                return res.status(409).json({ error: 'Este horário não está disponível para agendamento.' });
            }

            const appt = await db.appointments.create({
                patient_id: targetPatientId,
                clinic_id: targetClinicId,
                type,
                appointment_date: appointmentDate,
                appointment_time: appointmentTime,
                notes: 'Agendado manualmente via Painel Administrativo da Recepção'
            });

            // Confirma o agendamento imediatamente
            await db.appointments.updateStatus(appt.id, 'confirmed', targetClinicId);

            logger.info('DASHBOARD_APPOINTMENT', `Agendamento criado via recepção: ID ${appt.id} em ${appointmentDate} ${appointmentTime} (Clínica ${clinicId})`);
            res.json({ success: true, appointment: appt });

        } catch (err) {
            logger.error('DASHBOARD_APPOINTMENT', `Erro ao criar agendamento: ${err.message}`, err.stack);
            res.status(500).json({ error: 'Erro ao criar agendamento manual.' });
        }
    }

    // Atualiza status do agendamento (confirmar / cancelar) e notifica o paciente via WhatsApp
    async updateAppointmentStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, reason } = req.body;
            const { clinicId } = req.user || {};
            let targetClinicId = clinicId;
            if (clinicId && clinicId !== 'all') {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId);
                if (!isUuid) {
                    const { data: cRow } = await db.supabase.from('clinics').select('id').eq('slug', clinicId).maybeSingle();
                    if (cRow) targetClinicId = cRow.id;
                }
            }

            if (!['confirmed', 'cancelled', 'pending'].includes(status)) {
                return res.status(400).json({ error: 'Status de agendamento inválido.' });
            }

            // Busca o agendamento e o paciente associado de forma robusta
            const { data: apptData } = await db.supabase
                .from('appointments')
                .select('*, patients(*)')
                .eq('id', id)
                .maybeSingle();

            let clinicData = null;
            if (apptData && apptData.clinic_id) {
                const { data: cData } = await db.supabase
                    .from('clinics')
                    .select('*')
                    .eq('id', apptData.clinic_id)
                    .maybeSingle();
                clinicData = cData;
            }

            const updated = await db.appointments.updateStatus(id, status, targetClinicId);

            // Dispara notificação automática no WhatsApp do paciente em caso de confirmação ou cancelamento
            if (apptData && apptData.patients && apptData.patients.phone) {
                const pPhone = apptData.patients.phone;
                const pName = apptData.patients.name || 'Paciente';
                const dateParts = (apptData.appointment_date || '').split('-');
                const brtDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : apptData.appointment_date;
                const brtTime = (apptData.appointment_time || '').substring(0, 5);
                const phoneId = clinicData?.phone_number_id || process.env.META_PHONE_NUMBER_ID || null;
                const clinicToken = clinicData?.whatsapp_token || clinicData?.token || process.env.META_WHATSAPP_TOKEN || null;
                const clinicName = clinicData?.name || 'Clínica Modelo';

                if (status === 'cancelled') {
                    let cancelMsg = `Olá, ${pName}! Informamos que sua consulta do dia ${brtDate} às ${brtTime} foi cancelada pela recepção da ${clinicName}.`;
                    if (reason && reason.trim()) {
                        cancelMsg += `\n\nMotivo: ${reason.trim()}`;
                    }
                    cancelMsg += `\n\nSe desejar escolher um novo horário, clique no botão abaixo para reagendar:`;
                    
                    logger.info('DASHBOARD_NOTIFY', `Enviando notificação de cancelamento com botão Reagendar para ${pPhone}...`);
                    await whatsappService.sendButtonMessage(pPhone, cancelMsg, ["Reagendar Consulta"], phoneId, clinicToken).catch(err => {
                        logger.warn('DASHBOARD_NOTIFY', `Erro ao notificar cancelamento via WhatsApp: ${err.message}`);
                    });
                } else if (status === 'confirmed') {
                    const confirmMsg = `Olá, ${pName}! Sua consulta do dia ${brtDate} às ${brtTime} foi confirmada pela recepção da ${clinicName}. Esperamos por você! 😊`;
                    logger.info('DASHBOARD_NOTIFY', `Enviando notificação de confirmação para ${pPhone}...`);
                    await whatsappService.sendTextMessage(pPhone, confirmMsg, phoneId, clinicToken).catch(err => {
                        logger.warn('DASHBOARD_NOTIFY', `Erro ao notificar confirmação via WhatsApp: ${err.message}`);
                    });
                }
            }

            logger.info('DASHBOARD_APPOINTMENT', `Status do agendamento ${id} alterado para ${status} via recepção.`);
            res.json({ success: true, appointment: updated });

        } catch (err) {
            logger.error('DASHBOARD_APPOINTMENT', `Erro ao atualizar status do agendamento: ${err.message}`, err.stack);
            res.status(500).json({ error: 'Erro ao atualizar status.' });
        }
    }

    // Devolve paciente em Handoff Humano de volta para a IA
    async returnHandoffToAI(req, res) {
        try {
            const { phone } = req.body;
            if (!phone) return res.status(400).json({ error: 'Telefone é obrigatório.' });

            await db.sessions.delete(phone);
            logger.info('DASHBOARD_HANDOFF', `Sessão [${phone}] devolvida para a IA via painel.`);
            res.json({ success: true });

        } catch (err) {
            logger.error('DASHBOARD_HANDOFF', `Erro ao devolver sessão para IA: ${err.message}`, err.stack);
            res.status(500).json({ error: 'Erro ao devolver sessão.' });
        }
    }

    // Salva configurações personalizadas da clínica e da IA
    async updateSettings(req, res) {
        try {
            const { name, personaName, whatsappListTitle, address, phone, evalPrice, insurances, paymentMethods, emergency, workHours } = req.body;
            const { clinicId } = req.user;

            const settings = {
                name,
                personaName,
                address,
                phone,
                evalPrice,
                insurances,
                paymentMethods,
                emergency,
                workHours,
                updatedAt: new Date().toISOString()
            };

            // Salva no banco de dados na tabela 'clinics' (se existir) ou atualiza registro
            if (db.supabase && clinicId && clinicId !== 'all') {
                await db.supabase.from('clinics').upsert({
                    id: clinicId,
                    name,
                    whatsapp_list_title: whatsappListTitle || 'Tratamentos',
                    settings
                });
            }

            logger.info('DASHBOARD_SETTINGS', `Configurações da clínica [${clinicId}] atualizadas via painel.`);
            res.json({ success: true, settings });

        } catch (err) {
            logger.error('DASHBOARD_SETTINGS', `Erro ao salvar configurações: ${err.message}`, err.stack);
            res.status(500).json({ error: 'Erro ao salvar configurações no servidor.' });
        }
    }

    // Endpoint de Integração SIEM Corporativo (Item 68 da Matriz Bradesco GTI)
    // Permite que sistemas de SIEM (Datadog, Splunk, QRadar) consumam os logs de auditoria em tempo real
    async getAuditStream(req, res) {
        try {
            const { clinicId } = req.user;
            const limit = parseInt(req.query.limit) || 100;

            if (db.supabase) {
                let query = db.supabase
                    .from('webhook_logs')
                    .select('id, clinic_id, event_type, payload_summary, created_at')
                    .order('created_at', { ascending: false })
                    .limit(limit);

                if (clinicId && clinicId !== 'all') {
                    query = query.eq('clinic_id', clinicId);
                }

                const { data, error } = await query;
                if (error) throw new Error(`[DB_SIEM] Erro ao buscar logs: ${error.message}`);
                return res.json({ format: "SIEM_JSON_v1", timestamp: new Date().toISOString(), events: data || [] });
            }

            return res.json({ format: "SIEM_JSON_v1", timestamp: new Date().toISOString(), events: [] });
        } catch (err) {
            logger.error('SIEM_STREAM_ERR', `Erro na exportação SIEM: ${err.message}`);
            res.status(500).json({ error: 'Erro ao gerar stream SIEM.' });
        }
    }
}

module.exports = new DashboardController();
