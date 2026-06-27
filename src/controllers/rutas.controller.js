const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

exports.obtenerTodas = async (req, res) => {
  try {
    const rutas = await prisma.ruta.findMany();
    res.json(rutas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las rutas: ' + error.message });
  }
};

exports.crear = async (req, res) => {
  try {
    // Nota: Ajusta estos campos si tu schema.prisma tiene nombres diferentes para la Ruta
    const { nombre, descripcion, tiempoEstimado } = req.body;
    
    // Inyectado por tu middleware de autenticación
    const negocioId = req.negocio.id;

    const nuevaRuta = await prisma.ruta.create({
      data: {
        nombre,
        descripcion,
        tiempoEstimado,
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