const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { prisma } = require('../db');
const { responderError } = require('../utils/errores');
const { borrarCookie } = require('../utils/sesion');
const { TERMINOS_VERSION } = require('../config/legal');
const auditoria = require('../services/auditoria');
const sesiones = require('../services/sesiones');
const { hashear, verificar, necesitaRehash, verificarContraRelleno } = require('../utils/hashPassword');
const { validarPassword } = require('../utils/password');
const correo = require('../utils/correo');

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
    const passwordHash = await hashear(password);
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
    // Si el correo no existe se hace igual una verificación completa (hash de relleno), para que el tiempo de respuesta no delate cuentas.
    const valida = negocio ? await verificar(password, negocio.passwordHash) : await verificarContraRelleno(password);
    // Un solo mensaje y un solo código para "no existe" y "contraseña incorrecta": responder distinto
    // permitiría averiguar qué correos tienen cuenta.
    if (!negocio || !valida) {
      // En el historial sí se distingue el motivo (solo lo ve un administrador); al cliente no.
      await auditoria.registrar({ req, actor: null, accion: 'sesion.login_fallido', resultado: 'FALLO', negocioAfectadoId: negocio?.id ?? null, detalle: { email, motivo: negocio ? 'password' : 'cuenta_inexistente' } });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    // Cuentas con hash bcrypt (anteriores a Argon2id): se migran en silencio ahora que se conoce la contraseña.
    if (necesitaRehash(negocio.passwordHash)) {
      await prisma.negocio.update({ where: { id: negocio.id }, data: { passwordHash: await hashear(password) } });
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

    const valida = await verificar(password, negocio.passwordHash);
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

// ---------------------------------------------------------------------------------------------------------------------
// Cambio y restablecimiento de contraseña. Las dos operaciones aplican la política de contraseñas (utils/password.js),
// exigen el segundo factor, guardan el nuevo hash con Argon2id, cierran las sesiones que corresponda y quedan en el
// historial de auditoría. Ninguna respuesta, registro de auditoría ni log incluye contraseñas ni tokens.
// ---------------------------------------------------------------------------------------------------------------------

const MAX_CAMBIO_FALLIDOS = 5;

function totpValido(negocio, codigo) {
  return !!negocio?.totpSecret && speakeasy.totp.verify({ secret: negocio.totpSecret, encoding: 'base32', token: codigo, window: 1 });
}

// Cambiar la propia contraseña estando con sesión. Pide la contraseña actual y el código 2FA (confirma que quien
// cambia es la persona y no alguien que encontró la sesión abierta).
exports.cambiarPassword = async (req, res) => {
  const { passwordActual, passwordNueva, codigo2fa } = req.body;
  try {
    if ((await contarFallos('cuenta.password_cambio_fallido', { negocioId: req.negocio.id })) >= MAX_CAMBIO_FALLIDOS) {
      return res.status(429).json({ error: MENSAJE_BLOQUEO });
    }
    const negocio = await prisma.negocio.findUnique({ where: { id: req.negocio.id } });
    const fallo = async (motivo, estado, mensaje) => {
      await auditoria.registrar({ req, accion: 'cuenta.password_cambio_fallido', resultado: 'FALLO', negocioAfectadoId: negocio.id, detalle: { motivo } });
      return res.status(estado).json({ error: mensaje });
    };
    if (!(await verificar(passwordActual, negocio.passwordHash))) return fallo('password_actual', 401, 'La contraseña actual no es correcta');
    if (!totpValido(negocio, codigo2fa)) return fallo('2fa', 401, 'Código 2FA incorrecto');

    const errores = validarPassword(passwordNueva, negocio.email);
    if (errores.length > 0) return res.status(400).json({ error: 'La contraseña nueva no cumple los requisitos', detalles: errores.map((mensaje) => ({ campo: 'passwordNueva', mensaje })) });
    if (await verificar(passwordNueva, negocio.passwordHash)) {
      return res.status(400).json({ error: 'La contraseña nueva no cumple los requisitos', detalles: [{ campo: 'passwordNueva', mensaje: 'La contraseña nueva tiene que ser distinta de la actual' }] });
    }

    await prisma.negocio.update({ where: { id: negocio.id }, data: { passwordHash: await hashear(passwordNueva) } });
    // Cambio de credenciales: se cierran todas las demás sesiones y la actual recibe un identificador nuevo.
    const cerradas = await sesiones.revocarTodas(negocio.id, 'cambio_de_contrasena');
    await sesiones.crear(req, res, negocio);
    await auditoria.registrar({ req, accion: 'cuenta.password_cambiada', negocioAfectadoId: negocio.id, detalle: { sesionesCerradas: cerradas } });
    correo.enviar({ para: negocio.email, asunto: 'Cambiaste tu contraseña de GeoKaia', texto: 'La contraseña de tu cuenta de GeoKaia se cambió. Si no fuiste vos, escribinos de inmediato a geokaia404@gmail.com.' }).catch(() => {});
    res.json({ mensaje: 'Contraseña actualizada. Se cerraron tus otras sesiones.' });
  } catch (err) {
    responderError(res, err);
  }
};

const MINUTOS_VIGENCIA_ENLACE = 30;
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const MENSAJE_OLVIDE = 'Si el correo está registrado, te enviamos las instrucciones para restablecer la contraseña.';

// Pedir el enlace de restablecimiento. Responde SIEMPRE lo mismo, exista o no la cuenta (no se puede usar para descubrir
// correos). El trabajo real se hace después de responder para que tampoco lo delate el tiempo de respuesta.
exports.olvidePassword = async (req, res) => {
  const { email } = req.body;
  res.json({ mensaje: MENSAJE_OLVIDE });
  try {
    await auditoria.registrar({ req, actor: null, accion: 'cuenta.reset_solicitado', detalle: { email } });
    if (!correo.correoConfigurado()) return;
    const negocio = await prisma.negocio.findUnique({ where: { email } });
    if (!negocio) return;
    // Un solo enlace vigente por cuenta, y como máximo 3 solicitudes por hora.
    const recientes = await prisma.restablecerPassword.count({ where: { negocioId: negocio.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
    if (recientes >= 3) return;
    await prisma.restablecerPassword.updateMany({ where: { negocioId: negocio.id, usadoEn: null }, data: { usadoEn: new Date() } });
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.restablecerPassword.create({ data: { negocioId: negocio.id, tokenHash: hashToken(token), expiraEn: new Date(Date.now() + MINUTOS_VIGENCIA_ENLACE * 60 * 1000) } });
    const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    await correo.enviar({
      para: negocio.email,
      asunto: 'Restablecer tu contraseña de GeoKaia',
      texto: `Pediste restablecer tu contraseña.\n\nAbrí este enlace (vale ${MINUTOS_VIGENCIA_ENLACE} minutos y sirve una sola vez): ${base}/restablecer-password?token=${token}\n\nNecesitarás tu código de Google Authenticator. Si no fuiste vos, ignorá este correo: tu contraseña sigue igual.`,
    });
  } catch (err) {
    console.error('[error] olvide-password:', err.message);
  }
};

// Usar el enlace: token + código 2FA + contraseña nueva. Que alguien controle el correo no basta: también necesita el
// segundo factor. Todas las sesiones de la cuenta se cierran.
exports.restablecerPassword = async (req, res) => {
  const { token, password, codigo2fa } = req.body;
  const MENSAJE_INVALIDO = 'El enlace no es válido o ya venció. Pedí uno nuevo.';
  try {
    const registro = await prisma.restablecerPassword.findUnique({ where: { tokenHash: hashToken(token) }, include: { negocio: true } });
    if (!registro || registro.usadoEn || registro.expiraEn < new Date()) {
      await auditoria.registrar({ req, actor: null, accion: 'cuenta.reset_fallido', resultado: 'FALLO', detalle: { motivo: 'enlace_invalido' } });
      return res.status(400).json({ error: MENSAJE_INVALIDO });
    }
    const negocio = registro.negocio;

    if (!totpValido(negocio, codigo2fa)) {
      const intentos = registro.intentos + 1;
      // Cinco códigos incorrectos anulan el enlace: no se puede adivinar el 2FA con un enlace robado.
      await prisma.restablecerPassword.update({ where: { id: registro.id }, data: { intentos, ...(intentos >= 5 ? { usadoEn: new Date() } : {}) } });
      await auditoria.registrar({ req, actor: null, accion: 'cuenta.reset_fallido', resultado: 'FALLO', negocioAfectadoId: negocio.id, detalle: { motivo: '2fa', intentos } });
      return res.status(401).json({ error: intentos >= 5 ? MENSAJE_INVALIDO : 'Código 2FA incorrecto' });
    }

    const errores = validarPassword(password, negocio.email);
    if (errores.length > 0) {
      return res.status(400).json({ error: 'La contraseña nueva no cumple los requisitos', detalles: errores.map((mensaje) => ({ campo: 'password', mensaje })) });
    }

    await prisma.$transaction([
      prisma.negocio.update({ where: { id: negocio.id }, data: { passwordHash: await hashear(password) } }),
      prisma.restablecerPassword.updateMany({ where: { negocioId: negocio.id, usadoEn: null }, data: { usadoEn: new Date() } }),
    ]);
    const cerradas = await sesiones.revocarTodas(negocio.id, 'restablecimiento_de_contrasena');
    await auditoria.registrar({ req, actor: null, accion: 'cuenta.password_restablecida', negocioAfectadoId: negocio.id, detalle: { sesionesCerradas: cerradas } });
    correo.enviar({ para: negocio.email, asunto: 'Restableciste tu contraseña de GeoKaia', texto: 'La contraseña de tu cuenta de GeoKaia se restableció. Si no fuiste vos, escribinos de inmediato a geokaia404@gmail.com.' }).catch(() => {});
    res.json({ mensaje: 'Contraseña restablecida. Iniciá sesión con la nueva.' });
  } catch (err) {
    responderError(res, err);
  }
};
