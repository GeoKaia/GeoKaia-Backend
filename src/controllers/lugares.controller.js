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
    res.status(500).json({ error: 'Error al obtener los lugares: ' + error.message });
  }
};

// 2. Obtener un único lugar por su ID
exports.obtenerPorId = async (req, res) => {
  try {
    const lugar = await prisma.lugar.findUnique({
      where: { 
        id: parseInt(req.params.id) 
      },
      include: {
        // Incluimos la relación del negocio y las paradas por si la UI necesita mostrar detalles adicionales
        negocio: true,
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
    res.status(500).json({ error: 'Error al obtener el lugar: ' + error.message });
  }
};

// 3. Crear un nuevo lugar vinculado al negocio autenticado
exports.crear = async (req, res) => {
  try {
    const { nombre, descripcion, categoria, subcategoria, latitud, longitud } = req.body;

    // Validación básica de campos requeridos para evitar fallos de base de datos
    if (!nombre || !descripcion || !categoria || latitud === undefined || longitud === undefined) {
      return res.status(400).json({ error: 'Todos los campos básicos son obligatorios' });
    }

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
        latitud: parseFloat(latitud),
        longitud: parseFloat(longitud),
        estado: 'PENDIENTE',
        negocio: {
          connect: { id: negocioId }
        }
      }
    });

    res.status(201).json({
      mensaje: 'Lugar creado. Va a aparecer en el mapa cuando el equipo de GeoKaia lo apruebe.',
      lugar: nuevoLugar
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el lugar: ' + error.message });
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
    res.status(500).json({ error: 'Error al obtener el lugar: ' + error.message });
  }
};

// 5. Editar el contenido (foto, video, galería, etc.) del lugar del negocio autenticado
exports.actualizarMiLugar = async (req, res) => {
  try {
    const negocioId = req.negocio?.id;
    if (!negocioId) {
      return res.status(401).json({ error: 'No autorizado: No se detectó un negocio válido en la sesión' });
    }

    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId } });
    if (!negocio?.lugarId) {
      return res.status(404).json({ error: 'Este negocio todavía no tiene un lugar asociado. Creá uno primero con POST /api/lugares' });
    }

    // Whitelist explícito: aunque llegue basura extra en el body (nombre, categoria, etc.)
    // solo se actualizan los campos de contenido. Los campos no enviados quedan como undefined
    // y Prisma los ignora, permitiendo updates parciales.
    const { descripcion, subcategoria, horarios, fotoUrl, panoramaUrl, videoUrl, galeriaUrls, whatsapp, menuUrl } = req.body;

    const lugarActualizado = await prisma.lugar.update({
      where: { id: negocio.lugarId },
      data: { descripcion, subcategoria, horarios, fotoUrl, panoramaUrl, videoUrl, galeriaUrls, whatsapp, menuUrl },
    });

    res.json({
      mensaje: 'Contenido del lugar actualizado exitosamente',
      lugar: lugarActualizado
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el lugar: ' + error.message });
  }
};

// 6. [Admin] Listar lugares pendientes de aprobación
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
    res.status(500).json({ error: 'Error al obtener los lugares pendientes: ' + error.message });
  }
};

// 7. [Admin] Aprobar o rechazar un lugar
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

    res.json({ mensaje: `Lugar marcado como ${estado}`, lugar });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el estado: ' + error.message });
  }
};