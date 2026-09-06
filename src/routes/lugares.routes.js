const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const lugaresController = require('../controllers/lugares.controller');
const authMiddleware = require('../middleware/auth.middleware'); // Traemos al guardia
const adminMiddleware = require('../middleware/admin.middleware');
const { esUrlDeFotoValida, esUrlDeGoogleMaps, esUrlDeWaze } = require('../utils/validarUrls');

// Estos tres son campos compartidos por GRATIS y PREMIUM — sin verificar que el link
// sea realmente lo que dice ser, un negocio del plan Gratuito podría pegar cualquier
// URL ahí (un video, una red social, lo que sea) y de hecho estar usando esos campos
// como si fueran contenido premium. Si eso vale, no tiene sentido vender el plan pago.
const fotoUrlSchema = z.string().url('fotoUrl debe ser una URL válida')
  .refine(esUrlDeFotoValida, 'La URL no parece ser una foto real (¿es un link a un video o una red social?)');
const mapsUrlSchema = z.string().url('mapsUrl debe ser una URL válida')
  .refine(esUrlDeGoogleMaps, 'mapsUrl tiene que ser un link de Google Maps');
const wazeUrlSchema = z.string().url('wazeUrl debe ser una URL válida')
  .refine(esUrlDeWaze, 'wazeUrl tiene que ser un link de Waze');

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
  mapsUrl: mapsUrlSchema.optional(),
  wazeUrl: wazeUrlSchema.optional(),
  fotoUrl: fotoUrlSchema.optional(),
  panoramaUrl: z.string().url('panoramaUrl debe ser una URL válida').optional(),
  videoUrl: z.string().url('videoUrl debe ser una URL válida').optional(),
  galeriaUrls: z.array(fotoUrlSchema).max(5, 'Máximo 5 fotos adicionales').optional(),
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

// [Admin] editar cualquier lugar: mismas reglas que actualizarLugarSchema, mas 'estado' opcional
// (el admin puede corregir contenido y aprobar/rechazar en el mismo paso).
const actualizarLugarAdminSchema = z.object({
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
  estado: z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debés enviar al menos un campo para actualizar',
});

// IMPORTANTE: '/mi-lugar' y '/admin/*' van antes de '/:id' para que Express no las confunda con un ID
router.get('/', lugaresController.obtenerTodos);
router.get('/mi-lugar', authMiddleware, lugaresController.obtenerMiLugar);
router.get('/admin/pendientes', authMiddleware, adminMiddleware, lugaresController.obtenerPendientes);
router.get('/admin/todos', authMiddleware, adminMiddleware, lugaresController.obtenerTodosAdmin);
router.get('/:id', lugaresController.obtenerPorId);

router.post('/', authMiddleware, lugaresController.crear);
router.patch('/mi-lugar', authMiddleware, validate(actualizarLugarSchema), lugaresController.actualizarMiLugar);
router.delete('/mi-lugar', authMiddleware, validate(eliminarLugarSchema), lugaresController.eliminarMiLugar);
router.patch('/admin/:id/estado', authMiddleware, adminMiddleware, validate(actualizarEstadoSchema), lugaresController.actualizarEstado);
router.patch('/admin/:id', authMiddleware, adminMiddleware, validate(actualizarLugarAdminSchema), lugaresController.actualizarLugarAdmin);
router.delete('/admin/:id', authMiddleware, adminMiddleware, lugaresController.eliminarLugarAdmin);

module.exports = router;