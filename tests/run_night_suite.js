/**
 * SUÍTE NOTURNA AUTOMATIZADA — CLINICABOT SAAS PRO
 * Executa todos os testes de regressão, FSM, isolamento RLS e segurança HMAC.
 * Registra logs com fuso BRT em logs/night_run_YYYY-MM-DD_HH-mm.log
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getFormattedBRTDate() {
    const now = new Date();
    const brtString = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const brtDate = new Date(brtString);

    const year = brtDate.getFullYear();
    const month = String(brtDate.getMonth() + 1).padStart(2, '0');
    const day = String(brtDate.getDate()).padStart(2, '0');
    const hours = String(brtDate.getHours()).padStart(2, '0');
    const minutes = String(brtDate.getMinutes()).padStart(2, '0');

    return {
        formattedDate: `${year}-${month}-${day} ${hours}:${minutes}`,
        fileTimestamp: `${year}-${month}-${day}_${hours}-${minutes}`
    };
}

async function runNightlySuite() {
    const { formattedDate, fileTimestamp } = getFormattedBRTDate();
    const rootDir = path.resolve(__dirname, '..');
    const logsDir = path.join(rootDir, 'logs');

    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFilePath = path.join(logsDir, `night_run_${fileTimestamp}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    function log(message) {
        console.log(message);
        logStream.write(message + '\n');
    }

    log('================================================================');
    log(`🌙 INICIANDO SUÍTE NOTURNA DE TESTES — ${formattedDate} (BRT)`);
    log(`📁 Arquivo de Log: ${logFilePath}`);
    log('================================================================\n');

    const testSuites = [
        { name: 'Pergunta de Preço (Bug 1)', script: 'tests/test_price_question_no_calendar.js' },
        { name: 'Agendamento Familiar / Dependente (Bug 2)', script: 'tests/test_family_booking_name_collection.js' },
        { name: 'Recusa Familiar & Validação de CPF (Bugs Produção)', script: 'tests/test_family_booking_refusal_and_cpf_validation.js' },
        { name: 'Cobertura de Reset de is_family_booking em Pontos de Saída', script: 'tests/test_family_booking_exit_resets.js' },
        { name: 'Gate FSM draft.type NULL (Prevenção Avanço/Silêncio)', script: 'tests/test_draft_type_null_gate.js' },
        { name: 'Interpretação de Texto Livre vs Procedimentos (Prompt 2)', script: 'tests/test_free_text_procedure_match.js' },
        { name: 'Matriz Determinística & Fuzzing Multi-Personas', script: 'tests/run_conversation_matrix_fuzzing.js' },
        { name: 'Cifragem AES-256-GCM em sessions.draft (LGPD Privacy by Design)', script: 'tests/test_sessions_draft_encryption.js' },
        { name: 'Prevenção de Race Condition & Double-Booking (FSM Concurrency)', script: 'tests/test_scheduling_concurrency_race_condition.js' },
        { name: 'Persistência Relacional de Dependentes (FAMILY_BOOKING)', script: 'tests/test_family_booking_persistence_relational.js' },
        { name: 'Extração e Atualização de Nome do Titular ("É para mim mesmo, [Nome]")', script: 'tests/test_personal_booking_name_extraction.js' },
        { name: 'Fix de Looping de Seleção de Procedimentos (Casing & Ambiguidade)', script: 'tests/test_procedure_selection_loop_fix.js' },
        { name: 'Conflito de Slot Médico Nulo vs Específico & Idempotência de Dependentes', script: 'tests/test_family_booking_slot_conflict_and_idempotency.js' },
        { name: 'Isolamento Multi-Tenant & RLS Supabase', script: 'tests/test_tenant_rls_isolation.js' },
        { name: 'Segurança & Validação Webhook HMAC SHA-256', script: 'tests/test_hmac_webhook_injection.js' }
    ];

    let passedCount = 0;
    let failedCount = 0;
    const failedSuites = [];

    const envPath = process.env.DOTENV_CONFIG_PATH || '.env.staging';

    for (let i = 0; i < testSuites.length; i++) {
        const suite = testSuites[i];
        log(`\n[${i + 1}/${testSuites.length}] Executando: ${suite.name} (${suite.script})...`);
        log('----------------------------------------------------------------');

        try {
            const output = execSync(`node -r dotenv/config ${suite.script}`, {
                cwd: rootDir,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    DOTENV_CONFIG_PATH: envPath
                }
            });
            log(output);
            log(`  ✅ PASS: ${suite.name}`);
            passedCount++;
        } catch (err) {
            const errOutput = err.stdout || err.stderr || err.message;
            log(errOutput);
            log(`  ❌ FAIL: ${suite.name}`);
            failedCount++;
            failedSuites.push({ name: suite.name, error: err.message });
        }
    }

    log('\n================================================================');
    log('🌙 NIGHTLY RUN SUMMARY');
    log('================================================================');
    log(`Date: ${formattedDate} (BRT)`);
    log(`Log File: ${logFilePath}`);
    log(`Total Suites: ${testSuites.length}`);
    log(`Pass: ${passedCount}`);
    log(`Fail: ${failedCount}`);
    log(`Status: ${failedCount === 0 ? '✅ ALL GREEN' : '❌ FAILURES DETECTED'}`);
    log('================================================================\n');

    logStream.end();

    if (failedCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runNightlySuite();
