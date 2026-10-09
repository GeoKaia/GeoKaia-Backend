const bcrypt = require('bcrypt');
const { responderError } = require('../utils/errores');
const jwt = require('jsonwebtoken');
const { fijarCookie, borrarCookie } = require('../utils/sesion');
const { emitirRefresco, revocarRefresco } = require('../utils/refresco');
const auditoria = require('../services/auditoria');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { TERMINOS_VERSION } = require('../config/legal');

// Nuevas importaciones obligatorias para Prisma 7
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Inicialización con Driver Adapter
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Hash de relleno: si el correo no existe igual se hace una comparación bcrypt, para que responder
// "usuario inexistente" no sea más rápido que "contraseña incorrecta" y no sirva para descubrir correos.
const HASH_RELLENO = bcrypt.hashSync('relleno-no-es-una-contrasena', 10);

exports.registrar = async (req, res) => {
  // A propósito solo desestructuramos estos 4 campos: aunque alguien mande "esAdmin" en
  // el body, se ignora. La única cuenta admin (ver scripts/set-admin-password.js) se marca
  // a mano en la base — el registro público jamás puede crear otra.
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

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const negocio = await prisma.negocio.findUnique({ where: { email } });
    const valida = await bcrypt.compare(password, negocio?.passwordHash ?? HASH_RELLENO);
    // Un solo mensaje y un solo código para "no existe" y "contraseña incorrecta": responder distinto
    // permitiría averiguar qué correos tienen cuenta.
    if (!negocio || !valida) {
      // En el historial sí se distingue el motivo (solo lo ve un administrador); al cliente no.
      await auditoria.registrar({ req, actor: null, accion: 'sesion.login_fallido', resultado: 'FALLO', negocioAfectadoId: negocio?.id ?? null, detalle: { email, motivo: negocio ? 'password' : 'cuenta_inexistente' } });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    res.json({ mensaje: 'Contraseña válida. Ingresá tu código 2FA.', negocioId: negocio.id });
  } catch (err) {
    responderError(res, err);
  }
};

exports.eliminarCuenta = async (req, res) => {
  const { password } = req.body;
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: req.negocio.id } });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    // La cuenta administradora del equipo nunca se puede borrar desde este endpoint.
    if (negocio.email === 'geokaia404@gmail.com') {
      return res.status(403).json({ error: 'Esta cuenta no se puede eliminar' });
    }

    const valida = await bcrypt.compare(password, negocio.passwordHash);
    if (!valida) return res.status(401).json({ error: 'Contraseña incorrecta' });

    await prisma.$transaction(async (tx) => {
      // El Negocio tiene la FK hacia Lugar, así que hay que soltarla (borrando el Negocio)
      // antes de poder borrar el Lugar y sus paradas de ruta.
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

exports.verificar2FA = async (req, res) => {
  const { negocioId, token } = req.body;
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId } });
    if (!negocio?.totpSecret) return res.status(401).json({ error: 'Código 2FA incorrecto' });
    const valido = speakeasy.totp.verify({
      secret: negocio.totpSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!valido) {
      await auditoria.registrar({ req, actor: { id: negocio.id, email: negocio.email, esAdmin: negocio.esAdmin }, accion: 'sesion.2fa_fallido', resultado: 'FALLO', negocioAfectadoId: negocio.id });
      return res.status(401).json({ error: 'Código 2FA incorrecto' });
    }
    const jwtToken = jwt.sign(
      { id: negocio.id, email: negocio.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    // El JWT va solo en la cookie httpOnly; el cuerpo no lo incluye para que JavaScript nunca lo tenga.
    fijarCookie(res, jwtToken);
    // Segunda cookie, de dispositivo (7 días): si alguien borra solo la de acceso desde F12, la sesión se renueva sola.
    await emitirRefresco(res, negocio.id);
    await auditoria.registrar({ req, actor: { id: negocio.id, email: negocio.email, esAdmin: negocio.esAdmin }, accion: 'sesion.login', negocioAfectadoId: negocio.id });
    res.json({ mensaje: 'Sesión iniciada', esAdmin: negocio.esAdmin });
  } catch (err) {
    responderError(res, err);
  }
};

// Quién soy según la cookie. Es lo que usa el frontend para saber si hay sesión y si es admin,
// porque ya no puede leer el token. Consulta la base: un cambio de esAdmin pega de inmediato.
exports.me = async (req, res) => {
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: req.negocio.id } });
    if (!negocio) {
      borrarCookie(res);
      return res.status(401).json({ error: 'Sesión inválida' });
    }
    res.json({
      id: negocio.id,
      email: negocio.email,
      nombreContacto: negocio.nombreContacto,
      esAdmin: negocio.esAdmin,
      tieneLugar: !!negocio.lugarId,
    });
  } catch (err) {
    responderError(res, err);
  }
};

exports.logout = async (req, res) => {
  try {
    // El dispositivo deja de valer en el servidor, aunque alguien conserve una copia de la cookie.
    await revocarRefresco(req);
  } catch (err) {
    console.error('[error] No se pudo revocar el dispositivo al cerrar sesión:', err);
  }
  borrarCookie(res);
  res.json({ mensaje: 'Sesión cerrada' });
};
