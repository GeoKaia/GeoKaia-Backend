const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const authController = require('../controllers/auth.controller');
const validarId = require('../middleware/validarId.middleware');
const authMiddleware = require('../middleware/auth.middleware');
const { passwordSchema: passwordNuevaSchema, contieneCorreo } = require('../utils/password');
const { limiteLogin, limite2FAPorIp, limite2FAPorCuenta, limiteRegistro, limiteRecuperacion } = require('../middleware/limites.middleware');

// Al iniciar sesión solo se acota el tamaño (para que nadie mande megabytes y gaste CPU en el hash); la política de
// complejidad se aplica al crear o cambiar la contraseña, no al entrar, para no dejar afuera a cuentas anteriores.
const passwordSchema = z.string().min(1, 'La contraseña es obligatoria').max(128, 'La contraseña es demasiado larga');

const eliminarCuentaSchema = z.object({
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().email('El correo no es válido').max(254, 'El correo es demasiado largo'),
  password: passwordSchema,
});

// El código TOTP son exactamente 6 dígitos; el pasoToken es el que devolvió el login (firmado, vale 5 minutos).
const verificar2FASchema = z.object({
  pasoToken: z.string().min(10, 'Falta el paso anterior del inicio de sesión').max(2000, 'pasoToken inválido'),
  token: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
});

// Mismas reglas mínimas que valida el formulario de registro del frontend. `aceptaTerminos` tiene que
// venir en true: el consentimiento tiene que ser expreso (Ley 787), no se asume por omisión.
// Los demás campos del body (por ejemplo "esAdmin") quedan fuera: el controlador solo lee los de abajo.
const registrarSchema = z.object({
  email: z.string().email('El correo no es válido').max(254, 'El correo es demasiado largo'),
  // Política de contraseñas nuevas (ver utils/password.js). El login no la aplica: las cuentas anteriores siguen entrando.
  password: passwordNuevaSchema,
  nombreContacto: z.string().trim().min(3, 'El nombre de contacto debe tener al menos 3 caracteres').max(100, 'El nombre de contacto es demasiado largo'),
  whatsapp: z.string().trim().min(8, 'El número de WhatsApp es muy corto').max(25, 'El número de WhatsApp es demasiado largo'),
  aceptaTerminos: z.literal(true, { message: 'Tenés que aceptar los Términos y la Política de Privacidad para crear tu cuenta' }),
}).superRefine((datos, ctx) => {
  if (contieneCorreo(datos.password, datos.email)) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'La contraseña no puede contener tu correo' });
  }
});

// Cambio de contraseña estando con sesión: contraseña actual + código 2FA + contraseña nueva (política completa).
const cambiarPasswordSchema = z.object({
  passwordActual: passwordSchema,
  passwordNueva: z.string().min(1, 'La contraseña nueva es obligatoria').max(128, 'La contraseña es demasiado larga'),
  codigo2fa: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
});

const olvidePasswordSchema = z.object({ email: z.string().email('El correo no es válido').max(254, 'El correo es demasiado largo') });

const restablecerPasswordSchema = z.object({
  token: z.string().min(20, 'Enlace inválido').max(200, 'Enlace inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria').max(128, 'La contraseña es demasiado larga'),
  codigo2fa: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
});

router.param('id', validarId);

router.post('/registrar', limiteRegistro, validate(registrarSchema), authController.registrar);
router.post('/login', limiteLogin, validate(loginSchema), authController.login);
router.post('/verificar-2fa', limite2FAPorIp, limite2FAPorCuenta, validate(verificar2FASchema), authController.verificar2FA);
router.post('/cambiar-password', authMiddleware, validate(cambiarPasswordSchema), authController.cambiarPassword);
router.post('/olvide-password', limiteRecuperacion, validate(olvidePasswordSchema), authController.olvidePassword);
router.post('/restablecer-password', limiteRecuperacion, validate(restablecerPasswordSchema), authController.restablecerPassword);
router.get('/me', authMiddleware, authController.me);
router.post('/logout', authController.logout);
router.post('/logout-todas', authMiddleware, authController.logoutTodas);
router.get('/sesiones', authMiddleware, authController.listarSesiones);
router.delete('/sesiones/:id', authMiddleware, authController.revocarSesion);
router.delete('/cuenta', authMiddleware, validate(eliminarCuentaSchema), authController.eliminarCuenta);

module.exports = router;