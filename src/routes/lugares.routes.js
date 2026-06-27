const express = require('express');
const router = express.Router();
const lugaresController = require('../controllers/lugares.controller');
const authMiddleware = require('../middleware/auth.middleware'); // Traemos al guardia

router.get('/', lugaresController.obtenerTodos);
router.get('/:id', lugaresController.obtenerPorId);

router.post('/', authMiddleware, lugaresController.crear);

module.exports = router;