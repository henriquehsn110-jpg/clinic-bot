require('dotenv').config();
const Sentry = require("@sentry/node");

function redactPii(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_REDACTED]')
        .replace(/\b55\d{10,11}\b/g, '[PHONE_REDACTED]');
}

function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            obj[key] = redactPii(obj[key]);
        } else if (typeof obj[key] === 'object') {
            sanitizeObject(obj[key]);
        }
    }
    return obj;
}

// Inicializa a observabilidade do Sentry para capturar exceções e medir performance
Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://d785db3048df878310ec834efc7f2497@o4511821389037568.ingest.us.sentry.io/4511821404438529",

    // Tracing / Performance Evaluation
    tracesSampleRate: 1.0,

    // Higienização e Mascaramento LGPD contra vazamento de PII em logs de erro
    beforeSend(event) {
        if (event.message) event.message = redactPii(event.message);
        if (event.exception && event.exception.values) {
            event.exception.values.forEach(val => {
                if (val.value) val.value = redactPii(val.value);
            });
        }
        if (event.breadcrumbs) {
            event.breadcrumbs.forEach(b => {
                if (b.message) b.message = redactPii(b.message);
                if (b.data) sanitizeObject(b.data);
            });
        }
        if (event.extra) sanitizeObject(event.extra);
        return event;
    }
});

module.exports = Sentry;
