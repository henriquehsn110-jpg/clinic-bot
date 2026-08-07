/**
 * TESTE AVANÇADO DE CONCORRÊNCIA E SIMULAÇÃO MULTI-PERSONA (FUZZING STRESS TEST)
 * Executa 10 interações paralelas simultâneas com perfis e intenções aleatórias/adversariais.
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');
const assert = require('assert');

const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

const personas = [
    {
        id: 'P1_DIRECT_BOOKING',
        phone: '5511911110001',
        description: 'Agendamento Direto com Especificação Completa',
        messages: ['Quero agendar uma limpeza para terça-feira às 14:00']
    },
    {
        id: 'P2_PRICE_INQUIRY',
        phone: '5511911110002',
        description: 'Dúvida de Preço de Implante (Regra CFO)',
        messages: ['Quanto custa exatamente um implante dentário completo com a prótese?']
    },
    {
        id: 'P3_FAMILY_BOOKING',
        phone: '5511911110003',
        description: 'Agendamento Familiar com CPF Válido na 1ª Mensagem',
        messages: [
            'Quero agendar pro meu filho, o CPF dele é 529.982.247-25.',
            'Gabriel Souza',
            '11/08/2026'
        ]
    },
    {
        id: 'P4_GREETING_CHAOS',
        phone: '5511911110004',
        description: 'Saudações Consecutivas e Transição para Consulta',
        messages: ['Boa noite', 'Tudo bem com você?', 'Quero marcar uma avaliação']
    },
    {
        id: 'P5_OFF_TOPIC',
        phone: '5511911110005',
        description: 'Pedido Fora de Escopo (Brincadeira / Sorvete)',
        messages: ['Vocês vendem sorvete de chocolate ou açaí com granola?']
    },
    {
        id: 'P6_RESCHEDULE',
        phone: '5511911110006',
        description: 'Solicitação de Remarcar Consulta',
        messages: ['Preciso remarcar minha consulta de canal']
    },
    {
        id: 'P7_HUMAN_HANDOFF',
        phone: '5511911110007',
        description: 'Solicitação Explícita de Atendimento Humano',
        messages: ['Quero falar com uma atendente humana por favor']
    },
    {
        id: 'P8_SLANG_TYPOS',
        phone: '5511911110008',
        description: 'Mensagem com Gírias e Erros de Digitação',
        messages: ['ae dra kero marcar um clareamento amanha a tarde blz?']
    },
    {
        id: 'P9_DOCTOR_PREFERENCE',
        phone: '5511911110009',
        description: 'Agendamento com Escolha Específica de Médico',
        messages: ['Gostaria de agendar um tratamento de canal com o Dr. Roberto Alves']
    },
    {
        id: 'P10_EMERGENCY_PAIN',
        phone: '5511911110010',
        description: 'Sintoma de Dor e Urgência Odontológica',
        messages: ['Estou com muita dor de dente insuportável, meu dente quebrou']
    }
];

async function runAdvancedConcurrentFuzzing() {
    console.log('================================================================');
    console.log('⚡ SIMULAÇÃO AVANÇADA DE INTERAÇÕES CONCORRENTES MULTI-PERSONA');
    console.log('================================================================\n');

    // 1. Limpeza prévia de sessões de teste
    for (const p of personas) {
        await db.sessions.set(p.phone, [], clinicId).catch(() => {});
        await db.sessions.setDraft(p.phone, null, clinicId).catch(() => {});
    }

    const startTime = Date.now();

    // 2. Disparo simultâneo (Promise.all) da primeira onda de mensagens das 10 personas
    console.log('🚀 Disparando 10 requisições simultâneas em paralelo (Onda 1)...');
    
    const wave1Promises = personas.map(p => {
        const msg = p.messages[0];
        const t0 = Date.now();
        return conversationController.handleIncomingMessage({
            phone: p.phone,
            messageText: msg,
            phoneNumberId: '5511979992719',
            isSimulation: true
        }).then(res => ({
            persona: p,
            turn: 1,
            input: msg,
            output: res,
            latencyMs: Date.now() - t0,
            status: 'SUCCESS'
        })).catch(err => ({
            persona: p,
            turn: 1,
            input: msg,
            error: err.message,
            latencyMs: Date.now() - t0,
            status: 'ERROR'
        }));
    });

    const wave1Results = await Promise.all(wave1Promises);
    const totalWave1Time = Date.now() - startTime;

    console.log(`\n✅ Onda 1 concluída em ${totalWave1Time} ms!\n`);

    // 3. Processar Segunda e Terceira Ondas para Personas Multi-Turno (P3, P4)
    console.log('🚀 Disparando mensagens de acompanhamento para personas multi-turno (Onda 2 & 3)...');
    const multiTurnResults = [];

    for (const p of personas.filter(p => p.messages.length > 1)) {
        for (let mIdx = 1; mIdx < p.messages.length; mIdx++) {
            const msg = p.messages[mIdx];
            const t0 = Date.now();
            try {
                const res = await conversationController.handleIncomingMessage({
                    phone: p.phone,
                    messageText: msg,
                    phoneNumberId: '5511979992719',
                    isSimulation: true
                });
                multiTurnResults.push({
                    persona: p,
                    turn: mIdx + 1,
                    input: msg,
                    output: res,
                    latencyMs: Date.now() - t0,
                    status: 'SUCCESS'
                });
            } catch (err) {
                multiTurnResults.push({
                    persona: p,
                    turn: mIdx + 1,
                    input: msg,
                    error: err.message,
                    latencyMs: Date.now() - t0,
                    status: 'ERROR'
                });
            }
        }
    }

    // 4. Consolidação do Relatório do Teste
    console.log('\n================================================================');
    console.log('📊 RELATÓRIO INDIVIDUAL DE DESEMPENHO DAS PERSONAS');
    console.log('================================================================');

    let totalCalls = wave1Results.length + multiTurnResults.length;
    let successCount = 0;
    let totalLatency = 0;

    const allResults = [...wave1Results, ...multiTurnResults];

    allResults.forEach(r => {
        if (r.status === 'SUCCESS') successCount++;
        totalLatency += r.latencyMs;

        console.log(`\n[${r.persona.id}] Turno ${r.turn} — ${r.persona.description}`);
        console.log(`   Input: "${r.input}"`);
        if (r.status === 'SUCCESS') {
            console.log(`   Latência: ${r.latencyMs} ms`);
            console.log(`   Resposta Ana: "${r.output.text ? r.output.text.substring(0, 110) : ''}..."`);
            console.log(`   Flags Renders: Calendário=${r.output.showCalendar}, Horários=${r.output.showTimeSlots}, CPF=${r.output.requireCpf}, Transbordo=${r.output.transferToHuman}`);
            console.log(`   Botões: ${JSON.stringify(r.output.buttons || [])}`);
        } else {
            console.log(`   ❌ ERRO (${r.latencyMs} ms): ${r.error}`);
        }
    });

    const avgLatency = (totalLatency / totalCalls).toFixed(1);

    console.log('\n================================================================');
    console.log('📈 MÉTRICAS DE CARGA E CONCORRÊNCIA');
    console.log('================================================================');
    console.log(`   Total de Requisições:       ${totalCalls}`);
    console.log(`   Sucessos (Sem Erro):         ${successCount} (${((successCount / totalCalls) * 100).toFixed(1)}%)`);
    console.log(`   Falhas:                      ${totalCalls - successCount}`);
    console.log(`   Tempo da Onda Simultânea:    ${totalWave1Time} ms`);
    console.log(`   Latência Média por Chamada:  ${avgLatency} ms`);
    console.log('================================================================\n');

    // 5. Assertivas de Qualidade
    assert.strictEqual(successCount, totalCalls, 'FALHA: Todas as requisições concorrentes deveriam ter respondido com sucesso!');

    // P2: Dúvida de preço NUNCA ativa calendário
    const p2Res = wave1Results.find(r => r.persona.id === 'P2_PRICE_INQUIRY').output;
    assert.strictEqual(p2Res.showCalendar, false, 'FALHA [P2]: Dúvida de preço não deve abrir calendário');

    // P3: Agendamento familiar intercepta nome no turno 1 e reaproveita CPF no turno 2
    const p3Turn1 = wave1Results.find(r => r.persona.id === 'P3_FAMILY_BOOKING').output;
    assert.strictEqual(p3Turn1.showCalendar, false, 'FALHA [P3]: Gate de nome deve interceptar antes de abrir calendário');

    // P7: Transbordo humano explícito ativa transferToHuman
    const p7Res = wave1Results.find(r => r.persona.id === 'P7_HUMAN_HANDOFF').output;
    assert.strictEqual(p7Res.transferToHuman, true, 'FALHA [P7]: Pedido de humano deve ativar transferToHuman');

    console.log('🎉 TODAS AS VALIDAÇÕES DE CONCORRÊNCIA E REGRAS DE NEGÓCIO PASSARAM!');
    process.exit(0);
}

runAdvancedConcurrentFuzzing().catch(err => {
    console.error('❌ ERRO NO TESTE DE CONCORRÊNCIA:', err);
    process.exit(1);
});
