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

// Valida que cada lugarId de las paradas exista y ya esté aprobado (visible en el mapa
// público) — una ruta no puede armarse con lugares pendientes o inexistentes.
async function validarParadas(paradas) {
  const lugarIds = paradas.map((p) => p.lugarId);
  const lugares = await prisma.lugar.findMany({ where: { id: { in: lugarIds } } });
  const encontrados = new Map(lugares.map((l) => [l.id, l]));

  for (const lugarId of lugarIds) {
    const lugar = encontrados.get(lugarId);
    if (!lugar) return `El lugar con id ${lugarId} no existe`;
    if (lugar.estado !== 'APROBADO') return `El lugar "${lugar.nombre}" todavía no está aprobado`;
  }
  return null;
}

// [Admin] Crear una ruta con sus paradas (lugares ya aprobados) en un solo paso
exports.crear = async (req, res) => {
  try {
    const { nombre, categoria, descripcion, descripcionParaIA, fotoUrl, emoji, color, paradas } = req.body;

    const errorParadas = await validarParadas(paradas);
    if (errorParadas) return res.status(400).json({ error: errorParadas });

    const nuevaRuta = await prisma.$transaction(async (tx) => {
      const ruta = await tx.ruta.create({
        data: { nombre, categoria, descripcion, descripcionParaIA, fotoUrl, emoji, color },
      });
      await tx.paradaRuta.createMany({
        data: paradas.map((p, i) => ({
          rutaId: ruta.id,
          lugarId: p.lugarId,
          orden: p.orden ?? i,
          minutosAlSiguiente: p.minutosAlSiguiente ?? null,
          distanciaKm: p.distanciaKm ?? null,
        })),
      });
      return tx.ruta.findUnique({
        where: { id: ruta.id },
        include: { paradas: { include: { lugar: true }, orderBy: { orden: 'asc' } } },
      });
    });

    res.status(201).json({ mensaje: 'Ruta creada exitosamente', ruta: nuevaRuta });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la ruta: ' + error.message });
  }
};

// [Admin] Editar una ruta existente. Si llegan paradas nuevas, se reemplazan todas
// (borrar + recrear es más simple y confiable que diffear reordenamientos/inserciones).
exports.actualizar = async (req, res) => {
  try {
    const rutaId = parseInt(req.params.id);
    const { nombre, categoria, descripcion, descripcionParaIA, fotoUrl, emoji, color, paradas } = req.body;

    if (paradas) {
      const errorParadas = await validarParadas(paradas);
      if (errorParadas) return res.status(400).json({ error: errorParadas });
    }

    const rutaActualizada = await prisma.$transaction(async (tx) => {
      await tx.ruta.update({
        where: { id: rutaId },
        data: { nombre, categoria, descripcion, descripcionParaIA, fotoUrl, emoji, color },
      });

      if (paradas) {
        await tx.paradaRuta.deleteMany({ where: { rutaId } });
        await tx.paradaRuta.createMany({
          data: paradas.map((p, i) => ({
            rutaId,
            lugarId: p.lugarId,
            orden: p.orden ?? i,
            minutosAlSiguiente: p.minutosAlSiguiente ?? null,
            distanciaKm: p.distanciaKm ?? null,
          })),
        });
      }

      return tx.ruta.findUnique({
        where: { id: rutaId },
        include: { paradas: { include: { lugar: true }, orderBy: { orden: 'asc' } } },
      });
    });

    res.json({ mensaje: 'Ruta actualizada exitosamente', ruta: rutaActualizada });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la ruta: ' + error.message });
  }
};

// [Admin] Borrar una ruta (sus paradas primero, por la FK)
exports.eliminar = async (req, res) => {
  try {
    const rutaId = parseInt(req.params.id);
    await prisma.$transaction(async (tx) => {
      await tx.paradaRuta.deleteMany({ where: { rutaId } });
      await tx.ruta.delete({ where: { id: rutaId } });
    });
    res.json({ mensaje: 'Ruta eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la ruta: ' + error.message });
  }
};
