const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Inicialización obligatoria para Prisma 7
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// 1. Obtener todos los lugares
exports.obtenerTodos = async (req, res) => {
  try {
    const lugares = await prisma.lugar.findMany({
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
    const { nombre, descripcion, categoria, latitud, longitud } = req.body;

    // Validación básica de campos requeridos para evitar fallos de base de datos
    if (!nombre || !descripcion || !categoria || latitud === undefined || longitud === undefined) {
      return res.status(400).json({ error: 'Todos los campos básicos son obligatorios' });
    }

    // Extraemos de forma segura el ID del negocio inyectado por tu middleware de autenticación
    const negocioId = req.negocio?.id;
    if (!negocioId) {
      return res.status(401).json({ error: 'No autorizado: No se detectó un negocio válido en la sesión' });
    }

    // Prisma 7 es sumamente estricto con los tipos de datos. 
    // Convertimos lat/long a Float y forzamos la categoría a mayúsculas para que coincida exactamente con el Enum del schema.
    const nuevoLugar = await prisma.lugar.create({
      data: {
        nombre,
        descripcion,
        categoria: categoria.toUpperCase(), 
        latitud: parseFloat(latitud),
        longitud: parseFloat(longitud),
        negocio: {
          connect: { id: negocioId }
        }
      }
    });

    res.status(201).json({
      mensaje: 'Lugar creado exitosamente',
      lugar: nuevoLugar
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el lugar: ' + error.message });
  }
};