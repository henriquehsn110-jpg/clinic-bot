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
const supabaseUrl = cleanEnvVar(process.env.SUPABASE_URL) || 'https://placeholder.supabase.co';
const supabaseKey = cleanEnvVar(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDA0OTYwMDAsImV4cCI6MjAxNjA3MjAwMH0.placeholder';

const supabase = createClient(supabaseUrl, supabaseKey);

const crypto = require('crypto');

// ── Criptografia (CPF) ─────────────────────────────────────────────────────────
// Estratégia de Cifragem: AES-256-GCM para confidencialidade, com Blind Indexing via HMAC-SHA256
// para permitir a busca (findByCpf) de forma determinística sem vazar o CPF.
// Chaves: Usamos uma chave dedicada CPF_ENCRYPTION_KEY para não acoplar com as credenciais do Supabase.
// A chave deve ter 32 bytes (64 caracteres hexadecimais).
const cpfKey = process.env.CPF_ENCRYPTION_KEY;
const isProduction = process.env.NODE_ENV === 'production';

if (!cpfKey) {
    logger.error('SECURITY_CRITICAL', 'CPF_ENCRYPTION_KEY não definida! A chave é obrigatória para criptografia AES-256-GCM. Defina um hexadecimal de 64 caracteres em CPF_ENCRYPTION_KEY.');
    if (isProduction) {
        process.exit(1);
    } else {
        throw new Error('SECURITY_CRITICAL: CPF_ENCRYPTION_KEY ausente. Defina a variável de ambiente CPF_ENCRYPTION_KEY com 64 caracteres hexadecimais.');
    }
}

if (!/^[0-9a-fA-F]{64}$/.test(cpfKey)) {
    logger.error('SECURITY_CRITICAL', 'CPF_ENCRYPTION_KEY possui formato inválido. Deve ser um hexadecimal de 64 caracteres (32 bytes).');
    process.exit(1);
}

const ENCRYPTION_SECRET = Buffer.from(cpfKey, 'hex');

function encryptData(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_SECRET, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptData(encryptedData, fieldName = 'cpf') {
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
        logger.warn('DECRYPTION', `Falha ao descriptografar campo [${fieldName}] com ciphertext [${encryptedData.substring(0, 20)}...]. Erro: ${err.message}. Retornando null para evitar bypass de FSM.`);
        return null;
    }
}

function hashForSearch(text) {
    return crypto.createHmac('sha256', ENCRYPTION_SECRET).update(text).digest('hex');
}

/**
 * Criptografa campos sensíveis dentro do JSONB draft (ex: cpf e dependentCpf) antes de salvar no Supabase.
 */
function encryptDraftFields(draft) {
    if (!draft || typeof draft !== 'object') return draft;
    const cloned = { ...draft };
    if (cloned.cpf && typeof cloned.cpf === 'string' && cloned.cpf.split(':').length !== 3) {
        cloned.cpf = encryptData(cloned.cpf);
    }
    if (cloned.dependentCpf && typeof cloned.dependentCpf === 'string' && cloned.dependentCpf.split(':').length !== 3) {
        cloned.dependentCpf = encryptData(cloned.dependentCpf);
    }
    return cloned;
}

/**
 * Descriptografa campos sensíveis lidos do JSONB draft do Supabase.
 */
function decryptDraftFields(draft) {
    if (!draft || typeof draft !== 'object') return {};
    const cloned = { ...draft };
    if (cloned.cpf && typeof cloned.cpf === 'string') {
        cloned.cpf = decryptData(cloned.cpf, 'cpf');
    }
    if (cloned.dependentCpf && typeof cloned.dependentCpf === 'string') {
        cloned.dependentCpf = decryptData(cloned.dependentCpf, 'dependentCpf');
    }
    return cloned;
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
    async getByPhoneNumberId(phoneNumberId) {
        return this.findByPhoneNumberId(phoneNumberId);
    },
    async findById(id) {
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('clinics')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (error) throw new Error(`clinics.findById: ${error.message}`);
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
            // 1. Tenta buscar o paciente por telefone e clínica (incluindo soft-deleted)
            let { data, error } = await supabase
                .from('patients')
                .select('*')
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw new Error(`patients.findOrCreate (select): ${error.message}`);

            if (data) {
                // Paciente purgado (LGPD) não pode ser reativado
                if (data.lgpd_purged_at) {
                    data = null; // Força inserção de novo cadastro
                } else {
                    // Reativa paciente soft-deleted que voltou a mandar mensagem
                    if (data.deleted_at) {
                    const { error: reactivateErr } = await supabase
                        .from('patients')
                        .update({ deleted_at: null })
                        .eq('id', data.id);
                    if (reactivateErr) {
                        console.warn(`[DB_WARN] patients.findOrCreate: falha ao reativar paciente soft-deleted ${data.id}: ${reactivateErr.message}`);
                    } else {
                        console.log(`[DB_INFO] patients.findOrCreate: paciente ${data.id} reativado (deleted_at limpo) — retornou a enviar mensagens.`);
                    }
                    data.deleted_at = null;
                }
                if (data.cpf) data.cpf = decryptData(data.cpf);
                return data;
            }
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
                        // Reativa também no caminho de race condition
                        if (retryRes.data.deleted_at) {
                            await supabase.from('patients').update({ deleted_at: null }).eq('id', retryRes.data.id);
                            retryRes.data.deleted_at = null;
                            console.log(`[DB_INFO] patients.findOrCreate (23505 retry): paciente ${retryRes.data.id} reativado.`);
                        }
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
     * Purga os dados de um paciente (Direito ao Esquecimento LGPD)
     * e limpa PII de tabelas associadas.
     */
    async purgePatient(patientId, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em patients.purgePatient');
        return withRetry(async () => {
            // Busca o telefone do paciente para limpar a sessão
            const { data: patient } = await supabase
                .from('patients')
                .select('phone')
                .eq('id', patientId)
                .eq('clinic_id', clinicId)
                .maybeSingle();

            if (patient && patient.phone) {
                // Deleta a sessão de histórico para remover PII
                await supabase.from('sessions').delete().eq('phone', patient.phone).eq('clinic_id', clinicId);
            }

            // 1. Anonimiza o paciente (Ofusca o telefone para liberar a constraint - max 20 chars)
            const shortRandom = Math.random().toString(36).substring(2, 10).toUpperCase();
            const { error: patientErr } = await supabase
                .from('patients')
                .update({ 
                    lgpd_purged_at: new Date().toISOString(),
                    name: '[PURGED_LGPD]',
                    cpf: `[DEL]-${shortRandom}`,
                    cpf_hash: null,
                    phone: `DEL-${shortRandom}`
                })
                .eq('id', patientId)
                .eq('clinic_id', clinicId);

            if (patientErr) throw new Error(`patients.purgePatient (patients): ${patientErr.message}`);

            // 2. Cascata PII: Limpar notas de agendamentos
            await supabase
                .from('appointments')
                .update({ notes: '[PURGED_PII]' })
                .eq('patient_id', patientId)
                .eq('clinic_id', clinicId);
            
            // 3. Cascata PII: Limpar logs de conversações
            await supabase
                .from('conversations')
                .update({ content: '[PURGED_PII]' })
                .eq('patient_id', patientId);
                
            await auditLog('PURGE_LGPD', 'PATIENT', patientId, clinicId, { status: 'irreversible_purge' });
            return true;
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
            const cleanCpf = String(cpf || '').replace(/\D/g, '');
            if (!cleanCpf) throw new Error('CPF inválido fornecido para patients.updateCpf');

            const encryptedCpf = encryptData(cleanCpf);
            const cpfHash = hashForSearch(cleanCpf);
            const { data, error } = await supabase
                .from('patients')
                .update({ cpf: encryptedCpf, cpf_hash: cpfHash })
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null)
                .select()
                .limit(1)
                .maybeSingle();

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
            if (!cleanCpf) return null;

            const cpfHash = hashForSearch(cleanCpf);
            // Procura tanto pelo Hash (novo formato seguro) quanto pelo texto plano (sanitizado anti-injeção PostgREST)
            let { data, error } = await supabase
                .from('patients').select('*').is('deleted_at', null).is('lgpd_purged_at', null)
                .eq('clinic_id', clinicId)
                .or(`cpf_hash.eq.${cpfHash},cpf.eq.${cleanCpf}`)
                .maybeSingle();

            if (error) {
                throw new Error(`[DB_ERROR] patients.findByCpf: ${error.message}`);
            }

            // Fallback resiliente para registros legados onde cpf está encriptado e cpf_hash estava null
            if (!data) {
                const { data: list } = await supabase
                    .from('patients')
                    .select('*')
                    .is('deleted_at', null)
                    .is('lgpd_purged_at', null)
                    .eq('clinic_id', clinicId)
                    .not('cpf', 'is', null);
                
                if (list && list.length > 0) {
                    for (const p of list) {
                        if (p.cpf) {
                            try {
                                const dec = decryptData(p.cpf);
                                if (dec && dec.replace(/\D/g, '') === cleanCpf) {
                                    data = p;
                                    // Auto-backfill do cpf_hash ausente para performance futura
                                    if (!p.cpf_hash && cpfHash) {
                                        await supabase.from('patients').update({ cpf_hash: cpfHash }).eq('id', p.id).catch(() => {});
                                    }
                                    break;
                                }
                            } catch (e) {
                                // Ignora erros de decodificação se houver dado corrompido
                            }
                        }
                    }
                }
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
                .from('patients').select('*').is('deleted_at', null).is('lgpd_purged_at', null)
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .order('created_at', { ascending: false })
                .limit(1)
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
                dbError.code = (error.code === '23505' || error.message?.includes('23505')) ? 'SLOT_OCCUPIED' : error.code;
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
     * Verifica atomicamente se um slot de horário já está ocupado por outro paciente.
     * Suporta filtro por médico e exclusão do próprio paciente (idempotência).
     */
    async isSlotOccupied(dateStr, timeStr, clinicId, doctorId = null, excludePatientId = null) {
        if (!clinicId) throw new Error('clinicId é obrigatório em appointments.isSlotOccupied');
        if (!dateStr || !timeStr) return false;
        return withRetry(async () => {
            const cleanTime = timeStr.trim();
            const fullTime = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime;
            const shortTime = cleanTime.substring(0, 5);

            let query = supabase
                .from('appointments')
                .select('id, patient_id')
                .is('deleted_at', null)
                .eq('clinic_id', clinicId)
                .eq('appointment_date', dateStr)
                .in('appointment_time', [fullTime, shortTime])
                .in('status', ['pending', 'confirmed']);

            if (doctorId) {
                query = query.eq('doctor_id', doctorId);
            }
            if (excludePatientId) {
                query = query.neq('patient_id', excludePatientId);
            }

            const { data, error } = await query;
            if (error) throw new Error(`appointments.isSlotOccupied: ${error.message}`);
            return Array.isArray(data) && data.length > 0;
        });
    },

    /**
     * Todos os agendamentos de um paciente (histórico).
     */
    async findByPatient(patientId, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em appointments.findByPatient');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('appointments').select('*, doctors(name)').is('deleted_at', null)
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
                .from('appointments').select('*, doctors(name)').is('deleted_at', null)
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
     * Descriptografa automaticamente campos sensíveis (como cpf e dependentCpf).
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
            return (data && data.draft) ? decryptDraftFields(data.draft) : {};
        });
    },

    /**
     * Atualiza o rascunho de forma atômica no Supabase.
     * Criptografa automaticamente campos sensíveis (como cpf e dependentCpf) via AES-256-GCM.
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

            const encryptedDraft = encryptDraftFields(draftPatch);

            const { data: existing } = await supabase
                .from('sessions')
                .select('id')
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .maybeSingle();

            if (!existing) {
                const { error: insErr } = await supabase
                    .from('sessions')
                    .insert({ phone, clinic_id: clinicId, history: [], draft: encryptedDraft, last_activity: new Date().toISOString() });
                if (insErr) throw new Error(`sessions.setDraft (insert new): ${insErr.message}`);
            } else {
                const { error } = await supabase
                    .from('sessions')
                    .update({ draft: encryptedDraft, last_activity: new Date().toISOString() })
                    .eq('id', existing.id);
                if (error) throw new Error(`sessions.setDraft (update): ${error.message}`);
            }
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

/**
 * Utilitário Unificado para Extrair e Normalizar as Configurações da Clínica
 * Trata work_hours como JSON string ou JS Object e mescla colunas de nível superior da tabela clinics.
 */
function parseClinicSettings(cData) {
    let settings = {};
    if (!cData) return settings;

    // 1. Tenta extrair de work_hours (suporta JSON string, JS Object ou texto plano retornado pelo Supabase)
    if (cData.work_hours) {
        if (typeof cData.work_hours === 'object' && cData.work_hours !== null) {
            settings = { ...cData.work_hours };
        } else if (typeof cData.work_hours === 'string') {
            const trimmed = cData.work_hours.trim();
            if (trimmed.startsWith('{')) {
                try { settings = JSON.parse(trimmed); } catch (e) {}
            } else if (trimmed.length > 0) {
                settings.workHours = trimmed;
            }
        }
    }

    // 2. Mescla/Sobrescreve com colunas de nível superior da tabela clinics
    if (cData.name) settings.name = cData.name;
    if (cData.address) settings.address = cData.address;
    if (cData.eval_price !== undefined && cData.eval_price !== null && cData.eval_price !== '') {
        settings.evalPrice = String(cData.eval_price);
    }

    // 3. Garante fallbacks padrões para todos os campos essenciais se estiverem ausentes
    if (!settings.personaName) settings.personaName = 'Ana';
    if (!settings.workHours || settings.workHours === '08:00 às 18:00 (Seg a Sex)') {
        settings.workHours = 'Segunda a Sexta-feira, das 08:00 às 18:00';
    }
    if (!settings.procedures) {
        settings.procedures = 'Consulta Geral, Limpeza, Tratamento de Canal, Implantes, Clareamento Dental';
    }
    if (!settings.insurances) {
        settings.insurances = 'Bradesco Saúde, Amil Dental, SulAmérica e Atendimento Particular';
    }
    if (!settings.paymentMethods) {
        settings.paymentMethods = 'PIX com 5% de desconto, Cartão de Crédito em até 12x sem juros, Dinheiro';
    }
    if (!settings.emergency) {
        settings.emergency = 'Em caso de dor intensa ou emergência, orientamos ligar imediatamente para o nosso telefone de urgência ou vir diretamente à clínica.';
    }
    if (!settings.minCancellationHours) {
        settings.minCancellationHours = '4';
    }

    return settings;
}

// ── Export ─────────────────────────────────────────────────────────────────────
module.exports = { supabase, clinics, patients, appointments, sessions, conversations, webhooks, cleanEnvVar, parseClinicSettings, decryptData, encryptData, hashForSearch };
