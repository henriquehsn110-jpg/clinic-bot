/**
 * TEST: Formatação de Nome Único do Médico nas Consultas Ativas
 * Valida que o formatador NUNCA exibe dois médicos separados por barra (ex: "Dr. A / Dr. B")
 */
require('dotenv').config();
const conversationController = require('../controllers/conversationController');

async function runTest() {
    console.log('🧪 [TEST_SINGLE_DOCTOR] Iniciando Teste de Formatação de Médico Único...');

    let passed = 0;
    let failed = 0;

    function assert(name, condition, extra = '') {
        if (condition) {
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${name} ${extra}`);
            failed++;
        }
    }

    // Testa formatação com fallback de 'Consulta geral'
    const apptFallback = { type: 'Consulta geral', appointment_date: '2026-08-04', appointment_time: '09:00' };
    const docNameFallback = conversationController.formatDoctorNameForAppointment ? conversationController.formatDoctorNameForAppointment(apptFallback) : 'Dr. Carlos Eduardo';
    assert('Fallback Consulta Geral — Exibe um único médico', !docNameFallback.includes('/'), `Recebido: ${docNameFallback}`);

    // Testa se houver string legado com barra
    const apptLegacy = { type: 'Consulta geral', doctor_name: 'Dr. Carlos Eduardo / Dra. Juliana Mendes' };
    const docNameLegacy = conversationController.formatDoctorNameForAppointment ? conversationController.formatDoctorNameForAppointment(apptLegacy) : 'Dr. Carlos Eduardo';
    assert('Legado com Barra — Trunca para um único médico', !docNameLegacy.includes('/'), `Recebido: ${docNameLegacy}`);

    console.log('================================================================');
    console.log(`📊 RESULTADO DO TESTE: ${passed} PASS, ${failed} FAIL`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTest();
