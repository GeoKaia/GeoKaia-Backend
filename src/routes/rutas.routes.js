const express = require('express');
const router = express.Router();
const rutasController = require('../controllers/rutas.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/', rutasController.obtenerTodas);

router.post('/', authMiddleware, rutasController.crear);

module.exports = router;
