const { responderError } = require('../utils/errores');
const auditoria = require('../services/auditoria');

// Va DESPUÉS de auth.middleware. auth.middleware ya cargó el rol desde la base en esta misma petición (no desde el
// navegador), así que si a alguien le quitan o le dan esAdmin el cambio aplica de inmediato.
module.exports = async (req, res, next) => {
  try {
    if (!req.negocio?.esAdmin) {
      // Un intento de entrar a una función de administración sin serlo queda en el historial.
      await auditoria.registrar({ req, accion: 'acceso.denegado_admin', resultado: 'DENEGADO', detalle: { metodo: req.method, ruta: req.originalUrl.split('?')[0] } });
      return res.status(403).json({ error: 'No autorizado: se requieren permisos de administrador' });
    }
    next();
  } catch (err) {
    responderError(res, err);
  }
};
