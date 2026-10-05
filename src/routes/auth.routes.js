const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

const eliminarCuentaSchema = z.object({
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

// Mismas reglas mínimas que valida el formulario de registro del frontend. `aceptaTerminos` tiene que
// venir en true: el consentimiento tiene que ser expreso (Ley 787), no se asume por omisión.
// Los demás campos del body (por ejemplo "esAdmin") quedan fuera: el controlador solo lee los de abajo.
const registrarSchema = z.object({
  email: z.string().email('El correo no es válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  nombreContacto: z.string().min(3, 'El nombre de contacto debe tener al menos 3 caracteres'),
  whatsapp: z.string().min(8, 'El número de WhatsApp es muy corto'),
  aceptaTerminos: z.literal(true, { message: 'Tenés que aceptar los Términos y la Política de Privacidad para crear tu cuenta' }),
});

router.post('/registrar', validate(registrarSchema), authController.registrar);
router.post('/login', authController.login);
router.post('/verificar-2fa', authController.verificar2FA);
router.delete('/cuenta', authMiddleware, validate(eliminarCuentaSchema), authController.eliminarCuenta);

module.exports = router;