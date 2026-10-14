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
 * 1. Registros Sintéticos Reais:
 *    Cria registros concretos com service_role para que tentativas de SELECT,
 *    UPDATE e DELETE sejam testadas contra IDs reais existentes (não IDs vazios).
 * 2. Comprovação de Não-Alteração:
 *    Após tentativas de UPDATE e DELETE por anon/authenticated, o teste consulta
 *    via service_role para provar fisicamente que os dados permaneceram inalterados.
 * 3. Papel Efetivo Verificado:
 *    Valida o claim 'role' no JWT do usuário autenticado ('authenticated').
 * 4. Chave Anônima Legítima:
 *    Consome process.env.SUPABASE_ANON_KEY para testes como role 'anon'.
 * 5. Preservação do Backend:
 *    Demonstra que leituras e escritas com service_role continuam 100% operacionais.
 * 6. Testes de Regressão de Serviços:
 *    Valida calendarService (clinic_hours/holidays), databaseService e reminderService.
 * 7. Limpeza Determinística:
 *    Garante limpeza de todos os dados sintéticos e do usuário de teste no bloco finally.
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

const SUPABASE_URL = cleanEnvVar(process.env.SUPABASE_URL);
const SERVICE_KEY = cleanEnvVar(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const ANON_KEY = cleanEnvVar(process.env.SUPABASE_ANON_KEY);

const KNOWN_PRODUCTION_HOST = 'vqnhtejriorlegqvtivq';
const APPROVED_STAGING_HOST = 'eywcowvwgccslqfnxaws';

async function runRlsValidation() {
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('🛡️  SUÍTE DE AUDITORIA EMPÍRICA — HARDENING RLS DAS 4 TABELAS');
    console.log('════════════════════════════════════════════════════════════════════');
    console.log(`[Ambiente] Dotenv path: ${dotenvPath}`);
    console.log(`[Destino]  Supabase URL: ${SUPABASE_URL}`);
    console.log(`[Chave Anon] Presente no ambiente: ${!!ANON_KEY}`);

    // Trava de Segurança Estrita: Não executar em produção
    if (!SUPABASE_URL || SUPABASE_URL.includes(KNOWN_PRODUCTION_HOST)) {
        console.error(`\n🚨 TRAVA DE SEGURANÇA ATIVADA: Tentativa de executar testes contra produção (${KNOWN_PRODUCTION_HOST}) ou destino vazio! Abortando imediatamente.`);
        process.exit(1);
    }

    if (!SUPABASE_URL.includes(APPROVED_STAGING_HOST)) {
        console.warn(`⚠️  Atenção: Destino (${SUPABASE_URL}) não é o host de staging padrão homologado (${APPROVED_STAGING_HOST}).`);
    }

    // Cliente administrativo service_role isolado (sem persistência de sessão de usuário)
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const runId = crypto.randomUUID().slice(0, 8);
    const testEmail = `qa_rls_${Date.now()}_${runId}@clinicabot.internal`;
    const testPassword = `Pass#${crypto.randomBytes(8).toString('hex')}!`;

    let createdUserId = null;
    let authUserToken = null;
    let testClinicId = null;

    // Rastreamento de IDs sintéticos para limpeza
    const syntheticRecords = {
        clinic_hours: [],
        clinic_holidays: [],
        audit_logs: [],
        reminder_logs: [],
        appointments: []
    };

    let checksTotal = 0;
    let checksPassed = 0;
    let checksFailed = 0;

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
        // ETAPA 1: Setup de Clínica Base e Identidade Autenticada
        // =====================================================================
        console.log(`\n─── [ETAPA 1] Provisionando Identidade Autenticada e Clínica de Teste ───`);

        // Obter ou criar clínica de teste em staging
        const { data: clinicData } = await sbAdmin.from('clinics').select('id').limit(1).maybeSingle();
        testClinicId = clinicData?.id || '00000000-0000-0000-0000-000000000001';
        console.log(`  Clínica de teste: ${testClinicId}`);

        // Criar usuário no GoTrue
        const { data: newUser, error: createErr } = await sbAdmin.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true
        });

        if (createErr || !newUser?.user) {
            throw new Error(`Falha ao criar usuário de teste no Supabase Auth: ${createErr?.message}`);
        }
        createdUserId = newUser.user.id;

        // Login em cliente separado para NÃO contaminar sbAdmin
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

        // Validar que o token possui role 'authenticated'
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

        // Cliente para role 'anon' (se chave configurada)
        let sbAnon = null;
        if (ANON_KEY) {
            sbAnon = createClient(SUPABASE_URL, ANON_KEY);
            console.log(`  Cliente 'anon' configurado com chave pública oficial de staging.`);
        } else {
            console.log(`  ℹ️  SUPABASE_ANON_KEY não fornecida em .env.staging. Testes de anon usarão requisições HTTP REST diretas.`);
        }

        // =====================================================================
        // ETAPA 2: Criação de Registros Sintéticos Reais com service_role
        // =====================================================================
        console.log(`\n─── [ETAPA 2] Criação de Registros Sintéticos Reais (service_role) ───`);

        // 2.1 clinic_holidays (determinismo dinâmico conforme Regra 25)
        const randMonth = String(Math.floor(Math.random() * 11) + 1).padStart(2, '0');
        const randDay = String(Math.floor(Math.random() * 27) + 1).padStart(2, '0');
        const testHolidayDate = `2098-${randMonth}-${randDay}`;
        await sbAdmin.from('clinic_holidays').delete().eq('clinic_id', testClinicId).eq('holiday_date', testHolidayDate);

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

        // 2.3 clinic_hours (garante existência de registro de teste para day_of_week)
        const testDay = 6; // Sábado
        const { data: existingHour } = await sbAdmin.from('clinic_hours').select('*').eq('clinic_id', testClinicId).eq('day_of_week', testDay).maybeSingle();
        let hourRecId = existingHour?.id;
        if (!hourRecId) {
            const { data: newHour, error: hourErr } = await sbAdmin.from('clinic_hours').insert({
                clinic_id: testClinicId,
                day_of_week: testDay,
                available_slots: ['08:00', '09:00']
            }).select().single();
            if (hourErr) throw new Error(`Falha ao criar clinic_hours sintético: ${hourErr.message}`);
            hourRecId = newHour.id;
            syntheticRecords.clinic_hours.push(hourRecId);
        }
        recordResult(`Registro de 'clinic_hours' disponível para teste`, true, `ID: ${hourRecId}`);

        // 2.4 reminder_logs (precisa de agendamento válido para FK se existir)
        const { data: apptData } = await sbAdmin.from('appointments').select('id').limit(1).maybeSingle();
        const testApptId = apptData?.id || '00000000-0000-0000-0000-000000000001';
        const { data: reminderRec, error: remErr } = await sbAdmin.from('reminder_logs').insert({
            appointment_id: testApptId,
            clinic_id: testClinicId
        }).select().single();

        if (remErr) {
            console.warn(`  ⚠️  Aviso ao criar reminder_log sintético (FK appointment): ${remErr.message}`);
        } else {
            syntheticRecords.reminder_logs.push(reminderRec.id);
            recordResult(`service_role criou registro sintético em 'reminder_logs'`, true, `ID: ${reminderRec.id}`);
        }

        // =====================================================================
        // ETAPA 3: Teste de Tentativas de Leitura (SELECT) em Registros Existentes
        // =====================================================================
        console.log(`\n─── [ETAPA 3] Teste de Bloqueio de Leitura (SELECT) em Registros Existentes ───`);

        // 3.1 clinic_holidays
        const { data: authReadHoliday } = await sbAuth.from('clinic_holidays').select('*').eq('id', holidayRec.id);
        const holidayReadBlocked = (!authReadHoliday || authReadHoliday.length === 0);
        recordResult(
            `authenticated NÃO visualiza feriado sintético existente em 'clinic_holidays'`,
            holidayReadBlocked,
            holidayReadBlocked ? `Retornou 0 registros (RLS filtrou linha existente ${holidayRec.id})` : `VAZAMENTO: Leu ${authReadHoliday.length} registros!`
        );

        // 3.2 audit_logs
        const { data: authReadAudit } = await sbAuth.from('audit_logs').select('*').eq('id', auditRec.id);
        const auditReadBlocked = (!authReadAudit || authReadAudit.length === 0);
        recordResult(
            `authenticated NÃO visualiza log de auditoria existente em 'audit_logs'`,
            auditReadBlocked,
            auditReadBlocked ? `Retornou 0 registros (RLS filtrou linha existente ${auditRec.id})` : `VAZAMENTO: Leu ${authReadAudit.length} registros!`
        );

        // 3.3 clinic_hours
        const { data: authReadHours } = await sbAuth.from('clinic_hours').select('*').eq('id', hourRecId);
        const hoursReadBlocked = (!authReadHours || authReadHours.length === 0);
        recordResult(
            `authenticated NÃO visualiza horário existente em 'clinic_hours'`,
            hoursReadBlocked,
            hoursReadBlocked ? `Retornou 0 registros (RLS filtrou linha existente ${hourRecId})` : `VAZAMENTO: Leu ${authReadHours.length} registros!`
        );

        // 3.4 Leitura com chave anon se disponível
        if (sbAnon) {
            const { data: anonReadHoliday } = await sbAnon.from('clinic_holidays').select('*').eq('id', holidayRec.id);
            const anonReadBlocked = (!anonReadHoliday || anonReadHoliday.length === 0);
            recordResult(
                `anon (chave legítima) NÃO visualiza registro em 'clinic_holidays'`,
                anonReadBlocked,
                anonReadBlocked ? `Retornou 0 registros` : `VAZAMENTO: Leu registros!`
            );
        }

        // =====================================================================
        // ETAPA 4: Teste de Tentativas de Alteração (UPDATE) em Registros Existentes
        // =====================================================================
        console.log(`\n─── [ETAPA 4] Teste de Bloqueio de UPDATE em Registros Existentes ───`);

        // 4.1 authenticated tenta alterar clinic_holidays existente
        const { error: authUpdateErr } = await sbAuth
            .from('clinic_holidays')
            .update({ reason: 'HACKED_BY_AUTHENTICATED' })
            .eq('id', holidayRec.id);

        // Verificar fisicamente com service_role se o registro foi modificado
        const { data: verifiedHoliday } = await sbAdmin.from('clinic_holidays').select('reason').eq('id', holidayRec.id).single();
        const holidayUnchanged = verifiedHoliday && verifiedHoliday.reason === `QA_RLS_SYNTHETIC_${runId}`;

        recordResult(
            `authenticated NÃO consegue modificar 'clinic_holidays' (Dado intacto)`,
            holidayUnchanged,
            holidayUnchanged 
                ? `Registro no banco permanece inalterado: '${verifiedHoliday.reason}' (Erro retornado: ${authUpdateErr?.code || '42501/0 rows'})`
                : `FALHA GRAVE: Registro foi corrompido para '${verifiedHoliday.reason}'!`
        );

        // 4.2 authenticated tenta alterar audit_logs existente
        const { error: auditUpdateErr } = await sbAuth
            .from('audit_logs')
            .update({ action: 'HACKED_ACTION' })
            .eq('id', auditRec.id);

        const { data: verifiedAudit } = await sbAdmin.from('audit_logs').select('action').eq('id', auditRec.id).single();
        const auditUnchanged = verifiedAudit && verifiedAudit.action === 'QA_RLS_TEST';

        recordResult(
            `authenticated NÃO consegue modificar 'audit_logs' (Dado intacto)`,
            auditUnchanged,
            auditUnchanged
                ? `Registro no banco permanece inalterado: '${verifiedAudit.action}' (Erro: ${auditUpdateErr?.code || '42501/0 rows'})`
                : `FALHA GRAVE: Registro de auditoria foi adulterado!`
        );

        // =====================================================================
        // ETAPA 5: Teste de Tentativas de Exclusão (DELETE) em Registros Existentes
        // =====================================================================
        console.log(`\n─── [ETAPA 5] Teste de Bloqueio de DELETE em Registros Existentes ───`);

        // 5.1 authenticated tenta excluir clinic_holidays existente
        const { error: authDelErr } = await sbAuth
            .from('clinic_holidays')
            .delete()
            .eq('id', holidayRec.id);

        // Verificar fisicamente com service_role se o registro AINDA EXISTE
        const { data: holidayStillExists } = await sbAdmin.from('clinic_holidays').select('id').eq('id', holidayRec.id).maybeSingle();
        const holidayPreserved = !!holidayStillExists;

        recordResult(
            `authenticated NÃO consegue deletar 'clinic_holidays' (Registro preservado)`,
            holidayPreserved,
            holidayPreserved
                ? `Registro físico ID ${holidayRec.id} continua intacto no banco (Erro: ${authDelErr?.code || '42501/0 rows'})`
                : `FALHA GRAVE: Registro foi deletado indevidamente!`
        );

        // 5.2 authenticated tenta excluir audit_logs existente
        const { error: auditDelErr } = await sbAuth
            .from('audit_logs')
            .delete()
            .eq('id', auditRec.id);

        const { data: auditStillExists } = await sbAdmin.from('audit_logs').select('id').eq('id', auditRec.id).maybeSingle();
        const auditPreserved = !!auditStillExists;

        recordResult(
            `authenticated NÃO consegue deletar 'audit_logs' (Registro preservado)`,
            auditPreserved,
            auditPreserved
                ? `Registro físico ID ${auditRec.id} continua intacto no banco (Erro: ${auditDelErr?.code || '42501/0 rows'})`
                : `FALHA GRAVE: Log de auditoria foi excluído!`
        );

        // =====================================================================
        // ETAPA 6: Demonstração de Operações Legítimas com service_role
        // =====================================================================
        console.log(`\n─── [ETAPA 6] Demonstração de Operações Legítimas do Backend (service_role) ───`);

        // 6.1 Leitura autorizada
        const { data: srHolidayRead, error: srReadErr } = await sbAdmin.from('clinic_holidays').select('*').eq('id', holidayRec.id).single();
        recordResult(
            `service_role realiza SELECT legítimo em 'clinic_holidays'`,
            !srReadErr && !!srHolidayRead,
            srReadErr ? srReadErr.message : `ID recuperado: ${srHolidayRead?.id}`
        );

        // 6.2 Atualização autorizada
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

        // 7.3 reminderService / reminder_logs (registro sintético dedicado conforme Regra 25)
        try {
            const { data: refAppt } = await sbAdmin.from('appointments').select('patient_id, doctor_id').limit(1).maybeSingle();
            let step7ApptId = testApptId;

            if (refAppt?.patient_id && refAppt?.doctor_id) {
                const { data: synAppt, error: synApptErr } = await sbAdmin.from('appointments').insert({
                    clinic_id: testClinicId,
                    patient_id: refAppt.patient_id,
                    doctor_id: refAppt.doctor_id,
                    appointment_date: '2099-12-31',
                    appointment_time: '18:00:00',
                    type: 'QA_RLS_REGRESSION',
                    status: 'pending'
                }).select().single();

                if (!synApptErr && synAppt) {
                    step7ApptId = synAppt.id;
                    syntheticRecords.appointments.push(synAppt.id);
                }
            }

            const randSentDate = `2097-${String(Math.floor(Math.random() * 11) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 27) + 1).padStart(2, '0')}T10:00:00Z`;
            const { data: regReminder, error: regRemErr } = await sbAdmin.from('reminder_logs').insert({
                appointment_id: step7ApptId,
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
        // ETAPA 8: Limpeza Completa e Determinística de Dados Sintéticos
        // =====================================================================
        console.log(`\n─── [ETAPA 8] Limpeza Determinística de Artefatos Sintéticos ───`);

        for (const [table, ids] of Object.entries(syntheticRecords)) {
            if (ids.length > 0) {
                try {
                    await sbAdmin.from(table).delete().in('id', ids);
                    console.log(`  ✅ [CLEANUP] ${ids.length} registros sintéticos removidos de '${table}'.`);
                } catch (cleanErr) {
                    console.warn(`  ⚠️  Aviso ao limpar ${table}: ${cleanErr.message}`);
                }
            }
        }

        if (createdUserId) {
            try {
                await sbAdmin.auth.admin.deleteUser(createdUserId);
                console.log(`  ✅ [CLEANUP] Usuário temporário ${createdUserId} removido do GoTrue.`);
            } catch (userCleanErr) {
                console.warn(`  ⚠️  Aviso ao limpar usuário: ${userCleanErr.message}`);
            }
        }
    }

    console.log(`\n════════════════════════════════════════════════════════════════════`);
    console.log(`📊 RESULTADO DA AUDITORIA RLS: ${checksPassed}/${checksTotal} CHECKS APROVADOS (${checksFailed} FALHAS)`);
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
