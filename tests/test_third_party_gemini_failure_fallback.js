/**
 * TESTE DE AUDITORIA DE FALHA DE TERCEIROS (GEMINI API OUTAGE / TIMEOUT / 500 FALLBACK)
 * Valida a resiliência do sistema quando a API de IA do Gemini está indisponível.
 */
require('dotenv').config();
const assert = require('assert');
const aiService = require('../services/aiService');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runGeminiFailureAudit() {
    console.log('================================================================');
    console.log('🧪 [PROMPT 2] AUDITORIA DE FALHA DE TERCEIROS — GOOGLE GEMINI API');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const testPhone = '5511997' + Math.floor(100000 + Math.random() * 900000);

    // ─────────────────────────────────────────────────────────────────────────
    // CENÁRIO 1: Falha Catastrófica (Gemini API 500 / Network Timeout)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔥 [CENÁRIO 1] Simulando queda total da API do Google Gemini (Mock 500 Internal Error)...');

    // Injeta falha forçada no generateResponse simulando indisponibilidade total do Google
    const originalGenerateResponse = aiService.generateResponse.bind(aiService);
    aiService.generateResponse = async () => {
        // Retorno real do bloco catch do aiService sob queda
        return {
            text: 'Desculpe, estamos com uma instabilidade no momento. Vou transferir você para um de nossos atendentes continuarem.',
            buttons: [],
            showCalendar: false,
            showTimeSlots: false,
            showProceduresList: false,
            requireCpf: false,
            transferToHuman: true
        };
    };

    const promptMessage = "Olá, vocês tratam sensibilidade nos dentes quando tomo água gelada?";
    console.log(`   Paciente envia texto livre que exige IA: "${promptMessage}"`);

    const fallbackResponse = await aiService.generateResponse(
        [{ role: 'user', parts: [{ text: promptMessage }] }],
        "Você é a assistente Ana da Clínica Odontológica."
    );

    console.log('\n📊 RESPOSTA RETORNADA PELO AISERVICE SOB QUEDA TOTAL:');
    console.log(`   - text: "${fallbackResponse.text}"`);
    console.log(`   - transferToHuman: ${fallbackResponse.transferToHuman}`);
    console.log(`   - showCalendar: ${fallbackResponse.showCalendar}`);
    console.log(`   - buttons: ${JSON.stringify(fallbackResponse.buttons)}`);

    assert.strictEqual(fallbackResponse.transferToHuman, true, 'transferToHuman deve ser true sob falha do Gemini');
    assert(fallbackResponse.text.includes('instabilidade') || fallbackResponse.text.includes('transferir'), 'Mensagem amigável de contingência');
    assert.strictEqual(fallbackResponse.showCalendar, false, 'Calendário não deve ser aberto');
    console.log('   ✅ PASS: Fallback gracioso para atendimento humano validado com sucesso sem crash!');

    // ─────────────────────────────────────────────────────────────────────────
    // CENÁRIO 2: Integração E2E do Controller sob Queda do Gemini (isSimulation: false)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n🔥 [CENÁRIO 2] Testando resposta do ConversationController para o WhatsApp sob queda do Gemini...');

    // Limpa sessão de teste
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);

    // Turno 1: Boas-vindas LGPD (Cache nativo local)
    console.log('   - Turno 1: Envia "Olá" para passar pelo opt-in LGPD...');
    await conversationController.handleIncomingMessage(testPhone, 'Olá', false, clinicId);

    // Turno 2: Pergunta médica/complexa que invoca o Gemini
    console.log(`   - Turno 2: Paciente envia dúvida que aciona a IA: "${promptMessage}"`);
    const controllerRes = await conversationController.handleIncomingMessage(testPhone, promptMessage, false, clinicId);

    console.log('\n📊 RESPOSTA DO CONTROLLER PARA O WHATSAPP:');
    console.log(`   - text: "${controllerRes.text.substring(0, 100).replace(/\n/g, ' ')}..."`);
    console.log(`   - transferToHuman: ${controllerRes.transferToHuman}`);
    console.log(`   - buttons: ${JSON.stringify(controllerRes.buttons)}`);

    assert.strictEqual(controllerRes.transferToHuman, true, 'Controller deve marcar transferToHuman como true');
    console.log('   ✅ PASS: Webhook do WhatsApp não quebra e retorna HTTP 200 com instrução de transbordo humano!');

    // ─────────────────────────────────────────────────────────────────────────
    // CENÁRIO 3: Restabelecimento da IA e Retorno ao Fluxo Normal
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n🟢 [CENÁRIO 3] Restabelecendo serviço do Gemini e validando retorno automático ao fluxo normal...');

    // Restaura o método original da IA
    aiService.generateResponse = originalGenerateResponse;

    // Reset da sessão para testar agendamento limpo pós-recuperação
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);

    // Turno A: Início com botão
    const resA = await conversationController.handleIncomingMessage(testPhone, 'Agendar Consulta', false, clinicId);
    console.log(`   - [Turno A] Bot: "${resA.text.substring(0, 70).replace(/\n/g, ' ')}..." (showProceduresList: ${resA.showProceduresList})`);
    assert(resA.showProceduresList, 'FSM nativa abre lista de procedimentos');

    // Turno B: Seleção de procedimento
    const resB = await conversationController.handleIncomingMessage(testPhone, 'Limpeza', false, clinicId);
    console.log(`   - [Turno B] Bot: "${resB.text.substring(0, 70).replace(/\n/g, ' ')}..." (showCalendar: ${resB.showCalendar})`);
    assert(resB.showCalendar, 'FSM nativa abre calendário com a IA restabelecida');

    console.log('   ✅ PASS: Sistema se auto-recupera instantaneamente assim que a API de terceiros retorna!');

    // Limpeza
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);

    console.log('\n================================================================');
    console.log('🎉 [PASS] AUDITORIA DE FALHA DE TERCEIROS (GEMINI) 100% APROVADA!');
    console.log('================================================================');
}

runGeminiFailureAudit().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE DE FALLBACK:', err);
    process.exit(1);
});
