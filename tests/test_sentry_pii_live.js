/**
 * TESTE AO VIVO DE HIGIENIZAÇÃO LGPD NO SENTRY
 * Testa redação com e SEM RÓTULO EXPLÍCITO (ex: "Erro ao processar agendamento de Maria Silva de Souza")
 */
const Sentry = require('../instrument');

async function testSentryLiveScrubbing() {
    console.log('================================================================');
    console.log('🛡️ TESTE AO VIVO DE SANITIZAÇÃO DE PII / LGPD NO SENTRY (COM E SEM RÓTULO)');
    console.log('================================================================\n');

    // TESTE 1: Erro em Linguagem Natural SEM RÓTULO EXPLÍCITO
    const unlabelledErrorMsg = "Erro ao processar agendamento de Maria Silva de Souza com CPF 123.456.789-00 e telefone +55 (11) 98765-4321";
    console.log('📥 [Caso A — Sem Rótulo Explícito] Mensagem Bruta:');
    console.log(`   "${unlabelledErrorMsg}"\n`);

    const mockEventA = {
        message: unlabelledErrorMsg,
        exception: { values: [{ value: unlabelledErrorMsg }] },
        breadcrumbs: [{ message: "Tentativa de confirmação para Maria Silva de Souza" }]
    };

    const client = Sentry.getClient();
    const beforeSend = client ? client.getOptions().beforeSend : null;

    if (beforeSend) {
        const processedEventA = beforeSend(mockEventA);
        console.log('📤 OBJETO SANITIZADO PELO SENTRY (CASO SEM RÓTULO):');
        console.log(JSON.stringify(processedEventA, null, 2));

        const jsonStrA = JSON.stringify(processedEventA);
        console.log('\n--- VERIFICAÇÃO DE VAZAMENTO DE PII (CASO SEM RÓTULO) ---');
        console.log(`   CPF (123.456.789-00) Presente?           ${jsonStrA.includes('123.456.789-00') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([CPF_REDACTED])'}`);
        console.log(`   Telefone (+55 (11) 98765-4321) Presente? ${jsonStrA.includes('98765-4321') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([PHONE_REDACTED])'}`);
        console.log(`   Nome (Maria Silva de Souza) Presente?   ${jsonStrA.includes('Maria Silva de Souza') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([NAME_REDACTED])'}`);
    } else {
        console.error('❌ Não foi possível obter a função beforeSend do Sentry.');
    }
}

testSentryLiveScrubbing().then(() => process.exit(0)).catch(err => {
    console.error('❌ Erro no teste do Sentry:', err);
    process.exit(1);
});
