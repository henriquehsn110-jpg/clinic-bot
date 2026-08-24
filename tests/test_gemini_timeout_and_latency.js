/**
 * TESTE DE TIMEOUT DE APLICAÇÃO & LENTIDÃO DO GOOGLE GEMINI (PROMPT 2 COMPLEMENTO)
 * Valida os dois ramos de proteção contra lentidão:
 * Ramo 1: Modelo A trava -> Timeout corta em 3s -> Failover para Modelo B que responde ao paciente em < 5s.
 * Ramo 2: Todos os modelos travam -> Timeout corta -> Fallback gracioso para atendimento humano em < 7s.
 */
require('dotenv').config();
const assert = require('assert');
const aiService = require('../services/aiService');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

async function runTimeoutAudit() {
    console.log('================================================================');
    console.log('⏱️ [PROMPT 2 — COMPLEMENTO] TESTE DE LENTIDÃO E TIMEOUT DO GEMINI');
    console.log('================================================================\n');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';
    const testPhone = '5511996' + Math.floor(100000 + Math.random() * 900000);

    const originalInitModel = aiService.initModel.bind(aiService);
    const originalModel = aiService.model;

    aiService.TIMEOUT_MS = 3000;
    console.log(`[Configuração] Timeout de Aplicação configurado para: ${aiService.TIMEOUT_MS}ms por tentativa`);

    // ─────────────────────────────────────────────────────────────────────────
    // RAMO 1: Failover Automático com Auto-Recuperação
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n🟢 [RAMO 1] Modelo primário sofre lentidão de 60s -> Timeout corta -> Alterna para modelo funcional...');

    // Apenas a 1ª chamada trava; a 2ª chamada responde imediatamente
    let callCount = 0;
    const createBranch1Model = () => ({
        startChat: () => ({
            sendMessage: async () => {
                callCount++;
                if (callCount === 1) {
                    console.log('   ⏳ [MOCK MODELO 1] Travamento de socket de 60 segundos...');
                    await new Promise(resolve => setTimeout(resolve, 60000));
                }
                console.log('   ⚡ [MOCK MODELO 2] Modelo de failover respondendo com sucesso em 10ms...');
                return {
                    response: {
                        text: () => JSON.stringify({
                            text: 'A consulta de avaliação custa R$ 150,00.',
                            buttons: ['Agendar Consulta', 'Outras Dúvidas'],
                            showCalendar: false,
                            showTimeSlots: false,
                            showProceduresList: false,
                            requireCpf: false,
                            transferToHuman: false,
                            requireDescription: false
                        })
                    }
                };
            }
        })
    });

    aiService.model = createBranch1Model();
    aiService.initModel = () => {
        aiService.model = createBranch1Model();
    };

    // Limpa sessão
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone, null, clinicId);
    await conversationController.handleIncomingMessage(testPhone, 'Olá', false, clinicId);

    const startRamo1 = Date.now();
    const resRamo1 = await conversationController.handleIncomingMessage(
        testPhone,
        'Qual o valor da consulta?',
        false,
        clinicId
    );
    const elapsedRamo1 = Date.now() - startRamo1;

    console.log(`\n⏱️ TEMPO TOTAL DO RAMO 1: ${elapsedRamo1}ms`);
    console.log(`📊 RESPOSTA RECEBIDA PELO PACIENTE:`);
    console.log(`   - text: "${resRamo1.text}"`);
    console.log(`   - buttons: ${JSON.stringify(resRamo1.buttons)}`);

    assert(elapsedRamo1 >= 2900 && elapsedRamo1 < 6000, `Ramo 1 deve cortar em ~3s e responder na 2ª tentativa em < 6s (obtido: ${elapsedRamo1}ms)`);
    assert(resRamo1.text.includes('150,00'), 'Paciente recebeu resposta com sucesso após failover');
    console.log('   ✅ PASS: Ramo 1 validado! Timeout cortou o travamento e o failover respondeu com sucesso!');

    // ─────────────────────────────────────────────────────────────────────────
    // RAMO 2: Queda Catastrófica / Lentidão Persistente em Todos os Modelos
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n🔥 [RAMO 2] Todos os modelos sofrem lentidão de 60s -> Timeout corta -> Fallback Humano Gracioso...');

    const testPhone2 = '5511995' + Math.floor(100000 + Math.random() * 900000);

    // Mock onde todos os modelos travam indefinidamente
    const createHangingModel = () => ({
        startChat: () => ({
            sendMessage: async () => {
                console.log('   ⏳ [MOCK GEMINI PERSISTENTE] Travamento de socket de 60 segundos...');
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        })
    });

    aiService.model = createHangingModel();
    aiService.initModel = () => {
        aiService.model = createHangingModel();
    };

    await db.sessions.set(testPhone2, [], clinicId);
    await db.sessions.setDraft(testPhone2, null, clinicId);
    await conversationController.handleIncomingMessage(testPhone2, 'Olá', false, clinicId);

    const startRamo2 = Date.now();
    const resRamo2 = await conversationController.handleIncomingMessage(
        testPhone2,
        'Vocês atendem Unimed?',
        false,
        clinicId
    );
    const elapsedRamo2 = Date.now() - startRamo2;

    console.log(`\n⏱️ TEMPO TOTAL DO RAMO 2 ATÉ O FALLBACK HUMANO: ${elapsedRamo2}ms`);
    console.log(`📊 RESPOSTA DE CONTINGÊNCIA RECEBIDA PELO PACIENTE:`);
    console.log(`   - text: "${resRamo2.text}"`);
    console.log(`   - transferToHuman: ${resRamo2.transferToHuman}`);
    console.log(`   - buttons: ${JSON.stringify(resRamo2.buttons)}`);

    assert(elapsedRamo2 >= 5800 && elapsedRamo2 < 9000, `Ramo 2 deve cortar 2 tentativas de 3s e transferir em < 9s (obtido: ${elapsedRamo2}ms)`);
    assert.strictEqual(resRamo2.transferToHuman, true, 'Deve transferir para atendente humano sob lentidão persistente');
    assert(resRamo2.text.includes('instabilidade') || resRamo2.text.includes('transferir'), 'Mensagem amigável');
    console.log('   ✅ PASS: Ramo 2 validado! Paciente transferido com segurança e sem travar o WhatsApp!');

    // Restaura métodos originais
    aiService.initModel = originalInitModel;
    aiService.model = originalModel;
    aiService.TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS) || 6500;

    // Limpeza
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);
    await db.sessions.setDraft(testPhone2, null, clinicId);
    await db.sessions.set(testPhone2, [], clinicId);

    console.log('\n================================================================');
    console.log('🎉 [PASS] AUDITORIA DE LENTIDÃO, TIMEOUT E FAILOVER 100% APROVADA!');
    console.log('================================================================');
}

runTimeoutAudit().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE DE TIMEOUT:', err);
    process.exit(1);
});
