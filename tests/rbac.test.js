// Control de acceso (RBAC) y propiedad de los negocios: un propietario solo puede modificar lo suyo y un administrador no
// puede alterar directamente los datos comerciales de terceros.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PERMISOS, tienePermiso } = require('../src/rbac/permisos');
const { iniciarEntorno, crearCliente, registrarYEntrar, PASSWORD_VALIDA } = require('./helpers/entorno');

// ---------- matriz de permisos (unitaria) ----------
test('matriz de permisos: ningún rol tiene permisos de edición o borrado sobre negocios ajenos', () => {
  for (const [rol, permisos] of Object.entries(PERMISOS)) {
    for (const prohibido of ['lugar:editar_ajeno', 'lugar:borrar_ajeno', 'cuenta:editar_ajena', 'cuenta:borrar_ajena']) {
      assert.ok(!permisos.includes(prohibido), `${rol} no debe tener ${prohibido}`);
    }
  }
});

test('matriz de permisos: mínimo privilegio entre roles', () => {
  assert.ok(PERMISOS.PROPIETARIO.every((p) => !p.startsWith('auditoria') && !p.startsWith('escalamiento') && !p.startsWith('lugar:ver_todos') && !p.startsWith('lugar:moderar') && !p.startsWith('ruta:') && !p.startsWith('sesion:')));
  assert.ok(!PERMISOS.ADMIN.some((p) => ['lugar:crear_propio', 'lugar:editar_propio', 'lugar:borrar_propio'].includes(p)), 'un admin no es propietario de negocios');
  assert.ok(!PERMISOS.ADMIN.includes('escalamiento:autorizar'));
  assert.ok(PERMISOS.RESPONSABLE.includes('escalamiento:autorizar'));
  assert.ok(PERMISOS.ADMIN.every((p) => PERMISOS.RESPONSABLE.includes(p)));
  assert.equal(tienePermiso({ esAdmin: false }, 'auditoria:ver'), false);
  assert.equal(tienePermiso({ esAdmin: true }, 'auditoria:ver'), true);
  assert.equal(tienePermiso({ esAdmin: true, esResponsable: false }, 'escalamiento:autorizar'), false);
  assert.equal(tienePermiso({ esAdmin: false, esResponsable: true }, 'escalamiento:autorizar'), false, 'esResponsable sin esAdmin no concede nada');
  assert.equal(tienePermiso(null, 'lugar:ver_todos'), false);
});

// ---------- integración ----------
let e;
let ana; let beto; let admin;
let lugarAna; let lugarBeto;
const lugar = (nombre) => ({ nombre, descripcion: `Descripcion de ${nombre} con mas de diez caracteres`, categoria: 'gastronomia', latitud: 12.1, longitud: -86.2 });
const filaLugar = async (id) => (await e.db.query('select * from "Lugar" where id = $1', [id])).rows[0];

before(async () => {
  e = await iniciarEntorno();
  admin = await registrarYEntrar(e, 'admin@correo.com', { admin: true, nombre: 'Admin Prueba' });
  ana = await registrarYEntrar(e, 'ana@correo.com', { nombre: 'Ana Dueña' });
  beto = await registrarYEntrar(e, 'beto@correo.com', { nombre: 'Beto Dueño' });
  lugarAna = (await ana.post('/api/lugares', lugar('Cafe de Ana'))).json.lugar.id;
  lugarBeto = (await beto.post('/api/lugares', lugar('Cafe de Beto'))).json.lugar.id;
});
after(async () => { await e.detener(); });

// ---------- propietarios ----------
test('un propietario crea, edita y administra su propio negocio', async () => {
  const mio = await ana.get('/api/lugares/mi-lugar');
  assert.equal(mio.status, 200);
  assert.equal(mio.json.id, lugarAna);
  const edit = await ana.patch('/api/lugares/mi-lugar', { descripcion: 'Descripcion nueva de Ana con mas de diez caracteres' });
  assert.equal(edit.status, 200);
  assert.equal((await filaLugar(lugarAna)).descripcion, 'Descripcion nueva de Ana con mas de diez caracteres');
  const dup = await ana.post('/api/lugares', lugar('Otro lugar de Ana'));
  assert.equal(dup.status, 409, 'un negocio solo puede tener un lugar');
});

test('IDOR: un propietario no puede modificar el negocio de otro aunque mande su identificador', async () => {
  const antes = await filaLugar(lugarBeto);
  // ids en el cuerpo, en la ruta y en parámetros: ninguno desvía la operación al lugar ajeno
  const intentos = [
    ana.patch('/api/lugares/mi-lugar', { id: lugarBeto, lugarId: lugarBeto, negocioId: 99, descripcion: 'Intento de Ana sobre el negocio de Beto, diez+' }),
    ana.patch(`/api/lugares/mi-lugar?id=${lugarBeto}`, { descripcion: 'Segundo intento de Ana, con mas de diez caracteres' }),
    ana.patch(`/api/lugares/${lugarBeto}`, { descripcion: 'Tercer intento de Ana, con mas de diez caracteres' }),
    ana.delete(`/api/lugares/${lugarBeto}`, { password: PASSWORD_VALIDA }),
    ana.patch(`/api/lugares/admin/${lugarBeto}`, { nombre: 'Hackeado' }),
    ana.delete(`/api/lugares/admin/${lugarBeto}`),
    ana.patch(`/api/lugares/admin/${lugarBeto}/estado`, { estado: 'RECHAZADO' }),
  ];
  for (const r of await Promise.all(intentos)) assert.ok([200, 403, 404, 405].includes(r.status), `estado inesperado ${r.status}`);
  const despues = await filaLugar(lugarBeto);
  assert.equal(despues.descripcion, antes.descripcion);
  assert.equal(despues.nombre, antes.nombre);
  assert.equal(despues.estado, antes.estado);
  assert.ok(despues, 'el lugar de Beto debe seguir existiendo');
  // lo único que cambió es el lugar de la propia Ana (la primera petición se aplica a SU lugar, ignorando los ids)
  assert.match((await filaLugar(lugarAna)).descripcion, /Intento de Ana|Descripcion nueva de Ana|Segundo intento|Tercer intento/);
});

test('un propietario no puede ver ni usar la supervisión de administradores', async () => {
  for (const [metodo, ruta, cuerpo] of [['get', '/api/lugares/admin/pendientes'], ['get', '/api/lugares/admin/todos'], ['patch', `/api/lugares/admin/${lugarBeto}/estado`, { estado: 'APROBADO' }], ['get', '/api/admin/auditoria'], ['post', '/api/rutas', { nombre: 'x' }]]) {
    const r = await ana[metodo](ruta, cuerpo);
    assert.equal(r.status, 403, `${metodo.toUpperCase()} ${ruta} -> ${r.status}`);
  }
  assert.ok((await e.db.query(`select count(*)::int n from "Auditoria" where accion = 'acceso.denegado' and "actorEmail" = 'ana@correo.com'`)).rows[0].n >= 5, 'los intentos denegados deben quedar auditados');
});

test('lo que no está aprobado no es público: no se puede leer el lugar pendiente de otro por su id', async () => {
  const anonimo = crearCliente(e.base);
  assert.equal((await anonimo.get(`/api/lugares/${lugarBeto}`)).status, 404);
  assert.deepEqual((await anonimo.get('/api/lugares')).json, []);
});

// ---------- administradores ----------
test('un administrador NO puede editar ni borrar el negocio de un tercero (no existen esas operaciones)', async () => {
  const antes = await filaLugar(lugarAna);
  const respuestas = [
    await admin.patch(`/api/lugares/admin/${lugarAna}`, { nombre: 'Editado por el admin' }),
    await admin.delete(`/api/lugares/admin/${lugarAna}`),
    await admin.patch(`/api/lugares/${lugarAna}`, { nombre: 'Editado por el admin' }),
    await admin.delete(`/api/lugares/${lugarAna}`, { password: 'x' }),
    await admin.patch('/api/lugares/mi-lugar', { id: lugarAna, nombre: 'Editado por el admin' }),
    await admin.delete('/api/lugares/mi-lugar', { password: PASSWORD_VALIDA }),
    await admin.post('/api/lugares', lugar('Lugar creado por admin')),
    await admin.get('/api/lugares/mi-lugar'),
  ];
  for (const r of respuestas) assert.ok([403, 404, 405].includes(r.status), `un admin recibió ${r.status}`);
  const despues = await filaLugar(lugarAna);
  assert.deepEqual(despues, antes, 'el lugar de Ana no debe haber cambiado en nada');
  assert.equal((await e.db.query('select count(*)::int n from "Lugar"')).rows[0].n, 2, 'el admin no creó lugares');
});

test('un administrador supervisa en solo lectura y sin ver datos de contacto', async () => {
  const todos = await admin.get('/api/lugares/admin/todos');
  assert.equal(todos.status, 200);
  assert.equal(todos.json.length, 2);
  for (const l of todos.json) {
    assert.ok(l.negocio && l.negocio.nombreContacto);
    assert.ok(!('email' in l.negocio) && !('whatsapp' in l.negocio), 'no debe exponerse el correo ni el WhatsApp del dueño');
  }
  const pend = await admin.get('/api/lugares/admin/pendientes');
  assert.equal(pend.status, 200);
  assert.equal(pend.json.length, 2);
});

test('moderación: el admin aprueba o rechaza solo lugares PENDIENTES; no puede cambiar la visibilidad de uno ya revisado', async () => {
  assert.equal((await admin.patch(`/api/lugares/admin/${lugarAna}/estado`, { estado: 'PENDIENTE' })).status, 400, 'no se vuelve a PENDIENTE');
  assert.equal((await admin.patch(`/api/lugares/admin/${lugarAna}/estado`, { estado: 'EDITADO' })).status, 400);
  const ok = await admin.patch(`/api/lugares/admin/${lugarAna}/estado`, { estado: 'APROBADO' });
  assert.equal(ok.status, 200);
  assert.equal((await filaLugar(lugarAna)).estado, 'APROBADO');
  // ya aprobado: ocultarlo o volver a decidir es una excepción -> 409
  assert.equal((await admin.patch(`/api/lugares/admin/${lugarAna}/estado`, { estado: 'RECHAZADO' })).status, 409);
  assert.equal((await filaLugar(lugarAna)).estado, 'APROBADO');
  assert.equal((await admin.patch('/api/lugares/admin/999999/estado', { estado: 'APROBADO' })).status, 404);
  assert.equal((await crearCliente(e.base).get(`/api/lugares/${lugarAna}`)).status, 200, 'el lugar aprobado ya es público');
  assert.equal((await e.db.query(`select count(*)::int n from "Auditoria" where accion = 'lugar.estado' and "negocioAfectadoId" is not null`)).rows[0].n, 1);
});

test('un administrador sigue administrando el contenido propio de la plataforma (rutas), no el de negocios', async () => {
  const r = await admin.post('/api/rutas', { nombre: 'Ruta de prueba', descripcion: 'Descripcion de la ruta de prueba', categoria: 'Cultura', paradas: [{ lugarId: lugarAna }] });
  assert.ok([201, 400].includes(r.status), `ruta -> ${r.status} ${r.texto}`);
  assert.equal((await ana.post('/api/rutas', { nombre: 'Ruta hackeada' })).status, 403);
});

// ---------- roles no asignables desde afuera ----------
test('los roles de administrador y responsable no se pueden asignar por el registro ni por ninguna petición', async () => {
  const c = crearCliente(e.base);
  const reg = await c.post('/api/auth/registrar', { email: 'intruso@correo.com', password: PASSWORD_VALIDA, nombreContacto: 'Intruso Prueba', whatsapp: '50588888888', aceptaTerminos: true, esAdmin: true, esResponsable: true, rol: 'RESPONSABLE' });
  assert.equal(reg.status, 200);
  const { rows } = await e.db.query(`select "esAdmin", "esResponsable" from "Negocio" where email = 'intruso@correo.com'`);
  assert.deepEqual(rows[0], { esAdmin: false, esResponsable: false });
  const yo = await beto.get('/api/auth/me');
  assert.equal(yo.json.esAdmin, false);
  assert.equal((await beto.patch('/api/auth/me', { esAdmin: true })).status, 404, 'no existe ninguna ruta para editar el propio rol');
  assert.equal((await beto.post('/api/auth/cambiar-password', { esAdmin: true })).status, 400);
});

test('un administrador sin rol de responsable no obtiene permisos de responsable', async () => {
  assert.equal(tienePermiso({ esAdmin: true, esResponsable: false }, 'escalamiento:autorizar'), false);
  assert.equal((await admin.get('/api/auth/me')).json.esAdmin, true);
});
