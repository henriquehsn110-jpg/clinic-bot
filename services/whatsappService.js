const axios = require('axios');

function handleMetaError(to, actionName, error) {
    const metaError = error.response?.data?.error;
    if (metaError?.code === 131047) {
        console.warn(`⏳ [WHATSAPP] Tentativa de envio (${actionName}) para [${to}] fora da janela de 24 horas.`);
    } else {
        console.error(`❌ Erro ${actionName} [${to}]:`, error.response?.data || error.message);
    }
}

class WhatsAppService {
    constructor() {
        this.token  = process.env.WHATSAPP_TOKEN;
        this.phoneId = process.env.WHATSAPP_PHONE_ID;
        this.apiUrl  = `https://graph.facebook.com/v25.0/${this.phoneId}/messages`;
        this.headers = {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type':  'application/json'
        };
    }

    async sendTextMessage(to, text) {
        try {
            await axios.post(this.apiUrl, {
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: text }
            }, { headers: this.headers });
        } catch (error) {
            handleMetaError(to, 'texto', error);
            throw error; // Propaga para o controller
        }
    }

    async sendButtonMessage(to, bodyText, buttons) {
        const validButtons = buttons.slice(0, 3);
        if (validButtons.length === 0) return this.sendTextMessage(to, bodyText);

        try {
            await axios.post(this.apiUrl, {
                messaging_product: 'whatsapp',
                to,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: bodyText },
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
            }, { headers: this.headers });
        } catch (error) {
            handleMetaError(to, 'botões', error);
            throw error;
        }
    }

    async sendListMessage(to, bodyText, buttonLabel, sections, headerText = "Clínica Modelo") {
        // Sanitização defensiva para obedecer estritamente aos limites de payload da Meta API
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
            await axios.post(this.apiUrl, {
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
            }, { headers: this.headers });
        } catch (error) {
            handleMetaError(to, 'lista', error);
            throw error;
        }
    }
}

module.exports = new WhatsAppService();
