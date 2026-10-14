/**
 * tests/test_qa_production_guard.js
 * 
 * Bateria de Testes Negativos de Proteção de QA — ClinicaBot SaaS Pro
 * 
 * Valida empiricamente que:
 * 1. Qualquer tentativa de teste mutável contra Produção (vqnhtejriorlegqvtivq) é bloqueada imediatamente.
 * 2. Destinos desconhecidos ou URLs ausentes são bloqueados com erro explícito fail-closed.
 * 3. Mutações por tabelas (.insert, .update, .delete, .upsert) são interceptadas.
 * 4. Mutações por RPCs são interceptadas.
 * 5. Mutações administrativas de Auth (client.auth.admin.createUser, deleteUser, etc.) são interceptadas.
 * 6. Chamadas HTTP diretas via fetch (POST, PATCH, PUT, DELETE) para produção são interceptadas.
 * 7. Clientes Supabase criados DIRETAMENTE via createClient sem passar por databaseService.js são protegidos.
 * 8. Nenhuma requisição de escrita alcança o banco de produção.
 * 9. Destinos de Staging (eywcowvwgccslqfnxaws) e mocks locais são permitidos.
 * 10. Operações legítimas da aplicação de produção no server.js não são bloqueadas.
 */

const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');
const {
    evaluateDestinationSafety,
    assertSafeTestDestination,
    wrapClientWithMutationGuard,
    extractProjectHost,
    isLegitimateProductionServer
} = require('./helpers/testEnvironmentGuard');

async function runGuardTests() {
    console.log('================================================================');
    console.log('🛡️ [TEST_QA_PRODUCTION_GUARD] Bateria de Testes de Proteção de QA');
    console.log('================================================================\n');

    let passedChecks = 0;

    const prodUrl = 'https://vqnhtejriorlegqvtivq.supabase.co';
    const stagingUrl = 'https://eywcowvwgccslqfnxaws.supabase.co';
    const unknownUrl = 'https://attacker-target.supabase.co';
    const missingUrl = '';
    const dummyKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.key';

    // ─────────────────────────────────────────────────────────────────────────
    // 1. TESTE DE EXTRAÇÃO E CLASSIFICAÇÃO DE DESTINO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('1. Testando classificação de segurança de destinos...');

    assert.strictEqual(extractProjectHost(prodUrl), 'vqnhtejriorlegqvtivq');
    assert.strictEqual(extractProjectHost(stagingUrl), 'eywcowvwgccslqfnxaws');
    assert.strictEqual(extractProjectHost(unknownUrl), 'attacker-target');
    assert.strictEqual(extractProjectHost(missingUrl), null);

    const evalProd = evaluateDestinationSafety(prodUrl);
    assert.strictEqual(evalProd.safe, false);
    assert.strictEqual(evalProd.reason, 'PRODUCTION_TARGET_DETECTED');
    console.log('   ✅ PASS: Produção classificada como NÃO SEGURA para testes');
    passedChecks++;

    const evalStaging = evaluateDestinationSafety(stagingUrl);
    assert.strictEqual(evalStaging.safe, true);
    assert.strictEqual(evalStaging.reason, 'APPROVED_TEST_TARGET');
    console.log('   ✅ PASS: Staging classificado como SEGURO e homologado');
    passedChecks++;

    const evalUnknown = evaluateDestinationSafety(unknownUrl);
    assert.strictEqual(evalUnknown.safe, false);
    assert.strictEqual(evalUnknown.reason, 'UNAPPROVED_UNKNOWN_TARGET');
    console.log('   ✅ PASS: Destino desconhecido bloqueado');
    passedChecks++;

    const evalMissing = evaluateDestinationSafety(missingUrl);
    assert.strictEqual(evalMissing.safe, false);
    assert.strictEqual(evalMissing.reason, 'MISSING_OR_INVALID_DESTINATION');
    console.log('   ✅ PASS: Destino ausente/nulo bloqueado');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TESTE NEGATIVO DE MUTAÇÕES EM TABELAS CONTRA PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n2. Testando bloqueio de mutações em tabelas contra Produção...');

    // Instanciação direta via createClient sem importar databaseService.js
    const directProdClient = createClient(prodUrl, dummyKey);

    // 2.1 Bloqueio de INSERT
    assert.throws(
        () => directProdClient.from('patients').insert({ name: 'Hacker Test' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.operation === 'insert',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em insert'
    );
    console.log('   ✅ PASS: INSERT bloqueado no cliente direto antes de qualquer chamada HTTP');
    passedChecks++;

    // 2.2 Bloqueio de UPDATE
    assert.throws(
        () => directProdClient.from('appointments').update({ status: 'confirmed' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.operation === 'update',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em update'
    );
    console.log('   ✅ PASS: UPDATE bloqueado no cliente direto antes de qualquer chamada HTTP');
    passedChecks++;

    // 2.3 Bloqueio de DELETE
    assert.throws(
        () => directProdClient.from('sessions').delete(),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.operation === 'delete',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em delete'
    );
    console.log('   ✅ PASS: DELETE bloqueado no cliente direto antes de qualquer chamada HTTP');
    passedChecks++;

    // 2.4 Bloqueio de UPSERT
    assert.throws(
        () => directProdClient.from('clinics').upsert({ id: 'any-id' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.operation === 'upsert',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em upsert'
    );
    console.log('   ✅ PASS: UPSERT bloqueado no cliente direto antes de qualquer chamada HTTP');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TESTE NEGATIVO DE RPCS MUTANTES CONTRA PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n3. Testando bloqueio de RPCs mutantes contra Produção...');

    assert.throws(
        () => directProdClient.rpc('claim_webhook_inbox', { p_limit: 10 }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.rpc === 'claim_webhook_inbox',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em RPC claim_webhook_inbox'
    );
    console.log('   ✅ PASS: RPC claim_webhook_inbox bloqueada');
    passedChecks++;

    assert.throws(
        () => directProdClient.rpc('acquire_session_lock', { p_phone: '123' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.rpc === 'acquire_session_lock',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em RPC acquire_session_lock'
    );
    console.log('   ✅ PASS: RPC acquire_session_lock bloqueada');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 4. TESTE NEGATIVO DE AUTH ADMIN CONTRA PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n4. Testando bloqueio de operações Auth Admin contra Produção...');

    assert.throws(
        () => directProdClient.auth.admin.createUser({ email: 'fake@test.com' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.authOperation === 'createUser',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em auth.admin.createUser'
    );
    console.log('   ✅ PASS: auth.admin.createUser bloqueado');
    passedChecks++;

    assert.throws(
        () => directProdClient.auth.admin.deleteUser('00000000-0000-0000-0000-000000000000'),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.authOperation === 'deleteUser',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em auth.admin.deleteUser'
    );
    console.log('   ✅ PASS: auth.admin.deleteUser bloqueado');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 5. TESTE NEGATIVO DE CHAMADAS HTTP DIRETAS (globalThis.fetch) CONTRA PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n5. Testando bloqueio de requisições HTTP diretas via fetch contra Produção...');

    try {
        await fetch(`${prodUrl}/rest/v1/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Direct HTTP Patient' })
        });
        assert.fail('Deveria ter rejeitado requisição POST direta para produção');
    } catch (err) {
        assert.strictEqual(err.code, 'PROD_MUTATION_GUARD_BLOCKED');
        assert.strictEqual(err.httpMethod, 'POST');
        console.log('   ✅ PASS: HTTP POST direto para produção bloqueado pelo interceptor fetch');
        passedChecks++;
    }

    try {
        await fetch(`${prodUrl}/rest/v1/appointments?id=eq.123`, {
            method: 'DELETE'
        });
        assert.fail('Deveria ter rejeitado requisição DELETE direta para produção');
    } catch (err) {
        assert.strictEqual(err.code, 'PROD_MUTATION_GUARD_BLOCKED');
        assert.strictEqual(err.httpMethod, 'DELETE');
        console.log('   ✅ PASS: HTTP DELETE direto para produção bloqueado pelo interceptor fetch');
        passedChecks++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. TESTE DE BLOQUEIO EM DESTINO DESCONHECIDO E NULO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n6. Testando bloqueio em destino desconhecido e ausente...');

    const unknownDirectClient = createClient(unknownUrl, dummyKey);
    assert.throws(
        () => unknownDirectClient.from('patients').insert({ name: 'Ghost' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED',
        'Deveria bloquear inserção em destino desconhecido'
    );
    console.log('   ✅ PASS: Mutação bloqueada em banco não homologado');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 7. TESTE DE LIBERAÇÃO EM DESTINO DE STAGING HOMOLOGADO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n7. Testando transparência em Staging homologado...');

    const stagingDirectClient = createClient(stagingUrl, dummyKey);
    // Em staging, o cliente permite encadear builders de mutação normalmente (sem erro prévio síncrono do proxy)
    const stagingBuilder = stagingDirectClient.from('patients').insert({ name: 'Staging Candidate' });
    assert.ok(stagingBuilder && typeof stagingBuilder.then === 'function');
    console.log('   ✅ PASS: Staging permite encadear operações normalmente');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 8. TESTE DE ASSERT EXPLICITO EM SCRIPTS DE TESTE
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n8. Testando assertSafeTestDestination...');

    assert.throws(
        () => assertSafeTestDestination(prodUrl),
        err => err.code === 'TEST_DESTINATION_BLOCKED',
        'assertSafeTestDestination deve lançar erro para produção'
    );
    assert.doesNotThrow(
        () => assertSafeTestDestination(stagingUrl),
        'assertSafeTestDestination deve passar para staging'
    );
    console.log('   ✅ PASS: assertSafeTestDestination valida e protege scripts');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 9. TESTE DE PRESERVAÇÃO DE OPERAÇÃO DO SERVIDOR DE PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n9. Testando transparência de runtime do servidor de produção...');

    // Simula contexto de servidor de produção ativo
    const origProdEnv = process.env.NODE_ENV;
    const origServerActive = process.env.CLINICABOT_SERVER_ACTIVE;
    const origArgv1 = process.argv[1];

    try {
        process.env.NODE_ENV = 'production';
        process.env.CLINICABOT_SERVER_ACTIVE = 'true';
        process.argv[1] = 'c:\\app\\server.js';

        assert.strictEqual(isLegitimateProductionServer(), true);

        // Cliente no servidor de produção não recebe bloqueio artificial
        const prodServerClient = wrapClientWithMutationGuard(createClient(prodUrl, dummyKey), prodUrl);
        const prodBuilder = prodServerClient.from('patients').insert({ name: 'Live Patient' });
        assert.ok(prodBuilder && typeof prodBuilder.then === 'function');
        console.log('   ✅ PASS: Servidor de produção opera normalmente sem bloqueios artificiais');
        passedChecks++;
    } finally {
        process.env.NODE_ENV = origProdEnv;
        process.argv[1] = origArgv1;
        if (origServerActive !== undefined) process.env.CLINICABOT_SERVER_ACTIVE = origServerActive;
        else delete process.env.CLINICABOT_SERVER_ACTIVE;
    }

    console.log('\n================================================================');
    console.log(`🎉 [PASS] BATERIA DE PROTEÇÃO DE QA APROVADA: ${passedChecks}/${passedChecks} CHECKS PASS!`);
    console.log('🛡️  Garantia: Zero mutações acidentais podem atingir a Produção.');
    console.log('================================================================\n');
}

runGuardTests()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ FALHA NO TESTE DE GUARDA DE QA:', err);
        process.exit(1);
    });
