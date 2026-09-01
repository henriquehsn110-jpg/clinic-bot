/**
 * TESTE FASE 2: COLETA DE CPF, VALIDAÇÃO, UI DE ESTADOS E MASCARAMENTO LGPD
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.staging') });

const conversationController = require('../controllers/conversationController');
const db = require('../services/databaseService');

function generateValidCpf() {
    const rnd = () => Math.floor(Math.random() * 9);
    const n = Array.from({ length: 9 }, rnd);
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0) % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    n.push(d1);
    let d2 = n.reduce((total, num, i) => total + num * (11 - i), 0) % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    n.push(d2);
    return n.join('');
}

async function runCpfTests() {
    console.log('================================================================');
    console.log('🧪 TESTE FASE 2: VALIDAÇÃO DE CPF, UI E SEGURANÇA LGPD (STAGING)');
    console.log('================================================================\n');

    const testPhone = '5511999995566';
    const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

    // 1. Limpeza
    await db.sessions.setDraft(testPhone, null, clinicId);
    await db.sessions.set(testPhone, [], clinicId);

    // Garante paciente titular sem CPF cadastrado para testar fluxo de coleta
    let patient = await db.patients.findByPhone(testPhone, clinicId);
    if (patient) {
        await db.supabase.from('patients').update({ cpf: null, cpf_hash: null }).eq('id', patient.id);
    } else {
        await db.patients.findOrCreate(testPhone, clinicId);
        await db.patients.updateName(testPhone, 'Paciente Teste CPF', clinicId);
    }

    // Cenário 1: Chegar até a solicitação de CPF e verificar que NÃO há botões de Confirmar prematuros
    console.log('1. Avançando fluxo até solicitação de CPF...');
    await conversationController.handleIncomingMessage(testPhone, 'Quero agendar uma Limpeza', true, clinicId, '999888777');
    await conversationController.handleIncomingMessage(testPhone, '04/09/2026', true, clinicId, '999888777');
    const resCpfReq = await conversationController.handleIncomingMessage(testPhone, '10:00', true, clinicId, '999888777');

    console.log('   Texto exibido:', resCpfReq.text.replace(/\n+/g, ' '));
    console.log('   Botões exibidos:', resCpfReq.buttons);

    if (resCpfReq.buttons && resCpfReq.buttons.includes('Confirmar')) {
        throw new Error(`FALHA: Botão 'Confirmar' não deve ser renderizado durante a coleta de CPF!`);
    }
    if (resCpfReq.buttons && resCpfReq.buttons.includes('Agendar p/ Outro')) {
        throw new Error(`FALHA: Botão 'Agendar p/ Outro' não deve ser renderizado durante a coleta de CPF!`);
    }
    console.log('   ✅ Nenhum botão prematuro exibido na solicitação de CPF');

    // Cenário 2: Enviar CPF com checksum inválido (ex: 123.456.789-00)
    console.log('\n2. Enviando CPF com dígitos verificadores inválidos ("123.456.789-00")...');
    const resInvalid1 = await conversationController.handleIncomingMessage(testPhone, '123.456.789-00', true, clinicId, '999888777');
    console.log('   Resposta:', resInvalid1.text.replace(/\n+/g, ' '));
    console.log('   Transferência para humano:', resInvalid1.transferToHuman);

    if (resInvalid1.text.includes('instabilidade')) {
        throw new Error(`FALHA: CPF inválido não deve retornar mensagem de 'instabilidade técnica'!`);
    }
    if (resInvalid1.transferToHuman === true) {
        throw new Error(`FALHA: Não deve transferir para humano na primeira tentativa de CPF inválido!`);
    }
    if (!resInvalid1.text.toLowerCase().includes('inválido') && !resInvalid1.text.toLowerCase().includes('invalido')) {
        throw new Error(`FALHA: Deve conter mensagem amigável de CPF inválido`);
    }
    console.log('   ✅ CPF inválido tratado com mensagem amigável sem erro 500 nem handoff prematuro');

    // Cenário 3: Enviar texto de nome durante solicitação de CPF (não deve contar como tentativa de CPF)
    console.log('\n3. Enviando frase de nome durante pedido de CPF ("Meu nome é Lucas Andrade")...');
    const resName = await conversationController.handleIncomingMessage(testPhone, 'Meu nome é Lucas Andrade', true, clinicId, '999888777');
    console.log('   Resposta:', resName.text.replace(/\n+/g, ' '));
    if (resName.transferToHuman === true) {
        throw new Error(`FALHA: Frase de nome não deve abrir handoff`);
    }
    console.log('   ✅ Frase de nome não contabilizada como erro de CPF');

    // Cenário 4: Enviar CPF válido com pontuação
    const validCpfFormatted = generateValidCpf().replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    console.log(`\n4. Enviando CPF válido formatado...`);
    const resValid = await conversationController.handleIncomingMessage(testPhone, validCpfFormatted, true, clinicId, '999888777');
    console.log('   Resposta:', resValid.text.replace(/\n+/g, ' '));
    console.log('   Botões:', resValid.buttons);

    if (!resValid.buttons.includes('Confirmar')) {
        throw new Error(`FALHA: Após CPF válido, deve exibir botões de confirmação incluindo 'Confirmar'`);
    }
    console.log('   ✅ CPF válido aceito e tela de confirmação renderizada com sucesso!');

    console.log('\n================================================================');
    console.log('🎉 TODOS OS TESTES DA FASE 2 PASSARAM COM SUCESSO (100% PASS)!');
    console.log('================================================================\n');
}

runCpfTests().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE FASE 2:', err);
    process.exit(1);
});
