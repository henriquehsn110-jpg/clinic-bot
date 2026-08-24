/**
 * TESTE E MEDIÇÃO DO ENDPOINT /api/dashboard/data OTIMIZADO
 */
process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const axios = require('axios');

async function runLocalDashboardTest() {
    const app = express();
    app.use(express.json());

    // Rotas de teste do Dashboard com middleware
    app.get('/api/dashboard/data', 
        (req, res, next) => dashboardController.authenticate(req, res, next),
        (req, res, next) => dashboardController.resolveClinicId(req, res, next),
        (req, res) => dashboardController.getDashboardData(req, res)
    );

    const server = app.listen(3099);
    console.log('Servidor de teste iniciado na porta 3099.');

    try {
        const loginPayload = {
            email: 'admin@clinicamodelo.com.br',
            clinicId: 'clinica-modelo',
            clinicName: 'Clínica Modelo Odontológica',
            role: 'admin'
        };
        const token = dashboardController.login ? require('../controllers/dashboardController') : null;
        
        // Gera token assinado
        const crypto = require('crypto');
        const SESSION_SECRET = process.env.APP_SECRET || 'dev_only_fallback_not_for_production';
        const data = JSON.stringify({ ...loginPayload, exp: Date.now() + 24 * 60 * 60 * 1000 });
        const signature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
        const tokenStr = Buffer.from(data).toString('base64') + '.' + signature;

        console.log('\n⏳ Disparando requisição a GET /api/dashboard/data...');
        const t0 = Date.now();
        const res = await axios.get('http://localhost:3099/api/dashboard/data', {
            headers: { Authorization: `Bearer ${tokenStr}` }
        });
        const elapsed = Date.now() - t0;

        const payloadSize = Buffer.byteLength(JSON.stringify(res.data));
        console.log(`✅ Resposta recebida em ${elapsed}ms | HTTP Status: ${res.status}`);
        console.log(`📦 Tamanho total do Payload: ${payloadSize} bytes`);
        console.log(`📊 Dados retornados:`);
        console.log(`   • Agendamentos: ${res.data.appointments?.length}`);
        console.log(`   • Pacientes: ${res.data.patients?.length}`);
        console.log(`   • Handoffs: ${res.data.handoffs?.length}`);
        console.log(`   • Clínica: ${res.data.clinicName}`);
        console.log(`   • Configurações: ${JSON.stringify(res.data.settings).substring(0, 80)}...`);

    } finally {
        server.close();
    }
}

runLocalDashboardTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO:', err.response ? err.response.data : err.message);
    process.exit(1);
});
