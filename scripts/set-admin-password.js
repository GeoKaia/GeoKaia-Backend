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
    console.log(`Listo. Contraseña actualizada para ${negocio.email} (esAdmin: ${negocio.esAdmin}).`);
  } catch (err) {
    console.log('Error:', err.message);
  } finally {
    await pool.end();
  }
});
