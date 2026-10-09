const jwt = require('jsonwebtoken');
const { leerToken } = require('../utils/sesion');
const { renovarDesdeRefresco } = require('../utils/refresco');
const { responderError } = require('../utils/errores');

module.exports = async (req, res, next) => {
  // El token viaja solo en la cookie httpOnly (ver utils/sesion.js): ya no se acepta por cabecera.
  const token = leerToken(req);

  if (token) {
    try {
      // Se fija el algoritmo para que nadie pueda presentar un token firmado con otro (por ejemplo 'none').
      req.negocio = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      return next();
    } catch (err) {
      // Vencido o inválido: se intenta con la cookie de dispositivo antes de rechazar.
    }
  }

  // Sin cookie de acceso (por ejemplo la borraron desde F12) o vencida: si este dispositivo sigue registrado,
  // se emite una cookie de acceso nueva y la persona no se desloguea.
  try {
    const datos = await renovarDesdeRefresco(req, res);
    if (datos) {
      req.negocio = datos;
      return next();
    }
  } catch (err) {
    return responderError(res, err, 'Error al validar la sesión');
  }

  if (token) return res.status(403).json({ error: 'Token inválido o expirado' });
  return res.status(401).json({ error: 'Token requerido' });
};
