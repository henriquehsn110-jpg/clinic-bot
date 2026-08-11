/**
 * SCRIPT DE SIMULAÇÃO DE FALHA SUSTENTADA PARA DISPARO DE ALERTA DO UPTIMEROBOT
 * Executa requisições repetidas a cada 60s para https://clinic-bot-zksc.onrender.com/health?sim_error=1
 * durante 20 minutos (20 requisições), garantindo que 2+ ciclos de checagem do UptimeRobot
 * (que ocorrem a cada 5 min) detectem HTTP 500 consecutivo na nuvem e disparem o e-mail de alerta.
 */
require('dotenv').config();
const https = require('https');

const TARGET_URL = 'https://clinic-bot-zksc.onrender.com/health?sim_error=1';
const TOTAL_MINUTES = 20;
let count = 0;

function sendSimulatedErrorRequest() {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const req = https.get(TARGET_URL, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const latency = Date.now() - startTime;
                const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
                console.log(`[${timestamp}] Minuto ${count + 1}/${TOTAL_MINUTES} — HTTP ${res.statusCode} (${latency}ms) | Response: ${body}`);
                resolve(res.statusCode);
            });
        });

        req.on('error', err => {
            const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            console.error(`[${timestamp}] Minuto ${count + 1}/${TOTAL_MINUTES} — erro HTTPS:`, err.message);
            resolve(500);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve(508);
        });
    });
}

async function startSustainedFailureLoop() {
    console.log(`================================================================`);
    console.log(`🔥 [SUSTAINED_FAILURE_SIMULATION] Iniciando Simulação Sustentada de Falha`);
    console.log(`🎯 Alvo: ${TARGET_URL}`);
    console.log(`⏱️ Duração: ${TOTAL_MINUTES} minutos (1 request a cada 60s)`);
    console.log(`================================================================\n`);

    const interval = setInterval(async () => {
        count++;
        await sendSimulatedErrorRequest();
        if (count >= TOTAL_MINUTES) {
            clearInterval(interval);
            console.log(`\n================================================================`);
            console.log(`🛑 Simulação Sustentada de Falha Concluída após ${TOTAL_MINUTES} minutos.`);
            console.log(`================================================================`);
            process.exit(0);
        }
    }, 60000);

    // Primeira execução imediata
    await sendSimulatedErrorRequest();
}

startSustainedFailureLoop();
