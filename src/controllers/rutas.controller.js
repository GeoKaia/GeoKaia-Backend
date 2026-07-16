const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

exports.obtenerTodas = async (req, res) => {
  try {
    const rutas = await prisma.ruta.findMany({
      include: {
        paradas: {
          include: { lugar: true },
          orderBy: { orden: 'asc' },
        },
      },
    });
    res.json(rutas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las rutas: ' + error.message });
  }
};

exports.crear = async (req, res) => {
  try {
    const { nombre, categoria, descripcion, descripcionParaIA } = req.body;
    
    // Validación de seguridad para que Prisma no crashee si llega un campo vacío
    if (!nombre || !categoria || !descripcion || !descripcionParaIA) {
      return res.status(400).json({ error: 'Todos los campos de la ruta son obligatorios' });
    }
    
    // Inyectado por el middleware de autenticación (agregamos el ? por seguridad)
    const negocioId = req.negocio?.id;
    if (!negocioId) {
      return res.status(401).json({ error: 'No autorizado: Falta token de negocio' });
    }

    const nuevaRuta = await prisma.ruta.create({
      data: {
        nombre,
        categoria,
        descripcion,
        descripcionParaIA,
        negocio: {
          connect: { id: negocioId }
        }
      }
    });

    res.status(201).json({
      mensaje: 'Ruta creada exitosamente',
      ruta: nuevaRuta
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la ruta: ' + error.message });
  }
};