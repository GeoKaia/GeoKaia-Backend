const express = require('express');
const router = express.Router();
const lugaresController = require('../controllers/lugares.controller');

router.get('/', lugaresController.obtenerTodos);
router.get('/:id', lugaresController.obtenerPorId);
router.post('/', lugaresController.crear);

module.exports = router;