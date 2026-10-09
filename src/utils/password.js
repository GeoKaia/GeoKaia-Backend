// Política de contraseñas para cuentas NUEVAS (registro). El login no la aplica: las cuentas anteriores
// siguen entrando con la contraseña que ya tenían.
//
//   - 12 caracteres como mínimo.
//   - Al menos una mayúscula, un número y un símbolo (cualquier carácter que no sea letra, número ni espacio).
//   - Máximo 72 bytes: bcrypt ignora lo que pase de ahí, y el tope evita que alguien mande megabytes para gastar CPU.
//   - No puede ser una contraseña típica ni contener el correo.
const LARGO_MINIMO = 12;
const BYTES_MAXIMOS = 72;

const COMUNES = ['password', 'contrasena', 'contraseña', '123456789', 'qwertyuiop', 'abcdefghij', 'iloveyou', 'admin', 'geokaia', 'nicaragua', 'managua', 'bienvenido'];

// Devuelve la lista de problemas (vacía si la contraseña es válida). Los mensajes se muestran tal cual al usuario.
function problemasDeContrasena(password, email = '') {
  const problemas = [];
  if (typeof password !== 'string') return ['La contraseña es obligatoria'];

  if (password.length < LARGO_MINIMO) problemas.push(`Debe tener al menos ${LARGO_MINIMO} caracteres`);
  if (Buffer.byteLength(password, 'utf8') > BYTES_MAXIMOS) problemas.push('La contraseña es demasiado larga');
  if (!/\p{Lu}/u.test(password)) problemas.push('Debe incluir al menos una letra mayúscula');
  if (!/\d/.test(password)) problemas.push('Debe incluir al menos un número');
  if (!/[^\p{L}\d\s]/u.test(password)) problemas.push('Debe incluir al menos un símbolo (por ejemplo ! ? # $ % & *)');

  const minusculas = password.toLowerCase();
  if (COMUNES.some((c) => minusculas.includes(c))) problemas.push('Es demasiado común: evitá palabras típicas como "password" o "geokaia"');

  const usuario = String(email).split('@')[0].toLowerCase();
  if (usuario.length >= 4 && minusculas.includes(usuario)) problemas.push('No puede contener tu correo');

  return problemas;
}

module.exports = { problemasDeContrasena, LARGO_MINIMO, BYTES_MAXIMOS };
