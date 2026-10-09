const { responderError } = require('../utils/errores');
const auditoria = require('../services/auditoria');
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
      // Un intento de entrar a una función de administración sin serlo queda en el historial.
      await auditoria.registrar({ req, accion: 'acceso.denegado_admin', resultado: 'DENEGADO', detalle: { metodo: req.method, ruta: req.originalUrl.split('?')[0] } });
      return res.status(403).json({ error: 'No autorizado: se requieren permisos de administrador' });
    }
    // El rol sale de la base en cada petición, no del token: así los permisos no se pueden falsificar desde el cliente.
    req.negocio.esAdmin = true;
    next();
  } catch (err) {
    responderError(res, err);
  }
};
