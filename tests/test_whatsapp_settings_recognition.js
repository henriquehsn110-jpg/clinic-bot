/**
 * TEST: Reconhecimento de Todos os Campos de Configuração da Clínica pela IA do WhatsApp
 * Valida que alteração de personaName, insurances, paymentMethods, emergency, workHours,
 * minCancellationHours e procedures no Dashboard são 100% reconhecidas pela IA e pelo Prompt.
 */
require('dotenv').config();
const db = require('../services/databaseService');
const dashboardController = require('../controllers/dashboardController');
const aiService = require('../services/aiService');
const ConversationController = require('../controllers/conversationController');

async function runTest() {
    console.log('🧪 [TEST_SETTINGS_RECOGNITION] Iniciando Auditoria dos Campos de Configuração...');

    try {
        // 1. Busca a clínica modelo
        const { data: clinicRow, error: cErr } = await db.supabase.from('clinics').select('id, name').eq('slug', 'clinica-modelo').maybeSingle();
        if (cErr || !clinicRow) {
            throw new Error(`Clínica Modelo não encontrada: ${cErr?.message}`);
        }

        const clinicId = clinicRow.id;
        console.log(`📌 Clínica Alvo: ${clinicRow.name} (${clinicId})`);

        // 2. Define valores customizados únicos para o teste
        const testCustomSettings = {
            name: "Clínica Odontológica Teste Pro",
            personaName: "Camila",
            whatsappListTitle: "Menu de Especialidades",
            address: "Av. Faria Lima, 3000 - Conjunto 802, São Paulo/SP",
            phone: "5511979992719",
            evalPrice: "280",
            insurances: "Unimed, Porto Seguro, Bradesco Saúde e Particular Premium",
            paymentMethods: "PIX com 10% desc, Cartão em 12x, Boleto Bancário",
            emergency: "Em caso de emergência ou dor forte ligue 0800-999-888",
            workHours: "Segunda a Sábado, das 07:00 às 20:00",
            minCancellationHours: "6",
            procedures: "Consulta Geral, Clareamento Laser, Facetas de Resina, Prótese Protocolo"
        };

        // 3. Atualiza as configurações via dashboardController.updateSettings
        const mockReq = {
            resolvedClinicId: clinicId,
            isSuperAdmin: true,
            user: { role: 'admin', clinicId: clinicId },
            body: testCustomSettings
        };

        let resData = null;
        const mockRes = {
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                resData = data;
                return this;
            }
        };

        await dashboardController.updateSettings(mockReq, mockRes);
        if (!resData || !resData.success) {
            throw new Error(`Falha ao salvar configurações: ${JSON.stringify(resData)}`);
        }
        console.log('  ✅ PASS: Configurações salvas via dashboardController.updateSettings');

        // 4. Busca os dados brutos no Supabase para garantir que work_hours foi persistido como JSON
        const { data: updatedClinic } = await db.supabase.from('clinics').select('*').eq('id', clinicId).maybeSingle();
        console.log('  🔍 WORK_HOURS no Supabase (tipo):', typeof updatedClinic.work_hours);

        // 5. Executa parseClinicSettings na camada do banco
        const parsed = db.parseClinicSettings(updatedClinic);
        console.log('  🔍 Configurações Parsed:', {
            personaName: parsed.personaName,
            name: parsed.name,
            insurances: parsed.insurances,
            paymentMethods: parsed.paymentMethods,
            emergency: parsed.emergency,
            workHours: parsed.workHours,
            procedures: parsed.procedures,
            evalPrice: parsed.evalPrice,
            minCancellationHours: parsed.minCancellationHours
        });

        // Assertions em cada campo
        if (parsed.personaName !== testCustomSettings.personaName) throw new Error(`personaName divergente: ${parsed.personaName}`);
        if (parsed.insurances !== testCustomSettings.insurances) throw new Error(`insurances divergente: ${parsed.insurances}`);
        if (parsed.paymentMethods !== testCustomSettings.paymentMethods) throw new Error(`paymentMethods divergente: ${parsed.paymentMethods}`);
        if (parsed.emergency !== testCustomSettings.emergency) throw new Error(`emergency divergente: ${parsed.emergency}`);
        if (parsed.workHours !== testCustomSettings.workHours) throw new Error(`workHours divergente: ${parsed.workHours}`);
        if (parsed.procedures !== testCustomSettings.procedures) throw new Error(`procedures divergente: ${parsed.procedures}`);
        if (parsed.evalPrice !== testCustomSettings.evalPrice) throw new Error(`evalPrice divergente: ${parsed.evalPrice}`);
        if (parsed.minCancellationHours !== testCustomSettings.minCancellationHours) throw new Error(`minCancellationHours divergente: ${parsed.minCancellationHours}`);

        console.log('  ✅ PASS: Todos os 8 campos de configuração foram parseados e preservados!');

        // 6. Constrói o System Prompt da IA via aiService.buildCustomPrompt
        const generatedPrompt = aiService.buildCustomPrompt(parsed);

        // Verifica se o prompt gerado injetou TODOS os valores customizados
        const checks = [
            { key: 'Persona (Camila)', text: testCustomSettings.personaName },
            { key: 'Nome da Clínica', text: testCustomSettings.name },
            { key: 'Endereço', text: testCustomSettings.address },
            { key: 'Convênios', text: testCustomSettings.insurances },
            { key: 'Pagamentos', text: testCustomSettings.paymentMethods },
            { key: 'Urgência', text: testCustomSettings.emergency },
            { key: 'Horários', text: testCustomSettings.workHours },
            { key: 'Procedimentos', text: testCustomSettings.procedures },
            { key: 'Preço Avaliação', text: testCustomSettings.evalPrice },
            { key: 'Antecedência Cancelamento', text: testCustomSettings.minCancellationHours }
        ];

        for (const c of checks) {
            if (!generatedPrompt.includes(c.text)) {
                throw new Error(`O System Prompt da IA NÃO contém a configuração customizada de ${c.key}: "${c.text}"`);
            }
            console.log(`  ✅ PASS: System Prompt da IA contém ${c.key}: "${c.text.substring(0, 35)}..."`);
        }

        console.log('================================================================');
        console.log('🎉 TESTE DE RECONHECIMENTO DE CONFIGURAÇÕES WHATSAPP: 100% PASS!');
        console.log('================================================================');
        process.exit(0);

    } catch (err) {
        console.error('❌ ERRO NO TESTE DE CONFIGURAÇÕES:', err.message, err.stack);
        process.exit(1);
    }
}

runTest();
