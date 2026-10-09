// Historial de auditoría: se registra lo relevante, no guarda secretos, y no se puede alterar sin que se note.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarEntorno, crearCliente, registrarYEntrar, iniciarSesion, PASSWORD_VALIDA } = require('./helpers/entorno');

let e;
let admin;
let dueno;

before(async () => {
  e = await iniciarEntorno();
  admin = await registrarYEntrar(e, 'admin@correo.com', { admin: true, nombre: 'Admin Prueba' });
  dueno = await registrarYEntrar(e, 'dueno@correo.com', { nombre: 'Dueña Prueba' });
});
after(async () => { await e.detener(); });

const filas = async (where = '', params = []) => (await e.db.query(`select * from "Auditoria" ${where} order by id`, params)).rows;

test('un login fallido queda registrado con el correo intentado y sin la contraseña', async () => {
  const c = crearCliente(e.base);
  const intento = 'ClaveEquivocada-Muy-Especial-987!';
  const r = await c.post('/api/auth/login', { email: 'nadie@correo.com', password: intento });
  assert.equal(r.status, 401);
  const reg = (await filas(`where accion = 'sesion.login_fallido'`)).at(-1);
  assert.ok(reg, 'no se registró el intento fallido');
  assert.equal(reg.resultado, 'FALLO');
  assert.equal(reg.detalle.email, 'nadie@correo.com');
  assert.ok(reg.ip, 'falta la IP');
  // ninguna columna del historial puede contener la contraseña
  const todo = JSON.stringify(await filas());
  assert.ok(!todo.includes(intento), 'la contraseña apareció en el historial');
  assert.ok(!todo.includes(PASSWORD_VALIDA), 'una contraseña apareció en el historial');
});

test('el login con 2FA y las acciones del dueño sobre su lugar se auditan', async () => {
  assert.ok((await filas(`where accion = 'sesion.login' and "actorEmail" = 'dueno@correo.com'`)).length >= 1);
  const crear = await dueno.post('/api/lugares', { nombre: 'Cafe Auditado', descripcion: 'Un cafe para probar la auditoria', categoria: 'gastronomia', latitud: 12.1, longitud: -86.2 });
  assert.equal(crear.status, 201);
  const edit = await dueno.patch('/api/lugares/mi-lugar', { descripcion: 'Descripcion editada por su dueña, con mas de diez caracteres' });
  assert.equal(edit.status, 200);
  const regs = await filas(`where "negocioAfectadoId" is not null and accion like 'lugar.%'`);
  assert.deepEqual(regs.map((r) => r.accion), ['lugar.crear', 'lugar.editar']);
  assert.equal(regs[1].actorRol, 'PROPIETARIO');
});

test('aprobar un lugar (administrador) queda auditado con el dueño afectado', async () => {
  const lugarId = (await e.db.query('select id from "Lugar" limit 1')).rows[0].id;
  const r = await admin.patch(`/api/lugares/admin/${lugarId}/estado`, { estado: 'APROBADO' });
  assert.equal(r.status, 200);
  const reg = (await filas(`where accion = 'lugar.estado'`)).at(-1);
  assert.equal(reg.actorRol, 'ADMIN');
  assert.ok(reg.negocioAfectadoId, 'falta el negocio afectado');
  assert.equal(reg.detalle.a, 'APROBADO');
  assert.equal(reg.detalle.de, 'PENDIENTE');
});

test('un usuario sin rol admin que llama a /api/admin queda registrado como acceso denegado', async () => {
  const r = await dueno.get('/api/admin/auditoria');
  assert.equal(r.status, 403);
  const reg = (await filas(`where accion = 'acceso.denegado'`)).at(-1);
  assert.equal(reg.actorEmail, 'dueno@correo.com');
  assert.equal(reg.resultado, 'DENEGADO');
});

test('sin sesión no se puede leer el historial', async () => {
  const r = await crearCliente(e.base).get('/api/admin/auditoria');
  assert.equal(r.status, 401);
});

test('el administrador consulta el historial con filtros y paginación', async () => {
  const r = await admin.get('/api/admin/auditoria?accion=sesion.&limite=2');
  assert.equal(r.status, 200);
  assert.ok(r.json.length <= 2 && r.json.length >= 1);
  assert.ok(r.json.every((x) => x.accion.startsWith('sesion.')));
  assert.ok(r.json.every((x) => !('hash' in x) && !('userAgent' in x)), 'no debe exponer hashes ni navegador en el listado');
  const sig = await admin.get(`/api/admin/auditoria?accion=sesion.&limite=50&antes=${r.json.at(-1).id}`);
  assert.ok(sig.json.every((x) => x.id < r.json.at(-1).id));
  const mal = await admin.get('/api/admin/auditoria?limite=999999');
  assert.equal(mal.status, 400);
});

test('la base rechaza modificar, borrar o vaciar el historial (ni la propia aplicación puede)', async () => {
  await assert.rejects(e.db.query(`update "Auditoria" set accion = 'x' where id = 1`), /solo anexado/);
  await assert.rejects(e.db.query(`delete from "Auditoria" where id = 1`), /solo anexado/);
  await assert.rejects(e.db.query(`truncate "Auditoria"`), /solo anexado/);
});

test('la cadena de hashes se verifica y detecta una alteración hecha saltándose el trigger', async () => {
  const ok = await admin.get('/api/admin/auditoria/verificar');
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);
  assert.ok(ok.json.total > 5);

  // Alguien con acceso total a la base desactiva el trigger y cambia un registro...
  const { rows } = await e.db.query(`select id from "Auditoria" where accion = 'sesion.login' order by id limit 1`);
  await e.db.query('alter table "Auditoria" disable trigger "Auditoria_bloquear_update_delete"');
  await e.db.query(`update "Auditoria" set "actorEmail" = 'otra@persona.com' where id = $1`, [rows[0].id]);
  await e.db.query('alter table "Auditoria" enable trigger "Auditoria_bloquear_update_delete"');
  // ...y la verificación lo encuentra
  const roto = await admin.get('/api/admin/auditoria/verificar');
  assert.equal(roto.json.ok, false);
  assert.equal(roto.json.primeraRotaId, rows[0].id);
  // se restaura para no afectar a otras pruebas
  await e.db.query('alter table "Auditoria" disable trigger "Auditoria_bloquear_update_delete"');
  await e.db.query(`update "Auditoria" set "actorEmail" = 'admin@correo.com' where id = $1`, [rows[0].id]);
  await e.db.query('alter table "Auditoria" enable trigger "Auditoria_bloquear_update_delete"');
  assert.equal((await admin.get('/api/admin/auditoria/verificar')).json.ok, true);
});

test('escrituras simultáneas no rompen la cadena', async () => {
  await Promise.all(Array.from({ length: 12 }, () => crearCliente(e.base).post('/api/auth/login', { email: 'x@correo.com', password: 'No-Importa-123!' })));
  const r = await admin.get('/api/admin/auditoria/verificar');
  assert.equal(r.json.ok, true);
});

test('iniciar sesión sigue funcionando con el historial activo', async () => {
  const c = crearCliente(e.base);
  const { paso2 } = await iniciarSesion(e, c, 'dueno@correo.com');
  assert.equal(paso2.status, 200);
});
