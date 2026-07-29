const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Va DESPUES de auth.middleware (necesita req.negocio.id ya seteado por el JWT).
// Consulta la base en vez de confiar en el JWT para que si le quitan esAdmin a alguien,
// el cambio pegue de inmediato sin esperar a que expire el token.
module.exports = async (req, res, next) => {
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: req.negocio?.id } });
    if (!negocio?.esAdmin) {
      return res.status(403).json({ error: 'No autorizado: se requieren permisos de administrador' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
