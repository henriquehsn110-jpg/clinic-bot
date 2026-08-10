/**
 * TESTE AO VIVO DE HIGIENIZAÇÃO LGPD NO SENTRY
 * Valida que pacientes chamados Ana ou Camila têm seus nomes devidamente redigidos!
 */
const Sentry = require('../instrument');

async function testSentryLivePatientAnaCamilaRedaction() {
    console.log('================================================================');
    console.log('🛡️ TESTE DE REDAÇÃO INCONDICIONAL DE PACIENTES (ANA E CAMILA)');
    console.log('================================================================\n');

    const client = Sentry.getClient();
    const beforeSend = client ? client.getOptions().beforeSend : null;

    // TESTE 1 SOLICITADO PELO CLAUDE: "Paciente Ana não encontrada"
    const msg1 = "Paciente Ana não encontrada no banco de dados da clínica";
    const res1 = beforeSend({ message: msg1 });
    console.log(`🔹 [Caso 1 — Paciente Ana]`);
    console.log(`   Entrada: "${msg1}"`);
    console.log(`   Saída:   "${res1.message}"`);
    console.log(`   Status:  ${res1.message.includes('Ana') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([NAME_REDACTED])'}\n`);

    // TESTE 2 SOLICITADO PELO CLAUDE: "Paciente Camila confirmou presença"
    const msg2 = "Paciente Camila confirmou presença na consulta de amanhã";
    const res2 = beforeSend({ message: msg2 });
    console.log(`🔹 [Caso 2 — Paciente Camila]`);
    console.log(`   Entrada: "${msg2}"`);
    console.log(`   Saída:   "${res2.message}"`);
    console.log(`   Status:  ${res2.message.includes('Camila') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([NAME_REDACTED])'}\n`);
}

testSentryLivePatientAnaCamilaRedaction().then(() => process.exit(0)).catch(err => {
    console.error('❌ Erro no teste do Sentry:', err);
    process.exit(1);
});
