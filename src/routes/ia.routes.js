const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { limiteIA } = require('../middleware/limites.middleware');
const iaController = require('../controllers/ia.controller');

// La consulta se inserta dentro del prompt del modelo: el tope de largo limita el costo por llamada y
// el espacio disponible para intentar manipular al modelo (prompt injection).
const recomendarRutaSchema = z.object({
  consulta: z.string().trim().min(2, 'La consulta es muy corta').max(500, 'La consulta es demasiado larga (máximo 500 caracteres)'),
});

router.post('/recomendar-ruta', limiteIA, validate(recomendarRutaSchema), iaController.recomendarRuta);

module.exports = router;