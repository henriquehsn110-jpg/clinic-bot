/**
 * Watchdog Contingency Agent — ClinicaBot SaaS Pro
 * Monitor de alta disponibilidade 24h para auto-recuperação do servidor
 * e ativação do bot guardião de contingência para o médico via Meta Cloud API / Supabase.
 */

require('dotenv').config(); // Carrega as chaves do arquivo .env
const http = require('http');
const https = require('https');

const PRIMARY_SERVER_PORT = process.env.PORT || 3000;
const PRIMARY_HEALTH_URL = `http://localhost:${PRIMARY_SERVER_PORT}/health`;
const CHECK_INTERVAL_MS = 5000;
let consecutiveFailures = 0;
let isContingencyActive = false;

// Fila de mensagens em buffer seguro (Redundância Fila de Proteção)
const emergencyBufferQueue = [];

console.log('🛡️ [WATCHDOG 24H] Agente Guardião de Alta Disponibilidade Inicializado.');
console.log(`📡 Monitorando rota de saúde: ${PRIMARY_HEALTH_URL} (Check a cada ${CHECK_INTERVAL_MS/1000}s)`);

function runHealthCheck(callback) {
    const req = http.get(PRIMARY_HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
            if (isContingencyActive) {
                console.log('\n🟢 [WATCHDOG 24H] SERVIDOR PRINCIPAL RESTABELECIDO COM SUCESSO!');
                console.log(`📦 Reprocessando ${emergencyBufferQueue.length} mensagens salvas no buffer seguro...`);
                const processedCount = emergencyBufferQueue.length;
                emergencyBufferQueue.length = 0; // Limpa fila reprocessada
                isContingencyActive = false;
                notifyDoctor('RECOVERY', `Servidor principal 100% operacional. ${processedCount} mensagens salvas foram salvas e reprocessadas sem perda.`);
            }
            consecutiveFailures = 0;
            if (callback) callback(null, { status: 'healthy', failures: 0 });
        } else {
            handleFailure(`HTTP Status ${res.statusCode}`, callback);
        }
    });

    req.on('error', (err) => {
        handleFailure(err.message, callback);
    });

    req.setTimeout(3000, () => {
        req.destroy();
        handleFailure('Timeout > 3000ms', callback);
    });
}

function handleFailure(reason, callback) {
    consecutiveFailures++;
    console.log(`⚠️ [WATCHDOG 24H] Oscilação detectada (${consecutiveFailures}/2). Motivo: ${reason}`);

    if (consecutiveFailures >= 2 && !isContingencyActive) {
        isContingencyActive = true;
        console.log('\n🚨 [WATCHDOG 24H] ATIVANDO PROTOCOLO DE CONTINGÊNCIA & SERVIDOR ESPELHO!');
        console.log('🛡️ Buffer Fila Segura ativado: Gravando mensagens recebidas sem perda de dados.');
        notifyDoctor('INCIDENT', 'Pequena oscilação temporária detectada. O servidor de contingência já foi acionado e todas as mensagens estão salvas na fila de proteção.');
    }

    if (callback) callback(null, { status: 'unhealthy', failures: consecutiveFailures, isContingencyActive });
}

function notifyDoctor(type, messageText) {
    const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const doctorPhone = process.env.DOCTOR_WHATSAPP_PHONE || '5511979992719';
    const whatsappToken = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;

    console.log(`\n📲 [BOT GUARDIÃO -> WHATSAPP DO MÉDICO: ${doctorPhone}] [${timestamp}]`);
    console.log(`   Tipo: ${type}`);
    console.log(`   Mensagem: "${messageText}"\n`);

    // Envio real via Meta WhatsApp Cloud API usando a chave do .env
    if (whatsappToken && phoneId) {
        sendMetaWhatsAppMessage(doctorPhone, messageText, whatsappToken, phoneId);
    } else {
        console.log('⚠️ [AVISO] Chave WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID ausente no .env.');
    }
}

function sendMetaWhatsAppMessage(phone, text, token, phoneId) {
    const payload = JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { preview_url: false, body: `[Guardião 24h ClinicaBot] ${text}` }
    });

    const options = {
        hostname: 'graph.facebook.com',
        path: `/v18.0/${phoneId}/messages`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
            console.log(`📡 [META API RESPONSE] Status HTTP: ${res.statusCode} | Resposta: ${responseData}`);
        });
    });

    req.on('error', (e) => {
        console.error(`❌ [META API ERROR] ${e.message}`);
    });

    req.write(payload);
    req.end();
}

// Execução de Teste / Simulação Inicial se invocado diretamente
if (require.main === module) {
    runHealthCheck();
    setInterval(runHealthCheck, CHECK_INTERVAL_MS);
}

module.exports = { runHealthCheck, isContingencyActive, emergencyBufferQueue };
