// Prueba de humo del entorno: el servidor arranca contra una base real con todas las migraciones aplicadas.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarEntorno, registrarYEntrar } = require('./helpers/entorno');

let e;
before(async () => { e = await iniciarEntorno(); });
after(async () => { await e.detener(); });

test('el servidor responde y la base tiene las tablas del esquema', async () => {
  const r = await fetch(e.base + '/');
  assert.equal(r.status, 200);
  const { rows } = await e.db.query(`select table_name from information_schema.tables where table_schema = 'public'`);
  const tablas = rows.map((x) => x.table_name);
  for (const t of ['Negocio', 'Lugar', 'Ruta', 'ParadaRuta', 'Lead']) assert.ok(tablas.includes(t), `falta la tabla ${t}`);
});

test('se puede registrar una cuenta y abrir sesión (flujo con 2FA)', async () => {
  const c = await registrarYEntrar(e, 'base@correo.com');
  const me = await c.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.email, 'base@correo.com');
});
