// Corré esto vos mismo desde la terminal, nunca le pases la contraseña a Claude por el chat.
// Uso: node scripts/set-admin-password.js
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const { validarPassword } = require('../src/utils/password');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const EMAIL_ADMIN = 'geokaia404@gmail.com';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question(`Nueva contraseña para ${EMAIL_ADMIN}: `, async (password) => {
  rl.close();

  const errores = validarPassword(password, EMAIL_ADMIN);
  if (errores.length > 0) {
    console.log('La contraseña no cumple la política (no se cambió nada):');
    errores.forEach((e) => console.log(' - ' + e));
    await pool.end();
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const negocio = await prisma.negocio.update({
      where: { email: EMAIL_ADMIN },
      data: { passwordHash, esAdmin: true },
    });
    // Cambio de contraseña y de privilegios: se cierran todas las sesiones abiertas de la cuenta, para que ninguna
    // sesión anterior conserve (ni gane) permisos que no tenía cuando se creó.
    const revocadas = await prisma.sesion.updateMany({ where: { negocioId: negocio.id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'cambio_contrasena_o_privilegios' } });
    const auditoria = require('../src/services/auditoria');
    await auditoria.registrar({ req: null, actor: { id: negocio.id, email: negocio.email, esAdmin: true }, accion: 'cuenta.admin_configurada', recurso: { tipo: 'Negocio', id: negocio.id }, negocioAfectadoId: negocio.id, detalle: { origen: 'script', sesionesRevocadas: revocadas.count } });
    console.log(`Listo. Contraseña actualizada para ${negocio.email} (esAdmin: ${negocio.esAdmin}). Sesiones cerradas: ${revocadas.count}.`);
  } catch (err) {
    console.log('Error:', err.message);
  } finally {
    await pool.end();
    await require('../src/db').pool.end();
  }
});
