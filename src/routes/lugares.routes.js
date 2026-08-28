const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const lugaresController = require('../controllers/lugares.controller');
const authMiddleware = require('../middleware/auth.middleware'); // Traemos al guardia
const adminMiddleware = require('../middleware/admin.middleware');

// Reglas para editar el contenido del lugar del negocio autenticado.
// Todos los campos son opcionales (PATCH = actualización parcial), pero debe venir al menos uno.
const actualizarLugarSchema = z.object({
  nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').optional(),
  categoria: z.enum(['GASTRONOMIA', 'CULTURA', 'NATURALEZA', 'HISTORIA', 'ARTESANIA', 'ALOJAMIENTO']).optional(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
  descripcion: z.string().min(10, 'La descripción debe tener al menos 10 caracteres').optional(),
  subcategoria: z.string().min(2, 'La subcategoría es muy corta').optional(),
  horarios: z.string().optional(),
  mapsUrl: z.string().url('mapsUrl debe ser una URL válida').optional(),
  wazeUrl: z.string().url('wazeUrl debe ser una URL válida').optional(),
  fotoUrl: z.string().url('fotoUrl debe ser una URL válida').optional(),
  panoramaUrl: z.string().url('panoramaUrl debe ser una URL válida').optional(),
  videoUrl: z.string().url('videoUrl debe ser una URL válida').optional(),
  galeriaUrls: z.array(z.string().url('Cada elemento de galeriaUrls debe ser una URL válida')).max(5, 'Máximo 5 fotos adicionales').optional(),
  whatsapp: z.string().min(8, 'El número de WhatsApp es muy corto').optional(),
  menuUrl: z.string().url('menuUrl debe ser una URL válida').optional(),
  audioUrl: z.string().url('audioUrl debe ser una URL válida').optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debés enviar al menos un campo para actualizar',
});

// Borrar el lugar (mantiene la cuenta/login) requiere reingresar la contraseña.
const eliminarLugarSchema = z.object({
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

// [Admin] aprobar/rechazar un lugar
const actualizarEstadoSchema = z.object({
  estado: z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO']),
});

// IMPORTANTE: '/mi-lugar' y '/admin/*' van antes de '/:id' para que Express no las confunda con un ID
router.get('/', lugaresController.obtenerTodos);
router.get('/mi-lugar', authMiddleware, lugaresController.obtenerMiLugar);
router.get('/admin/pendientes', authMiddleware, adminMiddleware, lugaresController.obtenerPendientes);
router.get('/:id', lugaresController.obtenerPorId);

router.post('/', authMiddleware, lugaresController.crear);
router.patch('/mi-lugar', authMiddleware, validate(actualizarLugarSchema), lugaresController.actualizarMiLugar);
router.delete('/mi-lugar', authMiddleware, validate(eliminarLugarSchema), lugaresController.eliminarMiLugar);
router.patch('/admin/:id/estado', authMiddleware, adminMiddleware, validate(actualizarEstadoSchema), lugaresController.actualizarEstado);

module.exports = router;