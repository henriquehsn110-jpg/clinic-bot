require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const dashboardController = require('../controllers/dashboardController');
const db = require('../services/databaseService');

async function testDynamicPersonaSettings() {
    console.log('\n================================================================');
    console.log('🧪 TESTE DE INTEGRAÇÃO — PERSONALIZAÇÃO DINÂMICA DE IA (BRUNA vs ANA)');
    console.log('================================================================\n');

    const defaultClinic = await db.clinics.findBySlug('clinica-modelo');
    if (!defaultClinic) {
        console.error('❌ ERRO: Clínica "clinica-modelo" não encontrada no BD.');
        process.exit(1);
    }

    const clinicId = defaultClinic.id;

    // Salva o personaName ORIGINAL para restaurar no final do teste
    let originalPersonaName = 'Ana';
    const { data: cRow } = await db.supabase.from('clinics').select('work_hours').eq('id', clinicId).maybeSingle();
    if (cRow?.work_hours && cRow.work_hours.startsWith('{')) {
        try { const parsed = JSON.parse(cRow.work_hours); originalPersonaName = parsed.personaName || 'Ana'; } catch {}
    }
    console.log(`  📋 personaName original salvo para restauração: "${originalPersonaName}"`);
    console.log(`🔹 [Passo 1/4] Alterando Persona da IA para "Bruna" na clínica [${clinicId}]...`);

    // 1. Simula salvamento de configurações via Dashboard (POST /api/dashboard/settings)
    const mockReq = {
        resolvedClinicId: clinicId,
        isSuperAdmin: false,
        body: {
            name: 'Clínica Odonto Riso',
            personaName: 'Bruna',
            whatsappListTitle: 'Tratamentos Odontológicos',
            address: 'Av. Paulista, 1000 - 12º andar, São Paulo/SP',
            phone: '5511972008720',
            evalPrice: '150',
            insurances: 'Bradesco Saúde, Amil Dental, SulAmérica',
            paymentMethods: 'PIX com 5% de desconto, Cartão em 12x',
            emergency: 'Ligar para emergência médica imediata.',
            workHours: 'Segunda a Sexta, 08h às 18h',
            minCancellationHours: '4',
            procedures: 'Consulta Geral, Limpeza, Tratamento de Canal, Implantes, Clareamento Dental'
        }
    };

    let settingsSaved = false;
    const mockRes = {
        json: (data) => {
            if (data.success && data.settings?.personaName === 'Bruna') {
                settingsSaved = true;
            }
        },
        status: (code) => ({
            json: (data) => console.error(`❌ HTTP ${code}:`, data)
        })
    };

    await dashboardController.updateSettings(mockReq, mockRes);

    if (!settingsSaved) {
        console.error('❌ FAIL: Falha ao salvar configurações na API.');
        process.exit(1);
    }
    console.log('  ✅ PASS: Configurações salvas no Supabase (personaName: "Bruna").');

    // 2. Simula requisição GET /api/dashboard/data no Dashboard (recuperação na atualização de página)
    console.log('\n🔹 [Passo 2/4] Testando GET /api/dashboard/data após refresh da página...');
    let getDashboardOk = false;
    const mockResData = {
        json: (data) => {
            if (data.settings && data.settings.personaName === 'Bruna') {
                getDashboardOk = true;
            }
        },
        status: (code) => ({
            json: (data) => console.error(`❌ HTTP ${code}:`, data)
        })
    };

    await dashboardController.getDashboardData({ resolvedClinicId: clinicId, isSuperAdmin: false, query: {} }, mockResData);

    if (!getDashboardOk) {
        console.error('❌ FAIL: GET /api/dashboard/data não retornou personaName: "Bruna" no objeto settings.');
        process.exit(1);
    }
    console.log('  ✅ PASS: GET /api/dashboard/data retornou personaName: "Bruna" com sucesso.');

    // 3. Simula mensagem no WhatsApp perguntando "Como você se chama?"
    console.log('\n🔹 [Passo 3/4] Enviando mensagem no WhatsApp: "Como você se chama?"...');
    const testPhone = '5511999988877';
    
    // Limpa sessão prévia de teste
    await db.sessions.delete(testPhone, clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);

    const response = await conversationController.handleIncomingMessage(
        testPhone,
        'Como você se chama?',
        false,
        clinicId,
        'phone_test'
    );

    console.log(`\n💬 Resposta da IA no WhatsApp:\n"${response.text}"\n`);

    const hasBruna = response.text.toLowerCase().includes('bruna');
    if (!hasBruna) {
        console.error('❌ FAIL: A IA respondeu sem o nome "Bruna". Texto recebido:', response.text);
        process.exit(1);
    }

    console.log('  ✅ PASS: A IA respondeu identificando-se com sucesso como "Bruna"!');

    // 4. Restaura a persona ORIGINAL para não sobrescrever a escolha do usuário
    console.log(`\n🔹 [Passo 4/4] Restaurando persona original "${originalPersonaName}"...`);
    mockReq.body.personaName = originalPersonaName;
    await dashboardController.updateSettings(mockReq, mockRes);
    await db.sessions.delete(testPhone, clinicId);

    console.log('\n================================================================');
    console.log('🎉 TESTE DE PERSONALIZAÇÃO DINÂMICA DA IA 100% APROVADO!');
    console.log('================================================================\n');
}

testDynamicPersonaSettings().catch(err => {
    console.error('❌ Exceção no teste:', err);
    process.exit(1);
});
