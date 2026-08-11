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

async function withRetry(operation, retries = 3, delay = 300) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation();
        } catch (error) {
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

    async sendTextMessage(to, text, phoneId, token) {
        logger.info('WHATSAPP_OUTGOING', `[Para: ${to}] Resposta enviada (Texto): "${text}"`);
        const { url, headers } = this._buildRequest(phoneId, token);
        return withRetry(async () => {
            try {
                await axios.post(url, {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'text',
                    text: { body: text }
                }, { headers, timeout: 10000 });
            } catch (error) {
                handleMetaError(to, 'texto', error);
                throw error;
            }
        });
    }

    async sendButtonMessage(to, bodyText, buttons, phoneId, token) {
        logger.info('WHATSAPP_OUTGOING', `[Para: ${to}] Resposta enviada (Botões): "${bodyText}" | Botões: [${(buttons || []).join(', ')}]`);
        const { url, headers } = this._buildRequest(phoneId, token);
        const validButtons = (buttons || []).slice(0, 3);
        const safeBodyText = bodyText ? bodyText.substring(0, 1024) : '';
        if (validButtons.length === 0) return this.sendTextMessage(to, safeBodyText, phoneId, token);

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
                                buttons: validButtons.map((btn, i) => ({
                                    type: 'reply',
                                    reply: {
                                        id:    `btn_${i}`,
                                        title: btn.length > 20 ? btn.substring(0, 20) : btn
                                    }
                                }))
                            }
                        }
                    }, { headers, timeout: 10000 });
                } catch (error) {
                    handleMetaError(to, 'botões', error);
                    throw error;
                }
            });
        } catch (fallbackErr) {
            logger.warn('WHATSAPP_FALLBACK', `Falha no envio de botões para ${to}. Enviando texto formatado como fallback.`);
            const formattedFallback = `${safeBodyText}\n\n` + validButtons.map((b, i) => `${i + 1}. ${b}`).join('\n');
            return this.sendTextMessage(to, formattedFallback, phoneId, token).catch(() => {});
        }
    }

    async sendListMessage(to, bodyText, buttonLabel, sections, headerText = "Clínica Modelo", phoneId, token) {
        logger.info('WHATSAPP_OUTGOING', `[Para: ${to}] Resposta enviada (Lista Interativa): "${bodyText}" | Botão: "${buttonLabel}"`);
        const { url, headers } = this._buildRequest(phoneId, token);
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
                    }, { headers, timeout: 10000 });
                } catch (error) {
                    handleMetaError(to, 'lista', error);
                    throw error;
                }
            });
        } catch (fallbackErr) {
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
            return this.sendTextMessage(to, listFallback, phoneId, token).catch(() => {});
        }
    }

    async sendTemplateMessage(to, templateName, languageCode = 'pt_BR', components = [], phoneId, token) {
        const { url, headers } = this._buildRequest(phoneId, token);
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
                }, { headers, timeout: 10000 });
            } catch (error) {
                handleMetaError(to, 'template', error);
                throw error;
            }
        });
    }

    /**
     * Envia uma mensagem interativa com botão CTA (Call-to-Action) que abre uma URL externa.
     * O texto do botão aparece como um link clicável elegante (ex: "📅 Adicionar à Agenda").
     */
    async sendCtaUrlMessage(to, bodyText, displayText, url, phoneId, token) {
        const { url: apiUrl, headers } = this._buildRequest(phoneId, token);
        const safeBodyText = bodyText ? bodyText.substring(0, 1024) : '';
        const safeDisplayText = displayText ? displayText.substring(0, 20) : 'Abrir Link';

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
                }, { headers, timeout: 10000 });
            } catch (error) {
                // Fallback: se CTA não for suportado, envia como texto simples com o link
                const metaError = error.response?.data?.error;
                if (metaError && (metaError.code === 100 || metaError.code === 131009)) {
                    logger.warn('WHATSAPP_CTA_FALLBACK', `CTA URL não suportado para [${to}]. Enviando como texto com link.`);
                    return this.sendTextMessage(to, `${safeBodyText}\n\n🔗 ${safeDisplayText}:\n${url}`, phoneId, token);
                }
                handleMetaError(to, 'cta_url', error);
                throw error;
            }
        });
    }
}

module.exports = new WhatsAppService();
