require('dotenv').config();
const assert = require('assert');
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

function generateValidCpf(num) {
    const base = String(100000000 + num).padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(base[i]) * (10 - i);
    let d1 = 11 - (sum % 11);
    if (d1 >= 10) d1 = 0;
    sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(base[i]) * (11 - i);
    sum += d1 * 2;
    let d2 = 11 - (sum % 11);
    if (d2 >= 10) d2 = 0;
    return `${base}${d1}${d2}`;
}

async function run20PersonasSimulation() {
    console.log('================================================================');
    console.log('🧪 SIMULAÇÃO DE IMPACTO REAL — 20 PERSONAS DIVERSAS E COMPLEXAS');
    console.log('================================================================');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194'; // Clínica Modelo
    const nowBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const tomorrow = new Date(nowBRT); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(nowBRT); dayAfter.setDate(dayAfter.getDate() + 2);
    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const report = {
        total: 20,
        success: 0,
        warnings: 0,
        failures: 0,
        logs: []
    };

    const scenarios = [
        {
            id: 1,
            name: "Dona Maria (72 anos - Baixa Alfabetização Digital / Estilo Áudio)",
            phone: "5511910000001",
            cpf: generateValidCpf(1),
            steps: [
                "oi minha fia qero marca um dentista pra mim dor de dente danada",
                "Consulta geral",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "10:00",
                generateValidCpf(1),
                "Confirmar"
            ]
        },
        {
            id: 2,
            name: "Seu José (68 anos - Muito Direto / 1 Palavra por Vez)",
            phone: "5511910000002",
            cpf: generateValidCpf(2),
            steps: [
                "consulta",
                "Limpeza",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "14:00",
                generateValidCpf(2),
                "Confirmar"
            ]
        },
        {
            id: 3,
            name: "Lucas (Tech-Savvy / Envia Tudo em 1 Mensagem Só)",
            phone: "5511910000003",
            cpf: generateValidCpf(3),
            steps: [
                `Quero agendar Limpeza para o dia ${fmtDate(dayAfter)} às 15:00 meu nome é Lucas Andrade e CPF ${generateValidCpf(3)}`,
                "Confirmar"
            ]
        },
        {
            id: 4,
            name: "Camila (Mãe Agendando para Filho de 6 Anos - Agendar p/ Outro)",
            phone: "5511910000004",
            cpf: generateValidCpf(4),
            steps: [
                "Agendar p/ Outro",
                "Enzo Gabriel da Silva",
                "Limpeza",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "09:00",
                generateValidCpf(4),
                "Confirmar"
            ]
        },
        {
            id: 5,
            name: "Dr. Roberto (Exigente / Pergunta sobre Convênio Bradesco Saúde)",
            phone: "5511910000005",
            cpf: generateValidCpf(5),
            steps: [
                "Boa tarde. A clínica aceita o plano Bradesco Saúde Top Nacional para procedimento de Implante?",
                "Entendido. Gostaria de agendar uma avaliação particular então.",
                "Implante",
                `Selecionei a data: ${fmtDate(dayAfter)}`,
                "11:00",
                generateValidCpf(5),
                "Confirmar"
            ]
        },
        {
            id: 6,
            name: "Fernanda (Confusa / Muda de Procedimento na Metade do Fluxo)",
            phone: "5511910000006",
            cpf: generateValidCpf(6),
            steps: [
                "Agendar Consulta",
                "Limpeza",
                "Na verdade mudei de ideia, prefiro agendar Clareamento Dental",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "16:00",
                generateValidCpf(6),
                "Confirmar"
            ]
        },
        {
            id: 7,
            name: "Gabriel (Hesitante com LGPD / Recusa dar CPF de Primeira)",
            phone: "5511910000007",
            cpf: generateValidCpf(7),
            steps: [
                "Agendar Consulta",
                "Consulta geral",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "10:00",
                "Não quero dar meu CPF por mensagem no WhatsApp",
                generateValidCpf(7),
                "Confirmar"
            ]
        },
        {
            id: 8,
            name: "Patricia (Com Urgência / Dor Aguda / Pedindo Atendimento Imediato)",
            phone: "5511910000008",
            cpf: generateValidCpf(8),
            steps: [
                "Estou com uma dor de dente insuportável! É emergência, vocês atendem agora?",
                "Sim, preciso de uma consulta geral urgente",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "08:00",
                generateValidCpf(8),
                "Confirmar"
            ]
        },
        {
            id: 9,
            name: "Marcos (Múltiplas Consultas / Quer Cancelar uma Específica)",
            phone: "5511910000009",
            cpf: generateValidCpf(9),
            steps: [
                "Quais consultas eu tenho agendadas?",
                "Quero cancelar",
                "1"
            ]
        },
        {
            id: 10,
            name: "Juliana (Dúvidas Institucionais - Endereço, Estacionamento, Horário)",
            phone: "5511910000010",
            cpf: generateValidCpf(10),
            steps: [
                "Qual é o endereço da clínica e se tem estacionamento no local?",
                "Quais são os horários de funcionamento de vocês?",
                "Obrigada pelas informações!"
            ]
        },
        {
            id: 11,
            name: "Thiago (Reagendamento / Remarcar Consulta)",
            phone: "5511910000011",
            cpf: generateValidCpf(11),
            steps: [
                "Remarcar Consulta",
                "Limpeza",
                `Selecionei a data: ${fmtDate(dayAfter)}`,
                "14:00",
                generateValidCpf(11),
                "Confirmar"
            ]
        },
        {
            id: 12,
            name: "Beatriz (CPF Formatado em Texto Longo com Erros de Espaço)",
            phone: "5511910000012",
            cpf: generateValidCpf(12),
            steps: [
                "Agendar Consulta",
                "Aparelho Ortodôntico",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "15:00",
                `Meu CPF é o ${generateValidCpf(12)} pode confirmar por favor`,
                "Confirmar"
            ]
        },
        {
            id: 13,
            name: "Claudio (Gírias Severas / Erros de Grafia Extremos)",
            phone: "5511910000013",
            cpf: generateValidCpf(13),
            steps: [
                "opa blz mano vow querê um clareamentu p/ semana q vem",
                "Clareamento Dental",
                `Selecionei a data: ${fmtDate(dayAfter)}`,
                "16:00",
                generateValidCpf(13),
                "Confirmar"
            ]
        },
        {
            id: 14,
            name: "Sandra (Perguntando Valores e Formas de Pagamento)",
            phone: "5511910000014",
            cpf: generateValidCpf(14),
            steps: [
                "Quanto custa a consulta e a limpeza? Aceitam cartão de crédito e Pix?",
                "Perfeito! Vou agendar a limpeza.",
                "Limpeza",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "11:00",
                generateValidCpf(14),
                "Confirmar"
            ]
        },
        {
            id: 15,
            name: "Rafael (Solicitando Atendimento Humano Imediato)",
            phone: "5511910000015",
            cpf: generateValidCpf(15),
            steps: [
                "Preciso falar com a secretária da recepção, atendimento humano por favor",
                "Entendido"
            ]
        },
        {
            id: 16,
            name: "Vanessa (Re-envio Rápido / Cliques Múltiplos de Botão)",
            phone: "5511910000016",
            cpf: generateValidCpf(16),
            steps: [
                "Agendar Consulta",
                "Consulta geral",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "10:00",
                generateValidCpf(16),
                "Confirmar",
                "Confirmar"
            ]
        },
        {
            id: 17,
            name: "Eduardo (Preferência por Médico Específico - Dra. Juliana Mendes)",
            phone: "5511910000017",
            cpf: generateValidCpf(17),
            steps: [
                "Gostaria de agendar uma limpeza especificamente com a Dra. Juliana Mendes",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "09:00",
                generateValidCpf(17),
                "Confirmar"
            ]
        },
        {
            id: 18,
            name: "Aline (Interrupção por Pergunta durante Solicitação do Nome)",
            phone: "5511910000018",
            cpf: generateValidCpf(18),
            steps: [
                "Agendar p/ Outro",
                "Vocês trabalham de sábado?",
                "Aline Souza",
                "Consulta geral",
                `Selecionei a data: ${fmtDate(dayAfter)}`,
                "10:00",
                generateValidCpf(18),
                "Confirmar"
            ]
        },
        {
            id: 19,
            name: "Marcelo (Dúvidas sobre Preparo e Jejum para Consulta)",
            phone: "5511910000019",
            cpf: generateValidCpf(19),
            steps: [
                "Preciso ir em jejum ou fazer algum preparo para a limpeza dentária?",
                "Ótimo! Quero agendar então.",
                "Limpeza",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "14:00",
                generateValidCpf(19),
                "Confirmar"
            ]
        },
        {
            id: 20,
            name: "Vanessa Silva (Pergunta de Vagas em Finais de Semana / Fora do Expediente)",
            phone: "5511910000020",
            cpf: generateValidCpf(20),
            steps: [
                "Vocês têm horário livre no domingo à noite tipo 20h?",
                "Ah entendi. Então pode ser na segunda durante o dia.",
                "Consulta geral",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "11:00",
                generateValidCpf(20),
                "Confirmar"
            ]
        }
    ];

    for (const sc of scenarios) {
        console.log(`\n----------------------------------------------------------------`);
        console.log(`👤 Persona #${sc.id}: ${sc.name}`);
        console.log(`----------------------------------------------------------------`);

        // Reset session
        await db.sessions.set(sc.phone, [], clinicId);
        await db.sessions.setDraft(sc.phone, null, clinicId);

        let hasError = false;
        let stepOutputs = [];

        for (let i = 0; i < sc.steps.length; i++) {
            const input = sc.steps[i];
            try {
                const res = await conversationController.handleIncomingMessage(sc.phone, input, true, clinicId);
                stepOutputs.push({ step: i + 1, input, output: res.text, buttons: res.buttons || [] });
                console.log(`  [Passo ${i + 1}] Paciente: "${input}"`);
                console.log(`  [Passo ${i + 1}] Bot: "${res.text.substring(0, 120).replace(/\n/g, ' ')}..."`);
            } catch (err) {
                hasError = true;
                console.error(`  ❌ ERRO no Passo ${i + 1}: ${err.message}`);
                stepOutputs.push({ step: i + 1, input, error: err.message });
            }
        }

        if (hasError) {
            report.failures++;
            report.logs.push({ scenario: sc.name, status: 'FAILED', steps: stepOutputs });
        } else {
            report.success++;
            report.logs.push({ scenario: sc.name, status: 'PASSED', steps: stepOutputs });
        }
    }

    console.log('\n================================================================');
    console.log('📊 RESUMO DA SIMULAÇÃO DAS 20 PERSONAS');
    console.log('================================================================');
    console.log(`  Total de Personas Testadas: ${report.total}`);
    console.log(`  ✅ Personas com Sucesso Total: ${report.success}`);
    console.log(`  ⚠️ Avisos / Ajustes Menores: ${report.warnings}`);
    console.log(`  ❌ Falhas / Erros de Execução: ${report.failures}`);
    console.log('================================================================');
}

run20PersonasSimulation().catch(err => {
    console.error('❌ ERRO NA EXECUÇÃO DA SIMULAÇÃO DE 20 PERSONAS:', err);
    process.exit(1);
});
