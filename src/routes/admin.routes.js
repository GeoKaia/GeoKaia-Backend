const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { requierePermiso } = require('../rbac/permisos');
const auditoriaController = require('../controllers/auditoria.controller');
const cuentasController = require('../controllers/cuentas.controller');
const validarId = require('../middleware/validarId.middleware');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { validateQuery } = validate;
const { limiteMensajes } = require('../middleware/limites.middleware');
const conversaciones = require('../controllers/conversaciones.controller');

// Todo lo que cuelga de /api/admin exige sesión válida (la identidad y el rol salen de la base en cada petición) y,
// además, el permiso específico de cada operación (src/rbac/permisos.js).
router.use(authMiddleware);

router.param('id', validarId);

router.get('/auditoria', requierePermiso('auditoria:ver'), auditoriaController.listar);
router.get('/auditoria/verificar', requierePermiso('auditoria:ver'), auditoriaController.verificar);

// Incidente de seguridad: cierra todas las sesiones de una cuenta (queda auditado). No modifica datos de la cuenta.
router.post('/cuentas/:id/revocar-sesiones', requierePermiso('sesion:revocar_cuenta'), cuentasController.revocarSesiones);

// Bandeja de conversaciones del equipo con los negocios: comunicarse SIN modificar sus datos.
const texto = z.string().trim().min(1, 'El mensaje no puede estar vacío').max(2000, 'El mensaje no puede pasar de 2000 caracteres');
const crearConversacionSchema = z.object({
  lugarId: z.number({ message: 'lugarId inválido' }).int().positive('lugarId inválido'),
  asunto: z.string().trim().min(3, 'El asunto debe tener al menos 3 caracteres').max(150, 'El asunto es demasiado largo'),
  texto,
});
const estadoSchema = z.object({ estado: z.enum(['ABIERTA', 'EN_SEGUIMIENTO', 'RESUELTA'], { message: 'Estado inválido' }) });
const filtroSchema = z.object({
  estado: z.enum(['ABIERTA', 'EN_SEGUIMIENTO', 'RESUELTA']).optional(),
  lugarId: z.coerce.number().int().positive().optional(),
  negocioId: z.coerce.number().int().positive().optional(),
});
const gestionar = requierePermiso('conversacion:gestionar');
router.get('/conversaciones/no-leidos', gestionar, conversaciones.noLeidosAdmin);
router.get('/conversaciones', gestionar, validateQuery(filtroSchema), conversaciones.listarAdmin);
router.post('/conversaciones', gestionar, limiteMensajes, validate(crearConversacionSchema), conversaciones.crear);
router.get('/conversaciones/:id', gestionar, conversaciones.verAdmin);
router.post('/conversaciones/:id/mensajes', gestionar, limiteMensajes, validate(z.object({ texto })), conversaciones.responderAdmin);
router.patch('/conversaciones/:id/estado', gestionar, validate(estadoSchema), conversaciones.estadoAdmin);

module.exports = router;
