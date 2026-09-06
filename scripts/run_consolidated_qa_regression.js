/**
 * SUÍTE CONSOLIDADA DE REGRESSÃO (5 LEGADAS + 4 NOVAS) — CLINICABOT SAAS PRO
 * Executa as suítes fundamentais contra clinicabot-staging.
 */
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const envPath = process.env.DOTENV_CONFIG_PATH || path.join(rootDir, '.env.staging');

const testSuites = [
    // 5 Legadas Críticas
    { name: '1. Isolamento Multi-Tenant & RLS Supabase', script: 'tests/test_tenant_rls_isolation.js' },
    { name: '2. Segurança & Validação Webhook HMAC SHA-256', script: 'tests/test_hmac_webhook_injection.js' },
    { name: '3. Gate FSM draft.type NULL (Prevenção Avanço/Silêncio)', script: 'tests/test_draft_type_null_gate.js' },
    { name: '4. Regras Multi-Nível de Lembretes D-1 e H-2', script: 'tests/test_reminder_rules_d1_h2.js' },
    { name: '5. Recusa Familiar & Validação de CPF (Bugs Produção)', script: 'tests/test_family_booking_refusal_and_cpf_validation.js' },
    
    // 4 Novas do Relatório de QA Manual (31/08/2026)
    { name: '6. Fase 1: Integridade de Draft (Data Alterada + Dependente)', script: 'tests/test_draft_integrity_family_reschedule.js' },
    { name: '7. Fase 1: Guardas de Confirmação & Invalidação de Token', script: 'tests/test_confirmation_state_guards.js' },
    { name: '8. Fase 2: Validação de CPF, UI e Segurança LGPD', script: 'tests/test_cpf_collection_ui_and_validation.js' },
    { name: '9. Fase 3: Intenção Natural & Desambiguação de Múltiplos Procedimentos', script: 'tests/test_natural_intent_disambiguation.js' },

    // 1 Nova: Correções de Bugs dos Logs Reais de Conversas (02/09/2026)
    { name: '10. Correções de Causa Raiz dos Logs Reais (Gemini SDK, Substring Match, CPF Móvel & Passo 4)', script: 'tests/test_conversation_log_bugfixes.js' }
];

console.log('================================================================');
console.log('🧪 EXECUTANDO SUÍTE CONSOLIDADA DE REGRESSÃO (10 SUÍTES EM STAGING)');
console.log(`📁 Ambiente: ${envPath}`);
console.log('================================================================\n');

let passedCount = 0;
let failedCount = 0;
const results = [];

for (let i = 0; i < testSuites.length; i++) {
    const suite = testSuites[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`▶ [${i + 1}/${testSuites.length}] ${suite.name}`);
    console.log(`----------------------------------------------------------------`);

    try {
        const output = execSync(`node -r dotenv/config ${suite.script}`, {
            cwd: rootDir,
            encoding: 'utf8',
            env: {
                ...process.env,
                DOTENV_CONFIG_PATH: envPath
            }
        });
        console.log(output);
        console.log(`✅ PASS: ${suite.name}`);
        passedCount++;
        results.push({ name: suite.name, status: 'PASS' });
    } catch (err) {
        const errOutput = err.stdout || err.stderr || err.message;
        console.error(errOutput);
        console.error(`❌ FAIL: ${suite.name}`);
        failedCount++;
        results.push({ name: suite.name, status: 'FAIL', error: err.message });
    }
}

console.log('\n================================================================');
console.log('📊 RESUMO CONSOLIDADO DA REGRESSÃO');
console.log('================================================================');
console.log(`Total de Suítes: ${testSuites.length}`);
console.log(`Suítes Aprovadas: ${passedCount}`);
console.log(`Suítes Reprovadas: ${failedCount}`);
console.log('Detalhamento:');
results.forEach(r => {
    console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.name}`);
});
console.log('================================================================\n');

if (failedCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
