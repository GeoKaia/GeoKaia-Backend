const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const leadsController = require('../controllers/leads.controller');

// Definimos las reglas para el Lead
const leadSchema = z.object({
  nombreNegocio: z.string().min(3, "El nombre del negocio debe tener al menos 3 caracteres"),
  nombreContacto: z.string().min(3, "El nombre de contacto es obligatorio"),
  whatsapp: z.string().min(8, "El número de WhatsApp es muy corto"),
  mensaje: z.string().optional()
});

// Aplicamos el middleware antes del controlador
router.post('/', validate(leadSchema), leadsController.crearLead);

module.exports = router;