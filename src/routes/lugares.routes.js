const express = require('express');
const router = express.Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const lugaresController = require('../controllers/lugares.controller');
const authMiddleware = require('../middleware/auth.middleware'); // Traemos al guardia
const adminMiddleware = require('../middleware/admin.middleware');
const validarId = require('../middleware/validarId.middleware');
const { esUrlDeFotoValida, esUrlDeGoogleMaps, esUrlDeWaze, esUrlHttp } = require('../utils/validarUrls');

// Enlace libre (video, 360°, menú, audio): cualquier sitio, pero solo http(s). z.string().url() por sí
// solo acepta 'javascript:...', que terminaría ejecutándose desde un href/iframe del frontend (XSS).
const urlHttp = (campo) =>
  z.string().max(2048, `${campo} es demasiado larga`).url(`${campo} debe ser una URL válida`)
    .refine(esUrlHttp, `${campo} tiene que empezar con http:// o https://`);

// Rangos reales de coordenadas: sin ellos se podían guardar pines en cualquier lugar del planeta (o fuera de él).
const latitudSchema = z.number().min(-90, 'Latitud fuera de rango').max(90, 'Latitud fuera de rango');
const longitudSchema = z.number().min(-180, 'Longitud fuera de rango').max(180, 'Longitud fuera de rango');
const CATEGORIAS = ['GASTRONOMIA', 'CULTURA', 'NATURALEZA', 'HISTORIA', 'ARTESANIA', 'ALOJAMIENTO'];

// Estos tres son campos compartidos por GRATIS y PREMIUM — sin verificar que el link
// sea realmente lo que dice ser, un negocio del plan Gratuito podría pegar cualquier
// URL ahí (un video, una red social, lo que sea) y de hecho estar usando esos campos
// como si fueran contenido premium. Si eso vale, no tiene sentido vender el plan pago.
const fotoUrlSchema = z.string().max(2048, 'fotoUrl es demasiado larga').url('fotoUrl debe ser una URL válida')
  .refine(esUrlDeFotoValida, 'La URL no parece ser una foto real (¿es un link a un video o una red social?)');
const mapsUrlSchema = z.string().max(2048, 'mapsUrl es demasiado larga').url('mapsUrl debe ser una URL válida')
  .refine(esUrlDeGoogleMaps, 'mapsUrl tiene que ser un link de Google Maps');
const wazeUrlSchema = z.string().max(2048, 'wazeUrl es demasiado larga').url('wazeUrl debe ser una URL válida')
  .refine(esUrlDeWaze, 'wazeUrl tiene que ser un link de Waze');

// Reglas para editar el contenido del lugar del negocio autenticado.
// Todos los campos son opcionales (PATCH = actualización parcial), pero debe venir al menos uno.
const actualizarLugarSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120, 'El nombre es demasiado largo').optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  latitud: latitudSchema.optional(),
  longitud: longitudSchema.optional(),
  descripcion: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(2000, 'La descripción es demasiado larga').optional(),
  subcategoria: z.string().trim().min(2, 'La subcategoría es muy corta').max(60, 'La subcategoría es demasiado larga').optional(),
  horarios: z.string().max(200, 'Los horarios son demasiado largos').optional(),
  mapsUrl: mapsUrlSchema.optional(),
  wazeUrl: wazeUrlSchema.optional(),
  fotoUrl: fotoUrlSchema.optional(),
  panoramaUrl: urlHttp('panoramaUrl').optional(),
  videoUrl: urlHttp('videoUrl').optional(),
  galeriaUrls: z.array(fotoUrlSchema).max(5, 'Máximo 5 fotos adicionales').optional(),
  whatsapp: z.string().trim().min(8, 'El número de WhatsApp es muy corto').max(25, 'El número de WhatsApp es demasiado largo').optional(),
  menuUrl: urlHttp('menuUrl').optional(),
  audioUrl: urlHttp('audioUrl').optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debés enviar al menos un campo para actualizar',
});

// Crear el lugar del negocio. Antes este endpoint no pasaba por Zod: la categoría o las coordenadas
// podían llegar con cualquier forma y el controlador las convertía a ciegas.
const crearLugarSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120, 'El nombre es demasiado largo'),
  descripcion: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(2000, 'La descripción es demasiado larga'),
  categoria: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(CATEGORIAS, { message: 'Categoría inválida' })),
  subcategoria: z.string().trim().max(60, 'La subcategoría es demasiado larga').optional(),
  latitud: z.coerce.number({ message: 'Latitud inválida' }).min(-90, 'Latitud fuera de rango').max(90, 'Latitud fuera de rango'),
  longitud: z.coerce.number({ message: 'Longitud inválida' }).min(-180, 'Longitud fuera de rango').max(180, 'Longitud fuera de rango'),
  tier: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(['GRATIS', 'PREMIUM'])).optional(),
});

// Borrar el lugar (mantiene la cuenta/login) requiere reingresar la contraseña.
const eliminarLugarSchema = z.object({
  password: z.string().min(1, 'La contraseña es obligatoria').max(72, 'La contraseña es demasiado larga'),
});

// [Admin] aprobar/rechazar un lugar
const actualizarEstadoSchema = z.object({
  estado: z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO']),
});

// [Admin] editar cualquier lugar: mismas reglas que actualizarLugarSchema, mas 'estado' opcional
// (el admin puede corregir contenido y aprobar/rechazar en el mismo paso).
const actualizarLugarAdminSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120, 'El nombre es demasiado largo').optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  latitud: latitudSchema.optional(),
  longitud: longitudSchema.optional(),
  descripcion: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(2000, 'La descripción es demasiado larga').optional(),
  subcategoria: z.string().trim().min(2, 'La subcategoría es muy corta').max(60, 'La subcategoría es demasiado larga').optional(),
  horarios: z.string().max(200, 'Los horarios son demasiado largos').optional(),
  mapsUrl: urlHttp('mapsUrl').optional(),
  wazeUrl: urlHttp('wazeUrl').optional(),
  fotoUrl: urlHttp('fotoUrl').optional(),
  panoramaUrl: urlHttp('panoramaUrl').optional(),
  videoUrl: urlHttp('videoUrl').optional(),
  galeriaUrls: z.array(urlHttp('Cada elemento de galeriaUrls')).max(5, 'Máximo 5 fotos adicionales').optional(),
  whatsapp: z.string().trim().min(8, 'El número de WhatsApp es muy corto').max(25, 'El número de WhatsApp es demasiado largo').optional(),
  menuUrl: urlHttp('menuUrl').optional(),
  audioUrl: urlHttp('audioUrl').optional(),
  estado: z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debés enviar al menos un campo para actualizar',
});

// [Admin] nota para el negocio: reemplaza a la edición directa de su lugar.
const comentarioSchema = z.object({
  texto: z.string().trim().min(3, 'El comentario debe tener al menos 3 caracteres').max(1000, 'El comentario no puede pasar de 1000 caracteres'),
});

// La edición directa de lugares ajenos está APAGADA por defecto (es mala señal que el equipo cambie lo que
// escribió cada negocio). Se puede reactivar sin tocar código con ADMIN_EDICION_LUGARES=true, por ejemplo
// para cargar contenido real antes de una entrega. Borrar y aprobar/rechazar siguen disponibles.
const edicionAdminHabilitada = (req, res, next) => {
  if (process.env.ADMIN_EDICION_LUGARES === 'true') return next();
  res.status(403).json({ error: 'La edición directa de lugares está desactivada. Dejale un comentario al negocio para que lo corrija él mismo.' });
};

// IMPORTANTE: '/mi-lugar' y '/admin/*' van antes de '/:id' para que Express no las confunda con un ID
router.param('id', validarId);

router.get('/', lugaresController.obtenerTodos);
router.get('/mi-lugar', authMiddleware, lugaresController.obtenerMiLugar);
router.get('/mi-lugar/comentarios', authMiddleware, lugaresController.obtenerMisComentarios);
router.get('/admin/pendientes', authMiddleware, adminMiddleware, lugaresController.obtenerPendientes);
router.get('/admin/todos', authMiddleware, adminMiddleware, lugaresController.obtenerTodosAdmin);
router.get('/:id', lugaresController.obtenerPorId);

router.post('/', authMiddleware, validate(crearLugarSchema), lugaresController.crear);
router.patch('/mi-lugar', authMiddleware, validate(actualizarLugarSchema), lugaresController.actualizarMiLugar);
router.delete('/mi-lugar', authMiddleware, validate(eliminarLugarSchema), lugaresController.eliminarMiLugar);
router.patch('/admin/:id/estado', authMiddleware, adminMiddleware, validate(actualizarEstadoSchema), lugaresController.actualizarEstado);
router.patch('/admin/:id', authMiddleware, adminMiddleware, edicionAdminHabilitada, validate(actualizarLugarAdminSchema), lugaresController.actualizarLugarAdmin);
router.get('/admin/:id/comentarios', authMiddleware, adminMiddleware, lugaresController.listarComentariosAdmin);
router.post('/admin/:id/comentarios', authMiddleware, adminMiddleware, validate(comentarioSchema), lugaresController.crearComentarioAdmin);
router.delete('/admin/comentarios/:comentarioId', authMiddleware, adminMiddleware, lugaresController.eliminarComentarioAdmin);
router.delete('/admin/:id', authMiddleware, adminMiddleware, lugaresController.eliminarLugarAdmin);

module.exports = router;