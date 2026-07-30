require('dotenv').config();
const Sentry = require("@sentry/node");

// Inicializa a observabilidade do Sentry para capturar exceções e medir performance
Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://d785db3048df878310ec834efc7f2497@o4511821389037568.ingest.us.sentry.io/4511821404438529",

    // Tracing / Performance Evaluation
    tracesSampleRate: 1.0,
});

module.exports = Sentry;
