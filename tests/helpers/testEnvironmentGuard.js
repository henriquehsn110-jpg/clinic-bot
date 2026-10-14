/**
 * tests/helpers/testEnvironmentGuard.js
 * 
 * Módulo de Proteção de Ambiente de Testes — ClinicaBot SaaS Pro
 * 
 * Regra Inviolável: Nenhum teste automatizado ou script em contexto de QA pode
 * executar mutações (insert, update, delete, upsert, RPC mutável) contra o
 * Supabase de Produção, contra destinos desconhecidos ou com configurações ausentes.
 * 
 * Não possui flags de bypass fáceis (anti-bypass).
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
            message: `Destino corresponde ao Supabase de Produção (${host}). Mutações em contexto de testes são estritamente bloqueadas.`
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
 * Assegura que o destino é seguro para testes. Lança erro fatal caso contrário.
 */
function assertSafeTestDestination(url) {
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
 * Cria um Proxy defensivo sobre o cliente Supabase para interceptar qualquer mutação
 */
function wrapClientWithMutationGuard(client, url) {
    if (!client) return client;

    const safety = evaluateDestinationSafety(url);

    // Se o destino for um ambiente seguro e aprovado para testes, retorna o cliente com guarda passiva
    if (safety.safe) {
        return client;
    }

    // Se o destino for Produção, Desconhecido ou Ausente: instala o bloqueador ativo
    return new Proxy(client, {
        get(target, prop, receiver) {
            // Intercepta chamadas de tabela: supabase.from('table')
            if (prop === 'from') {
                return function guardedFrom(table) {
                    const originalBuilder = target.from(table);

                    return new Proxy(originalBuilder, {
                        get(bTarget, bProp, bReceiver) {
                            // Métodos de mutação estritamente bloqueados
                            if (['insert', 'update', 'delete', 'upsert'].includes(bProp)) {
                                return function blockedMutation(...args) {
                                    const err = new Error(
                                        `[PRODUCTION_MUTATION_GUARD] Operação '${bProp.toUpperCase()}' na tabela '${table}' foi bloqueada em contexto de testes!\n` +
                                        `Motivo: ${safety.message}\n` +
                                        `Para executar testes mutáveis, aponte para Staging via DOTENV_CONFIG_PATH=.env.staging.`
                                    );
                                    err.code = 'PRODUCTION_MUTATION_BLOCKED';
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
                };
            }

            // Intercepta chamadas de RPC: supabase.rpc('fn_name', args)
            if (prop === 'rpc') {
                return function guardedRpc(fnName, args) {
                    const isMutating = KNOWN_MUTATING_RPCS.includes(fnName) || !fnName.startsWith('get_') && !fnName.startsWith('check_');
                    if (isMutating) {
                        const err = new Error(
                            `[PRODUCTION_MUTATION_GUARD] Chamada à RPC mutável '${fnName}' foi bloqueada em contexto de testes!\n` +
                            `Motivo: ${safety.message}\n` +
                            `Para executar testes mutáveis, aponte para Staging via DOTENV_CONFIG_PATH=.env.staging.`
                        );
                        err.code = 'PRODUCTION_MUTATION_BLOCKED';
                        err.rpc = fnName;
                        err.targetHost = safety.host;
                        throw err;
                    }
                    return target.rpc(fnName, args);
                };
            }

            const val = Reflect.get(target, prop, receiver);
            if (typeof val === 'function') {
                return val.bind(target);
            }
            return val;
        }
    });
}

module.exports = {
    KNOWN_PRODUCTION_HOSTS,
    APPROVED_TEST_HOSTS,
    KNOWN_MUTATING_RPCS,
    extractProjectHost,
    evaluateDestinationSafety,
    assertSafeTestDestination,
    wrapClientWithMutationGuard
};
