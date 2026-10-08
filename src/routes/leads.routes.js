const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { limiteLeads } = require('../middleware/limites.middleware');
const leadsController = require('../controllers/leads.controller');

// Definimos las reglas para el Lead
const leadSchema = z.object({
  nombreNegocio: z.string().trim().min(3, "El nombre del negocio debe tener al menos 3 caracteres").max(120, "El nombre del negocio es demasiado largo"),
  nombreContacto: z.string().trim().min(3, "El nombre de contacto es obligatorio").max(100, "El nombre de contacto es demasiado largo"),
  whatsapp: z.string().trim().min(8, "El número de WhatsApp es muy corto").max(25, "El número de WhatsApp es demasiado largo"),
  mensaje: z.string().trim().max(1000, "El mensaje es demasiado largo (máximo 1000 caracteres)").optional()
});

// Aplicamos el middleware antes del controlador
router.post('/', limiteLeads, validate(leadSchema), leadsController.crearLead);

module.exports = router;