const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Inicialización obligatoria para Prisma 7
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });


exports.obtenerTodos = async (req, res) => {
  try {
    const lugares = await prisma.lugar.findMany();
    res.json(lugares);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los lugares: ' + error.message });
  }
};

exports.obtenerPorId = async (req, res) => {
  try {
    const lugar = await prisma.lugar.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!lugar) return res.status(404).json({ error: 'Lugar no encontrado' });
    res.json(lugar);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el lugar: ' + error.message });
  }
};

exports.crear = async (req, res) => {
  try {
    const { nombre, descripcion, categoria, latitud, longitud } = req.body;
    
    const negocioId = req.negocio.id;

    const nuevoLugar = await prisma.lugar.create({
      data: {
        nombre,
        descripcion,
        categoria, 
        latitud,
        longitud,
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