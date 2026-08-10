/**
 * TESTE AO VIVO DE HIGIENIZAÇÃO LGPD NO SENTRY
 * Testa redação com NOMES ISOLADOS/ÚNICOS ("Paciente Paulo não encontrado" e "erro para Ana ao confirmar consulta")
 */
const Sentry = require('../instrument');

async function testSentryLiveSingleFirstName() {
    console.log('================================================================');
    console.log('🛡️ TESTE DE REDAÇÃO DE NOME ÚNICO/ISOLADO NO SENTRY (CLAUDE COBRANÇA)');
    console.log('================================================================\n');

    const client = Sentry.getClient();
    const beforeSend = client ? client.getOptions().beforeSend : null;

    // CASO 1 COBRADO PELO CLAUDE: "Paciente Paulo não encontrado"
    const msg1 = "Paciente Paulo não encontrado no banco de dados da clínica";
    const mockEvent1 = { message: msg1, exception: { values: [{ value: msg1 }] } };
    const res1 = beforeSend(mockEvent1);

    console.log('🔹 [Caso 1 — Nome Único após Rótulo "Paciente Paulo"]');
    console.log(`   Entrada:  "${msg1}"`);
    console.log(`   Saída:    "${res1.message}"`);
    console.log(`   Resultado:${res1.message.includes('Paulo') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([NAME_REDACTED])'}\n`);

    // CASO 2 COBRADO PELO CLAUDE: "erro para Ana ao confirmar consulta"
    const msg2 = "erro para Ana ao confirmar consulta agendada para hoje";
    const mockEvent2 = { message: msg2, exception: { values: [{ value: msg2 }] } };
    const res2 = beforeSend(mockEvent2);

    console.log('🔹 [Caso 2 — Nome Único após Preposição "para Ana"]');
    console.log(`   Entrada:  "${msg2}"`);
    console.log(`   Saída:    "${res2.message}"`);
    console.log(`   Resultado:${res2.message.includes('Ana') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([NAME_REDACTED])'}\n`);
}

testSentryLiveSingleFirstName().then(() => process.exit(0)).catch(err => {
    console.error('❌ Erro no teste do Sentry:', err);
    process.exit(1);
});
