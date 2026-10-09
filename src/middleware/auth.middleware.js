const jwt = require('jsonwebtoken');
const { leerToken } = require('../utils/sesion');

module.exports = (req, res, next) => {
  // El token viaja solo en la cookie httpOnly (ver utils/sesion.js): ya no se acepta por cabecera.
  const token = leerToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    // Se fija el algoritmo para que nadie pueda presentar un token firmado con otro (por ejemplo 'none').
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.negocio = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};