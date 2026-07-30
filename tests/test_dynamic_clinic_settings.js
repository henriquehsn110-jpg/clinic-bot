/**
 * Teste de Integração Automatizado — Personalização Dinâmica em Tempo Real da Clínica & IA
 * 
 * Valida:
 * 1. Salvamento de configurações no banco de dados.
 * 2. Recuperação transparente das configurações da clínica.
 * 3. Injeção dinâmica no Gemini AI (nova Persona, novos valores, convênios e procedimentos).
 */

require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const aiService = require('../services/aiService');
const db = require('../services/databaseService');

async function runDynamicSettingsTest() {
    console.log(`================================================================`);
    console.log(`🧪 TESTE DE INTEGRAÇÃO — PERSONALIZAÇÃO DINÂMICA DA IA DA CLÍNICA`);
    console.log(`================================================================\n`);

    const testPhone = '5511988889999';
    let defaultClinic = await db.clinics.findBySlug('clinica-modelo');
    if (!defaultClinic) {
        const clinics = await db.clinics.getAll();
        defaultClinic = clinics[0];
    }
    const clinicId = defaultClinic.id;

    // 1. Grava novas configurações personalizadas no Supabase
    const customSettings = {
        name: "Clínica Odonto Elite",
        personaName: "Dra. Sofia",
        address: "Av. Faria Lima, 2000 - São Paulo/SP",
        phone: "5511988889999",
        evalPrice: "280",
        insurances: "Unimed Odonto, Porto Seguro, Bradesco Dental",
        paymentMethods: "PIX com 10% de desconto, Cartão em 12x",
        emergency: "Em caso de dor intensa, procure nosso pronto-socorro 24h",
        workHours: "Segunda a Sábado, das 07:00 às 20:00",
        minCancellationHours: "12",
        procedures: "Consulta Geral, Invisalign, Harmonização Facial, Implantes"
    };

    console.log(`🔹 [Passo 1/3] Salvando novas configurações personalizadas no Supabase...`);
    await db.supabase.from('clinics').update({
        name: customSettings.name,
        address: customSettings.address,
        eval_price: 280,
        work_hours: JSON.stringify(customSettings)
    }).eq('id', clinicId);
    console.log(`  ✅ Configurações salvas para a clínica: "${customSettings.name}"`);

    // 2. Verifica se a busca no Supabase retorna o objeto settings completo
    console.log(`\n🔹 [Passo 2/3] Verificando se os dados do Supabase trazem as configurações atualizadas...`);
    const { data: fetchClinic } = await db.supabase.from('clinics').select('name, address, eval_price, work_hours').eq('id', clinicId).single();
    
    let loadedSettings = {};
    if (fetchClinic?.work_hours && fetchClinic.work_hours.startsWith('{')) {
        try { loadedSettings = JSON.parse(fetchClinic.work_hours); } catch {}
    }

    if (loadedSettings.personaName === "Dra. Sofia" && loadedSettings.evalPrice === "280") {
        console.log(`  ✅ PASS: Configurações recuperadas com sucesso! Persona: "${loadedSettings.personaName}", Avaliação: R$ ${loadedSettings.evalPrice}`);
    } else {
        console.error(`❌ FAIL: Configurações não foram retornadas corretamente do banco:`, fetchClinic);
        process.exit(1);
    }

    // 3. Valida a interpolação do prompt do Gemini (AI Service)
    console.log(`\n🔹 [Passo 3/3] Validando construção dinâmica do System Prompt da IA...`);
    const prompt = aiService.buildCustomPrompt(loadedSettings);
    
    let checksPassed = 0;
    if (prompt.includes("Dra. Sofia")) { console.log(`  ✅ Persona: "Dra. Sofia" presente no prompt`); checksPassed++; }
    if (prompt.includes("Clínica Odonto Elite")) { console.log(`  ✅ Nome Clínica: "Clínica Odonto Elite" presente no prompt`); checksPassed++; }
    if (prompt.includes("280")) { console.log(`  ✅ Valor Avaliação: "280" presente no prompt`); checksPassed++; }
    if (prompt.includes("Unimed Odonto")) { console.log(`  ✅ Convênio: "Unimed Odonto" presente no prompt`); checksPassed++; }
    if (prompt.includes("Invisalign")) { console.log(`  ✅ Procedimento: "Invisalign" presente no prompt`); checksPassed++; }

    if (checksPassed === 5) {
        console.log(`\n================================================================`);
        console.log(`🎉 TESTE DE PERSONALIZAÇÃO DINÂMICA APROVADO COM 100% DE SUCESSO!`);
        console.log(`================================================================`);
        process.exit(0);
    } else {
        console.error(`❌ FAIL: Nem todas as variáveis foram interpoladas no prompt (${checksPassed}/5).`);
        process.exit(1);
    }
}

runDynamicSettingsTest().catch(err => {
    console.error('Erro na execução do teste de configurações dinâmicas:', err);
    process.exit(1);
});
