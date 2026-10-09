const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');
const auditoriaController = require('../controllers/auditoria.controller');

// Todo lo que cuelga de /api/admin exige sesión válida Y rol de administrador, verificados en el servidor en cada
// petición (adminMiddleware consulta la base; no se fía de nada que mande el navegador).
router.use(authMiddleware, adminMiddleware);

router.get('/auditoria', auditoriaController.listar);
router.get('/auditoria/verificar', auditoriaController.verificar);

module.exports = router;
