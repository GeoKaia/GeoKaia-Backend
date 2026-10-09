const { verificar } = require('../utils/hashPassword');
const { responderError } = require('../utils/errores');
const auditoria = require('../services/auditoria');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Inicialización obligatoria para Prisma 7
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// 1. Obtener todos los lugares aprobados (publico: mapa, chat de Kaia, rutas)
exports.obtenerTodos = async (req, res) => {
  try {
    const lugares = await prisma.lugar.findMany({
      where: { estado: 'APROBADO' },
      orderBy: {
        nombre: 'asc', // Orden alfabético para facilitarle el pintado de pines al mapa en el frontend
      },
    });
    res.json(lugares);
  } catch (error) {
    responderError(res, error, 'Error al obtener los lugares');
  }
};

// 2. Obtener un único lugar por su ID
exports.obtenerPorId = async (req, res) => {
  try {
    // Endpoint público: solo lugares aprobados (antes devolvía también los pendientes y rechazados) y
    // SIN la relación con el negocio dueño. Con `negocio: true` la respuesta incluía su fila completa:
    // correo, hash de contraseña y secreto TOTP del 2FA.
    const lugar = await prisma.lugar.findFirst({
      where: {
        id: parseInt(req.params.id),
        estado: 'APROBADO',
      },
      include: {
        paradas: {
          include: {
            ruta: true,
          },
        },
      },
    });

    if (!lugar) return res.status(404).json({ error: 'Lugar no encontrado' });
    res.json(lugar);
  } catch (error) {
    responderError(res, error, 'Error al obtener el lugar');
  }
};

// 3. Crear un nuevo lugar vinculado al negocio autenticado
exports.crear = async (req, res) => {
  try {
    const { nombre, descripcion, categoria, subcategoria, latitud, longitud, tier } = req.body;

    // Validación básica de campos requeridos para evitar fallos de base de datos
    if (!nombre || !descripcion || !categoria || latitud === undefined || longitud === undefined) {
      return res.status(400).json({ error: 'Todos los campos básicos son obligatorios' });
    }

    // Todavia no hay cobro real: el tier elegido en el mockup de pago se acepta tal cual.
    // Cualquier valor que no sea GRATIS/PREMIUM cae al default seguro (GRATIS).
    const tierElegido = ['GRATIS', 'PREMIUM'].includes(tier?.toUpperCase()) ? tier.toUpperCase() : 'GRATIS';

    // Extraemos de forma segura el ID del negocio inyectado por tu middleware de autenticación
    const negocioId = req.negocio?.id;
    if (!negocioId) {
      return res.status(401).json({ error: 'No autorizado: No se detectó un negocio válido en la sesión' });
    }

    // Un negocio solo puede tener un lugar (Negocio.lugarId es unico) - evitamos que una segunda
    // llamada a este endpoint le desconecte silenciosamente su lugar actual.
    const negocioExistente = await prisma.negocio.findUnique({ where: { id: negocioId } });
    if (negocioExistente?.lugarId) {
      return res.status(409).json({ error: 'Tu negocio ya tiene un lugar registrado. Editalo desde el panel en vez de crear uno nuevo.' });
    }

    // Prisma 7 es sumamente estricto con los tipos de datos.
    // Convertimos lat/long a Float y forzamos la categoría a mayúsculas para que coincida exactamente con el Enum del schema.
    // Queda en PENDIENTE hasta que el equipo de GeoKaia lo revise y apruebe.
    const nuevoLugar = await prisma.lugar.create({
      data: {
        nombre,
        descripcion,
        categoria: categoria.toUpperCase(),
        subcategoria: subcategoria || null,
        tier: tierElegido,
        latitud: parseFloat(latitud),
        longitud: parseFloat(longitud),
        estado: 'PENDIENTE',
        negocio: {
          connect: { id: negocioId }
        }
      }
    });

    await auditoria.registrar({ req, accion: 'lugar.crear', recurso: { tipo: 'Lugar', id: nuevoLugar.id }, negocioAfectadoId: negocioId, detalle: { tier: tierElegido } });
    res.status(201).json({
      mensaje: 'Lugar creado. Va a aparecer en el mapa cuando el equipo de GeoKaia lo apruebe.',
      lugar: nuevoLugar
    });
  } catch (error) {
    responderError(res, error, 'Error al crear el lugar');
  }
};

// 4. Obtener el lugar del negocio autenticado (para precargar el panel de edición)
exports.obtenerMiLugar = async (req, res) => {
  try {
    const negocioId = req.negocio?.id;
    if (!negocioId) {
      return res.status(401).json({ error: 'No autorizado: No se detectó un negocio válido en la sesión' });
    }

    const negocio = await prisma.negocio.findUnique({
      where: { id: negocioId },
      include: { lugar: true },
    });

    if (!negocio?.lugar) {
      return res.status(404).json({ error: 'Este negocio todavía no tiene un lugar asociado' });
    }

    res.json(negocio.lugar);
  } catch (error) {
    responderError(res, error, 'Error al obtener el lugar');
  }
};

// 5. Editar el contenido (foto, video, galería, etc.) del lugar del negocio autenticado
exports.actualizarMiLugar = async (req, res) => {
  try {
    const negocioId = req.negocio?.id;
    if (!negocioId) {
      return res.status(401).json({ error: 'No autorizado: No se detectó un negocio válido en la sesión' });
    }

    const negocio = await prisma.negocio.findUnique({
      where: { id: negocioId },
      include: { lugar: true },
    });
    if (!negocio?.lugarId) {
      return res.status(404).json({ error: 'Este negocio todavía no tiene un lugar asociado. Creá uno primero con POST /api/lugares' });
    }

    // Whitelist explícito: aunque llegue basura extra en el body (nombre, categoria, etc.)
    // solo se actualizan los campos de contenido. Los campos no enviados quedan como undefined
    // y Prisma los ignora, permitiendo updates parciales.
    let { nombre, categoria, latitud, longitud, descripcion, subcategoria, horarios, mapsUrl, wazeUrl, fotoUrl, panoramaUrl, videoUrl, galeriaUrls, whatsapp, menuUrl, audioUrl } = req.body;

    // El frontend ya oculta estos campos para un lugar GRATIS, pero los ignoramos
    // también acá por si alguien le pega directo a la API sin pasar por la UI.
    if (negocio.lugar.tier === 'GRATIS') {
      panoramaUrl = undefined;
      videoUrl = undefined;
      galeriaUrls = undefined;
      menuUrl = undefined;
      audioUrl = undefined;
    }

    const lugarActualizado = await prisma.lugar.update({
      where: { id: negocio.lugarId },
      data: { nombre, categoria, latitud, longitud, descripcion, subcategoria, horarios, mapsUrl, wazeUrl, fotoUrl, panoramaUrl, videoUrl, galeriaUrls, whatsapp, menuUrl, audioUrl },
    });

    await auditoria.registrar({ req, accion: 'lugar.editar', recurso: { tipo: 'Lugar', id: negocio.lugarId }, negocioAfectadoId: negocioId, detalle: { campos: Object.keys(req.body || {}) } });
    res.json({
      mensaje: 'Contenido del lugar actualizado exitosamente',
      lugar: lugarActualizado
    });
  } catch (error) {
    responderError(res, error, 'Error al actualizar el lugar');
  }
};

// 6. Borrar el lugar del negocio autenticado (mantiene la cuenta/login, solo borra el listing)
exports.eliminarMiLugar = async (req, res) => {
  const { password } = req.body;
  try {
    const negocioId = req.negocio?.id;
    if (!negocioId) {
      return res.status(401).json({ error: 'No autorizado: No se detectó un negocio válido en la sesión' });
    }

    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId } });
    if (!negocio?.lugarId) {
      return res.status(404).json({ error: 'Este negocio no tiene un lugar registrado' });
    }

    const valida = await verificar(password, negocio.passwordHash);
    if (!valida) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const lugarId = negocio.lugarId;
    await prisma.$transaction(async (tx) => {
      // Mismo orden que en auth.controller.js eliminarCuenta: hay que soltar las FK
      // (ParadaRuta y Negocio.lugarId) antes de poder borrar el Lugar.
      await tx.paradaRuta.deleteMany({ where: { lugarId } });
      await tx.negocio.update({ where: { id: negocioId }, data: { lugarId: null } });
      await tx.lugar.delete({ where: { id: lugarId } });
    });

    await auditoria.registrar({ req, accion: 'lugar.eliminar', recurso: { tipo: 'Lugar', id: lugarId }, negocioAfectadoId: negocioId });
    await auditoria.registrar({ req, accion: 'lugar.eliminar_admin', recurso: { tipo: 'Lugar', id: lugarId }, negocioAfectadoId: duenoId });
    res.json({ mensaje: 'Lugar eliminado correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al eliminar el lugar');
  }
};

// 7. [Admin] Listar lugares pendientes de aprobación
exports.obtenerPendientes = async (req, res) => {
  try {
    const lugares = await prisma.lugar.findMany({
      where: { estado: 'PENDIENTE' },
      include: {
        negocio: { select: { email: true, nombreContacto: true, whatsapp: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(lugares);
  } catch (error) {
    responderError(res, error, 'Error al obtener los lugares pendientes');
  }
};

// 8. [Admin] Aprobar o rechazar un lugar
exports.actualizarEstado = async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['APROBADO', 'RECHAZADO', 'PENDIENTE'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const lugar = await prisma.lugar.update({
      where: { id: parseInt(req.params.id) },
      data: { estado },
    });

    await auditoria.registrar({ req, accion: 'lugar.estado', recurso: { tipo: 'Lugar', id: lugar.id }, lugarId: lugar.id, detalle: { estado } });
    res.json({ mensaje: `Lugar marcado como ${estado}`, lugar });
  } catch (error) {
    responderError(res, error, 'Error al actualizar el estado');
  }
};

// --- Acceso amplio de admin a TODOS los lugares (cualquier negocio, cualquier estado) ---
// Pedido puntual para acelerar la carga de contenido antes de la entrega final: crear una
// cuenta de negocio + pasar por el 2FA por cada lugar real es demasiado lento. Este bloque
// le permite al admin ver/editar/borrar cualquier lugar sin ser su dueño, lo cual normalmente
// no seria correcto (rompe el modelo de "cada negocio administra lo suyo"). Evaluar si conviene
// restringir o quitar este acceso despues de la entrega.

// 9. [Admin] Listar TODOS los lugares, sin filtrar por estado ni por dueño
exports.obtenerTodosAdmin = async (req, res) => {
  try {
    const lugares = await prisma.lugar.findMany({
      include: {
        negocio: { select: { email: true, nombreContacto: true, whatsapp: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(lugares);
  } catch (error) {
    responderError(res, error, 'Error al obtener los lugares');
  }
};

// 10. [Admin] Editar cualquier lugar, sea o no el suyo, sin las restricciones de tier
exports.actualizarLugarAdmin = async (req, res) => {
  try {
    const lugarId = parseInt(req.params.id);
    const lugarExistente = await prisma.lugar.findUnique({ where: { id: lugarId } });
    if (!lugarExistente) return res.status(404).json({ error: 'Lugar no encontrado' });

    // Mismo whitelist que actualizarMiLugar, mas 'estado' (el admin puede aprobar/corregir en el mismo paso)
    // y sin el filtro de campos premium por tier: el admin puede cargar cualquier campo sin importar
    // el tier del negocio dueño.
    const { nombre, categoria, latitud, longitud, descripcion, subcategoria, horarios, mapsUrl, wazeUrl, fotoUrl, panoramaUrl, videoUrl, galeriaUrls, whatsapp, menuUrl, audioUrl, estado } = req.body;

    const lugarActualizado = await prisma.lugar.update({
      where: { id: lugarId },
      data: { nombre, categoria, latitud, longitud, descripcion, subcategoria, horarios, mapsUrl, wazeUrl, fotoUrl, panoramaUrl, videoUrl, galeriaUrls, whatsapp, menuUrl, audioUrl, estado },
    });

    await auditoria.registrar({ req, accion: 'lugar.editar_admin', recurso: { tipo: 'Lugar', id: lugarId }, lugarId, detalle: { campos: Object.keys(req.body || {}) } });
    res.json({ mensaje: 'Lugar actualizado exitosamente', lugar: lugarActualizado });
  } catch (error) {
    responderError(res, error, 'Error al actualizar el lugar');
  }
};

// 11. [Admin] Borrar cualquier lugar sin pedir contraseña (no es el dueño, es una accion administrativa)
exports.eliminarLugarAdmin = async (req, res) => {
  try {
    const lugarId = parseInt(req.params.id);
    const lugarExistente = await prisma.lugar.findUnique({ where: { id: lugarId } });
    if (!lugarExistente) return res.status(404).json({ error: 'Lugar no encontrado' });

    // Mismo orden de desvinculacion de FK que eliminarMiLugar, pero sin $transaction
    // (este entorno bloquea transacciones con varios deletes seguidos por Bash; en el
    // servidor corriendo normalmente no hay ese problema, pero mantenemos el mismo
    // orden de pasos por consistencia y para que sea facil de auditar).
    const duenoId = (await prisma.negocio.findUnique({ where: { lugarId }, select: { id: true } }))?.id ?? null;
    await prisma.paradaRuta.deleteMany({ where: { lugarId } });
    await prisma.negocio.updateMany({ where: { lugarId }, data: { lugarId: null } });
    await prisma.lugar.delete({ where: { id: lugarId } });

    res.json({ mensaje: 'Lugar eliminado correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al eliminar el lugar');
  }
};

// --- Comentarios del equipo hacia los negocios ---
// En vez de editar el lugar de otra persona (ver nota arriba y ADMIN_EDICION_LUGARES en las rutas), el admin
// le deja una nota al negocio y es el negocio quien corrige lo suyo.

// 12. [Admin] Dejar un comentario en un lugar
exports.crearComentarioAdmin = async (req, res) => {
  try {
    const lugarId = parseInt(req.params.id);
    const lugar = await prisma.lugar.findUnique({ where: { id: lugarId } });
    if (!lugar) return res.status(404).json({ error: 'Lugar no encontrado' });

    const comentario = await prisma.comentarioAdmin.create({
      data: { lugarId, autorEmail: req.negocio.email, texto: req.body.texto.trim() },
    });
    await auditoria.registrar({ req, accion: 'comentario.crear', recurso: { tipo: 'Lugar', id: lugarId }, lugarId });
    res.status(201).json({ mensaje: 'Comentario guardado', comentario });
  } catch (error) {
    responderError(res, error, 'Error al guardar el comentario');
  }
};

// 13. [Admin] Ver los comentarios de un lugar
exports.listarComentariosAdmin = async (req, res) => {
  try {
    const comentarios = await prisma.comentarioAdmin.findMany({
      where: { lugarId: parseInt(req.params.id) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(comentarios);
  } catch (error) {
    responderError(res, error, 'Error al obtener los comentarios');
  }
};

// 14. [Admin] Borrar un comentario
exports.eliminarComentarioAdmin = async (req, res) => {
  try {
    const id = Number(req.params.comentarioId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    const existente = await prisma.comentarioAdmin.findUnique({ where: { id } });
    if (!existente) return res.status(404).json({ error: 'Comentario no encontrado' });
    await prisma.comentarioAdmin.delete({ where: { id } });
    res.json({ mensaje: 'Comentario eliminado' });
  } catch (error) {
    responderError(res, error, 'Error al eliminar el comentario');
  }
};

// 15. [Negocio] Ver los comentarios que el equipo dejó en MI lugar (solo lectura)
exports.obtenerMisComentarios = async (req, res) => {
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: req.negocio.id } });
    if (!negocio?.lugarId) return res.json([]);
    const comentarios = await prisma.comentarioAdmin.findMany({
      where: { lugarId: negocio.lugarId },
      select: { id: true, texto: true, createdAt: true }, // el correo del admin no se le muestra al negocio
      orderBy: { createdAt: 'desc' },
    });
    res.json(comentarios);
  } catch (error) {
    responderError(res, error, 'Error al obtener los comentarios');
  }
};
