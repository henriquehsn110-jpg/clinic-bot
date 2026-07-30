// Importa a inicialização do Sentry antes de qualquer outro módulo
const Sentry = require('./instrument');
require('dotenv').config();
const express = require('express');


// Validação explícita de variáveis de ambiente críticas no boot em produção
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_DASHBOARD_URL) {
    console.error('❌ ERRO CRÍTICO: A variável ADMIN_DASHBOARD_URL não está definida no ambiente de produção.');
    process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.APP_SECRET) {
    console.error('❌ ERRO CRÍTICO DE SEGURANÇA: APP_SECRET não está definido no ambiente de produção. Webhook HMAC e tokens de sessão ficam inseguros sem esta variável.');
    process.exit(1);
}
const crypto = require('crypto');
const path = require('path');
const conversationController = require('./controllers/conversationController');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reminderService = require('./services/reminderService');

const app = express();

// Middleware de segurança: impede acesso externo às rotas locais do simulador via túnel público
const localOnly = (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        return res.sendStatus(404);
    }
    const hasExternalIp = req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'];
    const host = req.headers.host || '';
    if (hasExternalIp || host.includes('trycloudflare.com')) {
        console.warn(`[SECURITY] Tentativa de acesso bloqueada à rota local do simulador: ${req.originalUrl}`);
        return res.status(403).json({ error: 'Acesso restrito ao ambiente de desenvolvimento local.' });
    }
    next();
};

// 1. Serve o simulador web centralizado, a landing page e o painel da clínica
if (process.env.NODE_ENV !== 'production') {
    app.use('/simulator', localOnly, express.static(path.join(__dirname, '../simulators/whatsapp-web')));
    app.use('/simulator', localOnly, express.static(path.join(__dirname, '../clinic-bot-simulator')));
    app.use('/simulator', localOnly, express.static(path.join(__dirname, 'public/simulator')));
}

// Arquivos estáticos da pasta public (servidos na raiz e em /public com index: false para não sobrepor rotas explícitas - R10)
const staticOptions = {
    index: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
};
app.use('/public', express.static(path.join(__dirname, 'public'), staticOptions));
app.use(express.static(path.join(__dirname, 'public'), staticOptions));

// Rota da Landing Page de Vendas (Home)
app.get(['/', '/landing', '/home'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Rota Oficial do Painel da Clínica / Recepção
app.get(['/dashboard', '/dashboard/', '/dashboard.html', '/painel'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Encurtador de Link do Google Calendar Privado e Seguro (LGPD)
app.get('/c/:shortId', async (req, res) => {
    try {
        const shortId = req.params.shortId;
        if (!shortId || shortId.length < 6) return res.status(404).send("Link de agendamento inválido.");
        
        const cleanShortId = shortId.trim().toLowerCase();
        const minUuid = cleanShortId + '-0000-0000-0000-000000000000';
        const maxUuid = cleanShortId + '-ffff-ffff-ffff-ffffffffffff';
        
        const db = require('./services/databaseService');
        const { data: appt, error } = await db.supabase
            .from('appointments')
            .select('*, clinic:clinics(name, address)')
            .gte('id', minUuid)
            .lte('id', maxUuid)
            .maybeSingle();
            
        if (error || !appt) {
            return res.status(404).send("Agendamento não encontrado ou já expirado.");
        }
        
        const title = encodeURIComponent(`Consulta: ${appt.type || 'Avaliação'}`);
        const clinicName = appt.clinic && appt.clinic.name ? appt.clinic.name : 'Nossa Clínica';
        const details = encodeURIComponent(`Consulta agendada via ClinicaBot\nClínica: ${clinicName}`);
        const location = encodeURIComponent((appt.clinic && appt.clinic.address) ? appt.clinic.address : 'Consulte o endereço no WhatsApp');
        
        const dateRaw = appt.appointment_date.replace(/-/g, '');
        const timeRaw = appt.appointment_time.substring(0, 5);
        const startTm = timeRaw.replace(/:/g, '') + '00';
        
        // Adicionar 1 hora para o horário de término padrão
        let endHour = parseInt(timeRaw.split(':')[0]) + 1;
        let endTm = String(endHour).padStart(2, '0') + timeRaw.split(':')[1] + '00';
        
        const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateRaw}T${startTm}/${dateRaw}T${endTm}&details=${details}&location=${location}&ctz=America/Sao_Paulo`;
        
        res.redirect(302, calUrl);
    } catch (err) {
        console.error('[CALENDAR_REDIRECT_ERROR]', err);
        res.status(500).send("Erro interno ao gerar o evento na agenda.");
    }
});

// Captura o raw body em bytes antes do JSON.parse para validação do HMAC da Meta
app.use(express.json({
    verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true }));

// CORS para proteção das APIs (suporta dev local, file:// e produção)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (process.env.NODE_ENV !== 'production') {
        res.header('Access-Control-Allow-Origin', (origin && origin !== 'null') ? origin : '*');
    } else {
        res.header('Access-Control-Allow-Origin', process.env.ADMIN_DASHBOARD_URL || '*');
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Registra as rotas da API do Dashboard com Autenticação e Criptografia
app.use('/api/dashboard', dashboardRoutes);

// 2. Rotas do Simulador Local (Apenas em Desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
    app.post('/api/simulate', localOnly, async (req, res) => {
        const { phone, text } = req.body;
        console.log(`[SIMULATOR] Received message from ${phone}: "${text}"`);
        try {
            const response = await conversationController.handleIncomingMessage(phone, text, true);
            console.log(`[SIMULATOR] Response sent: "${response.text}"`);
            res.json(response);
        } catch (e) {
            console.error(`[SIMULATOR] Error processing:`, e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/simulate/reset', localOnly, async (req, res) => {
        const { phone } = req.body;
        try {
            const db = require('./services/databaseService');
            await db.sessions.delete(phone);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
}

// 3. Validação de Assinatura HMAC da Meta (Produção)
function verifySignature(req) {
    if (!process.env.APP_SECRET) {
        console.error('❌ [SECURITY] APP_SECRET não está configurado nas variáveis de ambiente!');
        return false;
    }
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const expected = 'sha256=' + crypto
        .createHmac('sha256', process.env.APP_SECRET)
        .update(req.rawBody)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
    } catch {
        return false;
    }
}

// 4. Handshake de Validação do Webhook (Suporta /webhook e /api/webhook)
const handleVerification = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expectedToken = process.env.META_VERIFY_TOKEN || process.env.VERIFY_TOKEN;

    if (mode === 'subscribe' && token === expectedToken) {
        console.log('✅ Webhook verificado pela Meta com sucesso.');
        return res.status(200).send(challenge);
    }
    console.warn('[SECURITY] Tentativa de handshake com token inválido.');
    res.sendStatus(403);
};

app.get('/webhook', handleVerification);
app.get('/api/webhook', handleVerification);

// 5. Ingestão de Mensagens (WhatsApp Cloud API)
const db = require('./services/databaseService');
const whatsappService = require('./services/whatsappService');
const logger = require('./services/logger');

// Processamento em segundo plano da caixa de entrada durável
let isProcessingInbox = false;
const processWebhookInbox = async () => {
    if (isProcessingInbox) return;
    isProcessingInbox = true;

    try {
        const pendingItems = await db.webhooks.fetchPending(10);
        for (const item of pendingItems) {
            await db.webhooks.updateInboxStatus(item.id, 'processing');
            
            try {
                const body = item.payload;
                if (body.object === 'whatsapp_business_account') {
                    for (const entry of (body.entry || [])) {
                        for (const change of (entry.changes || [])) {
                            const value = change.value;
                            if (!value) continue;

                            // MULTI-TENANT: Resolve a clínica dona deste número
                            const phoneNumberId = value.metadata?.phone_number_id;
                            let clinicId = null;
                            if (phoneNumberId) {
                                const clinic = await db.clinics.findByPhoneNumberId(phoneNumberId);
                                if (clinic) clinicId = clinic.id;
                            }
                            if (!clinicId) {
                                // Em produção (SaaS Multi-Tenant), rejeitamos estritamente qualquer webhook cuja clínica não seja resolvida,
                                // independente de o phone_number_id estar presente ou ausente, impedindo qualquer vazamento para clínica default.
                                if (process.env.NODE_ENV === 'production') {
                                    logger.warn('WEBHOOK_INBOX', `[MULTI-TENANT SECURITY] Webhook ignorado: phone_number_id (${phoneNumberId || 'ausente'}) não está associado a nenhuma clínica cadastrada.`);
                                    continue;
                                }
                                // No ambiente de desenvolvimento/teste local, usamos a clínica modelo como fallback de testes.
                                const defaultClinic = await db.clinics.findBySlug('clinica-modelo');
                                if (defaultClinic) {
                                    clinicId = defaultClinic.id;
                                    // Associa automaticamente apenas em desenvolvimento local e se a clínica ainda não tiver ID setado
                                    if (phoneNumberId && process.env.NODE_ENV !== 'production') {
                                        try {
                                            await db.supabase.from('clinics').update({ phone_number_id: phoneNumberId }).eq('id', defaultClinic.id);
                                        } catch (updateErr) {
                                            logger.warn('WEBHOOK_INBOX', `Falha ao associar phone_number_id em dev: ${updateErr.message}`);
                                        }
                                    }
                                } else {
                                    logger.error('WEBHOOK_INBOX', `Nenhuma clínica modelo encontrada para fallback no ambiente local.`);
                                    continue;
                                }
                            }

                            // Processa Statuses de Entrega
                            if (value.statuses && Array.isArray(value.statuses)) {
                                for (const statusObj of value.statuses) {
                                    await db.webhooks.logMessageStatus(statusObj.id, statusObj.recipient_id, statusObj.status, statusObj.timestamp);
                                }
                            }

                            // Processa Mensagens Recebidas
                            if (value.messages && Array.isArray(value.messages)) {
                                for (const message of value.messages) {
                                    const messageId = message.id;

                                    // Isolamento por mensagem: uma falha aqui não pode abortar o
                                    // processamento das demais mensagens do mesmo lote/item do inbox
                                    // nem derrubar o item inteiro para 'failed' (o que impediria
                                    // qualquer nova tentativa automática das mensagens seguintes).
                                    try {
                                        // C12: Idempotência garantida via banco de dados sem fallback
                                        const processAttempt = await db.webhooks.attemptProcessing(messageId);
                                        if (processAttempt === false) {
                                            console.log(`ℹ️ [WEBHOOK] Mensagem duplicada ignorada: ${messageId}`);
                                            continue;
                                        }

                                        const phone = message.from;
                                        let text = '';
                                        if (message.interactive?.list_reply) {
                                            const listReply = message.interactive.list_reply;
                                            if (listReply.id && listReply.id.startsWith('date_')) {
                                                text = `Selecionei a data: ${listReply.id.replace('date_', '')}`;
                                            } else if (listReply.id === 'btn_more_dates') {
                                                text = 'Outras datas...';
                                            } else {
                                                text = listReply.title;
                                            }
                                        } else {
                                            text = message.text?.body || message.interactive?.button_reply?.title || '';
                                        }

                                        if (text) {
                                            console.log(`📩 [WEBHOOK] Mensagem de [${phone}]: "${text}" para Clínica [${clinicId}]`);
                                            await conversationController.handleIncomingMessage(phone, text, false, clinicId, phoneNumberId);
                                        } else {
                                            console.log(`📩 [WEBHOOK] Mensagem com formato não suportado recebida de [${phone}]`);
                                            await whatsappService.sendTextMessage(phone, "Por enquanto, eu só consigo responder mensagens de texto e cliques em botões. Como posso te ajudar por texto?", phoneNumberId).catch(() => {});
                                        }
                                    } catch (messageErr) {
                                        // ATENÇÃO: attemptProcessing já marcou messageId como processado
                                        // em webhook_logs antes desta falha. Isso evita duplicidade, mas
                                        // significa que essa mensagem específica NÃO será reprocessada
                                        // automaticamente. Logamos com destaque para permitir intervenção manual.
                                        console.error(`❌ [WEBHOOK] Falha ao processar mensagem individual ${messageId} de [${message.from}] — mensagem pode ter ficado sem resposta:`, messageErr);
                                        logger.error('WEBHOOK_MESSAGE_LOST', `Mensagem ${messageId} de [${message.from}] falhou e não será reprocessada automaticamente: ${messageErr.message}`, messageErr.stack);
                                    }
                                }
                            }
                        }
                    }
                }
                
                await db.webhooks.updateInboxStatus(item.id, 'completed');
            } catch (processingErr) {
                console.error(`❌ Erro ao processar inbox item ${item.id}:`, processingErr);
                await db.webhooks.updateInboxStatus(item.id, 'failed', processingErr.message);
            }
        }
    } catch (err) {
        console.error('❌ Erro no loop de processamento do inbox:', err);
    } finally {
        isProcessingInbox = false;
    }
};

// Retry loop acionado periodicamente para capturar mensagens travadas
setInterval(processWebhookInbox, 10000);

const handleIncomingWebhook = async (req, res) => {
    const skipVerify = process.env.SKIP_WEBHOOK_VERIFY === 'true' && process.env.NODE_ENV !== 'production';
    if (!skipVerify && !verifySignature(req)) {
        console.warn('⛔ Requisição rejeitada: assinatura HMAC inválida');
        return res.sendStatus(403);
    }

    try {
        // C7: Grava na fila durável imediatamente. Se falhar, retorna 500 para a Meta reentrar
        await db.webhooks.addToInbox(req.body);
        res.sendStatus(200);
        
        // Aciona o processamento assíncrono em background sem prender a resposta
        setImmediate(processWebhookInbox);
    } catch (error) {
        console.error('❌ Erro de infraestrutura ao salvar webhook no Inbox (C7/C12):', error);
        res.sendStatus(500);
    }
};

app.post('/webhook', handleIncomingWebhook);
app.post('/api/webhook', handleIncomingWebhook);

// 6. Health Check & Observabilidade
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Rota de teste/debug para validar recepção de erros no painel do Sentry
app.get('/debug-sentry', function mainHandler(req, res) {
    throw new Error('Sentry Test Error — ClinicaBot SaaS Pro');
});

// Registrar o Error Handler do Sentry após todas as rotas/controllers
Sentry.setupExpressErrorHandler(app);

// Boot

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor online na porta ${PORT}`);
    console.log(`[SIMULATOR] Acesse http://localhost:${PORT}/simulator/index.html`);
    console.log(`[WEBHOOK] Roteie o tráfego para http://localhost:${PORT}/api/webhook`);

    // Ativação do Agendador de Lembretes Automáticos via Cron (diariamente às 08:00 AM America/Sao_Paulo)
    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`⏰ [REMINDERS] Agendador de lembretes ativado (modo simulação: ${isDev})`);
    try {
        const cron = require('node-cron');
        cron.schedule('0 8 * * *', () => {
            console.log('⏰ [REMINDERS] Executando disparo diário de lembretes (08:00 BRT)...');
            reminderService.processDailyReminders(isDev).catch(err => {
                console.error('❌ Erro no ciclo agendado de lembretes:', err.message);
            });
        }, {
            timezone: 'America/Sao_Paulo'
        });
        console.log('✅ [REMINDERS] Cron job agendado com sucesso para 08:00 AM (America/Sao_Paulo)');
    } catch (cronErr) {
        console.warn('⚠️ [REMINDERS] Erro ao inicializar node-cron:', cronErr.message);
    }
});
