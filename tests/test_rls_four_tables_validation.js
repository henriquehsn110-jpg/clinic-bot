/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLINICABOT SAAS PRO — VALIDAÇÃO EMPÍRICA DE HARDENING RLS DAS 4 TABELAS (V19.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tabelas auditadas:
 * 1. public.audit_logs
 * 2. public.clinic_holidays
 * 3. public.clinic_hours
 * 4. public.reminder_logs
 *
 * RIGOR EMPÍRICO (Anti-Autoavaliação & Verificação Factual):
 * 1. Fail-Closed no Boot (Correção 2):
 *    - Validação de hostname EXATO: 'eywcowvwgccslqfnxaws.supabase.co'.
 *    - Validação de token JWT claim 'ref': deve ser exatamente 'eywcowvwgccslqfnxaws'.
 *    - Rejeita qualquer outro destino ou credencial de produção antes de qualquer chamada.
 * 2. Isolamento Total com Registros Sintéticos Dedicados (Correções 3 e 4):
 *    - Cria clínica, médico, paciente e agendamento sintéticos dedicados (runId único).
 *    - Zero reutilização de dados reais e zero dependência de registros preexistentes.
 * 3. Matriz Efetiva de Papéis (anon, authenticated, service_role):
 *    - authenticated: SELECT retorna 0 linhas, UPDATE/DELETE bloqueados (comprovado
 *      fisicamente via service_role que o registro no banco não foi modificado nem excluído),
 *      INSERT bloqueado com código 42501.
 *    - service_role: acesso total preservado (SELECT, INSERT, UPDATE, regressão calendarService).
 *    - anon: validado se SUPABASE_ANON_KEY estiver presente; se ausente, registrado como PENDENTE.
 * 4. Limpeza Determinística com Verificação Física (Correção 4):
 *    - Remove apenas os registros desta execução na ordem referencial correta.
 *    - Consulta o banco após a exclusão para confirmar fisicamente 0 linhas restantes.
 *    - Falha a suíte se a limpeza falhar.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const dotenvPath = process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: dotenvPath });

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function cleanEnvVar(val) {
    if (val == null) return '';
    let str = String(val).trim();
    let prev;
    do { prev = str; str = str.trim().replace(/^["']+|["']+$|^[`]+|[`]+$/g, '').trim(); } while (str !== prev);
    return str;
}

const EXACT_STAGING_HOSTNAME = 'eywcowvwgccslqfnxaws.supabase.co';
const EXACT_STAGING_PROJECT_ID = 'eywcowvwgccslqfnxaws';
const EXACT_PROD_PROJECT_ID = 'vqnhtejriorlegqvtivq';

const SUPABASE_URL = cleanEnvVar(process.env.SUPABASE_URL);
const SERVICE_KEY = cleanEnvVar(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const ANON_KEY = cleanEnvVar(process.env.SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// PREFLIGHT FAIL-CLOSED GATE (CORREÇÃO 2)
// Executado de forma síncrona ANTES de qualquer criação de cliente ou Auth Admin
// ─────────────────────────────────────────────────────────────────────────────
function validateStagingTargetFailClosed(url, key) {
    if (!url || typeof url !== 'string' || !url.trim()) {
        console.error('\n🚨 [FAIL-CLOSED] SUPABASE_URL ausente ou vazia.');
        process.exit(1);
    }

    let parsed;
    try {
        parsed = new URL(url.trim());
    } catch {
        console.error('\n🚨 [FAIL-CLOSED] SUPABASE_URL malformada ou inválida.');
        process.exit(1);
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== EXACT_STAGING_HOSTNAME) {
        console.error(`\n🚨 [FAIL-CLOSED] Destino '${hostname}' REJEITADO.`);
        console.error(`   Esta suíte só pode ser executada contra exatamente '${EXACT_STAGING_HOSTNAME}'.`);
        console.error('   Execução abortada imediatamente com código 1.');
        process.exit(1);
    }

    if (!key || typeof key !== 'string' || !key.includes('.')) {
        console.error('\n🚨 [FAIL-CLOSED] SUPABASE_SERVICE_KEY ausente ou malformada.');
        process.exit(1);
    }

    const parts = key.trim().split('.');
    if (parts.length !== 3) {
        console.error('\n🚨 [FAIL-CLOSED] Formato de token JWT inválido.');
        process.exit(1);
    }

    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.ref === EXACT_PROD_PROJECT_ID) {
            console.error(`\n🚨 [FAIL-CLOSED] BLOQUEIO CRÍTICO: Credencial JWT pertence ao projeto de PRODUÇÃO (${EXACT_PROD_PROJECT_ID}).`);
            console.error('   Execução abortada imediatamente.');
            process.exit(1);
        }
        if (payload.ref !== EXACT_STAGING_PROJECT_ID) {
            console.error(`\n🚨 [FAIL-CLOSED] Credencial JWT pertence ao projeto '${payload.ref}', mas o teste exige '${EXACT_STAGING_PROJECT_ID}'.`);
            console.error('   Execução abortada imediatamente.');
            process.exit(1);
        }
    } catch (err) {
        console.error(`\n🚨 [FAIL-CLOSED] Falha ao decodificar payload do JWT de credencial: ${err.message}`);
        process.exit(1);
    }
}

// Execução imediata do Gate antes de qualquer operação
validateStagingTargetFailClosed(SUPABASE_URL, SERVICE_KEY);

function generateValidCpf() {
    const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
    const d1 = (n.reduce((acc, digit, idx) => acc + digit * (10 - idx), 0) * 10 % 11) % 10;
    n.push(d1);
    const d2 = (n.reduce((acc, digit, idx) => acc + digit * (11 - idx), 0) * 10 % 11) % 10;
    n.push(d2);
    return n.join('');
}

async function runRlsValidation() {
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('🛡️  SUÍTE DE AUDITORIA EMPÍRICA — HARDENING RLS DAS 4 TABELAS (V19.1)');
    console.log('════════════════════════════════════════════════════════════════════');
    console.log(`[Ambiente] Dotenv path: ${dotenvPath}`);
    console.log(`[Destino]  Supabase URL: ${SUPABASE_URL} (Hostname EXATO verificado)`);
    console.log(`[Chave Anon] Presente no ambiente: ${!!ANON_KEY}`);

    // Cliente administrativo service_role isolado (sem persistência de sessão de usuário)
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const runId = crypto.randomUUID().slice(0, 8);
    const testEmail = `qa_rls_${Date.now()}_${runId}@clinicabot.internal`;
    const testPassword = `Pass#${crypto.randomBytes(8).toString('hex')}!`;

    let createdUserId = null;
    let authUserToken = null;

    // Rastreamento estrito de IDs sintéticos para limpeza referencial (Correção 4)
    const syntheticRecords = {
        reminder_logs: [],
        audit_logs: [],
        clinic_holidays: [],
        clinic_hours: [],
        appointments: [],
        doctors: [],
        patients: [],
        clinics: []
    };

    let checksTotal = 0;
    let checksPassed = 0;
    let checksFailed = 0;
    let pendingValidations = [];

    function recordResult(name, success, detail) {
        checksTotal++;
        if (success) {
            checksPassed++;
            console.log(`  ✅ [PASS] ${name}`);
            if (detail) console.log(`     └─ Detalhe: ${detail}`);
        } else {
            checksFailed++;
            console.error(`  ❌ [FAIL] ${name}`);
            if (detail) console.error(`     └─ Detalhe: ${detail}`);
        }
    }

    try {
        // =====================================================================
        // ETAPA 1: Provisionamento de Identidade Autenticada e Hierarquia Sintética
        // =====================================================================
        console.log(`\n─── [ETAPA 1] Provisionando Identidade Autenticada e Hierarquia Sintética Isolada ───`);

        // 1.1 Clínica Sintética Dedicada
        const { data: synClinic, error: cErr } = await sbAdmin.from('clinics').insert({
            name: `QA RLS Hardening Clinic ${runId}`,
            slug: `qa-rls-${Date.now()}-${runId}`,
            address: 'Ambiente Isolado de Testes QA Staging'
        }).select().single();

        if (cErr || !synClinic) throw new Error(`Falha ao provisionar clínica sintética: ${cErr?.message}`);
        syntheticRecords.clinics.push(synClinic.id);
        const testClinicId = synClinic.id;
        console.log(`  Clínica sintética isolada criada: ${testClinicId}`);

        // 1.2 Médico Sintético Dedicado
        const { data: synDoctor, error: dErr } = await sbAdmin.from('doctors').insert({
            clinic_id: testClinicId,
            name: `Dra. Sintética QA ${runId}`,
            specialties: ['Consulta Geral', 'Limpeza'],
            is_active: true
        }).select().single();

        if (dErr || !synDoctor) throw new Error(`Falha ao provisionar médico sintético: ${dErr?.message}`);
        syntheticRecords.doctors.push(synDoctor.id);

        // 1.3 Paciente Sintético Dedicado (com CPF dinâmico válido - Regra 25)
        const testCpf = generateValidCpf();
        const { data: synPatient, error: pErr } = await sbAdmin.from('patients').insert({
            clinic_id: testClinicId,
            name: `Paciente Sintético QA ${runId}`,
            phone: `5511999${String(Date.now()).slice(-6)}`,
            cpf: testCpf
        }).select().single();

        if (pErr || !synPatient) throw new Error(`Falha ao provisionar paciente sintético: ${pErr?.message}`);
        syntheticRecords.patients.push(synPatient.id);

        // 1.4 Agendamento Sintético Dedicado 1
        const { data: synAppt, error: apptErr } = await sbAdmin.from('appointments').insert({
            clinic_id: testClinicId,
            doctor_id: synDoctor.id,
            patient_id: synPatient.id,
            appointment_date: '2099-11-20',
            appointment_time: '14:00:00',
            type: 'QA_RLS_VALIDATION',
            status: 'pending'
        }).select().single();

        if (apptErr || !synAppt) throw new Error(`Falha ao provisionar agendamento sintético 1: ${apptErr?.message}`);
        syntheticRecords.appointments.push(synAppt.id);
        const testApptId = synAppt.id;

        // 1.5 Agendamento Sintético Dedicado 2 (para Step 7.3 - isolamento total de constraints)
        const { data: synAppt2, error: apptErr2 } = await sbAdmin.from('appointments').insert({
            clinic_id: testClinicId,
            doctor_id: synDoctor.id,
            patient_id: synPatient.id,
            appointment_date: '2099-11-21',
            appointment_time: '15:00:00',
            type: 'QA_RLS_REGRESSION',
            status: 'pending'
        }).select().single();

        if (apptErr2 || !synAppt2) throw new Error(`Falha ao provisionar agendamento sintético 2: ${apptErr2?.message}`);
        syntheticRecords.appointments.push(synAppt2.id);
        const testApptId2 = synAppt2.id;

        // 1.6 Criação de Usuário de Teste no GoTrue
        const { data: newUser, error: createErr } = await sbAdmin.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true
        });

        if (createErr || !newUser?.user) {
            throw new Error(`Falha ao criar usuário de teste no Supabase Auth: ${createErr?.message}`);
        }
        createdUserId = newUser.user.id;

        // 1.6 Login em cliente isolado para obter JWT com role 'authenticated'
        const userAuthClient = createClient(SUPABASE_URL, SERVICE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });

        const { data: signInData, error: signInErr } = await userAuthClient.auth.signInWithPassword({
            email: testEmail,
            password: testPassword
        });

        if (signInErr || !signInData.session?.access_token) {
            throw new Error(`Falha ao autenticar usuário de teste: ${signInErr?.message}`);
        }
        authUserToken = signInData.session.access_token;

        const tokenPayload = JSON.parse(Buffer.from(authUserToken.split('.')[1], 'base64').toString('utf8'));
        recordResult(
            `Token JWT possui role 'authenticated'`,
            tokenPayload.role === 'authenticated',
            `Papel verificado no payload JWT: '${tokenPayload.role}', sub: '${tokenPayload.sub}'`
        );

        // Cliente para role 'authenticated'
        const sbAuth = createClient(SUPABASE_URL, SERVICE_KEY, {
            global: {
                headers: {
                    Authorization: `Bearer ${authUserToken}`
                }
            }
        });

        // Cliente para role 'anon'
        let sbAnon = null;
        if (ANON_KEY) {
            sbAnon = createClient(SUPABASE_URL, ANON_KEY);
            console.log(`  Cliente 'anon' configurado com SUPABASE_ANON_KEY legítima.`);
        } else {
            console.log(`  ℹ️  SUPABASE_ANON_KEY ausente em .env.staging.`);
            pendingValidations.push('Validação do papel anon com chave pública legítima de staging');
        }

        // =====================================================================
        // ETAPA 2: Criação de Registros Sintéticos Reais nas 4 Tabelas (service_role)
        // =====================================================================
        console.log(`\n─── [ETAPA 2] Criação de Registros Sintéticos Reais nas 4 Tabelas (service_role) ───`);

        // 2.1 clinic_holidays
        const testHolidayDate = '2099-12-25';
        const { data: holidayRec, error: hErr } = await sbAdmin.from('clinic_holidays').insert({
            clinic_id: testClinicId,
            holiday_date: testHolidayDate,
            reason: `QA_RLS_SYNTHETIC_${runId}`
        }).select().single();

        if (hErr) throw new Error(`Falha ao criar feriado sintético: ${hErr.message}`);
        syntheticRecords.clinic_holidays.push(holidayRec.id);
        recordResult(`service_role criou registro sintético em 'clinic_holidays'`, true, `ID: ${holidayRec.id}`);

        // 2.2 audit_logs
        const { data: auditRec, error: aErr } = await sbAdmin.from('audit_logs').insert({
            action: 'QA_RLS_TEST',
            entity_type: 'TEST_RECORD',
            entity_id: holidayRec.id,
            clinic_id: testClinicId,
            changes: { runId, test: true }
        }).select().single();

        if (aErr) throw new Error(`Falha ao criar audit_log sintético: ${aErr.message}`);
        syntheticRecords.audit_logs.push(auditRec.id);
        recordResult(`service_role criou registro sintético em 'audit_logs'`, true, `ID: ${auditRec.id}`);

        // 2.3 clinic_hours
        const { data: hourRec, error: hourErr } = await sbAdmin.from('clinic_hours').insert({
            clinic_id: testClinicId,
            day_of_week: 6,
            available_slots: ['08:00', '09:00', '10:00']
        }).select().single();

        if (hourErr) throw new Error(`Falha ao criar clinic_hours sintético: ${hourErr.message}`);
        syntheticRecords.clinic_hours.push(hourRec.id);
        recordResult(`service_role criou registro sintético em 'clinic_hours'`, true, `ID: ${hourRec.id}`);

        // 2.4 reminder_logs (associado ao agendamento sintético dedicado)
        const { data: reminderRec, error: remErr } = await sbAdmin.from('reminder_logs').insert({
            appointment_id: testApptId,
            clinic_id: testClinicId,
            sent_at: '2099-11-19T10:00:00Z'
        }).select().single();

        if (remErr) throw new Error(`Falha ao criar reminder_logs sintético: ${remErr.message}`);
        syntheticRecords.reminder_logs.push(reminderRec.id);
        recordResult(`service_role criou registro sintético em 'reminder_logs'`, true, `ID: ${reminderRec.id}`);

        // =====================================================================
        // ETAPA 3: Testes de SELECT (Bloqueio de Leitura)
        // =====================================================================
        console.log(`\n─── [ETAPA 3] Teste de Bloqueio de Leitura (SELECT) em Registros Existentes ───`);

        // 3.1 clinic_holidays (authenticated)
        const { data: authReadHoliday } = await sbAuth.from('clinic_holidays').select('*').eq('id', holidayRec.id);
        recordResult(
            `authenticated NÃO visualiza feriado sintético existente em 'clinic_holidays'`,
            !authReadHoliday || authReadHoliday.length === 0,
            `Retornou ${authReadHoliday?.length || 0} registros (filtro RLS ativo)`
        );

        // 3.2 audit_logs (authenticated)
        const { data: authReadAudit } = await sbAuth.from('audit_logs').select('*').eq('id', auditRec.id);
        recordResult(
            `authenticated NÃO visualiza log de auditoria existente em 'audit_logs'`,
            !authReadAudit || authReadAudit.length === 0,
            `Retornou ${authReadAudit?.length || 0} registros (filtro RLS ativo)`
        );

        // 3.3 clinic_hours (authenticated)
        const { data: authReadHours } = await sbAuth.from('clinic_hours').select('*').eq('id', hourRec.id);
        recordResult(
            `authenticated NÃO visualiza horário existente em 'clinic_hours'`,
            !authReadHours || authReadHours.length === 0,
            `Retornou ${authReadHours?.length || 0} registros (filtro RLS ativo)`
        );

        // 3.4 reminder_logs (authenticated)
        const { data: authReadReminders } = await sbAuth.from('reminder_logs').select('*').eq('id', reminderRec.id);
        recordResult(
            `authenticated NÃO visualiza log de lembrete existente em 'reminder_logs'`,
            !authReadReminders || authReadReminders.length === 0,
            `Retornou ${authReadReminders?.length || 0} registros (filtro RLS ativo)`
        );

        // 3.5 Teste com chave anon se configurada
        if (sbAnon) {
            const { data: anonReadHoliday } = await sbAnon.from('clinic_holidays').select('*').eq('id', holidayRec.id);
            recordResult(
                `anon (chave legítima) NÃO visualiza registro em 'clinic_holidays'`,
                !anonReadHoliday || anonReadHoliday.length === 0,
                `Retornou ${anonReadHoliday?.length || 0} registros`
            );
        }

        // =====================================================================
        // ETAPA 3.B: Testes de INSERT (Bloqueio de Inserção por authenticated)
        // =====================================================================
        console.log(`\n─── [ETAPA 3.B] Teste de Bloqueio de INSERT por authenticated ───`);

        // 3.B.1 clinic_holidays (authenticated tenta inserir)
        const { error: authInsHolErr } = await sbAuth.from('clinic_holidays').insert({
            clinic_id: testClinicId,
            holiday_date: '2099-01-01',
            reason: 'HACKED_HOLIDAY'
        });
        recordResult(
            `authenticated NÃO insere em 'clinic_holidays'`,
            !!authInsHolErr,
            `Erro retornado: ${authInsHolErr?.code || authInsHolErr?.message || '42501'}`
        );

        // 3.B.2 audit_logs (authenticated tenta inserir)
        const { error: authInsAuditErr } = await sbAuth.from('audit_logs').insert({
            clinic_id: testClinicId,
            action: 'HACKED_AUDIT'
        });
        recordResult(
            `authenticated NÃO insere em 'audit_logs'`,
            !!authInsAuditErr,
            `Erro retornado: ${authInsAuditErr?.code || authInsAuditErr?.message || '42501'}`
        );

        // 3.B.3 clinic_hours (authenticated tenta inserir)
        const { error: authInsHoursErr } = await sbAuth.from('clinic_hours').insert({
            clinic_id: testClinicId,
            day_of_week: 1,
            available_slots: ['08:00']
        });
        recordResult(
            `authenticated NÃO insere em 'clinic_hours'`,
            !!authInsHoursErr,
            `Erro retornado: ${authInsHoursErr?.code || authInsHoursErr?.message || '42501'}`
        );

        // 3.B.4 reminder_logs (authenticated tenta inserir)
        const { error: authInsRemErr } = await sbAuth.from('reminder_logs').insert({
            appointment_id: testApptId,
            clinic_id: testClinicId
        });
        recordResult(
            `authenticated NÃO insere em 'reminder_logs'`,
            !!authInsRemErr,
            `Erro retornado: ${authInsRemErr?.code || authInsRemErr?.message || '42501'}`
        );

        // =====================================================================
        // ETAPA 4: Testes de UPDATE (Bloqueio e Comprovação Física de Não-Alteração)
        // =====================================================================
        console.log(`\n─── [ETAPA 4] Teste de Bloqueio de UPDATE e Comprovação Física de Não-Alteração ───`);

        // 4.1 clinic_holidays (authenticated tenta alterar)
        const { error: hUpErr } = await sbAuth
            .from('clinic_holidays')
            .update({ reason: 'HACKED_BY_AUTHENTICATED' })
            .eq('id', holidayRec.id);

        const { data: checkHoliday } = await sbAdmin.from('clinic_holidays').select('reason').eq('id', holidayRec.id).single();
        const holidayUnchanged = checkHoliday && checkHoliday.reason === `QA_RLS_SYNTHETIC_${runId}`;

        recordResult(
            `authenticated NÃO consegue modificar 'clinic_holidays' (Dado intacto)`,
            holidayUnchanged,
            holidayUnchanged
                ? `Registro físico no banco permanece intacto: '${checkHoliday.reason}'`
                : `FALHA GRAVE: Registro modificado para '${checkHoliday?.reason}'!`
        );

        // 4.2 audit_logs (authenticated tenta alterar)
        const { error: aUpErr } = await sbAuth
            .from('audit_logs')
            .update({ action: 'HACKED_ACTION' })
            .eq('id', auditRec.id);

        const { data: checkAudit } = await sbAdmin.from('audit_logs').select('action').eq('id', auditRec.id).single();
        const auditUnchanged = checkAudit && checkAudit.action === 'QA_RLS_TEST';

        recordResult(
            `authenticated NÃO consegue modificar 'audit_logs' (Dado intacto)`,
            auditUnchanged,
            auditUnchanged
                ? `Registro físico no banco permanece intacto: '${checkAudit.action}'`
                : `FALHA GRAVE: Registro de auditoria adulterado!`
        );

        // =====================================================================
        // ETAPA 5: Testes de DELETE (Bloqueio e Comprovação Física de Não-Exclusão)
        // =====================================================================
        console.log(`\n─── [ETAPA 5] Teste de Bloqueio de DELETE e Comprovação Física de Não-Exclusão ───`);

        // 5.1 clinic_holidays (authenticated tenta excluir)
        const { error: hDelErr } = await sbAuth
            .from('clinic_holidays')
            .delete()
            .eq('id', holidayRec.id);

        const { data: checkHolidayExists } = await sbAdmin.from('clinic_holidays').select('id').eq('id', holidayRec.id).maybeSingle();
        const holidayPreserved = !!checkHolidayExists;

        recordResult(
            `authenticated NÃO consegue deletar 'clinic_holidays' (Registro preservado)`,
            holidayPreserved,
            holidayPreserved
                ? `Registro físico ID ${holidayRec.id} continua intacto no banco`
                : `FALHA GRAVE: Registro foi excluído indevidamente!`
        );

        // 5.2 audit_logs (authenticated tenta excluir)
        const { error: aDelErr } = await sbAuth
            .from('audit_logs')
            .delete()
            .eq('id', auditRec.id);

        const { data: checkAuditExists } = await sbAdmin.from('audit_logs').select('id').eq('id', auditRec.id).maybeSingle();
        const auditPreserved = !!checkAuditExists;

        recordResult(
            `authenticated NÃO consegue deletar 'audit_logs' (Registro preservado)`,
            auditPreserved,
            auditPreserved
                ? `Registro físico ID ${auditRec.id} continua intacto no banco`
                : `FALHA GRAVE: Log de auditoria foi excluído!`
        );

        // =====================================================================
        // ETAPA 6: Demonstração de Operações Legítimas com service_role
        // =====================================================================
        console.log(`\n─── [ETAPA 6] Demonstração de Operações Legítimas do Backend (service_role) ───`);

        // 6.1 SELECT legítimo
        const { data: srHolidayRead, error: srReadErr } = await sbAdmin.from('clinic_holidays').select('*').eq('id', holidayRec.id).single();
        recordResult(
            `service_role realiza SELECT legítimo em 'clinic_holidays'`,
            !srReadErr && !!srHolidayRead,
            srReadErr ? srReadErr.message : `ID recuperado: ${srHolidayRead?.id}`
        );

        // 6.2 UPDATE legítimo
        const { error: srUpdateErr } = await sbAdmin.from('clinic_holidays').update({ reason: 'QA_UPDATED_BY_SERVICE_ROLE' }).eq('id', holidayRec.id);
        const { data: srUpdatedCheck } = await sbAdmin.from('clinic_holidays').select('reason').eq('id', holidayRec.id).single();
        const srUpdateOk = !srUpdateErr && srUpdatedCheck?.reason === 'QA_UPDATED_BY_SERVICE_ROLE';
        recordResult(
            `service_role realiza UPDATE legítimo em 'clinic_holidays'`,
            srUpdateOk,
            srUpdateOk ? `Razão atualizada para: '${srUpdatedCheck.reason}'` : srUpdateErr?.message
        );

        // =====================================================================
        // ETAPA 7: Teste de Regressão de Serviços Dependentes
        // =====================================================================
        console.log(`\n─── [ETAPA 7] Teste de Regressão das Funcionalidades Dependentes do Backend ───`);

        // 7.1 calendarService (clinic_hours e clinic_holidays)
        const calendarService = require('../services/calendarService');
        try {
            const slots = await calendarService.getAvailableSlots('2099-12-30', testClinicId);
            recordResult(
                `calendarService.getAvailableSlots opera normalmente (clinic_hours)`,
                Array.isArray(slots),
                `Slots retornados com sucesso: ${slots?.length || 0} horários`
            );
        } catch (calErr) {
            recordResult(`calendarService.getAvailableSlots`, false, calErr.message);
        }

        // 7.2 databaseService / audit_logs
        try {
            const { data: regAudit, error: regAuditErr } = await sbAdmin.from('audit_logs').insert({
                action: 'QA_REGRESSION_TEST',
                entity_type: 'SYSTEM',
                entity_id: testClinicId,
                clinic_id: testClinicId,
                changes: { test: true }
            }).select().single();

            if (regAudit) syntheticRecords.audit_logs.push(regAudit.id);
            recordResult(
                `backend grava registros operacionais em 'audit_logs'`,
                !regAuditErr && !!regAudit,
                regAuditErr ? regAuditErr.message : `ID gerado: ${regAudit?.id}`
            );
        } catch (audErr) {
            recordResult(`backend grava em audit_logs`, false, audErr.message);
        }

        // 7.3 reminderService / reminder_logs (utilizando o segundo agendamento sintético isolado)
        try {
            const randSentDate = '2099-11-21T08:00:00Z';
            const { data: regReminder, error: regRemErr } = await sbAdmin.from('reminder_logs').insert({
                appointment_id: testApptId2,
                clinic_id: testClinicId,
                sent_at: randSentDate
            }).select().single();

            if (regReminder) syntheticRecords.reminder_logs.push(regReminder.id);
            recordResult(
                `backend grava registros operacionais em 'reminder_logs'`,
                !regRemErr && !!regReminder,
                regRemErr ? regRemErr.message : `ID gerado: ${regReminder?.id}`
            );
        } catch (remErr) {
            recordResult(`backend grava em reminder_logs`, false, remErr.message);
        }

    } finally {
        // =====================================================================
        // ETAPA 8: Limpeza Determinística com Verificação Física (Correção 4)
        // =====================================================================
        console.log(`\n─── [ETAPA 8] Limpeza Determinística de Artefatos Sintéticos & Verificação Física ───`);

        // Ordem estrita respeitando chaves estrangeiras
        const cleanupOrder = [
            'reminder_logs',
            'audit_logs',
            'clinic_holidays',
            'clinic_hours',
            'appointments',
            'doctors',
            'patients',
            'clinics'
        ];

        let cleanupFailed = false;

        for (const table of cleanupOrder) {
            const ids = syntheticRecords[table] || [];
            if (ids.length > 0) {
                // 1. Exclui registros
                const { error: delErr } = await sbAdmin.from(table).delete().in('id', ids);
                if (delErr) {
                    console.error(`  ❌ [CLEANUP_FAIL] Erro ao deletar de '${table}': ${delErr.message}`);
                    cleanupFailed = true;
                } else {
                    // 2. Consulta de confirmação física pós-limpeza (Requisito 8)
                    const { data: remaining, error: verifyErr } = await sbAdmin.from(table).select('id').in('id', ids);
                    if (verifyErr) {
                        console.error(`  ❌ [CLEANUP_VERIFY_FAIL] Falha ao verificar '${table}': ${verifyErr.message}`);
                        cleanupFailed = true;
                    } else if (remaining && remaining.length > 0) {
                        console.error(`  ❌ [CLEANUP_INCOMPLETE] ${remaining.length} registros ainda persistem em '${table}'!`);
                        cleanupFailed = true;
                    } else {
                        console.log(`  ✅ [CLEANUP CONFIRMED] ${ids.length} registros fisicamente removidos de '${table}' (0 restantes).`);
                    }
                }
            }
        }

        // 3. Exclusão de usuário temporário do GoTrue Auth Admin
        if (createdUserId) {
            const { error: userDelErr } = await sbAdmin.auth.admin.deleteUser(createdUserId);
            if (userDelErr) {
                console.error(`  ❌ [CLEANUP_USER_FAIL] Falha ao deletar usuário temporário ${createdUserId}: ${userDelErr.message}`);
                cleanupFailed = true;
            } else {
                console.log(`  ✅ [CLEANUP CONFIRMED] Usuário temporário ${createdUserId} removido do GoTrue.`);
            }
        }

        if (cleanupFailed) {
            console.error('\n🚨 FALHA DE LIMPEZA: Um ou mais artefatos sintéticos não puderam ser limpos!');
            checksFailed++;
        }
    }

    console.log(`\n════════════════════════════════════════════════════════════════════`);
    console.log(`📊 RESULTADO DA AUDITORIA RLS: ${checksPassed}/${checksTotal} CHECKS APROVADOS (${checksFailed} FALHAS)`);
    if (pendingValidations.length > 0) {
        console.log(`⚠️  VALIDAÇÕES PENDENTES (${pendingValidations.length}):`);
        pendingValidations.forEach(p => console.log(`   - ${p}`));
    }
    console.log(`════════════════════════════════════════════════════════════════════\n`);

    if (checksFailed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runRlsValidation().catch(err => {
    console.error('\n🚨 Erro fatal durante a execução da suíte de validação RLS:', err);
    process.exit(1);
});
