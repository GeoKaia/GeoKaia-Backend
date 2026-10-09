// Entorno de STAGING local, de un solo comando:   npm run staging:local
//
// Levanta todo lo necesario para probar la rama staging SIN tocar producción ni ninguna base real:
//   1. Un PostgreSQL propio (embedded-postgres) con datos persistentes en la carpeta .staging/ (ignorada por git).
//   2. Aplica las migraciones (prisma migrate deploy) SOLO sobre esa base local.
//   3. La primera vez crea cuentas de prueba (administrador, responsable y un negocio) con contraseñas aleatorias que se
//      guardan en .staging/credenciales.txt, junto con el secreto para Google Authenticator.
//   4. Arranca el backend en http://localhost:4000. Los correos (restablecer contraseña, avisos) NO se envían: se anexan a
//      .staging/correos.jsonl para poder abrir los enlaces.
// Para apuntar el frontend: en GeoKaia-Frontend/.env.local poné  BACKEND_URL=http://localhost:4000  y reiniciá npm run dev.
// Ctrl+C detiene todo; los datos quedan guardados para la próxima vez. Para empezar de cero, borrá la carpeta .staging/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execSync } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..');
const DIR = path.join(RAIZ, '.staging');
const DATOS_PG = path.join(DIR, 'pgdata');
const PUERTO_DB = Number(process.env.STAGING_DB_PORT) || 54320;
const PUERTO_API = Number(process.env.STAGING_API_PORT) || 4000;
const FRONTEND = process.env.STAGING_FRONTEND_URL || 'http://localhost:3000';
const NOMBRE_DB = 'geokaia_staging';
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PUERTO_DB}/${NOMBRE_DB}`;

fs.mkdirSync(DIR, { recursive: true });

// Secretos propios de este staging local (no son los de producción), generados una vez y guardados.
const archivoSecretos = path.join(DIR, 'secretos.json');
if (!fs.existsSync(archivoSecretos)) {
  fs.writeFileSync(archivoSecretos, JSON.stringify({ JWT_SECRET: crypto.randomBytes(48).toString('base64url') }, null, 2));
}
const secretos = JSON.parse(fs.readFileSync(archivoSecretos, 'utf8'));

const env = {
  ...process.env,
  DATABASE_URL,
  JWT_SECRET: secretos.JWT_SECRET,
  PORT: String(PUERTO_API),
  NODE_ENV: 'development',
  CORS_ORIGINS: FRONTEND,
  FRONTEND_URL: FRONTEND,
  CORREO_PRUEBAS: 'true',
  CORREO_PRUEBAS_ARCHIVO: path.join(DIR, 'correos.jsonl'),
  GROQ_API_KEY: process.env.GROQ_API_KEY || '', // el chat de Kaia no funciona sin clave; el resto sí
};

function contrasenaAleatoria() {
  // Cumple la política (12+, mayúscula, número, símbolo) con margen.
  const base = crypto.randomBytes(12).toString('base64url');
  return `Gk${base}-7!`;
}

async function sembrarCuentas() {
  Object.assign(process.env, env); // src/db.js lee DATABASE_URL al cargarse
  const speakeasy = require('speakeasy');
  const { prisma, pool } = require('../src/db');
  const { hashear } = require('../src/utils/hashPassword');
  try {
    if ((await prisma.negocio.count()) > 0) return false;
    const cuentas = [
      { email: 'admin@staging.local', nombre: 'Admin de prueba', esAdmin: true, esResponsable: false },
      { email: 'responsable@staging.local', nombre: 'Responsable de prueba', esAdmin: true, esResponsable: true },
      { email: 'negocio@staging.local', nombre: 'Negocio de prueba', esAdmin: false, esResponsable: false },
    ];
    const lineas = ['CREDENCIALES DEL STAGING LOCAL (solo sirven en este entorno; no las subas a git)', ''];
    for (const c of cuentas) {
      const password = contrasenaAleatoria();
      const secreto = speakeasy.generateSecret({ name: `GeoKaia staging (${c.email})` });
      await prisma.negocio.create({
        data: { email: c.email, passwordHash: await hashear(password), nombreContacto: c.nombre, whatsapp: '50500000000', totpSecret: secreto.base32, esAdmin: c.esAdmin, esResponsable: c.esResponsable, aceptoTerminosEn: new Date(), terminosVersion: '2026-10' },
      });
      lineas.push(`${c.nombre}`, `  correo:     ${c.email}`, `  contraseña: ${password}`, `  2FA (secreto para Google Authenticator, "ingresar clave de configuración"): ${secreto.base32}`, '');
    }
    fs.writeFileSync(path.join(DIR, 'credenciales.txt'), lineas.join('\n'));
    return true;
  } finally {
    await pool.end();
  }
}

(async () => {
  const EmbeddedPostgres = require('embedded-postgres').default;
  const primeraVez = !fs.existsSync(path.join(DATOS_PG, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: DATOS_PG,
    user: 'postgres',
    password: 'postgres',
    port: PUERTO_DB,
    persistent: true,
    initdbFlags: ['--no-sync'],
    postgresFlags: ['-c', 'fsync=off'],
  });
  if (primeraVez) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(NOMBRE_DB);
  } catch {
    /* ya existía */
  }
  console.log(`[staging] Base local lista en el puerto ${PUERTO_DB} (${NOMBRE_DB}).`);

  console.log('[staging] Aplicando migraciones...');
  execSync('npx prisma migrate deploy', { cwd: RAIZ, env, stdio: 'inherit' });
  execSync('npx prisma generate', { cwd: RAIZ, env, stdio: 'ignore' });

  if (await sembrarCuentas()) console.log(`[staging] Cuentas de prueba creadas. Credenciales en: ${path.join(DIR, 'credenciales.txt')}`);

  const api = spawn(process.execPath, ['src/index.js'], { cwd: RAIZ, env, stdio: 'inherit' });
  console.log(`\n[staging] Backend en http://localhost:${PUERTO_API}`);
  console.log(`[staging] Frontend: poné BACKEND_URL=http://localhost:${PUERTO_API} en GeoKaia-Frontend/.env.local y reiniciá "npm run dev".`);
  console.log(`[staging] Correos simulados: ${path.join(DIR, 'correos.jsonl')}\n`);

  let cerrando = false;
  const cerrar = async () => {
    if (cerrando) return;
    cerrando = true;
    api.kill();
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
  api.on('exit', cerrar);
})().catch((err) => {
  console.error('[staging] Error:', err.message);
  process.exit(1);
});
