// Autenticación, sesiones y cookies: el servidor es quien manda. Cubre los escenarios de seguridad exigidos.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { iniciarEntorno, crearCliente, registrarYEntrar, iniciarSesion, codigoTotp, PASSWORD_VALIDA } = require('./helpers/entorno');

let e;
let admin;
let usuario;
const COOKIE = 'gk_sesion';

before(async () => {
  e = await iniciarEntorno();
  admin = await registrarYEntrar(e, 'admin@correo.com', { admin: true, nombre: 'Admin Prueba' });
  usuario = await registrarYEntrar(e, 'usuario@correo.com', { nombre: 'Usuario Prueba' });
});
after(async () => { await e.detener(); });

const sesionesDe = async (email) => (await e.db.query(`select s.* from "Sesion" s join "Negocio" n on n.id = s."negocioId" where n.email = $1 order by s.id`, [email])).rows;

// ---------- F1 ----------
test('F1: sin sesión no se accede a ninguna ruta o API administrativa (401)', async () => {
  const anonimo = crearCliente(e.base);
  for (const [metodo, ruta] of [['get', '/api/admin/auditoria'], ['get', '/api/admin/auditoria/verificar'], ['get', '/api/lugares/admin/pendientes'], ['get', '/api/lugares/admin/todos'], ['post', '/api/rutas'], ['get', '/api/auth/me'], ['get', '/api/lugares/mi-lugar']]) {
    const r = await anonimo[metodo](ruta);
    assert.equal(r.status, 401, `${metodo.toUpperCase()} ${ruta} debía dar 401 y dio ${r.status}`);
  }
});

// ---------- F2 ----------
test('F2: un usuario normal que llama directo a la API administrativa recibe 403', async () => {
  const casos = [['get', '/api/admin/auditoria'], ['get', '/api/lugares/admin/pendientes'], ['get', '/api/lugares/admin/todos'], ['post', '/api/rutas', { nombre: 'x' }], ['patch', '/api/lugares/admin/1/estado', { estado: 'APROBADO' }], ['post', '/api/admin/cuentas/1/revocar-sesiones', {}]];
  for (const [metodo, ruta, cuerpo] of casos) {
    const r = await usuario[metodo](ruta, cuerpo);
    assert.equal(r.status, 403, `${metodo.toUpperCase()} ${ruta} debía dar 403 y dio ${r.status}`);
  }
  assert.equal((await admin.get('/api/admin/auditoria')).status, 200, 'el administrador sí debe poder');
});

// ---------- F3 ----------
test('F3: no se puede obtener el rol de administrador desde el navegador ni desde la petición', async () => {
  const c = crearCliente(e.base);
  const reg = await c.post('/api/auth/registrar', { email: 'listo@correo.com', password: PASSWORD_VALIDA, nombreContacto: 'Persona Lista', whatsapp: '50588888888', aceptaTerminos: true, esAdmin: true, rol: 'ADMIN', role: 'admin' });
  assert.equal(reg.status, 200);
  assert.equal((await e.db.query(`select "esAdmin" from "Negocio" where email = 'listo@correo.com'`)).rows[0].esAdmin, false, 'el registro público creó un administrador');
  await iniciarSesion(e, c, 'listo@correo.com');
  assert.equal((await c.get('/api/auth/me')).json.esAdmin, false);
  // cookies, cabeceras y parámetros que un navegador podría manipular: ninguno otorga privilegios
  c.cookies.rol = 'admin'; c.cookies.esAdmin = 'true'; c.cookies.role = 'ADMIN';
  for (const opciones of [{ headers: { 'x-rol': 'admin', 'x-admin': 'true' } }, {}]) {
    assert.equal((await c.get('/api/admin/auditoria?esAdmin=true&rol=admin', opciones)).status, 403);
  }
  assert.equal((await c.post('/api/rutas', { esAdmin: true, nombre: 'x' })).status, 403);
});

test('F3: un cambio de rol hecho en la base se aplica de inmediato (el servidor es la fuente de verdad)', async () => {
  const c = await registrarYEntrar(e, 'rol@correo.com');
  assert.equal((await c.get('/api/admin/auditoria')).status, 403);
  await e.db.query(`update "Negocio" set "esAdmin" = true where email = 'rol@correo.com'`);
  assert.equal((await c.get('/api/admin/auditoria')).status, 200, 'sin cerrar sesión debe notar el nuevo rol');
  await e.db.query(`update "Negocio" set "esAdmin" = false where email = 'rol@correo.com'`);
  assert.equal((await c.get('/api/admin/auditoria')).status, 403, 'al quitar el rol debe perder el acceso al instante');
});

// ---------- F4 ----------
test('F4: la sesión no depende de datos locales: el servidor ignora tokens enviados por cabecera o parámetros', async () => {
  const anonimo = crearCliente(e.base);
  const falso = jwt.sign({ id: 1, email: 'admin@correo.com', esAdmin: true }, e.env.JWT_SECRET);
  for (const h of [{ authorization: `Bearer ${falso}` }, { 'x-auth-token': falso }, { 'x-session': falso }]) {
    assert.equal((await anonimo.get('/api/auth/me', { headers: h })).status, 401);
  }
  assert.equal((await anonimo.get(`/api/auth/me?token=${falso}&sesion=${falso}`)).status, 401);
});

// ---------- F5 ----------
test('F5: eliminar, modificar o inventar la cookie de sesión obliga a autenticarse de nuevo', async () => {
  const c = await registrarYEntrar(e, 'cookie@correo.com');
  const valor = c.cookies[COOKIE];
  assert.ok(valor && valor.length >= 40, 'el identificador debe ser largo y aleatorio');
  assert.equal((await c.get('/api/auth/me')).status, 200);

  // modificada
  c.cookies[COOKIE] = valor.slice(0, -1) + (valor.endsWith('A') ? 'B' : 'A');
  const mod = await c.get('/api/auth/me');
  assert.equal(mod.status, 401);
  assert.equal(mod.json.codigo, 'desconocida');
  // inventada con un valor "con pinta de admin"
  for (const falso of ['admin', '1', 'true', Buffer.from(JSON.stringify({ id: 1, esAdmin: true })).toString('base64url')]) {
    c.cookies[COOKIE] = falso;
    assert.equal((await c.get('/api/admin/auditoria')).status, 401);
  }
  // eliminada: no hay nada que la reemplace (ya no existe la "cookie de dispositivo")
  delete c.cookies[COOKIE];
  const sin = await c.get('/api/auth/me');
  assert.equal(sin.status, 401);
  assert.equal(sin.json.codigo, 'sin_cookie');
  assert.equal((await c.get('/api/lugares/mi-lugar')).status, 401);
  // la cuenta no quedó marcada: iniciar sesión de nuevo funciona
  const { paso2 } = await iniciarSesion(e, c, 'cookie@correo.com');
  assert.equal(paso2.status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 200);
});

test('F5: reutilizar una cookie copiada solo sirve mientras la sesión siga vigente en el servidor', async () => {
  const c = await registrarYEntrar(e, 'copia@correo.com');
  const otro = crearCliente(e.base);
  otro.cookies[COOKIE] = c.cookies[COOKIE];
  assert.equal((await otro.get('/api/auth/me')).status, 200, 'una cookie válida funciona (es una llave al portador; por eso HttpOnly+Secure)');
  await c.post('/api/auth/logout');
  assert.equal((await otro.get('/api/auth/me')).status, 401, 'tras cerrar sesión, la copia deja de servir');
});

// ---------- F6 ----------
test('F6: al cerrar sesión se invalida en el servidor y la cookie vieja no se puede reutilizar', async () => {
  const c = await registrarYEntrar(e, 'logout@correo.com');
  const vieja = c.cookies[COOKIE];
  const r = await c.post('/api/auth/logout');
  assert.equal(r.status, 200);
  assert.ok(r.setCookies.some((x) => x.startsWith(`${COOKIE}=;`) && /Expires=Thu, 01 Jan 1970/.test(x)), 'debe expirar la cookie en el navegador');
  const fila = (await sesionesDe('logout@correo.com')).at(-1);
  assert.ok(fila.revocadaEn, 'la sesión debe quedar revocada en la base');
  assert.equal(fila.motivoRevocacion, 'logout');
  const reuso = crearCliente(e.base);
  reuso.cookies[COOKIE] = vieja;
  const rr = await reuso.get('/api/auth/me');
  assert.equal(rr.status, 401);
  assert.equal(rr.json.codigo, 'revocada');
  assert.equal((await reuso.get('/api/lugares/mi-lugar')).status, 401);
});

// ---------- F7 ----------
test('F7: una sesión expirada, inactiva o revocada es rechazada; iniciar sesión de nuevo la reemplaza', async () => {
  const c = await registrarYEntrar(e, 'vence@correo.com');
  const id = (await sesionesDe('vence@correo.com')).at(-1).id;

  await e.db.query(`update "Sesion" set "expiraEn" = (now() at time zone 'utc') - interval '1 minute' where id = $1`, [id]);
  let r = await c.get('/api/auth/me');
  assert.equal(r.status, 401); assert.equal(r.json.codigo, 'expirada');

  const c2 = await registrarYEntrar(e, 'inactiva@correo.com');
  const id2 = (await sesionesDe('inactiva@correo.com')).at(-1).id;
  await e.db.query(`update "Sesion" set "ultimaActividad" = (now() at time zone 'utc') - interval '31 minutes' where id = $1`, [id2]);
  r = await c2.get('/api/auth/me');
  assert.equal(r.status, 401); assert.equal(r.json.codigo, 'inactividad');

  const c3 = await registrarYEntrar(e, 'revocada@correo.com');
  const id3 = (await sesionesDe('revocada@correo.com')).at(-1).id;
  await e.db.query(`update "Sesion" set "revocadaEn" = (now() at time zone 'utc') where id = $1`, [id3]);
  r = await c3.get('/api/auth/me');
  assert.equal(r.status, 401); assert.equal(r.json.codigo, 'revocada');

  // con una cookie vencida todavía en el navegador, el login normal funciona y deja una sesión nueva distinta
  const vieja = crearCliente(e.base);
  vieja.cookies[COOKIE] = c.cookies[COOKIE] ?? 'vencida';
  const { paso2 } = await iniciarSesion(e, vieja, 'vence@correo.com');
  assert.equal(paso2.status, 200);
  assert.equal((await vieja.get('/api/auth/me')).status, 200);
});

test('F7: la actividad dentro del límite mantiene la sesión y actualiza la última actividad', async () => {
  const c = await registrarYEntrar(e, 'activa@correo.com');
  const id = (await sesionesDe('activa@correo.com')).at(-1).id;
  await e.db.query(`update "Sesion" set "ultimaActividad" = (now() at time zone 'utc') - interval '10 minutes' where id = $1`, [id]);
  assert.equal((await c.get('/api/auth/me')).status, 200);
  await new Promise((r) => setTimeout(r, 400));
  const { rows } = await e.db.query(`select (now() at time zone 'utc') - "ultimaActividad" < interval '1 minute' as reciente from "Sesion" where id = $1`, [id]);
  assert.equal(rows[0].reciente, true);
});

// ---------- A/B/C: identificador, fijación, atributos ----------
test('el identificador de sesión se regenera al iniciar sesión (no hay fijación de sesión)', async () => {
  const c = crearCliente(e.base);
  c.cookies[COOKIE] = 'identificador-impuesto-por-un-atacante-0123456789';
  const { paso2 } = await iniciarSesion(e, c, 'usuario@correo.com');
  assert.equal(paso2.status, 200);
  assert.notEqual(c.cookies[COOKIE], 'identificador-impuesto-por-un-atacante-0123456789');
  const atacante = crearCliente(e.base);
  atacante.cookies[COOKIE] = 'identificador-impuesto-por-un-atacante-0123456789';
  assert.equal((await atacante.get('/api/auth/me')).status, 401);

  // si ya había una sesión activa, volver a iniciar sesión revoca la anterior
  const antigua = c.cookies[COOKIE];
  const { paso2: otra } = await iniciarSesion(e, c, 'usuario@correo.com');
  assert.equal(otra.status, 200);
  assert.notEqual(c.cookies[COOKIE], antigua);
  const reuso = crearCliente(e.base); reuso.cookies[COOKIE] = antigua;
  assert.equal((await reuso.get('/api/auth/me')).json.codigo, 'revocada');
});

test('la cookie lleva HttpOnly, SameSite=Lax, Path=/, sin Domain, vigencia acotada y nada de datos del usuario', async () => {
  const c = crearCliente(e.base);
  const { paso2 } = await iniciarSesion(e, c, 'usuario@correo.com');
  const sc = paso2.setCookies.find((x) => x.startsWith(`${COOKIE}=`));
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Lax/i);
  assert.match(sc, /Path=\//);
  assert.doesNotMatch(sc, /Domain=/i);
  assert.match(sc, /Max-Age=28800/);
  assert.equal(paso2.setCookies.length, 1, 'solo debe fijar la cookie de sesión (sin cookies de privilegios ni de dispositivo)');
  const valor = sc.split(';')[0].split('=')[1];
  assert.doesNotMatch(Buffer.from(valor, 'base64url').toString('utf8'), /usuario@|admin|esAdmin/i, 'el valor no debe contener datos');
  assert.ok(!paso2.json.token, 'el cuerpo no debe traer ningún token');
});

test('la cookie de un administrador es de sesión del navegador (sin Max-Age)', async () => {
  const c = crearCliente(e.base);
  const { paso2 } = await iniciarSesion(e, c, 'admin@correo.com');
  const sc = paso2.setCookies.find((x) => x.startsWith(`${COOKIE}=`));
  assert.doesNotMatch(sc, /Max-Age|Expires/i);
  assert.match(sc, /HttpOnly/i);
});

test('en producción la cookie es Secure y usa el prefijo __Host-', async () => {
  const prod = await iniciarEntorno({ env: { COOKIE_SECURE: 'true' } });
  try {
    const c = await registrarYEntrar(prod, 'seguro@correo.com');
    assert.ok(Object.keys(c.cookies).includes('__Host-gk_sesion'), `cookies: ${Object.keys(c.cookies)}`);
    const { paso2 } = await iniciarSesion(prod, c, 'seguro@correo.com');
    const sc = paso2.setCookies.find((x) => x.startsWith('__Host-gk_sesion='));
    assert.match(sc, /; Secure/);
    assert.match(sc, /HttpOnly/i);
    assert.match(sc, /Path=\//);
    assert.equal((await c.get('/api/auth/me')).status, 200);
  } finally {
    await prod.detener();
  }
});

// ---------- CSRF ----------
test('CSRF: las escrituras con cookie de sesión exigen un Origin permitido', async () => {
  const c = await registrarYEntrar(e, 'csrf@correo.com');
  const lugar = { nombre: 'Lugar CSRF', descripcion: 'Descripcion con suficientes caracteres', categoria: 'gastronomia', latitud: 12, longitud: -86 };
  const ajeno = await c.post('/api/lugares', lugar, { headers: { origin: 'https://sitio-malicioso.example' } });
  assert.equal(ajeno.status, 403);
  const sinOrigen = await c.post('/api/lugares', lugar, { sinOrigen: true });
  assert.equal(sinOrigen.status, 403, 'con cookie y sin Origin debe rechazarse');
  const bien = await c.post('/api/lugares', lugar);
  assert.equal(bien.status, 201);
  // las lecturas no se ven afectadas
  assert.equal((await c.get('/api/auth/me', { headers: { origin: 'https://sitio-malicioso.example' } })).status, 200);
});

// ---------- fuerza bruta y enumeración ----------
test('fuerza bruta: tras 10 intentos fallidos la cuenta se bloquea aunque se cambie de IP; los mensajes no revelan si existe', async () => {
  const victima = 'victima@correo.com';
  await registrarYEntrar(e, victima);
  const mensajes = new Set();
  for (let i = 0; i < 10; i++) {
    const r = await crearCliente(e.base).post('/api/auth/login', { email: victima, password: 'Incorrecta-123!' }, { headers: { 'x-forwarded-for': `10.9.0.${i + 1}` } });
    assert.equal(r.status, 401);
    mensajes.add(r.json.error);
  }
  const inexistente = await crearCliente(e.base).post('/api/auth/login', { email: 'no-existe@correo.com', password: 'Incorrecta-123!' });
  mensajes.add(inexistente.json.error);
  assert.equal(inexistente.status, 401);
  assert.equal(mensajes.size, 1, `respuestas distintas entre cuenta real e inexistente: ${[...mensajes]}`);

  const bloqueado = await crearCliente(e.base).post('/api/auth/login', { email: victima, password: PASSWORD_VALIDA }, { headers: { 'x-forwarded-for': '10.9.9.9' } });
  assert.equal(bloqueado.status, 429, 'ni con la contraseña correcta y otra IP debe pasar');
  // a una cuenta inexistente también se le aplica (así el bloqueo tampoco delata cuentas)
  for (let i = 0; i < 10; i++) await crearCliente(e.base).post('/api/auth/login', { email: 'fantasma@correo.com', password: 'x-Incorrecta1!' }, { headers: { 'x-forwarded-for': `10.8.0.${i + 1}` } });
  assert.equal((await crearCliente(e.base).post('/api/auth/login', { email: 'fantasma@correo.com', password: 'x-Incorrecta1!' })).status, 429);
  // y el bloqueo de una cuenta no afecta a las demás
  const otra = await iniciarSesion(e, crearCliente(e.base), 'usuario@correo.com');
  assert.equal(otra.paso2.status, 200);
  const reg = (await e.db.query(`select count(*)::int n from "Auditoria" where accion = 'sesion.login_bloqueado'`)).rows[0].n;
  assert.ok(reg >= 2, 'los bloqueos deben quedar en el historial');
});

// ---------- 2FA ----------
test('2FA: sin pasoToken válido no hay forma de probar códigos; el código incorrecto, el paso vencido y el bloqueo funcionan', async () => {
  const c = crearCliente(e.base);
  // el id numérico de antes ya no sirve
  assert.equal((await c.post('/api/auth/verificar-2fa', { negocioId: 1, token: '123456' })).status, 400);
  // un pasoToken inventado, de otro tipo o vencido
  const inventado = await c.post('/api/auth/verificar-2fa', { pasoToken: 'a'.repeat(40), token: '123456' });
  assert.equal(inventado.status, 401);
  const otroTipo = jwt.sign({ typ: 'acceso', sub: '1' }, e.env.JWT_SECRET, { expiresIn: '5m' });
  assert.equal((await c.post('/api/auth/verificar-2fa', { pasoToken: otroTipo, token: '123456' })).status, 401);
  const idUsuario = (await e.db.query(`select id from "Negocio" where email = 'usuario@correo.com'`)).rows[0].id;
  const vencido = jwt.sign({ typ: '2fa', sub: String(idUsuario) }, e.env.JWT_SECRET, { expiresIn: -10 });
  assert.equal((await c.post('/api/auth/verificar-2fa', { pasoToken: vencido, token: await codigoTotp(e, 'usuario@correo.com') })).status, 401);
  const firmaAjena = jwt.sign({ typ: '2fa', sub: String(idUsuario) }, 'otra-clave-que-no-es-la-del-servidor', { expiresIn: '5m' });
  assert.equal((await c.post('/api/auth/verificar-2fa', { pasoToken: firmaAjena, token: await codigoTotp(e, 'usuario@correo.com') })).status, 401);

  // código incorrecto x8 -> bloqueo, aunque el noveno sea correcto (cuenta aparte para no mezclar contadores)
  await registrarYEntrar(e, 'dosfa@correo.com');
  const l = await c.post('/api/auth/login', { email: 'dosfa@correo.com', password: PASSWORD_VALIDA });
  for (let i = 0; i < 8; i++) {
    const r = await crearCliente(e.base).post('/api/auth/verificar-2fa', { pasoToken: l.json.pasoToken, token: '000000' }, { headers: { 'x-forwarded-for': `10.7.0.${i + 1}` } });
    assert.equal(r.status, 401);
  }
  const noveno = await crearCliente(e.base).post('/api/auth/verificar-2fa', { pasoToken: l.json.pasoToken, token: await codigoTotp(e, 'dosfa@correo.com') }, { headers: { 'x-forwarded-for': '10.7.9.9' } });
  assert.equal(noveno.status, 429);
});

test('MFA: una cuenta de administrador sin segundo factor configurado no puede abrir sesión', async () => {
  const c = crearCliente(e.base);
  await c.post('/api/auth/registrar', { email: 'sinmfa@correo.com', password: PASSWORD_VALIDA, nombreContacto: 'Sin Mfa', whatsapp: '50588888888', aceptaTerminos: true });
  await e.db.query(`update "Negocio" set "esAdmin" = true, "totpSecret" = null where email = 'sinmfa@correo.com'`);
  const l = await c.post('/api/auth/login', { email: 'sinmfa@correo.com', password: PASSWORD_VALIDA });
  assert.equal(l.status, 200);
  const r = await c.post('/api/auth/verificar-2fa', { pasoToken: l.json.pasoToken, token: '123456' });
  assert.equal(r.status, 401);
  assert.equal((await c.get('/api/admin/auditoria')).status, 401);
});

// ---------- gestión de sesiones ----------
test('un usuario ve y cierra sus propias sesiones; no puede tocar las de otra cuenta (IDOR)', async () => {
  const a1 = await registrarYEntrar(e, 'multi@correo.com');
  const a2 = crearCliente(e.base);
  await iniciarSesion(e, a2, 'multi@correo.com');
  const lista = await a1.get('/api/auth/sesiones');
  assert.equal(lista.status, 200);
  assert.equal(lista.json.length, 2);
  assert.equal(lista.json.filter((s) => s.actual).length, 1);
  assert.ok(lista.json.every((s) => !('tokenHash' in s)), 'no debe exponer el hash');

  const otra = (await sesionesDe('multi@correo.com')).find((s) => !lista.json.find((x) => x.actual && x.id === s.id));
  // otra cuenta intenta cerrarla por id
  const ajeno = await usuario.delete(`/api/auth/sesiones/${otra.id}`);
  assert.equal(ajeno.status, 404);
  assert.equal((await a2.get('/api/auth/me')).status, 200, 'la sesión ajena no debía verse afectada');
  assert.equal((await usuario.get('/api/auth/sesiones')).json.every((s) => s.id !== otra.id), true);

  // la propia dueña sí puede
  assert.equal((await a1.delete(`/api/auth/sesiones/${otra.id}`)).status, 200);
  assert.equal((await a2.get('/api/auth/me')).status, 401);

  // cerrar todas
  const a3 = crearCliente(e.base); await iniciarSesion(e, a3, 'multi@correo.com');
  assert.equal((await a1.post('/api/auth/logout-todas')).status, 200);
  assert.equal((await a1.get('/api/auth/me')).status, 401);
  assert.equal((await a3.get('/api/auth/me')).status, 401);
});

test('un administrador puede revocar las sesiones de una cuenta (incidente) y queda auditado', async () => {
  const victima = await registrarYEntrar(e, 'comprometida@correo.com');
  const id = (await e.db.query(`select id from "Negocio" where email = 'comprometida@correo.com'`)).rows[0].id;
  assert.equal((await victima.post(`/api/admin/cuentas/${id}/revocar-sesiones`)).status, 403);
  const r = await admin.post(`/api/admin/cuentas/${id}/revocar-sesiones`);
  assert.equal(r.status, 200);
  assert.ok(r.json.revocadas >= 1);
  assert.equal((await victima.get('/api/auth/me')).status, 401);
  assert.equal((await admin.post('/api/admin/cuentas/999999/revocar-sesiones')).status, 404);
  assert.equal((await e.db.query(`select count(*)::int n from "Auditoria" where accion = 'sesion.revocar_cuenta'`)).rows[0].n, 1);
});

test('borrar la cuenta elimina sus sesiones y una cuenta administradora no se puede borrar desde la API', async () => {
  const c = await registrarYEntrar(e, 'adios@correo.com');
  const r = await c.delete('/api/auth/cuenta', { password: PASSWORD_VALIDA });
  assert.equal(r.status, 200);
  assert.equal((await e.db.query(`select count(*)::int n from "Sesion" s join "Negocio" n on n.id = s."negocioId" where n.email = 'adios@correo.com'`)).rows[0].n, 0);
  const noAdmin = await admin.delete('/api/auth/cuenta', { password: PASSWORD_VALIDA });
  assert.equal(noAdmin.status, 403);
});
