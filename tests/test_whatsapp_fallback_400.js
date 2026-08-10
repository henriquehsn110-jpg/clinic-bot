/**
 * TESTE DE SIMULAÇÃO DE ERRO HTTP 400 META GRAPH API & FALLBACK PARA TEXTO
 * Moca chamadas do Axios para simular rejeição HTTP 400 de botões interativos
 * e valida se o fallback automático gera e envia o texto numerado.
 */
require('dotenv').config();
const axios = require('axios');
const whatsappService = require('../services/whatsappService');
const assert = require('assert');

async function testWhatsapp400Fallback() {
    console.log('================================================================');
    console.log('🛡️ TESTE DE SIMULAÇÃO DE ERRO META 400 & FALLBACK TRANSPARENTE');
    console.log('================================================================\n');

    // Guardar original axios.post
    const originalPost = axios.post;
    let fallbackTextCaptured = null;
    let postCallCount = 0;

    // Mocando axios.post para simular falha HTTP 400 no envio de botões
    axios.post = async function(url, data, config) {
        postCallCount++;
        // Se for tentativa de envio interativo (button ou list), força erro HTTP 400 da Meta
        if (data && data.type === 'interactive') {
            console.log(`⚠️  [SIMULAÇÃO AXIOS] Simulando erro Meta Graph API HTTP 400 para mensagem interativa (${data.interactive.type})...`);
            const err = new Error('Request failed with status code 400');
            err.response = {
                status: 400,
                data: {
                    error: {
                        message: "Unsupported interactive reply button payload (Meta API 400)",
                        type: "OAuthException",
                        code: 100
                    }
                }
            };
            throw err;
        }

        // Se for o fallback de texto (type === 'text'), captura o texto enviado!
        if (data && data.type === 'text') {
            console.log(`✅ [SIMULAÇÃO AXIOS] Fallback de texto capturado com sucesso!`);
            fallbackTextCaptured = data.text.body;
            return { status: 200, data: { messaging_product: 'whatsapp', contacts: [{ input: data.to, wa_id: data.to }], messages: [{ id: 'wamid.HBgL' }] } };
        }

        return originalPost.apply(this, arguments);
    };

    try {
        console.log('🔹 Executando whatsappService.sendButtonMessage com botões...');
        const buttons = ["Confirmar Presença", "Remarcar Consulta", "Cancelar Consulta"];
        const bodyText = "Olá, Maria! Lembrando da sua consulta hoje às 14:30 na clínica.";

        await whatsappService.sendButtonMessage('5511987654321', bodyText, buttons, '10006251', 'fake_token');

        console.log('\n--- VERIFICAÇÃO DO FALLBACK DISPARADO ---');
        console.log('   Texto Enviado pelo Fallback Transparente:');
        console.log('--------------------------------------------------');
        console.log(fallbackTextCaptured);
        console.log('--------------------------------------------------');

        assert.ok(fallbackTextCaptured !== null, 'Deveria ter capturado o texto de fallback enviado via sendTextMessage');
        assert.ok(fallbackTextCaptured.includes('1. Confirmar Presença'), 'Fallback deve conter a opção 1 numerada');
        assert.ok(fallbackTextCaptured.includes('2. Remarcar Consulta'), 'Fallback deve conter a opção 2 numerada');
        assert.ok(fallbackTextCaptured.includes('3. Cancelar Consulta'), 'Fallback deve conter a opção 3 numerada');

        console.log('\n🟢 PASS: Fallback transparente em erro Meta 400 verificado com 100% de sucesso!');

    } finally {
        // Restaurar axios.post original
        axios.post = originalPost;
    }
}

testWhatsapp400Fallback().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO NO TESTE DE FALLBACK 400:', err);
    process.exit(1);
});
