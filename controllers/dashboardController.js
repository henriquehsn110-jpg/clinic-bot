const db = require('../services/databaseService');
const calendarService = require('../services/calendarService');
const whatsappService = require('../services/whatsappService');
const logger = require('../services/logger');
const crypto = require('crypto');

// Chave secreta interna para assinar tokens de sessão do dashboard.
// SEGURANÇA: Em produção, APP_SECRET DEVE estar definido — sem fallback hardcoded.
if (process.env.NODE_ENV === 'production' && !process.env.APP_SECRET) {
    console.error('❌ ERRO CRÍTICO DE SEGURANÇA: APP_SECRET não está definido no ambiente de produção. Abortando para impedir uso de segredo hardcoded.');
    process.exit(1);
}
const SESSION_SECRET = process.env.APP_SECRET || 'dev_only_fallback_not_for_production';

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

    // Comparação timing-safe para prevenir timing attacks na verificação HMAC
    // (mesmo padrão usado em verifySignature() do server.js para webhooks da Meta)
    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

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

    // Middleware de Autorização por Role (RBAC)
    authorize(...allowedRoles) {
        return (req, res, next) => {
            if (!req.user || !req.user.role) {
                return res.status(401).json({ error: 'Acesso não autorizado: sessão não identificada.' });
            }
            if (!allowedRoles.includes(req.user.role)) {
                logger.warn('RBAC_DENIED', `Acesso negado para role '${req.user.role}' na rota ${req.originalUrl}`);
                return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para este recurso.' });
            }
            next();
        };
    }

    // Middleware de Resolução Centralizada de Clinic ID (Slug → UUID & SuperAdmin Guard)
    async resolveClinicId(req, res, next) {
        try {
            const { clinicId, role } = req.user || {};
            req.isSuperAdmin = (role === 'superadmin' || clinicId === 'all');

            if (req.isSuperAdmin) {
                req.resolvedClinicId = null;
                return next();
            }

            if (!clinicId) {
                logger.warn('RESOLVE_CLINIC_ID_FAIL', `Acesso negado: token sem clinicId para o usuário ${req.user?.email}`);
                return res.status(403).json({ error: 'Acesso negado: nenhuma clínica associada a este usuário.' });
            }

            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId);
            if (isUuid) {
                req.resolvedClinicId = clinicId;
            } else {
                const { data: cRow } = await db.supabase.from('clinics').select('id').eq('slug', clinicId).maybeSingle();
                if (cRow && cRow.id) {
                    req.resolvedClinicId = cRow.id;
                } else {
                    logger.warn('RESOLVE_CLINIC_ID_NOT_FOUND', `Acesso negado: slug de clínica '${clinicId}' não cadastrado no banco para usuário ${req.user?.email}`);
                    return res.status(403).json({ error: 'Acesso negado: clínica não cadastrada no sistema.' });
                }
            }

            next();
        } catch (err) {
            logger.error('RESOLVE_CLINIC_ID_ERR', `Erro ao resolver clinic_id: ${err.message}`);
            return res.status(500).json({ error: 'Falha interna ao verificar credenciais de tenant.' });
        }
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
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 200);
            const offset = (page - 1) * limit;
            const targetClinicId = req.resolvedClinicId;

            let clinicIdToFetch = targetClinicId;
            if (!clinicIdToFetch) {
                const { data: cRow } = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').maybeSingle();
                clinicIdToFetch = cRow?.id || null;
            }

            let clinicQuery = clinicIdToFetch ? db.supabase.from('clinics').select('id, name, slug, whatsapp_list_title, work_hours, address, eval_price').eq('id', clinicIdToFetch).maybeSingle() : Promise.resolve({ data: null });

            let apptsQuery = db.supabase.from('appointments').select('*, patients(id, name, phone, cpf)', { count: 'exact' }).is('deleted_at', null).order('appointment_date', { ascending: true }).range(offset, offset + limit - 1);
            let patientsQuery = db.supabase.from('patients').select('id, name, phone, cpf, created_at', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
            let sessionsQuery = db.supabase.from('sessions').select('*').is('deleted_at', null);

            if (!req.isSuperAdmin && !targetClinicId) {
                return res.status(403).json({ error: 'Acesso negado: clínica não resolvida.' });
            }

            if (!req.isSuperAdmin && targetClinicId) {
                apptsQuery = apptsQuery.eq('clinic_id', targetClinicId);
                patientsQuery = patientsQuery.eq('clinic_id', targetClinicId);
                sessionsQuery = sessionsQuery.eq('clinic_id', targetClinicId);
            }

            const [apptsRes, patientsRes, sessionsRes, clinicRes] = await Promise.all([
                apptsQuery,
                patientsQuery,
                sessionsQuery,
                clinicQuery
            ]);

            let appts = apptsRes.data || [];
            let patientsList = patientsRes.data || [];
            let sessionsList = sessionsRes.data || [];
            let clinicData = clinicRes?.data || null;

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

            let parsedSettings = {};
            if (clinicData) {
                if (clinicData.work_hours && clinicData.work_hours.startsWith('{')) {
                    try { parsedSettings = JSON.parse(clinicData.work_hours); } catch {}
                }
                if (!parsedSettings.name && clinicData.name) parsedSettings.name = clinicData.name;
                if (!parsedSettings.address && clinicData.address) parsedSettings.address = clinicData.address;
                if (!parsedSettings.evalPrice && clinicData.eval_price) parsedSettings.evalPrice = String(clinicData.eval_price);
                if (!parsedSettings.personaName) parsedSettings.personaName = 'Ana';
            }

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
                doctors: doctorsList,
                clinicName: clinicData?.name || null,
                whatsappListTitle: clinicData?.whatsapp_list_title || 'Tratamentos',
                settings: parsedSettings
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
            const targetClinicId = req.resolvedClinicId;

            if (!name || !phone) {
                return res.status(400).json({ error: 'Nome e telefone do paciente são obrigatórios.' });
            }

            if (!targetClinicId && !req.isSuperAdmin) {
                return res.status(400).json({ error: 'É necessário estar associado a uma clínica válida para cadastrar pacientes.' });
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
            const targetClinicId = req.resolvedClinicId;

            if (!targetClinicId && !req.isSuperAdmin) {
                return res.status(400).json({ error: 'É necessário estar associado a uma clínica válida para agendar consultas.' });
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

            logger.info('DASHBOARD_APPOINTMENT', `Agendamento criado via recepção: ID ${appt.id} em ${appointmentDate} ${appointmentTime} (Clínica ${targetClinicId})`);
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
            const targetClinicId = req.resolvedClinicId || (req.user?.clinicId !== 'all' ? req.user?.clinicId : null);

            if (!['confirmed', 'cancelled', 'pending'].includes(status)) {
                return res.status(400).json({ error: 'Status de agendamento inválido.' });
            }

            // Busca o agendamento e o paciente associado de forma robusta
            const { data: apptData } = await db.supabase
                .from('appointments')
                .select('*, patients(*)')
                .eq('id', id)
                .maybeSingle();

            if (!apptData) {
                return res.status(404).json({ error: 'Agendamento não encontrado.' });
            }

            // SEGURANÇA MULTI-TENANT (VULN-01): Impede que uma clínica modifique agendamento de outra
            if (!req.isSuperAdmin && apptData.clinic_id && targetClinicId && apptData.clinic_id !== targetClinicId) {
                logger.warn('TENANT_VIOLATION', `Tentativa bloqueada de alterar agendamento de outra clínica: Usuário tenant=${targetClinicId}, Agendamento tenant=${apptData.clinic_id}`);
                return res.status(403).json({ error: 'Acesso negado: este agendamento pertence a outra clínica.' });
            }

            let clinicData = null;
            if (apptData && apptData.clinic_id) {
                const { data: cData } = await db.supabase
                    .from('clinics')
                    .select('*')
                    .eq('id', apptData.clinic_id)
                    .maybeSingle();
                clinicData = cData;
            }

            const updated = await db.appointments.updateStatus(id, status, targetClinicId || apptData.clinic_id);

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

            // SEGURANÇA (VULN-02): Usa req.resolvedClinicId do middleware ou req.user.clinicId (camelCase)
            const targetClinicId = req.resolvedClinicId || req.user?.clinicId;
            await db.sessions.delete(phone, targetClinicId);
            logger.info('DASHBOARD_HANDOFF', `Sessão [${phone}] devolvida para a IA via painel (Clínica: ${targetClinicId}).`);
            res.json({ success: true });

        } catch (err) {
            logger.error('DASHBOARD_HANDOFF', `Erro ao devolver sessão para IA: ${err.message}`, err.stack);
            res.status(500).json({ error: 'Erro ao devolver sessão.' });
        }
    }

    // Salva configurações personalizadas da clínica e da IA
    async updateSettings(req, res) {
        try {
            const { name, personaName, whatsappListTitle, address, phone, evalPrice, insurances, paymentMethods, emergency, workHours, minCancellationHours, procedures } = req.body;
            let targetClinicId = req.resolvedClinicId;

            if (!targetClinicId && req.isSuperAdmin) {
                const { data: cRow } = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').maybeSingle();
                targetClinicId = cRow?.id || null;
            }

            if (!targetClinicId) {
                return res.status(400).json({ error: 'Clínica não encontrada para atualização de configurações.' });
            }

            const safeWorkHours = (workHours && typeof workHours === 'string' && workHours.trim())
                ? workHours.trim()
                : 'Segunda a Sexta-feira, das 08:00 às 18:00';

            const settings = {
                name,
                personaName,
                address,
                phone,
                evalPrice,
                insurances,
                paymentMethods,
                emergency,
                workHours: safeWorkHours,
                minCancellationHours: minCancellationHours || '4',
                procedures: procedures || 'Consulta Geral, Limpeza, Tratamento de Canal, Implantes, Clareamento Dental',
                updatedAt: new Date().toISOString()
            };

            // SEGURANÇA MULTI-TENANT (VULN-03): Salva usando a UUID da clínica resolvida (não o slug)
            if (db.supabase && targetClinicId) {
                const updatePayload = {
                    name,
                    address: address || null,
                    eval_price: parseFloat(evalPrice) || 150,
                    whatsapp_list_title: whatsappListTitle || 'Tratamentos',
                    work_hours: JSON.stringify(settings)
                };

                logger.info('DASHBOARD_SETTINGS', `Salvando configurações: personaName="${personaName}", clinicId=${targetClinicId}`);
                const { error: updateErr } = await db.supabase.from('clinics').update(updatePayload).eq('id', targetClinicId);
                if (updateErr) {
                    logger.error('DASHBOARD_SETTINGS', `Erro ao gravar no Supabase: ${updateErr.message}`);
                    return res.status(500).json({ error: `Erro ao salvar no banco: ${updateErr.message}` });
                }
                logger.info('DASHBOARD_SETTINGS', `Configurações gravadas com sucesso. personaName="${personaName}" persistido em work_hours.`);
            }

            logger.info('DASHBOARD_SETTINGS', `Configurações da clínica [${targetClinicId}] atualizadas via painel.`);
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
            const targetClinicId = req.resolvedClinicId;
            const limit = parseInt(req.query.limit) || 100;

            if (db.supabase) {
                let query = db.supabase
                    .from('webhook_logs')
                    .select('id, clinic_id, event_type, payload_summary, created_at')
                    .order('created_at', { ascending: false })
                    .limit(limit);

                if (!req.isSuperAdmin && targetClinicId) {
                    query = query.eq('clinic_id', targetClinicId);
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
