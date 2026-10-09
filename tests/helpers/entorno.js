// Entorno de pruebas de integración: levanta un PostgreSQL temporal (embedded-postgres), aplica las migraciones
// reales (prisma migrate deploy) y arranca el backend como proceso aparte. Así las pruebas ejercitan el servidor
// completo (middlewares, cookies, Prisma y la base) y no piezas sueltas con mocks.
//
// Si TEST_DATABASE_URL está definida se usa esa base (y NO se borra nada: usá una base descartable); si no, se crea una
// temporal. Uso:   const e = await iniciarEntorno();  ...  await e.detener();
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const speakeasy = require('speakeasy');
const { Client } = require('pg');

const RAIZ = path.resolve(__dirname, '..', '..');

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function iniciarEntorno({ env: envExtra = {} } = {}) {
  let pgEmbebido = null;
  let databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    const EmbeddedPostgres = require('embedded-postgres').default;
    const puertoDb = await puertoLibre();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geokaia-pg-'));
    // Base descartable: sin fsync (más rápida y sin cuelgues de initdb en discos lentos o con antivirus).
    pgEmbebido = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port: puertoDb,
      persistent: false,
      initdbFlags: ['--no-sync'],
      postgresFlags: ['-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off'],
    });
    await pgEmbebido.initialise();
    await pgEmbebido.start();
    await pgEmbebido.createDatabase('geokaia');
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${puertoDb}/geokaia`;
  }

  const puertoApi = await puertoLibre();
  const archivoCorreo = path.join(os.tmpdir(), `geokaia-correo-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PORT: String(puertoApi),
    NODE_ENV: 'test',
    CORS_ORIGINS: 'http://localhost:3000',
    JWT_SECRET: 'secreto-de-pruebas-largo-y-aleatorio-0123456789',
    // En pruebas no se manda correo real: el servidor deja el último mensaje en memoria (ver utils/correo.js).
    CORREO_PRUEBAS: 'true',
    CORREO_PRUEBAS_ARCHIVO: archivoCorreo,
    FRONTEND_URL: 'http://localhost:3000',
    ...envExtra,
  };
  execSync('npx prisma migrate deploy', { cwd: RAIZ, env, stdio: 'pipe' });

  let logs = '';
  const servidor = spawn(process.execPath, ['src/index.js'], { cwd: RAIZ, env });
  servidor.stdout.on('data', (d) => { logs += d.toString(); });
  servidor.stderr.on('data', (d) => { logs += d.toString(); });

  const base = `http://127.0.0.1:${puertoApi}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + '/')).ok) break;
    } catch {
      /* todavía no escucha */
    }
    await esperar(250);
    if (i === 59) throw new Error('El servidor de pruebas no arrancó:\n' + logs);
  }

  const db = new Client({ connectionString: databaseUrl });
  await db.connect();

  return {
    base,
    db,
    env,
    logs: () => logs,
    // Correos que el servidor "envió" durante la prueba (ver utils/correo.js).
    correos: () => (fs.existsSync(archivoCorreo) ? fs.readFileSync(archivoCorreo, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []),
    async detener() {
      await db.end().catch(() => {});
      servidor.kill();
      if (pgEmbebido) await pgEmbebido.stop().catch(() => {});
    },
  };
}

// Cliente HTTP con "frasco de cookies" que se comporta como un navegador: guarda las cookies que fija el servidor
// y las manda de vuelta. `cookies` es editable para simular que alguien las borra o las cambia desde F12.
function crearCliente(base, { origen = 'http://localhost:3000' } = {}) {
  const cookies = {};
  // Cada cliente simula estar en su propia IP (el servidor confía en un salto de X-Forwarded-For), para que los límites
  // por IP no mezclen a clientes de pruebas distintas. Se puede pisar por petición con headers.
  const ipSimulada = `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  async function pedir(metodo, ruta, cuerpo, { headers = {}, sinOrigen = false } = {}) {
    const cabeceras = { 'x-forwarded-for': ipSimulada, ...headers };
    if (cuerpo !== undefined) cabeceras['content-type'] = 'application/json';
    if (!sinOrigen && metodo !== 'GET' && !cabeceras.origin) cabeceras.origin = origen;
    const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) cabeceras.cookie = cookie;
    const res = await fetch(base + ruta, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const setCookies = res.headers.getSetCookie();
    for (const sc of setCookies) {
      const [par] = sc.split(';');
      const i = par.indexOf('=');
      const nombre = par.slice(0, i);
      const valor = par.slice(i + 1);
      if (!valor || /expires=thu, 01 jan 1970/i.test(sc) || /max-age=0/i.test(sc)) delete cookies[nombre];
      else cookies[nombre] = valor;
    }
    let json = null;
    const texto = await res.text();
    try { json = JSON.parse(texto); } catch { /* no era JSON */ }
    return { status: res.status, json, texto, headers: res.headers, setCookies };
  }
  return {
    cookies,
    get: (r, o) => pedir('GET', r, undefined, o),
    post: (r, c, o) => pedir('POST', r, c ?? {}, o),
    patch: (r, c, o) => pedir('PATCH', r, c ?? {}, o),
    delete: (r, c, o) => pedir('DELETE', r, c, o),
  };
}

const PASSWORD_VALIDA = 'Tr3s-Volcanes_Nic!';

// Registra una cuenta y completa el login con 2FA. Si admin=true la promueve en la base (el registro público
// jamás crea administradores). Devuelve el cliente con la sesión abierta.
async function registrarYEntrar(entorno, email, { admin = false, password = PASSWORD_VALIDA, nombre = 'Persona Prueba' } = {}) {
  const c = crearCliente(entorno.base);
  const reg = await c.post('/api/auth/registrar', { email, password, nombreContacto: nombre, whatsapp: '50588888888', aceptaTerminos: true });
  if (reg.status !== 200) throw new Error(`registrar falló (${reg.status}): ${reg.texto}`);
  if (admin) await entorno.db.query('update "Negocio" set "esAdmin" = true where email = $1', [email]);
  const { paso1, paso2 } = await iniciarSesion(entorno, c, email, password);
  if (!paso2 || paso2.status !== 200) throw new Error(`login falló: ${paso1?.status} ${paso2?.status} ${paso2?.texto || paso1?.texto}`);
  return c;
}

async function codigoTotp(entorno, email) {
  const { rows } = await entorno.db.query('select "totpSecret" from "Negocio" where email = $1', [email]);
  return speakeasy.totp({ secret: rows[0].totpSecret, encoding: 'base32' });
}

// Login completo (contraseña + 2FA). Devuelve las respuestas de los dos pasos.
async function iniciarSesion(entorno, cliente, email, password = PASSWORD_VALIDA) {
  const paso1 = await cliente.post('/api/auth/login', { email, password });
  if (paso1.status !== 200) return { paso1 };
  // Hoy el backend devuelve un pasoToken firmado; antes devolvía el negocioId. Se aceptan los dos para que el helper
  // sirva en cualquier rama.
  const identificador = paso1.json.pasoToken ? { pasoToken: paso1.json.pasoToken } : { negocioId: paso1.json.negocioId };
  const paso2 = await cliente.post('/api/auth/verificar-2fa', { ...identificador, token: await codigoTotp(entorno, email) });
  return { paso1, paso2 };
}

module.exports = { iniciarEntorno, crearCliente, registrarYEntrar, iniciarSesion, codigoTotp, PASSWORD_VALIDA, esperar };
