/**
 * tests/test_qa_production_guard.js
 * 
 * Bateria de Testes Negativos de Proteção de QA — ClinicaBot SaaS Pro
 * 
 * Valida que:
 * 1. Qualquer tentativa de teste mutável contra Produção (vqnhtejriorlegqvtivq) é bloqueada imediatamente.
 * 2. Destinos desconhecidos ou URLs ausentes são bloqueados com erro explícito.
 * 3. Mutações por tabelas (.insert, .update, .delete, .upsert) e por RPCs são interceptadas.
 * 4. Nenhuma requisição de escrita alcança o banco de produção.
 * 5. Destinos de Staging (eywcowvwgccslqfnxaws) e mocks locais são permitidos.
 */

const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');
const {
    evaluateDestinationSafety,
    assertSafeTestDestination,
    wrapClientWithMutationGuard,
    extractProjectHost
} = require('./helpers/testEnvironmentGuard');

async function runGuardTests() {
    console.log('================================================================');
    console.log('🛡️ [TEST_QA_PRODUCTION_GUARD] Bateria de Testes de Proteção de QA');
    console.log('================================================================\n');

    let passedChecks = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. TESTE DE EXTRAÇÃO E CLASSIFICAÇÃO DE DESTINO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('1. Testando classificação de segurança de destinos...');

    const prodUrl = 'https://vqnhtejriorlegqvtivq.supabase.co';
    const stagingUrl = 'https://eywcowvwgccslqfnxaws.supabase.co';
    const unknownUrl = 'https://attacker-target.supabase.co';
    const missingUrl = '';

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

    const dummyKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.key';
    const rawProdClient = createClient(prodUrl, dummyKey);
    const guardedProdClient = wrapClientWithMutationGuard(rawProdClient, prodUrl);

    // 2.1 Bloqueio de INSERT
    assert.throws(
        () => guardedProdClient.from('patients').insert({ name: 'Hacker Test' }),
        err => err.code === 'PRODUCTION_MUTATION_BLOCKED' && err.operation === 'insert',
        'Deveria lançar PRODUCTION_MUTATION_BLOCKED em insert'
    );
    console.log('   ✅ PASS: INSERT bloqueado antes de qualquer chamada HTTP');
    passedChecks++;

    // 2.2 Bloqueio de UPDATE
    assert.throws(
        () => guardedProdClient.from('appointments').update({ status: 'confirmed' }),
        err => err.code === 'PRODUCTION_MUTATION_BLOCKED' && err.operation === 'update',
        'Deveria lançar PRODUCTION_MUTATION_BLOCKED em update'
    );
    console.log('   ✅ PASS: UPDATE bloqueado antes de qualquer chamada HTTP');
    passedChecks++;

    // 2.3 Bloqueio de DELETE
    assert.throws(
        () => guardedProdClient.from('sessions').delete(),
        err => err.code === 'PRODUCTION_MUTATION_BLOCKED' && err.operation === 'delete',
        'Deveria lançar PRODUCTION_MUTATION_BLOCKED em delete'
    );
    console.log('   ✅ PASS: DELETE bloqueado antes de qualquer chamada HTTP');
    passedChecks++;

    // 2.4 Bloqueio de UPSERT
    assert.throws(
        () => guardedProdClient.from('clinics').upsert({ id: 'any-id' }),
        err => err.code === 'PRODUCTION_MUTATION_BLOCKED' && err.operation === 'upsert',
        'Deveria lançar PRODUCTION_MUTATION_BLOCKED em upsert'
    );
    console.log('   ✅ PASS: UPSERT bloqueado antes de qualquer chamada HTTP');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TESTE NEGATIVO DE RPCS MUTÁVEIS CONTRA PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n3. Testando bloqueio de RPCs mutáveis contra Produção...');

    assert.throws(
        () => guardedProdClient.rpc('claim_message_effect', { p_message_id: 'test' }),
        err => err.code === 'PRODUCTION_MUTATION_BLOCKED' && err.rpc === 'claim_message_effect',
        'Deveria lançar PRODUCTION_MUTATION_BLOCKED em RPC claim_message_effect'
    );
    console.log('   ✅ PASS: RPC claim_message_effect bloqueada');
    passedChecks++;

    assert.throws(
        () => guardedProdClient.rpc('acquire_session_lock', { p_phone: '123' }),
        err => err.code === 'PRODUCTION_MUTATION_BLOCKED' && err.rpc === 'acquire_session_lock',
        'Deveria lançar PRODUCTION_MUTATION_BLOCKED em RPC acquire_session_lock'
    );
    console.log('   ✅ PASS: RPC acquire_session_lock bloqueada');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 4. TESTE DE BLOQUEIO EM DESTINO DESCONHECIDO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n4. Testando bloqueio em destino desconhecido...');

    const guardedUnknownClient = wrapClientWithMutationGuard(rawProdClient, unknownUrl);
    assert.throws(
        () => guardedUnknownClient.from('patients').insert({ name: 'Ghost' }),
        err => err.code === 'PRODUCTION_MUTATION_BLOCKED',
        'Deveria bloquear inserção em destino desconhecido'
    );
    console.log('   ✅ PASS: Mutação bloqueada em banco não homologado');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 5. TESTE DE LIBERAÇÃO EM DESTINO DE STAGING HOMOLOGADO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n5. Testando transparência em Staging homologado...');

    const rawStagingClient = createClient(stagingUrl, dummyKey);
    const guardedStagingClient = wrapClientWithMutationGuard(rawStagingClient, stagingUrl);

    // Em staging, o wrap retorna o próprio cliente sem bloqueios artificiais
    assert.strictEqual(guardedStagingClient, rawStagingClient);
    console.log('   ✅ PASS: Staging opera normalmente com o cliente real');
    passedChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // 6. TESTE DE ASSERT EXPLICITO EM SCRIPTS DE TESTE
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n6. Testando assertSafeTestDestination...');

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

    console.log('\n================================================================');
    console.log(`🎉 [PASS] BATERIA DE PROTEÇÃO DE QA APROVADA: ${passedChecks}/${passedChecks} CHECKS PASS!`);
    console.log('🛡️ Garantia: Zero mutações acidentais podem atingir a Produção.');
    console.log('================================================================\n');
}

runGuardTests()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ FALHA NO TESTE DE GUARDA DE QA:', err);
        process.exit(1);
    });
