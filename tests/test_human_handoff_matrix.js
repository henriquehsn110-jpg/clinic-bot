/**
 * TESTE DE MATRIZ COMPLETA DE HANDOFF HUMANO & EVITAÇÃO DE FALSOS POSITIVOS
 * Testa 8 variações de entrada (frases afirmativas, variações sem artigos,
 * erros de digitação, negações e agendamentos normais).
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');
const assert = require('assert');

const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

const testCases = [
    {
        id: 'TC1',
        text: 'Quero falar com uma atendente humana por favor',
        expectedHandoff: true,
        description: 'Frase Afirmativa Completa com Artigo Feminino ("uma atendente humana")'
    },
    {
        id: 'TC2',
        text: 'falar com humano',
        expectedHandoff: true,
        description: 'Variação Sem Artigo ("falar com humano")'
    },
    {
        id: 'TC3',
        text: 'atendimento humano',
        expectedHandoff: true,
        description: 'Termo Isolado de Handoff ("atendimento humano")'
    },
    {
        id: 'TC4',
        text: 'preciso falar com a secretária',
        expectedHandoff: true,
        description: 'Variação com Cargo ("falar com a secretária")'
    },
    {
        id: 'TC5',
        text: 'kero falar com atendete',
        expectedHandoff: true,
        description: 'Variação com Erros de Digitação ("atendete")'
    },
    {
        id: 'TC6',
        text: 'não quero falar com atendente humana, prefiro usar o robô',
        expectedHandoff: false,
        description: 'Negação Explícita ("não quero falar com atendente") — EVITAÇÃO DE FALSO POSITIVO'
    },
    {
        id: 'TC7',
        text: 'Quero agendar uma limpeza para amanhã',
        expectedHandoff: false,
        description: 'Fluxo Normal de Agendamento — EVITAÇÃO DE FALSO POSITIVO'
    },
    {
        id: 'TC8',
        text: 'Outras dúvidas',
        expectedHandoff: false,
        description: 'Opção de Menu Genérica — EVITAÇÃO DE FALSO POSITIVO'
    }
];

async function runHumanHandoffMatrixTest() {
    console.log('================================================================');
    console.log('🧪 TESTE DE MATRIZ DE VALIDAÇÃO DE HANDOFF HUMANO & REGEX');
    console.log('================================================================\n');

    let passedCount = 0;

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const phone = `551197000000${i + 1}`;

        // Resetar sessão no banco
        await db.sessions.set(phone, [], clinicId).catch(() => {});
        await db.sessions.setDraft(phone, null, clinicId).catch(() => {});

        const res = await conversationController.handleIncomingMessage({
            phone,
            messageText: tc.text,
            phoneNumberId: '5511979992719',
            isSimulation: true
        });

        const actualHandoff = !!res.transferToHuman;
        const isSuccess = actualHandoff === tc.expectedHandoff;

        if (isSuccess) passedCount++;

        console.log(`[${tc.id}] ${tc.description}`);
        console.log(`   Entrada: "${tc.text}"`);
        console.log(`   Esperado Handoff: ${tc.expectedHandoff} | Obtido: ${actualHandoff}`);
        console.log(`   Resultado: ${isSuccess ? '🟢 PASS' : '❌ FAIL'}\n`);

        assert.strictEqual(actualHandoff, tc.expectedHandoff, `Falha no ${tc.id}: "${tc.text}" esperava transferToHuman=${tc.expectedHandoff}`);
    }

    console.log('================================================================');
    console.log(`📊 RESULTADO DA MATRIZ DE HANDOFF HUMANO: ${passedCount}/${testCases.length} PASS`);
    console.log('================================================================\n');
}

runHumanHandoffMatrixTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO NA MATRIZ DE HANDOFF:', err);
    process.exit(1);
});
