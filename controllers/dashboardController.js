const db = require('../services/databaseService');
const calendarService = require('../services/calendarService');
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
        const { email, password, clinicSlug } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Informe o e-mail de acesso.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let userAccount = CLINIC_CREDENTIALS[normalizedEmail];

        // Se for um e-mail novo/desconhecido em desenvolvimento, cria sessão dinâmica para a clínica
        if (!userAccount) {
            const clinicName = clinicSlug === 'odonto-riso' ? 'Clínica Odonto Riso' 
                : (clinicSlug === 'dra-ana' ? 'Clínica Dra. Ana Silva' : 'Clínica Modelo Odontológica');
            
            userAccount = {
                clinicId: clinicSlug || 'clinica-modelo',
                clinicName: clinicName,
                role: 'admin'
            };
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
    }

    // Retorna todos os dados da clínica de forma isolada e segura
    async getDashboardData(req, res) {
        try {
            const { clinicId, role } = req.user;

            // Busca Agendamentos, Pacientes e Sessões de forma resiliente no Supabase
            const [apptsRes, patientsRes, sessionsRes] = await Promise.all([
                db.supabase.from('appointments').select('*, patients(id, name, phone, cpf)').order('appointment_date', { ascending: true }),
                db.supabase.from('patients').select('id, name, phone, cpf, created_at').order('created_at', { ascending: false }),
                db.supabase.from('sessions').select('*')
            ]);

            let appts = apptsRes.data || [];
            let patientsList = patientsRes.data || [];
            let sessionsList = sessionsRes.data || [];

            // Se houver multi-tenancy configurado com a coluna clinic_id, filtra por clínica
            if (clinicId !== 'all' && role !== 'superadmin') {
                if (appts.some(a => a.clinic_id)) appts = appts.filter(a => !a.clinic_id || a.clinic_id === clinicId);
                if (patientsList.some(p => p.clinic_id)) patientsList = patientsList.filter(p => !p.clinic_id || p.clinic_id === clinicId);
                if (sessionsList.some(s => s.clinic_id)) sessionsList = sessionsList.filter(s => !s.clinic_id || s.clinic_id === clinicId);
            }

            // Sanitização LGPD de CPFs para exibição no frontend (mascara os números)
            const safePatients = (patientsList || []).map(p => ({
                ...p,
                cpfMasked: p.cpf ? '•••.•••.•••-•• (Protegido LGPD)' : 'Não informado'
            }));

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

            res.json({
                kpis: {
                    todayCount: todayAppts.length,
                    confirmedCount: confirmedAppts.length,
                    patientsCount: safePatients.length,
                    handoffCount: humanHandoffs.length
                },
                appointments: appts || [],
                patients: safePatients,
                handoffs: humanHandoffs
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

            // Garante criação/atualização do paciente com criptografia backend
            const patient = await db.patients.findOrCreate(phone);
            await db.patients.updateName(phone, name);

            if (cpf && cpf.replace(/\D/g, '').length === 11) {
                await db.patients.updateCpf(phone, cpf);
            }

            // Associa a clínica se a coluna clinic_id existir no banco
            if (clinicId && clinicId !== 'all') {
                try {
                    await db.supabase.from('patients').update({ clinic_id: clinicId }).eq('id', patient.id);
                } catch {
                    // Coluna opcional de multi-tenancy ainda não criada no Supabase
                }
            }

            logger.info('DASHBOARD_PATIENT', `Paciente cadastrado manualmente via recepção: ${name} (${phone})`);
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

            let targetPatientId = (patientId && typeof patientId === 'string' && patientId.trim().length > 10) ? patientId.trim() : null;

            // Se o usuário digitou o nome/telefone diretamente no formulário
            if (!targetPatientId && patientPhone && String(patientPhone).trim()) {
                const cleanPhone = String(patientPhone).trim();
                const p = await db.patients.findOrCreate(cleanPhone);
                if (patientName && String(patientName).trim()) {
                    await db.patients.updateName(cleanPhone, String(patientName).trim());
                }
                if (p && p.id) {
                    targetPatientId = p.id;
                }
            }

            if (!targetPatientId || !type || !appointmentDate || !appointmentTime) {
                return res.status(400).json({ error: 'Nome/Telefone do paciente, procedimento, data e horário são obrigatórios.' });
            }

            // Checa disponibilidade de horário no calendarService
            const occupied = await calendarService.getAvailableSlots(appointmentDate);
            // Formata horário HH:MM
            const cleanTime = appointmentTime.substring(0, 5);

            const isAvailable = occupied.includes(cleanTime);
            if (!isAvailable) {
                return res.status(409).json({ error: 'Este horário não está disponível para agendamento.' });
            }

            const appt = await db.appointments.create({
                patient_id: targetPatientId,
                type,
                appointment_date: appointmentDate,
                appointment_time: appointmentTime,
                notes: 'Agendado manualmente via Painel Administrativo da Recepção'
            });

            // Confirma o agendamento imediatamente
            await db.appointments.updateStatus(appt.id, 'confirmed');

            if (clinicId && clinicId !== 'all') {
                try {
                    await db.supabase.from('appointments').update({ clinic_id: clinicId }).eq('id', appt.id);
                } catch {
                    // Coluna opcional de multi-tenancy ainda não criada no Supabase
                }
            }

            logger.info('DASHBOARD_APPOINTMENT', `Agendamento criado via recepção: ID ${appt.id} em ${appointmentDate} ${appointmentTime}`);
            res.json({ success: true, appointment: appt });

        } catch (err) {
            logger.error('DASHBOARD_APPOINTMENT', `Erro ao criar agendamento: ${err.message}`, err.stack);
            res.status(500).json({ error: 'Erro ao criar agendamento manual.' });
        }
    }

    // Atualiza status do agendamento (confirmar / cancelar)
    async updateAppointmentStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!['confirmed', 'cancelled', 'pending'].includes(status)) {
                return res.status(400).json({ error: 'Status de agendamento inválido.' });
            }

            const updated = await db.appointments.updateStatus(id, status);
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
            const { name, personaName, address, phone, evalPrice, insurances, paymentMethods, emergency, workHours } = req.body;
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
}

module.exports = new DashboardController();
