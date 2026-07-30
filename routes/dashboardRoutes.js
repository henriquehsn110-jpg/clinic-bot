const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Rota Pública de Autenticação
router.post('/auth/login', (req, res) => dashboardController.login(req, res));

// Middleware Global de Autenticação Bearer Token & Resolução Tenant UUID
router.use((req, res, next) => dashboardController.authenticate(req, res, next));
router.use((req, res, next) => dashboardController.resolveClinicId(req, res, next));

// Rotas com Controle de Acesso Baseado em Roles (RBAC) & Isolamento Multi-Tenant

// Obter Dados Gerais do Dashboard (admin, clinic, superadmin)
router.get('/data', dashboardController.authorize('admin', 'clinic', 'superadmin'), (req, res) => dashboardController.getDashboardData(req, res));

// Operações de Pacientes (admin, clinic, superadmin)
router.post('/patients', dashboardController.authorize('admin', 'clinic', 'superadmin'), (req, res) => dashboardController.createPatient(req, res));

// Operações de Agendamentos (admin, clinic, superadmin)
router.post('/appointments', dashboardController.authorize('admin', 'clinic', 'superadmin'), (req, res) => dashboardController.createAppointment(req, res));

// Atualização de Status de Agendamentos (admin, clinic, superadmin — com ownership check no controller)
router.patch('/appointments/:id', dashboardController.authorize('admin', 'clinic', 'superadmin'), (req, res) => dashboardController.updateAppointmentStatus(req, res));
router.post('/appointments/:id', dashboardController.authorize('admin', 'clinic', 'superadmin'), (req, res) => dashboardController.updateAppointmentStatus(req, res));

// Transbordo Humano (admin, clinic, superadmin)
router.post('/handoff/return', dashboardController.authorize('admin', 'clinic', 'superadmin'), (req, res) => dashboardController.returnHandoffToAI(req, res));

// Configurações da Clínica & IA — RESTRITO: apenas admin ou superadmin podem alterar
router.post('/settings', dashboardController.authorize('admin', 'superadmin'), (req, res) => dashboardController.updateSettings(req, res));

// Stream de Auditoria SIEM Corporativo — RESTRITO: apenas admin (da sua clínica) ou superadmin
router.get('/audit-stream', dashboardController.authorize('admin', 'superadmin'), (req, res) => dashboardController.getAuditStream(req, res));

module.exports = router;
