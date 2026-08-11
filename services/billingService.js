// CLINICABOT SAAS PRO — SERVIÇO DE ASSINATURAS & FATURAMENTO
const db = require('./databaseService');
const logger = require('./logger');

const PLANS = {
    basic: {
        name: 'Starter Pro',
        priceBrl: 197.00,
        bookingLimit: 300,
        features: ['Consultório Individual (1 Médico)', 'Agendamento WhatsApp AI', 'Até 300 agendamentos/mês', 'Dashboard de Recepção']
    },
    pro: {
        name: 'Growth Pro',
        priceBrl: 397.00,
        bookingLimit: 1000,
        features: ['Clínica Média (2 a 5 Médicos)', 'Agendamento WhatsApp AI', 'Até 1.000 agendamentos/mês', 'Dashboard Completo', 'Relatórios & Lembretes']
    },
    enterprise: {
        name: 'Enterprise',
        priceBrl: 697.00,
        bookingLimit: 999999,
        features: ['Redes e Policlínicas (Ilimitado)', 'Agendamentos Ilimitados', 'Multi-unidades', 'Suporte Prioritário VIP 24/7', 'Gestor de Conta Dedicado']
    }
};

async function safeUpdateClinicStatus(clinicId, status, planType = null, bookingLimit = null) {
    try {
        const clinic = await db.clinics.findById(clinicId);
        let updatedWorkHours = clinic?.work_hours || '{}';
        try {
            let parsed = typeof updatedWorkHours === 'string' ? JSON.parse(updatedWorkHours) : (updatedWorkHours || {});
            parsed.subscription_status = status;
            if (planType) parsed.plan_type = planType;
            updatedWorkHours = JSON.stringify(parsed);
        } catch {}

        const payloadFull = {
            subscription_status: status,
            work_hours: updatedWorkHours
        };
        if (planType) payloadFull.plan_type = planType;
        if (bookingLimit) payloadFull.monthly_booking_limit = bookingLimit;

        const res = await db.supabase.from('clinics').update(payloadFull).eq('id', clinicId);
        if (res.error) {
            // Fallback se colunas v12 não existirem no Supabase remoto
            await db.supabase.from('clinics').update({ work_hours: updatedWorkHours }).eq('id', clinicId);
        }
    } catch (err) {
        logger.warn('BILLING_SAFE_UPDATE_ERR', `Erro na atualização resiliente de status: ${err.message}`);
    }
}

class BillingService {
    getPlans() {
        return PLANS;
    }

    async checkClinicAccess(clinicId) {
        if (!clinicId) return { allowed: true, reason: 'dev_default' };

        try {
            const clinic = await db.clinics.findById(clinicId);
            if (!clinic) {
                return { allowed: false, reason: 'clinic_not_found' };
            }

            // Tenta obter de coluna própria ou do JSON work_hours como fallback resiliente
            let status = clinic.subscription_status;
            if (!status && clinic.work_hours) {
                try {
                    const parsed = JSON.parse(clinic.work_hours);
                    if (parsed && parsed.subscription_status) {
                        status = parsed.subscription_status;
                    }
                } catch {}
            }
            status = status || 'active';

            if (status === 'suspended' || status === 'canceled' || status === 'past_due') {
                logger.warn('BILLING_ACCESS_DENIED', `Acesso negado para a clínica [${clinicId}]. Status da assinatura: ${status}`);
                return { allowed: false, reason: status, status };
            }

            const limit = clinic.monthly_booking_limit || PLANS[clinic.plan_type || 'pro']?.bookingLimit || 1000;
            const count = clinic.monthly_booking_count || 0;

            if (count >= limit) {
                logger.warn('BILLING_QUOTA_EXCEEDED', `Cota de agendamentos excedida para a clínica [${clinicId}]: ${count}/${limit}`);
                return { allowed: false, reason: 'quota_exceeded', status, usage: { count, limit } };
            }

            return { allowed: true, reason: 'active', status, plan: clinic.plan_type || 'pro', usage: { count, limit } };
        } catch (err) {
            logger.error('BILLING_CHECK_ERR', `Erro ao verificar assinatura da clínica [${clinicId}]: ${err.message}`);
            return { allowed: true, reason: 'fallback_error' }; // Fail-open para não travar clínicas em oscilação de banco
        }
    }

    async createCheckoutSession(clinicId, planType = 'pro') {
        const plan = PLANS[planType] || PLANS.pro;
        const clinic = await db.clinics.findById(clinicId);
        const clinicName = clinic ? clinic.name : 'Sua Clínica';

        // Simulação / Estrutura de Checkout Integrável (Stripe / Asaas)
        const mockCheckoutUrl = `https://checkout.clinicabot.com.br/subscribe?clinic_id=${clinicId}&plan=${planType}&amount=${plan.priceBrl}`;

        logger.info('BILLING_CHECKOUT_CREATED', `Link de checkout gerado para [${clinicName}] - Plano ${plan.name} (R$ ${plan.priceBrl})`);

        return {
            checkoutUrl: mockCheckoutUrl,
            plan: plan.name,
            amount: plan.priceBrl,
            currency: 'BRL',
            bookingLimit: plan.bookingLimit
        };
    }

    async processWebhookEvent(event) {
        const { type, data } = event;
        logger.info('BILLING_WEBHOOK_RECEIVED', `Webhook de faturamento recebido: ${type}`);

        switch (type) {
            case 'invoice.payment_succeeded':
            case 'payment_intent.succeeded': {
                const clinicId = data.object?.metadata?.clinic_id || data.clinic_id;
                const planType = data.object?.metadata?.plan_type || data.plan_type || 'pro';
                const amount = (data.object?.amount_paid ? data.object.amount_paid / 100 : data.amount) || PLANS[planType].priceBrl;

                if (clinicId) {
                    await safeUpdateClinicStatus(clinicId, 'active', planType, PLANS[planType]?.bookingLimit || 1000);

                    try {
                        await db.supabase.from('saas_subscriptions').insert({
                            clinic_id: clinicId,
                            stripe_invoice_id: data.object?.id || `inv_${Date.now()}`,
                            amount: amount,
                            status: 'paid',
                            plan_type: planType,
                            billing_period_start: new Date().toISOString()
                        });
                    } catch {}

                    logger.info('BILLING_PAYMENT_SUCCESS', `Pagamento confirmado para clínica [${clinicId}]. Status atualizado para ACTIVE.`);
                }
                break;
            }

            case 'invoice.payment_failed': {
                const clinicId = data.object?.metadata?.clinic_id || data.clinic_id;
                if (clinicId) {
                    await safeUpdateClinicStatus(clinicId, 'past_due');
                    logger.warn('BILLING_PAYMENT_FAILED', `Falha no pagamento da clínica [${clinicId}]. Status alterado para PAST_DUE.`);
                }
                break;
            }

            case 'customer.subscription.deleted':
            case 'subscription.canceled': {
                const clinicId = data.object?.metadata?.clinic_id || data.clinic_id;
                if (clinicId) {
                    await safeUpdateClinicStatus(clinicId, 'suspended');
                    logger.warn('BILLING_SUSPENDED', `Assinatura cancelada/suspensa para clínica [${clinicId}]. Status alterado para SUSPENDED.`);
                }
                break;
            }

            default:
                logger.info('BILLING_WEBHOOK_IGNORED', `Tipo de evento não processado: ${type}`);
        }

        return { status: 'processed', eventType: type };
    }

    async incrementMonthlyBooking(clinicId) {
        if (!clinicId) return;
        try {
            const clinic = await db.clinics.findById(clinicId);
            if (clinic) {
                const newCount = (clinic.monthly_booking_count || 0) + 1;
                await db.supabase.from('clinics').update({ monthly_booking_count: newCount }).eq('id', clinicId);
            }
        } catch (err) {
            logger.error('BILLING_INCREMENT_ERR', `Erro ao incrementar cota mensal [${clinicId}]: ${err.message}`);
        }
    }
}

module.exports = new BillingService();
