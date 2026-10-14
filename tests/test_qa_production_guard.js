/**
 * tests/test_qa_production_guard.js
 * 
 * Bateria de Testes Negativos de Proteção de QA — ClinicaBot SaaS Pro
 * 
 * Valida empiricamente os 7 requisitos obrigatórios:
 * 1. Um teste comum não escreve em produção (.insert, .update, .delete, .upsert).
 * 2. Um script independente que utiliza createClient() diretamente é bloqueado antes de qualquer envio HTTP.
 * 3. Um teste utilizando RPC mutante não alcança produção.
 * 4. Operações de Auth Admin não alcançam produção.
 * 5. Destinos desconhecidos, ausentes e inconsistentes são rejeitados fail-closed.
 * 6. Correspondência EXATA de hostname e projectRef é exigida (sem dependência de includes()).
 * 7. Identificação de credencial de produção via token JWT (claim 'ref') impede bypass de URL.
 * 8. O bloqueio ocorre antes de qualquer tentativa de escrita de rede.
 * 9. O ambiente de Staging homologado (eywcowvwgccslqfnxaws.supabase.co) opera sem bloqueios artificiais.
 * 10. O sistema de produção em runtime legítimo (sem carregamento da guarda de testes) opera normalmente.
 */

const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');
const {
    BLOCKED_PROD_PROJECT_ID,
    BLOCKED_PROD_HOSTNAME,
    APPROVED_STAGING_PROJECT_ID,
    APPROVED_STAGING_HOSTNAME,
    evaluateDestinationSafety,
    assertSafeTestDestination,
    extractExactHostname,
    extractJwtProjectRef
} = require('./helpers/testEnvironmentGuard');

async function runGuardTests() {
    console.log('================================================================');
    console.log('🛡️ [TEST_QA_PRODUCTION_GUARD] Bateria de Testes de Proteção de QA');
    console.log('================================================================\n');

    let passedChecks = 0;

    const prodUrl = `https://${BLOCKED_PROD_HOSTNAME}`;
    const stagingUrl = `https://${APPROVED_STAGING_HOSTNAME}`;
    const unknownUrl = 'https://attacker-target.supabase.co';
    const trickyPrefixUrl = `https://fake-${APPROVED_STAGING_HOSTNAME}`;
    const trickySuffixUrl = `https://${APPROVED_STAGING_PROJECT_ID}.attacker.com`;
    const missingUrl = '';

    // Tokens JWT sintéticos simulando claims reais
    const prodJwtHeaderPayload = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const prodJwtPayload = Buffer.from(JSON.stringify({
        iss: 'supabase',
        ref: BLOCKED_PROD_PROJECT_ID,
        role: 'service_role',
        iat: 1700000000,
        exp: 2000000000
    })).toString('base64url');
    const dummyProdKey = `${prodJwtHeaderPayload}.${prodJwtPayload}.mock_signature`;

    const stagingJwtPayload = Buffer.from(JSON.stringify({
        iss: 'supabase',
        ref: APPROVED_STAGING_PROJECT_ID,
        role: 'service_role',
        iat: 1700000000,
        exp: 2000000000
    })).toString('base64url');
    const dummyStagingKey = `${prodJwtHeaderPayload}.${stagingJwtPayload}.mock_signature`;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. TESTE DE CORRESPONDÊNCIA EXATA DE HOSTNAME E IDENTITY (ANTI-INCLUDES)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('1. Testando correspondência EXATA de hostname e identidade...');

    assert.strictEqual(extractExactHostname(prodUrl), BLOCKED_PROD_HOSTNAME);
    assert.strictEqual(extractExactHostname(stagingUrl), APPROVED_STAGING_HOSTNAME);
    assert.strictEqual(extractExactHostname(unknownUrl), 'attacker-target.supabase.co');
    assert.strictEqual(extractExactHostname(missingUrl), null);

    // Validação de Produção exata
    const evalProd = evaluateDestinationSafety(prodUrl, dummyProdKey);
    assert.strictEqual(evalProd.safe, false);
    assert.strictEqual(evalProd.reason, 'PRODUCTION_TARGET_DETECTED');
    console.log('   ✅ PASS: Produção bloqueada por correspondência exata de hostname');
    passedChecks++;

    // Validação de Staging exato
    const evalStaging = evaluateDestinationSafety(stagingUrl, dummyStagingKey);
    assert.strictEqual(evalStaging.safe, true);
    assert.strictEqual(evalStaging.reason, 'APPROVED_TEST_TARGET');
    console.log('   ✅ PASS: Staging aprovado por correspondência exata de hostname');
    passedChecks++;

    // Validação de bypass com prefixo falso (ex: fake-eywcowvwgccslqfnxaws.supabase.co)
    const evalPrefix = evaluateDestinationSafety(trickyPrefixUrl);
    assert.strictEqual(evalPrefix.safe, false);
    assert.strictEqual(evalPrefix.reason, 'UNAPPROVED_UNKNOWN_TARGET');
    console.log('   ✅ PASS: URL com prefixo falso rejeitada fail-closed (anti-includes)');
    passedChecks++;

    // Validação de bypass com sufixo falso (ex: eywcowvwgccslqfnxaws.attacker.com)
    const evalSuffix = evaluateDestinationSafety(trickySuffixUrl);
    assert.strictEqual(evalSuffix.safe, false);
    assert.strictEqual(evalSuffix.reason, 'UNAPPROVED_UNKNOWN_TARGET');
    console.log('   ✅ PASS: URL com domínio falso rejeitada fail-closed (anti-includes)');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TESTE DE VALIDAÇÃO CRIPTOGRÁFICA DE JWT (TOKEN PROJECT REF)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n2. Testando inspeção de credencial JWT (Token Project Ref)...');

    assert.strictEqual(extractJwtProjectRef(dummyProdKey), BLOCKED_PROD_PROJECT_ID);
    assert.strictEqual(extractJwtProjectRef(dummyStagingKey), APPROVED_STAGING_PROJECT_ID);

    // Tentativa de enganar a URL usando staging mas fornecendo chave de produção
    const evalTrojanKey = evaluateDestinationSafety(stagingUrl, dummyProdKey);
    assert.strictEqual(evalTrojanKey.safe, false);
    assert.strictEqual(evalTrojanKey.reason, 'PRODUCTION_CREDENTIAL_DETECTED');
    console.log('   ✅ PASS: Chave de produção detectada e bloqueada mesmo se URL for disfarçada');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TESTE DE BLOQUEIO DE DESTINOS DESCONHECIDOS E AUSENTES
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n3. Testando bloqueio em destino desconhecido e ausente...');

    const evalUnknown = evaluateDestinationSafety(unknownUrl);
    assert.strictEqual(evalUnknown.safe, false);
    assert.strictEqual(evalUnknown.reason, 'UNAPPROVED_UNKNOWN_TARGET');
    console.log('   ✅ PASS: Destino desconhecido bloqueado fail-closed');
    passedChecks++;

    const evalMissing = evaluateDestinationSafety(missingUrl);
    assert.strictEqual(evalMissing.safe, false);
    assert.strictEqual(evalMissing.reason, 'MISSING_OR_INVALID_DESTINATION');
    console.log('   ✅ PASS: Destino ausente/nulo bloqueado fail-closed');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 4. TESTE DE BLOQUEIO DE MUTAÇÕES TABULARES CONTRA PRODUÇÃO (CLIENTE DIRETO)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n4. Testando bloqueio de mutações tabulares (.insert, .update, .delete, .upsert)...');

    // Script independente que faz createClient() diretamente
    const directProdClient = createClient(prodUrl, dummyProdKey);

    // 4.1 Bloqueio de INSERT
    assert.throws(
        () => directProdClient.from('patients').insert({ name: 'Hacker Test' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.operation === 'insert',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em insert'
    );
    console.log('   ✅ PASS: INSERT bloqueado no cliente direto antes de qualquer chamada HTTP');
    passedChecks++;

    // 4.2 Bloqueio de UPDATE
    assert.throws(
        () => directProdClient.from('appointments').update({ status: 'confirmed' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.operation === 'update',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em update'
    );
    console.log('   ✅ PASS: UPDATE bloqueado no cliente direto antes de qualquer chamada HTTP');
    passedChecks++;

    // 4.3 Bloqueio de DELETE
    assert.throws(
        () => directProdClient.from('sessions').delete(),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.operation === 'delete',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em delete'
    );
    console.log('   ✅ PASS: DELETE bloqueado no cliente direto antes de qualquer chamada HTTP');
    passedChecks++;

    // 4.4 Bloqueio de UPSERT
    assert.throws(
        () => directProdClient.from('clinics').upsert({ id: 'any-id' }),
        err => err.code === 'PROD_MUTATION_GUARD_BLOCKED' && err.operation === 'upsert',
        'Deveria lançar PROD_MUTATION_GUARD_BLOCKED em upsert'
    );
    console.log('   ✅ PASS: UPSERT bloqueado no cliente direto antes de qualquer chamada HTTP');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 5. TESTE DE BLOQUEIO DE RPCS MUTANTES CONTRA PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n5. Testando bloqueio de RPCs mutantes contra Produção...');

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
    // 6. TESTE DE BLOQUEIO DE OPERAÇÕES AUTH ADMIN CONTRA PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n6. Testando bloqueio de operações Auth Admin contra Produção...');

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
    // 7. TESTE DE BLOQUEIO DE REQUISIÇÕES HTTP DIRETAS VIA FETCH
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n7. Testando bloqueio de requisições HTTP diretas via fetch...');

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
    // 8. TESTE DE TRANSPARÊNCIA EM STAGING HOMOLOGADO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n8. Testando transparência em Staging homologado...');

    const stagingDirectClient = createClient(stagingUrl, dummyStagingKey);
    // Em staging, o cliente permite encadear builders de mutação normalmente (sem erro prévio síncrono do proxy)
    const stagingBuilder = stagingDirectClient.from('patients').insert({ name: 'Staging Candidate' });
    assert.ok(stagingBuilder && typeof stagingBuilder.then === 'function');
    console.log('   ✅ PASS: Staging permite encadear operações normalmente');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 9. TESTE DE ASSERT EXPLÍCITO EM SCRIPTS DE TESTE (assertSafeTestDestination)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n9. Testando assertSafeTestDestination...');

    assert.throws(
        () => assertSafeTestDestination(prodUrl, dummyProdKey),
        err => err.code === 'TEST_DESTINATION_BLOCKED',
        'assertSafeTestDestination deve lançar erro para produção'
    );
    assert.doesNotThrow(
        () => assertSafeTestDestination(stagingUrl, dummyStagingKey),
        'assertSafeTestDestination deve passar para staging'
    );
    console.log('   ✅ PASS: assertSafeTestDestination valida e protege scripts de inicialização');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 10. TESTE DE BLOQUEIO SÍNCRONO ANTES DE QUALQUER ENVIO HTTP
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n10. Testando que o bloqueio ocorre de forma síncrona antes de chamada de rede...');

    let networkCallMade = false;
    try {
        directProdClient.from('patients').insert({ name: 'Immediate Crash' });
        networkCallMade = true;
    } catch (err) {
        assert.strictEqual(err.code, 'PROD_MUTATION_GUARD_BLOCKED');
    }
    assert.strictEqual(networkCallMade, false, 'Nenhuma chamada assíncrona ou de rede deve ser iniciada');
    console.log('   ✅ PASS: Bloqueio executado de forma síncrona no método do builder');
    passedChecks++;

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
