const express = require('express');
const rateLimit = require('express-rate-limit');
const { adminController, authenticateAdminJWT, checkAdminIpAllowlist } = require('../controllers/adminController');

const router = express.Router();

// Rate Limiting para os Endpoints Administrativos (15 requisições por minuto em prod, 100 em testes)
const adminRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: process.env.NODE_ENV === 'test' ? 100 : 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de requisições administrativas excedido. Tente novamente em 1 minuto.' }
});

// Middleware Global de IP Allowlist (se configurado)
router.use(checkAdminIpAllowlist);

// 1. Rotas de Autenticação Admin (Não exigem Token Admin prévio)
router.post('/auth/login', adminRateLimiter, (req, res) => adminController.login(req, res));

// 2. Rotas Protegidas por Admin JWT + Rate Limiting
router.post('/auth/2fa-setup', adminRateLimiter, authenticateAdminJWT, (req, res) => adminController.setup2FA(req, res));
router.get('/status', adminRateLimiter, authenticateAdminJWT, (req, res) => adminController.getStatus(req, res));
router.get('/logs', adminRateLimiter, authenticateAdminJWT, (req, res) => adminController.getLogs(req, res));
router.get('/audit-log', adminRateLimiter, authenticateAdminJWT, (req, res) => adminController.getAuditLogs(req, res));
router.get('/queue/failed', adminRateLimiter, authenticateAdminJWT, (req, res) => adminController.getFailedQueue(req, res));
router.post('/restart', adminRateLimiter, authenticateAdminJWT, (req, res) => adminController.restart(req, res));
router.post('/rollback', adminRateLimiter, authenticateAdminJWT, (req, res) => adminController.rollback(req, res));

module.exports = router;
