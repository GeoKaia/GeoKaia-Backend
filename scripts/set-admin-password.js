// Corré esto vos mismo desde la terminal, nunca le pases la contraseña a Claude por el chat.
// Uso: node scripts/set-admin-password.js
// Marca la cuenta como administradora, le pone la contraseña nueva (política de utils/password.js, hash Argon2id) y
// cierra todas sus sesiones abiertas. La contraseña se escribe sin mostrarse en pantalla.
require('dotenv').config();
const readline = require('readline');
const { validarPassword } = require('../src/utils/password');
const { hashear } = require('../src/utils/hashPassword');
const { prisma, pool } = require('../src/db');
const auditoria = require('../src/services/auditoria');

const EMAIL_ADMIN = 'geokaia404@gmail.com';

function pedirContrasena(pregunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Silencia el eco: mientras se escribe la contraseña no se imprime nada.
    let silenciar = false;
    const escribir = rl._writeToOutput;
    rl._writeToOutput = (texto) => {
      if (!silenciar) escribir.call(rl, texto);
    };
    rl.question(pregunta, (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(respuesta);
    });
    silenciar = true;
  });
}

(async () => {
  try {
    const password = await pedirContrasena(`Nueva contraseña para ${EMAIL_ADMIN}: `);
    const errores = validarPassword(password, EMAIL_ADMIN);
    if (errores.length > 0) {
      console.log('La contraseña no cumple la política (no se cambió nada):');
      errores.forEach((e) => console.log(' - ' + e));
      return;
    }

    const negocio = await prisma.negocio.update({
      where: { email: EMAIL_ADMIN },
      data: { passwordHash: await hashear(password), esAdmin: true },
    });
    // Cambio de contraseña y de privilegios: se cierran todas las sesiones abiertas de la cuenta, para que ninguna
    // sesión anterior conserve (ni gane) permisos que no tenía cuando se creó.
    const revocadas = await prisma.sesion.updateMany({ where: { negocioId: negocio.id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'cambio_contrasena_o_privilegios' } });
    await auditoria.registrar({ req: null, actor: { id: negocio.id, email: negocio.email, esAdmin: true }, accion: 'cuenta.admin_configurada', recurso: { tipo: 'Negocio', id: negocio.id }, negocioAfectadoId: negocio.id, detalle: { origen: 'script', sesionesRevocadas: revocadas.count } });
    console.log(`Listo. Contraseña actualizada para ${negocio.email} (esAdmin: ${negocio.esAdmin}). Sesiones cerradas: ${revocadas.count}.`);
  } catch (err) {
    console.log('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
