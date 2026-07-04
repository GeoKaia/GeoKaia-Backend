const express = require('express');
const router = express.Router();
const iaController = require('../controllers/ia.controller');

router.post('/recomendar-ruta', iaController.recomendarRuta);

module.exports = router;