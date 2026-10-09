const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { prisma } = require('../db');
const { responderError } = require('../utils/errores');
const { borrarCookie } = require('../utils/sesion');
const { TERMINOS_VERSION } = require('../config/legal');
const auditoria = require('../services/auditoria');
const sesiones = require('../services/sesiones');

// Hash de relleno: si el correo no existe igual se hace una comparación bcrypt, para que responder
// "usuario inexistente" no sea más rápido que "contraseña incorrecta" y no sirva para descubrir correos.
const HASH_RELLENO = bcrypt.hashSync('relleno-no-es-una-contrasena', 10);

// Bloqueo temporal por cuenta (además de los límites por IP de limites.middleware.js, que se pueden esquivar
// cambiando de IP): se cuenta en el historial de auditoría, que es persistente y común a todas las instancias.
const VENTANA_BLOQUEO_MIN = 15;
const MAX_LOGIN_FALLIDOS = 10;
const MAX_2FA_FALLIDOS = 8;

async function contarFallos(accion, { email, negocioId }) {
  const filas = email
    ? await prisma.$queryRaw`SELECT count(*)::int AS n FROM "Auditoria" WHERE accion = ${accion} AND detalle->>'email' = ${email} AND "creadaEn" > (now() at time zone 'utc') - make_interval(mins => ${VENTANA_BLOQUEO_MIN})`
    : await prisma.$queryRaw`SELECT count(*)::int AS n FROM "Auditoria" WHERE accion = ${accion} AND "negocioAfectadoId" = ${negocioId} AND "creadaEn" > (now() at time zone 'utc') - make_interval(mins => ${VENTANA_BLOQUEO_MIN})`;
  return filas[0].n;
}

const MENSAJE_BLOQUEO = `Demasiados intentos fallidos. Esperá ${VENTANA_BLOQUEO_MIN} minutos e intentá de nuevo.`;

exports.registrar = async (req, res) => {
  // A propósito solo desestructuramos estos 4 campos: aunque alguien mande "esAdmin" en el body, se ignora. Las
  // cuentas de administrador se marcan a mano en la base (ver scripts/set-admin-password.js): el registro público
  // jamás puede crear una.
  const { email, password, nombreContacto, whatsapp } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const secret = speakeasy.generateSecret({ name: `GeoKaia (${email})` });
    const negocio = await prisma.negocio.create({
      data: {
        email,
        passwordHash,
        nombreContacto,
        whatsapp,
        totpSecret: secret.base32,
        // La aceptación ya vino validada en true por registrarSchema. La versión y la fecha las
        // pone el servidor: no se confía en lo que mande el cliente.
        aceptoTerminosEn: new Date(),
        terminosVersion: TERMINOS_VERSION,
      },
    });
    await auditoria.registrar({ req, actor: { id: negocio.id, email: negocio.email }, accion: 'cuenta.registro', recurso: { tipo: 'Negocio', id: negocio.id }, negocioAfectadoId: negocio.id });
    const qrUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({
      mensaje: 'Negocio registrado. Escaneá el QR con Google Authenticator.',
      qr: qrUrl,
      negocioId: negocio.id,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ese correo ya está registrado. Iniciá sesión en vez de crear una cuenta nueva.' });
    }
    responderError(res, err);
  }
};

// Paso 1 del inicio de sesión: contraseña. NO abre sesión; devuelve un "pasoToken" firmado y de 5 minutos que solo sirve
// para presentar el código 2FA. Así el paso 2 no se puede intentar contra la cuenta de otra persona sin haber
// acertado primero su contraseña.
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if ((await contarFallos('sesion.login_fallido', { email })) >= MAX_LOGIN_FALLIDOS) {
      await auditoria.registrar({ req, actor: null, accion: 'sesion.login_bloqueado', resultado: 'DENEGADO', detalle: { email } });
      return res.status(429).json({ error: MENSAJE_BLOQUEO });
    }
    const negocio = await prisma.negocio.findUnique({ where: { email } });
    const valida = await bcrypt.compare(password, negocio?.passwordHash ?? HASH_RELLENO);
    // Un solo mensaje y un solo código para "no existe" y "contraseña incorrecta": responder distinto
    // permitiría averiguar qué correos tienen cuenta.
    if (!negocio || !valida) {
      // En el historial sí se distingue el motivo (solo lo ve un administrador); al cliente no.
      await auditoria.registrar({ req, actor: null, accion: 'sesion.login_fallido', resultado: 'FALLO', negocioAfectadoId: negocio?.id ?? null, detalle: { email, motivo: negocio ? 'password' : 'cuenta_inexistente' } });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    const pasoToken = jwt.sign({ typ: '2fa', sub: String(negocio.id) }, process.env.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });
    res.json({ mensaje: 'Contraseña válida. Ingresá tu código 2FA.', pasoToken });
  } catch (err) {
    responderError(res, err);
  }
};

// Paso 2: código TOTP. Recién acá se crea la sesión (nuevo identificador de sesión: regeneración contra fijación).
exports.verificar2FA = async (req, res) => {
  const { pasoToken, token } = req.body;
  try {
    let negocioId;
    try {
      const payload = jwt.verify(pasoToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (payload.typ !== '2fa') throw new Error('tipo');
      negocioId = Number(payload.sub);
    } catch {
      return res.status(401).json({ error: 'El paso anterior venció. Volvé a escribir tu correo y contraseña.' });
    }

    if ((await contarFallos('sesion.2fa_fallido', { negocioId })) >= MAX_2FA_FALLIDOS) {
      await auditoria.registrar({ req, actor: null, accion: 'sesion.2fa_bloqueado', resultado: 'DENEGADO', negocioAfectadoId: negocioId });
      return res.status(429).json({ error: MENSAJE_BLOQUEO });
    }

    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId } });
    // Sin secreto TOTP no hay segundo factor: la cuenta (administradora o no) no puede abrir sesión.
    const valido = !!negocio?.totpSecret && speakeasy.totp.verify({ secret: negocio.totpSecret, encoding: 'base32', token, window: 1 });
    if (!valido) {
      await auditoria.registrar({ req, actor: negocio ? { id: negocio.id, email: negocio.email, esAdmin: negocio.esAdmin } : null, accion: 'sesion.2fa_fallido', resultado: 'FALLO', negocioAfectadoId: negocio?.id ?? negocioId });
      return res.status(401).json({ error: 'Código 2FA incorrecto' });
    }

    await sesiones.crear(req, res, negocio);
    await auditoria.registrar({ req, actor: { id: negocio.id, email: negocio.email, esAdmin: negocio.esAdmin }, accion: 'sesion.login', negocioAfectadoId: negocio.id });
    res.json({ mensaje: 'Sesión iniciada', esAdmin: negocio.esAdmin });
  } catch (err) {
    responderError(res, err);
  }
};

// Quién soy según la sesión del servidor. Es lo que usa el frontend para saber si hay sesión y si es admin, porque
// no guarda nada propio. El rol viene de la base en cada llamada.
exports.me = async (req, res) => {
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: req.negocio.id } });
    res.json({
      id: negocio.id,
      email: negocio.email,
      nombreContacto: negocio.nombreContacto,
      esAdmin: negocio.esAdmin,
      tieneLugar: !!negocio.lugarId,
      sesion: { expiraEn: req.sesion.expiraEn, inactividadMin: sesiones.inactividadMin() },
    });
  } catch (err) {
    responderError(res, err);
  }
};

// Cerrar sesión invalida la sesión en el servidor (aunque alguien conserve una copia de la cookie) y borra la cookie.
// Siempre responde 200: cerrar una sesión que ya no existe no es un error.
exports.logout = async (req, res) => {
  try {
    await sesiones.cerrar(req, res, 'logout');
  } catch (err) {
    console.error('[error] No se pudo cerrar la sesión en el servidor:', err.message);
    borrarCookie(res);
  }
  res.json({ mensaje: 'Sesión cerrada' });
};

// Cierra TODAS las sesiones de la cuenta (por ejemplo si perdió un dispositivo).
exports.logoutTodas = async (req, res) => {
  try {
    const n = await sesiones.revocarTodas(req.negocio.id, 'logout_todas');
    await auditoria.registrar({ req, accion: 'sesion.logout_todas', negocioAfectadoId: req.negocio.id, detalle: { revocadas: n } });
    borrarCookie(res);
    res.json({ mensaje: 'Se cerraron todas tus sesiones', revocadas: n });
  } catch (err) {
    responderError(res, err);
  }
};

exports.listarSesiones = async (req, res) => {
  try {
    res.json(await sesiones.listar(req.negocio.id, req.sesion.id));
  } catch (err) {
    responderError(res, err);
  }
};

// Revoca UNA sesión propia. Se busca por (id, negocioId): con el id de una sesión ajena la respuesta es un 404
// idéntico al de una sesión inexistente (no se puede revocar ni descubrir sesiones de otras cuentas).
exports.revocarSesion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const s = await prisma.sesion.findFirst({ where: { id, negocioId: req.negocio.id, revocadaEn: null } });
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    await sesiones.revocar(s.id, 'revocada_por_el_usuario');
    await auditoria.registrar({ req, accion: 'sesion.revocar', recurso: { tipo: 'Sesion', id: s.id }, negocioAfectadoId: req.negocio.id });
    res.json({ mensaje: 'Sesión cerrada' });
  } catch (err) {
    responderError(res, err);
  }
};

exports.eliminarCuenta = async (req, res) => {
  const { password } = req.body;
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: req.negocio.id } });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    // Las cuentas administradoras no se pueden borrar desde este endpoint.
    if (negocio.esAdmin) {
      return res.status(403).json({ error: 'Esta cuenta no se puede eliminar' });
    }

    const valida = await bcrypt.compare(password, negocio.passwordHash);
    if (!valida) return res.status(401).json({ error: 'Contraseña incorrecta' });

    await prisma.$transaction(async (tx) => {
      // El Negocio tiene la FK hacia Lugar, así que hay que soltarla (borrando el Negocio)
      // antes de poder borrar el Lugar y sus paradas de ruta. Sus sesiones se borran en cascada.
      if (negocio.lugarId) {
        await tx.paradaRuta.deleteMany({ where: { lugarId: negocio.lugarId } });
      }
      await tx.negocio.delete({ where: { id: negocio.id } });
      if (negocio.lugarId) {
        await tx.lugar.delete({ where: { id: negocio.lugarId } });
      }
    });

    await auditoria.registrar({ req, accion: 'cuenta.eliminar', recurso: { tipo: 'Negocio', id: negocio.id }, negocioAfectadoId: negocio.id });
    borrarCookie(res);
    res.json({ mensaje: 'Cuenta eliminada correctamente' });
  } catch (err) {
    responderError(res, err);
  }
};
