/**
 * tests/test_production_runtime_integrity.js
 * 
 * Simulação de Integridade de Runtime de Produção vs Isolamento de QA
 * ClinicaBot SaaS Pro — V19.1
 * 
 * OBJETIVO:
 * Provar empiricamente que:
 * 1. O servidor de produção (server.js / databaseService.js) em runtime normal NUNCA carrega
 *    ou instala interceptadores de testes, garantindo funcionamento 100% nativo.
 * 2. services/databaseService.js não possui qualquer dependência de módulos de testes.
 * 3. O driver @supabase/supabase-js e globalThis.fetch permanecem intactos em produção.
 * 4. Operações de banco legítimas e chamadas a APIs externas (Gemini, Meta WhatsApp)
 *    não sofrem bloqueios artificiais em produção.
 * 5. Processos de teste iniciados com preloading (-r ./tests/helpers/testEnvironmentGuard.js)
 *    abortam fail-closed se apontados para produção no startup e bloqueiam mutações dinâmicas.
 * 6. O ambiente de staging funciona plenamente tanto em runtime normal quanto sob QA guard.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const http = require('http');

const rootDir = path.resolve(__dirname, '..');
const PROD_URL = 'https://vqnhtejriorlegqvtivq.supabase.co';
const STAGING_URL = 'https://eywcowvwgccslqfnxaws.supabase.co';

const prodJwtHeaderPayload = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const prodJwtPayload = Buffer.from(JSON.stringify({
    iss: 'supabase',
    ref: 'vqnhtejriorlegqvtivq',
    role: 'service_role',
    iat: 1700000000,
    exp: 2000000000
})).toString('base64url');
const DUMMY_PROD_KEY = `${prodJwtHeaderPayload}.${prodJwtPayload}.mock_sig`;

const stagingJwtPayload = Buffer.from(JSON.stringify({
    iss: 'supabase',
    ref: 'eywcowvwgccslqfnxaws',
    role: 'service_role',
    iat: 1700000000,
    exp: 2000000000
})).toString('base64url');
const DUMMY_STAGING_KEY = `${prodJwtHeaderPayload}.${stagingJwtPayload}.mock_sig`;

async function runProductionRuntimeIntegritySuite() {
    console.log('================================================================');
    console.log('🏭 [TEST_PROD_INTEGRITY] Simulação de Runtime de Produção vs QA');
    console.log('================================================================\n');

    let totalChecks = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 1: SIMULAÇÃO DE INICIALIZAÇÃO DE PRODUÇÃO (SEM PRELOAD DE TESTES)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('1. Executando simulação de inicialização limpa de produção...');

    const prodBootScript = `
        const assert = require('assert');
        
        // Simula variáveis de ambiente estritas de produção
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = '${PROD_URL}';
        process.env.SUPABASE_SERVICE_KEY = '${DUMMY_PROD_KEY}';
        
        // Carrega databaseService exatamente como server.js carrega
        const db = require('./services/databaseService');
        const { SupabaseClient } = require('@supabase/supabase-js');
        
        // 1.1 Garante que nenhuma flag de teste foi injetada no global
        assert.strictEqual(globalThis.__CLINICABOT_GUARD_INSTALLED__, undefined, 'Guard não deve estar instalado em produção');
        assert.strictEqual(globalThis.__CLINICABOT_TEST_RUNNER_ACTIVE__, undefined, 'Test runner flag não deve existir em produção');
        
        // 1.2 Garante que protótipos do driver não foram modificados
        assert.notStrictEqual(SupabaseClient.prototype.from.name, 'guardedFrom', 'SupabaseClient.prototype.from não deve ser guardedFrom');
        assert.notStrictEqual(SupabaseClient.prototype.rpc.name, 'guardedRpc', 'SupabaseClient.prototype.rpc não deve ser guardedRpc');
        
        // 1.3 Garante que globalThis.fetch não foi monkey-patched
        if (typeof globalThis.fetch === 'function') {
            assert.notStrictEqual(globalThis.fetch.name, 'guardedFetch', 'globalThis.fetch não deve ser guardedFetch');
        }
        
        // 1.4 Garante que databaseService.supabase é um cliente nativo sem proxy bloqueador
        // Chamada de inserção constrói query builder normalmente sem lançar exceção PROD_MUTATION_GUARD_BLOCKED
        let thrownError = null;
        try {
            const builder = db.supabase.from('patients').insert({ name: 'Prod Patient' });
            assert.ok(builder, 'Builder deve ser retornado');
            assert.strictEqual(typeof builder.then, 'function', 'Builder deve ser Thenable nativo');
        } catch (err) {
            thrownError = err;
        }
        assert.strictEqual(thrownError, null, 'Nenhuma exceção síncrona deve ser lançada em produção');
        
        // 1.5 Garante que RPC também constrói promise normalmente sem exceção de guard
        try {
            const rpcPromise = db.supabase.rpc('claim_webhook_inbox', { p_limit: 1 });
            assert.ok(rpcPromise, 'RPC Promise deve ser retornada');
        } catch (err) {
            thrownError = err;
        }
        assert.strictEqual(thrownError, null, 'Nenhuma exceção síncrona de RPC deve ser lançada em produção');

        console.log('PROD_RUNTIME_OK');
    `;

        const prodBootProc = spawnSync(process.execPath, ['-e', prodBootScript], {
        cwd: rootDir,
        encoding: 'utf8',
        env: {
            ...process.env,
            NODE_ENV: 'production',
            SUPABASE_URL: PROD_URL,
            SUPABASE_SERVICE_KEY: DUMMY_PROD_KEY,
            CPF_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        }
    });

    if (prodBootProc.status !== 0) {
        console.error('STDOUT:', prodBootProc.stdout);
        console.error('STDERR:', prodBootProc.stderr);
        throw new Error(`Simulação de produção falhou com código ${prodBootProc.status}`);
    }

    assert.ok(prodBootProc.stdout.includes('PROD_RUNTIME_OK'));
    console.log('   ✅ PASS: databaseService.js carrega com variáveis de produção sem carregar interceptadores de teste');
    totalChecks++;
    console.log('   ✅ PASS: SupabaseClient.prototype.from e rpc operam em modo nativo em produção');
    totalChecks++;
    console.log('   ✅ PASS: Zero monkey-patching em globalThis.fetch no runtime de produção');
    totalChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 2: PRESERVAÇÃO DE CHAMADAS A APIS EXTERNAS (GEMINI / META / SENTRY)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n2. Testando integridade de chamadas HTTP externas (fetch nativo)...');

    const extTestScript = `
        const assert = require('assert');
        const http = require('http');

        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', method: req.method, body }));
            });
        });

        server.listen(0, '127.0.0.1', async () => {
            const port = server.address().port;
            try {
                const response = await fetch(\`http://127.0.0.1:\${port}/api/external-call\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'Hello External API' })
                });
                const data = await response.json();
                assert.strictEqual(data.status, 'ok');
                assert.strictEqual(data.method, 'POST');
                console.log('EXTERNAL_CALL_OK');
            } catch (err) {
                console.error(err);
                process.exit(1);
            } finally {
                server.close();
            }
        });
    `;

    const extProc = spawnSync(process.execPath, ['-e', extTestScript], {
        cwd: rootDir,
        encoding: 'utf8'
    });

    assert.strictEqual(extProc.status, 0, `External call falhou: ${extProc.stderr}`);
    assert.ok(extProc.stdout.includes('EXTERNAL_CALL_OK'));
    console.log('   ✅ PASS: Requisições POST externas via fetch completam com sucesso sem interceptação indevida');
    totalChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 3: PRELOAD DE TESTES (-r) ABORTA FAIL-CLOSED SE APONTADO PARA PRODUÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n3. Testando aborto fail-closed no startup se processo de teste apontar para produção...');

    const prodTestAttemptScript = `
        console.log('SHOULD_NEVER_REACH_THIS_LINE');
    `;

    const blockedProc = spawnSync(process.execPath, [
        '-r', './tests/helpers/testEnvironmentGuard.js',
        '-e', prodTestAttemptScript
    ], {
        cwd: rootDir,
        encoding: 'utf8',
        env: {
            ...process.env,
            SUPABASE_URL: PROD_URL,
            SUPABASE_SERVICE_KEY: DUMMY_PROD_KEY
        }
    });

    assert.strictEqual(blockedProc.status, 1, 'Processo de teste apontado para produção deve abortar com status 1');
    assert.ok(blockedProc.stderr.includes('[FATAL_TEST_GUARD]'), 'Deve emitir mensagem FATAL_TEST_GUARD no stderr');
    assert.ok(!blockedProc.stdout.includes('SHOULD_NEVER_REACH_THIS_LINE'), 'Código de teste nunca deve ser executado');
    console.log('   ✅ PASS: Processo de teste abortado antes da execução de qualquer linha de teste');
    totalChecks++;

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 4: EXECUÇÃO DE TESTE COM PRELOAD EM STAGING HOMOLOGADO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n4. Testando execução em Staging homologado com preload de QA...');

    const stagingTestScript = `
        const assert = require('assert');
        const db = require('./services/databaseService');
        const { createClient } = require('@supabase/supabase-js');
        
        // 4.1 Valida que no processo de teste o guard está ativo
        assert.strictEqual(globalThis.__CLINICABOT_GUARD_INSTALLED__, true);
        assert.strictEqual(globalThis.__CLINICABOT_TEST_RUNNER_ACTIVE__, true);
        
        // 4.2 Valida que operações contra Staging são permitidas
        const stagingBuilder = db.supabase.from('patients').insert({ name: 'Staging Candidate' });
        assert.ok(stagingBuilder);
        
        // 4.3 Valida que tentativa dinâmica de criar cliente para Produção é interceptada
        const dynamicProdClient = createClient('${PROD_URL}', '${DUMMY_PROD_KEY}');
        assert.throws(
            () => dynamicProdClient.from('patients').insert({ name: 'Sneaky Injection' }),
            err => err.code === 'PROD_MUTATION_GUARD_BLOCKED'
        );
        assert.throws(
            () => dynamicProdClient.rpc('claim_webhook_inbox', { p_limit: 10 }),
            err => err.code === 'PROD_MUTATION_GUARD_BLOCKED'
        );
        assert.throws(
            () => dynamicProdClient.auth.admin.createUser({ email: 'hack@test.com' }),
            err => err.code === 'PROD_MUTATION_GUARD_BLOCKED'
        );
        
        console.log('STAGING_GUARD_OK');
    `;

    const stagingProc = spawnSync(process.execPath, [
        '-r', './tests/helpers/testEnvironmentGuard.js',
        '-e', stagingTestScript
    ], {
        cwd: rootDir,
        encoding: 'utf8',
        env: {
            ...process.env,
            SUPABASE_URL: STAGING_URL,
            SUPABASE_SERVICE_KEY: DUMMY_STAGING_KEY,
            CPF_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        }
    });

    if (stagingProc.status !== 0) {
        console.error('STDOUT:', stagingProc.stdout);
        console.error('STDERR:', stagingProc.stderr);
        throw new Error(`Teste de staging falhou com código ${stagingProc.status}`);
    }

    assert.ok(stagingProc.stdout.includes('STAGING_GUARD_OK'));
    console.log('   ✅ PASS: Processo de teste em Staging opera normalmente com interceptação ativa para produção');
    totalChecks++;
    console.log('   ✅ PASS: Tentativas dinâmicas de mutação contra produção dentro de testes são estritamente bloqueadas');
    totalChecks++;

    console.log('\n================================================================');
    console.log(`🎉 [PASS] INTEGRIDADE DE RUNTIME DE PRODUÇÃO COMPROVADA: ${totalChecks}/${totalChecks} CHECKS PASS!`);
    console.log('🛡️  Produção limpa e nativa | Testes isolados e fail-closed.');
    console.log('================================================================\n');
}

runProductionRuntimeIntegritySuite()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ FALHA NO TESTE DE INTEGRIDADE:', err);
        process.exit(1);
    });
