require('dotenv').config();
const assert = require('assert');
const db = require('../services/databaseService');
const dashboardController = require('../controllers/dashboardController');

async function runWorkDaysTest() {
    console.log('🧪 [TEST_WORK_DAYS_SELECT] Iniciando teste de validação do campo Dias de Atendimento...');

    // 1. Simula requisição com workHours vazio ou não mapeado
    const req = {
        resolvedClinicId: 'e8f24abe-381d-499d-9596-252507b32194', // clinica-modelo
        body: {
            name: 'Clínica Odonto Riso',
            personaName: 'Bruna',
            workHours: '',
            minCancellationHours: '4'
        }
    };

    let responseData = null;
    const res = {
        json: (data) => { responseData = data; },
        status: () => res
    };

    await dashboardController.updateSettings(req, res);
    assert(responseData && responseData.success, 'Falha ao salvar configurações no controller');
    assert.notStrictEqual(responseData.settings.workHours, '', 'workHours não pode ser salvo como string vazia');
    console.log('  ✅ PASS: Controller aplicou fallback para workHours no salvamento:', responseData.settings.workHours);

    // 2. Busca os dados do dashboard para garantir que getDashboardData devolve o valor válido
    let getDashboardDataRes = null;
    const resDash = {
        json: (data) => { getDashboardDataRes = data; },
        status: () => resDash
    };
    const reqDash = {
        resolvedClinicId: 'e8f24abe-381d-499d-9596-252507b32194',
        query: {}
    };

    await dashboardController.getDashboardData(reqDash, resDash);
    assert(getDashboardDataRes && getDashboardDataRes.settings, 'Falha ao buscar dados do dashboard');
    assert(getDashboardDataRes.settings.workHours, 's.workHours no dashboard não deve ser nulo/vazio');
    console.log('  ✅ PASS: getDashboardData retornou s.workHours válido:', getDashboardDataRes.settings.workHours);

    console.log('🎉 [TEST_WORK_DAYS_SELECT] Teste concluído com 100% de sucesso!');
    process.exit(0);
}

runWorkDaysTest().catch(err => {
    console.error('❌ FAIL:', err.message);
    process.exit(1);
});
