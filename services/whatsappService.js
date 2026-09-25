const axios = require('axios');
const logger = require('./logger');

function handleMetaError(to, actionName, error) {
    const metaError = error.response?.data?.error;
    if (metaError?.code === 131047) {
        logger.warn('WHATSAPP', `Tentativa de envio (${actionName}) para [${to}] fora da janela de 24 horas.`);
    } else {
        logger.error('WHATSAPP', `Erro ${actionName} [${to}]: ${error.response?.data?.error?.message || error.message}`, error.stack);
    }
}

/**
 * NOTA DE DESIGN (JANELA AT-LEAST-ONCE PARA EFEITOS EXTERNOS):
 * O cancelamento cooperativo via AbortSignal interrompe requisições HTTP antes ou durante o transporte.
 * No entanto, em sistemas distribuídos sem Two-Phase Commit (2PC) com APIs externas de terceiros (Meta WhatsApp Cloud API),
 * um abort acionado durante o trânsito da requisição não elimina a janela onde a Meta processa o envio com sucesso
 * antes da confirmação local no banco de dados. O modelo do sistema permanece at-least-once.
 */

async function withRetry(operation, retries = 3, delay = 300, signal = null) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        if (signal?.aborted) {
            const abortErr = new Error('Operação abortada antes da execução ou retentativa.');
            abortErr.name = 'AbortError';
            abortErr.code = 'AbortError';
            throw abortErr;
        }
        try {
            return await operation();
        } catch (error) {
            if (signal?.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
                throw error;
            }
            // Erros 4xx da API da Meta não adiantam tentar de novo (ex: 131047 fora da janela de 24h),
            // EXCETO HTTP 429 (Too Many Requests / Rate Limit), que deve fazer retry com backoff!
            const status = error.response?.status;
            if (status && status >= 400 && status < 500 && status !== 429) {
                throw error;
            }
            if (attempt === retries) throw error;
            logger.warn('WHATSAPP_RETRY', `Tentativa ${attempt}/${retries} falhou para envio WhatsApp. Tentando novamente em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}

class WhatsAppService {
    constructor() {
        this.defaultToken   = process.env.WHATSAPP_TOKEN || process.env.META_WA_TOKEN;
        this.defaultPhoneId = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;
    }

    _resolveOptions(phoneId, token, options) {
        let resolvedPhoneId = phoneId;
        let resolvedToken = token;
        let resolvedOptions = options || {};

        if (phoneId && typeof phoneId === 'object' && ('signal' in phoneId || 'timeout' in phoneId)) {
            resolvedOptions = phoneId;
            resolvedPhoneId = null;
            resolvedToken = null;
        } else if (token && typeof token === 'object' && ('signal' in token || 'timeout' in token)) {
            resolvedOptions = token;
            resolvedToken = null;
        }
        return { phoneId: resolvedPhoneId, token: resolvedToken, options: resolvedOptions };
    }

    _buildRequest(phoneId, token) {
        const resolvedPhoneId = phoneId || this.defaultPhoneId;
        const resolvedToken   = token || this.defaultToken;

        if (!resolvedPhoneId || !resolvedToken) {
            throw new Error('WhatsAppService: phoneId/token não configurados para este envio.');
        }

        return {
            url: `https://graph.facebook.com/v25.0/${resolvedPhoneId}/messages`,
            headers: {
                'Authorization': `Bearer ${resolvedToken}`,
                'Content-Type':  'application/json'
            }
        };
    }

    async sendTextMessage(to, text, phoneId, token, options = {}) {
        const resolved = this._resolveOptions(phoneId, token, options);
        logger.info('WHATSAPP_OUTGOING', `[Para: ${to}] Resposta enviada (Texto): "${text}"`);
        const { url, headers } = this._buildRequest(resolved.phoneId, resolved.token);
        const signal = resolved.options?.signal;
        return withRetry(async () => {
            try {
                await axios.post(url, {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'text',
                    text: { body: text }
                }, { headers, timeout: 10000, signal });
            } catch (error) {
                handleMetaError(to, 'texto', error);
                throw error;
            }
        }, 3, 300, signal);
    }

    async sendButtonMessage(to, bodyText, buttons, phoneId, token, options = {}) {
        const resolved = this._resolveOptions(phoneId, token, options);
        const buttonTitles = (buttons || []).map(b => typeof b === 'object' ? `${b.title} (${b.id})` : b);
        logger.info('WHATSAPP_OUTGOING', `[Para: ${to}] Resposta enviada (Botões): "${bodyText}" | Botões: [${buttonTitles.join(', ')}]`);
        const { url, headers } = this._buildRequest(resolved.phoneId, resolved.token);
        const validButtons = (buttons || []).slice(0, 3);
        const safeBodyText = bodyText ? bodyText.substring(0, 1024) : '';
        const signal = resolved.options?.signal;
        if (validButtons.length === 0) return this.sendTextMessage(to, safeBodyText, resolved.phoneId, resolved.token, resolved.options);

        try {
            return await withRetry(async () => {
                try {
                    await axios.post(url, {
                        messaging_product: 'whatsapp',
                        to,
                        type: 'interactive',
                        interactive: {
                            type: 'button',
                            body: { text: safeBodyText },
                            action: {
                                buttons: validButtons.map((btn, i) => {
                                    const btnId = (typeof btn === 'object' && btn?.id) ? String(btn.id) : `btn_${i}`;
                                    const rawTitle = (typeof btn === 'object' && btn?.title) ? String(btn.title) : String(btn);
                                    const safeTitle = rawTitle.length > 20 ? rawTitle.substring(0, 20) : rawTitle;
                                    return {
                                        type: 'reply',
                                        reply: {
                                            id: btnId,
                                            title: safeTitle
                                        }
                                    };
                                })
                            }
                        }
                    }, { headers, timeout: 10000, signal });
                } catch (error) {
                    handleMetaError(to, 'botões', error);
                    throw error;
                }
            }, 3, 300, signal);
        } catch (fallbackErr) {
            if (signal?.aborted || fallbackErr.name === 'AbortError' || fallbackErr.code === 'ERR_CANCELED') {
                throw fallbackErr;
            }
            logger.warn('WHATSAPP_FALLBACK', `Falha no envio de botões para ${to}. Enviando texto formatado como fallback.`);
            const formattedFallback = `${safeBodyText}\n\n` + validButtons.map((b, i) => `${i + 1}. ${b}`).join('\n');
            return this.sendTextMessage(to, formattedFallback, resolved.phoneId, resolved.token, resolved.options);
        }
    }

    async sendInteractiveButtons(to, bodyText, buttons, phoneId, token, options = {}) {
        return this.sendButtonMessage(to, bodyText, buttons, phoneId, token, options);
    }

    async sendListMessage(to, bodyText, buttonLabel, sections, headerText = "Clínica Modelo", phoneId, token, options = {}) {
        const resolved = this._resolveOptions(phoneId, token, options);
        logger.info('WHATSAPP_OUTGOING', `[Para: ${to}] Resposta enviada (Lista Interativa): "${bodyText}" | Botão: "${buttonLabel}"`);
        const { url, headers } = this._buildRequest(resolved.phoneId, resolved.token);
        const signal = resolved.options?.signal;
        const safeSections = sections.map(section => ({
            title: section.title ? section.title.substring(0, 24) : "",
            rows: (section.rows || []).map(row => {
                const safeRow = {
                    id: row.id ? row.id.substring(0, 200) : "",
                    title: row.title ? row.title.substring(0, 24) : ""
                };
                if (row.description) {
                    safeRow.description = row.description.substring(0, 72);
                }
                return safeRow;
            })
        }));

        try {
            return await withRetry(async () => {
                try {
                    await axios.post(url, {
                        messaging_product: 'whatsapp',
                        to,
                        type: 'interactive',
                        interactive: {
                            type: 'list',
                            header: { type: 'text', text: headerText.substring(0, 60) },
                            body:   { text: bodyText.substring(0, 1024) },
                            action: {
                                button: buttonLabel.substring(0, 20),
                                sections: safeSections
                            }
                        }
                    }, { headers, timeout: 10000, signal });
                } catch (error) {
                    handleMetaError(to, 'lista', error);
                    throw error;
                }
            }, 3, 300, signal);
        } catch (fallbackErr) {
            if (signal?.aborted || fallbackErr.name === 'AbortError' || fallbackErr.code === 'ERR_CANCELED') {
                throw fallbackErr;
            }
            logger.warn('WHATSAPP_FALLBACK', `Falha no envio de lista para ${to}. Enviando texto formatado como fallback.`);
            let listFallback = bodyText ? bodyText.substring(0, 1024) : '';
            let optNum = 1;
            safeSections.forEach(sec => {
                if (sec.title) listFallback += `\n\n📌 *${sec.title}*:`;
                sec.rows.forEach(r => {
                    listFallback += `\n${optNum}. ${r.title}${r.description ? ` (${r.description})` : ''}`;
                    optNum++;
                });
            });
            return this.sendTextMessage(to, listFallback, resolved.phoneId, resolved.token, resolved.options);
        }
    }

    async sendTemplateMessage(to, templateName, languageCode = 'pt_BR', components = [], phoneId, token, options = {}) {
        const resolved = this._resolveOptions(phoneId, token, options);
        const { url, headers } = this._buildRequest(resolved.phoneId, resolved.token);
        const signal = resolved.options?.signal;
        return withRetry(async () => {
            try {
                await axios.post(url, {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'template',
                    template: {
                        name: templateName,
                        language: { code: languageCode },
                        components: components.length ? [{
                            type: 'body',
                            parameters: components.map(c => ({ type: 'text', text: String(c) }))
                        }] : []
                    }
                }, { headers, timeout: 10000, signal });
            } catch (error) {
                handleMetaError(to, 'template', error);
                throw error;
            }
        }, 3, 300, signal);
    }

    /**
     * Envia uma mensagem interativa com botão CTA (Call-to-Action) que abre uma URL externa.
     * O texto do botão aparece como um link clicável elegante (ex: "📅 Adicionar à Agenda").
     */
    async sendCtaUrlMessage(to, bodyText, displayText, url, phoneId, token, options = {}) {
        const resolved = this._resolveOptions(phoneId, token, options);
        const { url: apiUrl, headers } = this._buildRequest(resolved.phoneId, resolved.token);
        const safeBodyText = bodyText ? bodyText.substring(0, 1024) : '';
        const safeDisplayText = displayText ? displayText.substring(0, 20) : 'Abrir Link';
        const signal = resolved.options?.signal;

        return withRetry(async () => {
            try {
                await axios.post(apiUrl, {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'interactive',
                    interactive: {
                        type: 'cta_url',
                        body: { text: safeBodyText },
                        action: {
                            name: 'cta_url',
                            parameters: {
                                display_text: safeDisplayText,
                                url: url
                            }
                        }
                    }
                }, { headers, timeout: 10000, signal });
            } catch (error) {
                if (signal?.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
                    throw error;
                }
                // Fallback: se CTA não for suportado, envia como texto simples com o link
                const metaError = error.response?.data?.error;
                if (metaError && (metaError.code === 100 || metaError.code === 131009)) {
                    logger.warn('WHATSAPP_CTA_FALLBACK', `CTA URL não suportado para [${to}]. Enviando como texto com link.`);
                    return this.sendTextMessage(to, `${safeBodyText}\n\n🔗 ${safeDisplayText}:\n${url}`, resolved.phoneId, resolved.token, resolved.options);
                }
                handleMetaError(to, 'cta_url', error);
                throw error;
            }
        }, 3, 300, signal);
    }
}

module.exports = new WhatsAppService();
