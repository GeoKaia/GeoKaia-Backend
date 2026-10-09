const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const validarId = require('../middleware/validarId.middleware');
const authMiddleware = require('../middleware/auth.middleware');
const { requierePermiso } = require('../rbac/permisos');
const { limiteMensajes } = require('../middleware/limites.middleware');
const conversaciones = require('../controllers/conversaciones.controller');

// Bandeja del PROPIETARIO: solo ve y responde las conversaciones de SU negocio. No hay ninguna ruta que reciba el id de un
// negocio: el negocio sale de la sesión, y el id de una conversación ajena responde 404 (y queda auditado).
const mensajeSchema = z.object({ texto: z.string().trim().min(1, 'El mensaje no puede estar vacío').max(2000, 'El mensaje no puede pasar de 2000 caracteres') });
// El propietario solo marca la conversación como resuelta o la reabre; "En seguimiento" lo decide el equipo.
const estadoPropioSchema = z.object({ estado: z.enum(['ABIERTA', 'RESUELTA'], { message: 'Estado inválido' }) });

router.param('id', validarId);
router.use(authMiddleware, requierePermiso('mensajes:leer_propios'));

router.get('/no-leidos', conversaciones.noLeidosPropios);
router.get('/conversaciones', conversaciones.listarPropias);
router.get('/conversaciones/:id', conversaciones.verPropia);
router.post('/conversaciones/:id/mensajes', requierePermiso('mensajes:responder_propios'), limiteMensajes, validate(mensajeSchema), conversaciones.responderPropia);
router.patch('/conversaciones/:id/estado', requierePermiso('mensajes:responder_propios'), validate(estadoPropioSchema), conversaciones.estadoPropio);

module.exports = router;
