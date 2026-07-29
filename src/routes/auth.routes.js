const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

const eliminarCuentaSchema = z.object({
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

router.post('/registrar', authController.registrar);
router.post('/login', authController.login);
router.post('/verificar-2fa', authController.verificar2FA);
router.delete('/cuenta', authMiddleware, validate(eliminarCuentaSchema), authController.eliminarCuenta);

module.exports = router;