/**
 * tests/helpers/testEnvironmentGuard.js
 * 
 * Módulo Centralizado de Proteção de Ambiente de Testes — ClinicaBot SaaS Pro
 * 
 * REGRA INVIOLÁVEL: Nenhum processo de teste, suíte de QA, CI/CD ou script de automação
 * pode executar operações mutantes contra o banco de dados de Produção (vqnhtejriorlegqvtivq),
 * contra destinos desconhecidos ou com configurações ausentes.
 * 
 * ARQUITETURA FAIL-CLOSED CENTRALIZADA:
 * 1. Interceptação no Nível de Protótipo do Driver (SupabaseClient.prototype.from, .rpc):
 *    Garante que QUALQUER instância do cliente Supabase criada em qualquer ponto do processo
 *    (mesmo antes ou depois de require, ou em scripts que não importam databaseService.js)
 *    seja interceptada deterministicamente.
 * 2. Bloqueio Tabular Estrito:
 *    Intercepta e aborta métodos 'insert', 'update', 'delete' e 'upsert'.
 * 3. Bloqueio de RPCs Mutantes:
 *    Intercepta e aborta funções PostgreSQL com efeitos colaterais.
 * 4. Bloqueio no Nível de GoTrueAdminApi.prototype:
 *    Intercepta e aborta mutações de Auth ('createUser', 'deleteUser', 'updateUserById', 'inviteUserByEmail').
 * 5. Bloqueio de Chamadas HTTP Diretas (globalThis.fetch):
 *    Intercepta requisições HTTP mutantes (POST, PATCH, PUT, DELETE) direcionadas à URL de produção.
 * 6. Preservação Estrita de Produção:
 *    Em runtime legítimo de produção ('node server.js' com NODE_ENV=production), a aplicação
 *    opera normalmente sem bloqueios artificiais.
 * 7. Sem Flags de Bypass Fácil:
 *    Imutável, fail-closed por padrão.
 */

const KNOWN_PRODUCTION_HOSTS = [
    'vqnhtejriorlegqvtivq'
];

const APPROVED_TEST_HOSTS = [
    'eywcowvwgccslqfnxaws',    // Supabase Staging Oficial
    'localhost',               // Instâncias locais de desenvolvimento/mock
    '127.0.0.1',
    'placeholder'              // Mock offline/syntax
];

const KNOWN_MUTATING_RPCS = [
    'claim_message_effect',
    'claim_webhook_inbox',
    'acquire_session_lock',
    'renew_session_lock',
    'release_session_lock',
    'merge_session_draft_multitenant',
    'merge_session_draft',
    'cleanup_expired_sessions',
    'cleanup_webhook_tables',
    'complete_webhook',
    'delete_patient_permanently',
    'anonymize_patient_lgpd'
];

const BLOCKED_AUTH_ADMIN_METHODS = [
    'createUser',
    'deleteUser',
    'updateUserById',
    'inviteUserByEmail'
];

/**
 * Extrai o identificador/hostname do projeto a partir da URL do Supabase
 */
function extractProjectHost(url) {
    if (!url || typeof url !== 'string' || !url.trim()) {
        return null;
    }
    const trimmed = url.trim();
    try {
        const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        const hostname = parsed.hostname;
        const sub = hostname.split('.')[0];
        return sub || hostname;
    } catch {
        return null;
    }
}

/**
 * Classifica a segurança do destino para execução de testes mutáveis
 */
function evaluateDestinationSafety(url) {
    const host = extractProjectHost(url);

    if (!host) {
        return {
            safe: false,
            reason: 'MISSING_OR_INVALID_DESTINATION',
            host: null,
            message: 'Configuração de URL do Supabase ausente, nula ou inválida.'
        };
    }

    if (KNOWN_PRODUCTION_HOSTS.includes(host)) {
        return {
            safe: false,
            reason: 'PRODUCTION_TARGET_DETECTED',
            host,
            message: `Destino corresponde ao Supabase de Produção (${host}). Mutações em contexto de testes/scripts são estritamente bloqueadas.`
        };
    }

    if (!APPROVED_TEST_HOSTS.includes(host)) {
        return {
            safe: false,
            reason: 'UNAPPROVED_UNKNOWN_TARGET',
            host,
            message: `Destino '${host}' não consta na lista de ambientes homologados para testes (${APPROVED_TEST_HOSTS.join(', ')}).`
        };
    }

    return {
        safe: true,
        reason: 'APPROVED_TEST_TARGET',
        host,
        message: `Destino seguro e homologado para testes: ${host}`
    };
}

/**
 * Determina se o processo atual é o servidor oficial de produção em execução
 */
function isLegitimateProductionServer() {
    const isProdEnv = process.env.NODE_ENV === 'production';
    const isServerActive = process.env.CLINICABOT_SERVER_ACTIVE === 'true';
    const scriptPath = process.argv[1] || require.main?.filename || '';
    const isServerScript = /server\.js$/i.test(scriptPath);

    return isProdEnv && isServerActive && isServerScript;
}

/**
 * Assegura que o destino é seguro para testes. Lança erro fatal caso contrário.
 */
function assertSafeTestDestination(url) {
    if (isLegitimateProductionServer()) {
        return { safe: true, reason: 'LEGITIMATE_PRODUCTION_SERVER' };
    }

    const evalResult = evaluateDestinationSafety(url);
    if (!evalResult.safe) {
        const error = new Error(`[TEST_ENVIRONMENT_GUARD] ${evalResult.message} (Motivo: ${evalResult.reason})`);
        error.code = 'TEST_DESTINATION_BLOCKED';
        error.safetyEvaluation = evalResult;
        throw error;
    }
    return evalResult;
}

/**
 * Envolve um query builder com proxy fail-closed para métodos mutantes
 */
function wrapBuilderWithMutationGuard(builder, table, safety) {
    return new Proxy(builder, {
        get(bTarget, bProp, bReceiver) {
            if (['insert', 'update', 'delete', 'upsert'].includes(bProp)) {
                return function blockedMutation(...args) {
                    const err = new Error(
                        `[PROD_MUTATION_GUARD_BLOCKED] Operação tabular '${bProp}' interceptada e bloqueada contra o destino '${safety.host || 'desconhecido'}' (tabela '${table}').\n` +
                        `Motivo: ${safety.message}\n` +
                        `Testes e scripts automatizados estão estritamente proibidos de modificar dados de produção.`
                    );
                    err.code = 'PROD_MUTATION_GUARD_BLOCKED';
                    err.table = table;
                    err.operation = bProp;
                    err.targetHost = safety.host;
                    throw err;
                };
            }
            const origVal = Reflect.get(bTarget, bProp, bReceiver);
            if (typeof origVal === 'function') {
                return origVal.bind(bTarget);
            }
            return origVal;
        }
    });
}

/**
 * Patch global em @supabase/supabase-js e globalThis.fetch
 * Garante que clientes criados diretamente ou chamadas HTTP diretas fiquem protegidos
 */
function installGlobalDriverInterception() {
    if (globalThis.__CLINICABOT_GUARD_INSTALLED__) {
        return;
    }
    globalThis.__CLINICABOT_GUARD_INSTALLED__ = true;

    try {
        const sbModule = require('@supabase/supabase-js');

        // 1. Patch no SupabaseClient.prototype.from
        if (sbModule.SupabaseClient && sbModule.SupabaseClient.prototype) {
            const origFrom = sbModule.SupabaseClient.prototype.from;
            sbModule.SupabaseClient.prototype.from = function guardedFrom(table) {
                const builder = origFrom.call(this, table);
                if (isLegitimateProductionServer()) {
                    return builder;
                }
                const safety = evaluateDestinationSafety(this.supabaseUrl);
                if (safety.safe) {
                    return builder;
                }
                return wrapBuilderWithMutationGuard(builder, table, safety);
            };

            // 2. Patch no SupabaseClient.prototype.rpc
            const origRpc = sbModule.SupabaseClient.prototype.rpc;
            sbModule.SupabaseClient.prototype.rpc = function guardedRpc(fnName, args) {
                if (!isLegitimateProductionServer()) {
                    const safety = evaluateDestinationSafety(this.supabaseUrl);
                    if (!safety.safe) {
                        const isMutating = KNOWN_MUTATING_RPCS.includes(fnName) ||
                            (!fnName.startsWith('get_') && !fnName.startsWith('check_'));

                        if (isMutating) {
                            const err = new Error(
                                `[PROD_MUTATION_GUARD_BLOCKED] Chamada à RPC mutante '${fnName}' interceptada e bloqueada contra o destino '${safety.host || 'desconhecido'}'.\n` +
                                `Motivo: ${safety.message}\n` +
                                `Testes automatizados estão estritamente proibidos de invocar funções de escrita em produção.`
                            );
                            err.code = 'PROD_MUTATION_GUARD_BLOCKED';
                            err.rpc = fnName;
                            err.targetHost = safety.host;
                            throw err;
                        }
                    }
                }
                return origRpc.call(this, fnName, args);
            };
        }

        // 3. Patch no GoTrueAdminApi.prototype (Auth Admin)
        if (sbModule.GoTrueAdminApi && sbModule.GoTrueAdminApi.prototype) {
            for (const method of BLOCKED_AUTH_ADMIN_METHODS) {
                const origMethod = sbModule.GoTrueAdminApi.prototype[method];
                if (typeof origMethod === 'function') {
                    sbModule.GoTrueAdminApi.prototype[method] = function guardedAdminMethod(...args) {
                        if (!isLegitimateProductionServer()) {
                            const safety = evaluateDestinationSafety(this.url);
                            if (!safety.safe) {
                                const err = new Error(
                                    `[PROD_MUTATION_GUARD_BLOCKED] Operação administrativa de Auth '${method}' interceptada e bloqueada contra o destino '${safety.host || 'desconhecido'}'.\n` +
                                    `Motivo: ${safety.message}\n` +
                                    `Testes automatizados estão estritamente proibidos de mutar identidades em produção.`
                                );
                                err.code = 'PROD_MUTATION_GUARD_BLOCKED';
                                err.authOperation = method;
                                err.targetHost = safety.host;
                                throw err;
                            }
                        }
                        return origMethod.apply(this, args);
                    };
                }
            }
        }
    } catch (err) {
        // Se @supabase/supabase-js não puder ser interceptado, lança erro fatal (fail-closed)
        throw new Error(`[TEST_ENVIRONMENT_GUARD_FATAL] Falha crítica ao instalar interceptação no driver @supabase/supabase-js: ${err.message}`);
    }

    // 4. Patch no globalThis.fetch para chamadas HTTP diretas ao Supabase
    if (typeof globalThis.fetch === 'function') {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = function guardedFetch(input, init) {
            const urlString = typeof input === 'string' ? input : input?.url || '';
            const method = (init?.method || (typeof input === 'object' ? input.method : 'GET') || 'GET').toUpperCase();

            if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
                if (!isLegitimateProductionServer()) {
                    const host = extractProjectHost(urlString);
                    if (host && KNOWN_PRODUCTION_HOSTS.includes(host)) {
                        const err = new Error(
                            `[PROD_MUTATION_GUARD_BLOCKED] Chamada HTTP direta '${method}' interceptada e bloqueada contra o destino de produção '${urlString}'.\n` +
                            `Testes automatizados estão estritamente proibidos de enviar requisições mutantes HTTP para produção.`
                        );
                        err.code = 'PROD_MUTATION_GUARD_BLOCKED';
                        err.httpMethod = method;
                        err.targetUrl = urlString;
                        return Promise.reject(err);
                    }
                }
            }

            return originalFetch.call(this, input, init);
        };
    }
}

// Função utilitária mantida para compatibilidade de interface
function wrapClientWithMutationGuard(client, url) {
    installGlobalDriverInterception();
    return client;
}

// Auto-instalação da interceptação global no carregamento do módulo
installGlobalDriverInterception();

module.exports = {
    KNOWN_PRODUCTION_HOSTS,
    APPROVED_TEST_HOSTS,
    KNOWN_MUTATING_RPCS,
    BLOCKED_AUTH_ADMIN_METHODS,
    extractProjectHost,
    evaluateDestinationSafety,
    isLegitimateProductionServer,
    assertSafeTestDestination,
    wrapClientWithMutationGuard,
    installGlobalDriverInterception
};
