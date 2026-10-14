/**
 * tests/helpers/testEnvironmentGuard.js
 * 
 * Módulo Centralizado de Proteção de Ambiente de Testes — ClinicaBot SaaS Pro
 * 
 * REGRA INVIOLÁVEL: Nenhum processo de teste, suíte de QA, CI/CD ou script de automação
 * pode executar operações mutantes contra o banco de dados de Produção (vqnhtejriorlegqvtivq),
 * contra destinos desconhecidos ou com configurações ausentes.
 * 
 * ARQUITETURA FAIL-CLOSED CENTRALIZADA (Defesa em Profundidade):
 * 1. Validação Exata de Hostname e Identidade do Projeto:
 *    - Produção Bloqueada: hostname === 'vqnhtejriorlegqvtivq.supabase.co' ou projectRef === 'vqnhtejriorlegqvtivq'
 *    - Staging Autorizado: hostname === 'eywcowvwgccslqfnxaws.supabase.co' ou projectRef === 'eywcowvwgccslqfnxaws'
 *    - Rejeição estrita de correspondências parciais (não depende de includes()).
 * 2. Validação Criptográfica de JWT (Token Ref):
 *    - Inspeciona o claim 'ref' no payload base64url da chave. Se pertencer a produção, bloqueia imediatamente.
 * 3. Interceptação no Nível de Protótipo do Driver (@supabase/supabase-js):
 *    - SupabaseClient.prototype.from: bloqueia 'insert', 'update', 'delete', 'upsert' antes do envio HTTP.
 *    - SupabaseClient.prototype.rpc: bloqueia funções mutantes antes do envio HTTP.
 *    - GoTrueAdminApi.prototype: bloqueia mutações Auth Admin ('createUser', 'deleteUser', etc.).
 * 4. Interceptação de Chamadas HTTP Diretas (globalThis.fetch):
 *    - Intercepta métodos POST, PATCH, PUT, DELETE direcionados ao hostname de produção.
 * 5. Preload Automático nos Test Runners:
 *    - package.json, run_night_suite.js e overnight_test_suite.js pré-carregam este módulo.
 * 6. Sem Bypass Frágil:
 *    - Em ambiente de testes, NUNCA é permitido mutar produção sob nenhuma flag ou argumento.
 */

const BLOCKED_PROD_PROJECT_ID = 'vqnhtejriorlegqvtivq';
const BLOCKED_PROD_HOSTNAME = 'vqnhtejriorlegqvtivq.supabase.co';

const APPROVED_STAGING_PROJECT_ID = 'eywcowvwgccslqfnxaws';
const APPROVED_STAGING_HOSTNAME = 'eywcowvwgccslqfnxaws.supabase.co';

const APPROVED_LOCAL_HOSTS = [
    'localhost',
    '127.0.0.1',
    'placeholder.supabase.co'
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
 * Extrai o hostname exato a partir da URL do Supabase
 */
function extractExactHostname(url) {
    if (!url || typeof url !== 'string' || !url.trim()) {
        return null;
    }
    const trimmed = url.trim();
    try {
        const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        return parsed.hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Extrai a referência do projeto a partir do token JWT (sem validar assinatura, apenas lendo payload)
 */
function extractJwtProjectRef(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;
    try {
        const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadStr);
        return payload.ref || null;
    } catch {
        return null;
    }
}

/**
 * Classifica a segurança do destino e da credencial para execução de testes mutáveis
 * Validação com correspondência EXATA de hostname e projectRef
 */
function evaluateDestinationSafety(url, key = null) {
    const hostname = extractExactHostname(url);

    if (!hostname) {
        return {
            safe: false,
            reason: 'MISSING_OR_INVALID_DESTINATION',
            hostname: null,
            projectRef: null,
            message: 'Configuração de URL do Supabase ausente, nula ou com sintaxe inválida.'
        };
    }

    const projectRefFromHost = hostname.split('.')[0];
    const projectRefFromJwt = key ? extractJwtProjectRef(key) : null;

    // 1. Bloqueio Estrito de Produção por Hostname Exato
    if (hostname === BLOCKED_PROD_HOSTNAME || projectRefFromHost === BLOCKED_PROD_PROJECT_ID) {
        return {
            safe: false,
            reason: 'PRODUCTION_TARGET_DETECTED',
            hostname,
            projectRef: BLOCKED_PROD_PROJECT_ID,
            message: `Destino corresponde exatamente ao Supabase de Produção (${BLOCKED_PROD_HOSTNAME}). Mutações em contexto de testes/scripts são estritamente bloqueadas.`
        };
    }

    // 2. Bloqueio Estrito de Produção por Credencial JWT
    if (projectRefFromJwt === BLOCKED_PROD_PROJECT_ID) {
        return {
            safe: false,
            reason: 'PRODUCTION_CREDENTIAL_DETECTED',
            hostname,
            projectRef: BLOCKED_PROD_PROJECT_ID,
            message: `Credencial fornecida pertence ao projeto de Produção (${BLOCKED_PROD_PROJECT_ID}). Execução de testes mutáveis abortada.`
        };
    }

    // 3. Verificação de Staging Homologado por Correspondência Exata
    const isExactStagingHost = (hostname === APPROVED_STAGING_HOSTNAME);
    const isExactLocalHost = APPROVED_LOCAL_HOSTS.includes(hostname);

    if (!isExactStagingHost && !isExactLocalHost) {
        return {
            safe: false,
            reason: 'UNAPPROVED_UNKNOWN_TARGET',
            hostname,
            projectRef: projectRefFromHost,
            message: `Destino '${hostname}' não consta na lista de ambientes homologados para testes (${APPROVED_STAGING_HOSTNAME}, ${APPROVED_LOCAL_HOSTS.join(', ')}).`
        };
    }

    // 4. Verificação de Consistência de Credencial em Staging
    if (isExactStagingHost && projectRefFromJwt && projectRefFromJwt !== APPROVED_STAGING_PROJECT_ID) {
        return {
            safe: false,
            reason: 'INCONSISTENT_CREDENTIALS',
            hostname,
            projectRef: projectRefFromJwt,
            message: `Credencial fornecida pertence ao projeto '${projectRefFromJwt}', mas o destino configurado é Staging (${APPROVED_STAGING_PROJECT_ID}). Inconsistência detectada.`
        };
    }

    return {
        safe: true,
        reason: 'APPROVED_TEST_TARGET',
        hostname,
        projectRef: projectRefFromHost,
        message: `Destino homologado e seguro para testes: ${hostname}`
    };
}

/**
 * Assegura que o destino é seguro para testes. Lança erro fatal com código explícito caso contrário.
 */
function assertSafeTestDestination(url, key = null) {
    const evalResult = evaluateDestinationSafety(url, key);
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
                        `[PROD_MUTATION_GUARD_BLOCKED] Operação tabular '${bProp}' interceptada e bloqueada contra o destino '${safety.hostname || 'desconhecido'}' (tabela '${table}').\n` +
                        `Motivo: ${safety.message}\n` +
                        `Testes automatizados estão estritamente proibidos de modificar dados de produção ou destinos não homologados.`
                    );
                    err.code = 'PROD_MUTATION_GUARD_BLOCKED';
                    err.table = table;
                    err.operation = bProp;
                    err.targetHost = safety.hostname;
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
 * Instalação de Interceptação Global no Driver @supabase/supabase-js e globalThis.fetch
 * Protege qualquer cliente instanciado diretamente por scripts de teste
 */
function installGlobalDriverInterception() {
    if (globalThis.__CLINICABOT_GUARD_INSTALLED__) {
        return;
    }
    globalThis.__CLINICABOT_GUARD_INSTALLED__ = true;

    try {
        const sbModule = require('@supabase/supabase-js');

        // 1. Interceptação no SupabaseClient.prototype.from
        if (sbModule.SupabaseClient && sbModule.SupabaseClient.prototype) {
            const origFrom = sbModule.SupabaseClient.prototype.from;
            sbModule.SupabaseClient.prototype.from = function guardedFrom(table) {
                const builder = origFrom.call(this, table);
                const safety = evaluateDestinationSafety(this.supabaseUrl, this.supabaseKey);
                if (safety.safe) {
                    return builder;
                }
                return wrapBuilderWithMutationGuard(builder, table, safety);
            };

            // 2. Interceptação no SupabaseClient.prototype.rpc
            const origRpc = sbModule.SupabaseClient.prototype.rpc;
            sbModule.SupabaseClient.prototype.rpc = function guardedRpc(fnName, args) {
                const safety = evaluateDestinationSafety(this.supabaseUrl, this.supabaseKey);
                if (!safety.safe) {
                    const isMutating = KNOWN_MUTATING_RPCS.includes(fnName) ||
                        (!fnName.startsWith('get_') && !fnName.startsWith('check_') && !fnName.startsWith('list_'));

                    if (isMutating) {
                        const err = new Error(
                            `[PROD_MUTATION_GUARD_BLOCKED] Chamada à RPC mutante '${fnName}' interceptada e bloqueada contra o destino '${safety.hostname || 'desconhecido'}'.\n` +
                            `Motivo: ${safety.message}\n` +
                            `Testes automatizados estão estritamente proibidos de invocar funções de escrita em produção ou destinos não homologados.`
                        );
                        err.code = 'PROD_MUTATION_GUARD_BLOCKED';
                        err.rpc = fnName;
                        err.targetHost = safety.hostname;
                        throw err;
                    }
                }
                return origRpc.call(this, fnName, args);
            };
        }

        // 3. Interceptação no GoTrueAdminApi.prototype (Auth Admin)
        if (sbModule.GoTrueAdminApi && sbModule.GoTrueAdminApi.prototype) {
            for (const method of BLOCKED_AUTH_ADMIN_METHODS) {
                const origMethod = sbModule.GoTrueAdminApi.prototype[method];
                if (typeof origMethod === 'function') {
                    sbModule.GoTrueAdminApi.prototype[method] = function guardedAdminMethod(...args) {
                        const safety = evaluateDestinationSafety(this.url);
                        if (!safety.safe) {
                            const err = new Error(
                                `[PROD_MUTATION_GUARD_BLOCKED] Operação administrativa de Auth '${method}' interceptada e bloqueada contra o destino '${safety.hostname || 'desconhecido'}'.\n` +
                                `Motivo: ${safety.message}\n` +
                                `Testes automatizados estão estritamente proibidos de mutar identidades em produção ou destinos não homologados.`
                            );
                            err.code = 'PROD_MUTATION_GUARD_BLOCKED';
                            err.authOperation = method;
                            err.targetHost = safety.hostname;
                            throw err;
                        }
                        return origMethod.apply(this, args);
                    };
                }
            }
        }
    } catch (err) {
        throw new Error(`[TEST_ENVIRONMENT_GUARD_FATAL] Falha crítica ao instalar interceptação no driver @supabase/supabase-js: ${err.message}`);
    }

    // 4. Interceptação no globalThis.fetch para chamadas HTTP diretas
    if (typeof globalThis.fetch === 'function') {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = function guardedFetch(input, init) {
            const urlString = typeof input === 'string' ? input : input?.url || '';
            const method = (init?.method || (typeof input === 'object' ? input.method : 'GET') || 'GET').toUpperCase();

            if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
                const hostname = extractExactHostname(urlString);
                if (hostname) {
                    const safety = evaluateDestinationSafety(urlString);
                    if (!safety.safe) {
                        const err = new Error(
                            `[PROD_MUTATION_GUARD_BLOCKED] Chamada HTTP direta '${method}' interceptada e bloqueada contra o destino '${urlString}'.\n` +
                            `Motivo: ${safety.message}\n` +
                            `Testes automatizados estão estritamente proibidos de enviar requisições mutantes HTTP para produção ou destinos não homologados.`
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
    BLOCKED_PROD_PROJECT_ID,
    BLOCKED_PROD_HOSTNAME,
    APPROVED_STAGING_PROJECT_ID,
    APPROVED_STAGING_HOSTNAME,
    APPROVED_LOCAL_HOSTS,
    KNOWN_MUTATING_RPCS,
    BLOCKED_AUTH_ADMIN_METHODS,
    extractExactHostname,
    extractJwtProjectRef,
    evaluateDestinationSafety,
    assertSafeTestDestination,
    wrapClientWithMutationGuard,
    installGlobalDriverInterception
};
