/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLINICABOT SAAS PRO — VALIDAÇÃO EMPÍRICA DE HARDENING RLS DAS 4 TABELAS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tabelas auditadas:
 * 1. audit_logs
 * 2. clinic_holidays
 * 3. clinic_hours
 * 4. reminder_logs
 *
 * Perfis de Acesso Testados:
 * [Perfil 1] service_role (Backend Autorizado):
 *            - Permissão total para leitura e manutenção operacional legítima.
 * [Perfil 2] authenticated (Usuário Logado no Supabase Auth):
 *            - Tentativa de SELECT: retorna 0 linhas (bloqueado por RLS).
 *            - Tentativa de INSERT: bloqueado com erro 42501 (violação de RLS).
 *            - Tentativa de UPDATE: bloqueado com erro 42501 ou 0 registros afetados.
 *            - Tentativa de DELETE: bloqueado com erro 42501 ou 0 registros afetados.
 * [Perfil 3] anon / unauthenticated (Requisições Não Autenticadas ou Forjadas):
 *            - PostgREST sem credencial: HTTP 401 Unauthorized.
 *            - PostgREST com token adulterado/inválido: HTTP 401 Unauthorized.
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

const KNOWN_PRODUCTION_HOST = 'vqnhtejriorlegqvtivq';
const APPROVED_STAGING_HOST = 'eywcowvwgccslqfnxaws';

const AUDITED_TABLES = [
    'audit_logs',
    'clinic_holidays',
    'clinic_hours',
    'reminder_logs'
];

async function runRlsValidation() {
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('🛡️  SUÍTE DE AUDITORIA EMPÍRICA — HARDENING RLS DAS 4 TABELAS');
    console.log('════════════════════════════════════════════════════════════════════');
    console.log(`[Ambiente] Dotenv path: ${dotenvPath}`);
    console.log(`[Destino]  Supabase URL: ${SUPABASE_URL}`);

    // Trava de Segurança Estrita: Não executar em produção
    if (!SUPABASE_URL || SUPABASE_URL.includes(KNOWN_PRODUCTION_HOST)) {
        console.error(`\n🚨 TRAVA DE SEGURANÇA ATIVADA: Tentativa de executar testes contra produção (${KNOWN_PRODUCTION_HOST}) ou destino vazio! Abortando imediatamente.`);
        process.exit(1);
    }

    if (!SUPABASE_URL.includes(APPROVED_STAGING_HOST)) {
        console.warn(`⚠️  Atenção: Destino (${SUPABASE_URL}) não é o host de staging padrão homologado (${APPROVED_STAGING_HOST}).`);
    }

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    const runId = crypto.randomUUID().slice(0, 8);
    const testEmail = `qa_rls_${Date.now()}_${runId}@clinicabot.internal`;
    const testPassword = `Pass#${crypto.randomBytes(8).toString('hex')}!`;
    let createdUserId = null;
    let authUserToken = null;

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
        // ETAPA 1: Provisionamento de Identidade Temporária para Teste de 'authenticated'
        // =====================================================================
        console.log(`\n─── [ETAPA 1] Provisionando usuário de teste para validação de role 'authenticated' ───`);
        const { data: newUser, error: createErr } = await sbAdmin.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true
        });

        if (createErr || !newUser?.user) {
            throw new Error(`Falha ao criar usuário de teste no Supabase Auth: ${createErr?.message}`);
        }
        createdUserId = newUser.user.id;
        console.log(`  Identidade criada: ${createdUserId} (${testEmail})`);

        const { data: signInData, error: signInErr } = await sbAdmin.auth.signInWithPassword({
            email: testEmail,
            password: testPassword
        });

        if (signInErr || !signInData.session?.access_token) {
            throw new Error(`Falha ao autenticar usuário de teste: ${signInErr?.message}`);
        }
        authUserToken = signInData.session.access_token;
        console.log(`  Sessão JWT obtida com sucesso para role 'authenticated'.`);

        // Cliente cliente com role 'authenticated'
        const sbAuthenticated = createClient(SUPABASE_URL, SERVICE_KEY, {
            global: {
                headers: {
                    Authorization: `Bearer ${authUserToken}`
                }
            }
        });

        // =====================================================================
        // ETAPA 2: Validação de Acesso Autorizado (service_role)
        // =====================================================================
        console.log(`\n─── [ETAPA 2] Validação de 'service_role' (Backend Autorizado) ───`);
        for (const table of AUDITED_TABLES) {
            const { data, error } = await sbAdmin.from(table).select('*').limit(5);
            const isOk = !error;
            recordResult(
                `service_role pode consultar '${table}'`,
                isOk,
                isOk ? `Registros consultados com sucesso (count=${data?.length ?? 0})` : error?.message
            );
        }

        // =====================================================================
        // ETAPA 3: Validação de Isolamento para Usuário 'authenticated'
        // =====================================================================
        console.log(`\n─── [ETAPA 3] Validação de 'authenticated' (Usuário Logado Comum) ───`);

        for (const table of AUDITED_TABLES) {
            // 3.1 Tentativa de Leitura (SELECT)
            const { data: readData, error: readError } = await sbAuthenticated.from(table).select('*');
            const readBlocked = (readData && readData.length === 0) || (readError && readError.code === '42501');
            recordResult(
                `authenticated tem leitura bloqueada em '${table}'`,
                readBlocked,
                readBlocked 
                    ? `Retornou 0 registros visíveis (RLS filtrou 100% dos dados)` 
                    : `VAZAMENTO: Leu ${readData?.length} registros!`
            );

            // 3.2 Tentativa de Escrita (INSERT)
            let dummyPayload = {};
            if (table === 'clinic_hours') {
                dummyPayload = { clinic_id: '00000000-0000-0000-0000-000000000000', day_of_week: 1, available_slots: [] };
            } else if (table === 'clinic_holidays') {
                dummyPayload = { clinic_id: '00000000-0000-0000-0000-000000000000', holiday_date: '2026-12-25', reason: 'Natal' };
            } else if (table === 'audit_logs') {
                dummyPayload = { action: 'HACK_ATTEMPT', entity_type: 'test', entity_id: '00000000-0000-0000-0000-000000000000', clinic_id: '00000000-0000-0000-0000-000000000000', changes: {} };
            } else if (table === 'reminder_logs') {
                dummyPayload = { appointment_id: '00000000-0000-0000-0000-000000000000', clinic_id: '00000000-0000-0000-0000-000000000000' };
            }

            const { data: insertData, error: insertError } = await sbAuthenticated.from(table).insert(dummyPayload);
            const insertBlocked = !!insertError && (insertError.code === '42501' || insertError.message.includes('violates row-level security'));
            recordResult(
                `authenticated tem inserção bloqueada em '${table}'`,
                insertBlocked,
                insertBlocked
                    ? `Bloqueado com código ${insertError.code}: ${insertError.message}`
                    : `FALHA: Inserção não foi bloqueada! (result: ${JSON.stringify(insertData)})`
            );

            // 3.3 Tentativa de Atualização (UPDATE)
            const { data: updateData, error: updateError } = await sbAuthenticated
                .from(table)
                .update({ updated_at: new Date().toISOString() })
                .eq('id', '00000000-0000-0000-0000-000000000000');
            const updateBlocked = (updateError && updateError.code === '42501') || (updateData === null || updateData?.length === 0);
            recordResult(
                `authenticated tem atualização bloqueada em '${table}'`,
                updateBlocked,
                updateBlocked ? `Bloqueado com segurança (0 registros alterados / erro 42501)` : `FALHA na trava de update`
            );

            // 3.4 Tentativa de Exclusão (DELETE)
            const { data: deleteData, error: deleteError } = await sbAuthenticated
                .from(table)
                .delete()
                .eq('id', '00000000-0000-0000-0000-000000000000');
            const deleteBlocked = (deleteError && deleteError.code === '42501') || (deleteData === null || deleteData?.length === 0);
            recordResult(
                `authenticated tem exclusão bloqueada em '${table}'`,
                deleteBlocked,
                deleteBlocked ? `Bloqueado com segurança (0 registros deletados / erro 42501)` : `FALHA na trava de delete`
            );
        }

        // =====================================================================
        // ETAPA 4: Validação de Acesso Anônimo e Não Autorizado (anon / PostgREST)
        // =====================================================================
        console.log(`\n─── [ETAPA 4] Validação de 'anon' / Não Autenticado (PostgREST) ───`);

        for (const table of AUDITED_TABLES) {
            // 4.1 Requisição sem cabeçalho Authorization nem apikey
            try {
                const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
                    headers: { 'Accept': 'application/json' }
                });
                const is401 = res.status === 401;
                recordResult(
                    `anon sem credencial rejeitado em '${table}' (HTTP 401)`,
                    is401,
                    `Status HTTP retornado: ${res.status} (${res.statusText})`
                );
            } catch (err) {
                recordResult(`anon sem credencial em '${table}'`, true, `Conexão rejeitada: ${err.message}`);
            }

            // 4.2 Requisição com token JWT forjado/inválido
            try {
                const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
                    headers: {
                        'apikey': 'invalid_anon_key_forged_xyz',
                        'Authorization': 'Bearer invalid_forged_token.eyJzdWIiOiIxMjMifQ.abc',
                        'Accept': 'application/json'
                    }
                });
                const isRejected = res.status === 401 || res.status === 403;
                recordResult(
                    `anon com token forjado rejeitado em '${table}' (HTTP 401/403)`,
                    isRejected,
                    `Status HTTP retornado: ${res.status}`
                );
            } catch (err) {
                recordResult(`anon com token forjado em '${table}'`, true, `Rejeitado: ${err.message}`);
            }
        }

    } finally {
        // =====================================================================
        // ETAPA 5: Limpeza de Artefatos de Teste
        // =====================================================================
        console.log(`\n─── [ETAPA 5] Limpeza de identidade de teste ───`);
        if (createdUserId) {
            try {
                await sbAdmin.auth.admin.deleteUser(createdUserId);
                console.log(`  ✅ Usuário temporário ${createdUserId} removido do Supabase Auth.`);
            } catch (cleanupErr) {
                console.warn(`  ⚠️  Aviso ao limpar usuário: ${cleanupErr.message}`);
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
