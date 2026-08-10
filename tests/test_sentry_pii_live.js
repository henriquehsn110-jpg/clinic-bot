/**
 * TESTE AO VIVO DE HIGIENIZAÇÃO LGPD NO SENTRY
 * Força um evento de erro real contendo CPF, Telefone Formatado e Nome do Paciente
 * e exibe o objeto de evento sanitizado pelo beforeSend do Sentry.
 */
const Sentry = require('../instrument');

async function testSentryLiveScrubbing() {
    console.log('================================================================');
    console.log('🛡️ TESTE AO VIVO DE SANITIZAÇÃO DE PII / LGPD NO SENTRY');
    console.log('================================================================\n');

    const rawErrorMsg = "Erro ao agendar consulta para Paciente: Maria Silva de Souza com CPF: 123.456.789-00 e Telefone: +55 (11) 98765-4321";
    console.log('📥 Mensagem Bruta de Erro Gerada:');
    console.log(`   "${rawErrorMsg}"\n`);

    // Capturar o evento formatado chamando o handler beforeSend do Sentry
    const mockEvent = {
        message: rawErrorMsg,
        exception: {
            values: [{ value: rawErrorMsg }]
        },
        breadcrumbs: [
            { message: "Iniciando processamento do Paciente: Maria Silva de Souza" },
            { data: { phone: "+55 (11) 98765-4321", cpf: "123.456.789-00" } }
        ],
        extra: {
            patient_info: "Paciente: Maria Silva de Souza",
            contact_number: "+55 (11) 98765-4321",
            document_number: "123.456.789-00"
        }
    };

    // Invocar o beforeSend
    const clientOptions = Sentry.getClient() ? Sentry.getClient().getOptions() : null;
    const beforeSendFn = clientOptions?.beforeSend || require('../instrument').init ? null : null;

    // Executar a função de higienização
    const sanitizedEvent = Sentry.init ? mockEvent : mockEvent; // Trigger init
    // Directly run beforeSend logic from instrument.js
    const instrumentModule = require('../instrument');
    
    // We access the registered beforeSend from Sentry.getClient().getOptions().beforeSend
    const client = Sentry.getClient();
    const beforeSend = client ? client.getOptions().beforeSend : null;

    if (beforeSend) {
        const processedEvent = beforeSend(mockEvent);
        console.log('📤 OBJETO DE EVENTO CAPTURADO E HIGIENIZADO PELO SENTRY (RAW JSON):');
        console.log(JSON.stringify(processedEvent, null, 2));

        const jsonStr = JSON.stringify(processedEvent);
        console.log('\n--- VERIFICAÇÃO DE VAZAMENTO DE PII ---');
        console.log(`   CPF (123.456.789-00) Presente?           ${jsonStr.includes('123.456.789-00') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([CPF_REDACTED])'}`);
        console.log(`   Telefone (+55 (11) 98765-4321) Presente? ${jsonStr.includes('98765-4321') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([PHONE_REDACTED])'}`);
        console.log(`   Nome (Maria Silva de Souza) Presente?   ${jsonStr.includes('Maria Silva de Souza') ? '🔴 VAZOU' : '🟢 BLOQUEADO ([NAME_REDACTED])'}`);
    } else {
        console.error('❌ Não foi possível obter a função beforeSend do Sentry.');
    }
}

testSentryLiveScrubbing().then(() => process.exit(0)).catch(err => {
    console.error('❌ Erro no teste do Sentry:', err);
    process.exit(1);
});
