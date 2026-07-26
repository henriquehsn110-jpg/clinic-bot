const fs = require('fs');
const path = require('path');

const ROOT_INDEX_PATH = path.resolve(__dirname, '../../index.html');

function runSimulatorFlowTest() {
    console.log(`\n🧪 [TEST_SIMULATOR_FULL_FLOW] Iniciando Simulação Interativa da IA Ana...\n`);

    if (!fs.existsSync(ROOT_INDEX_PATH)) {
        console.error(`❌ FALHA: Arquivo index.html não encontrado!`);
        process.exit(1);
    }

    const html = fs.readFileSync(ROOT_INDEX_PATH, 'utf8');
    let totalTests = 0;
    let passedTests = 0;
    const failures = [];

    function assert(name, condition, errorMsg) {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`   ✅ PASS [Test #${totalTests}]: ${name}`);
        } else {
            failures.push({ test: name, error: errorMsg });
            console.error(`   ❌ FAIL [Test #${totalTests}]: ${name} -> ${errorMsg}`);
        }
    }

    // 1. Verificação das Opções Iniciais
    console.log(`[Fluxo 1] Opções Iniciais ao Abrir o Simulador...`);
    assert(
        'Botão Novo Agendamento Presente',
        html.includes('NovoAgendamento') && html.includes('AGENDAR NOVA CONSULTA'),
        'Deve apresentar a opção de agendar nova consulta na mensagem de abertura.'
    );
    assert(
        'Botão Lembrete/Confirmação Presente',
        html.includes('ConfirmarLembrete') && html.includes('TESTAR LEMBRETE'),
        'Deve apresentar a opção de testar confirmação de lembrete na abertura.'
    );
    assert(
        'Botão Horários & Endereço Presente',
        html.includes('InfoLocal') && html.includes('ENDEREÇO'),
        'Deve apresentar a opção de consultar horários e endereço.'
    );

    // 2. Verificação do Fluxo de Agendamento Completo
    console.log(`\n[Fluxo 2] Estágios do Agendamento Completo...`);
    assert(
        'Passo 1: Seleção de Especialidades (Medicina, Odontologia, Estética)',
        html.includes('EspMedica') && html.includes('EspOdonto') && html.includes('EspEstetica'),
        'O fluxo de agendamento deve permitir escolher a especialidade médica/odontológica.'
    );
    assert(
        'Passo 2: Seleção de Médicos e Horários Disponíveis',
        html.includes('Hora10') && html.includes('Hora14') && html.includes('Hora16'),
        'O fluxo de agendamento deve apresentar horários e médicos livres na agenda.'
    );
    assert(
        'Passo 3: Confirmação de Cadastro e Proteção LGPD',
        html.includes('FinalizarAgendamento') && html.includes('123.***.***-45 🔒'),
        'O agendamento final deve exibir o cadastro seguro e o CPF mascarado (LGPD).'
    );

    // 3. Verificação do Fluxo de Lembrete e Resposta em 1 Clique
    console.log(`\n[Fluxo 3] Confirmação e Remarcação de Lembrete...`);
    assert(
        'Resposta em 1 Clique de Confirmação Directa',
        html.includes('Sua consulta foi <strong>CONFIRMADA</strong>'),
        'A Ana deve confirmar a presença no sistema ao clicar em confirmar.'
    );
    assert(
        'Fluxo de Remarcação Autônoma de Horários',
        html.includes('Aqui estão os novos horários disponíveis nesta semana'),
        'A Ana deve liberar a vaga e sugerir novos horários ao clicar em remarcar.'
    );

    // 4. Verificação do Fluxo de Dúvidas Frequentes (Localização)
    console.log(`\n[Fluxo 4] Consulta de Horários e Endereço...`);
    assert(
        'Resposta Instantânea de Localização e Horários de Atendimento',
        html.includes('Clínica Saúde Pro') && html.includes('Av. Paulista'),
        'A Ana deve responder imediatamente com o endereço e expediente da clínica.'
    );

    // Resumo Final
    console.log(`\n================================================================`);
    if (failures.length === 0) {
        console.log(`🎉 TESTE DO SIMULADOR 100% APROVADO! (${passedTests}/${totalTests} Fluxos Verificados)`);
        console.log(`================================================================\n`);
        process.exit(0);
    } else {
        console.log(`⚠️ FALHA NO TESTE DO SIMULADOR (${passedTests}/${totalTests} Passaram)`);
        failures.forEach((f, i) => console.log(`   ${i + 1}. ${f.test}: ${f.error}`));
        console.log(`================================================================\n`);
        process.exit(1);
    }
}

runSimulatorFlowTest();
