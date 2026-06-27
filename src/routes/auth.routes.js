const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/registrar', authController.registrar);
router.post('/login', authController.login);
router.post('/verificar-2fa', authController.verificar2FA);

module.exports = router;