class Logger {
    error(context, message, stack = '') {
        console.error(`❌ [${context}] ${message}`);
        if (stack) console.error(stack);
    }

    warn(context, message) {
        console.warn(`⚠️ [${context}] ${message}`);
    }

    info(context, message) {
        console.log(`ℹ️ [${context}] ${message}`);
    }
}

module.exports = new Logger();
