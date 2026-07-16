const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'error.log');

// Certifica de que a pasta de logs existe
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

class Logger {
    error(context, message, stack = '') {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [ERROR] [${context}] ${message}${stack ? '\nStack: ' + stack : ''}\n----------------------------------------\n`;
        
        console.error(`❌ [${context}] ${message}`);
        if (stack) console.error(stack);

        fs.appendFile(LOG_FILE, logLine, 'utf8', (err) => {
            if (err) console.error('Falha ao escrever no log local:', err.message);
        });
    }

    warn(context, message) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [WARN] [${context}] ${message}\n`;
        console.warn(`⚠️ [${context}] ${message}`);
        
        fs.appendFile(LOG_FILE, logLine, 'utf8', (err) => {
            if (err) console.error('Falha ao escrever no log local:', err.message);
        });
    }

    info(context, message) {
        const timestamp = new Date().toISOString();
        console.log(`ℹ️ [${context}] ${message}`);
    }
}

module.exports = new Logger();
