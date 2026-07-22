const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Rota Pública de Autenticação
router.post('/auth/login', (req, res) => dashboardController.login(req, res));

// Rotas Protegidas por Autenticação Bearer Token
router.use((req, res, next) => dashboardController.authenticate(req, res, next));

// Obter Dados Gerais do Dashboard (KPIs, Consultas, Pacientes, Transbordo)
router.get('/data', (req, res) => dashboardController.getDashboardData(req, res));

// Operações de Pacientes
router.post('/patients', (req, res) => dashboardController.createPatient(req, res));

// Operações de Agendamentos
router.post('/appointments', (req, res) => dashboardController.createAppointment(req, res));
router.patch('/appointments/:id', (req, res) => dashboardController.updateAppointmentStatus(req, res));
router.post('/appointments/:id', (req, res) => dashboardController.updateAppointmentStatus(req, res));

// Operações de Transbordo Humano
router.post('/handoff/return', (req, res) => dashboardController.returnHandoffToAI(req, res));

// Configurações da Clínica & IA
router.post('/settings', (req, res) => dashboardController.updateSettings(req, res));

module.exports = router;
