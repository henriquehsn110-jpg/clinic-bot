require('dotenv').config();
const Sentry = require("@sentry/node");

function redactPii(str) {
    if (typeof str !== 'string') return str;
    return str
        // 1. Redação de CPF (Com ou sem formatação: 123.456.789-00 ou 12345678900)
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_REDACTED]')
        // 2. Redação de Telefones (Formatados com +55, (XX), espaços e traços: +55 (11) 98765-4321, 5511987654321, etc.)
        .replace(/\b(\+?55\s?)?(\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}\b/g, '[PHONE_REDACTED]')
        // 3. Redação de Nomes de Pacientes com Rótulo (ex: Paciente: Paulo, Nome: Ana, Paciente Paulo não encontrado)
        .replace(/(paciente|nome|patient|dependentname)\s*[:=]?\s*([A-ZÀ-Ú][a-zà-ú]+(\s+[A-Za-zÀ-ÖØ-öø-ÿ]+)*)/gi, '$1: [NAME_REDACTED]')
        // 4. Redação de Nomes Próprios em Linguagem Natural SEM RÓTULO (ex: "erro para Ana ao confirmar", "agendamento de Paulo")
        .replace(/\b(de|da|do|para|com|paciente|cliente)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|da|do|dos|das|e)\s+[A-ZÀ-Ú][a-zà-ú]+|\s+[A-ZÀ-Ú][a-zà-ú]+)*)/g, (match, prep, name) => {
            const nonNameWords = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo', 'Hoje', 'Amanhã', 'WhatsApp', 'Supabase', 'Meta', 'Express'];
            const firstWord = name.trim().split(/\s+/)[0];
            if (nonNameWords.includes(firstWord)) return match;
            return `${prep} [NAME_REDACTED]`;
        });
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
