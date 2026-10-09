const crypto = require('crypto');
const { prisma } = require('../db');
const { fijarCookie, borrarCookie, leerCookie } = require('../utils/sesion');
const auditoria = require('./auditoria');

// Sesiones del lado del servidor. El servidor es quien decide quién es la persona, hasta cuándo vale la sesión y qué
// permisos tiene: la cookie solo es una llave opaca. Cada petición protegida se valida contra la base, así que
// revocar o expirar una sesión surte efecto de inmediato.
//  - Duración máxima absoluta (SESION_MAX_HORAS, 8 h por defecto): pasado ese tiempo hay que iniciar sesión de nuevo.
//  - Expiración por inactividad (SESION_INACTIVIDAD_MIN, 30 min por defecto).
//  - El identificador se regenera en cada inicio de sesión (contra la fijación de sesión).
//  - En la base solo se guarda el hash SHA-256 del identificador: quien lea la tabla no puede usarlo.

const maxHoras = () => (Number(process.env.SESION_MAX_HORAS) > 0 ? Number(process.env.SESION_MAX_HORAS) : 8);
const inactividadMin = () => (Number(process.env.SESION_INACTIVIDAD_MIN) > 0 ? Number(process.env.SESION_INACTIVIDAD_MIN) : 30);
const ACTUALIZAR_ACTIVIDAD_CADA_MS = 60 * 1000; // no se escribe en la base en cada petición, solo una vez por minuto

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Crea una sesión nueva para la cuenta y deja la cookie. Si el navegador ya traía una cookie de sesión, esa sesión se
// revoca: un identificador que existía antes del login nunca pasa a estar autenticado.
async function crear(req, res, negocio) {
  const anterior = leerCookie(req);
  if (anterior) {
    await prisma.sesion.updateMany({ where: { tokenHash: hash(anterior), revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'regenerada_en_login' } });
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const ahora = Date.now();
  const expiraEn = new Date(ahora + maxHoras() * 60 * 60 * 1000);
  const sesion = await prisma.sesion.create({
    data: {
      tokenHash: hash(token),
      negocioId: negocio.id,
      expiraEn,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 300) : null,
    },
  });
  fijarCookie(res, token, { maxAgeMs: negocio.esAdmin ? undefined : maxHoras() * 60 * 60 * 1000 });
  // Limpieza oportunista de sesiones muertas hace más de 30 días (sin frenar la respuesta).
  prisma.sesion.deleteMany({ where: { OR: [{ expiraEn: { lt: new Date(ahora - 30 * 864e5) } }, { revocadaEn: { lt: new Date(ahora - 30 * 864e5) } }] } }).catch(() => {});
  return sesion;
}

// Valida la cookie de la petición. Devuelve { ok: true, sesion, negocio } o { ok: false, motivo }.
async function validar(req) {
  const token = leerCookie(req);
  if (!token) return { ok: false, motivo: 'sin_cookie' };
  const sesion = await prisma.sesion.findUnique({
    where: { tokenHash: hash(token) },
    include: { negocio: { select: { id: true, email: true, esAdmin: true, esResponsable: true } } },
  });
  if (!sesion) return { ok: false, motivo: 'desconocida' };
  if (sesion.revocadaEn) return { ok: false, motivo: 'revocada', sesion };
  const ahora = Date.now();
  if (sesion.expiraEn.getTime() <= ahora) return { ok: false, motivo: 'expirada', sesion };
  if (ahora - sesion.ultimaActividad.getTime() > inactividadMin() * 60 * 1000) return { ok: false, motivo: 'inactividad', sesion };
  if (ahora - sesion.ultimaActividad.getTime() > ACTUALIZAR_ACTIVIDAD_CADA_MS) {
    prisma.sesion.update({ where: { id: sesion.id }, data: { ultimaActividad: new Date(ahora) } }).catch(() => {});
  }
  return { ok: true, sesion, negocio: sesion.negocio };
}

async function revocar(sesionId, motivo) {
  await prisma.sesion.updateMany({ where: { id: sesionId, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: motivo } });
}

// Revoca todas las sesiones activas de una cuenta (cambio de contraseña, cambio de privilegios, incidente).
async function revocarTodas(negocioId, motivo, { excepto } = {}) {
  const r = await prisma.sesion.updateMany({
    where: { negocioId, revocadaEn: null, ...(excepto ? { id: { not: excepto } } : {}) },
    data: { revocadaEn: new Date(), motivoRevocacion: motivo },
  });
  return r.count;
}

// Cierra la sesión de la petición (si la hay) y borra la cookie.
async function cerrar(req, res, motivo = 'logout') {
  const token = leerCookie(req);
  if (token) {
    const s = await prisma.sesion.findUnique({ where: { tokenHash: hash(token) }, include: { negocio: { select: { id: true, email: true, esAdmin: true, esResponsable: true } } } });
    if (s && !s.revocadaEn) {
      await revocar(s.id, motivo);
      await auditoria.registrar({ req, actor: s.negocio, accion: 'sesion.logout', negocioAfectadoId: s.negocio.id, detalle: { motivo } });
    }
  }
  borrarCookie(res);
}

async function listar(negocioId, sesionActualId) {
  const filas = await prisma.sesion.findMany({
    where: { negocioId, revocadaEn: null, expiraEn: { gt: new Date() } },
    orderBy: { ultimaActividad: 'desc' },
    select: { id: true, creadaEn: true, ultimaActividad: true, expiraEn: true, ip: true, userAgent: true },
  });
  return filas.map((f) => ({ ...f, actual: f.id === sesionActualId }));
}

module.exports = { crear, validar, revocar, revocarTodas, cerrar, listar, hash, maxHoras, inactividadMin };
