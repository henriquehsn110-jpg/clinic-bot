require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const path = require('path');

// Lista real e representativa extraída do DOSSIE_PROSPECCAO_ICP_CLINICABOT.md
const PROSPECTS_ICP = [
    {
        id: 'ICP-001',
        name: 'Clínica Odontológica Arujá',
        city: 'Arujá / Região Metropolitana',
        tier: 'Tier 1 - Alto Potencial',
        currentSystem: 'Cloudia (Robô de Botões 1-5)',
        decisionMaker: 'Dra. Beatriz e Gestor Administrativo',
        objectionExpected: 'Já usamos um robô no WhatsApp e os pacientes reclamam que é chato.',
        competitorTarget: 'Cloudia'
    },
    {
        id: 'ICP-002',
        name: 'OdontoCompany — Unidade Centro Guarulhos',
        city: 'Guarulhos (Centro)',
        tier: 'Tier 1 - Alto Volume / Rede',
        currentSystem: 'Simples Dental / Atendimento Manual',
        decisionMaker: 'Dr. Roberto (Sócio Proprietário)',
        objectionExpected: 'Nosso sistema atual já tem o Copiloto, não queremos pagar por módulo extra.',
        competitorTarget: 'Simples Dental / Clinicorp'
    },
    {
        id: 'ICP-003',
        name: 'Clínica Médica e Especialidades Santana',
        city: 'Santana / Zona Norte SP',
        tier: 'Tier 2 - Policlínica de Convênios',
        currentSystem: 'Feegow Clinic',
        decisionMaker: 'Diretoria Operacional (Sr. Marcos)',
        objectionExpected: 'O chat do nosso ERP cobra por médico, se formos mudar não queremos pagar por cadeira.',
        competitorTarget: 'Feegow Clinic'
    },
    {
        id: 'ICP-004',
        name: 'Instituto de Harmonização Facial Tatuapé (HOF)',
        city: 'Tatuapé / Zona Leste',
        tier: 'Tier 1 - Ticket Altíssimo (Estética/HOF)',
        currentSystem: 'Doctoralia / TuoTempo',
        decisionMaker: 'Dra. Camila (Fundadora)',
        objectionExpected: 'Pagamos muito caro na Doctoralia pelo marketing, queremos autonomia para nossa marca.',
        competitorTarget: 'Doctoralia'
    },
    {
        id: 'ICP-005',
        name: 'Sorridents — Unidade Vila Galvão',
        city: 'Guarulhos (Vila Galvão)',
        tier: 'Tier 2 - Alto Fluxo / Popular',
        currentSystem: 'Atendimento 100% Humano (Secretárias sobrecarregadas)',
        decisionMaker: 'Gerente de Clínica (Ana Paula)',
        objectionExpected: 'O paciente de Guarulhos prefere falar com gente, robô espanta cliente.',
        competitorTarget: 'Atendimento Manual (Sem IA)'
    }
];

// Matriz de Respostas Táticas Anti-Concorrência (Baseado no Battlecard 360°)
const BATTLECARD_RESPONSES = {
    'Cloudia': `Nossa IA Gemini entende áudio e linguagem natural desde o plano básico de R$ 197/mês. Nada de 'digite 1 ou 2'. É uma conversa humanizada sem cobrar add-on caríssimo de IA!`,
    'Simples Dental / Clinicorp': `Nossa precificação é fixa por clínica (R$ 397/mês plano Pro) com dentistas ilimitados. Além disso, a 'Ana' atende 24/7 de forma 100% autônoma, protegendo suas secretárias sem te prender a um único ERP.`,
    'Feegow Clinic': `Na Feegow você paga até R$ 249 por médico/mês. No ClinicaBot você paga por clínica (Tenant único), independente de quantos médicos atenderem. É uma economia imediata de mais de R$ 800/mês para sua clínica!`,
    'Doctoralia': `Focamos no SEU número oficial de WhatsApp com segurança militar (AES-256-GCM e RLS Supabase). Zero fidelidade, zero comissão por paciente e total autonomia da sua marca!`,
    'Atendimento Manual (Sem IA)': `A IA 'Ana' não substitui sua secretária, ela é o escudo da recepção! Ela responde dúvidas às 22h de domingo, filtra curiosos e entrega a agenda pronta na segunda de manhã.`
};

/**
 * Executa a simulação de prospecção (Dry-Run) com logs detalhados
 */
async function runOutboundDryRun(prospects = PROSPECTS_ICP) {
    console.log(`\n🚀 [OUTBOUND_PROSPECTOR] Iniciando Simulação de Cadência Multicanal (Dry-Run)...`);
    console.log(`📊 Alvos Selecionados: ${prospects.length} clínicas ICP em Guarulhos e Região\n`);

    let demosBooked = 0;

    for (const [index, p] of prospects.entries()) {
        console.log(`----------------------------------------------------------------`);
        console.log(`🏢 Lead #${index + 1}: ${p.name}`);
        console.log(`📍 Localização:   ${p.city} | ${p.tier}`);
        console.log(`👤 Tomador:       ${p.decisionMaker}`);
        console.log(`⚙️ Sistema Atual: ${p.currentSystem}`);
        console.log(`----------------------------------------------------------------`);

        // Passo 1: Disparo WhatsApp Outbound (Abordagem Fria Personalizada)
        await sleep(400);
        console.log(`📲 [Passo 1 - WhatsApp Outbound] Disparando mensagem inicial para ${p.decisionMaker}...`);
        console.log(`   💬 "Olá, ${p.decisionMaker.split(' ')[0]}! Aqui é a Ana do ClinicaBot. Notei o excelente trabalho da ${p.name} em ${p.city.split('/')[0]} e gostaria de mostrar como estamos reduzindo 80% das faltas em clínicas da região via Inteligência Artificial no WhatsApp."`);

        // Passo 2: Simulação de Resposta / Objeção do Lead
        await sleep(400);
        console.log(`\n📬 [Passo 2 - Resposta do Lead (Objeção Mapeada)]`);
        console.log(`   🗣️ Cliente: "${p.objectionExpected}"`);

        // Passo 3: Tratamento de Objeção Anti-Concorrência (Battlecard)
        await sleep(500);
        const tacticResponse = BATTLECARD_RESPONSES[p.competitorTarget] || BATTLECARD_RESPONSES['Atendimento Manual (Sem IA)'];
        console.log(`\n🛡️ [Passo 3 - Aplicação do Battlecard Anti-${p.competitorTarget}]`);
        console.log(`   💡 IA/SDR: "Entendo perfeitamente! A grande diferença é que ${tacticResponse} Que tal um teste incondicional de 14 dias em paralelo?"`);

        // Passo 4: Conversão / Agendamento de Demonstração ao Vivo
        await sleep(300);
        console.log(`\n🎯 [Passo 4 - Fechamento e Conversão]`);
        console.log(`   🎉 Cliente: "Interessante, gostei que não tem fidelidade e nem cobrança por dentista. Vamos agendar uma demonstração no simulador amanhã às 14h!"`);
        console.log(`   ✅ STATUS: DEMONSTRAÇÃO AGENDADA (Demo #00${++demosBooked})\n`);
    }

    // Resumo do Dry-Run
    console.log(`================================================================`);
    console.log(`📊 RESUMO EXECUTIVO DA SIMULAÇÃO DE PROSPECÇÃO OUTBOUND`);
    console.log(`================================================================`);
    console.log(`👥 Total de Prospectos Abordados:  ${prospects.length}`);
    console.log(`🎯 Demonstrações Agendadas:       ${demosBooked} (Taxa de Conversão: 100% no Dry-Run)`);
    console.log(`⚔️ Concorrentes Neutralizados:    Cloudia, Doctoralia, Feegow, Simples Dental`);
    console.log(`💼 Próximo Passo:                 Executar abordagem real com o dossiê em Guarulhos!`);
    console.log(`================================================================\n`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { runOutboundDryRun, PROSPECTS_ICP };

if (require.main === module) {
    runOutboundDryRun()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
