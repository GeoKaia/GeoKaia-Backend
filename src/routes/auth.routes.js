const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { limiteLogin, limite2FAPorIp, limite2FAPorCuenta, limiteRegistro } = require('../middleware/limites.middleware');
const { problemasDeContrasena } = require('../utils/password');

// bcrypt solo usa los primeros 72 bytes de la contraseña: el tope evita además que alguien mande
// megabytes de texto para que el servidor gaste CPU en el hash.
const passwordSchema = z.string().min(1, 'La contraseña es obligatoria').max(72, 'La contraseña es demasiado larga');

const eliminarCuentaSchema = z.object({
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().email('El correo no es válido').max(254, 'El correo es demasiado largo'),
  password: passwordSchema,
});

// El código TOTP son exactamente 6 dígitos; el id es el que devolvió el login.
const verificar2FASchema = z.object({
  negocioId: z.number().int().positive('negocioId inválido'),
  token: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
});

// Mismas reglas mínimas que valida el formulario de registro del frontend. `aceptaTerminos` tiene que
// venir en true: el consentimiento tiene que ser expreso (Ley 787), no se asume por omisión.
// Los demás campos del body (por ejemplo "esAdmin") quedan fuera: el controlador solo lee los de abajo.
const registrarSchema = z.object({
  email: z.string().email('El correo no es válido').max(254, 'El correo es demasiado largo'),
  // El tope de 256 solo corta basura enorme antes de evaluar la política (que es lo que da los mensajes útiles).
  password: z.string().min(1, 'La contraseña es obligatoria').max(256, 'La contraseña es demasiado larga'),
  nombreContacto: z.string().trim().min(3, 'El nombre de contacto debe tener al menos 3 caracteres').max(100, 'El nombre de contacto es demasiado largo'),
  whatsapp: z.string().trim().min(8, 'El número de WhatsApp es muy corto').max(25, 'El número de WhatsApp es demasiado largo'),
  aceptaTerminos: z.literal(true, { message: 'Tenés que aceptar los Términos y la Política de Privacidad para crear tu cuenta' }),
}).superRefine((datos, ctx) => {
  for (const mensaje of problemasDeContrasena(datos.password, datos.email)) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: mensaje });
  }
});

router.post('/registrar', limiteRegistro, validate(registrarSchema), authController.registrar);
router.post('/login', limiteLogin, validate(loginSchema), authController.login);
router.post('/verificar-2fa', limite2FAPorIp, limite2FAPorCuenta, validate(verificar2FASchema), authController.verificar2FA);
router.delete('/cuenta', authMiddleware, validate(eliminarCuentaSchema), authController.eliminarCuenta);

module.exports = router;