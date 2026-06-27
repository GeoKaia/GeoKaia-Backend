const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// Nuevas importaciones obligatorias para Prisma 7
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Inicialización con Driver Adapter
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

exports.registrar = async (req, res) => {
  const { email, password, nombreContacto, whatsapp } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const secret = speakeasy.generateSecret({ name: `GeoKaia (${email})` });
    const negocio = await prisma.negocio.create({
      data: {
        email,
        passwordHash,
        nombreContacto,
        whatsapp,
        totpSecret: secret.base32,
      },
    });
    const qrUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({
      mensaje: 'Negocio registrado. Escaneá el QR con Google Authenticator.',
      qr: qrUrl,
      negocioId: negocio.id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const negocio = await prisma.negocio.findUnique({ where: { email } });
    if (!negocio) return res.status(404).json({ error: 'Usuario no encontrado' });
    const valida = await bcrypt.compare(password, negocio.passwordHash);
    if (!valida) return res.status(401).json({ error: 'Contraseña incorrecta' });
    res.json({ mensaje: 'Contraseña válida. Ingresá tu código 2FA.', negocioId: negocio.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verificar2FA = async (req, res) => {
  const { negocioId, token } = req.body;
  try {
    const negocio = await prisma.negocio.findUnique({ where: { id: negocioId } });
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });
    const valido = speakeasy.totp.verify({
      secret: negocio.totpSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!valido) return res.status(401).json({ error: 'Código 2FA incorrecto' });
    const jwtToken = jwt.sign(
      { id: negocio.id, email: negocio.email },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token: jwtToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};