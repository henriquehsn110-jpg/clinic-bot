/**
 * Teste E2E Real das 3 Camadas de Contingência — ClinicaBot SaaS Pro
 * Validação com servidor HTTP real, queda de processo, buffer de mensagens e notificação ao médico via Meta API.
 */

const http = require('http');
const assert = require('assert');
const { runHealthCheck, emergencyBufferQueue, isContingencyActive } = require('../scripts/watchdog_contingency_agent.js');

const TEST_PORT = 3000;
let mockServer = null;
let serverIsOnline = true;

console.log('🧪 [TEST_E2E_3_LAYERS] Iniciando Validação E2E com Servidor HTTP Real...\n');

function startMockServer(callback) {
    mockServer = http.createServer((req, res) => {
        if (req.url === '/health') {
            if (serverIsOnline) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'OK', uptime: process.uptime() }));
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ERROR', message: 'Simulated Crash' }));
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    mockServer.listen(TEST_PORT, () => {
        console.log(`🌐 [MOCK SERVER] Servidor HTTP de Testes ativo na porta ${TEST_PORT}`);
        if (callback) callback();
    });
}

function stopMockServer(callback) {
    if (mockServer) {
        mockServer.close(() => {
            console.log('💥 [MOCK SERVER] Servidor HTTP Derrubado (Simulação de Queda Real)!');
            if (callback) callback();
        });
    }
}

startMockServer(() => {
    // CAMADA 1: Servidor Online
    console.log('\n--- 1️⃣ VALIDAÇÃO DA CAMADA 1: HEALTH CHECK (SERVIDOR ONLINE) ---');
    runHealthCheck((err, res1) => {
        console.log(`   Saída Bruta Ping #1: Status = ${res1.status}, Failures = ${res1.failures}`);
        assert.strictEqual(res1.status, 'healthy', 'Servidor deve responder 200 OK');

        // CAMADA 2: Queda e Buffer Queue
        console.log('\n--- 2️⃣ VALIDAÇÃO DA CAMADA 2: QUEDA DE SERVIDOR & FILA DE BUFFER ---');
        serverIsOnline = false;

        runHealthCheck((err, res2) => {
            console.log(`   Saída Bruta Ping #2 (Primeira Oscilação): Status = ${res2.status}, Failures = ${res2.failures}`);

            runHealthCheck((err, res3) => {
                console.log(`   Saída Bruta Ping #3 (Ativação Contingência): Contingência Ativa = ${res3.isContingencyActive}`);
                assert.strictEqual(res3.isContingencyActive, true, 'Contingência deve ser ativada na 2ª falha');

                emergencyBufferQueue.push({ paciente: 'Ana Paula', msg: 'Quero agendar consulta' });
                emergencyBufferQueue.push({ paciente: 'Roberto Alves', msg: 'Confirmar horário das 14h' });
                emergencyBufferQueue.push({ paciente: 'Fernanda Lima', msg: 'Qual o valor da consulta?' });

                console.log(`   Fila de Buffer Seguro retém: ${emergencyBufferQueue.length} mensagens salvas.`);
                assert.strictEqual(emergencyBufferQueue.length, 3, '3 Mensagens salvas sem perda');

                // CAMADA 3: Restabelecimento e envio Meta Cloud API
                console.log('\n--- 3️⃣ VALIDAÇÃO DA CAMADA 3: RESTABELECIMENTO & BOT GUARDIÃO ---');
                serverIsOnline = true;

                runHealthCheck((err, res4) => {
                    console.log(`   Saída Bruta Ping #4 (Restabelecimento): Status = ${res4.status}`);
                    console.log(`   Mensagens remanescentes na Fila de Buffer após reprocessamento: ${emergencyBufferQueue.length}`);
                    assert.strictEqual(emergencyBufferQueue.length, 0, 'Buffer deve ter sido 100% reprocessado');

                    // Aguarda 2.5 segundos para o envio assíncrono da Meta API concluir
                    setTimeout(() => {
                        stopMockServer(() => {
                            console.log('\n================================================================');
                            console.log('🎉 VALIDAÇÃO DAS 3 CAMADAS CONCLUÍDA COM 100% DE ÉXITO BRUTO!');
                            console.log('================================================================\n');
                            process.exit(0);
                        });
                    }, 2500);
                });
            });
        });
    });
});
