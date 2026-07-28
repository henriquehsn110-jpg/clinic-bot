const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

// ── Sanitização de Variáveis de Ambiente ──────────────────────────────────────
function cleanEnvVar(val) {
    if (val == null) return '';
    let str = String(val).trim();
    let prev;
    do {
        prev = str;
        str = str.trim().replace(/^["']+|["']+$|^[`]+|[`]+$/g, '').trim();
    } while (str !== prev);
    return str;
}

// ── Conexão ────────────────────────────────────────────────────────────────────
const supabaseUrl = cleanEnvVar(process.env.SUPABASE_URL);
const supabaseKey = cleanEnvVar(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

const supabase = createClient(supabaseUrl, supabaseKey);

const crypto = require('crypto');

// ── Criptografia (CPF) ─────────────────────────────────────────────────────────
// Estratégia de Cifragem: AES-256-GCM para confidencialidade, com Blind Indexing via HMAC-SHA256
// para permitir a busca (findByCpf) de forma determinística sem vazar o CPF.
// Chaves: Usamos uma chave dedicada CPF_ENCRYPTION_KEY para não acoplar com as credenciais do Supabase.
// A chave deve ter 32 bytes (64 caracteres hexadecimais).
const cpfKey = process.env.CPF_ENCRYPTION_KEY;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !cpfKey) {
    logger.error('SECURITY_CRITICAL', 'CPF_ENCRYPTION_KEY não definida em produção! Desligando processo para evitar gravação de dados não seguros.');
    process.exit(1);
}

if (cpfKey && !/^[0-9a-fA-F]{64}$/.test(cpfKey)) {
    logger.error('SECURITY_CRITICAL', 'CPF_ENCRYPTION_KEY possui formato inválido. Deve ser um hexadecimal de 64 caracteres.');
    process.exit(1);
}

const ENCRYPTION_SECRET = cpfKey 
    ? Buffer.from(cpfKey, 'hex') 
    : Buffer.from('0123456789012345678901234567890123456789012345678901234567890123', 'hex'); // Fallback APENAS para dev

function encryptData(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_SECRET, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptData(encryptedData) {
    if (!encryptedData) return null;
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData; // Fallback caso seja CPF antigo plano
    try {
        const [ivHex, authTagHex, encryptedHex] = parts;
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_SECRET, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        logger.warn('DECRYPTION', `Falha ao descriptografar dado com a chave atual. O registro pode ter sido cifrado com uma chave anterior.`);
        return null;
    }
}

function hashForSearch(text) {
    return crypto.createHmac('sha256', ENCRYPTION_SECRET).update(text).digest('hex');
}

// Função auxiliar de retry com backoff exponencial para resiliência de banco
async function withRetry(operation, retries = 3, delay = 200) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (error.code === '23505' || (error.message && error.message.includes('23505'))) {
                throw error;
            }
            if (attempt === retries) throw error;
            logger.warn('DATABASE', `Falha temporária na tentativa ${attempt}/${retries}: ${error.message}. Tentando novamente em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICS
// ═══════════════════════════════════════════════════════════════════════════════
const clinics = {
    async findByPhoneNumberId(phoneNumberId) {
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('clinics')
                .select('*')
                .eq('phone_number_id', phoneNumberId)
                .maybeSingle();
            if (error) throw new Error(`clinics.findByPhoneNumberId: ${error.message}`);
            return data;
        });
    },
    async findBySlug(slug) {
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('clinics')
                .select('*')
                .eq('slug', slug)
                .maybeSingle();
            if (error) throw new Error(`clinics.findBySlug: ${error.message}`);
            return data;
        });
    },
    async getAll() {
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('clinics')
                .select('*');
            if (error) throw new Error(`clinics.getAll: ${error.message}`);
            return data || [];
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PATIENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Registra uma operação sensível no banco de dados para conformidade com a LGPD (P2)
 */
async function auditLog(action, entityType, entityId, clinicId, changes) {
    try {
        await supabase.from('audit_logs').insert({
            action,
            entity_type: entityType,
            entity_id: entityId,
            clinic_id: clinicId,
            changes
        });
    } catch (err) {
        logger.error('AUDIT_LOG_FAILED', `Falha ao gravar auditoria (${action} ${entityType}): ${err.message}`);
    }
}

const patients = {

    /**
     * Busca paciente pelo telefone e clínica.
     * Se não existir, cria automaticamente (busca resiliente + inserção).
     */
    async findOrCreate(phone, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em patients.findOrCreate');
        return withRetry(async () => {
            // 1. Tenta buscar o paciente por telefone e clínica
            let { data, error } = await supabase
                .from('patients')
                .select('*')
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .maybeSingle();

            if (error) throw new Error(`patients.findOrCreate (select): ${error.message}`);

            if (data) {
                if (data.cpf) data.cpf = decryptData(data.cpf);
                return data;
            }

            // 2. Se não encontrou, insere novo paciente
            const insertRes = await supabase
                .from('patients')
                .insert({ phone, clinic_id: clinicId })
                .select()
                .single();

            if (insertRes.error) {
                // Trata corrida de concorrência (código Postgres 23505 = conflito único)
                if (insertRes.error.code === '23505') {
                    const retryRes = await supabase
                        .from('patients')
                        .select('*')
                        .eq('phone', phone)
                        .eq('clinic_id', clinicId)
                        .maybeSingle();
                    if (retryRes.data) {
                        if (retryRes.data.cpf) retryRes.data.cpf = decryptData(retryRes.data.cpf);
                        return retryRes.data;
                    }
                }
                throw new Error(`patients.findOrCreate (insert): ${insertRes.error.message}`);
            }

            data = insertRes.data;
            if (data && data.cpf) data.cpf = decryptData(data.cpf);
            return data;
        });
    },

    /**
     * Atualiza o nome do paciente
     */
    async updateName(phone, name, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em patients.updateName');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('patients')
                .update({ name })
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .select()
                .single();

            if (error) throw new Error(`patients.updateName: ${error.message}`);
            if (data && data.cpf) data.cpf = decryptData(data.cpf);
            return data;
        });
    },

    async updateCpf(phone, cpf, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em patients.updateCpf');
        return withRetry(async () => {
            const encryptedCpf = encryptData(cpf);
            const cpfHash = hashForSearch(cpf);
            const { data, error } = await supabase
                .from('patients')
                .update({ cpf: encryptedCpf, cpf_hash: cpfHash })
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .select()
                .single();

            if (error) {
                if (error.code === '23505' || error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
                    const conflictErr = new Error(`CPF_CONFLICT: O CPF informado já está vinculado a outro telefone.`);
                    conflictErr.isCpfConflict = true;
                    throw conflictErr;
                }
                throw new Error(`patients.updateCpf: ${error.message}`);
            }
            if (data && data.cpf) data.cpf = decryptData(data.cpf);
            return data;
        });
    },

    /**
     * Busca paciente exclusivamente pelo CPF (via Blind Indexing Hash).
     */
    async findByCpf(cpf, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em patients.findByCpf');
        return withRetry(async () => {
            const cleanCpf = String(cpf || '').replace(/\D/g, '');
            const cpfHash = hashForSearch(cleanCpf);
            // Procura tanto pelo Hash (novo formato seguro) quanto pelo texto plano (sanitizado anti-injeção PostgREST)
            const { data, error } = await supabase
                .from('patients').select('*').is('deleted_at', null)
                .eq('clinic_id', clinicId)
                .or(`cpf_hash.eq.${cpfHash},cpf.eq.${cleanCpf}`)
                .maybeSingle();

            if (error) {
                throw new Error(`[DB_ERROR] patients.findByCpf: ${error.message}`);
            }
            if (data && data.cpf) data.cpf = decryptData(data.cpf);
            return data;
        });
    },

    /**
     * Busca paciente pelo telefone sem criar.
     */
    async findByPhone(phone, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em patients.findByPhone');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('patients').select('*').is('deleted_at', null)
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .maybeSingle(); // retorna null se não encontrar (sem erro)

            if (error) throw new Error(`patients.findByPhone: ${error.message}`);
            if (data && data.cpf) data.cpf = decryptData(data.cpf);
            return data;
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// APPOINTMENTS
// ═══════════════════════════════════════════════════════════════════════════════
const appointments = {

    /**
     * Cria um novo agendamento.
     * @param {Object} data - { patient_id, clinic_id, appointment_date, appointment_time, type, notes? }
     */
    async create(data) {
        if (!data.clinic_id) throw new Error('clinic_id é obrigatório em appointments.create');
        return withRetry(async () => {
            const { data: appointment, error } = await supabase
                .from('appointments')
                .insert({
                    patient_id:       data.patient_id,
                    clinic_id:        data.clinic_id,
                    doctor_id:        data.doctor_id || null,
                    appointment_date: data.appointment_date,  // formato: "2025-12-20"
                    appointment_time: data.appointment_time,  // formato: "09:00:00"
                    type:             data.type,
                    notes:            data.notes || null,
                    status:           'pending'
                })
                .select()
                .single();

            if (error) {
                const dbError = new Error(`appointments.create: ${error.message}`);
                dbError.code = error.code;
                throw dbError;
            }
            return appointment;
        });
    },

    /**
     * Retorna os horários JÁ OCUPADOS em uma data.
     * O calendarService usa isso para calcular os horários disponíveis.
     */
    async getOccupiedSlots(dateStr, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em appointments.getOccupiedSlots');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('appointments').select('appointment_time').is('deleted_at', null)
                .eq('appointment_date', dateStr)
                .eq('clinic_id', clinicId)
                .in('status', ['pending', 'confirmed']); // ignorar cancelados e no_show

            if (error) throw new Error(`appointments.getOccupiedSlots: ${error.message}`);
            return data.map(row => row.appointment_time.substring(0, 5)); // "09:00:00" → "09:00"
        });
    },

    /**
     * Todos os agendamentos de um paciente (histórico).
     */
    async findByPatient(patientId, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em appointments.findByPatient');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('appointments').select('*').is('deleted_at', null)
                .eq('patient_id', patientId)
                .eq('clinic_id', clinicId)
                .order('appointment_date', { ascending: false });

            if (error) throw new Error(`appointments.findByPatient: ${error.message}`);
            return data;
        });
    },

    /**
     * Agendamentos do dia para a clínica confirmar / organizar.
     */
    async findByDate(dateStr, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em appointments.findByDate');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('appointments').select(`
                    *,
                    patients (name, phone).is('deleted_at', null)
                `)
                .eq('appointment_date', dateStr)
                .eq('clinic_id', clinicId)
                .in('status', ['pending', 'confirmed'])
                .order('appointment_time', { ascending: true });

            if (error) throw new Error(`appointments.findByDate: ${error.message}`);
            return data;
        });
    },

    /**
     * Atualiza o status de um agendamento.
     * Ex: 'pending' → 'confirmed' quando o paciente confirma pelo bot.
     */
    async updateStatus(appointmentId, status, clinicId = null) {
        return withRetry(async () => {
            let query = supabase.from('appointments').update({ status }).eq('id', appointmentId);
            if (clinicId) query = query.eq('clinic_id', clinicId);

            const { data, error } = await query.select().maybeSingle();

            if (error) throw new Error(`appointments.updateStatus: ${error.message}`);

            if (clinicId || data?.clinic_id) {
                await auditLog('UPDATE', 'APPOINTMENT', appointmentId, clinicId || data.clinic_id, { status });
            }

            return data;
        });
    },

    /**
     * Próximo agendamento ativo de um paciente (para remarcações).
     */
    async findNextByPatient(patientId, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em appointments.findNextByPatient');
        return withRetry(async () => {
            const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const brtObj = new Date(brtString);
            const today = `${brtObj.getFullYear()}-${String(brtObj.getMonth() + 1).padStart(2, '0')}-${String(brtObj.getDate()).padStart(2, '0')}`;

            const { data, error } = await supabase
                .from('appointments').select('*').is('deleted_at', null)
                .eq('patient_id', patientId)
                .eq('clinic_id', clinicId)
                .in('status', ['pending', 'confirmed'])
                .gte('appointment_date', today)
                .order('appointment_date', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (error) throw new Error(`appointments.findNextByPatient: ${error.message}`);
            return data;
        });
    },

    /**
     * Localiza agendamento ativo específico de um paciente (para garantir idempotência de confirmação).
     */
    async findActiveAppointment(patientId, dateStr, timeStr, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em appointments.findActiveAppointment');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('appointments').select('*').is('deleted_at', null)
                .eq('patient_id', patientId)
                .eq('clinic_id', clinicId)
                .eq('appointment_date', dateStr)
                .eq('appointment_time', timeStr)
                .in('status', ['pending', 'confirmed'])
                .maybeSingle();

            if (error) throw new Error(`appointments.findActiveAppointment: ${error.message}`);
            return data;
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SESSIONS
// Substitui o Map em memória. Mesma interface — o controller não precisa mudar.
// ═══════════════════════════════════════════════════════════════════════════════
// Configuração de TTL de sessão: Padrão de 24 horas (1440 min) para permitir que pacientes
// que demorem a responder durante o dia concluam seu agendamento sem reinício de conversa.
const SESSION_TTL_MINUTES = parseInt(process.env.SESSION_TTL_MINUTES) || 1440;

const sessions = {

    /**
     * Retorna o histórico da sessão ou [] se expirada/inexistente.
     */
    async get(phone, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em sessions.get');
        const data = await withRetry(async () => {
            const { data, error } = await supabase
                .from('sessions').select('history, last_activity').is('deleted_at', null)
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .maybeSingle();

            if (error) throw new Error(`sessions.get: ${error.message}`);
            return data;
        });

        // Log de Debug (exibido apenas em ambiente de desenvolvimento)
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🔍 [SESSION_DEBUG] get(${phone}, ${clinicId}) => found: ${!!data}, histLen: ${data?.history?.length || 0}`);
        }

        if (!data) return [];

        // Verifica TTL manualmente (o cron limpa, mas aqui garantimos consistência)
        const diffMs = Date.now() - new Date(data.last_activity).getTime();
        if (diffMs > SESSION_TTL_MINUTES * 60 * 1000) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`🔍 [SESSION_DEBUG] TTL expirado (${Math.round(diffMs/60000)} min). Deletando sessão.`);
            }
            await sessions.delete(phone, clinicId);
            return [];
        }

        return data.history || [];
    },

    /**
     * Salva ou atualiza o histórico e renova o last_activity.
     */
    async set(phone, history, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em sessions.set');
        return withRetry(async () => {
            const last_activity = new Date().toISOString();
            
            // 1. Tenta atualizar a sessão existente
            const { data, error: updateErr } = await supabase
                .from('sessions')
                .update({ history, last_activity, deleted_at: null })
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .select()
                .maybeSingle();

            if (updateErr) {
                console.error(`🔍 [SESSION_DEBUG] set UPDATE error: ${updateErr.message}`);
                throw new Error(`sessions.set (update): ${updateErr.message}`);
            }

            // 2. Se a sessão já existia e foi atualizada, retorna
            if (data) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`🔍 [SESSION_DEBUG] set(${phone}) => UPDATE OK, histLen: ${history.length}`);
                }
                return data;
            }

            // 3. Se não existia, insere uma nova sessão
            const { data: insertData, error: insertErr } = await supabase
                .from('sessions')
                .insert({ phone, clinic_id: clinicId, history, last_activity })
                .select('id')
                .single();

            if (insertErr) {
                console.error(`🔍 [SESSION_DEBUG] set INSERT error: code=${insertErr.code} msg=${insertErr.message}`);
                // Se houve conflito de concorrência (23505), tenta update de novo
                if (insertErr.code === '23505') {
                    const { error: retryErr } = await supabase
                        .from('sessions')
                        .update({ history, last_activity, deleted_at: null })
                        .eq('phone', phone)
                        .eq('clinic_id', clinicId);
                    if (!retryErr) return;
                }
                throw new Error(`sessions.set (insert): ${insertErr.message}`);
            }
            if (process.env.NODE_ENV !== 'production') {
                console.log(`🔍 [SESSION_DEBUG] set(${phone}) => INSERT OK, id: ${insertData?.id}, histLen: ${history.length}`);
            }
        });
    },

    /**
     * Retorna o rascunho de agendamento estruturado associado à sessão.
     */
    async getDraft(phone, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em sessions.getDraft');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('sessions').select('draft').is('deleted_at', null)
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .maybeSingle();

            if (error) throw new Error(`sessions.getDraft: ${error.message}`);
            return (data && data.draft) ? data.draft : {};
        });
    },

    /**
     * Atualiza o rascunho de forma atômica (merge JSONB via RPC).
     */
    async setDraft(phone, draftPatch, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em sessions.setDraft');
        return withRetry(async () => {
            if (draftPatch === null) {
                // Se null, reseta o rascunho via update direto
                const { error } = await supabase
                    .from('sessions')
                    .update({ draft: null, last_activity: new Date().toISOString() })
                    .eq('phone', phone)
                    .eq('clinic_id', clinicId);
                if (error) throw new Error(`sessions.setDraft (reset): ${error.message}`);
                return;
            }

            const { error } = await supabase.rpc('merge_session_draft_multitenant', { p_phone: phone, p_clinic_id: clinicId, p_draft: draftPatch });
            if (error) throw new Error(`sessions.setDraft (merge): ${error.message}`);
        });
    },

    /**
     * Remove a sessão (logout / nova conversa forçada).
     */
    async delete(phone, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em sessions.delete');
        return withRetry(async () => {
            const { error } = await supabase
                .from('sessions')
                .delete()
                .eq('phone', phone)
                .eq('clinic_id', clinicId);

            if (error) throw new Error(`sessions.delete: ${error.message}`);
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATIONS
// Log auditável de cada mensagem. Usado para análise e relatórios futuros.
// ═══════════════════════════════════════════════════════════════════════════════
const conversations = {

    /**
     * Registra uma mensagem no log.
     * @param {string} patientId - UUID do paciente
     * @param {string} role      - 'user' ou 'assistant'
     * @param {string} content   - texto da mensagem
     */
    async log(patientId, role, content) {
        return withRetry(async () => {
            const { error } = await supabase
                .from('conversations')
                .insert({ patient_id: patientId, role, content });

            // Log nunca deve travar o fluxo principal — só registra o erro
            if (error) console.error(`conversations.log: ${error.message}`);
        }).catch(err => {
            console.error(`[DATABASE] Erro ao gravar log de conversa (esgotado retry): ${err.message}`);
        });
    },

    /**
     * Histórico completo de um paciente (para painel administrativo).
     */
    async findByPatient(patientId, limit = 50) {
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('conversations')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) throw new Error(`conversations.findByPatient: ${error.message}`);
            return data;
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// Controle de idempotência de Webhook logs para evitar duplicações
// ═══════════════════════════════════════════════════════════════════════════════
const webhooks = {
    /**
     * Tenta processar o ID (Idempotência - C12)
     * Agora lança exceção em caso de falha de infraestrutura para forçar 500 HTTP.
     */
    async attemptProcessing(messageId) {
        const { error } = await supabase
            .from('webhook_logs')
            .insert({ message_id: messageId });
        
        if (error) {
            if (error.code === '23505') {
                return false; // Já processado
            }
            throw new Error(`Erro ao registrar webhook log [${messageId}]: ${error.message}`);
        }
        return true; // Primeira vez
    },

    /**
     * Salva payload bruto no Inbox Durável (C7)
     */
    async addToInbox(payload) {
        const { error } = await supabase
            .from('webhook_inbox')
            .insert({ payload });
        
        if (error) {
            throw new Error(`Falha ao inserir no webhook_inbox: ${error.message}`);
        }
    },

    /**
     * Busca os próximos itens pendentes na fila (C7) de forma atômica
     */
    async fetchPending(limit = 10) {
        try {
            const { data, error } = await supabase.rpc('claim_webhook_inbox', { p_limit: limit });
            if (error) {
                logger.error('DATABASE', `Falha ao tentar usar atomic claim_webhook_inbox (Erro Supabase): ${error.message}`);
                return [];
            }
            return data || [];
        } catch (err) {
            logger.error('DATABASE', `Falha de rede ao tentar usar atomic claim_webhook_inbox (Exception): ${err.message}`);
            return [];
        }
    },

    /**
     * Atualiza o status de um item no Inbox (C7)
     */
    async updateInboxStatus(id, status, errorLog = null) {
        const payload = { status };
        if (status === 'completed' || status === 'failed') {
            payload.processed_at = new Date().toISOString();
        }
        if (errorLog) {
            payload.error_log = errorLog;
        }

        const { error } = await supabase
            .from('webhook_inbox')
            .update(payload)
            .eq('id', id);
            
        if (error) {
            logger.error('DATABASE_WEBHOOKS', `Falha ao atualizar status do inbox ${id}: ${error.message}`);
        }
    },

    /**
     * Persiste o status de entrega de mensagens (Status da Meta)
     */
    async logMessageStatus(messageId, recipientId, status, timestampStr) {
        let ts = timestampStr ? new Date(parseInt(timestampStr) * 1000).toISOString() : new Date().toISOString();
        const { error } = await supabase
            .from('message_statuses')
            .insert({
                message_id: messageId,
                recipient_id: recipientId,
                status: status,
                timestamp: ts
            });
        
        if (error) {
            logger.warn('DATABASE_WEBHOOKS', `Erro ao registrar status da mensagem [${messageId}]: ${error.message}`);
        }
    }
};

// ── Export ─────────────────────────────────────────────────────────────────────
module.exports = { supabase, clinics, patients, appointments, sessions, conversations, webhooks, cleanEnvVar };
