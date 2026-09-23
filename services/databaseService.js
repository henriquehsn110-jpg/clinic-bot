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
            if (
                error.code === '23505' ||
                error.code === 'SLOT_OCCUPIED' ||
                error.code === 'SESSION_LOCK_LOST' ||
                error.code === 'SESSION_LOCK_TIMEOUT' ||
                error.code === '23503' || // foreign key violation
                error.code === '23502' || // not null violation
                (error.message && (
                    error.message.includes('23505') ||
                    error.message.includes('duplicate key') ||
                    error.message.includes('violates unique constraint') ||
                    error.message.includes('SLOT_OCCUPIED') ||
                    error.message.includes('SESSION_LOCK_LOST') ||
                    error.message.includes('SESSION_LOCK_TIMEOUT')
                ))
            ) {
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
            // 1. Tenta buscar o paciente titular por telefone e clínica (guardian_id IS NULL)
            let { data, error } = await supabase
                .from('patients')
                .select('*')
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .is('guardian_id', null)
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

            // 2. Se não encontrou, insere novo paciente titular (guardian_id: null)
            const insertRes = await supabase
                .from('patients')
                .insert({ phone, clinic_id: clinicId, guardian_id: null })
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
                        .is('guardian_id', null)
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
     * Atualiza o nome do paciente titular
     */
    async updateName(phone, name, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em patients.updateName');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('patients')
                .update({ name })
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .is('guardian_id', null)
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
                .is('guardian_id', null)
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
     * Busca paciente titular pelo telefone sem criar.
     */
    async findByPhone(phone, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em patients.findByPhone');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('patients').select('*').is('deleted_at', null).is('lgpd_purged_at', null)
                .eq('phone', phone)
                .eq('clinic_id', clinicId)
                .is('guardian_id', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(); // retorna null se não encontrar (sem erro)

            if (error) throw new Error(`patients.findByPhone: ${error.message}`);
            if (data && data.cpf) data.cpf = decryptData(data.cpf);
            return data;
        });
    },

    /**
     * Busca todos os dependentes vinculados a um paciente titular (guardianId).
     */
    async findDependentsByGuardian(guardianId, clinicId) {
        if (!guardianId || !clinicId) return [];
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('patients')
                .select('id, name, phone, cpf, guardian_id, created_at')
                .eq('guardian_id', guardianId)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null)
                .is('lgpd_purged_at', null)
                .order('created_at', { ascending: true });

            if (error) throw new Error(`patients.findDependentsByGuardian: ${error.message}`);
            return (data || []).map(p => {
                if (p.cpf) p.cpf = decryptData(p.cpf);
                return p;
            });
        });
    },

    /**
     * Busca ou cria um dependente vinculado a um titular (guardianId).
     * @param {Object} params - { guardianId, clinicId, name, cpf, phone, dependentId }
     */
    async findOrCreateDependent({ guardianId, clinicId, name, cpf, phone, dependentId }) {
        if (!guardianId || !clinicId) throw new Error('guardianId e clinicId são obrigatórios em patients.findOrCreateDependent');
        return withRetry(async () => {
            // Busca direta por ID se fornecido
            if (dependentId) {
                const { data: byId } = await supabase
                    .from('patients')
                    .select('*')
                    .eq('id', dependentId)
                    .eq('clinic_id', clinicId)
                    .is('deleted_at', null)
                    .maybeSingle();
                if (byId) {
                    if (byId.cpf) byId.cpf = decryptData(byId.cpf);
                    return byId;
                }
            }

            const cleanCpf = cpf ? String(cpf).replace(/\D/g, '') : null;
            const cpfHash = cleanCpf ? hashForSearch(cleanCpf) : null;
            
            // 1. Tenta buscar dependente existente pelo guardian_id + cpf_hash (ou nome se cpf não informado)
            let query = supabase
                .from('patients')
                .select('*')
                .eq('guardian_id', guardianId)
                .eq('clinic_id', clinicId)
                .is('deleted_at', null)
                .is('lgpd_purged_at', null);

            if (name) {
                query = query.ilike('name', name.trim());
            } else if (cpfHash) {
                query = query.eq('cpf_hash', cpfHash);
            }

            const { data: existing, error: findErr } = await query.maybeSingle();
            if (findErr) throw new Error(`patients.findOrCreateDependent (select): ${findErr.message}`);

            if (existing) {
                // Atualiza nome ou dados se necessário
                const updates = {};
                if (name && existing.name !== name.trim()) updates.name = name.trim();
                if (phone && existing.phone !== phone) updates.phone = phone;
                if (cleanCpf && !existing.cpf) {
                    updates.cpf = encryptData(cleanCpf);
                    updates.cpf_hash = cpfHash;
                }

                if (Object.keys(updates).length > 0) {
                    const { data: updated, error: updErr } = await supabase
                        .from('patients')
                        .update(updates)
                        .eq('id', existing.id)
                        .select()
                        .single();
                    if (updErr) throw new Error(`patients.findOrCreateDependent (update): ${updErr.message}`);
                    if (updated && updated.cpf) updated.cpf = decryptData(updated.cpf);
                    return updated;
                }

                if (existing.cpf) existing.cpf = decryptData(existing.cpf);
                return existing;
            }

            // 2. Insere novo dependente com vínculo de guardian_id
            const insertPayload = {
                clinic_id: clinicId,
                guardian_id: guardianId,
                name: name ? name.trim() : null,
                phone: phone || null,
                cpf: cleanCpf ? encryptData(cleanCpf) : null,
                cpf_hash: cpfHash
            };

            const { data: created, error: insertErr } = await supabase
                .from('patients')
                .insert(insertPayload)
                .select()
                .single();

            if (insertErr) {
                // Trata race condition no insert (23505)
                if (insertErr.code === '23505' && cpfHash) {
                    const { data: retryData } = await supabase
                        .from('patients')
                        .select('*')
                        .eq('clinic_id', clinicId)
                        .eq('cpf_hash', cpfHash)
                        .maybeSingle();
                    if (retryData) {
                        if (retryData.cpf) retryData.cpf = decryptData(retryData.cpf);
                        return retryData;
                    }
                }
                throw new Error(`patients.findOrCreateDependent (insert): ${insertErr.message}`);
            }
            if (created && created.cpf) created.cpf = decryptData(created.cpf);
            return created;
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
                .select('id, patient_id, doctor_id')
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
     * Confirmação condicional atômica de agendamento de lembrete:
     * Atualiza para 'confirmed' SOMENTE se:
     * - id == appointmentId
     * - clinic_id == clinicId
     * - status == 'pending'
     * - deleted_at IS NULL
     * Retorna o registro atualizado com dados do paciente, ou null se 0 rows foram afetadas.
     */
    async confirmPendingAppointment(appointmentId, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em appointments.confirmPendingAppointment');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('appointments')
                .update({ status: 'confirmed' })
                .eq('id', appointmentId)
                .eq('clinic_id', clinicId)
                .eq('status', 'pending')
                .is('deleted_at', null)
                .select('*, patients(name)')
                .maybeSingle();

            if (error) throw new Error(`appointments.confirmPendingAppointment: ${error.message}`);

            if (data) {
                await auditLog('UPDATE', 'APPOINTMENT', appointmentId, clinicId, { status: 'confirmed' });
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
// DOCTORS
// ═══════════════════════════════════════════════════════════════════════════════
const doctors = {
    /**
     * Retorna todos os médicos ativos de uma clínica.
     */
    async findByClinic(clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em doctors.findByClinic');
        return withRetry(async () => {
            const { data, error } = await supabase
                .from('doctors')
                .select('id, name, specialties, is_active, clinic_id')
                .eq('clinic_id', clinicId)
                .eq('is_active', true);
            if (error) throw new Error(`doctors.findByClinic: ${error.message}`);
            return data || [];
        });
    },

    /**
     * Retorna um médico específico por ID.
     */
    async findById(doctorId, clinicId = null) {
        if (!doctorId) return null;
        return withRetry(async () => {
            let query = supabase
                .from('doctors')
                .select('id, name, specialties, is_active, clinic_id')
                .eq('id', doctorId);
            if (clinicId) query = query.eq('clinic_id', clinicId);
            const { data, error } = await query.maybeSingle();
            if (error) throw new Error(`doctors.findById: ${error.message}`);
            return data;
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION LOCKS (V19)
// ═══════════════════════════════════════════════════════════════════════════════
const sessionLocks = {
    async acquire(phone, clinicId, lockId, ttlSeconds = 30) {
        if (!clinicId || !phone || !lockId) throw new Error('clinicId, phone e lockId são obrigatórios em sessionLocks.acquire');
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('acquire_session_lock', {
                p_clinic_id: clinicId,
                p_phone: phone,
                p_lock_id: lockId,
                p_ttl_seconds: ttlSeconds
            });
            if (error) throw new Error(`sessionLocks.acquire: ${error.message}`);
            return data === true;
        });
    },

    async renew(phone, clinicId, lockId, ttlSeconds = 30) {
        if (!clinicId || !phone || !lockId) throw new Error('clinicId, phone e lockId são obrigatórios em sessionLocks.renew');
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('renew_session_lock', {
                p_clinic_id: clinicId,
                p_phone: phone,
                p_lock_id: lockId,
                p_ttl_seconds: ttlSeconds
            });
            if (error) throw new Error(`sessionLocks.renew: ${error.message}`);
            return data === true;
        });
    },

    async release(phone, clinicId, lockId) {
        if (!clinicId || !phone || !lockId) throw new Error('clinicId, phone e lockId são obrigatórios em sessionLocks.release');
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('release_session_lock', {
                p_clinic_id: clinicId,
                p_phone: phone,
                p_lock_id: lockId
            });
            if (error) throw new Error(`sessionLocks.release: ${error.message}`);
            return data === true;
        });
    },

    async withSessionLock(phone, clinicId, actionFn, { lockId, ttlSeconds = 30, maxWaitMs = 15000 } = {}) {
        const crypto = require('crypto');
        const activeLockId = lockId || crypto.randomUUID();
        const startTime = Date.now();
        let acquired = false;
        
        let delay = 150; // base backoff
        
        // 1. Adquirir lock (com backoff + jitter)
        while (Date.now() - startTime < maxWaitMs) {
            acquired = await this.acquire(phone, clinicId, activeLockId, ttlSeconds);
            if (acquired) break;
            
            const jitter = Math.floor(Math.random() * 100) - 50; // ±50ms
            const waitTime = Math.min(delay, 800) + jitter;
            await new Promise(r => setTimeout(r, waitTime > 0 ? waitTime : 100));
            delay *= 1.5;
        }

        if (!acquired) {
            const err = new Error('SESSION_LOCK_TIMEOUT: Não foi possível adquirir o lock para o telefone ' + phone);
            err.code = 'SESSION_LOCK_TIMEOUT';
            throw err;
        }

        // 2. Heartbeat e monitoramento de Ownership
        let lockLostSignal = false;
        let heartbeatTimer = null;
        
        const heartbeatFn = async () => {
            if (lockLostSignal) return;
            try {
                const renewed = await this.renew(phone, clinicId, activeLockId, ttlSeconds);
                if (!renewed) {
                    lockLostSignal = true;
                    logger.warn('SESSION_LOCK_LOST', `Perda de ownership detectada (phone: ${phone})`);
                } else {
                    heartbeatTimer = setTimeout(heartbeatFn, (ttlSeconds * 1000) / 3);
                }
            } catch (err) {
                logger.error('SESSION_LOCK_RENEW_ERROR', err.message);
                heartbeatTimer = setTimeout(heartbeatFn, (ttlSeconds * 1000) / 3);
            }
        };
        
        heartbeatTimer = setTimeout(heartbeatFn, (ttlSeconds * 1000) / 3);

        const lockContext = {
            lockId: activeLockId,
            isLockValid: () => !lockLostSignal,
            assertLockValid: () => {
                if (lockLostSignal) {
                    const err = new Error('SESSION_LOCK_LOST: O worker atual perdeu a posse do lock.');
                    err.code = 'SESSION_LOCK_LOST';
                    throw err;
                }
            }
        };

        try {
            // 3. Executar o core action (handleIncomingMessageUnlocked)
            return await actionFn(lockContext);
        } finally {
            clearTimeout(heartbeatTimer);
            if (!lockLostSignal) {
                await this.release(phone, clinicId, activeLockId).catch(() => {});
            }
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SESSIONS (V19 - Atômico)
// ═══════════════════════════════════════════════════════════════════════════════
const SESSION_TTL_MINUTES = parseInt(process.env.SESSION_TTL_MINUTES) || 1440;

const sessions = {
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

        if (!data) return [];
        const diffMs = Date.now() - new Date(data.last_activity).getTime();
        if (diffMs > SESSION_TTL_MINUTES * 60 * 1000) {
            await this.delete(phone, clinicId);
            return [];
        }
        return data.history || [];
    },

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

    async persistStateIfOwned(phone, clinicId, lockId, history, draftPatch) {
        if (!clinicId || !phone || !lockId) throw new Error('clinicId, phone e lockId são obrigatórios em persistStateIfOwned');
        return withRetry(async () => {
            let encryptedDraft = null;
            if (draftPatch !== null) {
                encryptedDraft = encryptDraftFields(draftPatch);
            }

            const { data, error } = await supabase.rpc('persist_session_state_if_lock_owned', {
                p_clinic_id: clinicId,
                p_phone: phone,
                p_lock_id: lockId,
                p_history: history || [],
                p_draft: encryptedDraft
            });

            if (error) throw new Error(`persistStateIfOwned: ${error.message}`);
            
            if (data === false) {
                const err = new Error('SESSION_LOCK_LOST: Falha ao persistir pois o ownership foi perdido.');
                err.code = 'SESSION_LOCK_LOST';
                throw err;
            }
            return true;
        });
    },

    async set(phone, history, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em sessions.set');
        return sessionLocks.withSessionLock(phone, clinicId, async ({ lockId }) => {
            const currentDraft = await sessions.getDraft(phone, clinicId);
            return sessions.persistStateIfOwned(phone, clinicId, lockId, history, currentDraft);
        });
    },

    async setDraft(phone, draftPatch, clinicId) {
        if (!clinicId) throw new Error('clinicId é obrigatório em sessions.setDraft');
        return sessionLocks.withSessionLock(phone, clinicId, async ({ lockId }) => {
            const currentHistory = await sessions.get(phone, clinicId);
            return sessions.persistStateIfOwned(phone, clinicId, lockId, currentHistory, draftPatch);
        });
    },

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
            if (error && !error.message.includes('conversations')) console.error(`conversations.log: ${error.message}`);
        }).catch(err => {
            if (!err.message.includes('conversations')) {
                console.error(`[DATABASE] Erro ao gravar log de conversa (esgotado retry): ${err.message}`);
            }
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
// WEBHOOKS (V19)
// ═══════════════════════════════════════════════════════════════════════════════
const webhooks = {
    async claim(messageId, clinicId, phone, processingToken, maxRetries = 3, ttlSeconds = 30) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('claim_webhook_message', {
                p_message_id: messageId,
                p_clinic_id: clinicId,
                p_phone: phone || null,
                p_processing_token: processingToken,
                p_max_retries: maxRetries,
                p_processing_ttl_seconds: ttlSeconds
            });
            if (error) throw new Error(`webhooks.claim: ${error.message}`);
            return data; // { status: 'CLAIMED' | 'ALREADY_COMPLETED' | 'ALREADY_FAILED' | ... }
        });
    },
    
    async renew(messageId, processingToken, ttlSeconds = 30) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('renew_webhook_claim', {
                p_message_id: messageId,
                p_processing_token: processingToken,
                p_ttl_seconds: ttlSeconds
            });
            if (error) throw new Error(`webhooks.renew: ${error.message}`);
            return data; // boolean
        });
    },

    async complete(messageId, processingToken) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('complete_webhook_message', {
                p_message_id: messageId,
                p_processing_token: processingToken
            });
            if (error) throw new Error(`webhooks.complete: ${error.message}`);
            return data;
        });
    },

    async defer(messageId, processingToken, errorLog, backoffSeconds = 5) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('defer_webhook_message', {
                p_message_id: messageId,
                p_processing_token: processingToken,
                p_error_log: errorLog,
                p_backoff_seconds: backoffSeconds
            });
            if (error) throw new Error(`webhooks.defer: ${error.message}`);
            return data;
        });
    },

    async fail(messageId, processingToken, errorLog) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('fail_webhook_message', {
                p_message_id: messageId,
                p_processing_token: processingToken,
                p_error_log: errorLog
            });
            if (error) throw new Error(`webhooks.fail: ${error.message}`);
            return data;
        });
    },
    
    // Antigo / Idempotência legada e compatibilidade
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
    async addToInbox(payload) {
        const { error } = await supabase.from('webhook_inbox').insert({ payload });
        if (error) throw new Error(`Falha ao inserir no webhook_inbox: ${error.message}`);
    },
    async fetchPending(limit = 10) {
        try {
            const { data, error } = await supabase.rpc('claim_webhook_inbox', { p_limit: limit });
            if (error) return [];
            return data || [];
        } catch (err) {
            return [];
        }
    },
    async updateInboxStatus(id, status, errorLog = null) {
        const payload = { status };
        if (status === 'completed' || status === 'failed') payload.processed_at = new Date().toISOString();
        if (errorLog) payload.error_log = errorLog;
        await supabase.from('webhook_inbox').update(payload).eq('id', id);
    },
    async logMessageStatus(messageId, recipientId, status, timestampStr) {
        let ts = timestampStr ? new Date(parseInt(timestampStr) * 1000).toISOString() : new Date().toISOString();
        await supabase.from('message_statuses').insert({ message_id: messageId, recipient_id: recipientId, status: status, timestamp: ts }).catch(()=>{});
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EFFECTS (V19)
// ═══════════════════════════════════════════════════════════════════════════════
const effects = {
    async claim(messageId, effectType, effectKey, effectToken, ttlSeconds = 30, maxRetries = 3, payload = null) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('claim_message_effect', {
                p_message_id: messageId,
                p_effect_type: effectType,
                p_effect_key: effectKey || '',
                p_effect_token: effectToken,
                p_ttl_seconds: ttlSeconds,
                p_max_retries: maxRetries,
                p_payload: payload
            });
            if (error) throw new Error(`effects.claim: ${error.message}`);
            return data;
        });
    },

    async renew(messageId, effectType, effectKey, effectToken, ttlSeconds = 30) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('renew_message_effect_claim', {
                p_message_id: messageId,
                p_effect_type: effectType,
                p_effect_key: effectKey || '',
                p_effect_token: effectToken,
                p_ttl_seconds: ttlSeconds
            });
            if (error) throw new Error(`effects.renew: ${error.message}`);
            return data;
        });
    },

    async markExecuted(messageId, effectType, effectKey, effectToken) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('mark_effect_executed', {
                p_message_id: messageId,
                p_effect_type: effectType,
                p_effect_key: effectKey || '',
                p_effect_token: effectToken
            });
            if (error) throw new Error(`effects.markExecuted: ${error.message}`);
            return data;
        });
    },

    async defer(messageId, effectType, effectKey, effectToken, errorLog, backoffSeconds = 5) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('defer_effect', {
                p_message_id: messageId,
                p_effect_type: effectType,
                p_effect_key: effectKey || '',
                p_effect_token: effectToken,
                p_error_log: errorLog,
                p_backoff_seconds: backoffSeconds
            });
            if (error) throw new Error(`effects.defer: ${error.message}`);
            return data;
        });
    },

    async fail(messageId, effectType, effectKey, effectToken, errorLog) {
        return withRetry(async () => {
            const { data, error } = await supabase.rpc('fail_effect', {
                p_message_id: messageId,
                p_effect_type: effectType,
                p_effect_key: effectKey || '',
                p_effect_token: effectToken,
                p_error_log: errorLog
            });
            if (error) throw new Error(`effects.fail: ${error.message}`);
            return data;
        });
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

// ── Sanitização e Resiliência de Efeitos (V19) ──────────────────────────────
/**
 * Sanitiza o payload do efeito removendo dados pessoais sensíveis (PII/PHI)
 * antes de persistir em message_effects.
 */
function sanitizeEffectPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    try {
        const copy = JSON.parse(JSON.stringify(payload));
        const sanitizeVal = (val) => {
            if (typeof val === 'string') {
                return val
                    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, m => `${m.slice(0, 3)}.***.***-${m.slice(11)}`)
                    .replace(/\b(?<!\d)\d{11}(?!\d)\b/g, m => `${m.slice(0, 3)}******${m.slice(9)}`);
            }
            if (typeof val === 'object' && val !== null) {
                for (const k of Object.keys(val)) {
                    val[k] = sanitizeVal(val[k]);
                }
            }
            return val;
        };
        return sanitizeVal(copy);
    } catch {
        return null;
    }
}

/**
 * Identifica se um erro de transporte/API externa é transitório (retryable)
 * ou se é um erro terminal de negócio/formatação.
 */
function isRetryableTransportError(err) {
    if (!err) return false;
    if (err.isRetryable) return true;
    const code = err.code || err.name;
    if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'AbortError'].includes(code)) {
        return true;
    }
    const status = err.response?.status || err.status;
    if (status === 429 || (typeof status === 'number' && status >= 500 && status < 600)) {
        return true;
    }
    const msg = String(err.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('econnreset') || msg.includes('rate limit')) {
        return true;
    }
    return false;
}

/**
 * Executa um efeito externo com garantia de deduplicação semântica e tolerância a falhas (V19).
 *
 * PROTOCOLO DE CONCORRÊNCIA E IDEMPOTÊNCIA:
 * 1. Verifica se a lease do webhook pai ainda é válida (checkLeaseValid). Se perdida, aborta imediatamente.
 * 2. Faz o claim na tabela message_effects usando uma chave semântica estável (ex: 'whatsapp:welcome', 'whatsapp:ask_cpf').
 *    - Se ALREADY_EXECUTED: efeito já foi concretizado com sucesso; retorna como sucesso seguro (safe skip) sem reenviar.
 *    - Se ALREADY_PROCESSING ou RETRY_NOT_READY: outro worker está executando ou em backoff; lança erro retryable para adiar o webhook.
 *    - Se ALREADY_FAILED ou DEAD_LETTER: erro terminal registrado; não reexecuta.
 *    - Se CLAIMED: obtém o token de lease do efeito.
 * 3. Sanitiza o payload (remove PII/PHI como CPF desmascarado) antes de registrar no banco.
 * 4. Executa a função do efeito (executeFn).
 * 5. Se sucesso: chama markExecuted(messageId, effectType, effectKey, effectToken).
 * 6. Se falha:
 *    - Se transitório (rede/timeout/429/5xx): chama defer(messageId, effectType, effectKey, effectToken, err.message, backoffSeconds)
 *      e lança erro com isRetryable = true para que o webhook pai também dê defer.
 *    - Se terminal (4xx cliente, payload inválido, etc.): chama fail(messageId, effectType, effectKey, effectToken, err.message)
 *      e lança o erro.
 *
 * NOTA DE DESIGN (JANELA AT-LEAST-ONCE):
 * Caso o side effect externo (ex: Meta WhatsApp API) tenha sucesso, mas o processo Node.js caia
 * ou a conexão com o Supabase falhe antes de markExecuted ser concluído, o claim expirará após ttlSeconds.
 * Uma retentativa subsequente poderá reenviar a mensagem. Esta janela de at-least-once é inerente a sistemas
 * distribuídos sem 2PC (Two-Phase Commit) com APIs de terceiros.
 */
async function executeGuardedEffect({
    messageId,
    effectType = 'whatsapp_message',
    effectKey,
    payload = null,
    ttlSeconds = 30,
    maxRetries = 3,
    checkLeaseValid = null,
    executeFn
}) {
    if (!executeFn || typeof executeFn !== 'function') {
        throw new Error('executeGuardedEffect: executeFn é obrigatório');
    }

    // Se não há messageId (ex: simulação/testes CLI sem webhook), executa diretamente
    if (!messageId) {
        return await executeFn();
    }

    if (!effectKey) {
        throw new Error('executeGuardedEffect: effectKey semântica é obrigatória quando messageId é fornecido');
    }

    // 1. Checagem prévia de ownership da lease do webhook pai (se fornecida)
    if (typeof checkLeaseValid === 'function' && !checkLeaseValid()) {
        const leaseLostErr = new Error('WEBHOOK_LEASE_LOST: Lease do webhook expirou ou foi perdida. Efeito abortado antes do claim.');
        leaseLostErr.code = 'WEBHOOK_LEASE_LOST';
        throw leaseLostErr;
    }

    const sanitizedPayload = sanitizeEffectPayload(payload);
    const effectToken = crypto.randomUUID();

    // 2. Claim do efeito
    const claimResult = await effects.claim(
        messageId,
        effectType,
        effectKey,
        effectToken,
        ttlSeconds,
        maxRetries,
        sanitizedPayload
    );

    const claimStatus = claimResult?.status;

    if (claimStatus === 'ALREADY_EXECUTED') {
        return { status: 'ALREADY_EXECUTED', skipped: true };
    }

    if (claimStatus === 'ALREADY_PROCESSING' || claimStatus === 'RETRY_NOT_READY') {
        const retryErr = new Error(`EFFECT_${claimStatus}: Efeito [${effectKey}] já está em processamento ou aguardando backoff.`);
        retryErr.code = `EFFECT_${claimStatus}`;
        retryErr.isRetryable = true;
        throw retryErr;
    }

    if (claimStatus === 'ALREADY_FAILED' || claimStatus === 'DEAD_LETTER') {
        const deadErr = new Error(`EFFECT_${claimStatus}: Efeito [${effectKey}] marcado como falha terminal ou dead letter.`);
        deadErr.code = `EFFECT_${claimStatus}`;
        deadErr.isTerminal = true;
        throw deadErr;
    }

    if (claimStatus !== 'CLAIMED') {
        throw new Error(`executeGuardedEffect: Status inesperado de claim [${claimStatus}]`);
    }

    // 3. Checagem novamente de lease do webhook pai antes de chamar serviço externo
    if (typeof checkLeaseValid === 'function' && !checkLeaseValid()) {
        await effects.defer(messageId, effectType, effectKey, effectToken, 'Parent webhook lease lost before execution', 5).catch(() => {});
        const leaseLostErr = new Error('WEBHOOK_LEASE_LOST: Lease do webhook expirou durante o claim. Efeito cancelado.');
        leaseLostErr.code = 'WEBHOOK_LEASE_LOST';
        throw leaseLostErr;
    }

    // 4. Executa a função do efeito
    let result;
    try {
        result = await executeFn();
    } catch (execErr) {
        const isRetryable = isRetryableTransportError(execErr);
        if (isRetryable) {
            await effects.defer(messageId, effectType, effectKey, effectToken, execErr.message || 'Transient transport error', 5).catch(() => {});
            const retryErr = new Error(`EFFECT_TRANSPORT_ERROR: ${execErr.message}`);
            retryErr.code = 'EFFECT_TRANSPORT_ERROR';
            retryErr.isRetryable = true;
            retryErr.originalError = execErr;
            throw retryErr;
        } else {
            await effects.fail(messageId, effectType, effectKey, effectToken, execErr.message || 'Terminal error').catch(() => {});
            throw execErr;
        }
    }

    // 5. Marca como executado com sucesso
    const marked = await effects.markExecuted(messageId, effectType, effectKey, effectToken);
    if (!marked) {
        logger.warn('EFFECT_LEASE_LOST', `Lease do efeito [${effectKey}] para mensagem [${messageId}] expirou antes de ser concluído.`);
    }

    return { status: 'EXECUTED', result, marked };
}

// ── Export ─────────────────────────────────────────────────────────────────────
module.exports = {
    supabase,
    clinics,
    patients,
    appointments,
    doctors,
    sessionLocks,
    sessions,
    conversations,
    webhooks,
    effects,
    cleanEnvVar,
    parseClinicSettings,
    decryptData,
    encryptData,
    hashForSearch,
    executeGuardedEffect,
    sanitizeEffectPayload,
    isRetryableTransportError
};
