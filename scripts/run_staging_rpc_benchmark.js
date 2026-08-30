/**
 * RUNNER DE BENCHMARK DO DASHBOARD COM RPC (STAGING)
 */
process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { spawn } = require('child_process');

async function run() {
    const app = express();
    app.use(express.json());

    // Rotas de Auth e Dashboard
    app.post('/api/dashboard/auth/login', (req, res) => dashboardController.login(req, res));
    app.get('/api/dashboard/data', 
        (req, res, next) => dashboardController.authenticate(req, res, next),
        (req, res, next) => dashboardController.resolveClinicId(req, res, next),
        (req, res) => dashboardController.getDashboardData(req, res)
    );

    const PORT = 3098;
    const server = app.listen(PORT, async () => {
        console.log(`🚀 Servidor de benchmark Staging (RPC) rodando na porta ${PORT}...`);
        
        const env = { ...process.env, BASE_URL: `http://localhost:${PORT}` };
        const bench = spawn('node', ['tests/test_render_public_load_benchmark.js'], { env, stdio: 'inherit' });

        bench.on('close', (code) => {
            server.close();
            process.exit(code);
        });
    });
}

run();
