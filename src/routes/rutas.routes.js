const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const rutasController = require('../controllers/rutas.controller');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');

// Misma paleta que src/lib/colores.js (PALETA_EXTENDIDA) en el frontend — colores ya
// pensados para contrastar bien con texto blanco, evita calcular contraste en runtime.
const PALETA_COLORES = [
  '#AC6727', '#10546F', '#2989A3', '#6B8548', '#9C4A3C',
  '#3A2B1D', '#C89B3C', '#4F7A72', '#7D5A73', '#BCB1A1',
];

const paradaSchema = z.object({
  lugarId: z.number().int(),
  orden: z.number().int().optional(),
  minutosAlSiguiente: z.number().int().nonnegative().nullable().optional(),
  distanciaKm: z.number().nonnegative().nullable().optional(),
});

const crearRutaSchema = z.object({
  nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  categoria: z.string().min(2, 'La categoría es muy corta'),
  descripcion: z.string().min(10, 'La descripción debe tener al menos 10 caracteres'),
  descripcionParaIA: z.string().min(10, 'La descripción para la IA debe tener al menos 10 caracteres'),
  fotoUrl: z.string().url('fotoUrl debe ser una URL válida').optional(),
  emoji: z.string().max(8, 'El emoji es muy largo').optional(),
  color: z.enum(PALETA_COLORES, { message: 'Elegí un color de la paleta disponible' }).optional(),
  paradas: z.array(paradaSchema).min(1, 'La ruta necesita al menos un lugar'),
});

const actualizarRutaSchema = z.object({
  nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').optional(),
  categoria: z.string().min(2, 'La categoría es muy corta').optional(),
  descripcion: z.string().min(10, 'La descripción debe tener al menos 10 caracteres').optional(),
  descripcionParaIA: z.string().min(10, 'La descripción para la IA debe tener al menos 10 caracteres').optional(),
  fotoUrl: z.string().url('fotoUrl debe ser una URL válida').optional(),
  emoji: z.string().max(8, 'El emoji es muy largo').optional(),
  color: z.enum(PALETA_COLORES, { message: 'Elegí un color de la paleta disponible' }).optional(),
  paradas: z.array(paradaSchema).min(1, 'La ruta necesita al menos un lugar').optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debés enviar al menos un campo para actualizar',
});

router.get('/', rutasController.obtenerTodas);
router.post('/', authMiddleware, adminMiddleware, validate(crearRutaSchema), rutasController.crear);
router.patch('/:id', authMiddleware, adminMiddleware, validate(actualizarRutaSchema), rutasController.actualizar);
router.delete('/:id', authMiddleware, adminMiddleware, rutasController.eliminar);

module.exports = router;
