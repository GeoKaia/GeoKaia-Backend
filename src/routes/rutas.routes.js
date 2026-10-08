const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const rutasController = require('../controllers/rutas.controller');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');
const validarId = require('../middleware/validarId.middleware');
const { esUrlHttp } = require('../utils/validarUrls');

const urlHttp = (campo) =>
  z.string().max(2048, `${campo} es demasiado larga`).url(`${campo} debe ser una URL válida`)
    .refine(esUrlHttp, `${campo} tiene que empezar con http:// o https://`);

// Misma paleta que src/lib/colores.js (PALETA_EXTENDIDA) en el frontend — colores ya
// pensados para contrastar bien con texto blanco, evita calcular contraste en runtime.
const PALETA_COLORES = [
  '#AC6727', '#10546F', '#2989A3', '#6B8548', '#9C4A3C',
  '#3A2B1D', '#C89B3C', '#4F7A72', '#7D5A73', '#BCB1A1',
];

const paradaSchema = z.object({
  lugarId: z.number().int().positive(),
  orden: z.number().int().optional(),
  minutosAlSiguiente: z.number().int().nonnegative().nullable().optional(),
  distanciaKm: z.number().nonnegative().nullable().optional(),
});

const crearRutaSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120, 'El nombre es demasiado largo'),
  categoria: z.string().trim().min(2, 'La categoría es muy corta').max(60, 'La categoría es demasiado larga'),
  descripcion: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(2000, 'La descripción es demasiado larga'),
  descripcionParaIA: z.string().trim().min(10, 'La descripción para la IA debe tener al menos 10 caracteres').max(2000, 'La descripción para la IA es demasiado larga'),
  fotoUrl: urlHttp('fotoUrl').optional(),
  emoji: z.string().max(8, 'El emoji es muy largo').optional(),
  color: z.enum(PALETA_COLORES, { message: 'Elegí un color de la paleta disponible' }).optional(),
  paradas: z.array(paradaSchema).min(1, 'La ruta necesita al menos un lugar').max(30, 'Máximo 30 paradas'),
});

const actualizarRutaSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120, 'El nombre es demasiado largo').optional(),
  categoria: z.string().trim().min(2, 'La categoría es muy corta').max(60, 'La categoría es demasiado larga').optional(),
  descripcion: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(2000, 'La descripción es demasiado larga').optional(),
  descripcionParaIA: z.string().trim().min(10, 'La descripción para la IA debe tener al menos 10 caracteres').max(2000, 'La descripción para la IA es demasiado larga').optional(),
  fotoUrl: urlHttp('fotoUrl').optional(),
  emoji: z.string().max(8, 'El emoji es muy largo').optional(),
  color: z.enum(PALETA_COLORES, { message: 'Elegí un color de la paleta disponible' }).optional(),
  paradas: z.array(paradaSchema).min(1, 'La ruta necesita al menos un lugar').max(30, 'Máximo 30 paradas').optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debés enviar al menos un campo para actualizar',
});

router.param('id', validarId);

router.get('/', rutasController.obtenerTodas);
router.post('/', authMiddleware, adminMiddleware, validate(crearRutaSchema), rutasController.crear);
router.patch('/:id', authMiddleware, adminMiddleware, validate(actualizarRutaSchema), rutasController.actualizar);
router.delete('/:id', authMiddleware, adminMiddleware, rutasController.eliminar);

module.exports = router;
