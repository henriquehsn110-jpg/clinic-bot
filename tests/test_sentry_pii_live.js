/**
 * TESTE AO VIVO DE HIGIENIZAÇÃO LGPD NO SENTRY
 * Testa preservação de persona ("Ana") vs redação de paciente ("Paulo")
 */
const Sentry = require('../instrument');

async function testSentryLivePersonaExceptions() {
    console.log('================================================================');
    console.log('🛡️ TESTE DE PRESERVAÇÃO DA PERSONA ANA vs REDAÇÃO DE PACIENTE');
    console.log('================================================================\n');

    const client = Sentry.getClient();
    const beforeSend = client ? client.getOptions().beforeSend : null;

    // CASO 1: Paciente Paulo (DEVE SER REDIGIDO)
    const msg1 = "Paciente Paulo não encontrado no banco";
    const res1 = beforeSend({ message: msg1 });
    console.log(`🔹 Entrada: "${msg1}"`);
    console.log(`   Saída:   "${res1.message}"`);
    console.log(`   Status:  ${res1.message.includes('Paulo') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([NAME_REDACTED])'}\n`);

    // CASO 2: Persona Ana (NÃO DEVE SER REDIGIDA - PRESERVA DEBUG)
    const msg2 = "erro para Ana ao confirmar consulta de Limpeza Dental";
    const res2 = beforeSend({ message: msg2 });
    console.log(`🔹 Entrada: "${msg2}"`);
    console.log(`   Saída:   "${res2.message}"`);
    console.log(`   Status:  ${res2.message.includes('Ana') ? '🟢 PRESERVADO (PERSONA CORRETA)' : '🔴 REDIGIDO ENGANOSAMENTE'}\n`);
}

testSentryLivePersonaExceptions().then(() => process.exit(0)).catch(err => {
    console.error('❌ Erro no teste do Sentry:', err);
    process.exit(1);
});
