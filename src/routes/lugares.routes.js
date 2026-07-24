const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const lugaresController = require('../controllers/lugares.controller');
const authMiddleware = require('../middleware/auth.middleware'); // Traemos al guardia

// Reglas para editar el contenido del lugar del negocio autenticado.
// Todos los campos son opcionales (PATCH = actualización parcial), pero debe venir al menos uno.
const actualizarLugarSchema = z.object({
  descripcion: z.string().min(10, 'La descripción debe tener al menos 10 caracteres').optional(),
  horarios: z.string().optional(),
  fotoUrl: z.string().url('fotoUrl debe ser una URL válida').optional(),
  panoramaUrl: z.string().url('panoramaUrl debe ser una URL válida').optional(),
  videoUrl: z.string().url('videoUrl debe ser una URL válida').optional(),
  galeriaUrls: z.array(z.string().url('Cada elemento de galeriaUrls debe ser una URL válida')).optional(),
  whatsapp: z.string().min(8, 'El número de WhatsApp es muy corto').optional(),
  menuUrl: z.string().url('menuUrl debe ser una URL válida').optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debés enviar al menos un campo para actualizar',
});

// IMPORTANTE: '/mi-lugar' va antes de '/:id' para que Express no lo confunda con un ID
router.get('/', lugaresController.obtenerTodos);
router.get('/mi-lugar', authMiddleware, lugaresController.obtenerMiLugar);
router.get('/:id', lugaresController.obtenerPorId);

router.post('/', authMiddleware, lugaresController.crear);
router.patch('/mi-lugar', authMiddleware, validate(actualizarLugarSchema), lugaresController.actualizarMiLugar);

module.exports = router;