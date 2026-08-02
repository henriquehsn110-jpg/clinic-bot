require('dotenv').config();
const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

function generateValidCpf(num) {
    const base = String(200000000 + num).padStart(9, '0');
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

async function runInteractiveProfilesTest() {
    console.log('================================================================');
    console.log('🧪 TESTE DE VALIDAÇÃO DE PERFIS SOLICITADOS PELO USUÁRIO');
    console.log('================================================================');

    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194'; // Clínica Modelo
    const nowBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const tomorrow = new Date(nowBRT); tomorrow.setDate(tomorrow.getDate() + 1);
    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const profiles = [
        {
            category: "🎭 PERFIL BRINCALHÃO / PIADISTA / FLERTE",
            name: "Pedrinho (Quer brincar, fazer piadas e descontrair)",
            phone: "5511988880001",
            steps: [
                "Oi Ana! Você é uma IA de verdade ou uma robô disfarçada? 🤖",
                "Me conta uma piada sobre dentista pra eu perder o medo!",
                "Quer namorar comigo ou tomar um café depois do expediente? 😉",
                "Brincadeiras à parte, quanto custa a limpeza dentária?",
                "Quero agendar uma limpeza então"
            ]
        },
        {
            category: "🌀 PERFIL CAÓTICO / FAZ DE TUDO / MULTI-PERGUNTAS",
            name: "Leticia (Muda de ideia, faz 3 perguntas juntas, duvida da LGPD, pede humano)",
            phone: "5511988880002",
            steps: [
                "Oi! Aceitam Bradesco Saúde? Qual o endereço e se tem vaga hoje?",
                "Quero agendar Clareamento... ah não, mudei de ideia, prefiro Limpeza!",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "14:00",
                "Não quero informar meu CPF agora por WhatsApp, é seguro mesmo?",
                "Tô achando confuso, quero falar com a secretária humana da recepção"
            ]
        },
        {
            category: "📅 PERFIL DIRETO / OBJETIVO / CONSULTA",
            name: "Dr. Carlos (Quer fazer uma consulta rápida e sem rodeios)",
            phone: "5511988880003",
            steps: [
                "Gostaria de agendar uma consulta para amanhã",
                "Consulta geral",
                `Selecionei a data: ${fmtDate(tomorrow)}`,
                "10:00",
                generateValidCpf(99),
                "Confirmar"
            ]
        }
    ];

    for (const profile of profiles) {
        console.log(`\n================================================================`);
        console.log(`📌 Categoria: ${profile.category}`);
        console.log(`👤 Paciente: ${profile.name}`);
        console.log(`================================================================`);

        await db.sessions.set(profile.phone, [], clinicId);
        await db.sessions.setDraft(profile.phone, null, clinicId);

        for (let i = 0; i < profile.steps.length; i++) {
            const input = profile.steps[i];
            console.log(`\n💬 [Passo ${i + 1}] Paciente: "${input}"`);
            try {
                const res = await conversationController.handleIncomingMessage(profile.phone, input, true, clinicId);
                console.log(`🤖 [Passo ${i + 1}] Ana: "${res.text}"`);
                if (res.buttons && res.buttons.length > 0) {
                    console.log(`🔘 Botões exibidos: ${JSON.stringify(res.buttons)}`);
                }
            } catch (err) {
                console.error(`❌ Erro no Passo ${i + 1}: ${err.message}`);
            }
        }
    }

    console.log('\n================================================================');
    console.log('✅ TESTE DE PERFIS CONCLUÍDO COM SUCESSO!');
    console.log('================================================================');
}

runInteractiveProfilesTest().catch(err => {
    console.error('❌ Erro na execução:', err);
    process.exit(1);
});
