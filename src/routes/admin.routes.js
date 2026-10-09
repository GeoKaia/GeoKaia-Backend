const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { requierePermiso } = require('../rbac/permisos');
const auditoriaController = require('../controllers/auditoria.controller');
const cuentasController = require('../controllers/cuentas.controller');
const validarId = require('../middleware/validarId.middleware');

// Todo lo que cuelga de /api/admin exige sesión válida (la identidad y el rol salen de la base en cada petición) y,
// además, el permiso específico de cada operación (src/rbac/permisos.js).
router.use(authMiddleware);

router.param('id', validarId);

router.get('/auditoria', requierePermiso('auditoria:ver'), auditoriaController.listar);
router.get('/auditoria/verificar', requierePermiso('auditoria:ver'), auditoriaController.verificar);

// Incidente de seguridad: cierra todas las sesiones de una cuenta (queda auditado). No modifica datos de la cuenta.
router.post('/cuentas/:id/revocar-sesiones', requierePermiso('sesion:revocar_cuenta'), cuentasController.revocarSesiones);

module.exports = router;
