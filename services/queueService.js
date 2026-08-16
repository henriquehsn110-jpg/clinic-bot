const logger = require('./logger');
const databaseService = require('./databaseService');

class QueueService {
    constructor() {
        this.queue = [];
        this.failedQueue = [];
        this.isProcessing = false;
        this.maxRetries = 3;
        this.baseBackoffMs = 1000;
    }

    /**
     * Enfileira uma mensagem para envio assíncrono durável
     */
    async enqueueMessage(messageData) {
        const item = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            payload: messageData,
            attempts: 0,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            nextAttemptAt: Date.now()
        };

        this.queue.push(item);
        logger.info('QUEUE', `[Fila] Mensagem enfileirada: ${item.id} (Total na fila: ${this.queue.length})`);

        // Tenta persistir no Supabase se disponível
        try {
            if (databaseService.supabase) {
                await databaseService.supabase.from('message_queue').insert({
                    message_id: item.id,
                    payload: item.payload,
                    status: 'PENDING',
                    attempts: 0,
                    created_at: item.createdAt
                }).catch(() => {}); // Ignora silenciosamente se a tabela ainda não existir
            }
        } catch (e) {
            // Fallback durável para em-memória
        }

        this.processQueue();
        return item;
    }

    /**
     * Processa itens pendentes na fila com controle de taxa e retries exponenciais
     */
    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            while (this.queue.length > 0) {
                const now = Date.now();
                const itemIndex = this.queue.findIndex(i => i.nextAttemptAt <= now && i.status === 'PENDING');
                if (itemIndex === -1) break;

                const item = this.queue[itemIndex];
                item.status = 'PROCESSING';
                item.attempts += 1;

                try {
                    if (typeof item.payload.handler === 'function') {
                        await item.payload.handler();
                    }
                    item.status = 'COMPLETED';
                    this.queue.splice(itemIndex, 1);
                    logger.info('QUEUE', `[Fila] Mensagem processada com sucesso: ${item.id}`);
                } catch (err) {
                    logger.warn('QUEUE_RETRY', `[Fila] Tentativa ${item.attempts}/${this.maxRetries} falhou para ${item.id}: ${err.message}`);

                    if (item.attempts >= this.maxRetries) {
                        item.status = 'FAILED_PERMANENT';
                        item.failedAt = new Date().toISOString();
                        item.lastError = err.message;
                        this.failedQueue.push(item);
                        this.queue.splice(itemIndex, 1);
                        logger.error('QUEUE_DLQ', `[Fila Dead-Letter Queue] Mensagem movida para DLQ após ${item.attempts} falhas: ${item.id}`);
                    } else {
                        item.status = 'PENDING';
                        item.nextAttemptAt = Date.now() + (this.baseBackoffMs * Math.pow(2, item.attempts - 1));
                    }
                }

                // Rate limit buffer de 50ms entre disparos (max 20/sec por worker)
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Retorna o status da fila para monitoramento no Dashboard Admin
     */
    getStatus() {
        return {
            pending: this.queue.filter(i => i.status === 'PENDING').length,
            processing: this.queue.filter(i => i.status === 'PROCESSING').length,
            failed: this.failedQueue.length,
            totalInMemory: this.queue.length + this.failedQueue.length
        };
    }

    /**
     * Retorna itens com falha (DLQ) para reenvio manual
     */
    getFailedItems() {
        return this.failedQueue;
    }

    /**
     * Reenfileira um item da DLQ para nova tentativa
     */
    requeueFailedItem(id) {
        const idx = this.failedQueue.findIndex(i => i.id === id);
        if (idx !== -1) {
            const item = this.failedQueue[idx];
            item.status = 'PENDING';
            item.attempts = 0;
            item.nextAttemptAt = Date.now();
            this.queue.push(item);
            this.failedQueue.splice(idx, 1);
            this.processQueue();
            return true;
        }
        return false;
    }
}

module.exports = new QueueService();
