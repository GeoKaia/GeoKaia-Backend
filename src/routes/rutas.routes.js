const express = require('express');
const router = express.Router();
const rutasController = require('../controllers/rutas.controller');
const authMiddleware = require('../middleware/auth.middleware'); // <--- ¡Asegúrate de agregar esto!

router.get('/', rutasController.obtenerTodas);
router.post('/', authMiddleware, rutasController.crear); // <--- ¡El guardia aquí!

module.exports = router;