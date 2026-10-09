const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { fijarCookie, fijarCookieRefresco, borrarCookieRefresco, leerTokenRefresco, DIAS_REFRESCO } = require('./sesion');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// "Cookie de dispositivo": un token aleatorio y opaco (32 bytes). En la base solo se guarda su hash SHA-256, así que
// quien lea la tabla no puede usar los valores. No tiene datos dentro: si se borra el registro, deja de servir.
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Se llama al terminar el 2FA: registra este dispositivo y deja su cookie.
exports.emitirRefresco = async (res, negocioId) => {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.sesionRefresco.create({
    data: { negocioId, tokenHash: hash(token), expiraEn: new Date(Date.now() + DIAS_REFRESCO * 24 * 60 * 60 * 1000) },
  });
  fijarCookieRefresco(res, token);
  // Limpieza oportunista de los vencidos, sin frenar la respuesta si falla.
  prisma.sesionRefresco.deleteMany({ where: { expiraEn: { lt: new Date() } } }).catch(() => {});
};

// Si la cookie de acceso falta o venció pero la de dispositivo sigue vigente, emite una cookie de acceso nueva.
// Devuelve { id, email } o null si no hay dispositivo válido. No rota el token a propósito: el navegador manda varias
// peticiones en paralelo y una rotación dejaría a las demás sin sesión.
exports.renovarDesdeRefresco = async (req, res) => {
  const token = leerTokenRefresco(req);
  if (!token) return null;

  const registro = await prisma.sesionRefresco.findUnique({
    where: { tokenHash: hash(token) },
    include: { negocio: { select: { id: true, email: true } } },
  });
  if (!registro || registro.expiraEn < new Date()) {
    borrarCookieRefresco(res);
    return null;
  }

  const datos = { id: registro.negocio.id, email: registro.negocio.email };
  fijarCookie(res, jwt.sign(datos, process.env.JWT_SECRET, { expiresIn: '8h', algorithm: 'HS256' }));
  return datos;
};

// Cerrar sesión: el dispositivo deja de valer en el servidor aunque alguien conserve la cookie.
// Solo borra el registro del servidor; quitar las cookies del navegador lo hace borrarCookie (utils/sesion.js).
exports.revocarRefresco = async (req) => {
  const token = leerTokenRefresco(req);
  if (token) await prisma.sesionRefresco.deleteMany({ where: { tokenHash: hash(token) } });
};
