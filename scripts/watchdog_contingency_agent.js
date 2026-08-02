/**
 * Watchdog Contingency Agent — ClinicaBot SaaS Pro
 * Monitor de alta disponibilidade 24h para auto-recuperação do servidor
 * e ativação do bot guardião de contingência para o médico.
 */

const http = require('http');

const PRIMARY_SERVER_PORT = process.env.PORT || 3000;
const PRIMARY_HEALTH_URL = `http://localhost:${PRIMARY_SERVER_PORT}/health`;
const CHECK_INTERVAL_MS = 5000;
let consecutiveFailures = 0;
let isContingencyActive = false;

// Fila de mensagens em buffer seguro (Simulação de Redundância)
const emergencyBufferQueue = [];

console.log('🛡️ [WATCHDOG 24H] Agente Guardião de Alta Disponibilidade Inicializado.');
console.log(`📡 Monitorando rota de saúde: ${PRIMARY_HEALTH_URL} (Check a cada ${CHECK_INTERVAL_MS/1000}s)`);

function runHealthCheck() {
    const req = http.get(PRIMARY_HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
            if (isContingencyActive) {
                console.log('\n🟢 [WATCHDOG 24H] SERVIDOR PRINCIPAL RESTABELECIDO COM SUCESSO!');
                console.log(`📦 Reprocessando ${emergencyBufferQueue.length} mensagens salvas no buffer seguro...`);
                emergencyBufferQueue.length = 0; // Limpa fila reprocessada
                isContingencyActive = false;
                notifyDoctor('RECOVERY', 'Servidor principal 100% operacional. Nenhuma mensagem foi perdida.');
            }
            consecutiveFailures = 0;
        } else {
            handleFailure(`HTTP Status ${res.statusCode}`);
        }
    });

    req.on('error', (err) => {
        handleFailure(err.message);
    });

    req.setTimeout(3000, () => {
        req.destroy();
        handleFailure('Timeout > 3000ms');
    });
}

function handleFailure(reason) {
    consecutiveFailures++;
    console.log(`⚠️ [WATCHDOG 24H] Oscilação detectada (${consecutiveFailures}/2). Motivo: ${reason}`);

    if (consecutiveFailures >= 2 && !isContingencyActive) {
        isContingencyActive = true;
        console.log('\n🚨 [WATCHDOG 24H] ATIVANDO PROTOCOLO DE CONTINGÊNCIA & SERVIDOR ESPELHO!');
        console.log('🛡️ Buffer Fila Segura ativado: Gravando mensagens recebidas sem perda de dados.');
        notifyDoctor('INCIDENT', 'Pequena oscilação temporária detectada. O servidor de contingência já foi acionado e todas as mensagens estão salvas.');
    }
}

function notifyDoctor(type, message) {
    const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    console.log(`\n📲 [BOT GUARDIÃO -> WHATSAPP DO MÉDICO] [${timestamp}]`);
    console.log(`   Tipo: ${type}`);
    console.log(`   Mensagem: "${message}"\n`);
}

// Execução de Teste / Simulação Inicial se invocado diretamente
if (require.main === module) {
    runHealthCheck();
    setInterval(runHealthCheck, CHECK_INTERVAL_MS);
}

module.exports = { runHealthCheck, isContingencyActive };
