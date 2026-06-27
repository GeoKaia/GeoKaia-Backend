const express = require('express');
const router = express.Router();
const rutasController = require('../controllers/rutas.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Pública: Cualquiera puede ver las rutas
router.get('/', rutasController.obtenerTodas);

// Protegida: Solo negocios con token JWT pueden crearlas
router.post('/', authMiddleware, rutasController.crear);

module.exports = router;