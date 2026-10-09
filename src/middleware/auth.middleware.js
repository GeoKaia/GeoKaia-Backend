const sesiones = require('../services/sesiones');
const { borrarCookie } = require('../utils/sesion');
const { responderError } = require('../utils/errores');

// Autenticación obligatoria. La identidad y el rol salen SIEMPRE de la base de datos (tabla Sesion + Negocio), nunca
// de lo que mande el navegador: cambiar o borrar datos locales no da ni quita privilegios.
//   req.negocio = { id, email, esAdmin }      req.sesion = { id, ... }
const MENSAJES = {
  sin_cookie: 'Token requerido: iniciá sesión para continuar',
  desconocida: 'Sesión no válida: iniciá sesión de nuevo',
  revocada: 'Sesión cerrada: iniciá sesión de nuevo',
  expirada: 'Sesión vencida: iniciá sesión de nuevo',
  inactividad: 'Sesión vencida por inactividad: iniciá sesión de nuevo',
};

module.exports = async (req, res, next) => {
  try {
    const r = await sesiones.validar(req);
    if (!r.ok) {
      // Cookie presente pero inservible: se borra del navegador para no seguir mandándola.
      if (r.motivo !== 'sin_cookie') borrarCookie(res);
      return res.status(401).json({ error: MENSAJES[r.motivo] || MENSAJES.desconocida, codigo: r.motivo });
    }
    req.negocio = r.negocio;
    req.sesion = r.sesion;
    next();
  } catch (err) {
    responderError(res, err, 'Error al validar la sesión');
  }
};
