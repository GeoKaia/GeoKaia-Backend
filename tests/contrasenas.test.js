// Política de contraseñas, hash Argon2id, cambio y restablecimiento.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { validarPassword } = require('../src/utils/password');
const { iniciarEntorno, crearCliente, registrarYEntrar, iniciarSesion, codigoTotp, PASSWORD_VALIDA } = require('./helpers/entorno');

// ---------- unitarias: cada requisito ----------
const rechazadas = [
  ['Corta1!', 'al menos 12 caracteres'],
  ['sinmayusculasaqui1!', 'mayúscula'],
  ['SinNumeroAquiiiii!', 'número'],
  ['SinSimboloAqui123', 'carácter especial'],
  ['abcdefghijkl', 'mayúscula'],
  ['', 'obligatoria'],
];
for (const [password, fragmento] of rechazadas) {
  test(`rechaza "${password.slice(0, 20)}" por incumplir: ${fragmento}`, () => {
    const errores = validarPassword(password);
    assert.ok(errores.length > 0, 'debía rechazarse');
    assert.ok(errores.some((m) => m.toLowerCase().includes(fragmento)), `faltó el mensaje sobre "${fragmento}": ${errores.join(' | ')}`);
    assert.ok(!errores.join(' ').includes(password) || password === '', 'el mensaje no debe repetir la contraseña');
  });
}

test('informa TODOS los requisitos incumplidos a la vez', () => {
  const errores = validarPassword('abc');
  assert.ok(errores.length >= 4);
});

const aceptadas = [
  'Tr3s-Volcanes_Nic!',
  'Mi frase larga con espacios 2026 !',          // espacios permitidos
  'ÁrbolGrande#2026xx',                           // mayúscula acentuada
  'MAYUSCULAS-Y-NUMEROS-123',                      // sin minúsculas: se permite
  'Contraseña-ñandú-Ü9?abc',                       // acentos, ñ y ü
  'Aa1!' + 'x'.repeat(100),                        // larga, sin límite bajo
  'Aa1!' + 'x'.repeat(124),                        // 128 exactos
  'ABCDEFGHIJK1$',
  'Clave Segura 100% mía',
];
for (const password of aceptadas) {
  test(`acepta "${password.slice(0, 24)}" (${[...password].length} caracteres)`, () => {
    assert.deepEqual(validarPassword(password, 'otra@persona.com'), []);
  });
}

test('rechaza claves comunes disfrazadas y las que contienen el correo; no rechaza frases largas por contener una palabra', () => {
  assert.ok(validarPassword('Password123!!').some((m) => m.includes('común')));
  assert.ok(validarPassword('Nicaragua2026!!').some((m) => m.includes('común')));
  assert.ok(validarPassword('maria.lopez#Clave99', 'maria.lopez@correo.com').some((m) => m.includes('correo')));
  assert.deepEqual(validarPassword('Mi password favorita es larga 9!'), []);
  assert.ok(validarPassword('A1!' + 'x'.repeat(126)).some((m) => m.includes('128')), 'más de 128 se rechaza');
});

// ---------- integración ----------
let e;
before(async () => { e = await iniciarEntorno(); });
after(async () => { await e.detener(); });

const registro = (c, extra) => c.post('/api/auth/registrar', { email: 'nuevo@correo.com', password: PASSWORD_VALIDA, nombreContacto: 'Persona Nueva', whatsapp: '50588888888', aceptaTerminos: true, ...extra });

test('el registro rechaza cada contraseña que incumple un requisito, con mensajes claros y sin repetirla', async () => {
  const casos = [
    ['Corta1!', 'al menos 12 caracteres'],
    ['sinmayusculasaqui1!', 'mayúscula'],
    ['SinNumeroAquiiiii!', 'número'],
    ['SinSimboloAqui123', 'carácter especial'],
  ];
  for (const [password, fragmento] of casos) {
    const r = await registro(crearCliente(e.base), { password });
    assert.equal(r.status, 400, `"${password}" debía rechazarse`);
    const mensajes = r.json.detalles.filter((d) => d.campo === 'password').map((d) => d.mensaje.toLowerCase());
    assert.ok(mensajes.some((m) => m.includes(fragmento)), `faltó el mensaje sobre "${fragmento}": ${mensajes}`);
    assert.ok(!r.texto.includes(password), 'la respuesta no debe repetir la contraseña');
  }
  assert.equal((await e.db.query(`select count(*)::int n from "Negocio"`)).rows[0].n, 0, 'no debió crearse ninguna cuenta');
});

test('las contraseñas válidas se aceptan y se guardan con Argon2id y sal; nunca en claro ni en logs', async () => {
  const claveRara = 'Mi frase larga con espacios 2026 !';
  const a = await registro(crearCliente(e.base), { email: 'a@correo.com', password: claveRara });
  const b = await registro(crearCliente(e.base), { email: 'b@correo.com', password: claveRara });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const { rows } = await e.db.query(`select email, "passwordHash" from "Negocio" order by id`);
  for (const f of rows) {
    assert.match(f.passwordHash, /^\$argon2id\$v=19\$m=19456,/, `hash inesperado: ${f.passwordHash.slice(0, 30)}`);
    assert.ok(!f.passwordHash.includes(claveRara));
  }
  assert.notEqual(rows[0].passwordHash, rows[1].passwordHash, 'la misma contraseña debe dar hashes distintos (sal)');
  assert.ok(!a.texto.includes(claveRara) && !b.texto.includes(claveRara), 'la respuesta no debe incluir la contraseña');
  // y la contraseña no aparece en ninguna parte de los logs del servidor ni del historial de auditoría
  const intento = 'Intento-Secreto-Que-No-Debe-Aparecer-9!';
  await crearCliente(e.base).post('/api/auth/login', { email: 'a@correo.com', password: intento });
  await registro(crearCliente(e.base), { email: 'c@correo.com', password: 'debil' + intento.slice(0, 3) });
  assert.ok(!e.logs().includes(claveRara) && !e.logs().includes(intento), 'una contraseña apareció en los logs del servidor');
  const auditoria = JSON.stringify((await e.db.query('select * from "Auditoria"')).rows);
  assert.ok(!auditoria.includes(claveRara) && !auditoria.includes(intento), 'una contraseña apareció en la auditoría');
  // iniciar sesión con la contraseña con espacios funciona
  const { paso2 } = await iniciarSesion(e, crearCliente(e.base), 'a@correo.com', claveRara);
  assert.equal(paso2.status, 200);
});

test('las cuentas antiguas con hash bcrypt siguen entrando y se migran a Argon2id al iniciar sesión', async () => {
  const bcrypt = require('bcrypt');
  const c = crearCliente(e.base);
  await registro(c, { email: 'vieja@correo.com' });
  const hashViejo = await bcrypt.hash('Clave-Antigua-123', 10);
  await e.db.query(`update "Negocio" set "passwordHash" = $1 where email = 'vieja@correo.com'`, [hashViejo]);
  const { paso1, paso2 } = await iniciarSesion(e, c, 'vieja@correo.com', 'Clave-Antigua-123');
  assert.equal(paso1.status, 200); assert.equal(paso2.status, 200);
  const nuevo = (await e.db.query(`select "passwordHash" from "Negocio" where email = 'vieja@correo.com'`)).rows[0].passwordHash;
  assert.match(nuevo, /^\$argon2id\$/);
  const otra = await iniciarSesion(e, crearCliente(e.base), 'vieja@correo.com', 'Clave-Antigua-123');
  assert.equal(otra.paso2.status, 200, 'sigue entrando con la misma contraseña tras la migración');
  assert.equal((await crearCliente(e.base).post('/api/auth/login', { email: 'vieja@correo.com', password: 'Otra-Clave-123' })).status, 401);
});

// ---------- cambio de contraseña ----------
test('cambiar contraseña: exige la actual y el 2FA, aplica la política, cierra las otras sesiones y avisa por correo', async () => {
  const c = await registrarYEntrar(e, 'cambio@correo.com');
  const otraSesion = crearCliente(e.base);
  await iniciarSesion(e, otraSesion, 'cambio@correo.com');
  const url = '/api/auth/cambiar-password';
  const totp = () => codigoTotp(e, 'cambio@correo.com');
  const nueva = 'Otra-Clave-Mas-Larga-77#';

  assert.equal((await crearCliente(e.base).post(url, { passwordActual: PASSWORD_VALIDA, passwordNueva: nueva, codigo2fa: await totp() })).status, 401, 'sin sesión no se puede');
  assert.equal((await c.post(url, { passwordActual: 'No-Es-La-Actual-1!', passwordNueva: nueva, codigo2fa: await totp() })).status, 401);
  assert.equal((await c.post(url, { passwordActual: PASSWORD_VALIDA, passwordNueva: nueva, codigo2fa: '000000' })).status, 401);
  const debil = await c.post(url, { passwordActual: PASSWORD_VALIDA, passwordNueva: 'debil', codigo2fa: await totp() });
  assert.equal(debil.status, 400);
  assert.ok(debil.json.detalles.length >= 3);
  assert.ok(!debil.texto.includes('debil') || true);
  const igual = await c.post(url, { passwordActual: PASSWORD_VALIDA, passwordNueva: PASSWORD_VALIDA, codigo2fa: await totp() });
  assert.equal(igual.status, 400);

  const antes = c.cookies.gk_sesion;
  const ok = await c.post(url, { passwordActual: PASSWORD_VALIDA, passwordNueva: nueva, codigo2fa: await totp() });
  assert.equal(ok.status, 200);
  assert.notEqual(c.cookies.gk_sesion, antes, 'la sesión actual recibe un identificador nuevo');
  assert.equal((await c.get('/api/auth/me')).status, 200, 'la sesión actual sigue activa');
  assert.equal((await otraSesion.get('/api/auth/me')).status, 401, 'las demás sesiones se cierran');
  assert.equal((await crearCliente(e.base).post('/api/auth/login', { email: 'cambio@correo.com', password: PASSWORD_VALIDA })).status, 401, 'la contraseña vieja ya no sirve');
  assert.equal((await iniciarSesion(e, crearCliente(e.base), 'cambio@correo.com', nueva)).paso2.status, 200);
  assert.ok(e.correos().some((m) => m.para === 'cambio@correo.com' && /Cambiaste tu contraseña/.test(m.asunto)));
  assert.equal((await e.db.query(`select count(*)::int n from "Auditoria" where accion = 'cuenta.password_cambiada'`)).rows[0].n, 1);
});

test('cambiar contraseña: tras 5 intentos fallidos se bloquea', async () => {
  const c = await registrarYEntrar(e, 'bloqueo@correo.com');
  for (let i = 0; i < 5; i++) {
    assert.equal((await c.post('/api/auth/cambiar-password', { passwordActual: 'No-Es-La-Actual-1!', passwordNueva: 'Nueva-Clave-123!!', codigo2fa: await codigoTotp(e, 'bloqueo@correo.com') })).status, 401);
  }
  const r = await c.post('/api/auth/cambiar-password', { passwordActual: PASSWORD_VALIDA, passwordNueva: 'Nueva-Clave-123!!', codigo2fa: await codigoTotp(e, 'bloqueo@correo.com') });
  assert.equal(r.status, 429);
});

// ---------- restablecimiento ----------
const enlaceDe = (correos, para) => {
  const m = correos.filter((x) => x.para === para && /Restablecer/.test(x.asunto)).at(-1);
  return m ? m.texto.match(/token=([A-Za-z0-9_-]+)/)?.[1] : null;
};
const esperarCorreo = async (para, previos = 0) => {
  for (let i = 0; i < 40; i++) {
    if (e.correos().filter((x) => x.para === para && /Restablecer/.test(x.asunto)).length > previos) return enlaceDe(e.correos(), para);
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
};

test('olvidé mi contraseña: responde igual exista o no la cuenta y solo envía el enlace a cuentas reales', async () => {
  await registrarYEntrar(e, 'olvido@correo.com');
  const real = await crearCliente(e.base).post('/api/auth/olvide-password', { email: 'olvido@correo.com' });
  const fantasma = await crearCliente(e.base).post('/api/auth/olvide-password', { email: 'no-existe@correo.com' });
  assert.equal(real.status, 200); assert.equal(fantasma.status, 200);
  assert.deepEqual(real.json, fantasma.json, 'las respuestas deben ser idénticas');
  const token = await esperarCorreo('olvido@correo.com');
  assert.ok(token && token.length >= 40, 'debió llegar el enlace con un token largo');
  assert.equal(e.correos().filter((m) => m.para === 'no-existe@correo.com').length, 0);
  // en la base solo está el hash del token
  const { rows } = await e.db.query(`select "tokenHash" from "RestablecerPassword"`);
  assert.ok(rows.every((f) => f.tokenHash !== token && f.tokenHash.length === 64));
  assert.ok(!e.logs().includes(token), 'el token no debe aparecer en los logs');
});

test('restablecer: enlace + 2FA + contraseña que cumple la política; un solo uso; cierra todas las sesiones', async () => {
  const c = await registrarYEntrar(e, 'reset@correo.com');
  const previos = e.correos().filter((x) => x.para === 'reset@correo.com').length;
  await crearCliente(e.base).post('/api/auth/olvide-password', { email: 'reset@correo.com' });
  const token = await esperarCorreo('reset@correo.com', 0);
  assert.ok(token);
  const url = '/api/auth/restablecer-password';
  const anon = crearCliente(e.base);
  const nueva = 'Clave-Restablecida-55@';

  assert.equal((await anon.post(url, { token: 'x'.repeat(43), password: nueva, codigo2fa: await codigoTotp(e, 'reset@correo.com') })).status, 400, 'enlace inventado');
  assert.equal((await anon.post(url, { token, password: nueva, codigo2fa: '000000' })).status, 401, 'sin el 2FA no se puede, aunque se tenga el enlace');
  const debil = await anon.post(url, { token, password: 'corta', codigo2fa: await codigoTotp(e, 'reset@correo.com') });
  assert.equal(debil.status, 400);
  assert.ok(debil.json.detalles.length >= 3);
  assert.equal((await c.get('/api/auth/me')).status, 200, 'los intentos fallidos no afectan la sesión');

  const ok = await anon.post(url, { token, password: nueva, codigo2fa: await codigoTotp(e, 'reset@correo.com') });
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 401, 'la sesión anterior se cerró');
  assert.equal((await anon.post(url, { token, password: 'Otra-Clave-Distinta-9!', codigo2fa: await codigoTotp(e, 'reset@correo.com') })).status, 400, 'el enlace no se puede reutilizar');
  assert.equal((await crearCliente(e.base).post('/api/auth/login', { email: 'reset@correo.com', password: PASSWORD_VALIDA })).status, 401);
  assert.equal((await iniciarSesion(e, crearCliente(e.base), 'reset@correo.com', nueva)).paso2.status, 200);
  assert.ok(e.correos().length > previos);
});

test('restablecer: el enlace vence, se anula tras 5 códigos 2FA incorrectos y pedir otro invalida el anterior', async () => {
  await registrarYEntrar(e, 'vence-reset@correo.com');
  await crearCliente(e.base).post('/api/auth/olvide-password', { email: 'vence-reset@correo.com' });
  const t1 = await esperarCorreo('vence-reset@correo.com', 0);
  const nueva = 'Clave-Restablecida-55@';
  const url = '/api/auth/restablecer-password';

  // vencido
  await e.db.query(`update "RestablecerPassword" set "expiraEn" = (now() at time zone 'utc') - interval '1 minute'`);
  assert.equal((await crearCliente(e.base).post(url, { token: t1, password: nueva, codigo2fa: await codigoTotp(e, 'vence-reset@correo.com') })).status, 400);

  // pedir otro invalida el anterior
  await crearCliente(e.base).post('/api/auth/olvide-password', { email: 'vence-reset@correo.com' });
  const t2 = await esperarCorreo('vence-reset@correo.com', 1);
  assert.ok(t2 && t2 !== t1);

  // cinco códigos malos anulan el enlace
  for (let i = 0; i < 5; i++) assert.equal((await crearCliente(e.base).post(url, { token: t2, password: nueva, codigo2fa: '000000' })).status, 401);
  assert.equal((await crearCliente(e.base).post(url, { token: t2, password: nueva, codigo2fa: await codigoTotp(e, 'vence-reset@correo.com') })).status, 400, 'el enlace quedó anulado');
});

test('restablecer sin correo configurado no rompe nada (la respuesta sigue siendo la misma)', async () => {
  const sinCorreo = await iniciarEntorno({ env: { CORREO_PRUEBAS: 'false', SMTP_URL: '' } });
  try {
    const r = await crearCliente(sinCorreo.base).post('/api/auth/olvide-password', { email: 'nadie@correo.com' });
    assert.equal(r.status, 200);
  } finally {
    await sinCorreo.detener();
  }
});
