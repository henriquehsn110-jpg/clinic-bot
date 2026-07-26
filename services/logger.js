/**
 * Logger Estruturado JSON (Produção)
 * Facilita a integração com ferramentas de monitoramento (Datadog, CloudWatch, etc.)
 */
class Logger {
    log(level, context, message, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            context,
            message,
            ...data
        };
        
        if (level === 'ERROR') {
            console.error(JSON.stringify(logEntry));
        } else if (level === 'WARN') {
            console.warn(JSON.stringify(logEntry));
        } else {
            console.log(JSON.stringify(logEntry));
        }
    }

    info(context, message, data = {}) {
        this.log('INFO', context, message, data);
    }

    warn(context, message, data = {}) {
        this.log('WARN', context, message, data);
    }

    error(context, message, stack = null, data = {}) {
        this.log('ERROR', context, message, { ...data, stack });
    }
}

module.exports = new Logger();
