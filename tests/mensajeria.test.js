// Canal oficial entre el equipo de GeoKaia y los negocios: conversaciones privadas, historial y control de acceso por recurso.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarEntorno, crearCliente, registrarYEntrar, PASSWORD_VALIDA } = require('./helpers/entorno');

let e;
let admin; let ana; let beto;
let lugarAna; let lugarBeto;
let convAna; // id de la conversación admin <-> Ana
const lugar = (nombre) => ({ nombre, descripcion: `Descripcion de ${nombre} con mas de diez caracteres`, categoria: 'gastronomia', latitud: 12.1, longitud: -86.2 });
const auditoria = async (where, params = []) => (await e.db.query(`select * from "Auditoria" where ${where} order by id`, params)).rows;

before(async () => {
  e = await iniciarEntorno();
  admin = await registrarYEntrar(e, 'admin@correo.com', { admin: true, nombre: 'Admin Secreto' });
  ana = await registrarYEntrar(e, 'ana@correo.com', { nombre: 'Ana Dueña' });
  beto = await registrarYEntrar(e, 'beto@correo.com', { nombre: 'Beto Dueño' });
  lugarAna = (await ana.post('/api/lugares', lugar('Cafe de Ana'))).json.lugar.id;
  lugarBeto = (await beto.post('/api/lugares', lugar('Cafe de Beto'))).json.lugar.id;
});
after(async () => { await e.detener(); });

test('el administrador abre una conversación con un negocio y el negocio la recibe (sin ver quién es el admin)', async () => {
  const r = await admin.post('/api/admin/conversaciones', { lugarId: lugarAna, asunto: 'La foto principal no se ve', texto: 'Hola Ana, la foto principal de tu lugar no carga. ¿Podés subir otra?' });
  assert.equal(r.status, 201);
  convAna = r.json.conversacion.id;
  assert.equal(r.json.conversacion.estado, 'ABIERTA');
  assert.equal((await e.db.query(`select "negocioId" from "Conversacion" where id = $1`, [convAna])).rows[0].negocioId, (await e.db.query(`select id from "Negocio" where email = 'ana@correo.com'`)).rows[0].id);

  const lista = await ana.get('/api/mensajes/conversaciones');
  assert.equal(lista.status, 200);
  assert.equal(lista.json.length, 1);
  assert.equal(lista.json[0].noLeidos, 1, 'Ana tiene un mensaje nuevo sin leer');
  assert.equal(lista.json[0].lugarNombre, 'Cafe de Ana');
  assert.equal((await ana.get('/api/mensajes/no-leidos')).json.noLeidos, 1);

  const hilo = await ana.get(`/api/mensajes/conversaciones/${convAna}`);
  assert.equal(hilo.status, 200);
  assert.equal(hilo.json.mensajes.length, 1);
  const m = hilo.json.mensajes[0];
  assert.equal(m.autorRol, 'ADMIN');
  assert.equal(m.autorNombre, 'Equipo GeoKaia', 'al negocio no se le muestra el nombre del administrador');
  assert.ok(!('autorId' in m) && !hilo.texto.includes('admin@correo.com') && !hilo.texto.includes('Admin Secreto'), 'no debe exponer datos del admin');
  assert.ok(m.creadoEn);
  assert.equal((await ana.get('/api/mensajes/no-leidos')).json.noLeidos, 0, 'al abrirla quedó leída');
});

test('el estado del mensaje (Enviado/Leído) lo ve quien lo envió', async () => {
  const vista = await admin.get(`/api/admin/conversaciones/${convAna}`);
  assert.equal(vista.status, 200);
  assert.equal(vista.json.mensajes[0].estado, 'LEIDO');
  assert.ok(vista.json.mensajes[0].leidoEn);
  assert.equal(vista.json.mensajes[0].autorNombre, 'Admin Secreto', 'el equipo sí ve quién escribió');
});

test('el propietario responde y el equipo recibe la notificación', async () => {
  const r = await ana.post(`/api/mensajes/conversaciones/${convAna}/mensajes`, { texto: 'Hola, ya subí otra foto desde mi panel.' });
  assert.equal(r.status, 201);
  assert.equal(r.json.mensaje.autorRol, 'PROPIETARIO');
  assert.equal(r.json.mensaje.estado, 'ENVIADO');
  const noLeidos = await admin.get('/api/admin/conversaciones/no-leidos');
  assert.equal(noLeidos.json.noLeidos, 1);
  const lista = await admin.get('/api/admin/conversaciones');
  assert.equal(lista.json[0].noLeidos, 1);
  assert.equal(lista.json[0].negocio.nombreContacto, 'Ana Dueña');
  assert.ok(!('email' in lista.json[0].negocio), 'sin datos de contacto del dueño');
  assert.equal((await admin.get(`/api/admin/conversaciones/${convAna}`)).json.mensajes.length, 2);
  assert.equal((await admin.get('/api/admin/conversaciones/no-leidos')).json.noLeidos, 0);
});

test('IDOR: otro negocio no puede ver, responder ni cambiar las conversaciones de Ana (404 idéntico a "no existe")', async () => {
  const inexistente = await beto.get('/api/mensajes/conversaciones/999999');
  const ajena = await beto.get(`/api/mensajes/conversaciones/${convAna}`);
  assert.equal(ajena.status, 404);
  assert.deepEqual(ajena.json, inexistente.json, 'no debe poder distinguirse una conversación ajena de una inexistente');
  assert.equal((await beto.post(`/api/mensajes/conversaciones/${convAna}/mensajes`, { texto: 'Soy Beto metiéndome' })).status, 404);
  assert.equal((await beto.patch(`/api/mensajes/conversaciones/${convAna}/estado`, { estado: 'RESUELTA' })).status, 404);
  assert.equal((await beto.get('/api/mensajes/conversaciones')).json.length, 0, 'Beto no ve la conversación de Ana en su bandeja');
  const hilo = (await e.db.query(`select count(*)::int n from "Mensaje" where "conversacionId" = $1`, [convAna])).rows[0].n;
  assert.equal(hilo, 2, 'ningún mensaje de Beto se coló');
  assert.equal((await e.db.query(`select estado from "Conversacion" where id = $1`, [convAna])).rows[0].estado, 'ABIERTA');
  // el intento queda auditado
  const regs = await auditoria(`accion = 'acceso.denegado_recurso' and "actorEmail" = 'beto@correo.com'`);
  assert.ok(regs.length >= 3);
  assert.equal(regs[0].resultado, 'DENEGADO');
  // sin sesión
  assert.equal((await crearCliente(e.base).get(`/api/mensajes/conversaciones/${convAna}`)).status, 401);
});

test('separación de roles: el propietario no usa la bandeja de administración y el administrador no usa la de propietarios', async () => {
  for (const [metodo, ruta, cuerpo] of [['get', '/api/admin/conversaciones'], ['get', `/api/admin/conversaciones/${convAna}`], ['post', '/api/admin/conversaciones', { lugarId: lugarBeto, asunto: 'Intento', texto: 'x' }], ['post', `/api/admin/conversaciones/${convAna}/mensajes`, { texto: 'x' }], ['patch', `/api/admin/conversaciones/${convAna}/estado`, { estado: 'RESUELTA' }], ['get', '/api/admin/conversaciones/no-leidos']]) {
    assert.equal((await ana[metodo](ruta, cuerpo)).status, 403, `${metodo} ${ruta}`);
  }
  assert.equal((await admin.get('/api/mensajes/conversaciones')).status, 403, 'un admin no es propietario de ningún negocio');
  assert.equal((await admin.get('/api/mensajes/no-leidos')).status, 403);
});

test('estados de la conversación: Abierta, En seguimiento y Resuelta', async () => {
  assert.equal((await admin.patch(`/api/admin/conversaciones/${convAna}/estado`, { estado: 'EN_SEGUIMIENTO' })).status, 200);
  assert.equal((await ana.get('/api/mensajes/conversaciones')).json[0].estado, 'EN_SEGUIMIENTO');
  assert.equal((await ana.patch(`/api/mensajes/conversaciones/${convAna}/estado`, { estado: 'EN_SEGUIMIENTO' })).status, 400, 'el propietario no pone "en seguimiento"');
  assert.equal((await ana.patch(`/api/mensajes/conversaciones/${convAna}/estado`, { estado: 'INVENTADO' })).status, 400);
  assert.equal((await ana.patch(`/api/mensajes/conversaciones/${convAna}/estado`, { estado: 'RESUELTA' })).status, 200);
  // al responder una conversación resuelta se reabre sola
  await admin.post(`/api/admin/conversaciones/${convAna}/mensajes`, { texto: 'Gracias, lo revisamos mañana.' });
  assert.equal((await e.db.query(`select estado from "Conversacion" where id = $1`, [convAna])).rows[0].estado, 'ABIERTA');
  assert.equal((await admin.patch(`/api/admin/conversaciones/${convAna}/estado`, { estado: 'RESUELTA' })).status, 200);
  assert.equal((await admin.patch(`/api/admin/conversaciones/${convAna}/estado`, { estado: 'X' })).status, 400);
  assert.equal((await admin.get('/api/admin/conversaciones?estado=RESUELTA')).json.length, 1);
  assert.equal((await admin.get('/api/admin/conversaciones?estado=ABIERTA')).json.length, 0);
  assert.equal((await admin.get('/api/admin/conversaciones?estado=basura')).status, 400);
});

test('validación de mensajes y contenido tratado como texto', async () => {
  assert.equal((await ana.post(`/api/mensajes/conversaciones/${convAna}/mensajes`, { texto: '   ' })).status, 400);
  assert.equal((await ana.post(`/api/mensajes/conversaciones/${convAna}/mensajes`, { texto: 'x'.repeat(2001) })).status, 400);
  assert.equal((await ana.post(`/api/mensajes/conversaciones/${convAna}/mensajes`, {})).status, 400);
  const html = '<img src=x onerror=alert(1)> & "comillas"';
  const r = await ana.post(`/api/mensajes/conversaciones/${convAna}/mensajes`, { texto: html });
  assert.equal(r.status, 201);
  assert.equal(r.json.mensaje.texto, html, 'se guarda y devuelve como texto plano (el frontend lo muestra escapado)');
  assert.equal((await admin.post('/api/admin/conversaciones', { lugarId: lugarAna, asunto: 'ab', texto: 'hola' })).status, 400);
  assert.equal((await admin.post('/api/admin/conversaciones', { lugarId: 'uno', asunto: 'Asunto valido', texto: 'hola' })).status, 400);
  assert.equal((await admin.post('/api/admin/conversaciones', { lugarId: 999999, asunto: 'Asunto valido', texto: 'hola' })).status, 404);
});

test('un lugar sin propietario no admite conversaciones', async () => {
  const { rows } = await e.db.query(`insert into "Lugar" (nombre, descripcion, categoria, latitud, longitud, "galeriaUrls") values ('Lugar huérfano', 'Cargado sin dueño', 'CULTURA', 12, -86, '{}') returning id`);
  const r = await admin.post('/api/admin/conversaciones', { lugarId: rows[0].id, asunto: 'Sin dueño', texto: 'hola' });
  assert.equal(r.status, 400);
});

test('historial: los mensajes no se pueden editar ni borrar, ni siquiera desde la base; solo marcar como leídos', async () => {
  const { rows } = await e.db.query(`select id from "Mensaje" order by id limit 1`);
  const id = rows[0].id;
  await assert.rejects(e.db.query(`update "Mensaje" set texto = 'editado' where id = $1`, [id]), /no se pueden editar/);
  await assert.rejects(e.db.query(`update "Mensaje" set "autorRol" = 'ADMIN', "autorNombre" = 'otro' where id = $1`, [id]), /no se pueden editar/);
  await assert.rejects(e.db.query(`delete from "Mensaje" where id = $1`, [id]), /no se pueden borrar/);
  await e.db.query(`update "Mensaje" set "leidoEn" = now() where id = $1`, [id]); // la marca de lectura sí
  // no existe ninguna ruta HTTP para editar o borrar mensajes
  for (const [metodo, ruta] of [['patch', `/api/mensajes/conversaciones/${convAna}/mensajes/${id}`], ['delete', `/api/mensajes/conversaciones/${convAna}/mensajes/${id}`], ['delete', `/api/mensajes/conversaciones/${convAna}`], ['delete', `/api/admin/conversaciones/${convAna}`]]) {
    assert.ok([403, 404, 405].includes((await ana[metodo](ruta, {})).status) && [403, 404, 405].includes((await admin[metodo](ruta, {})).status), `${metodo} ${ruta}`);
  }
});

test('auditoría: crear y leer conversaciones privadas queda registrado, sin copiar el contenido', async () => {
  const crear = await auditoria(`accion = 'conversacion.crear'`);
  assert.equal(crear.length, 1);
  assert.equal(crear[0].actorRol, 'ADMIN');
  assert.ok(crear[0].negocioAfectadoId);
  assert.ok((await auditoria(`accion = 'conversacion.ver' and "actorEmail" = 'admin@correo.com'`)).length >= 1, 'que un admin lea una conversación privada queda registrado');
  const todo = JSON.stringify(await auditoria('true'));
  assert.ok(!todo.includes('la foto principal de tu lugar no carga') && !todo.includes('onerror'), 'el texto de los mensajes no va a la auditoría');
});

test('aviso por correo: el negocio recibe un aviso sin el contenido del mensaje', async () => {
  const avisos = e.correos().filter((m) => m.para === 'ana@correo.com' && /mensaje nuevo/.test(m.asunto));
  assert.ok(avisos.length >= 1);
  assert.ok(avisos.every((m) => !m.texto.includes('foto principal')), 'el aviso no incluye el mensaje');
  assert.match(avisos[0].texto, /panel-negocio\/mensajes/);
});

test('la conversación se conserva como historial aunque el negocio borre su lugar', async () => {
  const antes = (await admin.get(`/api/admin/conversaciones/${convAna}`)).json.mensajes.length;
  const r = await ana.delete('/api/lugares/mi-lugar', { password: PASSWORD_VALIDA });
  assert.equal(r.status, 200, e.logs().slice(-1200));
  const vista = await admin.get(`/api/admin/conversaciones/${convAna}`);
  assert.equal(vista.status, 200);
  assert.equal(vista.json.mensajes.length, antes);
  assert.equal(vista.json.lugarNombre, 'Cafe de Ana');
  assert.equal((await ana.get(`/api/mensajes/conversaciones/${convAna}`)).status, 200, 'Ana sigue viendo su historial');
});
