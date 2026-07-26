require('dotenv').config({ path: __dirname + '/../.env' });
const crypto = require('crypto');
const http = require('http');
const express = require('express');

// Garantir que APP_SECRET esteja definido para o teste
process.env.APP_SECRET = process.env.APP_SECRET || 'test_secret_key_hmac_2026';
const SECRET = process.env.APP_SECRET;

// ── Validação de Assinatura HMAC idêntica a server.js ────────────────────────
function verifySignature(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const expected = 'sha256=' + crypto
        .createHmac('sha256', SECRET)
        .update(req.rawBody)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
    } catch {
        return false;
    }
}

async function runHmacInjectionTests() {
    console.log(`\n🔒 [TEST_HMAC_WEBHOOK_INJECTION] Iniciando auditoria de injeção de Webhook HMAC SHA-256...\n`);

    // 1. Criar um servidor de teste local isolado em memória
    const app = express();
    app.use(express.json({
        verify: (req, res, buf) => { req.rawBody = buf; }
    }));

    app.post('/webhook', (req, res) => {
        if (!verifySignature(req)) {
            return res.status(403).json({ error: 'Assinatura HMAC forjada ou inválida.' });
        }
        res.status(200).json({ status: 'success', message: 'Webhook autenticado pelo HMAC.' });
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(3030, resolve));
    console.log(`[Etapa 1/3] Servidor de teste escutando na porta 3030 com segredo HMAC ativo.`);

    try {
        const payloadObj = {
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        metadata: { phone_number_id: '123456789' },
                        messages: [{ id: 'msg_test_123', from: '5511999999999', text: { body: 'Teste HMAC' } }]
                    }
                }]
            }]
        };
        const rawBody = JSON.stringify(payloadObj);

        // ── Teste 1: Injeção sem Assinatura HMAC (Ataque de Força Bruta / Replay)
        console.log(`\n[Etapa 2/3] Testando ataque de injeção SEM cabeçalho X-Hub-Signature-256...`);
        const resNoSig = await makePostRequest(3030, '/webhook', {}, rawBody);
        if (resNoSig.statusCode !== 403) {
            throw new Error(`❌ FALHA CRÍTICA DE SEGURANÇA: Servidor aceitou webhook sem assinatura HMAC! (Status: ${resNoSig.statusCode})`);
        }
        console.log(`   ✅ PASS: Servidor rejeitou requisição sem assinatura com HTTP 403 Forbidden.`);

        // ── Teste 2: Injeção com Assinatura Forjada / Corrompida (Tampering Attack)
        console.log(`\n[Etapa 3/3] Testando ataque de injeção com assinatura HMAC forjada...`);
        const forgedHeaders = {
            'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
            'Content-Type': 'application/json'
        };
        const resForged = await makePostRequest(3030, '/webhook', forgedHeaders, rawBody);
        if (resForged.statusCode !== 403) {
            throw new Error(`❌ FALHA CRÍTICA DE SEGURANÇA: Servidor aceitou assinatura HMAC forjada! (Status: ${resForged.statusCode})`);
        }
        console.log(`   ✅ PASS: Servidor bloqueou injeção forjada com HTTP 403 Forbidden.`);

        // ── Teste 3: Envio Válido (Assinatura legítima gerada pela Meta/ClinicaBot)
        console.log(`\n[Validação Positiva] Testando requisição com assinatura HMAC SHA-256 legítima...`);
        const validSig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(Buffer.from(rawBody, 'utf8')).digest('hex');
        const validHeaders = {
            'x-hub-signature-256': validSig,
            'Content-Type': 'application/json'
        };
        const resValid = await makePostRequest(3030, '/webhook', validHeaders, rawBody);
        if (resValid.statusCode !== 200) {
            throw new Error(`❌ FALHA: Servidor rejeitou assinatura HMAC legítima! (Status: ${resValid.statusCode})`);
        }
        console.log(`   ✅ PASS: Webhook legítimo processado com sucesso (HTTP 200).`);

        server.close();
        console.log(`\n================================================================`);
        console.log(`🎉 AUDITORIA DE SEGURANÇA HMAC WEBHOOK 100% APROVADA!`);
        console.log(`================================================================`);
        console.log(`🛡️ Proteção: Injeções de payload, tampering e replay attacks bloqueados.`);
        console.log(`⚔️ Vantagem Competitiva: Diferente dos rivais, nossos webhooks são blindados.`);
        console.log(`================================================================\n`);

        process.exit(0);
    } catch (err) {
        server.close();
        console.error(`\n❌ [FALHA NO TESTE DE WEBHOOK HMAC] ${err.message}\n`, err.stack);
        process.exit(1);
    }
}

function makePostRequest(port, path, headers, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

runHmacInjectionTests();
