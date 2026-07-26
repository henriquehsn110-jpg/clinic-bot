const fs = require('fs');

let text = fs.readFileSync('server.js', 'utf8');

// 1. Requerer express-rate-limit
if (!text.includes("const rateLimit = require('express-rate-limit');")) {
    text = text.replace("const express = require('express');", "const express = require('express');\nconst rateLimit = require('express-rate-limit');");
}

// 2. Criar webhookLimiter
const rateLimitCode = `
// Proteção Rate Limiting para evitar ataques de negação de serviço (P1)
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 100, // no máximo 100 requisições por minuto por IP
    message: { error: 'Muitas requisições recebidas. Limite excedido.' },
    standardHeaders: true,
    legacyHeaders: false
});
`;

if (!text.includes('const webhookLimiter')) {
    text = text.replace("app.use('/api/dashboard', dashboardRoutes);", "app.use('/api/dashboard', dashboardRoutes);\n" + rateLimitCode);
}

// Aplicar limiter nas rotas do webhook
text = text.replace("app.post('/webhook', handleIncomingWebhook);", "app.post('/webhook', webhookLimiter, handleIncomingWebhook);");
text = text.replace("app.post('/api/webhook', handleIncomingWebhook);", "app.post('/api/webhook', webhookLimiter, handleIncomingWebhook);");

// 3. Proteger o setInterval de inbox (P3)
const oldSetInterval = "setInterval(processWebhookInbox, 10000);";
const newSetInterval = `setInterval(async () => {
    try {
        await processWebhookInbox();
    } catch (err) {
        logger.error('INBOX_PROCESSOR', 'Erro no loop do processador de inbox', { error: err.message, stack: err.stack });
    }
}, 10000);`;

text = text.replace(oldSetInterval, newSetInterval);

fs.writeFileSync('server.js', text);
console.log('server.js atualizado com Rate Limiting e Tratamento no setInterval.');
