// ==============================================================================
// 🧪 SUÍTE DE TESTE DA CAMADA COMERCIAL SAAS & COMPLIANCE LGPD
// Testes unitários e de integração para Billing, Cotas, LGPD Art. 18 e BI SuperAdmin
// ==============================================================================

require('dotenv').config();
const assert = require('assert');
const billingService = require('../services/billingService');
const dashboardController = require('../controllers/dashboardController');
const db = require('../services/databaseService');

async function runSaaSCommercialTests() {
    console.log('\n================================================================');
    console.log('🚀 INICIANDO VALIDAÇÃO DA CAMADA COMERCIAL SAAS & COMPLIANCE');
    console.log('================================================================\n');

    let totalPassed = 0;

    // TESTE 1: Planos e Cotas de Assinatura
    console.log('📌 1. Testando Estrutura de Planos e Cotas...');
    const plans = billingService.getPlans();
    assert(plans.basic && plans.pro && plans.enterprise, 'Deve conter os planos Basic, Pro e Enterprise');
    assert.strictEqual(plans.pro.bookingLimit, 1000, 'Plano Pro deve limitar em 1000 agendamentos/mês');
    console.log('  ✅ [PASS] Planos Basic, Pro e Enterprise configurados corretamente.');
    totalPassed++;

    // TESTE 2: Verificação de Acesso de Clínica Ativa vs Suspensa
    console.log('\n📌 2. Testando Bloqueio de Clínica Suspensa por Inadimplência...');
    
    // Busca id da clinica-modelo existente para garantir chave válida no Supabase
    let modelClinic = await db.clinics.findBySlug('clinica-modelo');
    if (!modelClinic) {
        const ins = await db.supabase.from('clinics').insert({ name: 'Clínica Modelo', slug: 'clinica-modelo' }).select().single();
        modelClinic = ins.data;
    }
    const mockClinicId = modelClinic.id;

    // Atualiza status para active
    await db.supabase.from('clinics').update({
        subscription_status: 'active',
        plan_type: 'pro',
        monthly_booking_limit: 1000,
        monthly_booking_count: 5
    }).eq('id', mockClinicId);

    const activeAccess = await billingService.checkClinicAccess(mockClinicId);
    assert.strictEqual(activeAccess.allowed, true, 'Clínica ativa deve ter acesso permitido');
    console.log('  ✅ [PASS] Clínica com status ACTIVE tem acesso liberado.');
    totalPassed++;

    // Simula alteração para SUSPENDED via Webhook de Falha de Pagamento
    await billingService.processWebhookEvent({
        type: 'customer.subscription.deleted',
        data: { object: { metadata: { clinic_id: mockClinicId } } }
    });

    const suspendedAccess = await billingService.checkClinicAccess(mockClinicId);
    assert.strictEqual(suspendedAccess.allowed, false, 'Clínica suspensa deve ter acesso bloqueado');
    assert.strictEqual(suspendedAccess.reason, 'suspended', 'Motivo do bloqueio deve ser suspended');
    console.log('  ✅ [PASS] Webhook de cancelamento suspende a clínica e bloqueia acesso do robô.');
    totalPassed++;

    // Reativa a clínica para os próximos testes
    await billingService.processWebhookEvent({
        type: 'invoice.payment_succeeded',
        data: { object: { metadata: { clinic_id: mockClinicId, plan_type: 'pro' }, amount_paid: 39900 } }
    });

    const reactivatedAccess = await billingService.checkClinicAccess(mockClinicId);
    assert.strictEqual(reactivatedAccess.allowed, true, 'Clínica reativada deve ter acesso liberado novamente');
    console.log('  ✅ [PASS] Webhook de pagamento reativa a clínica com sucesso (ACTIVE).');
    totalPassed++;

    // TESTE 3: Anonimização LGPD Art. 18 (Direito ao Esquecimento)
    console.log('\n📌 3. Testando Direito ao Esquecimento LGPD (Art. 18)...');
    const mockPatientPhone = '5511988887777';
    const patient = await db.patients.findOrCreate(mockPatientPhone, mockClinicId);
    await db.patients.updateName(mockPatientPhone, 'Paciente Para Esquecimento', mockClinicId);
    await db.patients.updateCpf(mockPatientPhone, '111.222.333-44', mockClinicId);

    const mockReq = {
        params: { id: patient.id },
        resolvedClinicId: mockClinicId,
        isSuperAdmin: false,
        user: { email: 'dpo@clinicamodelo.com.br', role: 'admin' }
    };

    let responseData = null;
    const mockRes = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { responseData = data; return this; }
    };

    await dashboardController.anonymizePatient(mockReq, mockRes);
    assert(responseData && responseData.success === true, 'Anonimização deve retornar sucesso');
    assert(responseData.auditHash, 'Deve gerar hash SHA-256 de auditoria LGPD');

    const { data: anonymizedPatient } = await db.supabase.from('patients').select('*').eq('id', patient.id).single();
    assert.strictEqual(anonymizedPatient.name, 'Paciente Anonimizado (LGPD)', 'Nome deve ser anonimizado');
    assert.strictEqual(anonymizedPatient.cpf, null, 'CPF deve ser removido');
    assert.strictEqual(anonymizedPatient.cpf_hash, null, 'CPF hash deve ser removido');
    console.log(`  ✅ [PASS] Dados do paciente anonimizados com sucesso. Hash de Auditoria: ${responseData.auditHash.substring(0, 16)}...`);
    totalPassed++;

    // TESTE 4: Painel BI SuperAdmin SaaS
    console.log('\n📌 4. Testando Cálculo de Métricas de BI SaaS (MRR, Churn e Clínicas)...');
    const superAdminReq = {
        isSuperAdmin: true,
        user: { role: 'superadmin' }
    };
    let superAdminData = null;
    const superAdminRes = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { superAdminData = data; return this; }
    };

    await dashboardController.getSuperAdminMetrics(superAdminReq, superAdminRes);
    assert(superAdminData && superAdminData.saasMetrics, 'Deve retornar saasMetrics');
    assert(superAdminData.saasMetrics.mrrNumeric >= 0, 'MRR numérico deve ser >= 0');
    console.log(`  ✅ [PASS] Métricas BI calculadas: MRR = ${superAdminData.saasMetrics.mrr}, Total Clínicas = ${superAdminData.saasMetrics.totalClinics}, Churn Rate = ${superAdminData.saasMetrics.churnRatePercent}`);
    totalPassed++;

    // Cleanup & Reset
    await db.supabase.from('clinics').update({ subscription_status: 'active' }).eq('id', mockClinicId);

    console.log('\n================================================================');
    console.log(`📊 RESUMO DA AUDITORIA SAAS: ${totalPassed}/${totalPassed} TESTES APROVADOS (100% PASS)`);
    console.log('================================================================\n');
}

runSaaSCommercialTests().catch(err => {
    console.error('❌ ERRO NO TESTE SAAS BILLING:', err);
    process.exit(1);
});
